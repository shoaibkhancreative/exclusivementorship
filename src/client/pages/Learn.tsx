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

  return (
    // Matches the header's max-w-4xl so the page reads as one continuous
    // column instead of a wide bar with a narrow card floating inside it.
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-6">
      {/* One hero stat instead of a generic greeting: progress is the one
          thing a returning learner actually wants to see first. The thin
          fill bar underneath is the only other use of the accent color on
          this screen besides the current-class marker in the list. */}
      <div className="mb-12">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight text-zinc-50">{completedCount}</span>
          <span className="text-lg text-zinc-600">/ {total}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">classes completed</p>

        <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-base-900">
          <div
            className="h-full rounded-full bg-accent-500 transition-[width] duration-500"
            style={{ width: total ? `${(completedCount / total) * 100}%` : "0%" }}
          />
        </div>

        {currentItem && (
          <Link
            to={`/lesson/${currentItem.lessonNumber}`}
            className="focus-ring mt-6 flex items-center justify-between gap-4 rounded-md border border-base-800 px-5 py-4 transition-colors hover:border-base-700"
          >
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">Continue</div>
              <div className="mt-0.5 truncate text-[15px] font-medium text-zinc-100">
                {String(currentItem.lessonNumber).padStart(2, "0")} — {currentItem.title}
              </div>
            </div>
          </Link>
        )}
      </div>

      <OutlineList items={data.outline} activeLessonNumber={data.currentLesson} semesters={data.semesters} />
    </div>
  );
}