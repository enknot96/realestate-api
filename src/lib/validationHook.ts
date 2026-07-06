import { AppError } from "./errors.js";

type ValidationIssue = { code: string; path: PropertyKey[]; message: string };

export const validationHook = (result: {
  success: boolean;
  error?: { issues: ValidationIssue[] };
}) => {
  if (!result.success) {
    const details = result.error?.issues.map(({ code, path, message }) => ({
      code,
      path,
      message,
    }));
    throw new AppError(422, "VALIDATION_ERROR", "リクエストの形式が不正です", details);
  }
};
