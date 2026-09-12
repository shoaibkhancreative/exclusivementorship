import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Button, Card } from "../../components/ui";
import { ImageUrlPreview } from "../../components/ImageUrlPreview";
import { BookIcon, SearchIcon, CopyIcon } from "../components/icons";
import { fileToCompressedDataUrl } from "../../lib/imageAttachment";

interface AdminLesson {
  id: number;
  lessonNumber: number;
  title: string;
  chapterName: string;
  tagline: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  videoEmbedUrl: string | null;
  isFree: boolean;
  isActive: boolean;
  watermarkEnabled: boolean;
  /** Admin-entered display label like "12:45" — shown as a badge on the thumbnail wherever it renders. Never auto-detected from the video. */
  durationLabel: string | null;
}

interface AdminChapter {
  id: number;
  name: string;
  tagline: string | null;
  sortOrder: number;
}

const inputClass =
  "focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none";
const textareaClass = `${inputClass} min-h-[70px] resize-y`;

/**
 * Replaces the old "paste a thumbnail URL" text field with a real file
 * picker. The chosen image is resized/compressed client-side to a small
 * `data:image/...;base64,...` URL (see fileToCompressedDataUrl — same
 * helper the support-chat attach flow uses) and that data URL becomes the
 * form's `thumbnailUrl` value, exactly like a pasted URL would — the server
 * re-validates and caps it independently (see normalizeLessonThumbnail /
 * LESSON_THUMBNAIL_MAX_BYTES in worker/lib/config.ts), never trusting this
 * client-side resize. Existing lessons that still point at an external
 * http(s) thumbnail keep previewing fine here too; picking a new file just
 * replaces it.
 */
function ThumbnailField({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const { dataUrl } = await fileToCompressedDataUrl(file, { maxLongEdge: 800, quality: 0.75 });
      onChange(dataUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't read that image.";
      // fileToCompressedDataUrl prefixes some errors with "unsupported_format:" for
      // programmatic handling elsewhere — strip that prefix for display here.
      setError(msg.includes(":") ? msg.slice(msg.indexOf(":") + 1) : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Thumbnail (optional)</label>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFile}
          className="hidden"
        />
        <Button type="button" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Processing…" : value ? "Change thumbnail" : "Upload thumbnail"}
        </Button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="focus-ring text-xs text-zinc-500 hover:text-red-400"
          >
            Remove
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">JPEG, PNG, WebP, or GIF. Resized automatically — under 1MB.</p>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <ImageUrlPreview url={value} />
    </div>
  );
}

/**
 * Plain text input for the manual, admin-entered "12:45"-style duration
 * label shown as a badge on the class's thumbnail (Learn page grid, Lesson
 * page sidebar, and the Lesson page's own cover thumbnail). Deliberately
 * NOT auto-detected from the video file — nothing on this site probes a
 * YouTube or Bunny embed for its runtime, so this stays a manual field the
 * admin fills in themselves. Left blank, no badge renders at all.
 */
function DurationField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Duration (optional)</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 12:45"
        className={`${inputClass} max-w-[160px]`}
      />
      <p className="mt-1 text-xs text-zinc-500">
        Shown as a badge on the thumbnail. Type it in as m:ss or h:mm:ss — this is never read from the video itself.
      </p>
    </div>
  );
}

type LessonStatusFilter = "all" | "published" | "hidden" | "free" | "paid" | "no-video";

interface LessonGroup {
  chapterName: string;
  lessons: AdminLesson[];
}

/**
 * Groups lessons by chapter, in the CHAPTERS' own order (not the order
 * chapter names happen to first appear in `lessons`) — and always keeps
 * each chapter's lessons together as one contiguous block. This is what the
 * public course page assumes too (a chapter's lessons must be contiguous in
 * lesson_number/sort_order — see OutlineList.tsx), so both the display here
 * and the order we send back on reorder rely on this same grouping.
 *
 * Every known chapter gets a group even when it currently has zero lessons
 * (e.g. right after creating it, or after dragging every lesson out of it) —
 * an empty chapter still needs to render as a drop target for drag-and-drop.
 */
