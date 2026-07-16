import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { errorHandler } from "./middlewares/errorHandler.js";
import { csrfMiddleware } from "./middlewares/csrf.js";
import { authRoutes } from "./routes/auth.js";
import { propertyRoutes } from "./routes/properties.js";
import { inquiryRoutes } from "./routes/inquiries.js";
import { viewingRoutes } from "./routes/viewings.js";
import { generateOpenApiDocument } from "./openapi.js";

export const app = new Hono();

app.onError(errorHandler);

// Origin検証（CSRF対策）はCookieが自動送信されるルートに限定する。
// Bearerトークン必須のルートや公開POSTは、攻撃者が被害者の資格情報を伴って
// クロスサイトから呼ばせることができないためCSRFの脅威モデル外
// （サーバー間通信やcurlのようなOriginヘッダーを送らないクライアントを許容する）
app.use("/auth/refresh", csrfMiddleware);
app.use("/auth/logout", csrfMiddleware);

app.get("/health", (c) => c.json({ status: "ok" }));

// 毎回オブジェクトを生成し直しているが、リクエストのたびに再生成しても問題にならない程度の軽さのため許容
app.get("/openapi.json", (c) => c.json(generateOpenApiDocument()));
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

app.route("/auth", authRoutes);
app.route("/properties", propertyRoutes);
app.route("/inquiries", inquiryRoutes);
app.route("/viewings", viewingRoutes);
