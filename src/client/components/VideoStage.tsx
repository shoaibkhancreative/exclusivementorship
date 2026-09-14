import { useCallback, useEffect, useState } from "react";
import { api, type VideoTokenResponse } from "../lib/api";
import { useContent } from "../lib/useContent";
import { useSession } from "../lib/SessionContext";
import { isRunningInNativeApp, getNativeDeviceInfo } from "../lib/platform";
import { RetryBadge } from "./IllustrationBadge";
import { FullscreenStage } from "./FullscreenStage";
import { VideoPlayer } from "./VideoPlayer";
import { WatermarkOverlay } from "./WatermarkOverlay";
import { AppRequiredModal } from "./AppRequiredModal";

function isBunnyHost(url: string): boolean {
  try {
    return /(^|\\.)(mediadelivery\\.net|b-cdn\\.net)$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function withAutoplayParam(url: string, autoplay: boolean): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("autoplay", autoplay ? "true" : "false");
    return parsed.toString();
  } catch {
    return url;
  }
}

// Shown inside the Android app only, when SecurityChecks.kt reports the
// device/app install as untrusted (rooted, debuggable, or a resigned APK).
// Unlike AppRequiredModal (which points web users at the app), there's
// nowhere else to send this user — the message is just informational.
function DeviceUntrustedNotice({ onClose }: { onClose: () => void }) {
  const { t } = useContent();
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-[#1c1b17]/70 px-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="animate-slide-up w-full max-w-xs rounded-2xl bg-base-900 p-6 text-center shadow-xl">
        <p className="text-sm leading-relaxed text-zinc-300">{t("lesson.device_untrusted")}</p>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring mt-4 w-full rounded-full border border-base-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-base-800"
        >
          {t("lesson.app_required_dismiss")}
        </button>
      </div>
    </div>
  );
}

interface VideoStageProps {
  lessonNumber: number;
  // Phase 3: rawEmbedUrl is no longer sent by the server for paid lessons.
  // The prop is now optional; when absent (paid lesson), hasBunnyVideo=true
  // signals that a token must be fetched.  Free-lesson embed URLs are still
  // passed directly.
  rawEmbedUrl: string | null;
  hasBunnyVideo: boolean;
  title: string;
  onEnded: () => void;
  watermarkLabel: string | null;
  thumbnailUrl: string | null;
}

