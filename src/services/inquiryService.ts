import { db } from "../db/index.js";
import { AppError } from "../lib/errors.js";
import { assertOwnership, type AuthenticatedRequester } from "../lib/authorization.js";
import * as customerRepository from "../repositories/customerRepository.js";
import * as inquiryRepository from "../repositories/inquiryRepository.js";
import * as propertyRepository from "../repositories/propertyRepository.js";
import type {
  InquiryCreateInput,
  InquiryListQuery,
  InquiryUpdateInput,
} from "../schemas/inquiry.js";

type InquiryStatus = "new" | "in_progress" | "done";

const ALLOWED_TRANSITIONS: Record<InquiryStatus, InquiryStatus[]> = {
  new: ["in_progress", "done"],
  in_progress: ["done"],
  done: [],
};

function assertValidTransition(from: InquiryStatus, to: InquiryStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      409,
      "INVALID_STATUS_TRANSITION",
      `${from}から${to}への状態変更は許可されていません`,
    );
  }
}

export async function create(propertyId: number, input: InquiryCreateInput) {
  const property = await propertyRepository.findById(propertyId);

  if (!property || property.status !== "published") {
    throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
  }

  return db.transaction(async (tx) => {
    const customer = await customerRepository.upsertByEmail(tx, {
      name: input.name,
      email: input.email,
      phone: input.phone,
    });

    return inquiryRepository.create(tx, {
      propertyId,
      customerId: customer.id,
      message: input.message,
    });
  });
}

export async function listByProperty(
  propertyId: number,
  query: InquiryListQuery,
  requester: AuthenticatedRequester,
) {
  const property = await propertyRepository.findById(propertyId);
  if (!property) {
    throw new AppError(404, "NOT_FOUND", "物件が見つかりません");
  }

  assertOwnership(property, requester);

  const { rows, total } = await inquiryRepository.findByPropertyId(propertyId, {
    limit: query.limit,
    offset: query.offset,
  });

  return { inquiries: rows, total, limit: query.limit, offset: query.offset };
}

export async function updateStatus(
  id: number,
  input: InquiryUpdateInput,
  requester: AuthenticatedRequester,
) {
  const inquiry = await inquiryRepository.findById(id);
  if (!inquiry) {
    throw new AppError(404, "NOT_FOUND", "問い合わせが見つかりません");
  }

  const property = await propertyRepository.findById(inquiry.propertyId);
  if (!property) {
    throw new AppError(404, "NOT_FOUND", "問い合わせが見つかりません");
  }

  assertOwnership(property, requester);

  if (input.status !== inquiry.status) {
    assertValidTransition(inquiry.status, input.status);
  }

  return inquiryRepository.updateStatus(db, id, input.status);
}
