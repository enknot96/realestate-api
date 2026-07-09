import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { AppError } from "../lib/errors.js";

const WINDOW_MS = 60 * 1000; // 1分
const MAX_REQUESTS = 5; // 1分あたり5回まで

type RateLimitEntry = { count: number; resetAt: number };

const requestCounts = new Map<string, RateLimitEntry>();

function resolveClientIp(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return getConnInfo(c).remote.address ?? "unknown";
}

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = resolveClientIp(c);
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || entry.resetAt <= now) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
    if (entry.count > MAX_REQUESTS) {
      throw new AppError(429, "TOO_MANY_REQUESTS", "しばらく時間をおいてから再度お試しください");
    }
  }

  await next();
};
