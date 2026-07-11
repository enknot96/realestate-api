import "./lib/zodOpenapi.js";
import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { errorResponseSchema } from "./schemas/common.js";
import {
  loginSchema,
  registerSchema,
  registerResponseSchema,
  accessTokenResponseSchema,
} from "./schemas/auth.js";
import {
  propertyCreateSchema,
  propertyListQuerySchema,
  propertyUpdateSchema,
  propertySchema,
  propertyListResponseSchema,
} from "./schemas/property.js";
import {
  inquiryCreateSchema,
  inquiryListQuerySchema,
  inquiryUpdateSchema,
  inquirySchema,
  inquiryListResponseSchema,
} from "./schemas/inquiry.js";
import {
  viewingCreateSchema,
  viewingListQuerySchema,
  viewingUpdateSchema,
  viewingSchema,
  viewingListResponseSchema,
} from "./schemas/viewing.js";

const registry = new OpenAPIRegistry();

// authMiddlewareが要求する `Authorization: Bearer <accessToken>` を表す
const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

const idParam = z.object({
  id: z.coerce.number().int().openapi({ param: { name: "id", in: "path" }, example: 1 }),
});

const jsonContent = (schema: z.ZodTypeAny) => ({
  content: { "application/json": { schema } },
});

// descriptionはSwagger UI上の説明文、exampleは実際にそのエンドポイントが返すcode/messageと一致させる
const errorResponse = (description: string, example: { code: string; message: string }) => ({
  description,
  content: {
    "application/json": { schema: errorResponseSchema, example: { error: example } },
  },
});

// 複数エンドポイントで文言が完全に共通のもの（authMiddleware/assertOwnership/validationHookの実装通り）
const unauthorizedError = () =>
  errorResponse("認証が必要", { code: "UNAUTHORIZED", message: "認証が必要です" });

const forbiddenError = (description: string) =>
  errorResponse(description, { code: "FORBIDDEN", message: "この操作を行う権限がありません" });

const validationError = () =>
  errorResponse("バリデーションエラー", {
    code: "VALIDATION_ERROR",
    message: "リクエストの形式が不正です",
  });

// ── auth ──────────────────────────────────────────────
registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["auth"],
  summary: "エージェント（担当者）を新規登録する",
  request: { body: { content: { "application/json": { schema: registerSchema } } } },
  responses: {
    201: { description: "登録成功", ...jsonContent(registerResponseSchema) },
    409: errorResponse("メールアドレスが既に登録されている", {
      code: "EMAIL_ALREADY_EXISTS",
      message: "このメールアドレスは既に登録されています",
    }),
    422: validationError(),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["auth"],
  summary: "ログインし、アクセストークンを発行する",
  description:
    "アクセストークンはレスポンスボディで返す。リフレッシュトークンはhttpOnly Cookie（refresh_token）にセットされる",
  request: { body: { content: { "application/json": { schema: loginSchema } } } },
  responses: {
    200: { description: "ログイン成功", ...jsonContent(accessTokenResponseSchema) },
    401: errorResponse("メールアドレスまたはパスワードが正しくない", {
      code: "INVALID_CREDENTIALS",
      message: "メールアドレスまたはパスワードが正しくありません",
    }),
    422: validationError(),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/refresh",
  tags: ["auth"],
  summary: "リフレッシュトークン（Cookie）を使ってアクセストークンを再発行する",
  responses: {
    200: { description: "再発行成功", ...jsonContent(accessTokenResponseSchema) },
    401: errorResponse("リフレッシュトークンが無効・期限切れ・またはCookieが無い", {
      code: "INVALID_REFRESH_TOKEN",
      message: "リフレッシュトークンが無効です",
    }),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["auth"],
  summary: "ログアウトし、リフレッシュトークンを無効化する",
  responses: {
    204: { description: "ログアウト成功（本文なし）" },
  },
});

// ── properties ────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/properties",
  tags: ["properties"],
  summary: "物件一覧を取得する",
  description:
    "未認証: 公開中(published)の物件のみ。エージェント: 自分の物件は全ステータス+他人の公開中物件。管理者: 全件",
  security: [{ [bearerAuth.name]: [] }, {}], // 認証は任意（付ければagent/admin視点、付けなければ未認証視点で可視性が変わる）
  request: { query: propertyListQuerySchema },
  responses: {
    200: { description: "物件一覧", ...jsonContent(propertyListResponseSchema) },
  },
});

registry.registerPath({
  method: "get",
  path: "/properties/{id}",
  tags: ["properties"],
  summary: "物件の詳細を取得する",
  security: [{ [bearerAuth.name]: [] }, {}], // 認証は任意（可視性ルールはGET /propertiesと同様）
  request: { params: idParam },
  responses: {
    200: { description: "物件詳細", ...jsonContent(propertySchema) },
    404: errorResponse("物件が存在しない、または可視性ルールにより非公開", {
      code: "NOT_FOUND",
      message: "物件が見つかりません",
    }),
  },
});

registry.registerPath({
  method: "post",
  path: "/properties",
  tags: ["properties"],
  summary: "物件を新規登録する（要認証）",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: propertyCreateSchema } } } },
  responses: {
    201: { description: "登録成功", ...jsonContent(propertySchema) },
    401: unauthorizedError(),
    422: validationError(),
  },
});

