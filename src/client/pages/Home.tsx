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
    <div className="mx-auto flex min-h-[80vh] max-w-xl flex-col items-center justify-center px-5 py-10 text-center sm:px-6">
      <div className="mb-3 text-xs uppercase tracking-[0.25em] text-accent-500">Next Level Trader</div>
      <h1 className="mb-6 text-3xl font-semibold text-zinc-50 sm:text-4xl">Exclusive Mentorship</h1>

      <div className="relative mb-8 aspect-video w-full overflow-hidden rounded-xl border border-base-700 bg-base-900">
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">
          {/* TODO: Replace with the real intro video (YouTube embed or hosted file) */}
          Intro video placeholder
        </div>

        {/* PDF download lives here — a small corner badge on the video itself —
            rather than as a second competing button below, so there's only one
            primary action ("Start Learning") on the whole page. */}
        {config?.mentorshipPdfUrl && (
          <a
            href={config.mentorshipPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Mentorship Details (PDF)"
            aria-label="Download mentorship details PDF"
            className="focus-ring absolute right-2 top-2 flex items-center gap-1.5 rounded-full border border-base-600/80 bg-base-950/80 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 backdrop-blur transition-colors hover:border-accent-500/60 hover:text-accent-300 sm:right-3 sm:top-3"
          >
            <span aria-hidden="true">↓</span>
            <span className="hidden sm:inline">Details PDF</span>
            <span className="sm:hidden">PDF</span>
          </a>
        )}
      </div>

      <p className="mb-8 max-w-md text-sm leading-relaxed text-zinc-400">
        A structured, institutional-style trading framework — market structure, liquidity, price delivery, and
        fundamental analysis. Start with five free lessons.
      </p>

      <Button onClick={handleStart} disabled={loading} className="w-full max-w-xs sm:min-w-[220px] sm:w-auto">
        Start Learning
      </Button>
    </div>
  );
}
