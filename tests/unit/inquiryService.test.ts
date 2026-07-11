import { describe, it, expect, vi, beforeEach } from "vitest";
import * as propertyRepository from "../../src/repositories/propertyRepository.js";
import * as inquiryRepository from "../../src/repositories/inquiryRepository.js";
import * as customerRepository from "../../src/repositories/customerRepository.js";
import * as inquiryService from "../../src/services/inquiryService.js";

vi.mock("../../src/repositories/propertyRepository.js");
vi.mock("../../src/repositories/inquiryRepository.js");
vi.mock("../../src/repositories/customerRepository.js");

const AGENT = { agentId: 1, role: "agent" as const };
const OTHER_AGENT = { agentId: 2, role: "agent" as const };

type PropertyStatus = "draft" | "published" | "contracted" | "closed";
type PropertyType = "rent" | "sale";
type InquiryStatus = "new" | "in_progress" | "done";

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
  overrides: Partial<{
    id: number;
    propertyId: number;
    customerId: number;
    status: InquiryStatus;
  }> = {},
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inquiryService.create", () => {
  it("published以外の物件は404", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ status: "draft" }));

    await expect(
      inquiryService.create(1, { name: "顧客", email: "a@example.com", message: "希望" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });

  it("存在しない物件は404", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(undefined);

    await expect(
      inquiryService.create(999, { name: "顧客", email: "a@example.com", message: "希望" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("正常系: customerをupsertしてから、そのidでinquiryを作成する", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(
      fakeProperty({ status: "published" }),
    );
    vi.mocked(customerRepository.upsertByEmail).mockResolvedValue({
      id: 42,
      name: "顧客",
      email: "a@example.com",
      phone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(inquiryRepository.create).mockResolvedValue(fakeInquiry({ customerId: 42 }));

    const result = await inquiryService.create(1, {
      name: "顧客",
      email: "a@example.com",
      message: "希望",
    });

    expect(customerRepository.upsertByEmail).toHaveBeenCalledWith(expect.anything(), {
      name: "顧客",
      email: "a@example.com",
      phone: undefined,
    });
    expect(inquiryRepository.create).toHaveBeenCalledWith(expect.anything(), {
      propertyId: 1,
      customerId: 42,
      message: "希望",
    });
    expect(result.customerId).toBe(42);
  });
});

describe("inquiryService.listByProperty", () => {
  it("他人の物件は403", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));

    await expect(
      inquiryService.listByProperty(1, { limit: 20, offset: 0 }, OTHER_AGENT),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("存在しない物件は404", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(undefined);

    await expect(
      inquiryService.listByProperty(999, { limit: 20, offset: 0 }, AGENT),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("所有者本人なら一覧を取得できる", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));
    vi.mocked(inquiryRepository.findByPropertyId).mockResolvedValue({
      rows: [fakeInquiry()],
      total: 1,
    });

    const result = await inquiryService.listByProperty(1, { limit: 20, offset: 0 }, AGENT);

    expect(result.total).toBe(1);
    expect(result.inquiries).toHaveLength(1);
  });
});

describe("inquiryService.updateStatus", () => {
  it("new→in_progressは許可", async () => {
    vi.mocked(inquiryRepository.findById).mockResolvedValue(fakeInquiry({ status: "new" }));
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));
    vi.mocked(inquiryRepository.updateStatus).mockResolvedValue(
      fakeInquiry({ status: "in_progress" }),
    );

    const result = await inquiryService.updateStatus(1, { status: "in_progress" }, AGENT);

    expect(result.status).toBe("in_progress");
  });

  it("done→newは409", async () => {
    vi.mocked(inquiryRepository.findById).mockResolvedValue(fakeInquiry({ status: "done" }));
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));

    await expect(inquiryService.updateStatus(1, { status: "new" }, AGENT)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_STATUS_TRANSITION",
    });
  });

  it("他人の物件に紐づくinquiryは403", async () => {
    vi.mocked(inquiryRepository.findById).mockResolvedValue(fakeInquiry({ status: "new" }));
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));

    await expect(
      inquiryService.updateStatus(1, { status: "done" }, OTHER_AGENT),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("存在しないinquiryは404", async () => {
    vi.mocked(inquiryRepository.findById).mockResolvedValue(undefined);

    await expect(
      inquiryService.updateStatus(999, { status: "done" }, AGENT),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
