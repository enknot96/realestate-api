import { eq } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { agents } from "../../src/db/schema.js";
import { app } from "../../src/app.js";

const ORIGIN = "http://localhost:5173";

export type TestAgent = {
  agentId: number;
  accessToken: string;
};

export async function createTestAgent(options?: {
  role?: "agent" | "admin";
  email?: string;
  name?: string;
  password?: string;
}): Promise<TestAgent> {
  const email = options?.email ?? `agent-${Math.random().toString(36).slice(2)}@example.com`;
  const name = options?.name ?? "テストagent";
  const password = options?.password ?? "Password123!";

  const registerRes = await app.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ name, email, password }),
  });
  const agent = (await registerRes.json()) as { id: number };

  if (options?.role === "admin") {
    await db.update(agents).set({ role: "admin" }).where(eq(agents.id, agent.id));
  }

  // roleがJWTのペイロードに含まれるため、admin昇格後は改めてログインし直してトークンを発行する
  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  const { accessToken } = (await loginRes.json()) as { accessToken: string };

  return { agentId: agent.id, accessToken };
}
