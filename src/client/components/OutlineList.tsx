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
      <path
        d="M3.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M2.5 7.2 5.4 10 11.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

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
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v14M16 5v14M3 9.5h5M3 14.5h5M16 9.5h5M16 14.5h5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function Thumbnail({ item, isActive, size }: { item: OutlineItem; isActive: boolean; size: "full" | "compact" }) {
  const locked = item.state === "locked";
  const completed = item.state === "completed";
  const dims =
    size === "full" ? "w-[150px] sm:w-[192px] lg:w-[208px] xl:w-[224px]" : "w-[124px] sm:w-[144px] lg:w-[152px]";

  return (
    <div
      className={`relative aspect-video flex-none overflow-hidden rounded-md bg-base-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.7)] ring-1 ${dims} ${
        isActive ? "ring-accent-500/70" : "ring-white/10"
      }`}
    >
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-600">
          <FilmGlyph />
        </div>
      )}

      {locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-[1px]">
            <LockGlyph />
          </span>
        </div>
      )}

      {!locked && isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 pl-0.5 text-base-950 shadow-sm">
            <PlayGlyph />
          </span>
        </div>
      )}

      {!locked && !isActive && completed && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-accent-300">
          <CheckGlyph />
        </span>
      )}

      {item.durationLabel && (
        <span className="absolute bottom-1 right-1 rounded bg-base-900/90 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-50 shadow-sm">
          {item.durationLabel}
        </span>
      )}
    </div>
  );
}

function EmptyOutline({ message }: { message: string }) {
  return (
    <div className="page-enter py-12 text-center sm:py-16">
      <IllustrationBadge size={72} bg="rgba(18,196,107,0.12)">
        <svg viewBox="0 0 64 64" width={34} height={34} aria-hidden="true">
          <rect x="12" y="14" width="40" height="36" rx="6" fill="#12C46B" opacity="0.14" />
          <path d="M12 22h40" stroke="#12C46B" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M22 12v8M42 12v8" stroke="#12C46B" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="26" cy="35" r="3" fill="#12C46B" />
          <circle cx="38" cy="35" r="3" fill="#12C46B" />
          <circle cx="26" cy="43" r="3" fill="#12C46B" opacity="0.5" />
        </svg>
      </IllustrationBadge>
      <p className="mx-auto mt-5 max-w-xs text-sm leading-snug text-zinc-400">{message}</p>
    </div>
  );
}

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
    activeRowRef.current.scrollIntoView({ block: "center", behavior: "auto" });
  }, [scrollActiveIntoView, activeLessonNumber]);

  const compact = variant === "compact";

  if (items.length === 0 && !compact) {
    return <EmptyOutline message={t("learn.empty_state")} />;
  }

  const flatIndexByLessonNumber = new Map(items.map((item, i) => [item.lessonNumber, i]));

  const renderRow = (item: OutlineItem) => {
    const locked = item.state === "locked";
    const isActive = item.lessonNumber === activeLessonNumber;
    const isNextUp = item.state === "current" && !isActive;
    const index = flatIndexByLessonNumber.get(item.lessonNumber) ?? 0;

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
              compact
                ? "line-clamp-2 text-[13px] leading-snug"
                : "line-clamp-2 text-[14px] leading-snug sm:truncate sm:text-[15px] sm:leading-normal"
            } ${isActive ? "font-medium text-accent-500" : ""}`}
          >
            {item.title}
          </div>
          {!compact && item.tagline && (
            <div className="mt-0.5 line-clamp-1 text-[13px] text-zinc-500">{item.tagline}</div>
          )}
          {compact && locked && <div className="mt-0.5 text-[11px] text-zinc-600">Locked</div>}
        </div>
      </div>
    );

    const staggerStyle = { "--delay": `${Math.min(index, 10) * 30}ms` } as CSSProperties;

    return (
      <div
        key={item.lessonNumber}
        ref={isActive ? activeRowRef : undefined}
        className="list-item-enter"
        style={staggerStyle}
      >
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

  if (compact) {
    return <div>{items.map((item) => renderRow(item))}</div>;
  }

  const groups: { chapterName: string; semester?: SemesterMeta; groupItems: OutlineItem[] }[] = [];
  for (const item of items) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.chapterName === item.chapterName) {
      lastGroup.groupItems.push(item);
    } else {
      groups.push({
        chapterName: item.chapterName,
        semester: semesterByChapter.get(item.chapterName),
        groupItems: [item]
      });
    }
  }

  const CHAPTER_TINTS = ["bg-transparent", "bg-base-800/35", "bg-accent-500/[0.055]", "bg-highlight-500/[0.07]"];

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
            className={`relative rounded-2xl px-1 pb-1 pt-10 sm:px-2 lg:pt-8 ${tint}`}
          >
            <button
              type="button"
              onClick={() => setOpenInfoChapter((cur) => (cur === group.chapterName ? null : group.chapterName))}
              aria-expanded={infoOpen}
              aria-label={`${label} — chapter details`}
              className="focus-ring absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-base-950/10 text-zinc-500 transition-colors hover:bg-base-950/20 hover:text-zinc-700 lg:right-2 lg:top-2 lg:h-6 lg:w-6"
            >
              <InfoGlyph />
            </button>

            {infoOpen && (
              <div className="animate-scale-in absolute right-1 top-11 z-20 w-64 max-w-[85vw] origin-top-right rounded-xl border border-base-700 bg-base-900 p-3.5 shadow-2xl shadow-black/60 lg:right-2 lg:top-9">
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
