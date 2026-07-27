/**
 * 物件画像アップロードスクリプト
 *
 * 実行方法:
 *   images/ フォルダに "{物件ID}.jpg" (または .png/.webp) を置いてから:
 *   DATABASE_URL=<接続文字列> BLOB_READ_WRITE_TOKEN=<トークン> pnpm upload-images
 *
 * - 画像は物件1件につき1枚。ファイル名の数字部分を物件IDとして扱う
 * - 既にアップロード済みの画像を再アップロードしても上書きされる（allowOverwrite）
 * - 一部の画像だけが揃っている状態でも実行可能（フォルダにあるファイルだけを処理）
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { properties } from "../src/db/schema.js";

const IMAGES_DIR = process.env.IMAGES_DIR ?? "images";
const FILENAME_PATTERN = /^(\d+)\.(jpg|jpeg|png|webp)$/i;

async function main() {
  const entries = await readdir(IMAGES_DIR);
  const files = entries.filter((f) => FILENAME_PATTERN.test(f));

  if (files.length === 0) {
    console.log(`${IMAGES_DIR}/ に対象ファイル（例: 1.jpg）が見つかりませんでした`);
    return;
  }
  console.log(`${files.length}件の画像ファイルを検出しました`);

  for (const file of files) {
    const match = file.match(FILENAME_PATTERN)!;
    const propertyId = Number(match[1]);

    const buffer = await readFile(path.join(IMAGES_DIR, file));
    const blob = await put(`properties/${file}`, buffer, {
      access: "public",
      allowOverwrite: true,
    });

    const [updated] = await db
      .update(properties)
      .set({ imageUrl: blob.url })
      .where(eq(properties.id, propertyId))
      .returning({ id: properties.id, title: properties.title });

    if (!updated) {
      console.warn(`物件ID ${propertyId} が見つかりません（ファイル: ${file}）`);
      continue;
    }
    console.log(`property ${updated.id}「${updated.title}」→ ${blob.url}`);
  }
}

main()
  .then(async () => {
    await db.$client.end();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$client.end();
    process.exit(1);
  });
