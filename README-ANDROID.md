# Phase 2 — Android app (Capacitor)

This file covers what was added, exactly what you still need to run locally
(this sandbox has no network access, so nothing below could actually be
`npm install`ed or Gradle-built here), and what's honestly not solvable.

## What the app is

A thin Capacitor shell: `capacitor.config.ts` points its WebView at
`https://exclusivementorship.xyz` directly (`server.url`), so it's the same
site, same session cookies, same `/api/*` calls as the browser. Phase 1
features (session/device system, header download button, paid-video popup)
did not need to change to work in the app — they already worked purely by
checking `window.Capacitor`, which the plugin runtime supplies automatically.

## Finish the setup (run these yourself, in order)

```bash
npm install                 # pulls in @capacitor/core, @capacitor/android, @capacitor/cli
npx cap add android         # generates the parts of android/ that must come from the CLI
                             # (gradlew, gradle-wrapper.jar, capacitor.settings.gradle,
                             # app/capacitor.build.gradle, res/mipmap launcher icons) —
                             # it will ask to overwrite a few files we already created
                             # (AndroidManifest.xml, build.gradle, MainActivity.kt); say no
                             # / keep ours for those, since they carry the custom bits below
npx cap sync android         # copies plugin JS bindings + refreshes the generated gradle files
```

Then, before a release build:

1. Generate a release keystore (`keytool -genkeypair -v -keystore release.keystore -alias exclusivementorship -keyalg EC -keysize 256 -validity 10000`).
2. Create `android/keystore.properties` (already gitignored) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword` pointing at it.
3. Run `keytool -list -v -keystore release.keystore` to get the SHA-256 cert
   fingerprint, and paste it into `EXPECTED_SIGNATURE_SHA256` in
   `android/app/build.gradle` (replacing the placeholder). Until this is
   filled in, the signature-tamper check in `SecurityChecks.kt` is a
   no-op — it doesn't block the app, it just isn't doing anything.
4. `cd android && ./gradlew assembleRelease` (or `bundleRelease` for an AAB).
5. Upload the resulting APK/AAB somewhere reachable and paste that URL into
   **Admin → Settings → App Download URL** — the header button already
   reads this field (`getAppDownloadUrl` / `TopBar.tsx`, unchanged).

## Files changed / added

**Web app (works whether or not the Android app exists yet):**
- `src/client/lib/platform.ts` — added `getNativeDeviceInfo()`, a thin
  wrapper around the new `DeviceIdentity` native plugin. `isRunningInNativeApp()`
  is unchanged.
- `src/client/pages/Login.tsx` — `handleVerify` now branches: inside the
  native app it calls `POST /auth/app/login` with a Keystore-derived
  `deviceId` (rejecting up front if the device fails the tamper check);
  everywhere else it calls `POST /auth/verify-otp` exactly as before.
- `src/client/components/VideoStage.tsx` — for paid users inside the native
  app, re-checks `isTrusted` at the moment of every play tap (not just at
  login) before starting playback, since a device could be rooted *after*
  a valid app session already exists. Shows a small `DeviceUntrustedNotice`
  in that case; web and free-user flows are unchanged.
- `src/worker/lib/content.ts` — added one new admin-editable content key,
  `lesson.device_untrusted`, for that notice's message.

**New — Capacitor/Android project:**
- `capacitor.config.ts` — app id, app name, `server.url`.
- `package.json` — added `@capacitor/core`, `@capacitor/android`,
  `@capacitor/cli`, and two convenience scripts.
- `android/` — the native project:
  - `app/src/main/java/xyz/exclusivementorship/app/MainActivity.kt` — sets
    `FLAG_SECURE` and registers the custom plugin.
  - `app/src/main/java/xyz/exclusivementorship/app/DeviceIdentityPlugin.kt`
    — generates/reads an Android-Keystore EC key, exposes
    `DeviceIdentity.getDeviceId()` to JS as `{ deviceId, isTrusted }`.
  - `app/src/main/java/xyz/exclusivementorship/app/SecurityChecks.kt` — root
    indicators, debuggable-build check, and APK-signature check.
  - `app/build.gradle` — `minifyEnabled true`, `shrinkResources true`,
    R8 full mode, release signing wired to a local `keystore.properties`.
  - `app/proguard-rules.pro` — keep-rules for Capacitor's reflection-based
    plugin loading and our two classes above.
  - `AndroidManifest.xml` — only the `INTERNET` permission,
    `allowBackup="false"`, `usesCleartextTraffic="false"`.
  - `build.gradle`, `settings.gradle`, `gradle.properties`,
    `variables.gradle`, `res/values/*` — standard Capacitor 6 scaffolding.
- `.gitignore` — excludes the release keystore, build output, and the
  CLI-generated gradle/asset files that `cap sync` regenerates.

**Server: no changes.** `POST /auth/app/login` and the device-lock logic in
`src/worker/lib/deviceLock.ts` already existed from Phase 1 and already
expect a client-supplied `deviceId` string — that contract is unchanged, the
Android app now just supplies a harder-to-fake value for it, per the
existing comment in that file.

## What each requirement gets you, and where it stops

**#2 — block screenshot / screen recording / mirroring.** `FLAG_SECURE` in
`MainActivity` does this at the OS compositor level: no screenshot, no
`MediaProjection`-based screen recorder, and a black/blank thumbnail in the
recent-apps switcher. It also blocks wireless display mirroring (Chromecast/
Smart View) on most OEM implementations, though a few skinned Android builds
have historically leaked it — that's an OS bug, not something an app can
control. Because this app is one Activity/WebView, `FLAG_SECURE` applies to
the whole app, not just video/lesson screens (there's no per-screen version
of it inside a single Activity). Not solvable at all: pointing a second
physical camera/phone at the screen. No app-level flag stops that.

**#3 — tamper-proofing.** R8/ProGuard (`minifyEnabled true`, full mode)
gives real obfuscation and shrinking — class/method names are gone, dead
code is stripped — which raises the cost of reverse-engineering meaningfully,
but it is not encryption; a patient attacker with `apktool`/`jadx` can still
work through it. `SecurityChecks.kt`'s root/debuggable/signature checks
catch common cases (stock rooted devices, a resigned/repackaged APK,
`adb install` of a debug build) but are heuristic, not attestation: Magisk's
DenyList/Zygisk hooks exist specifically to hide root from exactly these
checks, and someone willing to patch the APK can patch `SecurityChecks.kt`
itself out of it. This is why the code and the comments repeatedly point at
Play Integrity as the real next step — it moves the trust decision off the
device entirely (Google's servers attest, not app code you shipped to the
attacker).

**#4 — device identifier.** Backed by an Android Keystore EC key
(hardware/StrongBox-backed where the device supports it); the private key
never leaves secure storage or reaches JS. It persists across app restarts
and OS updates, and is materially harder to spoof than an arbitrary string,
but it is still not a hardware attestation of the app binary itself — see
the `isTrusted` discussion above and the existing comment on
`checkAndRegisterAppDevice` in `deviceLock.ts`. Note the id resets on
uninstall/reinstall or "clear app data" (Keystore entries are scoped to the
app install), which is expected and matches how the existing admin
device-reset flow is meant to be used if a legitimate user reinstalls.
