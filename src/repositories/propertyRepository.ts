import { and, asc, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { properties } from "../db/schema.js";

type PropertyStatus = "draft" | "published" | "contracted" | "closed";
type PropertyType = "rent" | "sale";
type SaleKind = "land" | "new_house" | "used_house" | "used_mansion";
export type PropertySort = "newest" | "price_asc" | "price_desc";

// 普通のフィールド更新（タイトル修正など、副作用なし）→ dbをそのまま渡して呼ぶ
// contracted/closedへの遷移（内見一括キャンセルとセットで実行する必要がある）→ db.transaction()の中でtxを渡して呼ぶ
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Visibility =
  | { kind: "public" }
  | { kind: "admin" }
  | { kind: "agent"; agentId: number };

export type PropertyFilter = {
  type?: PropertyType;
  status?: PropertyStatus;
  saleKind?: SaleKind;
  minPrice?: number;
  maxPrice?: number;
  layout?: string;
  keyword?: string;
  sort?: PropertySort;
  limit: number;
  offset: number;
  visibility: Visibility;
};

// 売買物件の事実項目（数値はリクエストではnumber、DBのnumeric列には文字列で入れる）
type SaleFieldsData = {
  saleKind?: SaleKind;
  landArea?: number;
  privateRoadArea?: number;
  buildingArea?: number;
  builtYearMonth?: string;
  nearestStation?: string;
  walkMinutes?: number;
  accessNote?: string;
  floorCount?: number;
  floorNumber?: number;
  balconyArea?: number;
  managementFee?: number;
  repairReserveFee?: number;
  managementType?: string;
  latitude?: number;
  longitude?: number;
};

type NumericField =
  | "area"
  | "landArea"
  | "privateRoadArea"
  | "buildingArea"
  | "balconyArea"
  | "latitude"
  | "longitude";

const NUMERIC_FIELDS: NumericField[] = [
  "area",
  "landArea",
  "privateRoadArea",
  "buildingArea",
  "balconyArea",
  "latitude",
  "longitude",
];

// numeric列はnumberのままでは渡せないため、指定された項目だけ文字列に変換する
// null（更新で値を消す指定）はそのままnullで渡す（String(null)で"null"にしない）
function withNumericAsString<T extends Partial<Record<NumericField, number | null>>>(
  data: T,
): Omit<T, NumericField> & Partial<Record<NumericField, string | null>> {
  const row: Record<string, unknown> = { ...data };
  for (const key of NUMERIC_FIELDS) {
    const value = data[key];
    if (value !== undefined) row[key] = value === null ? null : String(value);
  }
  return row as Omit<T, NumericField> & Partial<Record<NumericField, string | null>>;
}

export type PropertyCreateData = SaleFieldsData & {
  type: PropertyType;
  title: string;
  description?: string;
  price: number;
  layout?: string;
  area?: number;
  imageUrl?: string;
  address: string;
};

// 更新では売買項目にnullを指定して値を消せる（種別の変更や、売地への変更で不要な項目を外すため）
type NullableSaleFieldsData = { [K in keyof SaleFieldsData]?: SaleFieldsData[K] | null };

export type PropertyUpdateData = NullableSaleFieldsData & {
  type?: PropertyType;
  title?: string;
  description?: string;
  price?: number;
  layout?: string;
  area?: number;
  imageUrl?: string;
  address?: string;
  status?: PropertyStatus;
};

function buildConditions(filter: PropertyFilter) {
  const conditions = [];

  if (filter.visibility.kind === "public") {
    // status = 'published'という条件で絞り込め というルールを表すオブジェクトが1つ入る
    // 実際に DB に問い合わせるのは findMany関数
    conditions.push(eq(properties.status, "published"));
  } else if (filter.visibility.kind === "agent") {
    conditions.push(
      or(eq(properties.agentId, filter.visibility.agentId), eq(properties.status, "published")),
    );
  }
  // admin: 可視性による絞り込みなし

  if (filter.type) conditions.push(eq(properties.type, filter.type));
  if (filter.status) conditions.push(eq(properties.status, filter.status));
  if (filter.saleKind) conditions.push(eq(properties.saleKind, filter.saleKind));
  if (filter.minPrice !== undefined) conditions.push(gte(properties.price, filter.minPrice));
  if (filter.maxPrice !== undefined) conditions.push(lte(properties.price, filter.maxPrice));
  if (filter.layout) conditions.push(eq(properties.layout, filter.layout));
  if (filter.keyword) {
    const pattern = `%${escapeLikePattern(filter.keyword)}%`;
    conditions.push(or(ilike(properties.title, pattern), ilike(properties.description, pattern)));
  }

  return conditions;
}

// LIKE/ILIKEのメタ文字（% _ \）をエスケープし、入力文字列そのものの部分一致として扱う
// （例: keyword「100%」が「100に任意の文字列が続く」ではなく文字通りの「100%」にマッチするように）
function escapeLikePattern(input: string) {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// ORDER BYが無いとPostgreSQLは行順を保証せず、limit/offsetのページングで重複・欠落が起き得る
// → どのsortでも最後にid昇順をタイブレーカーとして付け、順序を完全に決定的にする
function buildOrderBy(sort: PropertySort | undefined) {
  switch (sort) {
    case "newest":
      return [desc(properties.createdAt), asc(properties.id)];
    case "price_asc":
      return [asc(properties.price), asc(properties.id)];
    case "price_desc":
      return [desc(properties.price), asc(properties.id)];
    default:
      return [asc(properties.id)];
  }
}

export async function findMany(filter: PropertyFilter) {
  const conditions = buildConditions(filter);

  const rows = await db
    .select()
    .from(properties)
    .where(and(...conditions))
    .orderBy(...buildOrderBy(filter.sort))
    .limit(filter.limit)
    .offset(filter.offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(properties)
    .where(and(...conditions));

  return { rows, total };
}

export async function findById(id: number): Promise<typeof properties.$inferSelect | undefined> {
  const [property] = await db.select().from(properties).where(eq(properties.id, id));
  return property;
}

export async function create(executor: Executor, agentId: number, data: PropertyCreateData) {
  const [property] = await executor
    .insert(properties)
    .values({ ...withNumericAsString(data), agentId })
    .returning();

  return property;
}

export async function update(executor: Executor, id: number, data: PropertyUpdateData) {
  const [property] = await executor
    .update(properties)
    .set({
      ...withNumericAsString(data),
      updatedAt: new Date(),
    })
    .where(eq(properties.id, id))
    .returning();

  return property;
}
