// 物件項目どうしの矛盾チェック（DBに触れない純粋関数）
// 種別ごとの「必須」は強制しない（既存の形式での作成を壊さないため、また項目が揃わないまま下書きとして登録し後から埋める使い方を想定しているため）。
// ここでは「あり得ない組み合わせ」だけを検出する。

export type ConsistencyTarget = {
  type?: "rent" | "sale" | null;
  saleKind?: "land" | "new_house" | "used_house" | "used_mansion" | null;
  buildingArea?: unknown;
  builtYearMonth?: unknown;
  floorCount?: unknown;
  floorNumber?: unknown;
  balconyArea?: unknown;
  managementFee?: unknown;
  repairReserveFee?: unknown;
  managementType?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

// 売地が持ってはいけない項目（建物・マンション用）と、エラーメッセージ用の日本語名
const LAND_FORBIDDEN_FIELDS: [keyof ConsistencyTarget, string][] = [
  ["buildingArea", "建物面積"],
  ["builtYearMonth", "建築年月"],
  ["floorCount", "階数"],
  ["floorNumber", "所在階"],
  ["balconyArea", "バルコニー面積"],
  ["managementFee", "管理費"],
  ["repairReserveFee", "修繕積立金"],
  ["managementType", "管理形態"],
];

const has = (value: unknown) => value !== undefined && value !== null;

// 矛盾があれば日本語メッセージの配列を返す（空配列なら矛盾なし）
export function findPropertyInconsistencies(target: ConsistencyTarget): string[] {
  const problems: string[] = [];

  if (has(target.saleKind) && target.type !== "sale") {
    problems.push("売買の種別（saleKind）は、type が sale の物件にだけ指定できます");
  }

  if (target.saleKind === "land") {
    const present = LAND_FORBIDDEN_FIELDS.filter(([key]) => has(target[key])).map(
      ([, label]) => label,
    );
    if (present.length > 0) {
      problems.push(`売地には指定できない項目があります: ${present.join("、")}`);
    }
  }

  if (has(target.latitude) !== has(target.longitude)) {
    problems.push("緯度（latitude）と経度（longitude）は両方指定してください");
  }

  return problems;
}
