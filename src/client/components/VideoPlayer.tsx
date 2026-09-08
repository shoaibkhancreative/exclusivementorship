import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  embedUrl: string;
  title: string;
  onEnded: () => void;
}

/**
 * Renders a lesson's embedded video and calls `onEnded` exactly once the
 * player reports the video actually finished — this, not page load, is
 * what triggers POST /lessons/:number/complete-video (see Lesson.tsx). Two
 * embed sources are supported, auto-detected from the URL's host:
 *
 *  - YouTube (youtube.com / youtube-nocookie.com): uses the official
 *    IFrame Player API (`enablejsapi=1` + the youtube.com/iframe_api
 *    script) and listens for the "ended" player state.
 *  - Bunny.net (mediadelivery.net / b-cdn.net iframe embeds): loads Bunny's
 *    official player.js library (assets.mediadelivery.net) and uses it to
 *    listen for the "ended" event — a raw postMessage listener without this
 *    library never receives anything, since Bunny's player only starts
 *    emitting events after player.js completes its handshake with the
 *    iframe (https://github.com/embedly/player.js).
 *
 * Any other embed host still plays fine but can't be auto-detected as
 * "finished" — the fallback "I've finished this video" button covers that
 * case (see Lesson.tsx).
 */
export function VideoPlayer({ embedUrl, title, onEnded }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const isYouTube = /(^|\.)youtube(-nocookie)?\.com$/.test(safeHost(embedUrl));
  const isBunny = /(^|\.)(mediadelivery\.net|b-cdn\.net)$/.test(safeHost(embedUrl));

  // --- YouTube: official IFrame Player API ---------------------------------
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
            // YT.PlayerState.ENDED === 0
            if (event.data === 0) onEndedRef.current();
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
      // Defensive: YT's destroy() actively removes the <iframe> from the
      // DOM. With the VideoPlayer now fully remounted per lesson (see the
      // `key` on VideoPlayer in Lesson.tsx), React is already discarding
      // this exact node, so this is a no-op in practice — the try/catch is
      // just a safety net against any third-party quirks so it can never
      // take the whole app down with it.
      try {
        player?.destroy?.();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, isYouTube]);

  // --- Bunny.net: official player.js library --------------------------------
  // Bunny's player only starts emitting events once a player.js client has
  // performed the library's handshake with the iframe — a raw postMessage
  // listener alone (without loading player.js and instantiating
  // playerjs.Player) never receives anything from Bunny's player.
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
        player?.on("ended", () => onEndedRef.current());
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
      // Same defensive reasoning as the YouTube branch above: this player
      // instance's iframe is being fully discarded by React on unmount
      // anyway (per-lesson `key`), so this cleanup is just a safety net.
      try {
        player?.off?.("ended");
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, isBunny]);

  const src = isYouTube ? withYouTubeParams(embedUrl) : embedUrl;

  return (
    <div className="aspect-video overflow-hidden rounded-md border border-base-800 bg-black">
      <iframe
        ref={iframeRef}
        className="h-full w-full"
        src={src}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
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
      Player: new (
        el: HTMLElement,
        opts: { events: { onStateChange: (event: { data: number }) => void } }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
    playerjs?: {
      Player: new (el: HTMLElement) => PlayerJsPlayer;
    };
  }
}