import "../lib/zodOpenapi.js";
import { z } from "zod";

// 一度に確認できる期間の上限（日数）。無制限にするとスロット計算とレスポンスが際限なく膨らむため
export const MAX_AVAILABILITY_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// z.iso.date() = "YYYY-MM-DD"形式かつ実在する日付（2026-02-31などは弾く）
export const availabilityQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  // ISO形式の日付文字列は辞書順=時系列順なので、文字列比較で前後関係を判定できる
  .refine((query) => query.from <= query.to, {
    message: "fromはto以前の日付を指定してください",
    path: ["from"],
  })
  .refine(
    (query) => (Date.parse(query.to) - Date.parse(query.from)) / DAY_MS < MAX_AVAILABILITY_DAYS,
    {
      message: `期間は最大${MAX_AVAILABILITY_DAYS}日間までです`,
      path: ["to"],
    },
  );

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

// ── 以下はレスポンス用（OpenAPIドキュメント生成にのみ使う） ──

export const availabilitySlotSchema = z
  .object({
    startAt: z.string().openapi({ example: "2026-07-20T10:00:00+09:00" }),
    available: z.boolean(),
  })
  .openapi("AvailabilitySlot");

export const availabilityDaySchema = z
  .object({
    date: z.string().openapi({ example: "2026-07-20" }),
    slots: z.array(availabilitySlotSchema),
  })
  .openapi("AvailabilityDay");

export const availabilityResponseSchema = z
  .object({
    propertyId: z.number().int().openapi({ example: 1 }),
    days: z.array(availabilityDaySchema),
  })
  .openapi("AvailabilityResponse");
