import { z } from "zod";

export const inquiryCreateSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(1).optional(),
  message: z.string().min(1),
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
