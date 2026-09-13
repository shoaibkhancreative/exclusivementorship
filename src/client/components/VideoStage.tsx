import { useCallback, useEffect, useState } from "react";
import { api, type VideoTokenResponse } from "../lib/api";
import { useContent } from "../lib/useContent";
import { RetryBadge } from "./IllustrationBadge";
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
  rawEmbedUrl: string;
  title: string;
  onEnded: () => void;
  watermarkLabel: string | null;
  thumbnailUrl: string | null;
}

export function VideoStage({
  lessonNumber,
  rawEmbedUrl,
  title,
  onEnded,
  watermarkLabel,
  thumbnailUrl
}: VideoStageProps) {
  const { t } = useContent();
  const isBunny = isBunnyHost(rawEmbedUrl);
  const needsToken = isBunny;

  const [started, setStarted] = useState(false);

  const [signedUrl, setSignedUrl] = useState<string | null>(needsToken ? null : rawEmbedUrl);
  const [tokenError, setTokenError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const fetchToken = useCallback(() => {
    setTokenError(false);
    setSignedUrl(null);
    api
      .post<VideoTokenResponse>(`/lessons/${lessonNumber}/video-token`)
      .then((res) => setSignedUrl(res.embedUrl))
      .catch(() => {
        setTokenError(true);
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
    fetchToken();
  }, [needsToken, started, fetchToken]);

  if (isBunny && !started) {
    return (
      <button
        type="button"
        onClick={() => setStarted(true)}
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
