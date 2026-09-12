import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OutlineResponse } from "../lib/api";
import { Button, LoadingScreen } from "../components/ui";
import { OutlineList } from "../components/OutlineList";
import { useContent } from "../lib/useContent";
import { useUnlockModal } from "../lib/UnlockModalContext";

export default function Learn() {
  const [data, setData] = useState<OutlineResponse | null>(null);
  const [error, setError] = useState(false);
  const { t } = useContent();
  const navigate = useNavigate();
  const { openUnlockModal } = useUnlockModal();

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
      <div className="mx-auto max-w-4xl px-5 py-24 text-center sm:px-6">
        <p className="mb-4 text-sm text-red-400">{t("learn.load_error")}</p>
        <Button variant="secondary" onClick={loadOutline}>
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

  // One dynamic CTA, driven entirely by where the learner actually stands —
  // never more than one button on this card.
  //   0 completed                          -> Start Now  -> lesson 1
  //   free, mid-way, free tier not finished -> Continue   -> current lesson
  //   free, free tier finished, not paid    -> Unlock Mentorship -> opens checkout popup directly
  //   paid, course not finished             -> Continue   -> current lesson
  //   paid, entire course finished          -> Finished   -> disabled
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
    // Opens the checkout popup directly — no intermediate /unlock page.
    onCtaClick = openUnlockModal;
  } else {
    ctaLabel = t("learn.cta_continue");
    onCtaClick = () => navigate(`/lesson/${data.currentLesson}`);
  }

  return (
    // A wider stage than the rest of the site (matched by the Lesson page)
    // so the cover + class list can sit side by side on desktop, like a
    // YouTube playlist page — everything else stays on the narrower
    // max-w-4xl column that keeps the site's minimal, single-column feel.
    // Scales up again past lg so the layout doesn't stay pinned to a fixed
    // width on large/multi-monitor desktops.
    //
    // NOTE: `page-enter` used to live on this outer div, which is an
    // ancestor of the `lg:sticky` cover card below. A `transform` on any
    // ancestor of a `position: sticky` element breaks that element's
    // sticky behavior (the transformed ancestor becomes its containing
    // block instead of the viewport) — `.page-enter`'s fade-in-up keyframe
    // animates `transform` and holds `translateY(0)` on the element
    // permanently afterward (animation-fill-mode: both), so the cover
    // card could never actually stick on desktop. Same root cause as the
    // Lesson page's video player — see Lesson.tsx for the fuller writeup.
    // Fixed the same way: `page-enter` moved onto the sticky element
    // itself (harmless — only ancestors break sticky) and onto the
    // non-ancestor content beside it, preserving the same fade-in look.
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-10 lg:py-12 xl:max-w-7xl 2xl:max-w-[90rem]">
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:items-start lg:gap-8 xl:grid-cols-[360px_1fr] xl:gap-10">
        {/* Cover card — sticks in place while the class list scrolls past it,
            same "the playlist itself doesn't move" behavior as YouTube's
            playlist header. `page-enter` lives directly on this sticky
            element (not on an ancestor) — see the note above. */}
        <div className="page-enter lg:sticky lg:top-24">
          <div className="relative mb-4 aspect-video overflow-hidden rounded-lg border border-base-800 bg-base-800 bg-cover bg-center sm:mb-5">
            {cover?.thumbnailUrl ? (
              <img src={cover.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-600">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 5v14M16 5v14M3 9.5h5M3 14.5h5M16 9.5h5M16 14.5h5" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-base-950/55 via-transparent to-transparent" />
            {cover?.durationLabel && (
              <span className="absolute bottom-2 right-2 rounded bg-base-950/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-100">
                {cover.durationLabel}
              </span>
            )}
          </div>

          <p className="kicker mb-2">{t("learn.progress_kicker")}</p>
          <h1 className="mb-4 break-words text-lg font-semibold leading-snug text-zinc-50 sm:text-xl lg:text-2xl">
            {t("learn.page_title")}
          </h1>

          {/* Real progress bar — completed / total classes, always visible.
              This replaces both the old plain progress line and the
              "X free classes left" text, which is removed entirely. */}
          <div className="mb-6">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] sm:text-sm">
              <span className="text-zinc-300">
                {completedCount} / {total} <span className="text-zinc-500">{t("learn.progress_label")}</span>
              </span>
              <span className="tabular-nums text-zinc-500">{progressPercent}%</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-base-800"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-accent-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {/* The one and only button on this card — label and destination
              are entirely state-driven (see the ctaLabel logic above). */}
          <Button className="w-full" onClick={onCtaClick} disabled={ctaDisabled}>
            {ctaLabel}
          </Button>
        </div>

        <div className="page-enter mt-10 lg:mt-0">
          <OutlineList items={data.outline} activeLessonNumber={data.currentLesson} semesters={data.semesters} />
        </div>
      </div>
    </div>
  );
}
