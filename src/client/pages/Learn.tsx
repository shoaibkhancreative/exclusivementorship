import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OutlineResponse } from "../lib/api";
import { Button, LoadingScreen } from "../components/ui";
import { OutlineList } from "../components/OutlineList";

export default function Learn() {
  const [data, setData] = useState<OutlineResponse | null>(null);
  const [error, setError] = useState(false);

  const loadOutline = useCallback(() => {
    setError(false);
    api
      .get<OutlineResponse>("/lessons")
      .then(setData)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    loadOutline();
  }, [loadOutline]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-24 text-center sm:px-6">
        <p className="mb-4 text-sm text-red-400">Couldn't load your classes.</p>
        <Button variant="secondary" onClick={loadOutline}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return <LoadingScreen />;

  const currentItem = data.outline.find((l) => l.lessonNumber === data.currentLesson);
  const completedCount = data.outline.filter((l) => l.state === "completed").length;
  const total = data.outline.length;

  const percent = total ? Math.round((completedCount / total) * 100) : 0;

  return (
    // Matches the header's max-w-4xl so the page reads as one continuous
    // column instead of a wide bar with a narrow card floating inside it.
    <div className="page-enter mx-auto max-w-4xl px-5 py-12 sm:px-6">
      {/* One hero stat instead of a generic greeting: progress is the one
          thing a returning learner actually wants to see first. The thin
          fill bar underneath is the only other use of the accent color on
          this screen besides the current-class marker in the list. The big
          number sits in the same serif as every heading on the site, so it
          reads as a headline rather than a raw stat. */}
      <div className="mb-12">
        <p className="kicker mb-2">Your progress</p>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-5xl font-medium tracking-tight text-zinc-50">{completedCount}</span>
          <span className="text-lg text-zinc-600">/ {total}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">classes completed</p>

        <div className="mt-5 flex items-center gap-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-base-900">
            <div
              className="h-full rounded-full bg-accent-500 transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="flex-none text-xs tabular-nums text-zinc-500">{percent}%</span>
        </div>

        {currentItem ? (
          <Link
            to={`/lesson/${currentItem.lessonNumber}`}
            className="focus-ring group mt-6 flex items-center justify-between gap-4 rounded-md border border-base-800 bg-base-900/40 px-5 py-4 transition-colors duration-150 hover:border-base-600"
          >
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">Continue</div>
              <div className="mt-0.5 truncate text-[15px] font-medium text-zinc-100">
                {String(currentItem.lessonNumber).padStart(2, "0")} — {currentItem.title}
              </div>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="flex-none text-zinc-600 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent-500"
            >
              <path d="M6 3.5 11 8l-5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : (
          total > 0 &&
          completedCount === total && (
            // Nothing left to continue to — the finish line deserves its own
            // acknowledgement instead of the Continue card just disappearing.
            <div className="mt-6 flex items-center gap-3 rounded-md border border-accent-500/25 bg-accent-500/[0.04] px-5 py-4">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="flex-none text-accent-500">
                <path
                  d="M3 9.5 7 13.5 15 4.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
              <p className="text-[15px] text-zinc-100">All classes completed — you've finished the course.</p>
            </div>
          )
        )}
      </div>

      <OutlineList items={data.outline} activeLessonNumber={data.currentLesson} semesters={data.semesters} />
    </div>
  );
}