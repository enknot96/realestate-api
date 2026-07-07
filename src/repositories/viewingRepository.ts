import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { viewings } from "../db/schema.js";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function cancelScheduledByPropertyId(executor: Executor, propertyId: number) {
  return executor
    .update(viewings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(viewings.propertyId, propertyId), eq(viewings.status, "scheduled")));
}
