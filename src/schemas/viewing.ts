import "../lib/zodOpenapi.js";
import { z } from "zod";

export const viewingCreateSchema = z.object({
  scheduledAt: z.coerce
    .date()
    .refine((date) => date.getTime() > Date.now(), {
      message: "scheduledAtは未来日時を指定してください",
    })
    .openapi({ example: "2026-08-01T10:00:00.000Z" }),
});

export type ViewingCreateInput = z.infer<typeof viewingCreateSchema>;

export const viewingUpdateSchema = z.object({
  status: z.enum(["scheduled", "completed", "cancelled"]),
});

export type ViewingUpdateInput = z.infer<typeof viewingUpdateSchema>;

export const viewingListQuerySchema = z.object({
  status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
  propertyId: z.coerce.number().int().positive().optional(),
  scheduledAtFrom: z.coerce.date().optional(),
  scheduledAtTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type ViewingListQuery = z.infer<typeof viewingListQuerySchema>;

export const viewingSchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    inquiryId: z.number().int().openapi({ example: 1 }),
    propertyId: z.number().int().openapi({ example: 1 }),
    scheduledAt: z.string().openapi({ example: "2026-08-01T10:00:00.000Z" }),
    status: z.enum(["scheduled", "completed", "cancelled"]),
    createdAt: z.string().openapi({ example: "2026-07-11T00:00:00.000Z" }),
    updatedAt: z.string().openapi({ example: "2026-07-11T00:00:00.000Z" }),
  })
  .openapi("Viewing");

export const viewingListResponseSchema = z
  .object({
    viewings: z.array(viewingSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi("ViewingListResponse");
