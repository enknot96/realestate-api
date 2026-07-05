import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";

export async function findByEmail(email: string) {
  // db.select() は常に配列を返す
  // [agent] = 返ってきた配列の先頭の1件だけをagentという変数に入れる
  const [agent] = await db.select().from(agents).where(eq(agents.email, email));
  // 該当するemailの行が見つかった場合、agentにはその1行分のオブジェクトが入る（見つからなかった場合は、空配列[]が入る）
  return agent;
}

export async function findById(id: number) {
  const [agent] = await db.select().from(agents).where(eq(agents.id, id));
  return agent;
}

export async function create(data: { name: string; email: string; passwordHash: string }) {
  // returning() = INSERTしたあとにもう一度SELECTし直すという無駄な手間を省き、1回のクエリで挿入と結果取得を取得
  const [agent] = await db.insert(agents).values(data).returning();
  return agent;
}
