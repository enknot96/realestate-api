import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { errorHandler } from "./middlewares/errorHandler.js";
import { csrfMiddleware } from "./middlewares/csrf.js";
import { authRoutes } from "./routes/auth.js";

const app = new Hono();

app.onError(errorHandler);
app.use("*", csrfMiddleware);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRoutes);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server listening on http://localhost:${info.port}`);
});
