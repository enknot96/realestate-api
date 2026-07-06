import { AppError } from "../lib/errors.js";
import * as propertyRepository from "../repositories/propertyRepository.js";
import type { PropertyListQuery } from "../schemas/property.js";

type Requester = { agentId: number; role: "agent" | "admin" } | null;

function resolveVisibility(requester: Requester): propertyRepository.Visibility {
  if (!requester) return { kind: "public" };
  if (requester.role === "admin") return { kind: "admin" };
  return { kind: "agent", agentId: requester.agentId };
}

export async function list(query: PropertyListQuery, requester: Requester) {
  const visibility = resolveVisibility(requester);

  const { rows, total } = await propertyRepository.findMany({
    type: query.type,
    // 未認証の場合、statusパラメータは可視性ルールに上書きされるため無視する
    status: visibility.kind === "public" ? undefined : query.status,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    limit: query.limit,
    offset: query.offset,
    visibility,
  });

  return { properties: rows, total, limit: query.limit, offset: query.offset };
}

export async function getById(id: number, requester: Requester) {
  const property = await propertyRepository.findById(id);

  if (!property) {
    throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
  }

  const isVisible =
    property.status === "published" ||
    requester?.role === "admin" ||
    requester?.agentId === property.agentId;

  if (!isVisible) {
    throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
  }

  return property;
}
