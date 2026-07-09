import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, type AuthVariables } from "../middlewares/auth.js";
import { viewingListQuerySchema, viewingUpdateSchema } from "../schemas/viewing.js";
import * as viewingService from "../services/viewingService.js";
import { validationHook } from "../lib/validationHook.js";
import { AppError } from "../lib/errors.js";

export const viewingRoutes = new Hono<{ Variables: AuthVariables }>();

viewingRoutes.get(
  "/",
  authMiddleware,
  zValidator("query", viewingListQuerySchema, validationHook),
  async (c) => {
    const query = c.req.valid("query");
    const agent = c.get("agent");
    if (!agent) {
      throw new AppError(401, "UNAUTHORIZED", "認証が必要です");
    }

    const result = await viewingService.list(query, {
      agentId: agent.agentId,
      role: agent.role,
    });

    return c.json(result);
  },
);

viewingRoutes.patch(
  "/:id",
  authMiddleware,
  zValidator("json", viewingUpdateSchema, validationHook),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      throw new AppError(404, "NOT_FOUND", "内見予約が見つかりません");
    }

    const body = c.req.valid("json");
    const agent = c.get("agent");
    if (!agent) {
      throw new AppError(401, "UNAUTHORIZED", "認証が必要です");
    }

    const viewing = await viewingService.updateStatus(id, body, {
      agentId: agent.agentId,
      role: agent.role,
    });

    return c.json(viewing);
  },
);
