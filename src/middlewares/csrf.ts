import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors.js";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

const UNSAFE_METHODS = ["POST", "PATCH", "DELETE"];

export const csrfMiddleware: MiddlewareHandler = async (c, next) => {
  if (UNSAFE_METHODS.includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
      throw new AppError(403, "FORBIDDEN_ORIGIN", "許可されていないOriginからのリクエストです");
    }
  }

  await next();
};
