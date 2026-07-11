import "../lib/zodOpenapi.js";
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1).openapi({ example: "山田太郎" }),
  email: z.email().openapi({ example: "agent@example.com" }),
  password: z.string().min(8).openapi({ example: "password123" }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().openapi({ example: "agent@example.com" }),
  password: z.string().min(1).openapi({ example: "password123" }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerResponseSchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    name: z.string().openapi({ example: "山田太郎" }),
    email: z.email().openapi({ example: "agent@example.com" }),
  })
  .openapi("RegisterResponse");

// login/refreshで共通。refreshTokenはhttpOnly Cookieで返るためレスポンスボディには含まれない
export const accessTokenResponseSchema = z
  .object({
    accessToken: z.string().openapi({ example: "eyJhbGciOiJIUzI1NiIs..." }),
  })
  .openapi("AccessTokenResponse");
