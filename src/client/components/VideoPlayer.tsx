import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  embedUrl: string;
  title: string;
  onEnded: () => void;
  onPlayingChange?: (playing: boolean) => void;
}

export function VideoPlayer({ embedUrl, title, onEnded, onPlayingChange }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  const isYouTube = /(^|\.)youtube(-nocookie)?\.com$/.test(safeHost(embedUrl));
  const isBunny = /(^|\.)(mediadelivery\.net|b-cdn\.net)$/.test(safeHost(embedUrl));

  useEffect(() => {
    if (!isYouTube) return;
    let destroyed = false;
    let player: YTPlayer | null = null;

    function createPlayer() {
      if (destroyed || !iframeRef.current) return;
      const YT = window.YT;
      if (!YT?.Player) return;
      player = new YT.Player(iframeRef.current, {
        events: {
          onStateChange: (event: { data: number }) => {
            if (event.data === 0) {
              onEndedRef.current();
              onPlayingChangeRef.current?.(false);
            } else {
              onPlayingChangeRef.current?.(event.data === 1);
            }
          }
        }
      });
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const existingCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        existingCallback?.();
        createPlayer();
      };
      if (!document.getElementById("youtube-iframe-api")) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      destroyed = true;
      try {
        player?.destroy?.();
      } catch {
      }
    };
  }, [embedUrl, isYouTube]);

  useEffect(() => {
    if (!isBunny) return;
    let destroyed = false;
    let player: PlayerJsPlayer | null = null;

    function createPlayer() {
      if (destroyed || !iframeRef.current) return;
      const playerjs = window.playerjs;
      if (!playerjs?.Player) return;
      player = new playerjs.Player(iframeRef.current);
      player.on("ready", () => {
        if (destroyed) return;
        player?.on("play", () => onPlayingChangeRef.current?.(true));
        player?.on("pause", () => onPlayingChangeRef.current?.(false));
        player?.on("ended", () => {
          onEndedRef.current();
          onPlayingChangeRef.current?.(false);
        });
      });
    }

    if (window.playerjs?.Player) {
      createPlayer();
    } else {
      const existingScript = document.getElementById("bunny-playerjs") as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener("load", createPlayer);
      } else {
        const script = document.createElement("script");
        script.id = "bunny-playerjs";
        script.src = "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";
        script.onload = createPlayer;
        document.head.appendChild(script);
      }
    }

    return () => {
      destroyed = true;
      try {
        player?.off?.("ended");
      } catch {
      }
    };
  }, [embedUrl, isBunny]);

  const src = isYouTube ? withYouTubeParams(embedUrl) : embedUrl;

  const allowAttr = isYouTube
    ? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    : "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

  return (
    <div className="aspect-video overflow-hidden rounded-lg border border-base-800 bg-black">
      <iframe
        ref={iframeRef}
        className="h-full w-full"
        src={src}
        title={title}
        allow={allowAttr}
        allowFullScreen={isYouTube}
      />
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function withYouTubeParams(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("enablejsapi", "1");
    parsed.searchParams.set("rel", "0");
    parsed.searchParams.set("modestbranding", "1");
    parsed.searchParams.set("playsinline", "1");
    if (typeof window !== "undefined") {
      parsed.searchParams.set("origin", window.location.origin);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

interface YTPlayer {
  destroy?: () => void;
}

interface PlayerJsPlayer {
  on: (event: string, callback: () => void) => void;
  off?: (event: string) => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: { events: { onStateChange: (event: { data: number }) => void } }) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
    playerjs?: {
      Player: new (el: HTMLElement) => PlayerJsPlayer;
    };
  }
}
