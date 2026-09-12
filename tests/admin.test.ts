import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { createTestEnv } from "./testEnv";
import { createSession } from "../src/worker/auth";
import { getOrCreateUser } from "../src/worker/db";
import { hashPassword, randomUuid } from "../src/worker/lib/crypto";
import type { Env } from "../src/worker/lib/config";

async function call(env: Env, path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const request = new Request(`http://localhost${path}`, { ...init, headers });
  return worker.fetch(request, env);
}

function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0]; // "<name>=..."
}

async function loginNewUser(env: Env, email: string) {
  const user = await getOrCreateUser(env, email);
  const token = await createSession(env, user.id);
  return { user, cookie: `em_session=${token}` };
}

async function seedAdmin(env: Env, email: string, password: string) {
  const passwordHash = await hashPassword(password);
  await env.DB.prepare("INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)")
    .bind(randomUuid(), email, passwordHash)
    .run();
}

async function loginAdmin(env: Env, email: string, password: string) {
  const res = await call(env, "/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
  expect(res.status).toBe(200);
  return extractCookie(res);
}

describe("Admin auth (HTTP)", () => {
  let env: Env;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("rejects login for an admin that doesn't exist", async () => {
    const res = await call(env, "/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email: "nope@example.com", password: "whatever12345" })
    });
    expect(res.status).toBe(401);
  });

  it("rejects login with the wrong password", async () => {
    await seedAdmin(env, "admin@example.com", "correct-horse-battery");
    const res = await call(env, "/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "wrong-password" })
    });
    expect(res.status).toBe(401);
  });

  it("logs in with correct credentials and /me reflects the session", async () => {
    await seedAdmin(env, "admin@example.com", "correct-horse-battery");
    const cookie = await loginAdmin(env, "admin@example.com", "correct-horse-battery");

    const me = await call(env, "/api/admin/me", { cookie });
    const meBody = (await me.json()) as { authenticated: boolean; email?: string };
    expect(meBody.authenticated).toBe(true);
    expect(meBody.email).toBe("admin@example.com");
  });

  it("rejects admin routes without a session, and never accepts a student session cookie", async () => {
    const noAuth = await call(env, "/api/admin/students");
    expect(noAuth.status).toBe(401);

    const { cookie: studentCookie } = await loginNewUser(env, "student@example.com");
    // Student cookie is named em_session, not em_admin_session — swapping
    // it in should never authenticate an admin route.
    const withStudentCookie = await call(env, "/api/admin/students", {
      cookie: studentCookie.replace("em_session", "em_admin_session")
    });
    expect(withStudentCookie.status).toBe(401);
  });

  it("logout revokes the session", async () => {
    await seedAdmin(env, "admin@example.com", "correct-horse-battery");
    const cookie = await loginAdmin(env, "admin@example.com", "correct-horse-battery");

    await call(env, "/api/admin/logout", { method: "POST", cookie });
    const me = await call(env, "/api/admin/me", { cookie });
    const meBody = (await me.json()) as { authenticated: boolean };
    expect(meBody.authenticated).toBe(false);
  });
});

describe("Admin student directory (HTTP)", () => {
  let env: Env;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("lists students with progress and payment status", async () => {
    await seedAdmin(env, "admin@example.com", "correct-horse-battery");
    const adminCookie = await loginAdmin(env, "admin@example.com", "correct-horse-battery");
    const { cookie } = await loginNewUser(env, "student@example.com");
    await call(env, "/api/lessons/1/complete-video", { method: "POST", cookie, body: "{}" });

    const res = await call(env, "/api/admin/students", { cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { students: Array<{ email: string; completedLessons: number }> };
    const student = body.students.find((s) => s.email === "student@example.com");
    expect(student).toBeDefined();
    expect(student!.completedLessons).toBe(1);
  });

  it("an admin can manually grant and revoke paid access", async () => {
    await seedAdmin(env, "admin@example.com", "correct-horse-battery");
    const adminCookie = await loginAdmin(env, "admin@example.com", "correct-horse-battery");
    const { user } = await loginNewUser(env, "student2@example.com");

    const grant = await call(env, `/api/admin/students/${user.id}/access`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ status: "paid" })
    });
    expect(grant.status).toBe(200);

    let students = (await (await call(env, "/api/admin/students", { cookie: adminCookie })).json()) as {
      students: Array<{ id: string; courseStatus: string }>;
    };
    expect(students.students.find((s) => s.id === user.id)?.courseStatus).toBe("paid");

    const revoke = await call(env, `/api/admin/students/${user.id}/access`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ status: "free" })
    });
    expect(revoke.status).toBe(200);

    students = (await (await call(env, "/api/admin/students", { cookie: adminCookie })).json()) as {
      students: Array<{ id: string; courseStatus: string }>;
    };
    expect(students.students.find((s) => s.id === user.id)?.courseStatus).toBe("free");
  });
});

