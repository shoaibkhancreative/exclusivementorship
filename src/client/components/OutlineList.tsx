import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { OutlineItem, SemesterMeta } from "../lib/api";
import { IllustrationBadge } from "./IllustrationBadge";
import { useContent } from "../lib/useContent";

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

/**
 * Small "i" info mark — a plain outline circle with a dot and stem, same
 * flat single-stroke language as every other glyph on this row (lock/
 * check/play above). Sits as a quiet corner affordance on each chapter's
 * tinted block; tapping it is the only way to see that chapter's name and
 * description, so nothing else needs to print that text inline.
 */
function InfoGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.3v4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
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
  // xl bump added for wide/multi-monitor desktops — "full" size only, since
  // that's the only variant given the extra room to grow (Learn page's
  // right column widens past lg too; see Learn.tsx). "compact" stays as-is,
  // it's the fixed-width Lesson-page sidebar panel regardless of screen size.
  const dims = size === "full" ? "w-[150px] sm:w-[192px] lg:w-[208px] xl:w-[224px]" : "w-[124px] sm:w-[144px] lg:w-[152px]";

  return (
    <div
      // A border matched to the page background (border-base-800) used to be
      // the only edge definition here — invisible the moment a thumbnail's
      // own art happened to land on a similarly warm/cream tone. A real drop
      // shadow plus a neutral (colorless) ring gives every tile a visible
      // edge and a slight lift off the page regardless of what color the
      // thumbnail art itself is.
      className={`relative aspect-video flex-none overflow-hidden rounded-md bg-base-800 shadow-[0_1px_3px_rgba(28,27,23,0.16),0_1px_2px_rgba(28,27,23,0.10)] ring-1 ${dims} ${
        isActive ? "ring-accent-500/70" : "ring-black/10"
      }`}
    >
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          // Locked thumbnails now stay exactly as clear as unlocked ones —
          // no dimming/desaturation — since the small lock badge on top is
          // by itself enough to read as "locked".
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-600">
          <FilmGlyph />
        </div>
      )}

      {locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Small lock glyph on a subtle round backing, not a large icon
              floating directly on the image. No dark wash behind it anymore —
              the thumbnail underneath stays fully clear/visible. */}
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
        // Was a translucent cream chip (bg-base-950/80) with dark text — the
        // same warm tone as the page and most thumbnail art, so it barely
        // read as a badge. A solid dark chip with light text (the same
        // high-contrast pairing YouTube itself uses for duration badges)
        // stays legible no matter what's underneath it.
        <span className="absolute bottom-1 right-1 rounded bg-zinc-100/90 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-base-950">
          {item.durationLabel}
        </span>
      )}
    </div>
  );
}

/**
 * "No classes published yet" hero — same one-shape warm-illustration
 * language as the rest of the site (see UnlockModal's GiftBadge/ClockBadge,
 * Learn.tsx's RetryBadge). Only shown for the full-page variant; the
 * compact sidebar panel never reaches an empty list in practice, and
 * showing a full hero there would be clutter in that tight space.
 */
