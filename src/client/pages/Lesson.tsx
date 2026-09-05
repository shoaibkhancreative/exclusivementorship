import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type LessonDetail, type OutlineResponse } from "../lib/api";
import { Button, LoadingScreen } from "../components/ui";
import { OutlineList } from "../components/OutlineList";
import { TelegramAccessPanel } from "../components/TelegramAccessPanel";
import { useUnlockModal } from "../lib/UnlockModalContext";

export default function Lesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openUnlockModal } = useUnlockModal();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [outline, setOutline] = useState<OutlineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLesson(null);
    setSubmitted(false);
    setSelectedFileName(null);
    setError(null);

    api
      .get<LessonDetail>(`/lessons/${id}`)
      .then((data) => {
        setLesson(data);
        setSubmitted(data.assignmentSubmitted);
        // Fire-and-forget: mark the video as viewed once the lesson loads.
        // Class 6 has no real video for free (locked preview) or paid
        // (Telegram gateway) users — skip this for it either way.
        if (!data.isTelegramGate && !data.isLocked) {
          api.post(`/lessons/${id}/complete-video`).catch(() => {});
        }
      })
      .catch((err) => {
        // A locked class is now only ever a real out-of-sequence lock (the
        // learner hasn't finished what comes before it) — send them back to
        // the outline. Payment is no longer a reason to leave this page at
        // all; Class 6 loads normally with isLocked: true instead.
        if (err instanceof ApiError && (err.code === "locked" || err.code === "payment_required")) {
          navigate("/learn", { replace: true });
        } else {
          setError("This lesson couldn't be loaded.");
        }
      });

    // Keep the course outline visible and fresh alongside the class itself —
    // this is what lets the learner switch classes without ever losing the
    // outline or returning to the main learning page.
    api
      .get<OutlineResponse>("/lessons")
      .then(setOutline)
      .catch(() => {});
  }, [id, navigate]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSelectedFileName(file ? file.name : null);
  }

  async function handleSubmitAssignment() {
    if (!lesson) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{ nextLessonNumber: number; showPremiumGate: boolean }>(
        `/lessons/${id}/submit-assignment`,
        { fileName: selectedFileName }
      );
      setSubmitted(true);
      setSelectedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setTimeout(() => {
        // The next class (6) is always navigable now, even for free users —
        // it just shows a locked preview until they pay.
        navigate(`/lesson/${result.nextLessonNumber}`);
      }, 900);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-red-400">{error}</div>;
  }
  if (!lesson) return <LoadingScreen />;

  const lessonNumber = lesson.lessonNumber;
  const items = outline?.outline ?? [];
  const idx = items.findIndex((item) => item.lessonNumber === lessonNumber);
  const prevItem = idx > 0 ? items[idx - 1] : null;
  const nextItem = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;
  const canGoPrev = Boolean(prevItem) && prevItem!.state !== "locked";
  // "preview" (payment-gated but sequentially reached) is always navigable —
  // only a real out-of-sequence "locked" state disables Next.
  const canGoNext = Boolean(nextItem) && nextItem!.state !== "locked";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          {lesson.chapterName} · Lesson {String(lessonNumber).padStart(2, "0")}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => prevItem && navigate(`/lesson/${prevItem.lessonNumber}`)}
            className="focus-ring rounded-lg border border-base-700 px-3 py-2 text-zinc-400 transition-colors hover:border-accent-500 hover:text-accent-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-base-700 disabled:hover:text-zinc-400"
          >
            ← Previous
          </button>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => nextItem && navigate(`/lesson/${nextItem.lessonNumber}`)}
            className="focus-ring rounded-lg border border-base-700 px-3 py-2 text-zinc-400 transition-colors hover:border-accent-500 hover:text-accent-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-base-700 disabled:hover:text-zinc-400"
          >
            Next →
          </button>
        </div>
      </div>

      <h1 className="mb-4 text-lg font-semibold text-zinc-50 sm:text-xl">{lesson.title}</h1>

      {lesson.isTelegramGate ? (
        <div className="mb-10">
          <TelegramAccessPanel />
        </div>
      ) : lesson.isLocked ? (
        <div className="mb-10">
          <div className="relative mb-5 aspect-video overflow-hidden rounded-xl border border-base-700 bg-black">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-black/40 to-black/80 px-6 text-center">
              <button
                type="button"
                onClick={openUnlockModal}
                aria-label="Unlock to play this class"
                className="focus-ring flex h-16 w-16 items-center justify-center rounded-full bg-accent-500 text-2xl text-base-950 shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                ▶
              </button>
              <p className="text-sm font-medium text-zinc-100">This class is part of Exclusive Mentorship</p>
              <p className="text-xs text-zinc-400">Tap play to unlock and continue.</p>
            </div>
          </div>
          {lesson.description && <p className="mb-6 text-sm leading-relaxed text-zinc-400">{lesson.description}</p>}
        </div>
      ) : (
        <>
          <div className="mb-5 aspect-video overflow-hidden rounded-xl border border-base-700 bg-black">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${lesson.youtubeVideoId}?rel=0&modestbranding=1`}
              title={lesson.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          {lesson.description && <p className="mb-8 text-sm leading-relaxed text-zinc-400">{lesson.description}</p>}

          {lesson.assignmentTitle && (
            <div className="mb-10 rounded-xl border border-base-700 bg-base-900 p-5">
              <h2 className="mb-1 text-sm font-semibold text-zinc-100">{lesson.assignmentTitle}</h2>
              {lesson.assignmentInstruction && (
                <p className="mb-4 text-sm text-zinc-400">{lesson.assignmentInstruction}</p>
              )}

              {submitted ? (
                <p className="text-sm text-accent-400">Assignment submitted. Your next lesson is now unlocked.</p>
              ) : (
                <div className="space-y-3">
                  <label className="focus-ring flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-base-600 px-4 py-3 text-sm text-zinc-400 hover:border-accent-500">
                    <span>{selectedFileName ?? "Upload Assignment (PDF, PNG, JPG, DOCX)"}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.docx"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button onClick={handleSubmitAssignment} disabled={submitting} className="w-full">
                    {submitting ? "Submitting…" : "Submit Assignment"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Course outline stays visible on every class so learners never lose
          their place or have to go back to the main learning page. */}
      <div className="border-t border-base-700 pt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Course Outline</h2>
        {!outline ? (
          <p className="text-sm text-zinc-500">Loading outline…</p>
        ) : (
          <OutlineList items={items} activeLessonNumber={lessonNumber} />
        )}
      </div>
    </div>
  );
}
