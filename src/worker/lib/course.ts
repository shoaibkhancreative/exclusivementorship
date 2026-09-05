import { FREE_LESSON_COUNT } from "./config";

export type CourseStatus = "free" | "paid";

export interface AccessInput {
  lessonNumber: number;
  currentLesson: number; // highest lesson the user has unlocked
  courseStatus: CourseStatus;
}

/**
 * "preview" is distinct from "locked": it means the learner has sequentially
 * reached this lesson (finished everything before it) but hasn't paid yet.
 * Unlike "locked", a "preview" lesson IS navigable — the learner can open it,
 * see its thumbnail, and see the unlock prompt when they hit play. It's what
 * lets the "Next" button stay active right after the last free class instead
 * of dead-ending.
 */
export type LessonState = "locked" | "available" | "current" | "completed" | "preview";

/**
 * Server-side authority on lesson access. The frontend must never be
 * trusted to enforce this — every protected lesson route re-checks it.
 *
 * Rules:
 *  - Lessons 1..FREE_LESSON_COUNT: accessible once unlocked sequentially
 *    (lessonNumber <= currentLesson).
 *  - Lessons beyond FREE_LESSON_COUNT: additionally require course_status
 *    === 'paid', regardless of currentLesson.
 */
export function canAccessLesson(input: AccessInput): boolean {
  const { lessonNumber, currentLesson, courseStatus } = input;
  const sequentiallyUnlocked = lessonNumber <= currentLesson;
  if (!sequentiallyUnlocked) return false;
  if (lessonNumber > FREE_LESSON_COUNT && courseStatus !== "paid") return false;
  return true;
}

/**
 * After completing `lessonNumber`, what should the user's new
 * `current_lesson` value be? Advances by exactly one, and never regresses.
 */
export function computeNextCurrentLesson(lessonNumber: number, currentLesson: number): number {
  return Math.max(currentLesson, lessonNumber + 1);
}

export function isPremiumLesson(lessonNumber: number): boolean {
  return lessonNumber > FREE_LESSON_COUNT;
}

export function shouldShowPremiumGate(completedLessonNumber: number, courseStatus: CourseStatus): boolean {
  return completedLessonNumber === FREE_LESSON_COUNT && courseStatus !== "paid";
}

export function lessonState(
  lessonNumber: number,
  completed: boolean,
  input: AccessInput
): LessonState {
  if (completed) return "completed";

  const sequentiallyUnlocked = lessonNumber <= input.currentLesson;
  if (!sequentiallyUnlocked) return "locked";

  // Reached in sequence but payment-gated: navigable preview, not a dead lock.
  if (isPremiumLesson(lessonNumber) && input.courseStatus !== "paid") return "preview";

  return lessonNumber === input.currentLesson ? "current" : "available";
}
