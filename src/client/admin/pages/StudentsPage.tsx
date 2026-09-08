import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card } from "../../components/ui";

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

  return (
    <div>
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
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
                    No students yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
