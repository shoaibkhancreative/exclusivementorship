import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { useConfig } from "../lib/useConfig";
import { useContent } from "../lib/useContent";
import { useLayout } from "../lib/useLayout";
import { Button } from "../components/ui";
import { FullscreenStage } from "../components/FullscreenStage";
import { VideoPlayer } from "../components/VideoPlayer";

const DEFAULT_ORDER = ["kicker", "headline", "intro_video", "body", "cta"];

export default function Home() {
  const { me, loading } = useSession();
  const config = useConfig();
  const { t } = useContent();
  const { getBlockOrder } = useLayout();
  const navigate = useNavigate();

  function handleStart() {
    if (me?.authenticated) {
      navigate("/learn");
    } else {
      navigate("/login");
    }
  }

  // Each block is a self-contained fragment — reordering or hiding one from
  // the admin Sections page never changes another block's markup, only
  // which of these render and in what order (see useLayout()/PAGE_BLOCKS).
  const blocks: Record<string, React.ReactNode> = {
    kicker: (
      <div key="kicker" className="kicker mb-4 text-accent-400">
        {t("home.kicker")}
      </div>
    ),
    headline: (
      // font-size bumped from a fixed 3xl/4xl pair to the fluid `display`
      // token — scales continuously with viewport instead of hopping
      // between two sizes at the sm breakpoint, which is the difference
      // between a headline that was tuned and one that just inherited
      // whatever the framework's default was.
      <h1 key="headline" className="mb-10 text-display font-semibold text-zinc-50">
        {t("home.headline")}
      </h1>
    ),
    intro_video: (
      // First impression is deliberately just the intro video and a single
      // "Start Learning" action — no pricing, no PDF, no premium hints of
      // any kind. The mentorship checkout popup is only ever revealed after
      // the last free class, per the value-first product strategy. The
      // video itself is fully admin-editable (Settings → Course) — no
      // redeploy needed to change it.
      <div key="intro_video" className="relative mb-10 w-full">
        {config?.introVideoEmbedUrl ? (
          // Same fullscreen experience as the lesson videos on /learn — see
          // FullscreenStage.tsx / VideoPlayer.tsx for why a plain
          // `allowFullScreen` iframe isn't enough for Bunny-hosted videos.
          <FullscreenStage>
            <VideoPlayer embedUrl={config.introVideoEmbedUrl} title="Exclusive Mentorship intro" onEnded={() => {}} />
          </FullscreenStage>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-md border border-base-800 bg-base-900 text-sm text-zinc-500">
            {t("home.intro_video_fallback")}
          </div>
        )}
      </div>
    ),
    body: (
      <p key="body" className="mb-10 max-w-md text-[15px] leading-relaxed text-zinc-400">
        {t("home.body")}
      </p>
    ),
    cta: (
      <Button key="cta" onClick={handleStart} disabled={loading} className="w-full max-w-xs sm:min-w-[220px] sm:w-auto">
        {t("home.cta_start")}
      </Button>
    )
  };

  const order = getBlockOrder("home", DEFAULT_ORDER);

  return (
    // Matches the header's max-w-4xl — the video and button now fill the
    // same column width as the rest of the site instead of floating in a
    // narrower box beneath a wider header.
    <div className="page-enter mx-auto flex min-h-[80vh] max-w-4xl flex-col items-center justify-center px-5 py-10 text-center sm:px-6">
      {order.map((id) => blocks[id] ?? null)}
    </div>
  );
}
