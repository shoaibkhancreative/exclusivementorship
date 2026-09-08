import type { Context, Next } from "hono";
import type { Env } from "../lib/config";
import { readCookie } from "../auth";
import { resolveAdminSession } from "../authAdmin";
import { ADMIN_SESSION_COOKIE_NAME } from "../lib/config";
import type { AdminRow } from "../db";

export type AdminVariables = {
  admin: AdminRow | null;
};

/** Resolves the ADMIN session cookie (never the student cookie) into `c.get('admin')`. */
export async function adminSessionMiddleware(
  c: Context<{ Bindings: Env; Variables: AdminVariables }>,
  next: Next
) {
  const token = readCookie(c.req.header("cookie") ?? null, ADMIN_SESSION_COOKIE_NAME);
  const admin = await resolveAdminSession(c.env, token);
  c.set("admin", admin);
  await next();
}

/** Guard for every admin-only route except login/me. */
export async function requireAdmin(
  c: Context<{ Bindings: Env; Variables: AdminVariables }>,
  next: Next
) {
  const admin = c.get("admin");
  if (!admin) {
    return c.json({ error: "unauthorized", message: "Please log in to the admin panel." }, 401);
  }
  await next();
}
