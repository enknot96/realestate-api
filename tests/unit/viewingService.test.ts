import { describe, it, expect, vi, beforeEach } from "vitest";
import * as propertyRepository from "../../src/repositories/propertyRepository.js";
import * as inquiryRepository from "../../src/repositories/inquiryRepository.js";
import * as viewingRepository from "../../src/repositories/viewingRepository.js";
import * as viewingService from "../../src/services/viewingService.js";

vi.mock("../../src/repositories/propertyRepository.js");
vi.mock("../../src/repositories/inquiryRepository.js");
vi.mock("../../src/repositories/viewingRepository.js");

const AGENT = { agentId: 1, role: "agent" as const };
const OTHER_AGENT = { agentId: 2, role: "agent" as const };
const ADMIN = { agentId: 99, role: "admin" as const };

type PropertyStatus = "draft" | "published" | "contracted" | "closed";
type PropertyType = "rent" | "sale";
type InquiryStatus = "new" | "in_progress" | "done";
type ViewingStatus = "scheduled" | "completed" | "cancelled";

function fakeProperty(
  overrides: Partial<{ id: number; agentId: number; status: PropertyStatus }> = {},
) {
  return {
    id: 1,
    agentId: 1,
    type: "sale" as PropertyType,
    title: "テスト物件",
    description: null,
    price: 5000,
    layout: null,
    area: null,
    address: "東京都",
    status: "published" as PropertyStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeInquiry(
  overrides: Partial<{ id: number; propertyId: number; status: InquiryStatus }> = {},
) {
  return {
    id: 1,
    propertyId: 1,
    customerId: 1,
    message: "内見したいです",
    status: "new" as InquiryStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeViewing(
  overrides: Partial<{
    id: number;
    inquiryId: number;
    propertyId: number;
    status: ViewingStatus;
  }> = {},
) {
  return {
    id: 1,
    inquiryId: 1,
    propertyId: 1,
    scheduledAt: new Date(Date.now() + 86400000),
    status: "scheduled" as ViewingStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("viewingService.create", () => {
  it("存在しないinquiryは404", async () => {
    vi.mocked(inquiryRepository.findById).mockResolvedValue(undefined);

    await expect(
      viewingService.create(999, { scheduledAt: new Date() }, AGENT),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("他人の物件に紐づくinquiryへの作成は403", async () => {
    vi.mocked(inquiryRepository.findById).mockResolvedValue(fakeInquiry({ propertyId: 1 }));
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));

    await expect(
      viewingService.create(1, { scheduledAt: new Date() }, OTHER_AGENT),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("物件がpublished以外は409", async () => {
    vi.mocked(inquiryRepository.findById).mockResolvedValue(fakeInquiry({ propertyId: 1 }));
    vi.mocked(propertyRepository.findById).mockResolvedValue(
      fakeProperty({ agentId: 1, status: "contracted" }),
    );

    await expect(
      viewingService.create(1, { scheduledAt: new Date() }, AGENT),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATUS_TRANSITION" });
  });

  it("正常系: viewing作成後にinquiry.statusがin_progressに更新される", async () => {
    vi.mocked(inquiryRepository.findById).mockResolvedValue(fakeInquiry({ propertyId: 1 }));
    vi.mocked(propertyRepository.findById).mockResolvedValue(
      fakeProperty({ agentId: 1, status: "published" }),
    );
    vi.mocked(viewingRepository.create).mockResolvedValue(fakeViewing());
    vi.mocked(inquiryRepository.updateStatus).mockResolvedValue(
      fakeInquiry({ status: "in_progress" }),
    );

    const result = await viewingService.create(1, { scheduledAt: new Date() }, AGENT);

    expect(result.status).toBe("scheduled");
    expect(inquiryRepository.updateStatus).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "in_progress",
    );
  });
});

describe("viewingService.updateStatus", () => {
  it("scheduled→completedは許可", async () => {
    vi.mocked(viewingRepository.findById).mockResolvedValue(fakeViewing({ status: "scheduled" }));
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));
    vi.mocked(viewingRepository.updateStatus).mockResolvedValue(
      fakeViewing({ status: "completed" }),
    );

    const result = await viewingService.updateStatus(1, { status: "completed" }, AGENT);

    expect(result.status).toBe("completed");
  });

  it("completed→cancelledは409", async () => {
    vi.mocked(viewingRepository.findById).mockResolvedValue(fakeViewing({ status: "completed" }));
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));

    await expect(
      viewingService.updateStatus(1, { status: "cancelled" }, AGENT),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("他人の物件に紐づくviewingは403", async () => {
    vi.mocked(viewingRepository.findById).mockResolvedValue(fakeViewing({ status: "scheduled" }));
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));

    await expect(
      viewingService.updateStatus(1, { status: "completed" }, OTHER_AGENT),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("存在しないviewingは404", async () => {
    vi.mocked(viewingRepository.findById).mockResolvedValue(undefined);

    await expect(
      viewingService.updateStatus(999, { status: "completed" }, AGENT),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("viewingService.list 可視性", () => {
  it("adminはkind:adminで絞り込む", async () => {
    vi.mocked(viewingRepository.findMany).mockResolvedValue({ rows: [], total: 0 });

    await viewingService.list({ limit: 20, offset: 0 }, ADMIN);

    expect(viewingRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: { kind: "admin" } }),
    );
  });

  it("agentはkind:agent+自分のagentIdで絞り込む", async () => {
    vi.mocked(viewingRepository.findMany).mockResolvedValue({ rows: [], total: 0 });

    await viewingService.list({ limit: 20, offset: 0 }, AGENT);

    expect(viewingRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: { kind: "agent", agentId: 1 } }),
    );
  });
});
