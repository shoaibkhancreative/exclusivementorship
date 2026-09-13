import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { useConfig } from "../lib/useConfig";
import { useContent } from "../lib/useContent";
import { useLayout } from "../lib/useLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";
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

  useDocumentMeta({
    title: "Exclusive Mentorship — Next Level Trader",
    description: t("home.body") || "A focused, structured trading education journey. Start with 5 free lessons.",
    path: "/"
  });

  function handleStart() {
    if (me?.authenticated) {
      navigate("/learn");
    } else {
      navigate("/login");
    }
  }

  const blocks: Record<string, React.ReactNode> = {
    kicker: (
      <div key="kicker" className="kicker mb-4 text-accent-400">
        {t("home.kicker")}
      </div>
    ),
    headline: (
      <h1 key="headline" className="mb-10 text-display font-semibold text-zinc-50">
        {t("home.headline")}
      </h1>
    ),
    intro_video: (
      <div key="intro_video" className="relative mb-10 w-full">
        {config?.introVideoEmbedUrl ? (
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
    <div className="page-enter mx-auto flex min-h-[80vh] max-w-4xl flex-col items-center justify-center px-5 py-10 text-center sm:px-6">
      {order.map((id) => blocks[id] ?? null)}
    </div>
  );
}
