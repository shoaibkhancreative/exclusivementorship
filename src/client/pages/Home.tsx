import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { Button } from "../components/ui";

export default function Home() {
  const { me, loading } = useSession();
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

      {/* First impression is deliberately just the intro video and a single
          "Start Learning" action — no pricing, no PDF, no premium hints of
          any kind. The mentorship is only ever revealed on /unlock, after
          Class 5, per the value-first product strategy. */}
      <div className="relative mb-8 aspect-video w-full overflow-hidden rounded-xl border border-base-700 bg-base-900">
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">
          {/* TODO: Replace with the real intro video (YouTube embed or hosted file) */}
          Intro video placeholder
        </div>
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
