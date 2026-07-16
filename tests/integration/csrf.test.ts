import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/app.js";
import { createTestAgent } from "../helpers/auth.js";
import { resetDatabase } from "../helpers/db.js";

// Origin検証（CSRF対策）はCookieが自動送信される/auth/refresh・/auth/logoutのみに適用される。
// Bearer認証・公開POSTはOriginヘッダー無し（サーバー間通信やcurl）でも通ることを検証する
beforeEach(async () => {
  await resetDatabase();
});

describe("CSRF/Origin検証の適用範囲", () => {
  it("POST /auth/refresh はOriginヘッダー無しだと403", async () => {
    const res = await app.request("/auth/refresh", { method: "POST" });

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("FORBIDDEN_ORIGIN");
  });

  it("POST /auth/logout はOriginヘッダー無しだと403", async () => {
    const res = await app.request("/auth/logout", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("POST /auth/refresh はOriginが許可リストと一致すれば通る（Cookie無しなので401になる）", async () => {
    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { Origin: "http://localhost:5173" },
    });

    expect(res.status).toBe(401);
  });

  it("POST /auth/login はOriginヘッダー無しでも通る（サーバー間通信を想定）", async () => {
    const email = "csrf-test@example.com";
    const password = "Password123!";
    await createTestAgent({ email, password });

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    expect(res.status).toBe(200);
  });

  it("POST /properties はOriginヘッダー無しでも通る（Bearer認証のみ）", async () => {
    const agent = await createTestAgent();

    const res = await app.request("/properties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agent.accessToken}`,
      },
      body: JSON.stringify({ type: "rent", title: "x", price: 80000, address: "東京都" }),
    });

    expect(res.status).toBe(201);
  });
});
