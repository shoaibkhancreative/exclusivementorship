import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { OutlineItem, SemesterMeta } from "../lib/api";

function PlayGlyph() {
  return (
    <svg width="13" height="14" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true">
      <path d="M1 1.5v19l18-9.5-18-9.5Z" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="11" height="12" viewBox="0 0 12 13" aria-hidden="true">
      <rect x="1.5" y="5.5" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M3.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2.5 7.2 5.4 10 11.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function FilmGlyph() {
  // Placeholder art for classes without a thumbnail yet — a plain film
  // frame instead of a blank tile, so the grid never looks broken.
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v14M16 5v14M3 9.5h5M3 14.5h5M16 9.5h5M16 14.5h5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * A single class's thumbnail tile — the visual core of the playlist-style
 * row. State is read entirely off the image itself (a YouTube-playlist
 * habit worth borrowing): a lightly dimmed image + a small padlock on a
 * soft round backing for anything locked, a filled play badge for
 * whichever class this *page* is currently showing (independent of
 * progress — this is "what's open right now", not "what's next"), and a
 * small check badge for anything already finished. A duration badge
 * (admin-entered, see migration 0018) sits in the opposite corner from the
 * check badge whenever one is set. Nothing else on the row needs to repeat
 * that information.
 */
function Thumbnail({
  item,
  isActive,
  size
}: {
  item: OutlineItem;
  isActive: boolean;
  size: "full" | "compact";
}) {
  const locked = item.state === "locked";
  const completed = item.state === "completed";
  // Noticeably bigger than before at every size, while keeping the tile's
  // width scale gracefully from small phones up through the row's own
  // breakpoints — a single fixed pixel width would either overflow a
  // narrow phone screen or look cramped on a wide one.
  const dims = size === "full" ? "w-[150px] sm:w-[192px] lg:w-[208px]" : "w-[124px] sm:w-[144px] lg:w-[152px]";

  return (
    <div
      className={`relative aspect-video flex-none overflow-hidden rounded-md border bg-base-800 ${dims} ${
        isActive ? "border-accent-500/70" : "border-base-800"
      }`}
    >
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          // Locked thumbnails used to be dimmed almost to invisibility —
          // now the image itself stays nearly full-strength (a hint of
          // desaturation is enough to read as "not available yet") and the
          // separate dark wash below carries the rest of the "locked"
          // signal, so the class is still clearly recognizable at a glance.
          className={`h-full w-full object-cover ${locked ? "opacity-90 grayscale-[0.15]" : ""}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-600">
          <FilmGlyph />
        </div>
      )}

      {locked && (
        <div className="absolute inset-0 flex items-center justify-center bg-base-950/15">
          {/* Small lock glyph on a subtle round backing, not a large icon
              floating directly on the image. */}
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-base-950/55 text-zinc-100 backdrop-blur-[1px]">
            <LockGlyph />
          </span>
        </div>
      )}

      {!locked && isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-base-950/20">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 pl-0.5 text-base-950 shadow-sm">
            <PlayGlyph />
          </span>
        </div>
      )}

      {!locked && !isActive && completed && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-base-950/75 text-accent-400">
          <CheckGlyph />
        </span>
      )}

      {item.durationLabel && (
        <span className="absolute bottom-1 right-1 rounded bg-base-950/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-100">
          {item.durationLabel}
        </span>
      )}
    </div>
  );
}

/**
 * Renders the full class list, grouped under a semester name where the
 * chapter changes. Shared between the Learn index page (`variant="full"`,
 * larger thumbnails, chapter headers) and the playlist panel embedded on
 * the Lesson page (`variant="compact"`, tighter rows, no tagline) — same
 * data, same row semantics, just different density so each fits its
 * context, exactly like YouTube reuses one playlist-row pattern for both
 * its playlist page and its "up next" sidebar.
 */
export function OutlineList({
  items,
  activeLessonNumber,
  semesters,
  variant = "full",
  scrollActiveIntoView = false
}: {
  items: OutlineItem[];
  activeLessonNumber?: number;
  semesters?: SemesterMeta[];
  variant?: "full" | "compact";
  scrollActiveIntoView?: boolean;
}) {
  const semesterByChapter = new Map((semesters ?? []).map((s) => [s.chapterName, s]));
  const activeRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollActiveIntoView || !activeRowRef.current) return;
    // Instant, not smooth — this panel is meant to already look "opened
    // scrolled to the right spot", the same way YouTube's own playlist
    // sidebar never animates its initial scroll position.
    activeRowRef.current.scrollIntoView({ block: "center", behavior: "auto" });
  }, [scrollActiveIntoView, activeLessonNumber]);

  const compact = variant === "compact";

  return (
    <div>
      {items.map((item, index) => {
        // Locked rows are still navigable (see the Link below) — this flag
        // only controls the row's visual treatment, not whether it can be
        // clicked.
        const locked = item.state === "locked";
        const isActive = item.lessonNumber === activeLessonNumber;
        const isNextUp = item.state === "current" && !isActive;

        const prevItem = index > 0 ? items[index - 1] : null;
        const showHeader = !prevItem || item.chapterName !== prevItem.chapterName;
        const semester = semesterByChapter.get(item.chapterName);

        const header = showHeader ? (
          <div className={`border-b border-base-800 ${compact ? "pb-2" : "pb-3"} ${index === 0 ? "mb-3" : `mb-3 ${compact ? "mt-6" : "mt-10"}`}`}>
            <h2 className={`font-semibold tracking-tight text-zinc-100 ${compact ? "text-[13px]" : "text-lg"}`}>
              {semester ? semester.name : item.chapterName}
            </h2>
            {!compact && semester?.tagline && <p className="mt-1 text-[13px] text-zinc-500">{semester.tagline}</p>}
          </div>
        ) : null;

        // The active row gets a faint accent wash so "where you are" reads
        // instantly on a long list, not just from the thumbnail overlay.
        // A "next up" (but not currently open) row gets a subtler dot on
        // its index instead — present but not competing with the active row.
        const row = (
          <div
            className={`flex items-center rounded-md ${compact ? "gap-2.5 px-2 py-2" : "gap-3.5 px-3 py-3"} ${
              locked ? "text-zinc-500" : "text-zinc-100"
            } ${isActive ? "bg-accent-500/[0.07]" : ""}`}
          >
            <span
              className={`flex-none pt-0 text-center tabular-nums ${compact ? "w-4 text-[11px]" : "w-5 text-[13px]"} ${
                isActive || isNextUp ? "font-medium text-accent-500" : "text-zinc-600"
              }`}
            >
              {String(item.lessonNumber).padStart(2, "0")}
            </span>

            <Thumbnail item={item} isActive={isActive} size={compact ? "compact" : "full"} />

            <div className="min-w-0 flex-1">
              <div
                className={`${
                  compact ? "line-clamp-2 text-[13px] leading-snug" : "line-clamp-2 text-[14px] leading-snug sm:truncate sm:text-[15px] sm:leading-normal"
                } ${isActive ? "font-medium text-accent-400" : ""}`}
              >
                {item.title}
              </div>
              {!compact && item.tagline && <div className="mt-0.5 line-clamp-1 text-[13px] text-zinc-500">{item.tagline}</div>}
              {compact && locked && <div className="mt-0.5 text-[11px] text-zinc-600">Locked</div>}
            </div>
          </div>
        );

        // Cascade the first screenful of rows in one after another instead
        // of every row snapping in at once; capped so a long course list
        // doesn't leave the last rows waiting on a visible delay.
        const staggerStyle = { "--delay": `${Math.min(index, 10) * 30}ms` } as CSSProperties;

        return (
          <div key={item.lessonNumber} ref={isActive ? activeRowRef : undefined} className="list-item-enter" style={staggerStyle}>
            {header}
            {/* Locked rows are navigable too — the Lesson page itself shows
                the thumbnail behind a locked overlay and explains why
                (finish the previous class, or unlock the mentorship), so
                there's no dead end here anymore. */}
            <Link
              to={`/lesson/${item.lessonNumber}`}
              className={`focus-ring block rounded-md transition-all duration-150 hover:bg-base-900/50 ${
                compact ? "-mx-2" : "-mx-3 hover:translate-x-0.5"
              }`}
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
