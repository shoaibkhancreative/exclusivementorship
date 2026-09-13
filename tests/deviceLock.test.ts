import { beforeEach, describe, expect, it } from "vitest";
import { createTestEnv } from "./testEnv";
import { issueOtp, verifyOtp } from "../src/worker/auth";
import { checkAndRegisterAppDevice, getAppDeviceInfo, resetAppDevice } from "../src/worker/lib/deviceLock";
import { setUserCourseStatus } from "../src/worker/db";
import type { Env } from "../src/worker/lib/config";

async function makeUser(env: Env, email: string) {
  const code = await issueOtp(env, email);
  const result = await verifyOtp(env, email, code);
  if (!result.ok) throw new Error("expected ok");
  return result.user;
}

describe("app device lock", () => {
  let env: Env;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("never locks free users, regardless of device", async () => {
    const user = await makeUser(env, "free@example.com");

    expect((await checkAndRegisterAppDevice(env, user.id, "free", "device-a")).ok).toBe(true);
    expect((await checkAndRegisterAppDevice(env, user.id, "free", "device-b")).ok).toBe(true);
    expect((await checkAndRegisterAppDevice(env, user.id, "free", "device-c")).ok).toBe(true);

    const info = await getAppDeviceInfo(env, user.id);
    expect(info.locked).toBe(false);
  });

  it("locks a paid user to their first device", async () => {
    const user = await makeUser(env, "paid@example.com");
    await setUserCourseStatus(env, user.id, "paid");

    const first = await checkAndRegisterAppDevice(env, user.id, "paid", "device-a");
    expect(first.ok).toBe(true);

    const sameDeviceAgain = await checkAndRegisterAppDevice(env, user.id, "paid", "device-a");
    expect(sameDeviceAgain.ok).toBe(true);

    const otherDevice = await checkAndRegisterAppDevice(env, user.id, "paid", "device-b");
    expect(otherDevice.ok).toBe(false);
    if (!otherDevice.ok) expect(otherDevice.reason).toBe("device_locked");

    const info = await getAppDeviceInfo(env, user.id);
    expect(info.locked).toBe(true);
    expect(info.resetCount).toBe(0);
  });

  it("lets a new device in after an admin reset, and tracks the reset count", async () => {
    const user = await makeUser(env, "paid2@example.com");
    await setUserCourseStatus(env, user.id, "paid");

    await checkAndRegisterAppDevice(env, user.id, "paid", "device-a");
    const blocked = await checkAndRegisterAppDevice(env, user.id, "paid", "device-b");
    expect(blocked.ok).toBe(false);

    await resetAppDevice(env, user.id, "admin-1");
    let info = await getAppDeviceInfo(env, user.id);
    expect(info.locked).toBe(false);
    expect(info.resetCount).toBe(1);

    const afterReset = await checkAndRegisterAppDevice(env, user.id, "paid", "device-b");
    expect(afterReset.ok).toBe(true);

    const thirdDeviceStillBlocked = await checkAndRegisterAppDevice(env, user.id, "paid", "device-c");
    expect(thirdDeviceStillBlocked.ok).toBe(false);

    await resetAppDevice(env, user.id, "admin-1");
    info = await getAppDeviceInfo(env, user.id);
    expect(info.resetCount).toBe(2);
  });

  it("does not lock a device before the user ever pays, and locks in from then on", async () => {
    const user = await makeUser(env, "upgrades@example.com");

    // Free: any device works.
    await checkAndRegisterAppDevice(env, user.id, "free", "device-a");
    await checkAndRegisterAppDevice(env, user.id, "free", "device-b");

    // Now they pay — the *next* device they log in from becomes the lock.
    await setUserCourseStatus(env, user.id, "paid");
    const locksIn = await checkAndRegisterAppDevice(env, user.id, "paid", "device-c");
    expect(locksIn.ok).toBe(true);

    const otherDevice = await checkAndRegisterAppDevice(env, user.id, "paid", "device-d");
    expect(otherDevice.ok).toBe(false);
  });
});