export function VideoStage({
  lessonNumber,
  rawEmbedUrl,
  hasBunnyVideo,
  title,
  onEnded,
  watermarkLabel,
  thumbnailUrl
}: VideoStageProps) {
  const { t } = useContent();
  const { me } = useSession();

  // needsToken: true when the lesson uses Bunny and the server will not
  // inline the URL (i.e. always for paid Bunny lessons; also for free Bunny
  // lessons when no rawEmbedUrl was supplied).
  const needsToken = hasBunnyVideo && !rawEmbedUrl;

  // For free lessons the server still returns a direct (unsigned) embed URL;
  // for paid lessons rawEmbedUrl is null and we must fetch a signed token.
  const isBunny = hasBunnyVideo || (rawEmbedUrl !== null && isBunnyHost(rawEmbedUrl));

  const [started, setStarted] = useState(false);
  const [showAppRequired, setShowAppRequired] = useState(false);
  const [showDeviceUntrusted, setShowDeviceUntrusted] = useState(false);

  const [signedUrl, setSignedUrl] = useState<string | null>(needsToken ? null : rawEmbedUrl);
  const [tokenError, setTokenError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Phase 3: fetchToken passes the device trust signal as a request header.
  //
  // When running in the native app, we ask DeviceIdentityPlugin for the
  // current trust status immediately before every fetch — this means a device
  // that was fine at login time but was rooted afterwards is caught on the
  // next play tap, not just at login.
  //
  // The header value is intentionally "true" / absent (not sent when false or
  // unknown).  The server treats a missing header the same as "false" for
  // paid lessons, so a client that simply omits the header gets the same
  // "device_not_trusted" rejection as one that sends "false" explicitly.
  // This means the effective check is:
  //   "is running in the app AND DeviceIdentityPlugin says isTrusted AND
  //    the native code's SecurityChecks.kt checks all passed"
  const fetchToken = useCallback(async () => {
    setTokenError(false);
    setSignedUrl(null);

    const extraHeaders: Record<string, string> = {};
    if (isRunningInNativeApp()) {
      const deviceInfo = await getNativeDeviceInfo();
      if (deviceInfo?.isTrusted) {
        extraHeaders["X-Device-Trusted"] = "true";
      }
      // If isTrusted is false or the plugin failed, we do NOT set the header.
      // The server will reject with 403 device_not_trusted for paid lessons.
    }

    api
      .postWithHeaders<VideoTokenResponse>(`/lessons/${lessonNumber}/video-token`, undefined, extraHeaders)
      .then((res) => setSignedUrl(res.embedUrl))
      .catch((err) => {
        // Distinguish specific server rejection reasons from generic errors
        // so the UI can show the appropriate notice rather than a retry prompt.
        if (err && "code" in err && err.code === "device_not_trusted") {
          // Server rejected because SecurityChecks.kt reported an untrusted device.
          setShowDeviceUntrusted(true);
        } else if (err && "code" in err && err.code === "app_required") {
          // Browser session tried to fetch a paid-lesson token — show the
          // "download the app" modal.  This is the server-enforced counterpart
          // of the client-side guard that normally prevents reaching fetchToken
          // from a browser; it fires when a browser user somehow bypasses that
          // guard (e.g. directly POSTing to /video-token with a valid web cookie).
          setShowAppRequired(true);
        } else {
          setTokenError(true);
        }
      });
  }, [lessonNumber]);

  useEffect(() => {
    setIsPlaying(false);
    setStarted(false);
    if (!needsToken) {
      setSignedUrl(rawEmbedUrl);
    } else {
      setSignedUrl(null);
      setTokenError(false);
    }
  }, [lessonNumber, rawEmbedUrl, needsToken]);

  useEffect(() => {
    if (!needsToken || !started) return;
    void fetchToken();
  }, [needsToken, started, fetchToken]);

  if (isBunny && !started) {
    return (
      <>
        <button
          type="button"
          onClick={async () => {
            // Paid users on the web are shown the app-download prompt
            // instead of playing — free users' locked-lesson flow (an
            // entirely different modal, elsewhere) is untouched.
            if (me?.courseStatus === "paid" && !isRunningInNativeApp()) {
              setShowAppRequired(true);
              return;
            }
            // Re-check the device trust status on every play tap, not just
            // at login — a device that was fine at login time could be
            // rooted afterwards while the app session is still valid.
            if (me?.courseStatus === "paid" && isRunningInNativeApp()) {
              const deviceInfo = await getNativeDeviceInfo();
              if (!deviceInfo || !deviceInfo.isTrusted) {
                setShowDeviceUntrusted(true);
                return;
              }
            }
            setStarted(true);
          }}
          aria-label={`Play ${title}`}
          className="focus-ring group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-base-800 bg-black bg-cover bg-center"
          style={thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})` } : undefined}
        >
          <span className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-[1px] transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
            <svg width="14" height="15" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true" className="ml-0.5">
              <path d="M1 1.5v19l18-9.5-18-9.5Z" />
            </svg>
          </span>
        </button>
        {showAppRequired && <AppRequiredModal onClose={() => setShowAppRequired(false)} />}
        {showDeviceUntrusted && (
          <DeviceUntrustedNotice onClose={() => setShowDeviceUntrusted(false)} />
        )}
      </>
    );
  }

  if (needsToken && tokenError) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border border-base-800 bg-base-900 px-6 text-center">
        <RetryBadge size={56} />
        <p className="mt-3 max-w-xs text-sm leading-snug text-zinc-400">{t("lesson.video_error")}</p>
        <button
          type="button"
          onClick={fetchToken}
          className="focus-ring mt-3 rounded-full border border-base-700 px-4 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-base-800"
        >
          {t("learn.retry_button")}
        </button>
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-base-800 bg-black text-sm text-zinc-500">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-base-700 border-t-accent-500" />
        <span className="ml-2.5">{t("lesson.video_loading")}</span>
      </div>
    );
  }

  const playableUrl = isBunny ? withAutoplayParam(signedUrl, started) : signedUrl;

  return (
    <FullscreenStage>
      <VideoPlayer
        key={lessonNumber}
        embedUrl={playableUrl}
        title={title}
        onEnded={onEnded}
        onPlayingChange={setIsPlaying}
      />
      {watermarkLabel && <WatermarkOverlay label={watermarkLabel} playing={isPlaying} />}
    </FullscreenStage>
  );
}
