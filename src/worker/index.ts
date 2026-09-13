import { Hono, type Context } from "hono";
import type { Env } from "./lib/config";
import type { AppVariables } from "./middleware/session";
import type { AdminVariables } from "./middleware/adminSession";
import { sessionMiddleware } from "./middleware/session";
import { adminSessionMiddleware } from "./middleware/adminSession";
import { corsPolicy, securityHeaders } from "./middleware/security";
import { authRoutes } from "./routes/auth";
import { lessonRoutes } from "./routes/lessons";
import { paymentRoutes } from "./routes/payments";
import { webhookRoutes } from "./routes/webhooks";
import { configRoutes } from "./routes/config";
import { adminRoutes } from "./routes/admin";
import { supportRoutes } from "./routes/support";
import { adminSupportRoutes } from "./routes/admin-support";
import { notificationRoutes } from "./routes/notifications";
import { runScheduledCleanup, sendAbandonedCheckoutReminders } from "./scheduled";

const app = new Hono<{ Bindings: Env; Variables: AppVariables & AdminVariables }>();

app.use("*", securityHeaders);
app.use("/api/*", corsPolicy);
app.use("/api/admin/*", adminSessionMiddleware);
app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/admin/")) return next();
  return sessionMiddleware(c as unknown as Context<{ Bindings: Env; Variables: AppVariables }>, next);
});

app.route("/api/auth", authRoutes);
app.route("/api/lessons", lessonRoutes);
app.route("/api/payments", paymentRoutes);
app.route("/api/webhooks", webhookRoutes);
app.route("/api/config", configRoutes);
app.route("/api/support", supportRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/admin/support", adminSupportRoutes);

app.get("/api/health", (c) => c.json({ ok: true }));

app.onError((err, c) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  return c.json({ error: "internal_error", message: "Something went wrong. Please try again." }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (event.cron === "*/15 * * * *") {
      ctx.waitUntil(sendAbandonedCheckoutReminders(env));
      return;
    }
    ctx.waitUntil(runScheduledCleanup(env));
  }
};
