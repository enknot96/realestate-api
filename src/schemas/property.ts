import { z } from "zod";

export const propertyListQuerySchema = z.object({
  type: z.enum(["rent", "sale"]).optional(),
  status: z.enum(["draft", "published", "contracted", "closed"]).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
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
