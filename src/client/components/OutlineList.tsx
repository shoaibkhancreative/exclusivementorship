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
            className={`flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors ${
              isActive ? "border-accent-500/60 bg-accent-500/10" : "border-base-700 bg-base-900"
            } ${locked ? "opacity-50" : preview ? "opacity-80" : isActive ? "" : "hover:border-accent-500/60"}`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-base-800 text-xs text-zinc-500">
              {String(item.lessonNumber).padStart(2, "0")}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm font-medium ${isActive ? "text-accent-300" : "text-zinc-100"}`}>
                {item.title}
              </div>
              <div className="text-xs text-zinc-500">{item.chapterName}</div>
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
