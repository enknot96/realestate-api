// Vercel Node.jsランタイム用のエントリーポイント。
// `hono/vercel`はEdgeランタイム用（Web標準Responseを返す）なのでここでは使えない。
// Node.jsランタイムは(req, res)形式のハンドラーを要求するため、
// @hono/node-serverのgetRequestListenerでHonoアプリ（fetch型）を変換して渡す
// （Edgeを使わない理由: bcryptがネイティブモジュールのためEdgeでは動かない）
import { getRequestListener } from "@hono/node-server";
import { app } from "../src/app.js";

// Vercel側の自動ボディパースを無効化し、リクエストボディを素のストリームのままHonoに渡す
export const config = {
  api: {
    bodyParser: false,
  },
};

export default getRequestListener(app.fetch);
