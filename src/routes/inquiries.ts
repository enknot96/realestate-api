import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, type AuthVariables } from "../middlewares/auth.js";
import { inquiryUpdateSchema } from "../schemas/inquiry.js";
import { viewingCreateSchema } from "../schemas/viewing.js";
import * as inquiryService from "../services/inquiryService.js";
import * as viewingService from "../services/viewingService.js";
import { validationHook } from "../lib/validationHook.js";
import { AppError } from "../lib/errors.js";

export const inquiryRoutes = new Hono<{ Variables: AuthVariables }>();

inquiryRoutes.patch(
  "/:id",
  authMiddleware,
  zValidator("json", inquiryUpdateSchema, validationHook),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      throw new AppError(404, "NOT_FOUND", "問い合わせが見つかりません");
    }

    const body = c.req.valid("json");
    const agent = c.get("agent");
    if (!agent) {
      throw new AppError(401, "UNAUTHORIZED", "認証が必要です");
    }

    const inquiry = await inquiryService.updateStatus(id, body, {
      agentId: agent.agentId,
      role: agent.role,
    });

    return c.json(inquiry);
  },
);

inquiryRoutes.post(
  "/:id/viewings",
  authMiddleware,
  zValidator("json", viewingCreateSchema, validationHook),
  async (c) => {
    const inquiryId = Number(c.req.param("id"));
    if (!Number.isInteger(inquiryId)) {
      throw new AppError(404, "NOT_FOUND", "問い合わせが見つかりません");
    }

    const body = c.req.valid("json");
    const agent = c.get("agent");
    if (!agent) {
      throw new AppError(401, "UNAUTHORIZED", "認証が必要です");
    }

    const viewing = await viewingService.create(inquiryId, body, {
      agentId: agent.agentId,
      role: agent.role,
    });

    return c.json(viewing, 201);
  },
);
