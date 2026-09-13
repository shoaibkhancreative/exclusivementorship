export type CourseStatus = "free" | "paid";

export interface AccessInput {
  lessonNumber: number;
  currentLesson: number;
  courseStatus: CourseStatus;
  freeLessonCount: number;
}

export type LessonState = "locked" | "available" | "current" | "completed" | "preview";

export function canAccessLesson(input: AccessInput): boolean {
  const { lessonNumber, currentLesson, courseStatus, freeLessonCount } = input;
  const sequentiallyUnlocked = lessonNumber <= currentLesson;
  if (!sequentiallyUnlocked) return false;
  if (lessonNumber > freeLessonCount && courseStatus !== "paid") return false;
  return true;
}

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

  if (isPremiumLesson(lessonNumber, input.freeLessonCount) && input.courseStatus !== "paid") return "preview";

  return lessonNumber === input.currentLesson ? "current" : "available";
}
