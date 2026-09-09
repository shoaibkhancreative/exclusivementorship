export type CourseStatus = "free" | "paid";

export interface AccessInput {
  lessonNumber: number;
  currentLesson: number; // highest lesson the user has unlocked
  courseStatus: CourseStatus;
  /** Admin-editable — how many classes (in sequence) are free. See lib/config.ts getFreeLessonCount. */
  freeLessonCount: number;
}

/**
 * "preview" is distinct from "locked": it means the learner has sequentially
 * reached this lesson (finished everything before it) but hasn't paid yet.
 * Unlike "locked", a "preview" lesson IS navigable — the learner can open it,
 * see its thumbnail, and see the unlock prompt when they hit play. It's what
 * lets the "Next" button stay active right after the last free class instead
 * of dead-ending. This now applies uniformly to every premium class, not
 * just a single hardcoded "gateway" lesson.
 */
export type LessonState = "locked" | "available" | "current" | "completed" | "preview";

/**
 * Server-side authority on lesson access. The frontend must never be
 * trusted to enforce this — every protected lesson route re-checks it.
 *
 * Rules:
 *  - Lessons 1..freeLessonCount: accessible once unlocked sequentially
 *    (lessonNumber <= currentLesson).
 *  - Lessons beyond freeLessonCount: additionally require course_status
 *    === 'paid', regardless of currentLesson.
 */
export function canAccessLesson(input: AccessInput): boolean {
  const { lessonNumber, currentLesson, courseStatus, freeLessonCount } = input;
  const sequentiallyUnlocked = lessonNumber <= currentLesson;
  if (!sequentiallyUnlocked) return false;
  if (lessonNumber > freeLessonCount && courseStatus !== "paid") return false;
  return true;
}

/**
 * After finishing the video for `lessonNumber` (see POST
 * /lessons/:number/complete-video), what should the user's new
 * `current_lesson` value be? Advances by exactly one, and never regresses.
 * This is now the ONLY way progression advances — there is no more
 * assignment-submission path.
 */
export function computeNextCurrentLesson(lessonNumber: number, currentLesson: number): number {
  return Math.max(currentLesson, lessonNumber + 1);
}

export function isPremiumLesson(lessonNumber: number, freeLessonCount: number): boolean {
  return lessonNumber > freeLessonCount;
}

export function shouldShowPremiumGate(
  completedLessonNumber: number,
  courseStatus: CourseStatus,
  freeLessonCount: number
): boolean {
  return completedLessonNumber === freeLessonCount && courseStatus !== "paid";
}

/**
 * Why a not-yet-accessible lesson is locked, for display purposes only —
 * never used for the actual access decision (that's canAccessLesson).
 *
 *  - "sequence": the learner hasn't finished everything before it yet,
 *    regardless of whether the lesson itself is free or premium. Shown as
 *    "finish the previous class to unlock this one".
 *  - "payment": the learner HAS reached it in sequence (finished every
 *    class before it) but it's a premium class and they haven't paid.
 *    Shown as "unlock Exclusive Mentorship".
 *
 * Returns null when the lesson is actually accessible.
 */
export type LockReason = "sequence" | "payment";

export function lockReasonForLesson(input: AccessInput): LockReason | null {
  if (canAccessLesson(input)) return null;
  const sequentiallyUnlocked = input.lessonNumber <= input.currentLesson;
  return sequentiallyUnlocked ? "payment" : "sequence";
}

export function lessonState(lessonNumber: number, completed: boolean, input: AccessInput): LessonState {
  if (completed) return "completed";

  const sequentiallyUnlocked = lessonNumber <= input.currentLesson;
  if (!sequentiallyUnlocked) return "locked";

  // Reached in sequence but payment-gated: navigable preview, not a dead lock.
  if (isPremiumLesson(lessonNumber, input.freeLessonCount) && input.courseStatus !== "paid") return "preview";

  return lessonNumber === input.currentLesson ? "current" : "available";
}
