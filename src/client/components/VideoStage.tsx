import { useCallback, useEffect, useState } from "react";
import { api, type VideoTokenResponse } from "../lib/api";
import { FullscreenStage } from "./FullscreenStage";
import { VideoPlayer } from "./VideoPlayer";
import { WatermarkOverlay } from "./WatermarkOverlay";

function isBunnyHost(url: string): boolean {
  try {
    return /(^|\.)(mediadelivery\.net|b-cdn\.net)$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

interface VideoStageProps {
  lessonNumber: number;
  /** The lesson's raw embedUrl as returned by GET /lessons/:number — unsigned for Bunny videos. */
  rawEmbedUrl: string;
  title: string;
  onEnded: () => void;
  /**
   * Whether this lesson is payment-gated (beyond the free-lesson count).
   * Free lessons — including free lessons now hosted on Bunny — skip the
   * signed-token round-trip entirely and render the plain embed URL, same
   * as the YouTube path always has. Only payment-gated Bunny lessons ever
   * call POST /lessons/:number/video-token.
   */
  requiresToken: boolean;
  /** The logged-in viewer's email — shown as a deterrent watermark. Null skips the overlay entirely (e.g. logged-out preview, or watermark disabled for this lesson). */
  watermarkLabel: string | null;
}

/**
 * Sits between Lesson.tsx and VideoPlayer. For payment-gated Bunny-hosted
 * lessons, fetches a short-lived signed embed URL from
 * POST /lessons/:number/video-token before ever rendering the iframe — the
 * raw, unsigned mediadelivery.net link is never rendered directly for those.
 * Free lessons (YouTube always, and now Bunny too) render their raw embed
 * URL immediately with no token fetch and no auth requirement.
 */
export function VideoStage({ lessonNumber, rawEmbedUrl, title, onEnded, requiresToken, watermarkLabel }: VideoStageProps) {
  const needsToken = requiresToken && isBunnyHost(rawEmbedUrl);
  const [signedUrl, setSignedUrl] = useState<string | null>(needsToken ? null : rawEmbedUrl);
  const [tokenError, setTokenError] = useState(false);

  const fetchToken = useCallback(() => {
    setTokenError(false);
    setSignedUrl(null);
    api
      .post<VideoTokenResponse>(`/lessons/${lessonNumber}/video-token`)
      .then((res) => setSignedUrl(res.embedUrl))
      .catch(() => {
        // Deliberately generic — never surface the underlying ApiError's
        // status/message, which could otherwise hint at *why* signing
        // failed (e.g. "video_unavailable" vs. a rate limit).
        setTokenError(true);
      });
  }, [lessonNumber]);

  useEffect(() => {
    if (!needsToken) {
      setSignedUrl(rawEmbedUrl);
      return;
    }
    fetchToken();
    // Intentionally re-runs only when the lesson, its raw URL, or whether it
    // needs a token changes — not on every fetchToken identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonNumber, rawEmbedUrl, needsToken]);

  // --- Fullscreen -------------------------------------------------------
  //
  // Bunny's own in-player fullscreen button would fullscreen the iframe
  // itself (not our wrapping container) — and since the watermark below is a
  // sibling of the iframe, not a descendant of it, that made the watermark
  // vanish in fullscreen. VideoPlayer.tsx already refuses the Bunny iframe
  // fullscreen permission (no `allow="fullscreen"`) so Bunny's own button is
  // inert, and FullscreenStage below renders our own toggle button on the
  // *wrapping* container instead — see FullscreenStage.tsx for the full
  // rationale (native Fullscreen API + CSS-only fallback for browsers like
  // iOS Safari that lack it).
  if (needsToken && tokenError) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg border border-base-800 bg-base-900 text-sm text-zinc-400">
        <p>This video can&apos;t be played right now.</p>
        <button
          type="button"
          onClick={fetchToken}
          className="focus-ring rounded-full border border-base-700 px-4 py-1.5 text-zinc-300 transition-colors hover:bg-base-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-base-800 bg-black text-sm text-zinc-500">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-base-700 border-t-accent-500" />
        <span className="ml-2.5">Loading video…</span>
      </div>
    );
  }

  return (
    <FullscreenStage>
      <VideoPlayer key={lessonNumber} embedUrl={signedUrl} title={title} onEnded={onEnded} />
      {watermarkLabel && <WatermarkOverlay label={watermarkLabel} />}
    </FullscreenStage>
  );
}