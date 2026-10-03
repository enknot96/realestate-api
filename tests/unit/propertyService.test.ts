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
    saleKind: null,
    landArea: null,
    privateRoadArea: null,
    buildingArea: null,
    builtYearMonth: null,
    nearestStation: null,
    walkMinutes: null,
    accessNote: null,
    floorCount: null,
    floorNumber: null,
    balconyArea: null,
    managementFee: null,
    repairReserveFee: null,
    managementType: null,
    latitude: null,
    longitude: null,
    imageUrl: null,
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

describe("propertyService 項目の矛盾チェック", () => {
  it("作成: saleKindを持つのにtypeがrentなら400でDBに書かない", async () => {
    await expect(
      propertyService.create(
        { type: "rent", title: "x", price: 1000, address: "東京都", saleKind: "land" },
        AGENT,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "INCONSISTENT_PROPERTY" });
    expect(propertyRepository.create).not.toHaveBeenCalled();
  });

  it("作成: 項目を何も付けない既存形式は通る", async () => {
    vi.mocked(propertyRepository.create).mockResolvedValue(fakeProperty());
    await propertyService.create({ type: "sale", title: "x", price: 1000, address: "東京都" }, AGENT);
    expect(propertyRepository.create).toHaveBeenCalled();
  });

  it("更新: saleKindを持つ既存物件をtype: rentに変える更新は、既存値と重ねて判定され400", async () => {
    const property = { ...fakeProperty({ agentId: 1 }), saleKind: "used_house" as const };
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);

    await expect(propertyService.update(1, { type: "rent" }, AGENT)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(propertyRepository.update).not.toHaveBeenCalled();
  });

  it("更新: 既存がland+更新でbuildingAreaを足すと400", async () => {
    const property = { ...fakeProperty({ agentId: 1 }), saleKind: "land" as const };
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);

    await expect(propertyService.update(1, { buildingArea: 90 }, AGENT)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("更新: 既存の緯度に経度だけ足せば矛盾せず通る", async () => {
    const property = { ...fakeProperty({ agentId: 1 }), latitude: "35.100000" };
    vi.mocked(propertyRepository.findById).mockResolvedValue(property);
    vi.mocked(propertyRepository.update).mockResolvedValue(property);

    await propertyService.update(1, { longitude: 139.7 }, AGENT);
    expect(propertyRepository.update).toHaveBeenCalled();
  });

  it("更新: 緯度だけを持つ状態になる更新は400", async () => {
    vi.mocked(propertyRepository.findById).mockResolvedValue(fakeProperty({ agentId: 1 }));

    await expect(propertyService.update(1, { latitude: 35.1 }, AGENT)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
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

describe("propertyService.list sort", () => {
  it("sortがrepositoryのfindManyまで渡る", async () => {
    vi.mocked(propertyRepository.findMany).mockResolvedValue({ rows: [], total: 0 });

    await propertyService.list({ sort: "price_asc", limit: 20, offset: 0 }, null);

    expect(propertyRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "price_asc" }),
    );
  });

  it("sort未指定ならundefinedのまま渡る（既定のid昇順はrepository側で決まる）", async () => {
    vi.mocked(propertyRepository.findMany).mockResolvedValue({ rows: [], total: 0 });

    await propertyService.list({ limit: 20, offset: 0 }, null);

    expect(propertyRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ sort: undefined }),
    );
  });
});
