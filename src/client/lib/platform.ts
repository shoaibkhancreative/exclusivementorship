// Detects whether the site is currently running inside the Capacitor Android
// app shell rather than a regular mobile/desktop browser.
//
// Once the Capacitor app exists it injects `window.Capacitor` into every page
// it loads, and `Capacitor.isNativePlatform()` is the standard way to check
// that from inside the webview. This is the hook the "paid users must use
// the app for video" gate in VideoStage.tsx uses.
export function isRunningInNativeApp(): boolean {
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

// --- Native device identity (Android app only) ------------------------------
//
// Backed by a custom Capacitor plugin, `DeviceIdentity` (see
// android/app/.../DeviceIdentityPlugin.kt), which:
//   - generates an EC keypair the first time the app runs, stored in the
//     Android Keystore (hardware-backed on devices that support it) and
//     never exposed to JS,
//   - derives a stable device id as SHA-256(raw public key bytes), so the
//     same install always reports the same id, but the id can't be read out
//     of or forged from the webview layer alone,
//   - also reports whether the running device/APK looks tampered with (root
//     indicators, a debuggable build, or a signing-certificate mismatch), via
//     `isTrusted`.
//
// This is intentionally *not* a full attestation (see auth.ts's comment on
// /auth/app/login) — a sufficiently motivated attacker can still patch the
// native plugin itself. It raises the bar past "any string the client feels
// like sending" without blocking the plan to swap in Play Integrity later:
// nothing on the JS side needs to change again, only the plugin.
interface DeviceIdentityPlugin {
  getDeviceId(): Promise<{ deviceId: string; isTrusted: boolean }>;
}

function getDeviceIdentityPlugin(): DeviceIdentityPlugin | null {
  const capacitor = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  const plugin = capacitor?.Plugins?.DeviceIdentity as DeviceIdentityPlugin | undefined;
  return plugin ?? null;
}

export interface NativeDeviceInfo {
  deviceId: string;
  isTrusted: boolean;
}

// Returns null on web (or if the plugin call fails for any reason) so
// callers can fall back to the ordinary web login flow.
export async function getNativeDeviceInfo(): Promise<NativeDeviceInfo | null> {
  if (!isRunningInNativeApp()) return null;
  const plugin = getDeviceIdentityPlugin();
  if (!plugin) return null;
  try {
    return await plugin.getDeviceId();
  } catch {
    return null;
  }
}