registry.registerPath({
  method: "patch",
  path: "/properties/{id}",
  tags: ["properties"],
  summary: "物件を更新する（所有者のみ）",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: propertyUpdateSchema } } },
  },
  responses: {
    200: { description: "更新成功", ...jsonContent(propertySchema) },
    401: unauthorizedError(),
    403: forbiddenError("他人の物件への操作"),
    404: errorResponse("物件が存在しない", { code: "NOT_FOUND", message: "物件が見つかりません" }),
    409: errorResponse("許可されていない状態遷移", {
      code: "INVALID_STATUS_TRANSITION",
      message: "draftからcontractedへの状態変更は許可されていません",
    }),
    422: validationError(),
  },
});

registry.registerPath({
  method: "delete",
  path: "/properties/{id}",
  tags: ["properties"],
  summary: "物件を削除する（所有者のみ・論理削除でstatusをclosedに）",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "削除成功（closedになった物件を返す）", ...jsonContent(propertySchema) },
    401: unauthorizedError(),
    403: forbiddenError("他人の物件への操作"),
    404: errorResponse("物件が存在しない", { code: "NOT_FOUND", message: "物件が見つかりません" }),
    409: errorResponse("既に削除済み（closed）", {
      code: "INVALID_STATUS_TRANSITION",
      message: "この物件はすでに削除されています",
    }),
  },
});

registry.registerPath({
  method: "get",
  path: "/properties/{id}/inquiries",
  tags: ["properties", "inquiries"],
  summary: "物件に届いた問い合わせ一覧を取得する（所有者のみ）",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam, query: inquiryListQuerySchema },
  responses: {
    200: { description: "問い合わせ一覧", ...jsonContent(inquiryListResponseSchema) },
    401: unauthorizedError(),
    403: forbiddenError("他人の物件への操作"),
    404: errorResponse("物件が存在しない", { code: "NOT_FOUND", message: "物件が見つかりません" }),
  },
});

registry.registerPath({
  method: "post",
  path: "/properties/{id}/inquiries",
  tags: ["properties", "inquiries"],
  summary: "物件に問い合わせを送る（未認証・公開エンドポイント）",
  description: "IPベースで1分あたり5回までのレート制限あり",
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: inquiryCreateSchema } } },
  },
  responses: {
    201: { description: "問い合わせ成功", ...jsonContent(inquirySchema) },
    404: errorResponse("物件が存在しない、または公開中でない", {
      code: "NOT_FOUND",
      message: "物件が見つかりません",
    }),
    422: validationError(),
    429: errorResponse("レート制限超過（IPごとに1分あたり5回まで）", {
      code: "TOO_MANY_REQUESTS",
      message: "しばらく時間をおいてから再度お試しください",
    }),
  },
});

// ── inquiries ─────────────────────────────────────────
registry.registerPath({
  method: "patch",
  path: "/inquiries/{id}",
  tags: ["inquiries"],
  summary: "問い合わせの状態を更新する（所有者のみ）",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: inquiryUpdateSchema } } },
  },
  responses: {
    200: { description: "更新成功", ...jsonContent(inquirySchema) },
    401: unauthorizedError(),
    403: forbiddenError("他人の物件の問い合わせへの操作"),
    404: errorResponse("問い合わせが存在しない", {
      code: "NOT_FOUND",
      message: "問い合わせが見つかりません",
    }),
    409: errorResponse("許可されていない状態遷移", {
      code: "INVALID_STATUS_TRANSITION",
      message: "newからdoneへの状態変更は許可されていません",
    }),
    422: validationError(),
  },
});

registry.registerPath({
  method: "post",
  path: "/inquiries/{id}/viewings",
  tags: ["inquiries", "viewings"],
  summary: "問い合わせに対して内見予約を作成する（所有者のみ）",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: viewingCreateSchema } } },
  },
  responses: {
    201: { description: "作成成功", ...jsonContent(viewingSchema) },
    401: unauthorizedError(),
    403: forbiddenError("他人の物件の問い合わせへの操作"),
    404: errorResponse("問い合わせが存在しない", {
      code: "NOT_FOUND",
      message: "問い合わせが見つかりません",
    }),
    409: errorResponse("公開中でない物件", {
      code: "INVALID_STATUS_TRANSITION",
      message: "公開中の物件以外には内見予約を作成できません",
    }),
    422: validationError(),
  },
});

// ── viewings ──────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/viewings",
  tags: ["viewings"],
  summary: "内見予約一覧を取得する（要認証）",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: viewingListQuerySchema },
  responses: {
    200: { description: "内見予約一覧", ...jsonContent(viewingListResponseSchema) },
    401: unauthorizedError(),
  },
});

registry.registerPath({
  method: "patch",
  path: "/viewings/{id}",
  tags: ["viewings"],
  summary: "内見予約の状態を更新する（所有者のみ）",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: viewingUpdateSchema } } },
  },
  responses: {
    200: { description: "更新成功", ...jsonContent(viewingSchema) },
    401: unauthorizedError(),
    403: forbiddenError("他人の物件の内見予約への操作"),
    404: errorResponse("内見予約が存在しない", {
      code: "NOT_FOUND",
      message: "内見予約が見つかりません",
    }),
    409: errorResponse("許可されていない状態遷移", {
      code: "INVALID_STATUS_TRANSITION",
      message: "completedからcancelledへの状態変更は許可されていません",
    }),
    422: validationError(),
  },
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "不動産業務管理API",
      description:
        "不動産会社の業務（物件・問い合わせ・内見予約）を題材にしたバックエンドAPI。詳細はREADME.mdを参照",
    },
    servers: [{ url: "/" }],
  });
}