function EmptyOutline({ message }: { message: string }) {
  return (
    <div className="page-enter py-12 text-center sm:py-16">
      <IllustrationBadge size={72} bg="rgba(230,57,70,0.1)">
        <svg viewBox="0 0 64 64" width={34} height={34} aria-hidden="true">
          <rect x="12" y="14" width="40" height="36" rx="6" fill="#e63946" opacity="0.16" />
          <path d="M12 22h40" stroke="#e63946" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M22 12v8M42 12v8" stroke="#e63946" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="26" cy="35" r="3" fill="#e63946" />
          <circle cx="38" cy="35" r="3" fill="#e63946" />
          <circle cx="26" cy="43" r="3" fill="#e63946" opacity="0.5" />
        </svg>
      </IllustrationBadge>
      <p className="mx-auto mt-5 max-w-xs text-sm leading-snug text-zinc-400">{message}</p>
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
  const { t } = useContent();

  // Which chapter's info popover is open (at most one at a time) — the
  // *only* place a chapter's name/description shows now. No header text,
  // no dropdown/accordion sits in the row flow itself; a chapter is
  // otherwise just a subtly tinted band of rows, closer to a plain
  // YouTube playlist than a sectioned course outline.
  const [openInfoChapter, setOpenInfoChapter] = useState<string | null>(null);
  const chapterBlockRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!openInfoChapter) return;
    function handlePointerDown(e: MouseEvent) {
      const el = chapterBlockRefs.current.get(openInfoChapter as string);
      if (el && !el.contains(e.target as Node)) setOpenInfoChapter(null);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenInfoChapter(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openInfoChapter]);

  useEffect(() => {
    if (!scrollActiveIntoView || !activeRowRef.current) return;
    // Instant, not smooth — this panel is meant to already look "opened
    // scrolled to the right spot", the same way YouTube's own playlist
    // sidebar never animates its initial scroll position.
    activeRowRef.current.scrollIntoView({ block: "center", behavior: "auto" });
  }, [scrollActiveIntoView, activeLessonNumber]);

  const compact = variant === "compact";

  if (items.length === 0 && !compact) {
    return <EmptyOutline message={t("learn.empty_state")} />;
  }

  // Index within the *whole* list (not the chapter) — kept for the same
  // staggered entrance timing the flat list always used, regardless of
  // which chapter a row happens to render inside once grouped.
  const flatIndexByLessonNumber = new Map(items.map((item, i) => [item.lessonNumber, i]));

  const renderRow = (item: OutlineItem) => {
    // Locked rows are still navigable (see the Link below) — this flag
    // only controls the row's visual treatment, not whether it can be
    // clicked.
    const locked = item.state === "locked";
    const isActive = item.lessonNumber === activeLessonNumber;
    const isNextUp = item.state === "current" && !isActive;
    const index = flatIndexByLessonNumber.get(item.lessonNumber) ?? 0;

    // The active row gets a faint accent wash so "where you are" reads
    // instantly on a long list, not just from the thumbnail overlay.
    // A "next up" (but not currently open) row gets a subtler dot on
    // its index instead — present but not competing with the active row.
    // The index number itself only prints in the compact "up next" panel —
    // that matches YouTube's own split: its playlist page never numbers
    // rows (just thumbnail + duration badge), only its watch-page sidebar
    // does.
    const row = (
      <div
        className={`flex items-center rounded-md ${compact ? "gap-2.5 px-2 py-2" : "gap-3.5 px-3 py-3"} ${
          locked ? "text-zinc-500" : "text-zinc-100"
        } ${isActive ? "bg-accent-500/[0.07]" : ""}`}
      >
        {compact && (
          <span
            className={`flex-none w-4 pt-0 text-center text-[11px] tabular-nums ${
              isActive || isNextUp ? "font-medium text-accent-500" : "text-zinc-600"
            }`}
          >
            {String(item.lessonNumber).padStart(2, "0")}
          </span>
        )}

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
  };

  // Compact (Lesson-page "up next" panel): a flat, continuous numbered
  // list with no section text anywhere — this is exactly how YouTube's
  // own watch-page sidebar behaves, it never prints a chapter/section
  // label between entries, just number + thumbnail + title straight down
  // the list. (The Learn/playlist page below drops numbers instead, to
  // match YouTube's *other* list style — see the "full" branch.)
  if (compact) {
    return <div>{items.map((item) => renderRow(item))}</div>;
  }

  // Group consecutive items by chapter — used below only to decide the
  // tinted band boundaries and which name/tagline the info popover shows,
  // never rendered as a heading in the row flow itself.
  const groups: { chapterName: string; semester?: SemesterMeta; groupItems: OutlineItem[] }[] = [];
  for (const item of items) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.chapterName === item.chapterName) {
      lastGroup.groupItems.push(item);
    } else {
      groups.push({ chapterName: item.chapterName, semester: semesterByChapter.get(item.chapterName), groupItems: [item] });
    }
  }

  // Full (Learn index page): a flat, YouTube-plain row list — no chapter
  // title, no tagline line, no collapse control anywhere in the row flow.
  // Chapters are told apart only by a soft background tint on their block
  // of rows (cycling through a small set of brand-only, low-opacity
  // washes so it never reads as a "new" color, just a lighter/darker
  // band), plus a small "i" mark in the corner of each block — the one
  // and only place a chapter's name and description appear, in a small
  // popover, on demand.
  const CHAPTER_TINTS = ["bg-transparent", "bg-base-800/35", "bg-accent-500/[0.045]", "bg-highlight-500/[0.06]"];

  return (
    <div className="space-y-3">
      {groups.map((group, groupIndex) => {
        const label = group.semester?.name ?? group.chapterName;
        const tagline = group.semester?.tagline;
        const tint = CHAPTER_TINTS[groupIndex % CHAPTER_TINTS.length];
        const infoOpen = openInfoChapter === group.chapterName;

        return (
          <div
            key={group.chapterName}
            ref={(el) => {
              if (el) chapterBlockRefs.current.set(group.chapterName, el);
              else chapterBlockRefs.current.delete(group.chapterName);
            }}
            // pt-10 (up from pt-8) only applies below `lg` — the extra 8px
            // is just breathing room for the enlarged info button above
            // (see InfoGlyph button below). At `lg`+ this reverts to the
            // original pt-8, which Learn.tsx's cover-card `lg:mt-6` offset
            // is pixel-tuned against (see the comment there) — changing it
            // there too would throw off the cover/first-thumbnail
            // alignment on desktop, which is out of scope for this pass.
            className={`relative rounded-2xl px-1 pb-1 pt-10 sm:px-2 lg:pt-8 ${tint}`}
          >
            {/* The only entry point to this chapter's name/description —
                a quiet corner mark, not a header competing with the rows
                for attention. */}
            <button
              type="button"
              onClick={() => setOpenInfoChapter((cur) => (cur === group.chapterName ? null : group.chapterName))}
              aria-expanded={infoOpen}
              aria-label={`${label} — chapter details`}
              // A quiet corner mark, but it's the ONLY way to reach a
              // chapter's name/description — h-6/w-6 (24px) was well under
              // a comfortable tap target on a phone. Grown to h-9/w-9
              // (36px) below `lg` only; reverts to the original h-6/w-6 at
              // `lg`+ so desktop's look is byte-for-byte unchanged.
              className="focus-ring absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-base-950/10 text-zinc-500 transition-colors hover:bg-base-950/20 hover:text-zinc-700 lg:right-2 lg:top-2 lg:h-6 lg:w-6"
            >
              <InfoGlyph />
            </button>

            {infoOpen && (
              <div className="animate-scale-in absolute right-1 top-11 z-20 w-64 max-w-[85vw] origin-top-right rounded-xl border border-base-700 bg-base-900 p-3.5 shadow-lg shadow-base-800/30 lg:right-2 lg:top-9">
                <p className="text-[13px] font-semibold text-zinc-100">{label}</p>
                {tagline && <p className="mt-1 text-[12px] leading-snug text-zinc-500">{tagline}</p>}
              </div>
            )}

            {group.groupItems.map((item) => renderRow(item))}
          </div>
        );
      })}
    </div>
  );
}