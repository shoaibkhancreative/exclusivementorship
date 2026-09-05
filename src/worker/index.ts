import { Hono } from "hono";
import type { Env } from "./lib/config";
import type { AppVariables } from "./middleware/session";
import { sessionMiddleware } from "./middleware/session";
import { corsPolicy, securityHeaders } from "./middleware/security";
import { authRoutes } from "./routes/auth";
import { lessonRoutes } from "./routes/lessons";
import { paymentRoutes } from "./routes/payments";
import { webhookRoutes } from "./routes/webhooks";
import { telegramRoutes } from "./routes/telegram";
import { configRoutes } from "./routes/config";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("*", securityHeaders);
app.use("/api/*", corsPolicy);
app.use("/api/*", sessionMiddleware);

app.route("/api/auth", authRoutes);
app.route("/api/lessons", lessonRoutes);
app.route("/api/payments", paymentRoutes);
app.route("/api/webhooks", webhookRoutes);
app.route("/api/telegram", telegramRoutes);
app.route("/api/config", configRoutes);

app.get("/api/health", (c) => c.json({ ok: true }));

app.onError((err, c) => {
  // Never leak stack traces to the client.
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  return c.json({ error: "internal_error", message: "Something went wrong. Please try again." }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found" }, 404);
  }
  // Non-API 404s fall through to the SPA's static assets/router.
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
