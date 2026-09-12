import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type LessonDetail, type OutlineResponse } from "../lib/api";
import { Button, LoadingScreen } from "../components/ui";
import { OutlineList } from "../components/OutlineList";
import { VideoStage } from "../components/VideoStage";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { useUnlockModal } from "../lib/UnlockModalContext";

export default function Lesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useSession();
  const { t } = useContent();
  const { openUnlockModal } = useUnlockModal();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [outline, setOutline] = useState<OutlineResponse | null>(null);
  const [outlineError, setOutlineError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  // One line of Bangla explanation, revealed only after the learner taps the
  // lock icon — this is only ever used for the "sequence" lock reason now.
  // A "payment" lock always shows its message and Unlock Now button up
  // front (see the isLocked branch below), since that's an action we want
  // the learner to see immediately, not something to discover by tapping.
  // Reset whenever the lesson changes.
  const [showLockMessage, setShowLockMessage] = useState(false);

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
    setShowLockMessage(false);

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
        setError(t("lesson.load_error"));
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

  const navButtonClass =
    "focus-ring rounded-md border border-base-800 bg-base-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-base-600 hover:bg-base-800 hover:text-zinc-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-base-800 disabled:hover:bg-base-900 disabled:hover:text-zinc-300 disabled:active:scale-100";

  return (
    // A wider stage than the rest of the site (matched by the Learn page)
    // so the video and the playlist panel can sit side by side on desktop —
    // the class content itself keeps reading top-to-bottom just as before.
    // Scales up again past lg so the layout doesn't stay pinned to a fixed
    // width on large/multi-monitor desktops.
    //
    // NOTE: `.page-enter` (globals.css) animates `transform: translateY(...)`
    // and holds that transform on the element permanently afterwards
    // (animation-fill-mode: both, ending at translateY(0) — still a
    // non-"none" transform, not just an opacity fade). A `transform` on ANY
    // ancestor of a `position: sticky` element breaks that element's
    // sticky behavior in every browser, because the transformed ancestor
    // becomes the sticky element's containing block instead of the
    // viewport/scrollport. That's exactly what was happening here: this
    // outer div used to carry `page-enter` and is an ancestor of the
    // `sticky` nav+video wrapper below, so the video could never actually
    // stick — it just scrolled away like a normal block. Fixed by moving
    // `page-enter` off this ancestor and onto the sticky element itself
    // (a transform on the sticky element itself is harmless; only
    // ancestors break it) and onto the non-ancestor content below it, so
    // the same fade-in look is preserved without breaking sticky.
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10 xl:max-w-7xl 2xl:max-w-[90rem]">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          {/* Pinned on mobile only: the nav row + video/player stay fixed
              at the top of the screen while everything else (title,
              description, playlist) scrolls underneath — same idea as a
              mobile video app keeping the player in place. top-16 clears
              the site's own sticky TopBar (see TopBar.tsx). Reset back to
              normal document flow at the lg breakpoint, where the two-
              column layout already keeps things comfortably in view.
              `page-enter` lives directly on this sticky element (not on an
              ancestor) — see the note above for why that distinction is
              what makes sticky actually work here. */}
          <div className="page-enter sticky top-16 z-10 -mx-4 bg-base-950 px-4 pb-3 pt-3 sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0">
            {/* Back to Home / Previous / Next — one compact row, all three
                buttons the same small size. No more breadcrumb text above
                this row (chapter name / lesson number was removed as
                clutter). */}
            <div className="mb-3 flex items-center justify-between gap-2 lg:mb-5">
              <button type="button" onClick={() => navigate("/")} className={navButtonClass}>
                <span className="inline-flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M10 3.5 5 8l5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t("lesson.back_to_home")}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canGoPrev}
                  onClick={() => prevItem && navigate(`/lesson/${prevItem.lessonNumber}`)}
                  className={navButtonClass}
                >
                  {t("lesson.nav_previous")}
                </button>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => nextItem && navigate(`/lesson/${nextItem.lessonNumber}`)}
                  title={!canGoNext ? t("lesson.nav_next_title_last") : undefined}
                  className={navButtonClass}
                >
                  {t("lesson.nav_next")}
                </button>
              </div>
            </div>

            {lesson.isLocked ? (
              <div>
                {/* The thumbnail is always shown, even fully locked — it's the
                    same image already visible in the outline list, never the
                    actual video. A dark wash keeps the centered lock/play
                    prompt legible over any thumbnail. */}
                <div
                  className="relative aspect-video overflow-hidden rounded-lg border border-base-800 bg-black bg-cover bg-center"
                  style={lesson.thumbnailUrl ? { backgroundImage: `url(${lesson.thumbnailUrl})` } : undefined}
                >
                  <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
                  {lesson.durationLabel && (
                    <span className="absolute bottom-2 right-2 rounded bg-base-950/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-100">
                      {lesson.durationLabel}
                    </span>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                    {lesson.lockReason === "payment" ? (
                      // Payment lock: message and action are always visible,
                      // never hidden behind a tap — this is the one place we
                      // want the learner to see an obvious next step.
                      <>
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-base-950">
                          <svg width="18" height="20" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true">
                            <path d="M1 1.5v19l18-9.5-18-9.5Z" />
                          </svg>
                        </span>
                        <p className="max-w-xs text-sm font-medium text-zinc-100">{t("lesson.locked_payment_message_bn")}</p>
                        <Button onClick={openUnlockModal} className="!px-5 !py-2 text-sm">
                          {t("lesson.locked_payment_unlock_button")}
                        </Button>
                      </>
                    ) : (
                      // Sequence lock: unchanged — a plain lock icon, and
                      // the explanation only appears once tapped.
                      <>
                        <button
                          type="button"
                          onClick={() => setShowLockMessage((v) => !v)}
                          aria-label={t("lesson.locked_sequence_message_bn")}
                          className="focus-ring flex h-14 w-14 items-center justify-center rounded-full bg-base-800/90 text-zinc-300 transition-colors duration-150 hover:bg-base-700"
                        >
                          <svg width="20" height="21" viewBox="0 0 12 13" aria-hidden="true">
                            <rect x="1.5" y="5.5" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
                            <path d="M3.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
                          </svg>
                        </button>

                        {showLockMessage && (
                          <p className="max-w-xs text-sm font-medium text-zinc-100">{t("lesson.locked_sequence_message_bn")}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : lesson.videoEmbedUrl ? (
              <VideoStage
                lessonNumber={lesson.lessonNumber}
                rawEmbedUrl={lesson.videoEmbedUrl}
                title={lesson.title}
                onEnded={handleVideoEnded}
                // VideoStage signs every Bunny-hosted embed (free or paid)
                // via POST /lessons/:number/video-token — Bunny's Token
                // Authentication setting is per-library, not per-video, so
                // an unsigned "free" embed 403s just like an unsigned paid
                // one would. YouTube embeds are unaffected either way.
                watermarkLabel={lesson.watermarkEnabled && me?.authenticated ? (me.email ?? null) : null}
                thumbnailUrl={lesson.thumbnailUrl}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-base-800 bg-base-900 text-sm text-zinc-500">
                {t("lesson.video_coming_soon")}
              </div>
            )}
          </div>

          {/* Everything below this point scrolls normally underneath the
              pinned nav/video section on mobile. Title/description sizing
              is tuned down a step on small screens (was overflowing/too
              cramped at the desktop sizes on narrow phones).
              `page-enter` here (rather than on an ancestor further up)
              keeps the same fade-in for this block without sitting above
              the sticky video wrapper — see the note near the top of this
              component for why that placement matters. */}
          <div className="page-enter">
            <h1 className="mb-4 mt-4 break-words text-lg font-semibold leading-snug text-zinc-50 sm:text-xl lg:mb-5 lg:text-2xl">
              {lesson.title}
            </h1>

            {!lesson.isLocked && (
              <>
                <div className="mb-6 flex flex-wrap items-center gap-3 text-sm lg:mb-8">
                  {lesson.videoCompleted ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3 py-1 text-[13px] font-medium text-accent-500">
                      <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true" className="flex-none">
                        <path d="M2.5 7.2 5.4 10 11.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                      {t("lesson.watched_badge")}
                    </span>
                  ) : (
                    <>
                      <span className="text-zinc-500">{t("lesson.watch_prompt")}</span>
                      {showFallback && (
                        <button
                          type="button"
                          onClick={handleVideoEnded}
                          disabled={completing}
                          className="focus-ring text-zinc-500 underline decoration-dotted underline-offset-2 hover:text-zinc-300 disabled:opacity-50"
                        >
                          {t("lesson.fallback_link")}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {lesson.description && (
                  <p className="mb-8 break-words text-sm leading-relaxed text-zinc-400">{lesson.description}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Playlist panel — the Lesson-page equivalent of YouTube's "up
            next" sidebar. Sticks alongside the video on desktop; on mobile
            it simply falls below the class content, same place the plain
            outline used to sit. */}
        <aside className="page-enter mt-8 lg:sticky lg:top-24 lg:mt-0">
          <div className="rounded-lg border border-base-800 bg-base-900/40 lg:flex lg:max-h-[75vh] lg:flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-base-800 px-4 py-3">
              <h2 className="truncate text-[14px] font-semibold text-zinc-100">{t("lesson.playlist_title")}</h2>
              {items.length > 0 && idx >= 0 && (
                <span className="flex-none text-[12px] tabular-nums text-zinc-500">
                  {t("lesson.playlist_position", { current: idx + 1, total: items.length })}
                </span>
              )}
            </div>
            <div className="px-2 py-2 lg:overflow-y-auto">
              {outlineError ? (
                <div className="flex flex-wrap items-center gap-3 px-2 py-2">
                  <p className="text-sm text-red-400">{t("lesson.outline_error")}</p>
                  <Button variant="secondary" onClick={loadOutline}>
                    {t("learn.retry_button")}
                  </Button>
                </div>
              ) : !outline ? (
                <p className="px-2 py-2 text-sm text-zinc-500">{t("lesson.outline_loading")}</p>
              ) : (
                <OutlineList
                  items={items}
                  activeLessonNumber={lessonNumber}
                  semesters={outline?.semesters}
                  variant="compact"
                  scrollActiveIntoView
                />
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
