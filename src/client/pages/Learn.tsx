import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OutlineResponse } from "../lib/api";
import { Button, LoadingScreen } from "../components/ui";
import { OutlineList } from "../components/OutlineList";
import { Footer } from "../components/Footer";
import { RetryBadge } from "../components/IllustrationBadge";
import { useContent } from "../lib/useContent";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useUnlockModal } from "../lib/UnlockModalContext";

export default function Learn() {
  const [data, setData] = useState<OutlineResponse | null>(null);
  const [error, setError] = useState(false);
  const { t } = useContent();
  const navigate = useNavigate();
  const { openUnlockModal } = useUnlockModal();

  useDocumentMeta({ title: "Your Lessons", path: "/learn" });

  const loadOutline = useCallback(() => {
    setError(false);
    api
      .get<OutlineResponse>("/lessons")
      .then(setData)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    loadOutline();
  }, [loadOutline]);

  if (error) {
    return (
      <div className="page-enter mx-auto max-w-md px-6 py-20 text-center sm:py-28">
        <RetryBadge />
        <p className="mx-auto mt-5 max-w-xs text-sm leading-snug text-zinc-400">{t("learn.load_error")}</p>
        <Button variant="secondary" onClick={loadOutline} className="mt-6">
          {t("learn.retry_button")}
        </Button>
      </div>
    );
  }

  if (!data) return <LoadingScreen />;

  const total = data.outline.length;
  const completedCount = data.outline.filter((l) => l.state === "completed").length;
  const progressPercent = total > 0 ? Math.min(100, Math.round((completedCount / total) * 100)) : 0;
  const cover = data.outline.find((l) => l.lessonNumber === data.currentLesson) ?? data.outline[0];

  const isPaid = data.courseStatus === "paid";
  const finishedFreeTier = completedCount >= data.freeLessonCount;
  const finishedCourse = total > 0 && completedCount >= total;

  let ctaLabel: string;
  let ctaDisabled = false;
  let onCtaClick: () => void;

  if (completedCount === 0) {
    ctaLabel = t("learn.cta_start_now");
    onCtaClick = () => navigate("/lesson/1");
  } else if (isPaid) {
    if (finishedCourse) {
      ctaLabel = t("learn.cta_finished");
      ctaDisabled = true;
      onCtaClick = () => {};
    } else {
      ctaLabel = t("learn.cta_continue");
      onCtaClick = () => navigate(`/lesson/${data.currentLesson}`);
    }
  } else if (finishedFreeTier) {
    ctaLabel = t("learn.cta_unlock");
    onCtaClick = openUnlockModal;
  } else {
    ctaLabel = t("learn.cta_continue");
    onCtaClick = () => navigate(`/lesson/${data.currentLesson}`);
  }

  return (
    <>
      <div className="mx-auto max-w-6xl px-5 pb-6 pt-3 sm:px-6 sm:pb-10 sm:pt-4 lg:pb-12 lg:pt-5 xl:max-w-7xl 2xl:max-w-[90rem]">
        <div className="lg:grid lg:grid-cols-[320px_1fr] lg:items-start lg:gap-8 xl:grid-cols-[360px_1fr] xl:gap-10">
          <div className="page-enter lg:sticky lg:top-24 lg:mt-6">
            <div className="rounded-md border border-base-800 bg-base-900 p-4 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_16px_36px_-20px_rgba(0,0,0,0.8)] sm:p-5">
              <div className="relative mb-4 aspect-video overflow-hidden rounded-md bg-base-800 bg-cover bg-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.7)] ring-1 ring-white/10 sm:mb-5">
                {cover?.thumbnailUrl ? (
                  <img
                    src={cover.thumbnailUrl}
                    alt=""
                    decoding="async"
                    fetchPriority="high"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-500/12 text-accent-500 sm:h-16 sm:w-16">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M9.5 7.5v9c0 .6.65.98 1.18.68l7.5-4.5a.79.79 0 0 0 0-1.36l-7.5-4.5A.79.79 0 0 0 9.5 7.5Z"
                          fill="currentColor"
                        />
                      </svg>
                    </span>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                {cover?.durationLabel && (
                  <span className="absolute bottom-2 right-2 rounded bg-base-900/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-50 shadow-sm">
                    {cover.durationLabel}
                  </span>
                )}
              </div>

              <h1 className="mb-1.5 break-words text-lg font-semibold leading-snug text-zinc-50 sm:text-xl lg:text-2xl">
                {t("learn.page_title")}
              </h1>
              <p className="mb-4 text-[13px] text-zinc-500 sm:mb-5">
                {t("learn.classes_count_label", { count: total })}
                <span className="mx-1.5 text-zinc-700">•</span>
                <span className="font-medium text-accent-500">{progressPercent}%</span>
              </p>

              <div className="mb-6">
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-base-800 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]"
                  role="progressbar"
                  aria-valuenow={progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("learn.progress_label")}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <Button className="w-full" onClick={onCtaClick} disabled={ctaDisabled}>
                {ctaLabel}
              </Button>

              {!isPaid && finishedFreeTier && completedCount > 0 && (
                <div className="mt-4 flex items-start gap-3 rounded-md bg-accent-500/[0.07] p-3">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-500/15 text-accent-500">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M12 2.5 14 9l6.5.3-5.2 4 2 6.2L12 15.8 6.7 19.5l2-6.2-5.2-4L10 9l2-6.5Z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <p className="pt-1 text-[13px] leading-snug text-zinc-400">{t("learn.completed_message")}</p>
                </div>
              )}

              {isPaid && finishedCourse && (
                <div className="mt-4 flex items-start gap-3 rounded-md bg-highlight-500/[0.1] p-3">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-highlight-500/20 text-highlight-500">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path
                        d="M2.5 7.2 5.4 10 11.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </span>
                  <p className="pt-1 text-[13px] leading-snug text-zinc-400">{t("learn.finished_message")}</p>
                </div>
              )}
            </div>
          </div>

          <div className="page-enter mt-10 lg:mt-0">
            <OutlineList items={data.outline} activeLessonNumber={data.currentLesson} semesters={data.semesters} />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