function groupLessonsByChapterOrder(lessons: AdminLesson[], chapters: AdminChapter[]): LessonGroup[] {
  const byChapter = new Map<string, AdminLesson[]>();
  for (const lesson of lessons) {
    const list = byChapter.get(lesson.chapterName) ?? [];
    list.push(lesson);
    byChapter.set(lesson.chapterName, list);
  }
  const groups: LessonGroup[] = chapters.map((chapter) => ({
    chapterName: chapter.name,
    lessons: byChapter.get(chapter.name) ?? []
  }));
  // Defensive: a lesson whose chapterName doesn't match any known chapter
  // (shouldn't normally happen) still gets shown, grouped at the end.
  const known = new Set(chapters.map((c) => c.name));
  for (const [name, list] of byChapter) {
    if (!known.has(name)) groups.push({ chapterName: name, lessons: list });
  }
  return groups;
}

function matchesStatusFilter(lesson: AdminLesson, filter: LessonStatusFilter): boolean {
  switch (filter) {
    case "published":
      return lesson.isActive;
    case "hidden":
      return !lesson.isActive;
    case "free":
      return lesson.isFree;
    case "paid":
      return !lesson.isFree;
    case "no-video":
      return !lesson.videoEmbedUrl;
    case "all":
    default:
      return true;
  }
}

