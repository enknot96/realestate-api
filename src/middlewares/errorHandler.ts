import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../lib/errors.js";

export const errorHandler: ErrorHandler = (err, c) => {
  // instanceof = 「このオブジェクトは、指定したクラス（またはその継承元）から作られたものか？」を判定する演算子
  // 「投げられたerrが、自分で作ったAppError（またはその一種）かどうか」をチェック
  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      },
      err.statusCode as ContentfulStatusCode,
    );
  }
  console.error(err);

  return c.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
      },
    },
    500,
  );
};
