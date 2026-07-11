import { sql } from "drizzle-orm";
import { db } from "../../src/db/index.js";

export async function resetDatabase() {
  await db.execute(sql`
    TRUNCATE TABLE viewings, inquiries, customers, properties, refresh_tokens, agents
    RESTART IDENTITY CASCADE
  `);
}
