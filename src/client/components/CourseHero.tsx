import { Link } from "react-router-dom";
import type { OutlineResponse } from "../lib/api";
import { useContent } from "../lib/useContent";

/**
 * The Learn page's header card — the equivalent of a YouTube playlist's
 * header panel (big thumbnail + title + "Play all"). Here the big
 * thumbnail is whichever class the learner is currently on, the thin bar
 * under it shows overall course progress, and the button either resumes
 * that class or, for a learner who hasn't started yet, begins at lesson 1.
 */
export function CourseHero({ outline }: { outline: OutlineResponse }) {
  const { t } = useContent();
  const { outline: items, currentLesson } = outline;

  const total = items.length;
  const completedCount = items.filter((item) => item.state === "completed").length;
  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const started = completedCount > 0 || items.some((item) => item.state === "current");
  const featured = items.find((item) => item.lessonNumber === currentLesson) ?? items[0];
  if (!featured) return null;

  return (
    <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-center">
      <Link
        to={`/lesson/${featured.lessonNumber}`}
        className="focus-ring group relative aspect-video w-full flex-none overflow-hidden rounded-lg bg-base-800 ring-1 ring-inset ring-base-700/60 sm:w-64"
      >
        {featured.thumbnailUrl ? (
          <img src={featured.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-base-800 to-base-700 text-2xl font-semibold tabular-nums text-zinc-500">
            {String(featured.lessonNumber).padStart(2, "0")}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-base-950/25 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-500 text-base-950">
            <svg width="14" height="16" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true">
              <path d="M1 1.5v19l18-9.5-18-9.5Z" />
            </svg>
          </span>
        </div>
        {/* Thin overall-progress bar along the bottom edge — same spot a
            YouTube thumbnail shows in-video progress, repurposed here for
            "how far through the course you are". */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-base-950/50">
          <div className="h-full bg-accent-500" style={{ width: `${percent}%` }} />
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <p className="kicker">{t("learn.progress_kicker")}</p>
        <h1 className="mt-1.5 text-2xl font-semibold text-zinc-50 sm:text-3xl">{t("site.brand_name")}</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {t("learn.hero_lessons_count", { count: total })} · {completedCount}/{total} {t("learn.progress_label")}
        </p>
        <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-base-800">
          <div className="h-full rounded-full bg-accent-500 transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <Link
          to={`/lesson/${featured.lessonNumber}`}
          className="focus-ring mt-4 inline-flex items-center justify-center rounded-md bg-accent-500 px-5 py-2.5 text-sm font-medium text-base-950 transition-colors duration-150 hover:bg-accent-400"
        >
          {started ? t("learn.hero_play_button") : t("learn.hero_start_button")}
        </Link>
      </div>
    </div>
  );
}
