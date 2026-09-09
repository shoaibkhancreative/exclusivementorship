import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Card, Button } from "../../components/ui";

const WIPE_ALL_CONFIRMATION_PHRASE = "DELETE ALL STUDENT DATA";

interface StudentRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  currentLesson: number;
  courseStatus: "free" | "paid";
  paidAt: string | null;
  completedLessons: number;
  totalLessons: number;
  latestPaymentStatus: string | null;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    api
      .get<{ students: StudentRow[] }>("/admin/students")
      .then((res) => setStudents(res.students))
      .catch(() => setError("Couldn't load students."));
  }

  useEffect(load, []);

  async function toggleAccess(student: StudentRow) {
    const nextStatus = student.courseStatus === "paid" ? "free" : "paid";
    const verb = nextStatus === "paid" ? "grant" : "revoke";
    if (!confirm(`${verb === "grant" ? "Grant" : "Revoke"} paid access for ${student.email}?`)) return;

    setBusyId(student.id);
    try {
      await api.post(`/admin/students/${student.id}/access`, { status: nextStatus });
      load();
    } catch {
      setError(`Couldn't ${verb} access for ${student.email}.`);
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Permanently deletes one student's account (progress, payment history,
   * everything). Requires the admin to type the exact email back — a plain
   * confirm() is too easy to click through for something this destructive.
   */
  async function deleteStudent(student: StudentRow) {
    const typed = prompt(
      `This permanently deletes ${student.email}'s account — progress, payment history, everything. This cannot be undone.\n\nType the student's email to confirm:`
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== student.email.toLowerCase()) {
      setError("Email didn't match — account was not deleted.");
      return;
    }

    setBusyId(student.id);
    try {
      await api.delete(`/admin/students/${student.id}`, { confirmEmail: typed.trim() });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Couldn't delete ${student.email}.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-enter">
      <h1 className="mb-4 text-xl text-zinc-100">Student Directory</h1>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!students && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {students && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-800 text-xs uppercase text-zinc-500">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Current Lesson</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3">Danger</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-base-800/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-zinc-100">{s.name || s.email}</div>
                    {s.name && <div className="text-xs text-zinc-500">{s.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.courseStatus === "paid"
                          ? "bg-accent-500/15 text-accent-300"
                          : "bg-base-800 text-zinc-400"
                      }`}
                    >
                      {s.courseStatus === "paid" ? "Paid" : "Free"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">Class {s.currentLesson}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    {s.completedLessons} / {s.totalLessons}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{s.latestPaymentStatus ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-500">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleAccess(s)}
                      disabled={busyId === s.id}
                      className={`focus-ring rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        s.courseStatus === "paid"
                          ? "border-base-700 text-zinc-400 hover:bg-base-800"
                          : "border-accent-500/40 text-accent-300 hover:bg-accent-500/10"
                      }`}
                    >
                      {busyId === s.id ? "Working…" : s.courseStatus === "paid" ? "Revoke access" : "Grant paid access"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteStudent(s)}
                      disabled={busyId === s.id}
                      className="focus-ring rounded-md border border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-950/40 disabled:opacity-50"
                    >
                      {busyId === s.id ? "Working…" : "Delete account"}
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-zinc-500">
                    No students yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <DangerZone studentCount={students?.length ?? 0} onWiped={load} />
    </div>
  );
}

/**
 * Wipes every student account and everything that cascades from it
 * (progress, payment history, notifications). Course content and admin
 * accounts are never touched. Gated behind typing an exact phrase back —
 * there is no "undo" for this, so a plain confirm() isn't enough.
 */
function DangerZone({ studentCount, onWiped }: { studentCount: number; onWiped: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function wipeAll() {
    const typed = prompt(
      `This permanently deletes ALL ${studentCount} student accounts and everything tied to them (progress, payment history, notifications). Course content and your own admin login are not affected. This cannot be undone.\n\nType "${WIPE_ALL_CONFIRMATION_PHRASE}" to confirm:`
    );
    if (typed === null) return;
    if (typed !== WIPE_ALL_CONFIRMATION_PHRASE) {
      setError(`Didn't match "${WIPE_ALL_CONFIRMATION_PHRASE}" exactly — nothing was deleted.`);
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ ok: true; deletedCount: number }>("/admin/students/wipe-all", {
        confirm: typed
      });
      setResult(`Deleted ${res.deletedCount} student account(s).`);
      onWiped();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't wipe student data.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-8 border-red-900/50">
      <h2 className="mb-1 text-sm font-semibold text-red-400">Danger zone</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Permanently delete every student account and all data tied to them. Course content and admin logins are
        unaffected. This cannot be undone.
      </p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {result && <p className="mb-3 text-sm text-accent-300">{result}</p>}
      <Button
        variant="secondary"
        onClick={wipeAll}
        disabled={busy || studentCount === 0}
        className="border-red-900/50 text-red-400 hover:bg-red-950/40"
      >
        {busy ? "Working…" : "Delete all student data"}
      </Button>
    </Card>
  );
}
