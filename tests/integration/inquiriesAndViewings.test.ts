import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/app.js";
import { createTestAgent } from "../helpers/auth.js";
import { resetDatabase } from "../helpers/db.js";

const ORIGIN = "http://localhost:5173";
let ipCounter = 0;

function nextIp() {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function authHeaders(token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: ORIGIN };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function publicHeaders() {
  return {
    "Content-Type": "application/json",
    Origin: ORIGIN,
    "X-Forwarded-For": nextIp(),
  };
}

async function createPublishedProperty(accessToken: string) {
  const createRes = await app.request("/properties", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ type: "sale", title: "テスト物件", price: 5000, address: "東京都" }),
  });
  const property = (await createRes.json()) as any;
  await app.request(`/properties/${property.id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ status: "published" }),
  });
  return property;
}

beforeEach(async () => {
  // ipCounterはリセットしない: レート制限ミドルウェアのMapはテストをまたいで
  // 保持され続けるため、IPを使い回すと後続テストが誤って429になってしまう
  await resetDatabase();
});

describe("POST /properties/:id/inquiries", () => {
  it("公開物件への問い合わせは201、customerがemail基準でupsertされる", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.accessToken);

    const res1 = await app.request(`/properties/${property.id}/inquiries`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({ name: "顧客1", email: "customer@example.com", message: "内見希望" }),
    });
    expect(res1.status).toBe(201);
    const inquiry1 = (await res1.json()) as any;

    const res2 = await app.request(`/properties/${property.id}/inquiries`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({
        name: "顧客1改名",
        email: "customer@example.com",
        message: "再度内見希望",
      }),
    });
    const inquiry2 = (await res2.json()) as any;

    expect(inquiry2.customerId).toBe(inquiry1.customerId);
  });

  it("非公開物件への問い合わせは404", async () => {
    const agent = await createTestAgent();
    const createRes = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ type: "sale", title: "draft物件", price: 5000, address: "東京都" }),
    });
    const property = (await createRes.json()) as any;

    const res = await app.request(`/properties/${property.id}/inquiries`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({ name: "顧客", email: "x@example.com", message: "希望" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("GET /properties/:id/inquiries", () => {
  it("他人の物件の問い合わせ一覧は403", async () => {
    const agentA = await createTestAgent();
    const agentB = await createTestAgent();
    const property = await createPublishedProperty(agentA.accessToken);

    const res = await app.request(`/properties/${property.id}/inquiries`, {
      headers: authHeaders(agentB.accessToken),
    });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /inquiries/:id", () => {
  it("done→newのような許可されていない遷移は409", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.accessToken);
    const inquiryRes = await app.request(`/properties/${property.id}/inquiries`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({ name: "顧客", email: "a@example.com", message: "希望" }),
    });
    const inquiry = (await inquiryRes.json()) as any;
    await app.request(`/inquiries/${inquiry.id}`, {
      method: "PATCH",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ status: "done" }),
    });

    const res = await app.request(`/inquiries/${inquiry.id}`, {
      method: "PATCH",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ status: "new" }),
    });

    expect(res.status).toBe(409);
  });
});

describe("POST /inquiries/:id/viewings", () => {
  it("過去日時は422", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.accessToken);
    const inquiryRes = await app.request(`/properties/${property.id}/inquiries`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({ name: "顧客", email: "a@example.com", message: "希望" }),
    });
    const inquiry = (await inquiryRes.json()) as any;

    const res = await app.request(`/inquiries/${inquiry.id}/viewings`, {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ scheduledAt: "2020-01-01T00:00:00Z" }),
    });

    expect(res.status).toBe(422);
  });

  it("正常系: viewing作成後、inquiryのstatusがin_progressになる", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.accessToken);
    const inquiryRes = await app.request(`/properties/${property.id}/inquiries`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({ name: "顧客", email: "a@example.com", message: "希望" }),
    });
    const inquiry = (await inquiryRes.json()) as any;

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const viewingRes = await app.request(`/inquiries/${inquiry.id}/viewings`, {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ scheduledAt: future }),
    });
    expect(viewingRes.status).toBe(201);

    const listRes = await app.request(`/properties/${property.id}/inquiries`, {
      headers: authHeaders(agent.accessToken),
    });
    const list = (await listRes.json()) as any;
    const updated = list.inquiries.find((i: any) => i.id === inquiry.id);

    expect(updated.status).toBe("in_progress");
  });
});

describe("GET /viewings", () => {
  it("agentは自分の物件の内見だけ見える", async () => {
    const agentA = await createTestAgent();
    const agentB = await createTestAgent();
    const propertyA = await createPublishedProperty(agentA.accessToken);
    await createPublishedProperty(agentB.accessToken);

    const inquiryRes = await app.request(`/properties/${propertyA.id}/inquiries`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({ name: "顧客", email: "a@example.com", message: "希望" }),
    });
    const inquiry = (await inquiryRes.json()) as any;
    const future = new Date(Date.now() + 86400000).toISOString();
    await app.request(`/inquiries/${inquiry.id}/viewings`, {
      method: "POST",
      headers: authHeaders(agentA.accessToken),
      body: JSON.stringify({ scheduledAt: future }),
    });

    const resA = await app.request("/viewings", { headers: authHeaders(agentA.accessToken) });
    const bodyA = (await resA.json()) as any;
    const resB = await app.request("/viewings", { headers: authHeaders(agentB.accessToken) });
    const bodyB = (await resB.json()) as any;

    expect(bodyA.viewings).toHaveLength(1);
    expect(bodyB.viewings).toHaveLength(0);
  });

  it("adminは全件見える", async () => {
    const agentA = await createTestAgent();
    const admin = await createTestAgent({ role: "admin" });
    const propertyA = await createPublishedProperty(agentA.accessToken);
    const inquiryRes = await app.request(`/properties/${propertyA.id}/inquiries`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({ name: "顧客", email: "a@example.com", message: "希望" }),
    });
    const inquiry = (await inquiryRes.json()) as any;
    const future = new Date(Date.now() + 86400000).toISOString();
    await app.request(`/inquiries/${inquiry.id}/viewings`, {
      method: "POST",
      headers: authHeaders(agentA.accessToken),
      body: JSON.stringify({ scheduledAt: future }),
    });

    const res = await app.request("/viewings", { headers: authHeaders(admin.accessToken) });
    const body = (await res.json()) as any;

    expect(body.viewings.length).toBeGreaterThanOrEqual(1);
  });
});
