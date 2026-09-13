import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type LessonDetail, type OutlineResponse } from "../lib/api";
import { Button, LoadingScreen } from "../components/ui";
import { ExpandableText } from "../components/ExpandableText";
import { OutlineList } from "../components/OutlineList";
import { RetryBadge } from "../components/IllustrationBadge";
import { SequenceLockModal } from "../components/SequenceLockModal";
import { VideoStage } from "../components/VideoStage";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useUnlockModal } from "../lib/UnlockModalContext";

export default function Lesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useSession();
  const { t } = useContent();
  const { openUnlockModal } = useUnlockModal();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);

  useDocumentMeta({ title: lesson?.title ?? "Lesson", path: `/lesson/${id ?? ""}` });
  const [outline, setOutline] = useState<OutlineResponse | null>(null);
  const [outlineError, setOutlineError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [showSequenceLockModal, setShowSequenceLockModal] = useState(false);

  const loadOutline = useCallback(() => {
    setOutlineError(false);
    return api
      .get<OutlineResponse>("/lessons")
      .then(setOutline)
      .catch(() => setOutlineError(true));
  }, []);

  const loadLesson = useCallback(() => {
    setError(null);
    api
      .get<LessonDetail>(`/lessons/${id}`)
      .then(setLesson)
      .catch(() => {
        setError(t("lesson.load_error"));
      });
  }, [id, t]);

  useEffect(() => {
    setLesson(null);
    setError(null);
    setShowFallback(false);
    setShowSequenceLockModal(false);

    const fallbackTimer = window.setTimeout(() => setShowFallback(true), 45000);

    loadLesson();
    loadOutline();

    return () => window.clearTimeout(fallbackTimer);
  }, [id, navigate, loadOutline, loadLesson]);

  const handleVideoEnded = useCallback(() => {
    if (!lesson || completing || lesson.videoCompleted) return;
    setCompleting(true);
    api
      .post<{ ok: true; nextLessonNumber: number; showPremiumGate: boolean }>(
        `/lessons/${lesson.lessonNumber}/complete-video`
      )
      .then(() => {
        setLesson((prev) => (prev ? { ...prev, videoCompleted: true } : prev));
        loadOutline();
      })
      .catch(() => {
      })
      .finally(() => setCompleting(false));
  }, [lesson, completing, loadOutline]);

  if (error) {
    return (
      <div className="page-enter mx-auto max-w-md px-6 py-20 text-center sm:py-28">
        <RetryBadge />
        <p className="mx-auto mt-5 max-w-xs text-sm leading-snug text-zinc-400">{error}</p>
        <Button variant="secondary" onClick={loadLesson} className="mt-6">
          {t("learn.retry_button")}
        </Button>
      </div>
    );
  }
  if (!lesson) return <LoadingScreen />;

  const lessonNumber = lesson.lessonNumber;
  const items = outline?.outline ?? [];
  const idx = items.findIndex((item) => item.lessonNumber === lessonNumber);
  const prevItem = idx > 0 ? items[idx - 1] : null;
  const nextItem = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;
  const canGoPrev = Boolean(prevItem);
  const canGoNext = Boolean(nextItem);

  const navButtonClass =
    "focus-ring flex items-center justify-center rounded-md border border-base-800 bg-base-900 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-base-600 hover:bg-base-800 hover:text-zinc-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-base-800 disabled:hover:bg-base-900 disabled:hover:text-zinc-300 disabled:active:scale-100";

  return (
    <div className="mx-auto w-full max-w-[min(96vw,1920px)] px-4 py-5 sm:px-6 sm:py-10">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="page-enter sticky top-16 z-10 -mx-4 border-b border-base-800/70 bg-base-950 px-4 pb-3 pt-3 sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:border-b-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0">
            {lesson.isLocked ? (
              <div>
                <div
                  className="relative aspect-video overflow-hidden rounded-lg border border-base-800 bg-black bg-cover bg-center"
                  style={lesson.thumbnailUrl ? { backgroundImage: `url(${lesson.thumbnailUrl})` } : undefined}
                >
                  {lesson.durationLabel && (
                    <span className="absolute bottom-2 right-2 rounded bg-zinc-100/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-base-950">
                      {lesson.durationLabel}
                    </span>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        lesson.lockReason === "payment" ? openUnlockModal() : setShowSequenceLockModal(true)
                      }
                      aria-label={
                        lesson.lockReason === "payment"
                          ? t("lesson.locked_payment_message_bn")
                          : t("lesson.locked_sequence_message_bn")
                      }
                      className="focus-ring flex h-11 w-11 flex-none items-center justify-center rounded-full bg-accent-500 text-base-950 shadow-md transition-transform duration-150 hover:scale-105 active:scale-95"
                    >
                      <svg width="15" height="16" viewBox="0 0 12 13" aria-hidden="true">
                        <rect
                          x="1.5"
                          y="5.5"
                          width="9"
                          height="6.5"
                          rx="1.3"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          fill="none"
                        />
                        <path
                          d="M3.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          fill="none"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : lesson.videoEmbedUrl ? (
              <VideoStage
                lessonNumber={lesson.lessonNumber}
                rawEmbedUrl={lesson.videoEmbedUrl}
                title={lesson.title}
                onEnded={handleVideoEnded}
                watermarkLabel={lesson.watermarkEnabled && me?.authenticated ? (me.email ?? null) : null}
                thumbnailUrl={lesson.thumbnailUrl}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-base-800 bg-base-900 text-sm text-zinc-500">
                {t("lesson.video_coming_soon")}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 lg:hidden">
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

          <div className="page-enter mt-3 lg:mt-0">
            <h1 className="mb-4 mt-4 break-words text-lg font-semibold leading-snug text-zinc-50 sm:text-xl lg:mb-5 lg:text-2xl">
              {lesson.title}
            </h1>

            {!lesson.isLocked && (
              <>
                <div className="mb-6 flex flex-wrap items-center gap-3 text-sm lg:mb-8">
                  {lesson.videoCompleted ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3 py-1 text-[13px] font-medium text-accent-500">
                      <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true" className="flex-none">
                        <path
                          d="M2.5 7.2 5.4 10 11.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
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
                  <ExpandableText
                    text={lesson.description}
                    maxChars={220}
                    className="mb-8 break-words text-sm leading-relaxed text-zinc-400"
                    moreLabel={t("lesson.description_show_more")}
                    lessLabel={t("lesson.description_show_less")}
                  />
                )}
              </>
            )}
          </div>
        </div>

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
                  <p className="text-sm text-accent-300">{t("lesson.outline_error")}</p>
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

      {showSequenceLockModal && (
        <SequenceLockModal
          message={t("lesson.locked_sequence_message_bn")}
          onClose={() => setShowSequenceLockModal(false)}
        />
      )}
    </div>
  );
}
