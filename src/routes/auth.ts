import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { registerSchema, loginSchema } from "../schemas/auth.js";
import * as authService from "../services/authService.js";
import { AppError } from "../lib/errors.js";

const REFRESH_TOKEN_COOKIE = "refresh_token";

type ValidationIssue = { code: string; path: PropertyKey[]; message: string };

const validationHook = (result: {
  success: boolean;
  error?: { issues: ValidationIssue[] };
}) => {
  if (!result.success) {
    const details = result.error?.issues.map(({ code, path, message }) => ({
      code,
      path,
      message,
    }));
    throw new AppError(422, "VALIDATION_ERROR", "リクエストの形式が不正です", details);
  }
};

export const authRoutes = new Hono();

authRoutes.post("/register", zValidator("json", registerSchema, validationHook), async (c) => {
  const input = c.req.valid("json");
  const agent = await authService.register(input);
  return c.json({ id: agent.id, name: agent.name, email: agent.email }, 201);
});

// ログインするたびに、毎回新しいアクセストークン・リフレッシュトークンのペアが作られる
authRoutes.post("/login", zValidator("json", loginSchema, validationHook), async (c) => {
  const input = c.req.valid("json");
  const { accessToken, refreshToken } = await authService.login(input);

  setCookie(c, REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "Strict",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return c.json({ accessToken });
});

authRoutes.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, REFRESH_TOKEN_COOKIE);
  if (!refreshToken) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "リフレッシュトークンがありません");
  }

  const tokens = await authService.refresh(refreshToken);

  setCookie(c, REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: "Strict",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return c.json({ accessToken: tokens.accessToken });
});

authRoutes.post("/logout", async (c) => {
  const refreshToken = getCookie(c, REFRESH_TOKEN_COOKIE);
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: "/" });
  return c.body(null, 204);
});
