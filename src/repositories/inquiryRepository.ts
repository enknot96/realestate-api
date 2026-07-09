import { count, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { inquiries } from "../db/schema.js";

type InquiryStatus = "new" | "in_progress" | "done";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type InquiryCreateData = {
  propertyId: number;
  customerId: number;
  message: string;
};

export async function create(executor: Executor, data: InquiryCreateData) {
  const [inquiry] = await executor.insert(inquiries).values(data).returning();
  return inquiry;
}

export async function findById(id: number) {
  const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, id));
  return inquiry;
}

export async function findByPropertyId(
  propertyId: number,
  pagination: { limit: number; offset: number },
) {
  const rows = await db
    .select()
    .from(inquiries)
    .where(eq(inquiries.propertyId, propertyId))
    .limit(pagination.limit)
    .offset(pagination.offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(inquiries)
    .where(eq(inquiries.propertyId, propertyId));

  return { rows, total };
}

export async function updateStatus(executor: Executor, id: number, status: InquiryStatus) {
  const [inquiry] = await executor
    .update(inquiries)
    .set({ status, updatedAt: new Date() })
    .where(eq(inquiries.id, id))
    .returning();

  return inquiry;
}
