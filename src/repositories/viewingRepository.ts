import { and, count, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { properties, viewings } from "../db/schema.js";

type ViewingStatus = "scheduled" | "completed" | "cancelled";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ViewingVisibility = { kind: "admin" } | { kind: "agent"; agentId: number };

export type ViewingFilter = {
  status?: ViewingStatus;
  propertyId?: number;
  scheduledAtFrom?: Date;
  scheduledAtTo?: Date;
  limit: number;
  offset: number;
  visibility: ViewingVisibility;
};

export type ViewingCreateData = {
  inquiryId: number;
  propertyId: number;
  scheduledAt: Date;
};

function buildConditions(filter: ViewingFilter) {
  const conditions = [];

  if (filter.visibility.kind === "agent") {
    conditions.push(
      inArray(
        viewings.propertyId,
        db
          .select({ id: properties.id })
          .from(properties)
          .where(eq(properties.agentId, filter.visibility.agentId)),
      ),
    );
  }
  // admin: 絞り込みなし

  if (filter.status) conditions.push(eq(viewings.status, filter.status));
  if (filter.propertyId) conditions.push(eq(viewings.propertyId, filter.propertyId));
  if (filter.scheduledAtFrom) conditions.push(gte(viewings.scheduledAt, filter.scheduledAtFrom));
  if (filter.scheduledAtTo) conditions.push(lte(viewings.scheduledAt, filter.scheduledAtTo));

  return conditions;
}

export async function findMany(filter: ViewingFilter) {
  const conditions = buildConditions(filter);

  const rows = await db
    .select()
    .from(viewings)
    .where(and(...conditions))
    .limit(filter.limit)
    .offset(filter.offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(viewings)
    .where(and(...conditions));

  return { rows, total };
}

export async function findById(id: number) {
  const [viewing] = await db.select().from(viewings).where(eq(viewings.id, id));
  return viewing;
}

export async function create(executor: Executor, data: ViewingCreateData) {
  const [viewing] = await executor.insert(viewings).values(data).returning();
  return viewing;
}

export async function updateStatus(executor: Executor, id: number, status: ViewingStatus) {
  const [viewing] = await executor
    .update(viewings)
    .set({ status, updatedAt: new Date() })
    .where(eq(viewings.id, id))
    .returning();

  return viewing;
}

export async function cancelScheduledByPropertyId(executor: Executor, propertyId: number) {
  return executor
    .update(viewings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(viewings.propertyId, propertyId), eq(viewings.status, "scheduled")));
}
