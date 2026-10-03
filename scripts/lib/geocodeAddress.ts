// 住所の正規化と、位置参照情報（街区レベル）との突き合わせ用キーの生成（DB・ファイルに触れない純粋関数）
//
// シードの住所は「東京都杉並区阿佐谷南3-12-8」（丁目-番-号）の形式。
// 位置参照情報の「大字・町丁目名」は「阿佐谷南三丁目」（丁目は漢数字）、「街区符号・地番」は「12」。
// 号（末尾の-8）は街区レベルには無いので使わない。

const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const KANJI_DIGIT_VALUES: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

// 1〜99を漢数字にする（丁目は通常2桁まで）。範囲外はそのまま算用数字の文字列
export function toKanjiNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens === 0 ? "" : tens === 1 ? "十" : `${KANJI_DIGITS[tens]}十`}${KANJI_DIGITS[ones]}`;
}

// 「十二」「二十一」のような漢数字（1〜99）を数値にする。解釈できなければnull
function fromKanjiNumber(text: string): number | null {
  if (!/^[一二三四五六七八九十]+$/.test(text)) return null;
  const [tensPart, onesPart] = text.includes("十") ? text.split("十") : ["", text];
  const tens = text.includes("十") ? (tensPart === "" ? 1 : KANJI_DIGIT_VALUES[tensPart]) : 0;
  const ones = onesPart === "" ? 0 : KANJI_DIGIT_VALUES[onesPart];
  if (tens === undefined || ones === undefined) return null;
  return tens * 10 + ones;
}

// 全角/半角・ハイフン類・「ヶ/ケ」「ノ/の」の揺れを吸収する
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC") // 全角数字・英字→半角、半角カナ→全角など
    .replace(/[\u2010-\u2015\u2212\uFF0D]/g, "-") // ハイフン類（長音「ー」は対象外）
    .replace(/[ヶヵケ]/g, "ケ")
    .replace(/[ノの]/g, "の")
    .replace(/\s+/g, "");
}

// 町丁目名を比較用にそろえる。「N丁目」は算用数字・漢数字どちらで書かれていても漢数字に統一する
export function normalizeTownName(input: string): string {
  const text = normalizeText(input);
  return text.replace(/([0-9]+|[一二三四五六七八九十]+)丁目/g, (whole, num: string) => {
    const n = /^[0-9]+$/.test(num) ? Number(num) : fromKanjiNumber(num);
    return n === null ? whole : `${toKanjiNumber(n)}丁目`;
  });
}

export type ParsedAddress = {
  // 先頭から最初の数字の手前まで（都道府県+市区町村+町名）。例: 「東京都杉並区阿佐谷南」
  text: string;
  // 末尾の数字列（丁目-番-号 または 番地-枝番）
  numbers: number[];
};

// 「東京都杉並区阿佐谷南3-12-8」→ { text: "東京都杉並区阿佐谷南", numbers: [3, 12, 8] }
// 数字で始まる部分が無い、または数字以外が混ざる住所はnull
export function parseAddress(address: string): ParsedAddress | null {
  const normalized = normalizeText(address);
  const match = /^(\D+?)(\d+(?:-\d+)*)$/.exec(normalized);
  if (!match) return null;
  return { text: match[1], numbers: match[2].split("-").map(Number) };
}

// 「大阪市北区」→「北区」。政令指定都市の区の書き方の違い（市区町村名が「北区」だけの場合）に備える
export function stripDesignatedCity(text: string): string {
  return text.replace(/^(北海道|東京都|京都府|大阪府|[^市区町村]{2,3}県)([^市区町村]+市)([^市区町村]+区)/, "$1$3");
}

export type MatchKey = {
  // 突き合わせ用キー: 「正規化した 都道府県+市区町村+町丁目」と街区符号を "|" でつないだもの
  key: string;
  // 「市区町村名が区だけ」の書き方に対応した予備キーか
  wardOnly: boolean;
};

// 住所から、突き合わせに使うキー候補を優先順に返す
//  A: 丁目あり（丁目=1番目の数字、街区符号=2番目の数字）
//  B: 丁目なし（街区符号=「1番目-2番目」→「1番目」）
export function candidateKeys(address: string): MatchKey[] {
  const parsed = parseAddress(address);
  if (!parsed) return [];

  const { text, numbers } = parsed;
  const townVariants: { town: string; wardOnly: boolean }[] = [{ town: text, wardOnly: false }];
  const stripped = stripDesignatedCity(text);
  if (stripped !== text) townVariants.push({ town: stripped, wardOnly: true });

  const keys: MatchKey[] = [];
  for (const { town, wardOnly } of townVariants) {
    if (numbers.length >= 2) {
      keys.push({
        key: `${normalizeTownName(`${town}${numbers[0]}丁目`)}|${numbers[1]}`,
        wardOnly,
      });
    }
    if (numbers.length >= 2) {
      keys.push({ key: `${normalizeTownName(town)}|${numbers[0]}-${numbers[1]}`, wardOnly });
    }
    keys.push({ key: `${normalizeTownName(town)}|${numbers[0]}`, wardOnly });
  }
  return keys;
}

// 位置参照情報CSVの1行から、突き合わせ用キーを作る
export function csvRowKey(row: {
  prefecture: string;
  city: string;
  town: string;
  banchi: string;
}): string {
  const town = normalizeTownName(`${row.prefecture}${row.city}${row.town}`);
  return `${town}|${normalizeText(row.banchi)}`;
}

// CSVの市区町村名が区だけ（例:「北区」）の行向けに、市を省いた予備キーを作る。
// 「大阪市北区」のように市込みの行では、通常のキーと同じ文字列になる
export function csvRowWardOnlyKey(row: {
  prefecture: string;
  city: string;
  town: string;
  banchi: string;
}): string {
  const town = normalizeTownName(
    stripDesignatedCity(`${normalizeText(row.prefecture)}${normalizeText(row.city)}`) +
      normalizeText(row.town),
  );
  return `${town}|${normalizeText(row.banchi)}`;
}
