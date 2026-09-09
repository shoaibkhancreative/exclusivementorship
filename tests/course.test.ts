import { describe, expect, it } from "vitest";
import {
  canAccessLesson,
  computeNextCurrentLesson,
  isPremiumLesson,
  lessonState,
  lockReasonForLesson,
  shouldShowPremiumGate
} from "../src/worker/lib/course";

const FREE = 5;

describe("canAccessLesson", () => {
  it("allows lesson 1 for a brand new free user", () => {
    expect(canAccessLesson({ lessonNumber: 1, currentLesson: 1, courseStatus: "free", freeLessonCount: FREE })).toBe(
      true
    );
  });

  it("blocks a free user from a lesson they haven't reached yet", () => {
    expect(canAccessLesson({ lessonNumber: 2, currentLesson: 1, courseStatus: "free", freeLessonCount: FREE })).toBe(
      false
    );
  });

  it("allows free lessons 1-5 once sequentially reached", () => {
    for (let n = 1; n <= 5; n++) {
      expect(canAccessLesson({ lessonNumber: n, currentLesson: 5, courseStatus: "free", freeLessonCount: FREE })).toBe(
        true
      );
    }
  });

  it("blocks lesson 6 for a free (unpaid) user even if current_lesson is 6", () => {
    // This models a defensive scenario — access must additionally require
    // course_status === 'paid' beyond the free threshold, not just sequence.
    expect(canAccessLesson({ lessonNumber: 6, currentLesson: 6, courseStatus: "free", freeLessonCount: FREE })).toBe(
      false
    );
  });

  it("allows lesson 6+ for a paid user who has reached it", () => {
    expect(canAccessLesson({ lessonNumber: 6, currentLesson: 6, courseStatus: "paid", freeLessonCount: FREE })).toBe(
      true
    );
    expect(canAccessLesson({ lessonNumber: 7, currentLesson: 8, courseStatus: "paid", freeLessonCount: FREE })).toBe(
      true
    );
  });

  it("still blocks paid users from lessons beyond their unlocked sequence", () => {
    expect(canAccessLesson({ lessonNumber: 8, currentLesson: 6, courseStatus: "paid", freeLessonCount: FREE })).toBe(
      false
    );
  });

  it("rejects a manually edited URL attempting to skip ahead (lesson 99)", () => {
    expect(canAccessLesson({ lessonNumber: 99, currentLesson: 1, courseStatus: "paid", freeLessonCount: FREE })).toBe(
      false
    );
  });

  it("respects an admin-lowered free-lesson-count", () => {
    // With freeLessonCount = 2, lesson 3 requires payment even if reached sequentially.
    expect(canAccessLesson({ lessonNumber: 3, currentLesson: 3, courseStatus: "free", freeLessonCount: 2 })).toBe(
      false
    );
    expect(canAccessLesson({ lessonNumber: 3, currentLesson: 3, courseStatus: "paid", freeLessonCount: 2 })).toBe(
      true
    );
  });
});

describe("computeNextCurrentLesson", () => {
  it("advances current_lesson by exactly one after finishing a lesson's video", () => {
    expect(computeNextCurrentLesson(3, 3)).toBe(4);
  });

  it("never regresses current_lesson if re-watching an earlier lesson", () => {
    expect(computeNextCurrentLesson(2, 5)).toBe(5);
  });
});

describe("isPremiumLesson / shouldShowPremiumGate", () => {
  it("classifies lessons up to freeLessonCount as free and beyond as premium", () => {
    expect(isPremiumLesson(5, FREE)).toBe(false);
    expect(isPremiumLesson(6, FREE)).toBe(true);
  });

  it("shows the premium gate exactly when finishing the last free lesson as a free user", () => {
    expect(shouldShowPremiumGate(5, "free", FREE)).toBe(true);
    expect(shouldShowPremiumGate(5, "paid", FREE)).toBe(false);
    expect(shouldShowPremiumGate(4, "free", FREE)).toBe(false);
  });
});

describe("lessonState", () => {
  const base = { currentLesson: 3, courseStatus: "free" as const, freeLessonCount: FREE };

  it("marks a video-completed lesson as completed regardless of position", () => {
    expect(lessonState(1, true, { lessonNumber: 1, ...base })).toBe("completed");
  });

  it("marks the active lesson as current", () => {
    expect(lessonState(3, false, { lessonNumber: 3, ...base })).toBe("current");
  });

  it("marks a reachable-but-not-current lesson as available", () => {
    // Sequentially unlocked (<= currentLesson) but not the exact current pointer.
    expect(lessonState(2, false, { lessonNumber: 2, ...base })).toBe("available");
  });

  it("marks an unreached lesson as locked", () => {
    expect(lessonState(4, false, { lessonNumber: 4, ...base })).toBe("locked");
  });

  it("marks a sequentially-reached premium lesson as a navigable 'preview' for free users (not a dead lock)", () => {
    expect(
      lessonState(6, false, { lessonNumber: 6, currentLesson: 6, courseStatus: "free", freeLessonCount: FREE })
    ).toBe("preview");
  });

  it("still marks a premium lesson as locked if the free user hasn't reached it sequentially yet", () => {
    expect(
      lessonState(7, false, { lessonNumber: 7, currentLesson: 6, courseStatus: "free", freeLessonCount: FREE })
    ).toBe("locked");
  });

  it("real access control (canAccessLesson) still blocks the 'preview' lesson's actual content", () => {
    expect(canAccessLesson({ lessonNumber: 6, currentLesson: 6, courseStatus: "free", freeLessonCount: FREE })).toBe(
      false
    );
  });
});

describe("lockReasonForLesson", () => {
  const base = { currentLesson: 3, courseStatus: "free" as const, freeLessonCount: FREE };

  it("returns null for an accessible lesson", () => {
    expect(lockReasonForLesson({ lessonNumber: 2, ...base })).toBeNull();
    expect(lockReasonForLesson({ lessonNumber: 3, ...base })).toBeNull();
  });

  it("returns 'sequence' for an unreached free lesson", () => {
    expect(lockReasonForLesson({ lessonNumber: 4, ...base })).toBe("sequence");
  });

  it("returns 'sequence' for an unreached premium lesson too, not 'payment'", () => {
    // Hasn't finished the free classes yet — the message should be "finish
    // the previous class", not "unlock the mentorship" yet.
    expect(
      lockReasonForLesson({ lessonNumber: 7, currentLesson: 3, courseStatus: "free", freeLessonCount: FREE })
    ).toBe("sequence");
  });

  it("returns 'payment' once a premium lesson is sequentially reached but unpaid", () => {
    expect(
      lockReasonForLesson({ lessonNumber: 6, currentLesson: 6, courseStatus: "free", freeLessonCount: FREE })
    ).toBe("payment");
  });

  it("returns 'sequence' for a not-yet-reached premium lesson even after paying", () => {
    // Paid, but hasn't finished what comes before it — still a sequence
    // lock, not a payment lock.
    expect(
      lockReasonForLesson({ lessonNumber: 8, currentLesson: 6, courseStatus: "paid", freeLessonCount: FREE })
    ).toBe("sequence");
  });

  it("returns null for a reached premium lesson once paid", () => {
    expect(
      lockReasonForLesson({ lessonNumber: 6, currentLesson: 6, courseStatus: "paid", freeLessonCount: FREE })
    ).toBeNull();
  });
});
