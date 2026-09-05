import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OutlineResponse } from "../lib/api";
import { LoadingScreen } from "../components/ui";

const STATE_ICON: Record<string, string> = {
  completed: "✓",
  current: "▶",
  available: "○",
  locked: "🔒"
};

export default function Learn() {
  const [data, setData] = useState<OutlineResponse | null>(null);

  useEffect(() => {
    api.get<OutlineResponse>("/lessons").then(setData);
  }, []);

  if (!data) return <LoadingScreen />;

  const freeCompleted = data.outline.filter((l) => l.isFree && l.state === "completed").length;
  const currentItem = data.outline.find((l) => l.lessonNumber === data.currentLesson);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-50">Welcome back.</h1>
        {currentItem && (
          <p className="mt-1 text-sm text-zinc-400">
            Continue:{" "}
            <Link to={`/lesson/${currentItem.lessonNumber}`} className="text-accent-400 hover:underline">
              Lesson {String(currentItem.lessonNumber).padStart(2, "0")} — {currentItem.title}
            </Link>
          </p>
        )}
        {data.courseStatus === "free" && (
          <p className="mt-2 text-xs text-zinc-500">
            Progress: {freeCompleted} / {data.freeLessonCount} Free Lessons
          </p>
        )}
      </div>

      <div className="space-y-2">
        {data.outline.map((item) => {
          const locked = item.state === "locked";
          const content = (
            <div
              className={`flex items-center gap-4 rounded-lg border border-base-700 bg-base-900 px-4 py-3 ${
                locked ? "opacity-50" : "hover:border-accent-500/60"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-base-800 text-xs text-zinc-500">
                {String(item.lessonNumber).padStart(2, "0")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-100">{item.title}</div>
                <div className="text-xs text-zinc-500">{item.chapterName}</div>
              </div>
              <div className="text-base">{STATE_ICON[item.state]}</div>
            </div>
          );

          return locked ? (
            <div key={item.lessonNumber}>{content}</div>
          ) : (
            <Link key={item.lessonNumber} to={`/lesson/${item.lessonNumber}`} className="focus-ring block rounded-lg">
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
