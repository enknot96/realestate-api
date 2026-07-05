import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAccessToken, generateRefreshToken, hashRefreshToken } from "../lib/jwt.js";
import { AppError } from "../lib/errors.js";
import * as agentRepository from "../repositories/agentRepository.js";
import * as refreshTokenRepository from "../repositories/refreshTokenRepository.js";
import type { RegisterInput, LoginInput } from "../schemas/auth.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

export async function register(input: RegisterInput) {
  const existing = await agentRepository.findByEmail(input.email);
  if (existing) {
    throw new AppError(409, "EMAIL_ALREADY_EXISTS", "このメールアドレスは既に登録されています");
  }

  const passwordHash = await hashPassword(input.password);
  return agentRepository.create({
    name: input.name,
    email: input.email,
    passwordHash,
  });
}

async function issueTokens(agent: { id: number; role: "agent" | "admin" }) {
  const accessToken = await signAccessToken({
    agentId: agent.id,
    role: agent.role,
  });

  const rawRefreshToken = generateRefreshToken();
  await refreshTokenRepository.create({
    agentId: agent.id,
    tokenHash: hashRefreshToken(rawRefreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

export async function login(input: LoginInput) {
  const agent = await agentRepository.findByEmail(input.email);
  if (!agent) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "メールアドレスまたはパスワードが正しくありません",
    );
  }

  const isValid = await verifyPassword(input.password, agent.passwordHash);
  if (!isValid) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "メールアドレスまたはパスワードが正しくありません",
    );
  }

  return issueTokens(agent);
}

export async function refresh(rawRefreshToken: string) {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const stored = await refreshTokenRepository.findByTokenHash(tokenHash);

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "リフレッシュトークンが無効です");
  }

  await refreshTokenRepository.revoke(stored.id);

  const agent = await agentRepository.findById(stored.agentId);
  if (!agent) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "リフレッシュトークンが無効です");
  }

  return issueTokens(agent);
}

export async function logout(rawRefreshToken: string) {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const stored = await refreshTokenRepository.findByTokenHash(tokenHash);
  if (stored && !stored.revokedAt) {
    await refreshTokenRepository.revoke(stored.id);
  }
}
