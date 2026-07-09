import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers } from "../db/schema.js";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CustomerUpsertData = {
  name: string;
  email: string;
  phone?: string;
};

export async function upsertByEmail(executor: Executor, data: CustomerUpsertData) {
  const [existing] = await executor
    .select()
    .from(customers)
    .where(eq(customers.email, data.email));

  if (existing && existing.name !== data.name) {
    console.warn(
      `[customerRepository] email=${data.email} の顧客名が変更されました: "${existing.name}" → "${data.name}"（同一メールアドレスを別人が使用している可能性があります）`,
    );
  }

  const [customer] = await executor
    .insert(customers)
    .values({ name: data.name, email: data.email, phone: data.phone })
    .onConflictDoUpdate({
      target: customers.email,
      set: { name: data.name, phone: data.phone, updatedAt: new Date() },
    })
    .returning();

  return customer;
}
