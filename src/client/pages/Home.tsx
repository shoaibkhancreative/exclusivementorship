import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { useConfig } from "../lib/useConfig";
import { Button } from "../components/ui";

export default function Home() {
  const { me, loading } = useSession();
  const config = useConfig();
  const navigate = useNavigate();

  function handleStart() {
    if (me?.authenticated) {
      navigate("/learn");
    } else {
      navigate("/login");
    }
  }

  return (
    // Matches the header's max-w-4xl — the video and button now fill the
    // same column width as the rest of the site instead of floating in a
    // narrower box beneath a wider header.
    <div className="mx-auto flex min-h-[80vh] max-w-4xl flex-col items-center justify-center px-5 py-10 text-center sm:px-6">
      <div className="mb-3 text-sm text-accent-400">Next Level Trader</div>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
        Exclusive Mentorship
      </h1>

      {/* First impression is deliberately just the intro video and a single
          "Start Learning" action — no pricing, no PDF, no premium hints of
          any kind. The mentorship is only ever revealed on /unlock, after
          the last free class, per the value-first product strategy. The
          video itself is fully admin-editable (Settings → Course) — no
          redeploy needed to change it. */}
      <div className="relative mb-8 aspect-video w-full overflow-hidden rounded-md border border-base-800 bg-base-900">
        {config?.introVideoEmbedUrl ? (
          <iframe
            className="h-full w-full"
            src={config.introVideoEmbedUrl}
            title="Exclusive Mentorship intro"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">Intro video coming soon</div>
        )}
      </div>

      <p className="mb-9 max-w-md text-[15px] leading-relaxed text-zinc-400">
        A structured trading framework — market structure, liquidity, and price delivery. Start with the free
        lessons.
      </p>

      <Button onClick={handleStart} disabled={loading} className="w-full max-w-xs sm:min-w-[220px] sm:w-auto">
        Start Learning
      </Button>
    </div>
  );
}