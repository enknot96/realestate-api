import type { MiddlewareHandler } from "hono";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt.js";
import { AppError } from "../lib/errors.js";

export type AuthVariables = {
  agent?: AccessTokenPayload;
};

export const authMiddleware: MiddlewareHandler<{
  Variables: AuthVariables;
}> = async (c, next) => {
  // クライアントが送るHTTPリクエストのヘッダー
  // GET /properties HTTP/1.1
  // Authorization: Bearer eyJhbGc...（アクセストークン）
  // Content-Type: application/json
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHORIZED", "認証が必要です");
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    // ログイン成功時に signAccessToken({...})で発行したJWTのペイロードが payload に入る
    // つまり：payload = { agentId: 123, role: "agent", exp: 1783xxxxxx }
    const payload = await verifyAccessToken(token);
    // c.set で保存することで、後続のハンドラーで c.get("agent")と書けば、
    // 再度トークンを検証し直さずにその情報を使える、という「バケツリレー」の仕組み
    // "agent" はラベル / Contextの中に ↓ こういうものが1つ増える
    // { agent: { agentId: 123, role: "agent", exp: 1783xxxxxx } }
    c.set("agent", payload);
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "トークンが無効です");
  }

  await next();
};

export const optionalAuthMiddleware: MiddlewareHandler<{
  Variables: AuthVariables;
}> = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    try {
      const payload = await verifyAccessToken(token);
      c.set("agent", payload);
    } catch {
      // 無効なトークンは無視し、未認証として扱う
    }
  }

  await next();
};
