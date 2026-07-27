import { and, count, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { properties } from "../db/schema.js";

type PropertyStatus = "draft" | "published" | "contracted" | "closed";
type PropertyType = "rent" | "sale";

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
  minPrice?: number;
  maxPrice?: number;
  layout?: string;
  keyword?: string;
  limit: number;
  offset: number;
  visibility: Visibility;
};

export type PropertyCreateData = {
  type: PropertyType;
  title: string;
  description?: string;
  price: number;
  layout?: string;
  area?: number;
  imageUrl?: string;
  address: string;
};

export type PropertyUpdateData = {
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

export async function findMany(filter: PropertyFilter) {
  const conditions = buildConditions(filter);

  const rows = await db
    .select()
    .from(properties)
    .where(and(...conditions))
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
    .values({
      agentId,
      type: data.type,
      title: data.title,
      description: data.description,
      price: data.price,
      layout: data.layout,
      area: data.area !== undefined ? String(data.area) : undefined,
      imageUrl: data.imageUrl,
      address: data.address,
    })
    .returning();

  return property;
}

export async function update(executor: Executor, id: number, data: PropertyUpdateData) {
  const [property] = await executor
    .update(properties)
    .set({
      ...data,
      area: data.area !== undefined ? String(data.area) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(properties.id, id))
    .returning();

  return property;
}
