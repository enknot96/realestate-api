import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { optionalAuthMiddleware, type AuthVariables } from "../middlewares/auth.js";
import { propertyListQuerySchema } from "../schemas/property.js";
import * as propertyService from "../services/propertyService.js";
import { validationHook } from "../lib/validationHook.js";
import { AppError } from "../lib/errors.js";

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
