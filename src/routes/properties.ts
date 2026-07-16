import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, optionalAuthMiddleware, type AuthVariables } from "../middlewares/auth.js";
import {
  propertyCreateSchema,
  propertyListQuerySchema,
  propertyUpdateSchema,
} from "../schemas/property.js";
import * as propertyService from "../services/propertyService.js";
import { validationHook } from "../lib/validationHook.js";
import { AppError } from "../lib/errors.js";
import { rateLimitMiddleware } from "../middlewares/rateLimit.js";
import { inquiryCreateSchema, inquiryListQuerySchema } from "../schemas/inquiry.js";
import * as inquiryService from "../services/inquiryService.js";
import { availabilityQuerySchema } from "../schemas/availability.js";
import * as availabilityService from "../services/availabilityService.js";

export const propertyRoutes = new Hono<{ Variables: AuthVariables }>();

propertyRoutes.get(
  "/",
  optionalAuthMiddleware,
  // "query" = 検証対象は「URLのクエリパラメータ」 / URLの?以降の部分
  zValidator("query", propertyListQuerySchema, validationHook),
  async (c) => {
    // query = propertyListQuerySchemaで定義した形の、検証済み・型付けされたオブジェクトが入る
    const query = c.req.valid("query");
    // optionalAuthMiddlewareの中でc.set("agent", payload)と保存しておいた値を取り出す操作
    const agent = c.get("agent");
    const requester = agent ? { agentId: agent.agentId, role: agent.role } : null;

    const result = await propertyService.list(query, requester);
    return c.json(result);
  },
);

// 内見の空き枠確認（公開・認証不要）。⑥AIエージェントのcheckViewingAvailabilityツールが利用する
propertyRoutes.get(
  "/:id/availability",
  optionalAuthMiddleware,
  zValidator("query", availabilityQuerySchema, validationHook),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
    }

    const query = c.req.valid("query");
    const agent = c.get("agent");
    const requester = agent ? { agentId: agent.agentId, role: agent.role } : null;

    const result = await availabilityService.getAvailability(id, query, requester);
    return c.json(result);
  },
);

propertyRoutes.get("/:id", optionalAuthMiddleware, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
  }

  const agent = c.get("agent");
  const requester = agent ? { agentId: agent.agentId, role: agent.role } : null;

  const property = await propertyService.getById(id, requester);
  return c.json(property);
});

propertyRoutes.post(
  "/",
  authMiddleware,
  zValidator("json", propertyCreateSchema, validationHook),
  async (c) => {
    const body = c.req.valid("json");
    const agent = c.get("agent");
    if (!agent) {
      throw new AppError(401, "UNAUTHORIZED", "認証が必要です");
    }

    const property = await propertyService.create(body, {
      agentId: agent.agentId,
      role: agent.role,
    });

    return c.json(property, 201);
  },
);

propertyRoutes.patch(
  "/:id",
  authMiddleware,
  zValidator("json", propertyUpdateSchema, validationHook),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
    }

    const body = c.req.valid("json");
    const agent = c.get("agent");
    if (!agent) {
      throw new AppError(401, "UNAUTHORIZED", "認証が必要です");
    }

    const property = await propertyService.update(id, body, {
      agentId: agent.agentId,
      role: agent.role,
    });

    return c.json(property);
  },
);

propertyRoutes.delete("/:id", authMiddleware, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
  }

  const agent = c.get("agent");
  if (!agent) {
    throw new AppError(401, "UNAUTHORIZED", "認証が必要です");
  }

  const property = await propertyService.remove(id, {
    agentId: agent.agentId,
    role: agent.role,
  });

  return c.json(property);
});

propertyRoutes.get(
  "/:id/inquiries",
  authMiddleware,
  zValidator("query", inquiryListQuerySchema, validationHook),
  async (c) => {
    const propertyId = Number(c.req.param("id"));
    if (!Number.isInteger(propertyId)) {
      throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
    }

    const query = c.req.valid("query");
    const agent = c.get("agent");
    if (!agent) {
      throw new AppError(401, "UNAUTHORIZED", "認証が必要です");
    }

    const result = await inquiryService.listByProperty(propertyId, query, {
      agentId: agent.agentId,
      role: agent.role,
    });

    return c.json(result);
  },
);

propertyRoutes.post(
  "/:id/inquiries",
  rateLimitMiddleware,
  zValidator("json", inquiryCreateSchema, validationHook),
  async (c) => {
    const propertyId = Number(c.req.param("id"));
    if (!Number.isInteger(propertyId)) {
      throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
    }

    const body = c.req.valid("json");
    const inquiry = await inquiryService.create(propertyId, body);

    return c.json(inquiry, 201);
  },
);