export default function LessonsPage() {
  const [lessons, setLessons] = useState<AdminLesson[] | null>(null);
  const [chapters, setChapters] = useState<AdminChapter[] | null>(null);
  const [freeLessonCount, setFreeLessonCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [showAddLesson, setShowAddLesson] = useState(false);
  const [showAddChapter, setShowAddChapter] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<number | null>(null);

  // Search + status filter for the Lessons list. Filtering only changes
  // which classes are VISIBLE — it never reorders or renumbers anything.
  // Drag-and-drop and the up/down arrows are disabled while a filter is
  // active (see isFiltering below), since moving a class while some of its
  // chapter-mates are hidden from view could silently misplace it relative
  // to classes you can't currently see.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LessonStatusFilter>("all");
  const isFiltering = search.trim().length > 0 || statusFilter !== "all";

  // Bulk selection — checkboxes on each visible lesson row, acted on via
  // the toolbar that appears once at least one is selected.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Drag-and-drop state for reordering lessons (and moving them between
  // chapters). `dragOverChapter` is purely visual — it highlights whichever
  // chapter section is currently a valid drop target.
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverChapter, setDragOverChapter] = useState<string | null>(null);

  async function load() {
    const [lessonsRes, chaptersRes] = await Promise.all([
      api.get<{ lessons: AdminLesson[]; freeLessonCount: number }>("/admin/lessons"),
      api.get<{ chapters: AdminChapter[] }>("/admin/chapters")
    ]);
    setLessons(lessonsRes.lessons);
    setFreeLessonCount(lessonsRes.freeLessonCount);
    setChapters(chaptersRes.chapters);
  }

  useEffect(() => {
    load().catch(() => setError("Couldn't load lessons."));
  }, []);

  async function reloadSafely() {
    try {
      await load();
    } catch {
      setError("Couldn't refresh — please reload the page.");
    }
  }

  async function moveLesson(lessonId: number, direction: -1 | 1) {
    if (!lessons || !chapters) return;

    // Arrow buttons move only within the lesson's own chapter. Swapping
    // across a chapter boundary (which the old global-index swap allowed)
    // would silently renumber a lesson into a different chapter's position —
    // desyncing the free/paid class boundary (lesson_number-based) and
    // splitting chapters apart on the public course page. Use drag-and-drop
    // (dragLesson/dropLesson below) to move a lesson to another chapter.
    const groups = groupLessonsByChapterOrder(lessons, chapters);
    let groupIndex = -1;
    let indexInGroup = -1;
    for (let g = 0; g < groups.length; g++) {
      const idx = groups[g].lessons.findIndex((l) => l.id === lessonId);
      if (idx !== -1) {
        groupIndex = g;
        indexInGroup = idx;
        break;
      }
    }
    if (groupIndex === -1) return;
    const group = groups[groupIndex].lessons;
    const targetIndex = indexInGroup + direction;
    if (targetIndex < 0 || targetIndex >= group.length) return;

    [group[indexInGroup], group[targetIndex]] = [group[targetIndex], group[indexInGroup]];
    const reordered = groups.flatMap((g) => g.lessons);
    setLessons(reordered); // optimistic
    setBusy(true);
    try {
      await api.post("/admin/lessons/reorder", { orderedIds: reordered.map((l) => l.id) });
      await reloadSafely();
    } catch {
      setError("Couldn't reorder lessons.");
      await reloadSafely();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Moves the currently-dragged lesson to just before `targetLessonId`
   * inside `targetChapterName` (or to the end of that chapter's list if
   * `targetLessonId` is null — dropping on the chapter's empty space). This
   * is the one place a lesson can cross a chapter boundary: the lesson's
   * chapterName is updated to match wherever it was dropped, and every
   * class's "Class N" number is recomputed from the resulting top-to-bottom
   * order, exactly like the backend already does for any reorder.
   */
  async function dropLesson(targetChapterName: string, targetLessonId: number | null) {
    const draggedId = draggingId;
    setDraggingId(null);
    setDragOverChapter(null);
    if (!lessons || !chapters || draggedId == null || draggedId === targetLessonId) return;

    const groups = groupLessonsByChapterOrder(lessons, chapters);
    let dragged: AdminLesson | null = null;
    for (const g of groups) {
      const idx = g.lessons.findIndex((l) => l.id === draggedId);
      if (idx !== -1) {
        dragged = g.lessons[idx];
        g.lessons.splice(idx, 1);
        break;
      }
    }
    const targetGroup = groups.find((g) => g.chapterName === targetChapterName);
    if (!dragged || !targetGroup) return;

    const moved: AdminLesson = { ...dragged, chapterName: targetChapterName };
    if (targetLessonId == null) {
      targetGroup.lessons.push(moved);
    } else {
      const insertIndex = targetGroup.lessons.findIndex((l) => l.id === targetLessonId);
      targetGroup.lessons.splice(insertIndex === -1 ? targetGroup.lessons.length : insertIndex, 0, moved);
    }

    const reordered = groups.flatMap((g) => g.lessons);
    setLessons(reordered); // optimistic
    setBusy(true);
    try {
      await api.post("/admin/lessons/reorder", {
        orderedLessons: reordered.map((l) => ({ id: l.id, chapterName: l.chapterName }))
      });
      await reloadSafely();
    } catch {
      setError("Couldn't reorder lessons.");
      await reloadSafely();
    } finally {
      setBusy(false);
    }
  }

  async function archiveLesson(lessonId: number) {
    if (!confirm("Hide this lesson from the public course? Student progress is kept.")) return;
    setBusy(true);
    try {
      await api.post(`/admin/lessons/${lessonId}/archive`, {});
      await reloadSafely();
    } catch {
      setError("Couldn't archive lesson.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLesson(lessonId: number) {
    if (
      !confirm(
        "Permanently delete this class? This cannot be undone, and any student's saved progress on it will be lost too. " +
          "If you just want to hide it, use \"Hide\" instead."
      )
    )
      return;
    setBusy(true);
    try {
      await api.delete(`/admin/lessons/${lessonId}`);
      await reloadSafely();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete lesson.");
    } finally {
      setBusy(false);
    }
  }

  async function duplicateLesson(lessonId: number) {
    setBusy(true);
    try {
      await api.post(`/admin/lessons/${lessonId}/duplicate`, {});
      await reloadSafely();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't duplicate lesson.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteChapter(chapterId: number) {
    if (!confirm("Delete this chapter? This only works if it has no classes left in it.")) return;
    setBusy(true);
    try {
      await api.delete(`/admin/chapters/${chapterId}`);
      await reloadSafely();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete chapter.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(lesson: AdminLesson) {
    setBusy(true);
    try {
      await api.patch(`/admin/lessons/${lesson.id}`, { isActive: !lesson.isActive });
      await reloadSafely();
    } catch {
      setError("Couldn't update lesson.");
    } finally {
      setBusy(false);
    }
  }

  async function moveChapter(chapterId: number, direction: -1 | 1) {
    if (!chapters) return;
    const index = chapters.findIndex((c) => c.id === chapterId);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= chapters.length) return;

    const reordered = [...chapters];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setChapters(reordered);
    setBusy(true);
    try {
      await api.post("/admin/chapters/reorder", { orderedIds: reordered.map((c) => c.id) });
      await reloadSafely();
    } catch {
      setError("Couldn't reorder chapters.");
      await reloadSafely();
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(lessonId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  }

  async function runBulkAction(action: "publish" | "unpublish" | "delete") {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    if (action === "delete") {
      if (
        !confirm(
          `Permanently delete ${ids.length} selected class${ids.length === 1 ? "" : "es"}? This cannot be undone, and any student progress on them will be lost too.`
        )
      )
        return;
    }
    setBulkBusy(true);
    try {
      await api.post<{ ok: true; affected: number }>("/admin/lessons/bulk", { ids, action });
      setSelectedIds(new Set());
      await reloadSafely();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't apply that action to the selected classes.");
    } finally {
      setBulkBusy(false);
    }
  }

  if (error && !lessons) return <p className="text-sm text-red-400">{error}</p>;
  if (!lessons || !chapters) return <p className="text-sm text-zinc-500">Loading…</p>;

  // Grouped by the chapters' own order (see groupLessonsByChapterOrder) so
  // this section always matches both the Chapters list above and the public
  // course page — not whichever chapter a lesson happens to appear under
  // first in the raw (lesson_number-ordered) list.
  const lessonGroups = groupLessonsByChapterOrder(lessons, chapters);

  const q = search.trim().toLowerCase();
  const visibleGroups = lessonGroups
    .map((group) => ({
      ...group,
      lessons: group.lessons.filter((lesson) => {
        if (!matchesStatusFilter(lesson, statusFilter)) return false;
        if (!q) return true;
        return (
          lesson.title.toLowerCase().includes(q) ||
          (lesson.tagline ?? "").toLowerCase().includes(q) ||
          `class ${lesson.lessonNumber}`.includes(q)
        );
      })
    }))
    .filter((group) => !isFiltering || group.lessons.length > 0);

  const visibleLessonIds = visibleGroups.flatMap((g) => g.lessons.map((l) => l.id));
  const allVisibleSelected = visibleLessonIds.length > 0 && visibleLessonIds.every((id) => selectedIds.has(id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleLessonIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...visibleLessonIds]);
    });
  }

  return (
    <div className="page-enter flex flex-col gap-8">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-base-800 text-zinc-400">
              <BookIcon />
            </span>
            <h1 className="text-xl text-zinc-100">Chapters</h1>
          </div>
          <Button variant="secondary" onClick={() => setShowAddChapter((v) => !v)}>
            {showAddChapter ? "Cancel" : "+ Add chapter"}
          </Button>
        </div>

        {showAddChapter && (
          <AddChapterForm
            onCreated={() => {
              setShowAddChapter(false);
              reloadSafely();
            }}
            onError={setError}
          />
        )}

        <Card className="mt-3 divide-y divide-base-800 p-0">
          {chapters.map((chapter, i) => {
            const lessonCount = lessons.filter((l) => l.chapterName === chapter.name).length;
            return (
              <div key={chapter.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-base-800/30">
                <div className="flex flex-col">
                  <button
                    disabled={busy || i === 0}
                    onClick={() => moveChapter(chapter.id, -1)}
                    className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    aria-label="Move chapter up"
                  >
                    ▲
                  </button>
                  <button
                    disabled={busy || i === chapters.length - 1}
                    onClick={() => moveChapter(chapter.id, 1)}
                    className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    aria-label="Move chapter down"
                  >
                    ▼
                  </button>
                </div>
                <div className="flex-1">
                  {editingChapterId === chapter.id ? (
                    <EditChapterForm
                      chapter={chapter}
                      onDone={() => {
                        setEditingChapterId(null);
                        reloadSafely();
                      }}
                      onError={setError}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="text-sm text-zinc-100">{chapter.name}</div>
                        {chapter.tagline && <div className="text-xs text-zinc-500">{chapter.tagline}</div>}
                      </div>
                      <span className="rounded-full bg-base-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                        {lessonCount} {lessonCount === 1 ? "class" : "classes"}
                      </span>
                    </div>
                  )}
                </div>
                {editingChapterId !== chapter.id && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setEditingChapterId(chapter.id)}
                      className="focus-ring rounded-md border border-base-700 px-3 py-1 text-xs text-zinc-300 hover:bg-base-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteChapter(chapter.id)}
                      disabled={busy}
                      className="focus-ring rounded-md border border-red-900/50 px-3 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-base-800 text-zinc-400">
                <BookIcon />
              </span>
              <h1 className="text-xl text-zinc-100">Lessons</h1>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              First {freeLessonCount} class{freeLessonCount === 1 ? "" : "es"} (in this order) are free — change that
              in Settings → Course.
            </p>
          </div>
          <Button variant="secondary" disabled={chapters.length === 0} onClick={() => setShowAddLesson((v) => !v)}>
            {showAddLesson ? "Cancel" : "+ Add lesson"}
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search classes by title or tagline…"
              className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LessonStatusFilter)}
            className="focus-ring rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            <option value="all">All classes</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
            <option value="no-video">Missing video</option>
          </select>
          {isFiltering && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              className="focus-ring rounded-lg border border-base-700 px-3 py-2 text-xs text-zinc-400 hover:bg-base-800"
            >
              Clear filters
            </button>
          )}
        </div>

        {isFiltering && (
          <p className="mb-3 text-xs text-yellow-300/80">
            Filtering hides non-matching classes and turns off drag-and-drop / reorder arrows — clear filters to
            reorder.
          </p>
        )}

        {visibleLessonIds.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-base-700 bg-base-900/60 px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="h-4 w-4 rounded border-base-700 bg-base-800 accent-accent-500"
              />
              Select all {isFiltering ? "matching" : "visible"} ({visibleLessonIds.length})
            </label>
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">{selectedIds.size} selected</span>
                <button
                  onClick={() => runBulkAction("publish")}
                  disabled={bulkBusy}
                  className="focus-ring rounded-md border border-base-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-base-800 disabled:opacity-50"
                >
                  Publish
                </button>
                <button
                  onClick={() => runBulkAction("unpublish")}
                  disabled={bulkBusy}
                  className="focus-ring rounded-md border border-base-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-base-800 disabled:opacity-50"
                >
                  Unpublish
                </button>
                <button
                  onClick={() => runBulkAction("delete")}
                  disabled={bulkBusy}
                  className="focus-ring rounded-md border border-red-900/50 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  disabled={bulkBusy}
                  className="focus-ring rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        )}

        {chapters.length === 0 && (
          <p className="mb-3 text-xs text-zinc-500">Add a chapter above first — every lesson needs one.</p>
        )}

        {showAddLesson && (
          <AddLessonForm
            chapters={chapters}
            onCreated={() => {
              setShowAddLesson(false);
              reloadSafely();
            }}
            onError={setError}
          />
        )}

        {isFiltering && visibleGroups.length === 0 && (
          <Card className="py-6 text-center text-sm text-zinc-500">No classes match your search/filter.</Card>
        )}

        <div className="flex flex-col gap-5">
          {visibleGroups.map((group) => (
            <div key={group.chapterName}>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-400">
                <span>{group.chapterName}</span>
                <span className="h-px flex-1 bg-base-800" />
              </div>
              <Card
                className={`divide-y divide-base-800 p-0 transition-colors ${
                  dragOverChapter === group.chapterName ? "ring-1 ring-accent-500/50" : ""
                }`}
                onDragOver={(e) => {
                  if (isFiltering || draggingId == null) return;
                  e.preventDefault();
                  setDragOverChapter(group.chapterName);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (isFiltering) return;
                  dropLesson(group.chapterName, null);
                }}
              >
                {group.lessons.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-zinc-600">
                    No classes here yet — drag one in, or use "+ Add lesson" above.
                  </div>
                )}
                {group.lessons.map((lesson, indexInChapter) => {
                  const isDragging = draggingId === lesson.id;
                  const isSelected = selectedIds.has(lesson.id);
                  return (
                    <div
                      key={lesson.id}
                      draggable={!isFiltering && editingId !== lesson.id}
                      onDragStart={(e) => {
                        setDraggingId(lesson.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverChapter(null);
                      }}
                      onDragOver={(e) => {
                        if (isFiltering || draggingId == null || draggingId === lesson.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverChapter(group.chapterName);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (isFiltering) return;
                        dropLesson(group.chapterName, lesson.id);
                      }}
                      className={`px-4 py-3 transition-colors hover:bg-base-800/30 ${isDragging ? "opacity-40" : ""} ${isSelected ? "bg-accent-500/5" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(lesson.id)}
                          className="mt-1.5 h-4 w-4 shrink-0 rounded border-base-700 bg-base-800 accent-accent-500"
                          aria-label={`Select ${lesson.title}`}
                        />
                        <div className="flex flex-col items-center gap-1 pt-1">
                          <span
                            className={`text-zinc-600 ${isFiltering ? "opacity-30" : "cursor-grab active:cursor-grabbing"}`}
                            aria-hidden="true"
                            title={isFiltering ? "Clear filters to reorder" : "Drag to reorder"}
                          >
                            ⠿
                          </span>
                          <button
                            disabled={busy || isFiltering || indexInChapter === 0}
                            onClick={() => moveLesson(lesson.id, -1)}
                            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                            aria-label="Move lesson up"
                          >
                            ▲
                          </button>
                          <button
                            disabled={busy || isFiltering || indexInChapter === group.lessons.length - 1}
                            onClick={() => moveLesson(lesson.id, 1)}
                            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                            aria-label="Move lesson down"
                          >
                            ▼
                          </button>
                        </div>

                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-zinc-500">Class {lesson.lessonNumber}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                lesson.isFree ? "bg-base-800 text-zinc-400" : "bg-accent-500/15 text-accent-300"
                              }`}
                            >
                              {lesson.isFree ? "Free" : "Paid"}
                            </span>
                            {!lesson.isActive && (
                              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300">
                                Hidden
                              </span>
                            )}
                            {!lesson.videoEmbedUrl && (
                              <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
                                No video yet
                              </span>
                            )}
                            {lesson.durationLabel && (
                              <span className="rounded-full bg-base-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                                {lesson.durationLabel}
                              </span>
                            )}
                          </div>

                          {editingId === lesson.id ? (
                            <EditLessonForm
                              lesson={lesson}
                              chapters={chapters}
                              onDone={() => {
                                setEditingId(null);
                                reloadSafely();
                              }}
                              onError={setError}
                            />
                          ) : (
                            <div className="mt-1">
                              <div className="text-sm text-zinc-100">{lesson.title}</div>
                              {lesson.tagline && <div className="text-xs text-zinc-500">{lesson.tagline}</div>}
                            </div>
                          )}
                        </div>

                        {editingId !== lesson.id && (
                          <div className="flex shrink-0 flex-wrap justify-end gap-2">
                            <button
                              onClick={() => toggleActive(lesson)}
                              disabled={busy}
                              className="focus-ring rounded-md border border-base-700 px-3 py-1 text-xs text-zinc-300 hover:bg-base-800 disabled:opacity-50"
                            >
                              {lesson.isActive ? "Unpublish" : "Publish"}
                            </button>
                            <button
                              onClick={() => setEditingId(lesson.id)}
                              className="focus-ring rounded-md border border-base-700 px-3 py-1 text-xs text-zinc-300 hover:bg-base-800"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => duplicateLesson(lesson.id)}
                              disabled={busy}
                              title="Duplicate this class"
                              className="focus-ring flex items-center gap-1 rounded-md border border-base-700 px-3 py-1 text-xs text-zinc-300 hover:bg-base-800 disabled:opacity-50"
                            >
                              <CopyIcon className="h-3.5 w-3.5" />
                              Duplicate
                            </button>
                            <button
                              onClick={() => archiveLesson(lesson.id)}
                              disabled={busy}
                              className="focus-ring rounded-md border border-base-700 px-3 py-1 text-xs text-zinc-300 hover:bg-base-800 disabled:opacity-50"
                            >
                              Hide
                            </button>
                            <button
                              onClick={() => deleteLesson(lesson.id)}
                              disabled={busy}
                              className="focus-ring rounded-md border border-red-900/50 px-3 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AddChapterForm({ onCreated, onError }: { onCreated: () => void; onError: (msg: string) => void }) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/admin/chapters", { name, tagline });
      onCreated();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't create chapter.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-2 max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Chapter name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Tagline (optional)</label>
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} className={inputClass} />
        </div>
        <Button type="submit" disabled={submitting} className="self-start">
          {submitting ? "Adding…" : "Add chapter"}
        </Button>
      </form>
    </Card>
  );
}

function EditChapterForm({
  chapter,
  onDone,
  onError
}: {
  chapter: AdminChapter;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(chapter.name);
  const [tagline, setTagline] = useState(chapter.tagline ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch(`/admin/chapters/${chapter.id}`, { name, tagline });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't update chapter.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
      <input
        value={tagline}
        onChange={(e) => setTagline(e.target.value)}
        placeholder="Tagline"
        className={inputClass}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddLessonForm({
  chapters,
  onCreated,
  onError
}: {
  chapters: AdminChapter[];
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [chapterName, setChapterName] = useState(chapters[0]?.name ?? "");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [videoEmbedUrl, setVideoEmbedUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [durationLabel, setDurationLabel] = useState("");
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/admin/lessons", {
        title,
        chapterName,
        tagline,
        description,
        videoEmbedUrl,
        thumbnailUrl,
        durationLabel,
        watermarkEnabled
      });
      onCreated();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't create lesson.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-2 max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Chapter</label>
          <select value={chapterName} onChange={(e) => setChapterName(e.target.value)} className={inputClass}>
            {chapters.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Tagline</label>
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={textareaClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Video embed link</label>
          <input
            value={videoEmbedUrl}
            onChange={(e) => setVideoEmbedUrl(e.target.value)}
            placeholder="https://www.youtube-nocookie.com/embed/... or Bunny.net embed URL"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">
            New lessons are created hidden ("Publish" it once the video link is ready).
          </p>
        </div>
        <ThumbnailField value={thumbnailUrl} onChange={setThumbnailUrl} />
        <DurationField value={durationLabel} onChange={setDurationLabel} />
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={watermarkEnabled}
            onChange={(e) => setWatermarkEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-base-700 bg-base-800 accent-accent-500"
          />
          Show viewer&apos;s email as a watermark on this lesson&apos;s video
        </label>
        <Button type="submit" disabled={submitting} className="self-start">
          {submitting ? "Adding…" : "Add lesson"}
        </Button>
      </form>
    </Card>
  );
}

function EditLessonForm({
  lesson,
  chapters,
  onDone,
  onError
}: {
  lesson: AdminLesson;
  chapters: AdminChapter[];
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [chapterName, setChapterName] = useState(lesson.chapterName);
  const [tagline, setTagline] = useState(lesson.tagline ?? "");
  const [description, setDescription] = useState(lesson.description ?? "");
  const [videoEmbedUrl, setVideoEmbedUrl] = useState(lesson.videoEmbedUrl ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(lesson.thumbnailUrl ?? "");
  const [durationLabel, setDurationLabel] = useState(lesson.durationLabel ?? "");
  const [watermarkEnabled, setWatermarkEnabled] = useState(lesson.watermarkEnabled);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch(`/admin/lessons/${lesson.id}`, {
        title,
        chapterName,
        tagline,
        description,
        videoEmbedUrl,
        thumbnailUrl,
        durationLabel,
        watermarkEnabled
      });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't update lesson.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Chapter</label>
        <select value={chapterName} onChange={(e) => setChapterName(e.target.value)} className={inputClass}>
          {chapters.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Tagline</label>
        <input value={tagline} onChange={(e) => setTagline(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={textareaClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Video embed link</label>
        <input
          value={videoEmbedUrl}
          onChange={(e) => setVideoEmbedUrl(e.target.value)}
          placeholder="https://www.youtube-nocookie.com/embed/... or Bunny.net embed URL"
          className={inputClass}
        />
      </div>
      <ThumbnailField value={thumbnailUrl} onChange={setThumbnailUrl} />
      <DurationField value={durationLabel} onChange={setDurationLabel} />
      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={watermarkEnabled}
          onChange={(e) => setWatermarkEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-base-700 bg-base-800 accent-accent-500"
        />
        Show viewer&apos;s email as a watermark on this lesson&apos;s video
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
