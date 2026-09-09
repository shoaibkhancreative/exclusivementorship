import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import type { OutlineItem, SemesterMeta } from "../lib/api";

/**
 * State → icon, one-to-one, so nothing needs a legend:
 * - completed: thin check
 * - current: filled dot
 * - locked: a small padlock, so an out-of-sequence class reads as
 *   "locked" at a glance instead of just quietly missing a mark
 * - available / preview: no icon — the row's own (fully legible) text
 *   color is the only signal needed
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
  if (state === "locked") {
    return (
      <svg width="12" height="13" viewBox="0 0 12 13" aria-hidden="true" className="mt-0.5 flex-none text-zinc-500">
        <rect x="1.5" y="5.5" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M3.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  return <span className="w-[13px] flex-none" aria-hidden="true" />;
}

/**
 * Renders the full class list, grouped under a semester name where the
 * chapter changes. No card borders, no per-row background — grouping and
 * hierarchy come from spacing and type alone. A hairline rule under each
 * chapter title gives the section its own clear header without adding a
 * box around it. Each row carries a number, title, an optional one-line
 * tagline, and a state marker. Shared between the Learn index page and
 * the embedded outline on the Lesson page.
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
        // Locked rows are still navigable (see the Link below) — this flag
        // only controls the row's visual treatment (muted text + padlock
        // marker), not whether it can be clicked.
        const locked = item.state === "locked";
        const isActive = item.lessonNumber === activeLessonNumber;

        const prevItem = index > 0 ? items[index - 1] : null;
        const showHeader = !prevItem || item.chapterName !== prevItem.chapterName;
        const semester = semesterByChapter.get(item.chapterName);

        const header = showHeader ? (
          <div className={`border-b border-base-800 pb-3 ${index === 0 ? "mb-4" : "mb-4 mt-10"}`}>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
              {semester ? semester.name : item.chapterName}
            </h2>
            {semester?.tagline && <p className="mt-1 text-[13px] text-zinc-500">{semester.tagline}</p>}
          </div>
        ) : null;

        // The active row gets a faint accent wash so "where you are" reads
        // instantly on a long list, not just from the small dot marker.
        // Locked rows stay fully legible (muted color, not low opacity) so
        // the title is easy to read — the padlock icon is what marks them
        // as locked, not faded-out text.
        const row = (
          <div
            className={`flex items-start gap-4 rounded-md px-3 py-3 ${locked ? "text-zinc-500" : "text-zinc-100"} ${
              isActive ? "bg-accent-500/[0.06]" : ""
            }`}
          >
            <span className={`w-5 flex-none pt-0.5 text-[13px] tabular-nums ${isActive ? "text-accent-500" : "text-zinc-600"}`}>
              {String(item.lessonNumber).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[15px] ${isActive ? "font-medium text-accent-400" : ""}`}>{item.title}</div>
              {item.tagline && <div className="mt-0.5 line-clamp-1 text-[13px] text-zinc-500">{item.tagline}</div>}
            </div>
            <Marker state={item.state} />
          </div>
        );

        // Cascade the first screenful of rows in one after another instead
        // of every row snapping in at once; capped so a long course list
        // doesn't leave the last rows waiting on a visible delay.
        const staggerStyle = { "--delay": `${Math.min(index, 10) * 30}ms` } as CSSProperties;

        return (
          <div key={item.lessonNumber} className="list-item-enter" style={staggerStyle}>
            {header}
            {/* Locked rows are navigable too — the Lesson page itself shows
                the thumbnail behind a locked overlay and explains why
                (finish the previous class, or unlock the mentorship), so
                there's no dead end here anymore. */}
            <Link
              to={`/lesson/${item.lessonNumber}`}
              className="focus-ring -mx-3 block rounded-md transition-all duration-150 hover:translate-x-0.5 hover:bg-base-900/50"
              aria-current={isActive ? "true" : undefined}
              aria-disabled={locked ? "true" : undefined}
            >
              {row}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
