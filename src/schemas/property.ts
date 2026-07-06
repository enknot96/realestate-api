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
