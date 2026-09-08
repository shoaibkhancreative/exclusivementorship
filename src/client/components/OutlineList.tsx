import { Link } from "react-router-dom";
import type { OutlineItem, SemesterMeta } from "../lib/api";

/**
 * The only two states that get a mark at all: a thin check for completed,
 * a small filled dot for the one you're on. Everything else (available,
 * preview, locked) is communicated by text color and opacity alone, so
 * there's nothing extra to decode.
 */
function Marker({ state }: { state: OutlineItem["state"] }) {
  if (state === "completed") {
    return (
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" className="mt-0.5 flex-none text-accent-500">
        <path d="M2.5 7.2 5.4 10 11.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (state === "current") {
    return (
      <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true" className="mt-1.5 flex-none">
        <circle cx="4" cy="4" r="4" className="fill-accent-500" />
      </svg>
    );
  }
  return <span className="w-[13px] flex-none" aria-hidden="true" />;
}

/**
 * Renders the full class list, grouped under a semester name where the
 * chapter changes. No card borders, no divider rules, no per-row
 * background — grouping and hierarchy come from spacing and type alone.
 * Each row carries a number, title, an optional one-line tagline, and a
 * state marker. Shared between the Learn index page and the embedded
 * outline on the Lesson page.
 */
export function OutlineList({
  items,
  activeLessonNumber,
  semesters
}: {
  items: OutlineItem[];
  activeLessonNumber?: number;
  semesters?: SemesterMeta[];
}) {
  const semesterByChapter = new Map((semesters ?? []).map((s) => [s.chapterName, s]));

  return (
    <div>
      {items.map((item, index) => {
        // Only a genuine out-of-sequence lock disables the row. A
        // payment-gated class the learner has already reached ("preview")
        // stays navigable and looks the same as any other class here — the
        // Lesson page itself explains the gate once they open it.
        const locked = item.state === "locked";
        const isActive = item.lessonNumber === activeLessonNumber;

        const prevItem = index > 0 ? items[index - 1] : null;
        const showHeader = !prevItem || item.chapterName !== prevItem.chapterName;
        const semester = semesterByChapter.get(item.chapterName);

        const header = showHeader ? (
          <div className={index === 0 ? "mb-4" : "mb-4 mt-10"}>
            <div className="text-sm font-medium text-zinc-300">{semester ? semester.name : item.chapterName}</div>
            {semester?.tagline && <div className="mt-0.5 text-[13px] text-zinc-600">{semester.tagline}</div>}
          </div>
        ) : null;

        const row = (
          <div className={`flex items-start gap-4 py-3 ${locked ? "opacity-35" : "text-zinc-100"}`}>
            <span className="w-5 flex-none pt-0.5 text-[13px] tabular-nums text-zinc-600">
              {String(item.lessonNumber).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[15px] ${isActive ? "text-accent-400" : ""}`}>{item.title}</div>
              {item.tagline && <div className="mt-0.5 line-clamp-1 text-[13px] text-zinc-500">{item.tagline}</div>}
            </div>
            <Marker state={item.state} />
          </div>
        );

        return (
          <div key={item.lessonNumber}>
            {header}
            {locked ? (
              <div aria-disabled="true">{row}</div>
            ) : (
              <Link
                to={`/lesson/${item.lessonNumber}`}
                className="focus-ring -mx-3 block rounded px-3 transition-colors hover:bg-base-900/50"
                aria-current={isActive ? "true" : undefined}
              >
                {row}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}