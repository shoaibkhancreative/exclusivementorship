import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../lib/config";

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface GoogleIdentity {
  sub: string;
  email: string;
}

export type GoogleVerifyResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: "invalid_token" | "email_not_verified" | "not_configured" };

export async function verifyGoogleIdToken(env: Env, idToken: string): Promise<GoogleVerifyResult> {
  if (!env.GOOGLE_CLIENT_ID) return { ok: false, reason: "not_configured" };

  try {
    const { payload } = await jwtVerify(idToken, googleJwks, {
      audience: env.GOOGLE_CLIENT_ID
    });

    if (typeof payload.iss !== "string" || !GOOGLE_ISSUERS.has(payload.iss)) {
      return { ok: false, reason: "invalid_token" };
    }
    if (payload.email_verified !== true) {
      return { ok: false, reason: "email_not_verified" };
    }
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return { ok: false, reason: "invalid_token" };
    }

    return { ok: true, identity: { sub: payload.sub, email: payload.email.toLowerCase().trim() } };
  } catch {
    return { ok: false, reason: "invalid_token" };
  }
}
