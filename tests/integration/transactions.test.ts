import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { customers, viewings, properties } from "../../src/db/schema.js";
import * as propertyRepository from "../../src/repositories/propertyRepository.js";
import * as inquiryRepository from "../../src/repositories/inquiryRepository.js";
import * as customerRepository from "../../src/repositories/customerRepository.js";
import * as viewingRepository from "../../src/repositories/viewingRepository.js";
import * as inquiryService from "../../src/services/inquiryService.js";
import * as viewingService from "../../src/services/viewingService.js";
import * as propertyService from "../../src/services/propertyService.js";
import { createTestAgent } from "../helpers/auth.js";
import { resetDatabase } from "../helpers/db.js";

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createPublishedProperty(agentId: number) {
  const property = await propertyRepository.create(db, agentId, {
    type: "sale",
    title: "テスト物件",
    price: 5000,
    address: "東京都",
  });
  return propertyRepository.update(db, property.id, { status: "published" });
}

describe("トランザクション① 顧客upsert + 問い合わせ作成", () => {
  it("inquiry作成が途中で失敗したら、customerのupsertもロールバックされる", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.agentId);

    vi.spyOn(inquiryRepository, "create").mockRejectedValue(new Error("強制的な失敗"));

    await expect(
      inquiryService.create(property.id, {
        name: "顧客",
        email: "rollback-1@example.com",
        message: "内見希望",
      }),
    ).rejects.toThrow("強制的な失敗");

    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.email, "rollback-1@example.com"));

    expect(rows).toHaveLength(0);
  });
});

describe("トランザクション② viewing作成 + 問い合わせstatus更新", () => {
  it("inquiry.status更新が途中で失敗したら、viewingの作成もロールバックされる", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.agentId);
    const customer = await customerRepository.upsertByEmail(db, {
      name: "顧客",
      email: "rollback-2@example.com",
    });
    const inquiry = await inquiryRepository.create(db, {
      propertyId: property.id,
      customerId: customer.id,
      message: "内見希望",
    });

    vi.spyOn(inquiryRepository, "updateStatus").mockRejectedValue(new Error("強制的な失敗"));

    await expect(
      viewingService.create(
        inquiry.id,
        { scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        { agentId: agent.agentId, role: "agent" },
      ),
    ).rejects.toThrow("強制的な失敗");

    const rows = await db.select().from(viewings).where(eq(viewings.inquiryId, inquiry.id));

    expect(rows).toHaveLength(0);
  });
});

describe("トランザクション③ 物件status更新 + 内見の一括キャンセル", () => {
  it("内見の一括キャンセルが途中で失敗したら、物件statusの更新もロールバックされる", async () => {
    const agent = await createTestAgent();
    const property = await createPublishedProperty(agent.agentId);

    vi.spyOn(viewingRepository, "cancelScheduledByPropertyId").mockRejectedValue(
      new Error("強制的な失敗"),
    );

    await expect(
      propertyService.update(
        property.id,
        { status: "contracted" },
        { agentId: agent.agentId, role: "agent" },
      ),
    ).rejects.toThrow("強制的な失敗");

    const [reloaded] = await db.select().from(properties).where(eq(properties.id, property.id));

    expect(reloaded.status).toBe("published");
  });
});
