import { Hono } from "hono";
import type { Env } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { requireAuth } from "../middleware/session";
import {
  getNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow
} from "../db";

export const notificationRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Notifications only ever exist for logged-in users (notifications.user_id
// is NOT NULL — see migrations/0008_admin_panel.sql) — there's no guest
// concept here, unlike the support inbox.
notificationRoutes.use("/*", requireAuth);

function serializeNotification(n: NotificationRow) {
  return {
    id: n.id,
    type: n.type,
    message: n.message,
    readAt: n.read_at,
    createdAt: n.created_at
  };
}

/** GET /notifications — the caller's own notifications, newest first, plus their total unread count (see listNotifications for why that count isn't just the page's). */
notificationRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const { notifications, unreadCount } = await listNotifications(c.env, user.id);
  return c.json({ notifications: notifications.map(serializeNotification), unreadCount });
});

/** POST /notifications/:id/read — marks one of the caller's own notifications read. 404s (rather than 403) for a notification that exists but belongs to someone else, so existence isn't leaked. */
notificationRoutes.post("/:id/read", async (c) => {
  const user = c.get("user")!;
  const notification = await getNotification(c.env, c.req.param("id"));
  if (!notification || notification.user_id !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }
  await markNotificationRead(c.env, notification.id);
  return c.json({ ok: true });
});

/** POST /notifications/read-all — marks every one of the caller's own notifications read. */
notificationRoutes.post("/read-all", async (c) => {
  const user = c.get("user")!;
  await markAllNotificationsRead(c.env, user.id);
  return c.json({ ok: true });
});
