import { db } from "../db/index.js";
import { AppError } from "../lib/errors.js";
import { assertOwnership, type AuthenticatedRequester } from "../lib/authorization.js";
import * as inquiryRepository from "../repositories/inquiryRepository.js";
import * as propertyRepository from "../repositories/propertyRepository.js";
import * as viewingRepository from "../repositories/viewingRepository.js";
import type {
  ViewingCreateInput,
  ViewingListQuery,
  ViewingUpdateInput,
} from "../schemas/viewing.js";

type ViewingStatus = "scheduled" | "completed" | "cancelled";

const ALLOWED_TRANSITIONS: Record<ViewingStatus, ViewingStatus[]> = {
  scheduled: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function assertValidTransition(from: ViewingStatus, to: ViewingStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      409,
      "INVALID_STATUS_TRANSITION",
      `${from}から${to}への状態変更は許可されていません`,
    );
  }
}

export async function create(
  inquiryId: number,
  input: ViewingCreateInput,
  requester: AuthenticatedRequester,
) {
  const inquiry = await inquiryRepository.findById(inquiryId);
  if (!inquiry) {
    throw new AppError(404, "NOT_FOUND", "問い合わせが見つかりません");
  }

  const property = await propertyRepository.findById(inquiry.propertyId);
  if (!property) {
    throw new AppError(404, "NOT_FOUND", "問い合わせが見つかりません");
  }

  assertOwnership(property, requester);

  if (property.status !== "published") {
    throw new AppError(
      409,
      "INVALID_STATUS_TRANSITION",
      "公開中の物件以外には内見予約を作成できません",
    );
  }
  return db.transaction(async (tx) => {
    const viewing = await viewingRepository.create(tx, {
      inquiryId,
      propertyId: property.id,
      scheduledAt: input.scheduledAt,
    });

    await inquiryRepository.updateStatus(tx, inquiryId, "in_progress");

    return viewing;
  });
}

export async function updateStatus(
  id: number,
  input: ViewingUpdateInput,
  requester: AuthenticatedRequester,
) {
  const viewing = await viewingRepository.findById(id);
  if (!viewing) {
    throw new AppError(404, "NOT_FOUND", "内見予約が見つかりません");
  }

  const property = await propertyRepository.findById(viewing.propertyId);
  if (!property) {
    throw new AppError(404, "NOT_FOUND", "内見予約が見つかりません");
  }

  assertOwnership(property, requester);

  if (input.status !== viewing.status) {
    assertValidTransition(viewing.status, input.status);
  }

  return viewingRepository.updateStatus(db, id, input.status);
}

export async function list(query: ViewingListQuery, requester: AuthenticatedRequester) {
  const visibility: viewingRepository.ViewingVisibility =
    requester.role === "admin" ? { kind: "admin" } : { kind: "agent", agentId: requester.agentId };

  const { rows, total } = await viewingRepository.findMany({
    status: query.status,
    propertyId: query.propertyId,
    scheduledAtFrom: query.scheduledAtFrom,
    scheduledAtTo: query.scheduledAtTo,
    limit: query.limit,
    offset: query.offset,
    visibility,
  });

  return { viewings: rows, total, limit: query.limit, offset: query.offset };
}
