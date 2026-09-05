import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { mapNowPaymentsStatus, verifyNowPaymentsSignature, PAID_STATUSES } from "../src/worker/services/nowpayments";
import { createTestEnv } from "./testEnv";
import type { Env } from "../src/worker/lib/config";

describe("mapNowPaymentsStatus", () => {
  it("maps known NOWPayments statuses to our internal vocabulary", () => {
    expect(mapNowPaymentsStatus("waiting")).toBe("waiting");
    expect(mapNowPaymentsStatus("confirming")).toBe("confirming");
    expect(mapNowPaymentsStatus("sending")).toBe("confirming");
    expect(mapNowPaymentsStatus("confirmed")).toBe("confirmed");
    expect(mapNowPaymentsStatus("finished")).toBe("finished");
    expect(mapNowPaymentsStatus("failed")).toBe("failed");
    expect(mapNowPaymentsStatus("expired")).toBe("expired");
  });

  it("treats unknown statuses conservatively as waiting rather than paid", () => {
    expect(mapNowPaymentsStatus("some_new_status_we_dont_know")).toBe("waiting");
  });

  it("only 'confirmed' and 'finished' count as PAID_STATUSES", () => {
    expect(PAID_STATUSES.has("confirmed")).toBe(true);
    expect(PAID_STATUSES.has("finished")).toBe(true);
    expect(PAID_STATUSES.has("waiting")).toBe(false);
    expect(PAID_STATUSES.has("failed")).toBe(false);
  });
});

/**
 * Mirrors NOWPayments' own IPN signing: HMAC-SHA512 over the JSON-stringified
 * payload with keys sorted alphabetically. Since our test payload's keys are
 * already inserted in alphabetical order, JSON.stringify(payload) already
 * matches the "sorted" form our implementation independently computes.
 */
function signPayload(secret: string, payload: Record<string, unknown>): string {
  return createHmac("sha512", secret).update(JSON.stringify(payload)).digest("hex");
}

describe("verifyNowPaymentsSignature", () => {
  let env: Env;
  const payload = { order_id: "order-123", payment_id: "np-999", payment_status: "finished" };

  beforeEach(async () => {
    env = await createTestEnv({ NOWPAYMENTS_IPN_SECRET: "test-ipn-secret" });
  });

  it("accepts a correctly signed payload", async () => {
    const sig = signPayload("test-ipn-secret", payload);
    const valid = await verifyNowPaymentsSignature(env, payload, sig);
    expect(valid).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const sig = signPayload("wrong-secret", payload);
    const valid = await verifyNowPaymentsSignature(env, payload, sig);
    expect(valid).toBe(false);
  });

  it("rejects a tampered payload (amount/status changed after signing)", async () => {
    const sig = signPayload("test-ipn-secret", payload);
    const tampered = { ...payload, payment_status: "confirmed" };
    const valid = await verifyNowPaymentsSignature(env, tampered, sig);
    expect(valid).toBe(false);
  });

  it("rejects a missing signature header", async () => {
    const valid = await verifyNowPaymentsSignature(env, payload, null);
    expect(valid).toBe(false);
  });

  it("rejects when IPN secret is not configured, rather than allowing through", async () => {
    const noSecretEnv = await createTestEnv({ NOWPAYMENTS_IPN_SECRET: undefined });
    const sig = signPayload("test-ipn-secret", payload);
    const valid = await verifyNowPaymentsSignature(noSecretEnv, payload, sig);
    expect(valid).toBe(false);
  });

  it("never throws on a malformed/malicious payload", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(verifyNowPaymentsSignature(env, circular, "some-sig")).resolves.toBe(false);
  });
});
