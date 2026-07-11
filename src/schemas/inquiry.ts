import "../lib/zodOpenapi.js";
import { z } from "zod";

export const inquiryCreateSchema = z.object({
  name: z.string().min(1).openapi({ example: "山田太郎" }),
  email: z.email().openapi({ example: "yamada@example.com" }),
  phone: z.string().min(1).optional().openapi({ example: "090-1234-5678" }),
  message: z.string().min(1).openapi({ example: "内見を希望します" }),
});

export type InquiryCreateInput = z.infer<typeof inquiryCreateSchema>;

export const inquiryUpdateSchema = z.object({
  status: z.enum(["new", "in_progress", "done"]),
});

export type InquiryUpdateInput = z.infer<typeof inquiryUpdateSchema>;

export const inquiryListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type InquiryListQuery = z.infer<typeof inquiryListQuerySchema>;

export const inquirySchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    propertyId: z.number().int().openapi({ example: 1 }),
    customerId: z.number().int().openapi({ example: 1 }),
    message: z.string(),
    status: z.enum(["new", "in_progress", "done"]),
    createdAt: z.string().openapi({ example: "2026-07-11T00:00:00.000Z" }),
    updatedAt: z.string().openapi({ example: "2026-07-11T00:00:00.000Z" }),
  })
  .openapi("Inquiry");

export const inquiryListResponseSchema = z
  .object({
    inquiries: z.array(inquirySchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi("InquiryListResponse");
