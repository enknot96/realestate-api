import { and, count, eq, gte, lte, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { properties } from "../db/schema.js";

type PropertyStatus = "draft" | "published" | "contracted" | "closed";
type PropertyType = "rent" | "sale";

export type Visibility =
  | { kind: "public" }
  | { kind: "admin" }
  | { kind: "agent"; agentId: number };

export type PropertyFilter = {
  type?: PropertyType;
  status?: PropertyStatus;
  minPrice?: number;
  maxPrice?: number;
  limit: number;
  offset: number;
  visibility: Visibility;
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

  return conditions;
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

export async function findById(id: number) {
  const [property] = await db.select().from(properties).where(eq(properties.id, id));
  return property;
}
