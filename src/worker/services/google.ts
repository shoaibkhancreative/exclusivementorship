import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../lib/config";

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

// `createRemoteJWKSet` fetches Google's public signing keys lazily and caches
// them in-memory per isolate, re-fetching only when a kid it hasn't seen
// shows up (e.g. after Google rotates keys) — so this does NOT do a network
// round trip on every login.
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface GoogleIdentity {
  sub: string;
  email: string;
}

export type GoogleVerifyResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: "invalid_token" | "email_not_verified" | "not_configured" };

/**
 * Verifies a Google Identity Services ID token fully server-side: signature
 * (against Google's live JWKS), issuer, audience, and expiry are all checked
 * by `jwtVerify` itself or explicitly below.
 *
 * CRITICAL: the client only ever sends us this opaque token string — we
 * never trust a client-decoded JWT payload. Signature verification here is
 * what actually proves the identity came from Google and wasn't forged.
 */
export async function verifyGoogleIdToken(env: Env, idToken: string): Promise<GoogleVerifyResult> {
  if (!env.GOOGLE_CLIENT_ID) return { ok: false, reason: "not_configured" };

  try {
    const { payload } = await jwtVerify(idToken, googleJwks, {
      audience: env.GOOGLE_CLIENT_ID
    });

    if (typeof payload.iss !== "string" || !GOOGLE_ISSUERS.has(payload.iss)) {
      return { ok: false, reason: "invalid_token" };
    }
    // Google can issue tokens for accounts with an unverified email (rare,
    // e.g. some Workspace edge cases). Refuse those rather than creating a
    // course account nobody can actually prove ownership of.
    if (payload.email_verified !== true) {
      return { ok: false, reason: "email_not_verified" };
    }
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return { ok: false, reason: "invalid_token" };
    }

    return { ok: true, identity: { sub: payload.sub, email: payload.email.toLowerCase().trim() } };
  } catch {
    // jwtVerify throws on bad signature, expired token, wrong audience, malformed JWT, etc.
    return { ok: false, reason: "invalid_token" };
  }
}