describe("Admin lessons & chapters management (HTTP)", () => {
  let env: Env;
  let adminCookie: string;

  beforeEach(async () => {
    env = await createTestEnv();
    await seedAdmin(env, "admin@example.com", "correct-horse-battery");
    adminCookie = await loginAdmin(env, "admin@example.com", "correct-horse-battery");
  });

  it("lists chapters and lessons for the admin panel", async () => {
    const chapters = await call(env, "/api/admin/chapters", { cookie: adminCookie });
    expect(chapters.status).toBe(200);
    const chaptersBody = (await chapters.json()) as { chapters: Array<{ name: string }> };
    expect(chaptersBody.chapters.some((c) => c.name === "Foundation")).toBe(true);

    const lessons = await call(env, "/api/admin/lessons", { cookie: adminCookie });
    expect(lessons.status).toBe(200);
    const lessonsBody = (await lessons.json()) as { lessons: Array<{ lessonNumber: number }> };
    expect(lessonsBody.lessons.length).toBeGreaterThan(0);
  });

  it("creates a lesson at the end of the course, hidden by default, then can edit and publish it", async () => {
    const create = await call(env, "/api/admin/lessons", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        title: "New Class",
        chapterName: "Foundation",
        tagline: "A brand new class",
        description: "Details here.",
        videoEmbedUrl: "https://www.youtube-nocookie.com/embed/new123"
      })
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as { lesson: { id: number; isActive: boolean } };
    expect(created.lesson.isActive).toBe(true);

    const patch = await call(env, `/api/admin/lessons/${created.lesson.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ title: "Updated Title" })
    });
    expect(patch.status).toBe(200);

    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; title: string }>;
    };
    expect(lessons.lessons.find((l) => l.id === created.lesson.id)?.title).toBe("Updated Title");
  });

  it("archiving a lesson hides it from the public outline without deleting it from the admin list", async () => {
    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; lessonNumber: number }>;
    };
    const target = lessons.lessons[0];

    const archive = await call(env, `/api/admin/lessons/${target.id}/archive`, {
      method: "POST",
      cookie: adminCookie
    });
    expect(archive.status).toBe(200);

    const publicOutline = (await (await call(env, "/api/lessons")).json()) as {
      outline: Array<{ lessonNumber: number }>;
    };
    expect(publicOutline.outline.some((l) => l.lessonNumber === target.lessonNumber)).toBe(false);

    const stillListed = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number }>;
    };
    expect(stillListed.lessons.some((l) => l.id === target.id)).toBe(true);
  });

  it("reordering lessons renumbers them to match the new sequence", async () => {
    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; lessonNumber: number }>;
    };
    const [first, second] = lessons.lessons;
    const swapped = [second.id, first.id, ...lessons.lessons.slice(2).map((l) => l.id)];

    const reorder = await call(env, "/api/admin/lessons/reorder", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ orderedIds: swapped })
    });
    expect(reorder.status).toBe(200);

    const after = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; lessonNumber: number }>;
    };
    expect(after.lessons.find((l) => l.id === second.id)?.lessonNumber).toBe(1);
    expect(after.lessons.find((l) => l.id === first.id)?.lessonNumber).toBe(2);
  });

  it("adds a chapter and can rename it, cascading the rename onto its lessons", async () => {
    const create = await call(env, "/api/admin/chapters", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ name: "Bonus", tagline: "Extra content" })
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as { chapter: { id: number } };

    const lesson = await call(env, "/api/admin/lessons", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ title: "Bonus class", chapterName: "Bonus" })
    });
    const lessonBody = (await lesson.json()) as { lesson: { id: number } };

    const rename = await call(env, `/api/admin/chapters/${created.chapter.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ name: "Bonus Renamed" })
    });
    expect(rename.status).toBe(200);

    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; chapterName: string }>;
    };
    expect(lessons.lessons.find((l) => l.id === lessonBody.lesson.id)?.chapterName).toBe("Bonus Renamed");
  });

  it("keeps a chapter's lessons contiguous when a new lesson is added to an earlier chapter", async () => {
    // "Foundation" is the first (not last) seeded chapter — a naive
    // append-at-the-end would split it apart from the rest of its lessons.
    const create = await call(env, "/api/admin/lessons", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ title: "Extra Foundation class", chapterName: "Foundation" })
    });
    expect(create.status).toBe(200);

    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; chapterName: string }>;
    };
    const chapterNames = lessons.lessons.map((l) => l.chapterName);
    // Every run of a given chapter name should be a single contiguous block.
    const seenChapters = new Set<string>();
    let previous: string | null = null;
    for (const name of chapterNames) {
      if (name !== previous) {
        expect(seenChapters.has(name)).toBe(false);
        seenChapters.add(name);
        previous = name;
      }
    }
  });

  it("moves a chapter's lessons along with it when chapters are reordered", async () => {
    const chaptersRes = (await (await call(env, "/api/admin/chapters", { cookie: adminCookie })).json()) as {
      chapters: Array<{ id: number; name: string }>;
    };
    // Move the last chapter to the front.
    const reorderedChapterIds = [
      chaptersRes.chapters[chaptersRes.chapters.length - 1].id,
      ...chaptersRes.chapters.slice(0, -1).map((c) => c.id)
    ];
    const reorder = await call(env, "/api/admin/chapters/reorder", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ orderedIds: reorderedChapterIds })
    });
    expect(reorder.status).toBe(200);

    const lastChapterName = chaptersRes.chapters[chaptersRes.chapters.length - 1].name;
    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ chapterName: string }>;
    };
    // That chapter's lessons should now lead the course.
    expect(lessons.lessons[0].chapterName).toBe(lastChapterName);
  });

  it("moves a lesson into its new chapter's block when its chapter is edited", async () => {
    const lessonsBefore = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; chapterName: string }>;
    };
    const target = lessonsBefore.lessons.find((l) => l.chapterName === "Foundation")!;

    const patch = await call(env, `/api/admin/lessons/${target.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ chapterName: "Technical Edge" })
    });
    expect(patch.status).toBe(200);

    const lessonsAfter = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; chapterName: string }>;
    };
    const chapterNames = lessonsAfter.lessons.map((l) => l.chapterName);
    const seenChapters = new Set<string>();
    let previous: string | null = null;
    for (const name of chapterNames) {
      if (name !== previous) {
        expect(seenChapters.has(name)).toBe(false);
        seenChapters.add(name);
        previous = name;
      }
    }
    expect(lessonsAfter.lessons.find((l) => l.id === target.id)?.chapterName).toBe("Technical Edge");
  });

  it("permanently deletes a lesson and resequences the remaining classes", async () => {
    const before = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; lessonNumber: number }>;
    };
    const target = before.lessons[0];

    const del = await call(env, `/api/admin/lessons/${target.id}`, { method: "DELETE", cookie: adminCookie });
    expect(del.status).toBe(200);

    const after = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; lessonNumber: number }>;
    };
    expect(after.lessons.some((l) => l.id === target.id)).toBe(false);
    // Numbering stays a clean, gap-free 1..N sequence after the delete.
    const numbers = after.lessons.map((l) => l.lessonNumber).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: after.lessons.length }, (_, i) => i + 1));

    const missing = await call(env, `/api/admin/lessons/${target.id}`, { method: "DELETE", cookie: adminCookie });
    expect(missing.status).toBe(404);
  });

  it("deletes an empty chapter, but refuses one that still has classes", async () => {
    const create = await call(env, "/api/admin/chapters", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ name: "Empty Bonus" })
    });
    const created = (await create.json()) as { chapter: { id: number } };

    const del = await call(env, `/api/admin/chapters/${created.chapter.id}`, {
      method: "DELETE",
      cookie: adminCookie
    });
    expect(del.status).toBe(200);

    const chaptersRes = (await (await call(env, "/api/admin/chapters", { cookie: adminCookie })).json()) as {
      chapters: Array<{ id: number }>;
    };
    expect(chaptersRes.chapters.some((c) => c.id === created.chapter.id)).toBe(false);

    const foundation = (await (await call(env, "/api/admin/chapters", { cookie: adminCookie })).json()) as {
      chapters: Array<{ id: number; name: string }>;
    };
    const nonEmpty = foundation.chapters.find((c) => c.name === "Foundation")!;
    const blocked = await call(env, `/api/admin/chapters/${nonEmpty.id}`, { method: "DELETE", cookie: adminCookie });
    expect(blocked.status).toBe(409);
  });

  it("drags a lesson into a different chapter via reorder with orderedLessons, moving its chapter and renumbering it", async () => {
    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; chapterName: string; lessonNumber: number }>;
    };
    const foundation = lessons.lessons.filter((l) => l.chapterName === "Foundation");
    const dragged = foundation[foundation.length - 1]; // last Foundation class
    const rest = lessons.lessons.filter((l) => l.id !== dragged.id);

    // Drop it to lead the "Technical Edge" chapter instead.
    const orderedLessons = rest.map((l) => ({ id: l.id, chapterName: l.chapterName }));
    const technicalStart = orderedLessons.findIndex((l) => l.chapterName === "Technical Edge");
    orderedLessons.splice(technicalStart, 0, { id: dragged.id, chapterName: "Technical Edge" });

    const reorder = await call(env, "/api/admin/lessons/reorder", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ orderedLessons })
    });
    expect(reorder.status).toBe(200);

    const after = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; chapterName: string; lessonNumber: number }>;
    };
    const movedLesson = after.lessons.find((l) => l.id === dragged.id)!;
    expect(movedLesson.chapterName).toBe("Technical Edge");
    // It was dropped right before the old first Technical Edge class, so it
    // now leads that chapter and takes over what used to be its position.
    expect(movedLesson.lessonNumber).toBe(dragged.lessonNumber);
    const newTechnicalFirst = after.lessons
      .filter((l) => l.chapterName === "Technical Edge")
      .sort((a, b) => a.lessonNumber - b.lessonNumber)[0];
    expect(newTechnicalFirst.id).toBe(dragged.id);

    // Chapters stay contiguous after the cross-chapter drag.
    const chapterNames = after.lessons.map((l) => l.chapterName);
    const seenChapters = new Set<string>();
    let previous: string | null = null;
    for (const name of chapterNames) {
      if (name !== previous) {
        expect(seenChapters.has(name)).toBe(false);
        seenChapters.add(name);
        previous = name;
      }
    }
  });

  it("rejects a drag-reorder into a chapter name that doesn't exist", async () => {
    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; chapterName: string }>;
    };
    const orderedLessons = lessons.lessons.map((l, i) =>
      i === 0 ? { id: l.id, chapterName: "Nonexistent Chapter" } : { id: l.id, chapterName: l.chapterName }
    );

    const reorder = await call(env, "/api/admin/lessons/reorder", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ orderedLessons })
    });
    expect(reorder.status).toBe(400);
  });

  it("rejects an empty title or chapter when editing a lesson", async () => {
    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number }>;
    };
    const target = lessons.lessons[0];

    const emptyTitle = await call(env, `/api/admin/lessons/${target.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ title: "   " })
    });
    expect(emptyTitle.status).toBe(400);

    const emptyChapter = await call(env, `/api/admin/lessons/${target.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ chapterName: "   " })
    });
    expect(emptyChapter.status).toBe(400);
  });

  it("duplicates a lesson into the same chapter, hidden, with a '(copy)' title", async () => {
    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; title: string; chapterName: string; isActive: boolean }>;
    };
    const source = lessons.lessons[0];

    const dup = await call(env, `/api/admin/lessons/${source.id}/duplicate`, {
      method: "POST",
      cookie: adminCookie
    });
    expect(dup.status).toBe(200);
    const body = (await dup.json()) as { lesson: { id: number; title: string; chapterName: string; isActive: boolean } };
    expect(body.lesson.id).not.toBe(source.id);
    expect(body.lesson.title).toBe(`${source.title} (copy)`);
    expect(body.lesson.chapterName).toBe(source.chapterName);
    expect(body.lesson.isActive).toBe(false);

    const afterList = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number }>;
    };
    expect(afterList.lessons.length).toBe(lessons.lessons.length + 1);
  });

  it("404s duplicating a lesson that doesn't exist", async () => {
    const res = await call(env, "/api/admin/lessons/999999/duplicate", { method: "POST", cookie: adminCookie });
    expect(res.status).toBe(404);
  });

  it("bulk-publishes, bulk-unpublishes, and bulk-deletes several lessons at once", async () => {
    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; isActive: boolean }>;
    };
    const ids = lessons.lessons.slice(0, 2).map((l) => l.id);

    const unpublish = await call(env, "/api/admin/lessons/bulk", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ ids, action: "unpublish" })
    });
    expect(unpublish.status).toBe(200);
    expect(((await unpublish.json()) as { affected: number }).affected).toBe(2);

    const afterUnpublish = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; isActive: boolean }>;
    };
    for (const id of ids) {
      expect(afterUnpublish.lessons.find((l) => l.id === id)?.isActive).toBe(false);
    }

    const publish = await call(env, "/api/admin/lessons/bulk", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ ids, action: "publish" })
    });
    expect(publish.status).toBe(200);
    const afterPublish = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; isActive: boolean }>;
    };
    for (const id of ids) {
      expect(afterPublish.lessons.find((l) => l.id === id)?.isActive).toBe(true);
    }

    const del = await call(env, "/api/admin/lessons/bulk", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ ids, action: "delete" })
    });
    expect(del.status).toBe(200);
    expect(((await del.json()) as { affected: number }).affected).toBe(2);

    const afterDelete = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number }>;
    };
    for (const id of ids) {
      expect(afterDelete.lessons.some((l) => l.id === id)).toBe(false);
    }
  });

  it("rejects a bulk action with an empty ids array or an unknown action", async () => {
    const emptyIds = await call(env, "/api/admin/lessons/bulk", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ ids: [], action: "publish" })
    });
    expect(emptyIds.status).toBe(400);

    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number }>;
    };
    const badAction = await call(env, "/api/admin/lessons/bulk", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ ids: [lessons.lessons[0].id], action: "explode" })
    });
    expect(badAction.status).toBe(400);
  });

  // Regression coverage for the id-param/array validation hardening: a
  // non-numeric or malformed :id route param used to reach a D1 `.bind()`
  // call as NaN and blow up as an opaque 500; it must now be a clean 404
  // (unknown resource) rather than an internal error. Likewise, array
  // payloads (bulk ids, reorder ids) must reject non-integer/non-positive
  // entries instead of silently passing them through to the query.
  it("returns 404 (not a 500) for a non-numeric lesson/chapter id in any :id route", async () => {
    const patchLesson = await call(env, "/api/admin/lessons/not-a-number", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ title: "x" })
    });
    expect(patchLesson.status).toBe(404);

    const archiveLesson = await call(env, "/api/admin/lessons/abc/archive", {
      method: "POST",
      cookie: adminCookie
    });
    expect(archiveLesson.status).toBe(404);

    const deleteLesson = await call(env, "/api/admin/lessons/abc", {
      method: "DELETE",
      cookie: adminCookie
    });
    expect(deleteLesson.status).toBe(404);

    const duplicateLesson = await call(env, "/api/admin/lessons/1.5/duplicate", {
      method: "POST",
      cookie: adminCookie
    });
    expect(duplicateLesson.status).toBe(404);

    const patchChapter = await call(env, "/api/admin/chapters/-1", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ name: "x" })
    });
    expect(patchChapter.status).toBe(404);

    const deleteChapter = await call(env, "/api/admin/chapters/0", {
      method: "DELETE",
      cookie: adminCookie
    });
    expect(deleteChapter.status).toBe(404);
  });

  it("rejects bulk/reorder id arrays containing non-integer, zero, negative, or oversized entries", async () => {
    const lessons = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number }>;
    };
    const realId = lessons.lessons[0].id;

    const bulkWithBadId = await call(env, "/api/admin/lessons/bulk", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ ids: [realId, "1 OR 1=1"], action: "unpublish" })
    });
    expect(bulkWithBadId.status).toBe(400);

    const bulkWithZero = await call(env, "/api/admin/lessons/bulk", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ ids: [0], action: "unpublish" })
    });
    expect(bulkWithZero.status).toBe(400);

    const bulkWithNegative = await call(env, "/api/admin/lessons/bulk", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ ids: [-5], action: "unpublish" })
    });
    expect(bulkWithNegative.status).toBe(400);

    const reorderWithBadId = await call(env, "/api/admin/lessons/reorder", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ orderedIds: [realId, 3.5] })
    });
    expect(reorderWithBadId.status).toBe(400);

    const chapterReorderWithBadId = await call(env, "/api/admin/chapters/reorder", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ orderedIds: [null] })
    });
    expect(chapterReorderWithBadId.status).toBe(400);

    // Confirm the earlier bad requests never mutated anything (fail closed,
    // not partially-applied).
    const afterList = (await (await call(env, "/api/admin/lessons", { cookie: adminCookie })).json()) as {
      lessons: Array<{ id: number; isActive: boolean }>;
    };
    expect(afterList.lessons.find((l) => l.id === realId)?.isActive).toBe(true);

    // A well-formed, oversized array (over the 500-entry cap) is rejected too.
    const tooMany = await call(env, "/api/admin/lessons/bulk", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ ids: Array.from({ length: 501 }, (_, i) => i + 1), action: "unpublish" })
    });
    expect(tooMany.status).toBe(400);
  });
});

describe("Admin revenue/signup analytics (HTTP)", () => {
  let env: Env;
  let adminCookie: string;

  beforeEach(async () => {
    env = await createTestEnv();
    await seedAdmin(env, "admin@example.com", "correct-horse-battery");
    adminCookie = await loginAdmin(env, "admin@example.com", "correct-horse-battery");
  });

  async function seedPaidOrder(env: Env, email: string, amount: number) {
    const { user } = await loginNewUser(env, email);
    await env.DB.prepare(
      `INSERT INTO payment_orders (id, user_id, amount, currency, status, confirmed_at)
       VALUES (?, ?, ?, 'usdtbsc', 'finished', datetime('now'))`
    )
      .bind(randomUuid(), user.id, amount)
      .run();
    return user;
  }

  it("requires an admin session", async () => {
    const res = await call(env, "/api/admin/analytics");
    expect(res.status).toBe(401);
  });

  it("only counts confirmed/finished orders toward revenue, ignores pending/failed ones", async () => {
    await seedPaidOrder(env, "buyer1@example.com", 49);
    await seedPaidOrder(env, "buyer2@example.com", 49);

    const { user: pendingUser } = await loginNewUser(env, "pending@example.com");
    await env.DB.prepare(`INSERT INTO payment_orders (id, user_id, amount, currency, status) VALUES (?, ?, ?, 'usdtbsc', 'waiting')`)
      .bind(randomUuid(), pendingUser.id, 49)
      .run();

    const res = await call(env, "/api/admin/analytics", { cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalRevenue: number;
      totalPaidOrders: number;
      avgOrderValue: number;
      dailyRevenue: Array<{ date: string; amount: number; count: number }>;
      statusBreakdown: Array<{ status: string; count: number }>;
    };
    expect(body.totalRevenue).toBe(98);
    expect(body.totalPaidOrders).toBe(2);
    expect(body.avgOrderValue).toBe(49);
    expect(body.dailyRevenue.length).toBe(30);
    // Today's bucket should carry both confirmed orders.
    expect(body.dailyRevenue[29].amount).toBe(98);
    expect(body.statusBreakdown.find((s) => s.status === "waiting")?.count).toBe(1);
    expect(body.statusBreakdown.find((s) => s.status === "finished")?.count).toBe(2);
  });

  it("returns zeroed-out analytics when there are no orders yet", async () => {
    const res = await call(env, "/api/admin/analytics", { cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalRevenue: number; totalPaidOrders: number; dailyRevenue: unknown[] };
    expect(body.totalRevenue).toBe(0);
    expect(body.totalPaidOrders).toBe(0);
    expect(body.dailyRevenue.length).toBe(30);
  });
});

describe("Admin-editable price/discount settings (HTTP)", () => {
  let env: Env;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("public config reflects env var defaults until an admin changes them", async () => {
    const res = await call(env, "/api/config/public");
    const body = (await res.json()) as { enrollmentPrice: number; referencePrice: number };
    expect(body.enrollmentPrice).toBe(39); // from testEnv's ENROLLMENT_PRICE_USDT
    expect(body.referencePrice).toBe(100);
  });

  it("an admin can update the price, and it's reflected everywhere immediately", async () => {
    await seedAdmin(env, "admin@example.com", "correct-horse-battery");
    const adminCookie = await loginAdmin(env, "admin@example.com", "correct-horse-battery");

    const update = await call(env, "/api/admin/settings", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ enrollmentPrice: 25, referencePrice: 80 })
    });
    expect(update.status).toBe(200);

    const publicConfig = await call(env, "/api/config/public");
    const body = (await publicConfig.json()) as { enrollmentPrice: number; referencePrice: number };
    expect(body.enrollmentPrice).toBe(25);
    expect(body.referencePrice).toBe(80);
  });
});
