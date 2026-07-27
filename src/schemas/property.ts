import "../lib/zodOpenapi.js";
import { z } from "zod";

export const propertyListQuerySchema = z.object({
  type: z.enum(["rent", "sale"]).optional(),
  status: z.enum(["draft", "published", "contracted", "closed"]).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  layout: z.string().min(1).optional(),
  keyword: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type PropertyListQuery = z.infer<typeof propertyListQuerySchema>;

export const propertyCreateSchema = z.object({
  type: z.enum(["rent", "sale"]),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  price: z.number().int().positive(),
  layout: z.string().min(1).optional(),
  area: z.number().positive().optional(),
  imageUrl: z.string().url().optional(),
  address: z.string().min(1),
});

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
