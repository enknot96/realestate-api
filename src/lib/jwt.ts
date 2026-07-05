import { sign, verify } from "hono/jwt";
import { randomBytes, createHash } from "node:crypto";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15分

export type AccessTokenPayload = {
  agentId: number;
  role: "agent" | "admin";
};

// ログイン成功時に呼ぶ / agentIdとroleを含んだJWTを発行（15分で失効）
export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");

  return sign(
    {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
    },
    secret,
  );
}

// 認証ミドルウェアで呼ぶ
// JWTの署名を検証し、正しければ中身（agentId/role）を返す / 改ざんされていたり期限切れなら例外を投げる
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");

  const payload = await verify(token, secret, "HS256");
  return payload as unknown as AccessTokenPayload;
}

// ログイン/リフレッシュ時に呼ぶ
// ランダムな64文字（32バイト）の文字列を生成する / これが実際にCookieに入る値
// リフレッシュトークンの唯一の役割は、
// 「アクセストークンが切れたときに、パスワードを再入力させずに新しいアクセストークンを発行してもらうための、専用の交換チケット」
export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

// refresh_tokens.token_hashに保存する値を作る
// リフレッシュトークンの生の値はDBに保存しない（DBが漏洩しても使えないようにするため、SHA-256でハッシュ化してから保存する）
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
