import { Link } from "react-router-dom";
import type { OutlineItem } from "../lib/api";

export const STATE_ICON: Record<string, string> = {
  completed: "✓",
  current: "▶",
  available: "○",
  preview: "🔒",
  locked: "🔒"
};

/**
 * Renders the full class/chapter structure. Shared between the Learn index
 * page and the embedded outline on the class-learning (Lesson) page, so the
 * outline never "disappears" and always looks the same wherever it shows up.
 */
export function OutlineList({
  items,
  activeLessonNumber
}: {
  items: OutlineItem[];
  activeLessonNumber?: number;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        // "locked" = genuinely out of sequence, not navigable.
        // "preview" = payment-gated but reached — still navigable, just
        // visually muted so it reads as "almost there" rather than "done".
        const locked = item.state === "locked";
        const preview = item.state === "preview";
        const isActive = item.lessonNumber === activeLessonNumber;

        const content = (
          <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors sm:gap-4 sm:px-4 ${
              isActive ? "border-accent-500/60 bg-accent-500/10" : "border-base-700 bg-base-900"
            } ${locked ? "opacity-50" : preview ? "opacity-80" : isActive ? "" : "hover:border-accent-500/60"}`}
          >
            <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-base-800 sm:h-14 sm:w-20">
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <div className="absolute bottom-0.5 right-1 text-[10px] font-medium text-zinc-300">
                {String(item.lessonNumber).padStart(2, "0")}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm font-medium ${isActive ? "text-accent-300" : "text-zinc-100"}`}>
                {item.title}
              </div>
              {item.tagline && (
                <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{item.tagline}</div>
              )}
            </div>
            <div className="text-base" aria-hidden="true">
              {STATE_ICON[item.state]}
            </div>
          </div>
        );

        return locked ? (
          <div key={item.lessonNumber} aria-disabled="true">
            {content}
          </div>
        ) : (
          <Link
            key={item.lessonNumber}
            to={`/lesson/${item.lessonNumber}`}
            className="focus-ring block rounded-lg"
            aria-current={isActive ? "true" : undefined}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}
