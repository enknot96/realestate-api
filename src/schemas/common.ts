import "../lib/zodOpenapi.js";
import { z } from "zod";

// AppError → errorHandlerが返す統一エラー形式 { error: { code, message, details } } のOpenAPI表現
export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi("ErrorResponse");
