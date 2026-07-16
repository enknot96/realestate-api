import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/app.js";
import { createTestAgent } from "../helpers/auth.js";
import { resetDatabase } from "../helpers/db.js";

const ORIGIN = "http://localhost:5173";
let ipCounter = 0;

function nextIp() {
  ipCounter += 1;
  return `203.0.114.${ipCounter}`;
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

// viewingCreateSchemaが未来日時を要求するため、テスト日付は実行時点からの相対で組み立てる
// （now+9hのUTC表記=JSTの壁時計。そこからN日後の日付文字列を得る）
function jstDateString(daysFromNow: number) {
  return new Date(Date.now() + 9 * 3600000 + daysFromNow * 86400000).toISOString().slice(0, 10);
}

async function createPublishedProperty(accessToken: string) {
  const createRes = await app.request("/properties", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ type: "rent", title: "空き枠テスト物件", price: 80000, address: "東京都" }),
  });
  const property = (await createRes.json()) as any;
  await app.request(`/properties/${property.id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ status: "published" }),
  });
  return property;
}

async function createViewing(accessToken: string, propertyId: number, scheduledAt: string) {
  const inquiryRes = await app.request(`/properties/${propertyId}/inquiries`, {
    method: "POST",
    headers: publicHeaders(),
    body: JSON.stringify({ name: "顧客", email: "avail@example.com", message: "内見希望" }),
  });
  const inquiry = (await inquiryRes.json()) as any;

  const viewingRes = await app.request(`/inquiries/${inquiry.id}/viewings`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ scheduledAt }),
  });
  expect(viewingRes.status).toBe(201);
  return (await viewingRes.json()) as any;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /properties/:id/availability", () => {
  it("予約中の内見がある枠だけavailable: falseになる（未認証で確認できる）", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.accessToken);
    const from = jstDateString(14);
    const to = jstDateString(15);
    await createViewing(agent.accessToken, property.id, `${from}T14:00:00+09:00`);

    const res = await app.request(
      `/properties/${property.id}/availability?from=${from}&to=${to}`,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.propertyId).toBe(property.id);
    expect(body.days).toHaveLength(2);

    const day1Slots = body.days[0].slots;
    expect(day1Slots).toHaveLength(8);
    expect(day1Slots.find((s: any) => s.startAt === `${from}T14:00:00+09:00`).available).toBe(
      false,
    );
    expect(day1Slots.find((s: any) => s.startAt === `${from}T10:00:00+09:00`).available).toBe(
      true,
    );
    // 2日目は予約が無いので全枠空き
    expect(body.days[1].slots.every((s: any) => s.available)).toBe(true);
  });

  it("キャンセルされた内見は枠を塞がない", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.accessToken);
    const from = jstDateString(14);
    const viewing = await createViewing(agent.accessToken, property.id, `${from}T14:00:00+09:00`);

    await app.request(`/viewings/${viewing.id}`, {
      method: "PATCH",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ status: "cancelled" }),
    });

    const res = await app.request(
      `/properties/${property.id}/availability?from=${from}&to=${from}`,
    );
    const body = (await res.json()) as any;

    expect(body.days[0].slots.every((s: any) => s.available)).toBe(true);
  });

  it("非公開物件は未認証だと404、所有者agentなら200", async () => {
    const agent = await createTestAgent();
    const createRes = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ type: "rent", title: "draft物件", price: 80000, address: "東京都" }),
    });
    const property = (await createRes.json()) as any;
    const from = jstDateString(14);

    const publicRes = await app.request(
      `/properties/${property.id}/availability?from=${from}&to=${from}`,
    );
    expect(publicRes.status).toBe(404);

    const ownerRes = await app.request(
      `/properties/${property.id}/availability?from=${from}&to=${from}`,
      { headers: authHeaders(agent.accessToken) },
    );
    expect(ownerRes.status).toBe(200);
  });

  it("存在しない物件は404", async () => {
    const from = jstDateString(14);
    const res = await app.request(`/properties/99999/availability?from=${from}&to=${from}`);
    expect(res.status).toBe(404);
  });

  it("fromがtoより後なら422", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.accessToken);

    const res = await app.request(
      `/properties/${property.id}/availability?from=${jstDateString(15)}&to=${jstDateString(14)}`,
    );
    expect(res.status).toBe(422);
  });

  it("期間が7日を超えると422", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.accessToken);

    const res = await app.request(
      `/properties/${property.id}/availability?from=${jstDateString(14)}&to=${jstDateString(21)}`,
    );
    expect(res.status).toBe(422);
  });

  it("日付形式が不正なら422", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.accessToken);

    const res = await app.request(
      `/properties/${property.id}/availability?from=2026-8-3&to=2026-8-4`,
    );
    expect(res.status).toBe(422);
  });
});
