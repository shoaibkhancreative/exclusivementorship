import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OutlineResponse } from "../lib/api";
import { LoadingScreen } from "../components/ui";
import { OutlineList } from "../components/OutlineList";

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

      <OutlineList items={data.outline} activeLessonNumber={data.currentLesson} />
    </div>
  );
}
