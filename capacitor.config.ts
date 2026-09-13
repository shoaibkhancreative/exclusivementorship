import type { CapacitorConfig } from "@capacitor/cli";

// The Android app is a thin native shell around the live site — it does NOT
// bundle a copy of dist/client. `server.url` tells the WebView to load the
// real Cloudflare Worker origin directly, so:
//   - every Phase 1 feature (session/device system, header download button,
//     paid-video popup) keeps working completely unchanged, since the app
//     is just another browser hitting the same origin with the same
//     relative /api/* calls,
//   - a new deploy of the website is immediately live in the app too, with
//     no separate app release needed for content/UI changes,
//   - the only things that need an actual Play Store / APK update going
//     forward are native-shell changes (this file, the Android project, the
//     DeviceIdentity plugin).
//
// webDir is still required by the Capacitor CLI even though it's unused at
// runtime in server.url mode; it just needs to exist for `cap sync`.
const config: CapacitorConfig = {
  appId: "xyz.exclusivementorship.app",
  appName: "Exclusive Mentorship",
  webDir: "dist/client",
  server: {
    // TODO: confirm this matches wrangler.jsonc's APP_URL before release.
    url: "https://exclusivementorship.xyz",
    // Never allow plain-http fallback — session cookies must stay
    // HttpOnly+Secure exactly as they are on web.
    cleartext: false
  },
  android: {
    // We set FLAG_SECURE ourselves in MainActivity (covers screenshots,
    // screen recording, and the recent-apps thumbnail) rather than relying
    // on a Capacitor-level toggle, so this stays false here.
    allowMixedContent: false
  }
};

export default config;
