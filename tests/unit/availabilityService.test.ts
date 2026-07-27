import { describe, it, expect, vi, beforeEach } from "vitest";
import * as propertyRepository from "../../src/repositories/propertyRepository.js";
import * as viewingRepository from "../../src/repositories/viewingRepository.js";
import * as availabilityService from "../../src/services/availabilityService.js";

vi.mock("../../src/repositories/propertyRepository.js");
vi.mock("../../src/repositories/viewingRepository.js");

const AGENT = { agentId: 1, role: "agent" as const };
const OTHER_AGENT = { agentId: 2, role: "agent" as const };

type PropertyStatus = "draft" | "published" | "contracted" | "closed";
type PropertyType = "rent" | "sale";

function fakeProperty(
  overrides: Partial<{ id: number; agentId: number; status: PropertyStatus }> = {},
) {
  return {
    id: 1,
    agentId: 1,
    type: "rent" as PropertyType,
    title: "テスト物件",
    description: null,
    price: 80000,
    layout: "2LDK",
    area: null,
    imageUrl: null,
    address: "東京都",
    status: "published" as PropertyStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("availabilityService.getAvailability", () => {
  it("予約なしなら全枠available（10:00〜17:00開始の8枠・JST表記）", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty());
    vi.mocked(viewingRepository.findScheduledAtsByPropertyBetween).mockResolvedValue([]);

    const result = await availabilityService.getAvailability(
      1,
      { from: "2026-08-03", to: "2026-08-03" },
      null,
    );

    expect(result.propertyId).toBe(1);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].date).toBe("2026-08-03");
    expect(result.days[0].slots).toHaveLength(8);
    expect(result.days[0].slots[0].startAt).toBe("2026-08-03T10:00:00+09:00");
    expect(result.days[0].slots[7].startAt).toBe("2026-08-03T17:00:00+09:00");
    expect(result.days[0].slots.every((slot) => slot.available)).toBe(true);
  });

  it("11:00ちょうどの予約はその枠だけを塞ぐ", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty());
    vi.mocked(viewingRepository.findScheduledAtsByPropertyBetween).mockResolvedValue([
      new Date("2026-08-03T11:00:00+09:00"),
    ]);

    const result = await availabilityService.getAvailability(
      1,
      { from: "2026-08-03", to: "2026-08-03" },
      null,
    );

    const slots = result.days[0].slots;
    expect(slots.find((s) => s.startAt === "2026-08-03T11:00:00+09:00")?.available).toBe(false);
    expect(slots.filter((s) => s.available)).toHaveLength(7);
  });

  it("10:30の予約は10:00枠を塞ぎ、11:00枠は塞がない", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty());
    vi.mocked(viewingRepository.findScheduledAtsByPropertyBetween).mockResolvedValue([
      new Date("2026-08-03T10:30:00+09:00"),
    ]);

    const result = await availabilityService.getAvailability(
      1,
      { from: "2026-08-03", to: "2026-08-03" },
      null,
    );

    const slots = result.days[0].slots;
    expect(slots.find((s) => s.startAt === "2026-08-03T10:00:00+09:00")?.available).toBe(false);
    expect(slots.find((s) => s.startAt === "2026-08-03T11:00:00+09:00")?.available).toBe(true);
  });

  it("営業時間の境界（9:59・18:00）の予約はどの枠も塞がない", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty());
    vi.mocked(viewingRepository.findScheduledAtsByPropertyBetween).mockResolvedValue([
      new Date("2026-08-03T09:59:00+09:00"),
      new Date("2026-08-03T18:00:00+09:00"),
    ]);

    const result = await availabilityService.getAvailability(
      1,
      { from: "2026-08-03", to: "2026-08-03" },
      null,
    );

    expect(result.days[0].slots.every((slot) => slot.available)).toBe(true);
  });

  it("3日間指定なら日付が連続した3日分を返す", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty());
    vi.mocked(viewingRepository.findScheduledAtsByPropertyBetween).mockResolvedValue([]);

    const result = await availabilityService.getAvailability(
      1,
      { from: "2026-08-30", to: "2026-09-01" },
      null,
    );

    expect(result.days.map((day) => day.date)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });

  it("非公開物件は未認証だと404（可視性ルールはGET /properties/:idと同一）", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ status: "draft" }));

    await expect(
      availabilityService.getAvailability(1, { from: "2026-08-03", to: "2026-08-03" }, null),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("非公開物件でも所有者agentなら見える", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(
      fakeProperty({ status: "draft", agentId: AGENT.agentId }),
    );
    vi.mocked(viewingRepository.findScheduledAtsByPropertyBetween).mockResolvedValue([]);

    const result = await availabilityService.getAvailability(
      1,
      { from: "2026-08-03", to: "2026-08-03" },
      AGENT,
    );

    expect(result.days).toHaveLength(1);
  });

  it("非公開物件は他人のagentだと404", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(
      fakeProperty({ status: "draft", agentId: AGENT.agentId }),
    );

    await expect(
      availabilityService.getAvailability(
        1,
        { from: "2026-08-03", to: "2026-08-03" },
        OTHER_AGENT,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
