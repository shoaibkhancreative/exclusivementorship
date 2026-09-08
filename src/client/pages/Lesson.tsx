import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type LessonDetail, type OutlineResponse } from "../lib/api";
import { Button, LoadingScreen } from "../components/ui";
import { OutlineList } from "../components/OutlineList";
import { VideoPlayer } from "../components/VideoPlayer";

export default function Lesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [outline, setOutline] = useState<OutlineResponse | null>(null);
  const [outlineError, setOutlineError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [showPremiumGate, setShowPremiumGate] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const loadOutline = useCallback(() => {
    setOutlineError(false);
    // Keep the course outline visible and fresh alongside the class itself —
    // this is what lets the learner switch classes without ever losing the
    // outline or returning to the main learning page.
    return api
      .get<OutlineResponse>("/lessons")
      .then(setOutline)
      .catch(() => setOutlineError(true));
  }, []);

  useEffect(() => {
    setLesson(null);
    setError(null);
    setJustCompleted(false);
    setShowPremiumGate(false);
    setShowFallback(false);

    // The fallback "mark as watched" link only appears after a short delay.
    // It exists for genuine technical failures (an ad-blocker or browser
    // extension silently blocking YouTube's completion-tracking script) —
    // not as an instant skip button. See VideoPlayer.tsx for the primary,
    // automatic detection path.
    const fallbackTimer = window.setTimeout(() => setShowFallback(true), 45000);

    api
      .get<LessonDetail>(`/lessons/${id}`)
      .then(setLesson)
      .catch((err) => {
        // A locked class is a real out-of-sequence lock (the learner hasn't
        // finished what comes before it yet) — send them back to the
        // outline. A payment-gated class the learner has actually reached
        // still loads normally with isLocked: true, so this only fires for
        // classes they haven't earned the right to open at all.
        if (err instanceof ApiError && (err.code === "locked" || err.code === "payment_required")) {
          navigate("/learn", { replace: true });
        } else {
          setError("This lesson couldn't be loaded.");
        }
      });

    loadOutline();

    return () => window.clearTimeout(fallbackTimer);
  }, [id, navigate, loadOutline]);

  /**
   * Called only once the video player itself reports the video ended (see
   * VideoPlayer's onEnded) — this is the entire "must finish this class
   * before moving on" mechanism. Never called on page load.
   */
  const handleVideoEnded = useCallback(() => {
    if (!lesson || completing || lesson.videoCompleted) return;
    setCompleting(true);
    api
      .post<{ ok: true; nextLessonNumber: number; showPremiumGate: boolean }>(`/lessons/${lesson.lessonNumber}/complete-video`)
      .then((result) => {
        setLesson((prev) => (prev ? { ...prev, videoCompleted: true } : prev));
        setJustCompleted(true);
        setShowPremiumGate(result.showPremiumGate);
        loadOutline();
      })
      .catch(() => {
        // If this fails (e.g. a stale session), the Next button below
        // simply stays disabled — nothing unlocks without the server
        // confirming it, by design.
      })
      .finally(() => setCompleting(false));
  }, [lesson, completing, loadOutline]);

  if (error) {
    return <div className="mx-auto max-w-4xl px-6 py-16 text-center text-sm text-red-400">{error}</div>;
  }
  if (!lesson) return <LoadingScreen />;

  const lessonNumber = lesson.lessonNumber;
  const items = outline?.outline ?? [];
  const idx = items.findIndex((item) => item.lessonNumber === lessonNumber);
  const prevItem = idx > 0 ? items[idx - 1] : null;
  const nextItem = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;
  const canGoPrev = Boolean(prevItem) && prevItem!.state !== "locked";
  // "preview" (payment-gated but sequentially reached) is always navigable —
  // only a real out-of-sequence "locked" state disables Next. Since the
  // next item only stops being "locked" once THIS class's video is marked
  // complete, this single check is the whole enforcement of "finish the
  // video before moving on".
  const canGoNext = Boolean(nextItem) && nextItem!.state !== "locked";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">
          {lesson.chapterName} · Lesson {String(lessonNumber).padStart(2, "0")}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => prevItem && navigate(`/lesson/${prevItem.lessonNumber}`)}
            className="focus-ring rounded-md px-3 py-2 text-zinc-400 transition-colors hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-zinc-400"
          >
            ← Previous
          </button>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => nextItem && navigate(`/lesson/${nextItem.lessonNumber}`)}
            title={!canGoNext ? "Finish this class's video to unlock the next one" : undefined}
            className="focus-ring rounded-md px-3 py-2 text-zinc-400 transition-colors hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-zinc-400"
          >
            Next →
          </button>
        </div>
      </div>

      <h1 className="mb-5 text-xl font-semibold text-zinc-50 sm:text-2xl">{lesson.title}</h1>

      {lesson.isLocked ? (
        <div className="mb-10">
          <div className="relative mb-5 aspect-video overflow-hidden rounded-md border border-base-800 bg-black">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <button
                type="button"
                onClick={() => navigate("/unlock")}
                aria-label="View Exclusive Mentorship details to unlock this class"
                className="focus-ring flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-base-950 transition-colors hover:bg-accent-400"
              >
                <svg width="18" height="20" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true">
                  <path d="M1 1.5v19l18-9.5-18-9.5Z" />
                </svg>
              </button>
              <p className="text-sm font-medium text-zinc-100">This class is part of Exclusive Mentorship</p>
              <p className="text-xs text-zinc-500">Tap play to unlock and continue.</p>
            </div>
          </div>
          {lesson.description && <p className="mb-6 text-sm leading-relaxed text-zinc-400">{lesson.description}</p>}
        </div>
      ) : (
        <>
          <div className="mb-4">
            {lesson.videoEmbedUrl ? (
              <VideoPlayer
                key={lesson.lessonNumber}
                embedUrl={lesson.videoEmbedUrl}
                title={lesson.title}
                onEnded={handleVideoEnded}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-md border border-base-800 bg-base-900 text-sm text-zinc-500">
                Video coming soon.
              </div>
            )}
          </div>

          <div className="mb-8 text-sm">
            {lesson.videoCompleted ? (
              <span className="text-accent-400">Watched — next class unlocked</span>
            ) : (
              <>
                <span className="text-zinc-500">Watch to the end to unlock the next class.</span>
                {showFallback && (
                  <button
                    type="button"
                    onClick={handleVideoEnded}
                    disabled={completing}
                    className="focus-ring ml-3 text-zinc-500 underline decoration-dotted underline-offset-2 hover:text-zinc-300 disabled:opacity-50"
                  >
                    Video finished but not unlocking? Click here
                  </button>
                )}
              </>
            )}
          </div>

          {justCompleted && showPremiumGate && (
            <div className="mb-8 rounded-md border border-base-800 p-5">
              <p className="mb-3 text-sm text-zinc-100">
                That's the last free class. Continue with Exclusive Mentorship to unlock the rest of the course.
              </p>
              <Button onClick={() => navigate("/unlock")}>See what's included</Button>
            </div>
          )}

          {lesson.description && <p className="mb-8 text-sm leading-relaxed text-zinc-400">{lesson.description}</p>}
        </>
      )}

      {/* Course outline stays visible on every class so learners never lose
          their place or have to go back to the main learning page. No
          heading here by design — the spine + number badges make it
          immediately legible as "the rest of the course" on their own. */}
      <div className="mt-2 border-t border-base-800 pt-6">
        {outlineError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-red-400">Couldn't load the course outline.</p>
            <Button variant="secondary" onClick={loadOutline}>
              Retry
            </Button>
          </div>
        ) : !outline ? (
          <p className="text-sm text-zinc-500">Loading outline…</p>
        ) : (
          <OutlineList items={items} activeLessonNumber={lessonNumber} semesters={outline?.semesters} />
        )}
      </div>
    </div>
  );
}