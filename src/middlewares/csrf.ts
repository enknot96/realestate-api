import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors.js";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

// このミドルウェアは、リフレッシュトークン（httpOnly Cookie）が自動送信されるルートにのみ適用する。
// Cookieはブラウザが勝手に付与するため、悪意あるサイトからの偽リクエストでも本物として届いてしまう。
// それを「ブラウザが自動付与し偽装できないOriginヘッダー」の検証で防ぐのがここの役割。
// 適用箇所はsrc/app.tsを参照
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
