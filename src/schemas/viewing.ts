import { z } from "zod";

export const viewingCreateSchema = z.object({
  scheduledAt: z.coerce.date().refine((date) => date.getTime() > Date.now(), {
    message: "scheduledAtは未来日時を指定してください",
  }),
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
