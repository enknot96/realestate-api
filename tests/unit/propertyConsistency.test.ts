import { describe, it, expect } from "vitest";
import { findPropertyInconsistencies } from "../../src/lib/propertyConsistency.js";

describe("findPropertyInconsistencies", () => {
  it("項目を何も持たない既存形式は矛盾なし", () => {
    expect(findPropertyInconsistencies({ type: "sale" })).toEqual([]);
    expect(findPropertyInconsistencies({ type: "rent" })).toEqual([]);
  });

  describe("矛盾1: saleKindとtype", () => {
    it("saleKindを持つのにtypeがrentなら矛盾", () => {
      expect(findPropertyInconsistencies({ type: "rent", saleKind: "used_house" })).toHaveLength(1);
    });

    it("saleKindを持つのにtype未指定なら矛盾", () => {
      expect(findPropertyInconsistencies({ saleKind: "land" })).toHaveLength(1);
    });

    it("type=saleでsaleKindを持つのは矛盾しない", () => {
      expect(findPropertyInconsistencies({ type: "sale", saleKind: "used_mansion" })).toEqual([]);
    });

    it("saleKindがnullならrentでも矛盾しない", () => {
      expect(findPropertyInconsistencies({ type: "rent", saleKind: null })).toEqual([]);
    });
  });

  describe("矛盾2: 売地に建物・マンション用の項目", () => {
    const base = { type: "sale", saleKind: "land" } as const;

    it.each([
      ["buildingArea", 98.5],
      ["builtYearMonth", "2015-04"],
      ["floorCount", 10],
      ["floorNumber", 3],
      ["balconyArea", 8.2],
      ["managementFee", 10000],
      ["repairReserveFee", 8000],
      ["managementType", "全部委託"],
    ])("売地が%sを持つと矛盾", (key, value) => {
      expect(findPropertyInconsistencies({ ...base, [key]: value })).toHaveLength(1);
    });

    it("0やnullでない値は「持つ」とみなす（floorNumber=0、managementFee=0も矛盾）", () => {
      expect(findPropertyInconsistencies({ ...base, floorNumber: 0 })).toHaveLength(1);
      expect(findPropertyInconsistencies({ ...base, managementFee: 0 })).toHaveLength(1);
    });

    it("売地が土地面積・私道負担・交通だけなら矛盾なし", () => {
      expect(findPropertyInconsistencies({ ...base, buildingArea: null, floorCount: null })).toEqual(
        [],
      );
    });

    it("中古戸建やマンションが建物項目を持つのは矛盾しない", () => {
      expect(
        findPropertyInconsistencies({
          type: "sale",
          saleKind: "used_mansion",
          builtYearMonth: "2010-03",
          floorCount: 14,
          managementFee: 12000,
        }),
      ).toEqual([]);
    });
  });

  describe("矛盾3: 緯度経度の片方だけ", () => {
    it("緯度だけは矛盾", () => {
      expect(findPropertyInconsistencies({ type: "rent", latitude: "35.1" })).toHaveLength(1);
    });

    it("経度だけは矛盾", () => {
      expect(findPropertyInconsistencies({ type: "rent", longitude: 139.7 })).toHaveLength(1);
    });

    it("両方あるか両方無いなら矛盾なし（0も値として扱う）", () => {
      expect(findPropertyInconsistencies({ type: "rent", latitude: 35.1, longitude: 139.7 })).toEqual(
        [],
      );
      expect(findPropertyInconsistencies({ type: "rent", latitude: 0, longitude: 0 })).toEqual([]);
      expect(findPropertyInconsistencies({ type: "rent", latitude: null, longitude: null })).toEqual(
        [],
      );
    });
  });

  it("複数の矛盾はすべて返す", () => {
    expect(
      findPropertyInconsistencies({ type: "rent", saleKind: "land", buildingArea: 1, latitude: 1 }),
    ).toHaveLength(3);
  });
});
