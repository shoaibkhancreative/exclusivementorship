import { describe, expect, it } from "vitest";
import {
  canAccessLesson,
  computeNextCurrentLesson,
  isPremiumLesson,
  lessonState,
  shouldShowPremiumGate
} from "../src/worker/lib/course";

describe("canAccessLesson", () => {
  it("allows lesson 1 for a brand new free user", () => {
    expect(canAccessLesson({ lessonNumber: 1, currentLesson: 1, courseStatus: "free" })).toBe(true);
  });

  it("blocks a free user from a lesson they haven't reached yet", () => {
    expect(canAccessLesson({ lessonNumber: 2, currentLesson: 1, courseStatus: "free" })).toBe(false);
  });

  it("allows free lessons 1-5 once sequentially reached", () => {
    for (let n = 1; n <= 5; n++) {
      expect(canAccessLesson({ lessonNumber: n, currentLesson: 5, courseStatus: "free" })).toBe(true);
    }
  });

  it("blocks lesson 6 for a free (unpaid) user even if current_lesson is 6", () => {
    // This models a defensive scenario — access must additionally require
    // course_status === 'paid' beyond the free threshold, not just sequence.
    expect(canAccessLesson({ lessonNumber: 6, currentLesson: 6, courseStatus: "free" })).toBe(false);
  });

  it("allows lesson 6+ for a paid user who has reached it", () => {
    expect(canAccessLesson({ lessonNumber: 6, currentLesson: 6, courseStatus: "paid" })).toBe(true);
    expect(canAccessLesson({ lessonNumber: 7, currentLesson: 8, courseStatus: "paid" })).toBe(true);
  });

  it("still blocks paid users from lessons beyond their unlocked sequence", () => {
    expect(canAccessLesson({ lessonNumber: 8, currentLesson: 6, courseStatus: "paid" })).toBe(false);
  });

  it("rejects a manually edited URL attempting to skip ahead (lesson 99)", () => {
    expect(canAccessLesson({ lessonNumber: 99, currentLesson: 1, courseStatus: "paid" })).toBe(false);
  });
});

describe("computeNextCurrentLesson", () => {
  it("advances current_lesson by exactly one after completing a lesson", () => {
    expect(computeNextCurrentLesson(3, 3)).toBe(4);
  });

  it("never regresses current_lesson if completing an earlier lesson again", () => {
    expect(computeNextCurrentLesson(2, 5)).toBe(5);
  });
});

describe("isPremiumLesson / shouldShowPremiumGate", () => {
  it("classifies lessons 1-5 as free and 6+ as premium", () => {
    expect(isPremiumLesson(5)).toBe(false);
    expect(isPremiumLesson(6)).toBe(true);
  });

  it("shows the premium gate exactly when completing lesson 5 as a free user", () => {
    expect(shouldShowPremiumGate(5, "free")).toBe(true);
    expect(shouldShowPremiumGate(5, "paid")).toBe(false);
    expect(shouldShowPremiumGate(4, "free")).toBe(false);
  });
});

describe("lessonState", () => {
  const base = { currentLesson: 3, courseStatus: "free" as const };

  it("marks a submitted lesson as completed regardless of position", () => {
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
      lessonState(6, false, { lessonNumber: 6, currentLesson: 6, courseStatus: "free" })
    ).toBe("preview");
  });

  it("still marks a premium lesson as locked if the free user hasn't reached it sequentially yet", () => {
    expect(
      lessonState(7, false, { lessonNumber: 7, currentLesson: 6, courseStatus: "free" })
    ).toBe("locked");
  });

  it("real access control (canAccessLesson) still blocks the 'preview' lesson's actual content", () => {
    expect(canAccessLesson({ lessonNumber: 6, currentLesson: 6, courseStatus: "free" })).toBe(false);
  });
});
