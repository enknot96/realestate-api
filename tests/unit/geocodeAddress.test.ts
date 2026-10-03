import { describe, it, expect } from "vitest";
import {
  candidateKeys,
  csvRowKey,
  csvRowWardOnlyKey,
  normalizeTownName,
  parseAddress,
  stripDesignatedCity,
  toKanjiNumber,
} from "../../scripts/lib/geocodeAddress.js";

describe("toKanjiNumber", () => {
  it.each([
    [1, "一"],
    [9, "九"],
    [10, "十"],
    [11, "十一"],
    [20, "二十"],
    [21, "二十一"],
    [99, "九十九"],
  ])("%i → %s", (n, expected) => {
    expect(toKanjiNumber(n)).toBe(expected);
  });
});

describe("parseAddress", () => {
  it("丁目-番-号を分解する", () => {
    expect(parseAddress("東京都杉並区阿佐谷南3-12-8")).toEqual({
      text: "東京都杉並区阿佐谷南",
      numbers: [3, 12, 8],
    });
  });

  it("全角数字・全角ハイフンも半角に揃える", () => {
    expect(parseAddress("大阪府大阪市北区中崎西２－５－１４")?.numbers).toEqual([2, 5, 14]);
  });

  it("丁目の無い町名（番地-枝番）", () => {
    expect(parseAddress("東京都日野市高幡1005-3")).toEqual({
      text: "東京都日野市高幡",
      numbers: [1005, 3],
    });
  });

  it("数字で終わらない住所はnull", () => {
    expect(parseAddress("東京都杉並区阿佐谷南")).toBeNull();
  });
});

describe("normalizeTownName", () => {
  it("算用数字の丁目を漢数字にする", () => {
    expect(normalizeTownName("阿佐谷南3丁目")).toBe("阿佐谷南三丁目");
    expect(normalizeTownName("西葛西６丁目")).toBe("西葛西六丁目");
    expect(normalizeTownName("中葛西十二丁目")).toBe("中葛西十二丁目");
  });

  it("「ヶ」「ケ」の揺れを吸収する", () => {
    expect(normalizeTownName("鳩ヶ谷")).toBe(normalizeTownName("鳩ケ谷"));
    expect(normalizeTownName("千駄ヶ谷3丁目")).toBe(normalizeTownName("千駄ケ谷三丁目"));
  });

  it("「ノ」「の」の揺れを吸収する", () => {
    expect(normalizeTownName("西竹ノ塚1丁目")).toBe(normalizeTownName("西竹の塚一丁目"));
  });

  it("丁目の無い町名はそのまま", () => {
    expect(normalizeTownName("高幡")).toBe("高幡");
  });
});

describe("candidateKeys と csvRowKey の突き合わせ", () => {
  const row = {
    prefecture: "東京都",
    city: "杉並区",
    town: "阿佐谷南三丁目",
    banchi: "12",
  };

  it("丁目あり: 丁目は漢数字に直して街区符号と突き合わさる（号は使わない）", () => {
    const keys = candidateKeys("東京都杉並区阿佐谷南3-12-8").map((k) => k.key);
    expect(keys).toContain(csvRowKey(row));
  });

  it("丁目なし: 番地で突き合わさる", () => {
    const keys = candidateKeys("東京都日野市高幡1005-3").map((k) => k.key);
    expect(keys).toContain(
      csvRowKey({ prefecture: "東京都", city: "日野市", town: "高幡", banchi: "1005" }),
    );
  });

  it("全角数字のCSV街区符号も一致する", () => {
    const keys = candidateKeys("東京都杉並区阿佐谷南3-12-8").map((k) => k.key);
    expect(keys).toContain(csvRowKey({ ...row, banchi: "１２" }));
  });

  it("政令指定都市: 市区町村名が「大阪市北区」の形でも「北区」だけの形でも一致する", () => {
    const keys = candidateKeys("大阪府大阪市北区中崎西2-5-14");
    const withCity = csvRowKey({
      prefecture: "大阪府",
      city: "大阪市北区",
      town: "中崎西二丁目",
      banchi: "5",
    });
    const wardOnly = csvRowWardOnlyKey({
      prefecture: "大阪府",
      city: "北区",
      town: "中崎西二丁目",
      banchi: "5",
    });
    expect(keys.filter((k) => !k.wardOnly).map((k) => k.key)).toContain(withCity);
    expect(keys.filter((k) => k.wardOnly).map((k) => k.key)).toContain(wardOnly);
  });

  it("丁目が違えば一致しない（近くの街区で推測しない）", () => {
    const keys = candidateKeys("東京都杉並区阿佐谷南4-12-8").map((k) => k.key);
    expect(keys).not.toContain(csvRowKey(row));
  });
});

describe("stripDesignatedCity", () => {
  it("市+区から市を省く", () => {
    expect(stripDesignatedCity("大阪府大阪市北区中崎西")).toBe("大阪府北区中崎西");
    expect(stripDesignatedCity("兵庫県神戸市灘区岸地通")).toBe("兵庫県灘区岸地通");
  });

  it("京都府京都市でも府名を壊さない", () => {
    expect(stripDesignatedCity("京都府京都市伏見区深草")).toBe("京都府伏見区深草");
  });

  it("区だけの市区町村や、区を含まない市は変えない", () => {
    expect(stripDesignatedCity("東京都杉並区阿佐谷南")).toBe("東京都杉並区阿佐谷南");
    expect(stripDesignatedCity("兵庫県西宮市甲子園口")).toBe("兵庫県西宮市甲子園口");
  });
});
