import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Card, Button } from "../../components/ui";
import StatCard from "../components/StatCard";
import { UsersIcon, CoinIcon, TrendUpIcon, SearchIcon, DownloadIcon, ChevronDownIcon } from "../components/icons";

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

type StatusFilter = "all" | "paid" | "free";
type SortKey = "createdAt" | "name" | "currentLesson" | "progress";
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function initialFor(s: StudentRow) {
  return (s.name || s.email).trim()[0]?.toUpperCase() ?? "?";
}

function progressPct(s: StudentRow) {
  return s.totalLessons ? s.completedLessons / s.totalLessons : 0;
}

/** Escapes a value for a CSV cell — wraps in quotes and doubles any embedded quotes whenever the value contains a comma, quote, or newline. */
function csvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

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

  // Search + status filter, then sort — recomputed whenever any control
  // changes. Pagination is a separate slice below so changing the sort/
  // filter always resets back to page 1 (a stale page number could
  // otherwise land past the end of a newly-shrunk result set).
  const filteredSorted = useMemo(() => {
    if (!students) return null;
    const q = query.trim().toLowerCase();
    let rows = students;
    if (q) {
      rows = rows.filter((s) => s.email.toLowerCase().includes(q) || (s.name ?? "").toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      rows = rows.filter((s) => s.courseStatus === statusFilter);
    }

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return (a.name || a.email).localeCompare(b.name || b.email) * dir;
        case "currentLesson":
          return (a.currentLesson - b.currentLesson) * dir;
        case "progress":
          return (progressPct(a) - progressPct(b)) * dir;
        case "createdAt":
        default:
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      }
    });
    return sorted;
  }, [students, query, statusFilter, sortKey, sortDir]);

  // Reset to page 1 whenever the visible result set's shape changes, so an
  // admin filtering/searching never lands on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, sortKey, sortDir, pageSize]);

  const totalFiltered = filteredSorted?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    if (!filteredSorted) return null;
    const start = (clampedPage - 1) * pageSize;
    return filteredSorted.slice(start, start + pageSize);
  }, [filteredSorted, clampedPage, pageSize]);

  const paidCount = students?.filter((s) => s.courseStatus === "paid").length ?? 0;
  const conversionRate = students?.length ? Math.round((paidCount / students.length) * 100) : 0;

  function exportCsv() {
    if (!filteredSorted) return;
    const header = [
      "Email",
      "Name",
      "Status",
      "Current lesson",
      "Completed lessons",
      "Total lessons",
      "Latest payment status",
      "Joined",
      "Paid at"
    ];
    const rows = filteredSorted.map((s) => [
      s.email,
      s.name ?? "",
      s.courseStatus,
      String(s.currentLesson),
      String(s.completedLessons),
      String(s.totalLessons),
      s.latestPaymentStatus ?? "",
      s.createdAt,
      s.paidAt ?? ""
    ]);
    const suffix = statusFilter === "all" ? "" : `-${statusFilter}`;
    downloadCsv(`students${suffix}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function SortHeader({ label, sortField }: { label: string; sortField: SortKey }) {
    const active = sortKey === sortField;
    return (
      <button
        onClick={() => toggleSort(sortField)}
        className={`focus-ring flex items-center gap-1 uppercase transition-colors ${active ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        {label}
        <ChevronDownIcon className={`h-3 w-3 transition-transform ${active && sortDir === "asc" ? "rotate-180" : ""} ${active ? "opacity-100" : "opacity-30"}`} />
      </button>
    );
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl text-zinc-100">Student Directory</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="focus-ring rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            <option value="all">All students</option>
            <option value="paid">Paid only</option>
            <option value="free">Free only</option>
          </select>
          <button
            onClick={exportCsv}
            disabled={!filteredSorted || filteredSorted.length === 0}
            className="focus-ring flex items-center gap-1.5 rounded-lg border border-base-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-base-800 disabled:opacity-40"
            title="Export the currently filtered list as a CSV file"
          >
            <DownloadIcon />
            Export CSV
          </button>
        </div>
      </div>

      {students && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={students.length} icon={<UsersIcon />} />
          <StatCard label="Paid" value={paidCount} icon={<CoinIcon />} tone="accent" />
          <StatCard label="Free" value={students.length - paidCount} icon={<UsersIcon />} />
          <StatCard label="Conversion" value={`${conversionRate}%`} icon={<TrendUpIcon />} tone="accent" />
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!students && !error && <p className="text-sm text-zinc-500">Loading…</p>}

      {paged && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-800 text-xs text-zinc-500">
                <th className="px-4 py-3">
                  <SortHeader label="Student" sortField="name" />
                </th>
                <th className="px-4 py-3 uppercase">Status</th>
                <th className="px-4 py-3">
                  <SortHeader label="Current Lesson" sortField="currentLesson" />
                </th>
                <th className="px-4 py-3">
                  <SortHeader label="Progress" sortField="progress" />
                </th>
                <th className="px-4 py-3 uppercase">Payment</th>
                <th className="px-4 py-3">
                  <SortHeader label="Joined" sortField="createdAt" />
                </th>
                <th className="px-4 py-3 uppercase">Access</th>
                <th className="px-4 py-3 uppercase">Danger</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((s) => (
                <tr key={s.id} className="border-b border-base-800/60 transition-colors last:border-0 hover:bg-base-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-800 text-xs font-semibold text-zinc-300">
                        {initialFor(s)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-zinc-100">{s.name || s.email}</div>
                        {s.name && <div className="truncate text-xs text-zinc-500">{s.email}</div>}
                      </div>
                    </div>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-base-800">
                        <div
                          className="h-full rounded-full bg-accent-500"
                          style={{
                            width: s.totalLessons ? `${Math.round((s.completedLessons / s.totalLessons) * 100)}%` : "0%"
                          }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400">
                        {s.completedLessons}/{s.totalLessons}
                      </span>
                    </div>
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
              {paged.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-zinc-500">
                    {students && students.length > 0 ? "No students match your search." : "No students yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalFiltered > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-800 px-4 py-3 text-xs text-zinc-500">
              <div className="flex items-center gap-2">
                <span>
                  Showing {(clampedPage - 1) * pageSize + 1}–{Math.min(clampedPage * pageSize, totalFiltered)} of {totalFiltered}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="focus-ring rounded-md border border-base-700 bg-base-800 px-2 py-1 text-xs text-zinc-300 outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage <= 1}
                  className="focus-ring rounded-md border border-base-700 px-2.5 py-1 text-zinc-300 hover:bg-base-800 disabled:opacity-30"
                >
                  ← Prev
                </button>
                <span className="px-2">
                  Page {clampedPage} of {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={clampedPage >= pageCount}
                  className="focus-ring rounded-md border border-base-700 px-2.5 py-1 text-zinc-300 hover:bg-base-800 disabled:opacity-30"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
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
    <Card className="border-red-900/50">
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
