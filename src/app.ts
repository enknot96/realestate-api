import { Hono } from "hono";
import { errorHandler } from "./middlewares/errorHandler.js";
import { csrfMiddleware } from "./middlewares/csrf.js";
import { authRoutes } from "./routes/auth.js";
import { propertyRoutes } from "./routes/properties.js";
import { inquiryRoutes } from "./routes/inquiries.js";
import { viewingRoutes } from "./routes/viewings.js";

export const app = new Hono();

app.onError(errorHandler);
app.use("*", csrfMiddleware);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRoutes);
app.route("/properties", propertyRoutes);
app.route("/inquiries", inquiryRoutes);
app.route("/viewings", viewingRoutes);
