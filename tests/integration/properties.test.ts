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

describe("GET /properties 検索パラメータ", () => {
  async function createPublished(token: string, fields: Record<string, unknown>) {
    const createRes = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ type: "rent", price: 80000, address: "東京都", ...fields }),
    });
    const property = (await createRes.json()) as any;
    await app.request(`/properties/${property.id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ status: "published" }),
    });
    return property;
  }

  it("layoutは完全一致で絞り込める", async () => {
    const agent = await createTestAgent();
    await createPublished(agent.accessToken, { title: "2LDK物件", layout: "2LDK" });
    await createPublished(agent.accessToken, { title: "1LDK物件", layout: "1LDK" });

    const res = await app.request("/properties?layout=2LDK");
    const body = (await res.json()) as any;

    expect(body.properties).toHaveLength(1);
    expect(body.properties[0].title).toBe("2LDK物件");
  });

  it("keywordはタイトルと説明を部分一致で横断検索する", async () => {
    const agent = await createTestAgent();
    await createPublished(agent.accessToken, {
      title: "駅近マンション",
      description: "ペット可・南向きバルコニー",
    });
    await createPublished(agent.accessToken, { title: "ペット可アパート" });
    await createPublished(agent.accessToken, { title: "郊外の一軒家", description: "庭付き" });

    const res = await app.request(`/properties?keyword=${encodeURIComponent("ペット可")}`);
    const body = (await res.json()) as any;

    expect(body.properties).toHaveLength(2);
  });

  it("keywordのLIKEメタ文字（%など）はエスケープされ文字通りに扱われる", async () => {
    const agent = await createTestAgent();
    await createPublished(agent.accessToken, { title: "仲介手数料100%オフ" });
    await createPublished(agent.accessToken, { title: "仲介手数料100円" });

    const res = await app.request(`/properties?keyword=${encodeURIComponent("100%")}`);
    const body = (await res.json()) as any;

    expect(body.properties).toHaveLength(1);
    expect(body.properties[0].title).toBe("仲介手数料100%オフ");
  });
});

describe("GET /properties 並び順（sort）", () => {
  async function createPublished(token: string, price: number, title: string) {
    const createRes = await app.request("/properties", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ type: "rent", price, title, address: "東京都" }),
    });
    const property = (await createRes.json()) as any;
    await app.request(`/properties/${property.id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ status: "published" }),
    });
    return property;
  }

  async function listIds(query: string) {
    const res = await app.request(`/properties${query}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as any).properties.map((p: any) => p.id as number);
  }

  // 価格: 3万, 1万, 2万, 1万（id昇順に作成）
  async function seed() {
    const agent = await createTestAgent();
    const a = await createPublished(agent.accessToken, 30000, "A");
    const b = await createPublished(agent.accessToken, 10000, "B");
    const c = await createPublished(agent.accessToken, 20000, "C");
    const d = await createPublished(agent.accessToken, 10000, "D");
    return { a: a.id, b: b.id, c: c.id, d: d.id };
  }

  it("sort未指定はid昇順", async () => {
    const { a, b, c, d } = await seed();
    expect(await listIds("")).toEqual([a, b, c, d]);
  });

  it("price_ascは価格の安い順で、同価格はid昇順", async () => {
    const { a, b, c, d } = await seed();
    expect(await listIds("?sort=price_asc")).toEqual([b, d, c, a]);
  });

  it("price_descは価格の高い順で、同価格はid昇順", async () => {
    const { a, b, c, d } = await seed();
    expect(await listIds("?sort=price_desc")).toEqual([a, c, b, d]);
  });

  it("newestは作成日時の降順（新しい物件が先）", async () => {
    const { a, b, c, d } = await seed();
    expect(await listIds("?sort=newest")).toEqual([d, c, b, a]);
  });

  it("同価格の物件でもlimit/offsetのページングに重複・欠落が無い", async () => {
    const agent = await createTestAgent();
    const created: number[] = [];
    for (let i = 0; i < 7; i++) {
      created.push((await createPublished(agent.accessToken, 50000, `同価格${i}`)).id);
    }

    for (const sort of ["", "&sort=price_asc", "&sort=price_desc", "&sort=newest"]) {
      const collected: number[] = [];
      for (let offset = 0; offset < 7; offset += 3) {
        collected.push(...(await listIds(`?limit=3&offset=${offset}${sort}`)));
      }
      expect(collected).toHaveLength(7);
      expect(new Set(collected).size).toBe(7);
      expect([...collected].sort((x, y) => x - y)).toEqual(created);
    }
    // リモートDBに対して作成・公開14リクエスト＋一覧取得12回を直列で行うため、既定の5秒では足りない
  }, 30_000);

  it("不正なsortは422", async () => {
    const res = await app.request("/properties?sort=invalid");
    expect(res.status).toBe(422);
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

describe("売買物件の項目拡張", () => {
  async function createProperty(token: string, body: Record<string, unknown>) {
    return app.request("/properties", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ title: "テスト物件", price: 5000, address: "東京都", ...body }),
    });
  }

  it("新しい項目を付けて作成・取得でき、numericは文字列で返る", async () => {
    const agent = await createTestAgent();

    const res = await createProperty(agent.accessToken, {
      type: "sale",
      saleKind: "used_mansion",
      area: 65.5,
      builtYearMonth: "2010-03",
      nearestStation: "西宮北口",
      walkMinutes: 7,
      floorCount: 14,
      floorNumber: -1,
      balconyArea: 9.8,
      managementFee: 12000,
      repairReserveFee: 9500,
      managementType: "全部委託・日勤",
      latitude: 34.7425,
      longitude: 135.3621,
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as any;
    expect(created.saleKind).toBe("used_mansion");
    expect(created.area).toBe("65.50");
    expect(created.balconyArea).toBe("9.80");
    expect(created.latitude).toBe("34.742500");
    expect(created.longitude).toBe("135.362100");
    expect(created.walkMinutes).toBe(7);
    expect(created.floorNumber).toBe(-1);
    expect(created.landArea).toBeNull();

    const getRes = await app.request(`/properties/${created.id}`, {
      headers: authHeaders(agent.accessToken),
    });
    const fetched = (await getRes.json()) as any;
    expect(fetched.builtYearMonth).toBe("2010-03");
    expect(fetched.managementType).toBe("全部委託・日勤");
  });

  it("売地: 私道負担0は0.00で保存される（不明のnullと区別できる）", async () => {
    const agent = await createTestAgent();

    const res = await createProperty(agent.accessToken, {
      type: "sale",
      saleKind: "land",
      landArea: 120.5,
      privateRoadArea: 0,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.landArea).toBe("120.50");
    expect(body.privateRoadArea).toBe("0.00");
  });

  it("新しい項目を何も付けない既存形式の作成は従来どおり201", async () => {
    const agent = await createTestAgent();

    const res = await createProperty(agent.accessToken, { type: "sale", area: 50 });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.saleKind).toBeNull();
    expect(body.latitude).toBeNull();
  });

  it("builtYearMonthの形式不正は422", async () => {
    const agent = await createTestAgent();

    const res = await createProperty(agent.accessToken, {
      type: "sale",
      saleKind: "used_house",
      builtYearMonth: "2010-13",
    });

    expect(res.status).toBe(422);
  });

  it("矛盾した作成は400（rentにsaleKind / 売地に建物項目 / 緯度だけ）", async () => {
    const agent = await createTestAgent();

    const cases = [
      { type: "rent", saleKind: "used_house" },
      { type: "sale", saleKind: "land", builtYearMonth: "2010-03" },
      { type: "sale", latitude: 35.1 },
    ];
    for (const body of cases) {
      const res = await createProperty(agent.accessToken, body);
      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe("INCONSISTENT_PROPERTY");
    }
  });

  it("矛盾した更新は400（既存の行に重ねた結果で判定）", async () => {
    const agent = await createTestAgent();
    const createRes = await createProperty(agent.accessToken, {
      type: "sale",
      saleKind: "used_house",
    });
    const created = (await createRes.json()) as any;

    const res = await app.request(`/properties/${created.id}`, {
      method: "PATCH",
      headers: authHeaders(agent.accessToken),
      body: JSON.stringify({ type: "rent" }),
    });

    expect(res.status).toBe(400);
  });

  it("GET /properties?saleKind=used_mansion で絞り込める", async () => {
    const agent = await createTestAgent();
    for (const body of [
      { type: "sale", saleKind: "used_mansion", title: "マンション" },
      { type: "sale", saleKind: "land", title: "売地" },
      { type: "sale", title: "種別なし" },
    ]) {
      const res = await createProperty(agent.accessToken, body);
      const created = (await res.json()) as any;
      await app.request(`/properties/${created.id}`, {
        method: "PATCH",
        headers: authHeaders(agent.accessToken),
        body: JSON.stringify({ status: "published" }),
      });
    }

    const res = await app.request("/properties?saleKind=used_mansion");
    const body = (await res.json()) as any;

    expect(body.total).toBe(1);
    expect(body.properties[0].title).toBe("マンション");
  });
});
