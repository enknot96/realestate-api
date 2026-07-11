import { describe, it, expect, vi, beforeEach } from "vitest";
import * as propertyRepository from "../../src/repositories/propertyRepository.js";
import * as viewingRepository from "../../src/repositories/viewingRepository.js";
import * as propertyService from "../../src/services/propertyService.js";

vi.mock("../../src/repositories/propertyRepository.js");
vi.mock("../../src/repositories/viewingRepository.js");

const AGENT = { agentId: 1, role: "agent" as const };
const OTHER_AGENT = { agentId: 2, role: "agent" as const };
const ADMIN = { agentId: 99, role: "admin" as const };

type PropertyStatus = "draft" | "published" | "contracted" | "closed";
type PropertyType = "rent" | "sale";

function fakeProperty(
  overrides: Partial<{
    id: number;
    agentId: number;
    status: PropertyStatus;
    type: PropertyType;
    title: string;
  }> = {},
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
    status: "draft" as PropertyStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("propertyService.update", () => {
  it("所有者本人によるstatus更新は成功する", async () => {
    const property = fakeProperty({ agentId: 1, status: "draft" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);
    vi.mocked(propertyRepository.update).mockResolvedValue({ ...property, status: "published" });

    const result = await propertyService.update(1, { status: "published" }, AGENT);

    expect(result.status).toBe("published");
    expect(propertyRepository.update).toHaveBeenCalledWith(expect.anything(), 1, {
      status: "published",
    });
  });

  it("他人の物件を更新しようとすると403", async () => {
    const property = fakeProperty({ agentId: 1, status: "draft" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);

    await expect(
      propertyService.update(1, { title: "乗っ取り" }, OTHER_AGENT),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("adminは他人の物件でも更新できる", async () => {
    const property = fakeProperty({ agentId: 1, status: "draft" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);
    vi.mocked(propertyRepository.update).mockResolvedValue({ ...property, status: "published" });

    const result = await propertyService.update(1, { status: "published" }, ADMIN);

    expect(result.status).toBe("published");
  });

  it("許可されていない遷移（draft→contracted）は409", async () => {
    const property = fakeProperty({ agentId: 1, status: "draft" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);

    await expect(
      propertyService.update(1, { status: "contracted" }, AGENT),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATUS_TRANSITION" });
  });

  it("published→contractedでは内見の一括キャンセルもトランザクション内で呼ばれる", async () => {
    const property = fakeProperty({ agentId: 1, status: "published" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);
    vi.mocked(propertyRepository.update).mockResolvedValue({ ...property, status: "contracted" });
    vi.mocked(viewingRepository.cancelScheduledByPropertyId).mockResolvedValue(undefined as never);

    await propertyService.update(1, { status: "contracted" }, AGENT);

    expect(viewingRepository.cancelScheduledByPropertyId).toHaveBeenCalledWith(
      expect.anything(),
      1,
    );
  });

  it("statusが変わらない場合は遷移チェックをスキップする", async () => {
    const property = fakeProperty({ agentId: 1, status: "published" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);
    vi.mocked(propertyRepository.update).mockResolvedValue({ ...property, title: "新タイトル" });

    const result = await propertyService.update(
      1,
      { title: "新タイトル", status: "published" },
      AGENT,
    );

    expect(result.title).toBe("新タイトル");
  });

  it("存在しない物件のidは404", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(undefined);

    await expect(propertyService.update(999, { title: "x" }, AGENT)).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });
});

describe("propertyService.remove", () => {
  it("draft/published/contractedはclosedにできる", async () => {
    const property = fakeProperty({ agentId: 1, status: "published" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);
    vi.mocked(propertyRepository.update).mockResolvedValue({ ...property, status: "closed" });
    vi.mocked(viewingRepository.cancelScheduledByPropertyId).mockResolvedValue(undefined as never);

    const result = await propertyService.remove(1, AGENT);

    expect(result.status).toBe("closed");
  });

  it("すでにclosedの物件は409", async () => {
    const property = fakeProperty({ agentId: 1, status: "closed" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);

    await expect(propertyService.remove(1, AGENT)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_STATUS_TRANSITION",
    });
  });
});

describe("propertyService.getById 可視性ルール", () => {
  it("published物件は誰でも見える", async () => {
    const property = fakeProperty({ agentId: 1, status: "published" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);

    const result = await propertyService.getById(1, null);

    expect(result.status).toBe("published");
  });

  it("draft物件は未認証だと404", async () => {
    const property = fakeProperty({ agentId: 1, status: "draft" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);

    await expect(propertyService.getById(1, null)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("draft物件は所有agent本人なら見える", async () => {
    const property = fakeProperty({ agentId: 1, status: "draft" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);

    const result = await propertyService.getById(1, AGENT);

    expect(result.status).toBe("draft");
  });

  it("draft物件は他のagentからは404", async () => {
    const property = fakeProperty({ agentId: 1, status: "draft" });
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);

    await expect(propertyService.getById(1, OTHER_AGENT)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
