import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { refreshTokens } from "../db/schema.js";

export async function create(data: { agentId: number; tokenHash: string; expiresAt: Date }) {
  const [refreshToken] = await db.insert(refreshTokens).values(data).returning();
  return refreshToken;
}

export async function findByTokenHash(tokenHash: string) {
  const [refreshToken] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash));
  return refreshToken;
}

export async function revoke(id: number) {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, id));
}
