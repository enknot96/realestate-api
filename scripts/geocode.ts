/**
 * シード物件の住所 → 緯度経度 変換スクリプト（位置参照情報・街区レベル）
 *
 * 実行方法:
 *   pnpm geocode --dir ~/Downloads/isj
 *   pnpm geocode --dir ~/Downloads/isj --debug   # 市区町村名の書き方・突き合わせできなかった住所の近い候補を表示
 *
 * - 入力: 位置参照情報ダウンロードサービス（国土交通省）の街区レベルCSV（Shift_JIS）。
 *   --dir 配下の *.csv を再帰的に全て読む
 * - 出力: scripts/data/coordinates.json（キー=シードに書いた住所の文字列そのまま）
 * - 突き合わせできなかった住所には座標を入れない（推測で埋めない）。一覧を出すだけで終了コードは0
 * - DBには一切触れない
 *
 * 出典: 位置参照情報ダウンロードサービス（国土交通省） https://nlftp.mlit.go.jp/isj/
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { candidateKeys, csvRowKey, csvRowWardOnlyKey } from "./lib/geocodeAddress.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(SCRIPT_DIR, "seed.ts");
const OUTPUT_PATH = path.join(SCRIPT_DIR, "data", "coordinates.json");

type Coordinate = { latitude: number; longitude: number };
type CsvCandidate = Coordinate & { representative: boolean; residential: boolean };

// pnpm経由だと先頭に区切りの "--" が入ることがあるため取り除く
const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    dir: { type: "string" },
    debug: { type: "boolean", default: false },
  },
});

// seed.tsを実行せず（DB接続・パスワード要求が走るため）、ソースから address: "..." を抜き出す
async function readSeedAddresses(): Promise<string[]> {
  const source = await readFile(SEED_PATH, "utf8");
  const addresses = [...source.matchAll(/^ {4}address: "([^"]+)",$/gm)].map((m) => m[1]);
  return [...new Set(addresses)];
}

async function findCsvFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await findCsvFiles(full)));
    else if (/\.csv$/i.test(entry.name)) files.push(full);
  }
  return files.sort();
}

// ダブルクォート付きCSVの1行を分解する（位置参照情報CSVは全項目が "..." で囲まれている）
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(current);
      current = "";
    } else current += ch;
  }
  fields.push(current);
  return fields;
}

function pickBest(candidates: CsvCandidate[]): Coordinate {
  const best = [...candidates].sort(
    (a, b) =>
      Number(b.representative) - Number(a.representative) ||
      Number(b.residential) - Number(a.residential),
  )[0];
  return { latitude: best.latitude, longitude: best.longitude };
}

async function main() {
  if (!args.dir) {
    console.error("使い方: pnpm geocode --dir <位置参照情報CSVを置いたディレクトリ> [--debug]");
    process.exit(1);
  }

  const addresses = await readSeedAddresses();
  console.log(`シードの住所: ${addresses.length}件（重複除く）`);

  // 住所ごとのキー候補。CSVを読みながら、必要なキーに一致した行だけを覚える（メモリ節約）
  const keysByAddress = new Map(addresses.map((a) => [a, candidateKeys(a)]));
  const wantedExact = new Set<string>();
  const wantedWardOnly = new Set<string>();
  for (const keys of keysByAddress.values()) {
    for (const { key, wardOnly } of keys) (wardOnly ? wantedWardOnly : wantedExact).add(key);
  }

  const files = await findCsvFiles(args.dir);
  if (files.length === 0) {
    console.error(`${args.dir} 配下にCSVが見つかりませんでした`);
    process.exit(1);
  }
  console.log(`CSV: ${files.length}ファイル`);

  const decoder = new TextDecoder("shift_jis");
  const exact = new Map<string, CsvCandidate[]>();
  // 市区町村名が区だけの書き方に備えた予備索引。別の市の同名の区が混ざる場合は曖昧として使わない
  const wardOnly = new Map<string, CsvCandidate[]>();
  const wardOnlyCities = new Map<string, Set<string>>();
  const citiesSeen = new Map<string, Set<string>>(); // デバッグ用: 都道府県 → 市区町村名

  for (const file of files) {
    const text = decoder.decode(await readFile(file));
    const lines = text.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const f = parseCsvLine(lines[i]);
      if (f.length < 12) continue;
      const row = { prefecture: f[0], city: f[1], town: f[2], banchi: f[4] };
      const latitude = Number(f[8]);
      const longitude = Number(f[9]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      if (args.debug) {
        if (!citiesSeen.has(f[0])) citiesSeen.set(f[0], new Set());
        citiesSeen.get(f[0])!.add(f[1]);
      }

      const candidate: CsvCandidate = {
        latitude,
        longitude,
        representative: f[11] === "1",
        residential: f[10] === "1",
      };
      const key = csvRowKey(row);
      if (wantedExact.has(key)) exact.set(key, [...(exact.get(key) ?? []), candidate]);

      const wardKey = csvRowWardOnlyKey(row);
      if (wantedWardOnly.has(wardKey)) {
        wardOnly.set(wardKey, [...(wardOnly.get(wardKey) ?? []), candidate]);
        wardOnlyCities.set(wardKey, (wardOnlyCities.get(wardKey) ?? new Set()).add(f[1]));
      }
    }
  }

  const result: Record<string, Coordinate> = {};
  const failed: string[] = [];
  for (const address of addresses) {
    let found: Coordinate | undefined;
    for (const { key, wardOnly: isWardOnly } of keysByAddress.get(address) ?? []) {
      if (!isWardOnly) {
        const hit = exact.get(key);
        if (hit) {
          found = pickBest(hit);
          break;
        }
      } else {
        const hit = wardOnly.get(key);
        // 市区町村名が複数あるのは、別の市の同名の区が混ざっている曖昧なケース
        if (hit && (wardOnlyCities.get(key)?.size ?? 0) === 1) {
          found = pickBest(hit);
          break;
        }
      }
    }
    if (found) {
      result[address] = {
        latitude: Number(found.latitude.toFixed(6)),
        longitude: Number(found.longitude.toFixed(6)),
      };
    } else {
      failed.push(address);
    }
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`\n成功: ${Object.keys(result).length}件 / 失敗: ${failed.length}件`);
  console.log(`出力: ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  if (failed.length > 0) {
    console.log("\n突き合わせできなかった住所（座標は入れていません）:");
    for (const address of failed) console.log(`  - ${address}`);
  }

  if (args.debug) {
    console.log("\n[debug] CSVの市区町村名（都道府県ごと）:");
    for (const [prefecture, cities] of citiesSeen) {
      console.log(`  ${prefecture}: ${[...cities].slice(0, 40).join("、")}${cities.size > 40 ? " …" : ""}`);
    }
    console.log("\n[debug] 失敗した住所の突き合わせキー候補:");
    for (const address of failed) {
      console.log(`  ${address}`);
      for (const { key } of keysByAddress.get(address) ?? []) console.log(`    ${key}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
