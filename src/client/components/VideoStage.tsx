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

/** Forces (or clears) the `autoplay` query param on a Bunny embed URL. */
function withAutoplayParam(url: string, autoplay: boolean): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("autoplay", autoplay ? "true" : "false");
    return parsed.toString();
  } catch {
    return url;
  }
}

interface VideoStageProps {
  lessonNumber: number;
  /** The lesson's raw embedUrl as returned by GET /lessons/:number — unsigned for Bunny videos. */
  rawEmbedUrl: string;
  title: string;
  onEnded: () => void;
  /** The logged-in viewer's email — shown as a deterrent watermark. Null skips the overlay entirely (e.g. logged-out preview, or watermark disabled for this lesson). */
  watermarkLabel: string | null;
  /** Shown behind the click-to-play button for Bunny videos before playback starts. */
  thumbnailUrl: string | null;
}

/**
 * Sits between Lesson.tsx and VideoPlayer. For payment-gated Bunny-hosted
 * lessons, fetches a short-lived signed embed URL from
 * POST /lessons/:number/video-token before ever rendering the iframe — the
 * raw, unsigned mediadelivery.net link is never rendered directly for those.
 * Free lessons hosted on YouTube still render their raw embed URL
 * immediately, no token fetch involved. Free lessons hosted on Bunny go
 * through the exact same signed-token round-trip as paid ones — see the
 * `needsToken` comment below for why an unsigned free-lesson Bunny embed
 * 403s once the library's Token Authentication setting is on.
 *
 * Every Bunny-hosted lesson (free or paid, freshly unlocked or not, on
 * first load or a reload) starts as a plain thumbnail with a large, centered
 * play button — never the live iframe. Nothing is fetched or mounted for a
 * Bunny lesson until the learner actually taps play, so there is no autoplay
 * of any kind, ever, on any page load. YouTube lessons are unaffected —
 * their existing behavior (no facade) is unchanged.
 */
export function VideoStage({
  lessonNumber,
  rawEmbedUrl,
  title,
  onEnded,
  watermarkLabel,
  thumbnailUrl
}: VideoStageProps) {
  const isBunny = isBunnyHost(rawEmbedUrl);
  // Every Bunny-hosted video needs a signed token — this is NOT tied to
  // payment gating (there used to be a `requiresToken` prop here that only
  // signed premium lessons; that's what caused free Bunny lessons to 403).
  // Bunny Stream's "Token Authentication" security setting lives on the
  // video LIBRARY, not on individual videos: once it's on, the whole
  // library requires a valid token/expires pair on every embed request, so
  // an unsigned "free" embed 403s exactly the same as an unsigned paid one
  // would — Bunny has no per-video exemption for this. Access control for
  // who is *allowed* to request a token at all is still fully enforced
  // server-side (see canAccessLesson inside POST /lessons/:number/video-token);
  // this just makes sure free lessons actually go through that endpoint
  // instead of trying to render an embed Bunny will reject outright.
  const needsToken = isBunny;

  // Whether the learner has tapped the play button yet. Only meaningful
  // for Bunny — YouTube keeps its previous "always live" behavior. Reset
  // to false any time the lesson changes so a freshly-opened class always
  // starts on the facade, never mid-playback state left over from before.
  const [started, setStarted] = useState(false);

  const [signedUrl, setSignedUrl] = useState<string | null>(needsToken ? null : rawEmbedUrl);
  const [tokenError, setTokenError] = useState(false);
  // Drives the watermark's animation (see WatermarkOverlay.tsx): starts
  // false so it's motionless before playback begins, flips true/false in
  // lockstep with the player's own real play/pause events (VideoPlayer's
  // onPlayingChange — never a timer or a guess), and is reset to false
  // below whenever the lesson changes, since VideoPlayer is remounted per
  // lesson (`key={lessonNumber}`) and its play state doesn't carry over.
  const [isPlaying, setIsPlaying] = useState(false);

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

  // Reset per-lesson state: always back to the facade (for Bunny), never
  // "playing" yet.
  useEffect(() => {
    setIsPlaying(false);
    setStarted(false);
    if (!needsToken) {
      setSignedUrl(rawEmbedUrl);
    } else {
      setSignedUrl(null);
      setTokenError(false);
    }
    // Intentionally re-runs only when the lesson, its raw URL, or whether it
    // needs a token changes — not on every fetchToken identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonNumber, rawEmbedUrl, needsToken]);

  // For Bunny lessons, only fetch the signed token once the learner has
  // actually tapped play — nothing is requested or mounted for a video the
  // learner never opens, and this keeps the click itself as the one and
  // only thing that can ever start playback.
  useEffect(() => {
    if (!needsToken || !started) return;
    fetchToken();
  }, [needsToken, started, fetchToken]);

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

  // Bunny, not yet started: thumbnail + a small, subtle centered play
  // button (not a large one — the thumbnail itself should read clearly, the
  // button is just an obvious affordance sitting on top of it). No iframe
  // exists yet at all, so nothing can autoplay.
  if (isBunny && !started) {
    return (
      <button
        type="button"
        onClick={() => setStarted(true)}
        aria-label={`Play ${title}`}
        className="focus-ring group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-base-800 bg-black bg-cover bg-center"
        style={thumbnailUrl ? { backgroundImage: `url(${thumbnailUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-black/20 transition-colors duration-150 group-hover:bg-black/30" aria-hidden="true" />
        <span className="relative flex h-10 w-10 flex-none items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-[1px] transition-transform duration-150 group-hover:scale-105 group-active:scale-95 sm:h-11 sm:w-11">
          <svg width="14" height="15" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true" className="ml-0.5">
            <path d="M1 1.5v19l18-9.5-18-9.5Z" />
          </svg>
        </span>
      </button>
    );
  }

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

  // Once started (a real click just happened, for Bunny), the video should
  // play immediately rather than loading paused again behind its own
  // in-player button — hence forcing autoplay=true here, only ever as a
  // direct result of that click. YouTube's src is untouched.
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
