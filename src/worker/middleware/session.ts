import type { Context, Next } from "hono";
import type { Env } from "../lib/config";
import { readCookie, resolveSession } from "../auth";
import { SESSION_COOKIE_NAME } from "../lib/config";
import type { UserRow } from "../db";

export type AppVariables = {
  user: UserRow | null;
};

/** Resolves the session cookie (if any) into `c.get('user')`. Never blocks the request. */
export async function sessionMiddleware(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  next: Next
) {
  const token = readCookie(c.req.header("cookie") ?? null, SESSION_COOKIE_NAME);
  const user = await resolveSession(c.env, token);
  c.set("user", user);
  await next();
}

/** Guard for routes that require an authenticated user. */
export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  next: Next
) {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "unauthorized", message: "Please log in to continue." }, 401);
  }
  await next();
}

/** Guard for routes that require a confirmed-paid user. */
export async function requirePaid(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  next: Next
) {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "unauthorized", message: "Please log in to continue." }, 401);
  }
  if (user.course_status !== "paid") {
    return c.json({ error: "payment_required", message: "This requires the Exclusive Mentorship enrollment." }, 402);
  }
  await next();
}
