import "../lib/zodOpenapi.js";
import { z } from "zod";

const saleKindSchema = z.enum(["land", "new_house", "used_house", "used_mansion"]).openapi({
  description:
    "売買物件の種別。land=売地、new_house=新築戸建、used_house=中古戸建、used_mansion=中古マンション",
});

// 建築年月（YYYY-MM、月は01〜12）
const builtYearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM形式（月は01〜12）で指定してください");

// 売買物件の事実項目（作成・更新で共通。呼び出し側で全て任意にする）
const saleFieldsSchema = z.object({
  saleKind: saleKindSchema,
  landArea: z.number().positive(),
  // 私道負担が無い場合は0を入れる（「不明」と区別するため）
  privateRoadArea: z.number().nonnegative(),
  buildingArea: z.number().positive(),
  builtYearMonth: builtYearMonthSchema,
  nearestStation: z.string().min(1),
  walkMinutes: z.number().int().nonnegative(),
  accessNote: z.string().min(1),
  floorCount: z.number().int().positive(),
  // 地下階（B1=-1など）を表せるよう負の値も許す
  floorNumber: z.number().int(),
  balconyArea: z.number().nonnegative(),
  managementFee: z.number().int().nonnegative(),
  repairReserveFee: z.number().int().nonnegative(),
  managementType: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const propertyListQuerySchema = z.object({
  type: z.enum(["rent", "sale"]).optional(),
  status: z.enum(["draft", "published", "contracted", "closed"]).optional(),
  saleKind: saleKindSchema.optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  layout: z.string().min(1).optional(),
  keyword: z.string().min(1).max(100).optional(),
  // 未指定時はid昇順（既存クライアントの並びを変えないため）。どのsortでも最終的にid昇順で順序を確定する
  sort: z
    .enum(["newest", "price_asc", "price_desc"])
    .optional()
    .openapi({
      description:
        "並び順。newest=新着順（作成日時の降順）、price_asc=価格の安い順、price_desc=価格の高い順。" +
        "未指定時はid昇順。同値の物件は常にid昇順",
    }),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type PropertyListQuery = z.infer<typeof propertyListQuerySchema>;

export const propertyCreateSchema = z
  .object({
    type: z.enum(["rent", "sale"]),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    price: z.number().int().positive(),
    layout: z.string().min(1).optional(),
    // 専有面積（賃貸・マンション用）。土地・戸建では使わない
    area: z.number().positive().optional(),
    imageUrl: z.string().url().optional(),
    address: z.string().min(1),
  })
  .extend(saleFieldsSchema.partial().shape);

export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;

export const propertyUpdateSchema = z
  .object({
    type: z.enum(["rent", "sale"]),
    title: z.string().min(1),
    description: z.string().min(1),
    price: z.number().int().positive(),
    layout: z.string().min(1),
    area: z.number().positive(),
    imageUrl: z.string().url(),
    address: z.string().min(1),
    status: z.enum(["draft", "published", "contracted", "closed"]),
  })
  .extend(saleFieldsSchema.shape)
  .partial() // 全フィールドをoptionalに変換するzodの機能
  // ここまで全部通過した後の、検証済み・型が確定したオブジェクトをdataで受け取り、更にチェックする
  // .refine(検証関数, エラー情報)
  .refine((data) => Object.keys(data).length > 0, {
    message: "更新する項目を1つ以上指定してください",
  });

export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;

// レスポンス用（DBの行がそのままJSONになった形。ここではリクエスト検証は行わずOpenAPIドキュメント生成にのみ使う）
export const propertySchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    agentId: z.number().int().openapi({ example: 1 }),
    type: z.enum(["rent", "sale"]),
    title: z.string().openapi({ example: "渋谷駅徒歩5分 1LDK" }),
    description: z.string().nullable(),
    price: z.number().int().openapi({ example: 150000 }),
    layout: z.string().nullable().openapi({ example: "1LDK" }),
    area: z.string().nullable().openapi({ example: "40.50" }), // drizzleのnumeric型は文字列で返る
    imageUrl: z.string().nullable().openapi({
      example: "https://xxxxx.public.blob.vercel-storage.com/properties/1.jpg",
    }),
    address: z.string().openapi({ example: "東京都渋谷区..." }),
    status: z.enum(["draft", "published", "contracted", "closed"]),
    saleKind: saleKindSchema.nullable().openapi({ example: "used_mansion" }),
    landArea: z.string().nullable().openapi({ example: "120.50" }),
    privateRoadArea: z.string().nullable().openapi({ example: "0.00" }),
    buildingArea: z.string().nullable().openapi({ example: "98.50" }),
    builtYearMonth: z.string().nullable().openapi({ example: "2015-04" }),
    nearestStation: z.string().nullable().openapi({ example: "阿佐ヶ谷" }),
    walkMinutes: z.number().int().nullable().openapi({ example: 6 }),
    accessNote: z.string().nullable().openapi({ example: "八王子駅からバス5分、停歩3分" }),
    floorCount: z.number().int().nullable().openapi({ example: 14 }),
    floorNumber: z.number().int().nullable().openapi({ example: 8 }),
    balconyArea: z.string().nullable().openapi({ example: "9.80" }),
    managementFee: z.number().int().nullable().openapi({ example: 12000 }),
    repairReserveFee: z.number().int().nullable().openapi({ example: 9500 }),
    managementType: z.string().nullable().openapi({ example: "全部委託・日勤" }),
    latitude: z.string().nullable().openapi({ example: "35.704512" }),
    longitude: z.string().nullable().openapi({ example: "139.636789" }),
    createdAt: z.string().openapi({ example: "2026-07-11T00:00:00.000Z" }),
    updatedAt: z.string().openapi({ example: "2026-07-11T00:00:00.000Z" }),
  })
  .openapi("Property");

export const propertyListResponseSchema = z
  .object({
    properties: z.array(propertySchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi("PropertyListResponse");
