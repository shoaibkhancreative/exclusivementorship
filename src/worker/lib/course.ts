import { FREE_LESSON_COUNT } from "./config";

export type CourseStatus = "free" | "paid";

export interface AccessInput {
  lessonNumber: number;
  currentLesson: number; // highest lesson the user has unlocked
  courseStatus: CourseStatus;
}

export type LessonState = "locked" | "available" | "current" | "completed";

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
  if (!canAccessLesson(input)) return "locked";
  return lessonNumber === input.currentLesson ? "current" : "available";
}
