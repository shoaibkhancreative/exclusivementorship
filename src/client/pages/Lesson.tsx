import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type LessonDetail, type OutlineResponse } from "../lib/api";
import { Button, LoadingScreen } from "../components/ui";
import { OutlineList } from "../components/OutlineList";
import { VideoStage } from "../components/VideoStage";
import { useSession } from "../lib/SessionContext";

export default function Lesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useSession();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [outline, setOutline] = useState<OutlineResponse | null>(null);
  const [outlineError, setOutlineError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
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
      .catch(() => {
        // Every lesson number now loads its own page (locked ones just show
        // a locked overlay instead of the video — see the isLocked branch
        // below), so getting here means a genuine failure: a bad/nonexistent
        // lesson number, or a network problem.
        setError("This lesson couldn't be loaded.");
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
      .then(() => {
        setLesson((prev) => (prev ? { ...prev, videoCompleted: true } : prev));
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
  // Every class's page is openable now, including locked ones (they just
  // show a locked overlay instead of the video) — so Previous/Next only
  // need to check that a neighboring class exists, not its lock state.
  const canGoPrev = Boolean(prevItem);
  const canGoNext = Boolean(nextItem);

  return (
    <div className="page-enter mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">
          {lesson.chapterName} · Lesson {String(lessonNumber).padStart(2, "0")}
        </div>
        {/* Pill-shaped nav group instead of two loose text links — same
            two actions, but reads as one deliberate control rather than
            stray links floating next to the breadcrumb. */}
        <div className="flex items-center gap-1 rounded-full border border-base-800 p-1 text-sm">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => prevItem && navigate(`/lesson/${prevItem.lessonNumber}`)}
            className="focus-ring rounded-full px-3 py-1.5 text-zinc-400 transition-colors hover:bg-base-900 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
          >
            ← Previous
          </button>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => nextItem && navigate(`/lesson/${nextItem.lessonNumber}`)}
            title={!canGoNext ? "This is the last class in the course" : undefined}
            className="focus-ring rounded-full px-3 py-1.5 text-zinc-400 transition-colors hover:bg-base-900 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
          >
            Next →
          </button>
        </div>
      </div>

      <h1 className="mb-5 text-xl font-semibold text-zinc-50 sm:text-2xl">{lesson.title}</h1>

      {lesson.isLocked ? (
        <div className="mb-10">
          {/* The thumbnail is always shown, even fully locked — it's the
              same image already visible in the outline list, never the
              actual video. A dark wash keeps the centered lock/play prompt
              legible over any thumbnail. */}
          <div
            className="relative mb-5 aspect-video overflow-hidden rounded-lg border border-base-800 bg-black bg-cover bg-center"
            style={lesson.thumbnailUrl ? { backgroundImage: `url(${lesson.thumbnailUrl})` } : undefined}
          >
            <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              {lesson.lockReason === "payment" ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate("/unlock")}
                    aria-label="View Exclusive Mentorship details to unlock this class"
                    className="focus-ring flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-base-950 transition-colors duration-150 hover:bg-accent-400"
                  >
                    <svg width="18" height="20" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true">
                      <path d="M1 1.5v19l18-9.5-18-9.5Z" />
                    </svg>
                  </button>
                  <p className="text-sm font-medium text-zinc-100">This class is part of Exclusive Mentorship</p>
                  <p className="text-xs text-zinc-500">Tap play to unlock and continue.</p>
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-base-800/90 text-zinc-300">
                    <svg width="20" height="21" viewBox="0 0 12 13" aria-hidden="true">
                      <rect x="1.5" y="5.5" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
                      <path d="M3.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-zinc-100">Finish your previous class first</p>
                  <p className="text-xs text-zinc-500">Complete the class before this one to unlock it.</p>
                  {outline && (
                    <button
                      type="button"
                      onClick={() => navigate(`/lesson/${outline.currentLesson}`)}
                      className="focus-ring mt-1 rounded-full border border-base-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-base-500 hover:text-zinc-100"
                    >
                      Continue where you left off →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            {lesson.videoEmbedUrl ? (
              <VideoStage
                lessonNumber={lesson.lessonNumber}
                rawEmbedUrl={lesson.videoEmbedUrl}
                title={lesson.title}
                onEnded={handleVideoEnded}
                // Free lessons render the raw embed URL directly (no signed
                // token round-trip, no auth requirement) — see VideoStage.
                requiresToken={outline ? lessonNumber > outline.freeLessonCount : true}
                watermarkLabel={lesson.watermarkEnabled && me?.authenticated ? (me.email ?? null) : null}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-base-800 bg-base-900 text-sm text-zinc-500">
                Video coming soon.
              </div>
            )}
          </div>

          <div className="mb-8 flex flex-wrap items-center gap-3 text-sm">
            {lesson.videoCompleted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3 py-1 text-[13px] font-medium text-accent-500">
                <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true" className="flex-none">
                  <path d="M2.5 7.2 5.4 10 11.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
                Watched — next class unlocked
              </span>
            ) : (
              <>
                <span className="text-zinc-500">Watch to the end to unlock the next class.</span>
                {showFallback && (
                  <button
                    type="button"
                    onClick={handleVideoEnded}
                    disabled={completing}
                    className="focus-ring text-zinc-500 underline decoration-dotted underline-offset-2 hover:text-zinc-300 disabled:opacity-50"
                  >
                    Video finished but not unlocking? Click here
                  </button>
                )}
              </>
            )}
          </div>

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