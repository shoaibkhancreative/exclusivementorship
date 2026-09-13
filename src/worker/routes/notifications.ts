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

notificationRoutes.get("/", async (c) => {
  const user = c.get("user")!;
  const { notifications, unreadCount } = await listNotifications(c.env, user.id);
  return c.json({ notifications: notifications.map(serializeNotification), unreadCount });
});

notificationRoutes.post("/:id/read", async (c) => {
  const user = c.get("user")!;
  const notification = await getNotification(c.env, c.req.param("id"));
  if (!notification || notification.user_id !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }
  await markNotificationRead(c.env, notification.id);
  return c.json({ ok: true });
});

notificationRoutes.post("/read-all", async (c) => {
  const user = c.get("user")!;
  await markAllNotificationsRead(c.env, user.id);
  return c.json({ ok: true });
});
