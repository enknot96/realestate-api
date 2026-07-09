import { db } from "../db/index.js";
import { AppError } from "../lib/errors.js";
import * as propertyRepository from "../repositories/propertyRepository.js";
import * as viewingRepository from "../repositories/viewingRepository.js";
import type {
  PropertyCreateInput,
  PropertyListQuery,
  PropertyUpdateInput,
} from "../schemas/property.js";
import { assertOwnership, type AuthenticatedRequester } from "../lib/authorization.js";

type PropertyStatus = "draft" | "published" | "contracted" | "closed";

type Requester = { agentId: number; role: "agent" | "admin" } | null;

// 記載のない遷移（逆行含む）は許可しない
const ALLOWED_TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  draft: ["published", "closed"],
  published: ["contracted", "closed"],
  contracted: ["closed"],
  closed: [],
};

function resolveVisibility(requester: Requester): propertyRepository.Visibility {
  if (!requester) return { kind: "public" };
  if (requester.role === "admin") return { kind: "admin" };
  return { kind: "agent", agentId: requester.agentId };
}

function assertValidTransition(from: PropertyStatus, to: PropertyStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      409,
      "INVALID_STATUS_TRANSITION",
      `${from}から${to}への状態変更は許可されていません`,
    );
  }
}

// published→contracted/closed の遷移でのみ、内見の一括キャンセルが必要
function needsViewingCancellation(from: PropertyStatus, to: PropertyStatus) {
  return from === "published" && (to === "contracted" || to === "closed");
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

export async function create(input: PropertyCreateInput, requester: AuthenticatedRequester) {
  return propertyRepository.create(db, requester.agentId, input);
}

export async function update(
  id: number,
  input: PropertyUpdateInput,
  requester: AuthenticatedRequester,
) {
  const property = await propertyRepository.findById(id);
  if (!property) {
    throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
  }

  assertOwnership(property, requester);

  if (input.status !== undefined && input.status !== property.status) {
    assertValidTransition(property.status, input.status);

    if (needsViewingCancellation(property.status, input.status)) {
      return db.transaction(async (tx) => {
        const updated = await propertyRepository.update(tx, id, input);
        await viewingRepository.cancelScheduledByPropertyId(tx, id);
        return updated;
      });
    }
  }

  return propertyRepository.update(db, id, input);
}

export async function remove(id: number, requester: AuthenticatedRequester) {
  const property = await propertyRepository.findById(id);
  if (!property) {
    throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
  }

  assertOwnership(property, requester);

  if (property.status === "closed") {
    throw new AppError(409, "INVALID_STATUS_TRANSITION", "この物件はすでに削除されています");
  }

  return update(id, { status: "closed" }, requester);
}
