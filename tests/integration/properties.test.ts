import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/app.js";
import { createTestAgent } from "../helpers/auth.js";
import { resetDatabase } from "../helpers/db.js";

const ORIGIN = "http://localhost:5173";

function authHeaders(token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: ORIGIN };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /properties", () => {
  it("認証済みagentは物件をdraftで作成できる", async () => {
    const agent = await createTestAgent();

    const res = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ type: "sale", title: "テスト物件", price: 5000, address: "東京都" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.status).toBe("draft");
    expect(body.agentId).toBe(agent.agentId);
  });

  it("未認証では作成できない", async () => {
    const res = await app.request("/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ type: "sale", title: "x", price: 1000, address: "東京都" }),
    });

    expect(res.status).toBe(401);
  });
});

describe("GET /properties 可視性ルール", () => {
  it("未認証はpublishedのみ見える", async () => {
    const agent = await createTestAgent();
    const createRes = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ type: "sale", title: "公開物件", price: 5000, address: "東京都" }),
    });
    const property = (await createRes.json()) as any;
    await app.request(`/properties/${property.id}`, {
      method: "PATCH",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ status: "published" }),
    });
    await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ type: "sale", title: "下書き物件", price: 5000, address: "東京都" }),
    });

    const res = await app.request("/properties");
    const body = (await res.json()) as any;

    expect(body.properties).toHaveLength(1);
    expect(body.properties[0].status).toBe("published");
  });

  it("agentは自分の全statusと他人のpublishedだけ見える", async () => {
    const agentA = await createTestAgent();
    const agentB = await createTestAgent();

    await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agentA.accessToken),
      body: JSON.stringify({ type: "sale", title: "Aのdraft", price: 5000, address: "東京都" }),
    });
    await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agentB.accessToken),
      body: JSON.stringify({ type: "sale", title: "Bのdraft", price: 5000, address: "東京都" }),
    });

    const res = await app.request("/properties", {
      headers: authHeaders(agentA.accessToken),
    });
    const body = (await res.json()) as any;

    expect(body.properties).toHaveLength(1);
    expect(body.properties[0].title).toBe("Aのdraft");
  });
});

describe("PATCH /properties/:id 状態遷移", () => {
  it("他人の物件を更新しようとすると403", async () => {
    const agentA = await createTestAgent();
    const agentB = await createTestAgent();
    const createRes = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agentA.accessToken),
      body: JSON.stringify({ type: "sale", title: "x", price: 1000, address: "東京都" }),
    });
    const property = (await createRes.json()) as any;

    const res = await app.request(`/properties/${property.id}`, {
      method: "PATCH",
      headers: authHeaders(agentB.accessToken),
      body: JSON.stringify({ title: "乗っ取り" }),
    });

    expect(res.status).toBe(403);
  });

  it("draft→contractedのような許可されていない遷移は409", async () => {
    const agent = await createTestAgent();
    const createRes = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ type: "sale", title: "x", price: 1000, address: "東京都" }),
    });
    const property = (await createRes.json()) as any;

    const res = await app.request(`/properties/${property.id}`, {
      method: "PATCH",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ status: "contracted" }),
    });

    expect(res.status).toBe(409);
  });
});

describe("DELETE /properties/:id", () => {
  it("draftはclosedになる", async () => {
    const agent = await createTestAgent();
    const createRes = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ type: "sale", title: "x", price: 1000, address: "東京都" }),
    });
    const property = (await createRes.json()) as any;

    const res = await app.request(`/properties/${property.id}`, {
      method: "DELETE",
      headers: authHeaders(agent.accessToken),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("closed");
  });

  it("すでにclosedの物件へのDELETEは409", async () => {
    const agent = await createTestAgent();
    const createRes = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ type: "sale", title: "x", price: 1000, address: "東京都" }),
    });
    const property = (await createRes.json()) as any;
    await app.request(`/properties/${property.id}`, {
      method: "DELETE",
      headers: authHeaders(agent.accessToken),
    });

    const res = await app.request(`/properties/${property.id}`, {
      method: "DELETE",
      headers: authHeaders(agent.accessToken),
    });

    expect(res.status).toBe(409);
  });
});
