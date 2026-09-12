import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Card } from "../../components/ui";
import StatCard from "../components/StatCard";
import BarChart from "../components/BarChart";
import { UsersIcon, CoinIcon, TrendUpIcon, BookIcon, DownloadIcon } from "../components/icons";

// ---------------------------------------------------------------------------
// Types — mirror AdvancedAnalytics in src/worker/db.ts (GET /admin/analytics/advanced)
// ---------------------------------------------------------------------------

type Granularity = "day" | "week" | "month";
type CourseStatusFilter = "all" | "free" | "paid";

interface TrendPoint {
  period: string;
  amount: number;
  count: number;
}

interface StatusBreakdownRow {
  status: string;
  count: number;
  amount: number;
}

interface CurrencyBreakdownRow {
  currency: string;
  count: number;
  amount: number;
}

interface FunnelStage {
  stage: string;
  count: number;
}

interface ChapterCompletionRow {
  chapterName: string;
  totalLessons: number;
  avgCompletionRate: number;
}

interface LessonCompletionRow {
  lessonNumber: number;
  title: string;
  chapterName: string;
  completedCount: number;
  totalEligible: number;
  completionRate: number;
}

interface AdvancedAnalytics {
  range: { from: string; to: string };
  kpis: {
    totalStudents: number;
    newStudentsInRange: number;
    paidStudents: number;
    freeStudents: number;
    conversionRate: number;
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    avgDaysToConvert: number | null;
    avgLessonCompletionRate: number;
  };
  revenueTrend: TrendPoint[];
  signupTrend: TrendPoint[];
  statusBreakdown: StatusBreakdownRow[];
  currencyBreakdown: CurrencyBreakdownRow[];
  funnel: FunnelStage[];
  chapterCompletion: ChapterCompletionRow[];
  lessonCompletion: LessonCompletionRow[];
  supportStats: { open: number; resolved: number; total: number };
  underpaidOrderCount: number;
  filterOptions: { currencies: string[]; chapters: string[]; statuses: string[] };
}

const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-accent-500/15 text-accent-300",
  finished: "bg-accent-500/15 text-accent-300",
  waiting: "bg-yellow-500/15 text-yellow-300",
  confirming: "bg-yellow-500/15 text-yellow-300",
  created: "bg-base-800 text-zinc-400",
  failed: "bg-red-500/15 text-red-300",
  expired: "bg-red-500/15 text-red-300",
  cancelled: "bg-red-500/15 text-red-300"
};

function formatUsd(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return isoDate(new Date());
}

function daysAgoIso(days: number) {
  return isoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

const DATE_PRESETS: { label: string; from: () => string }[] = [
  { label: "7d", from: () => daysAgoIso(6) },
  { label: "30d", from: () => daysAgoIso(29) },
  { label: "90d", from: () => daysAgoIso(89) },
  { label: "All time", from: () => "2000-01-01" }
];

function csvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
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

/** Small filled progress bar used in the lesson-completion table. */
function ProgressBar({ pct }: { pct: number }) {
  const tone = pct >= 66 ? "bg-accent-500/70" : pct >= 33 ? "bg-yellow-500/70" : "bg-red-500/60";
  return (
    <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-base-800">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export default function AnalyticsPage() {
  const [dateFrom, setDateFrom] = useState(daysAgoIso(29));
  const [dateTo, setDateTo] = useState(todayIso());
  const [courseStatus, setCourseStatus] = useState<CourseStatusFilter>("all");
  const [currency, setCurrency] = useState("all");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [chapterFilter, setChapterFilter] = useState("all");

  const [data, setData] = useState<AdvancedAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
    params.set("granularity", granularity);
    if (courseStatus !== "all") params.set("courseStatus", courseStatus);
    if (currency !== "all") params.set("currency", currency);
    if (selectedStatuses.length > 0) params.set("paymentStatus", selectedStatuses.join(","));
    return params.toString();
  }, [dateFrom, dateTo, granularity, courseStatus, currency, selectedStatuses]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<AdvancedAnalytics>(`/admin/analytics/advanced?${queryString}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch(() => !cancelled && setError("Couldn't load analytics."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  function toggleStatus(status: string) {
    setSelectedStatuses((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  }

  function applyPreset(from: string) {
    setDateFrom(from);
    setDateTo(todayIso());
  }

  const visibleLessons = useMemo(() => {
    if (!data) return [];
    if (chapterFilter === "all") return data.lessonCompletion;
    return data.lessonCompletion.filter((l) => l.chapterName === chapterFilter);
  }, [data, chapterFilter]);

  function exportLessonCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [
      ["Lesson #", "Title", "Chapter", "Completed", "Eligible students", "Completion rate (%)"]
    ];
    for (const l of visibleLessons) {
      rows.push([l.lessonNumber, l.title, l.chapterName, l.completedCount, l.totalEligible, l.completionRate]);
    }
    downloadCsv(`lesson-completion-${dateFrom}-to-${dateTo}.csv`, rows);
  }

  function exportRevenueCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [["Period", "Revenue (USD)", "Orders"]];
    for (const p of data.revenueTrend) rows.push([p.period, p.amount, p.count]);
    downloadCsv(`revenue-trend-${dateFrom}-to-${dateTo}.csv`, rows);
  }

  const totalStatusEvents = data?.statusBreakdown.reduce((sum, s) => sum + s.count, 0) ?? 0;
  const maxFunnel = data ? Math.max(1, ...data.funnel.map((f) => f.count)) : 1;
  const maxCurrency = data ? Math.max(1, ...data.currencyBreakdown.map((c) => c.amount)) : 1;

  return (
    <div className="page-enter flex flex-col gap-6">
      <div>
        <h1 className="text-xl text-zinc-100">Analytics</h1>
        <p className="text-sm text-zinc-500">Revenue, signups, funnel, and lesson completion — filter by date, status, currency, and cohort.</p>
      </div>

      {/* ------------------------------ Filter bar ------------------------------ */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">From</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="focus-ring rounded-lg border border-base-700 bg-base-800 px-2.5 py-1.5 text-sm text-zinc-100 outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">To</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={todayIso()}
              onChange={(e) => setDateTo(e.target.value)}
              className="focus-ring rounded-lg border border-base-700 bg-base-800 px-2.5 py-1.5 text-sm text-zinc-100 outline-none"
            />
          </div>
          <div className="flex gap-1">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.from())}
                className="focus-ring rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-base-800"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Cohort</label>
            <select
              value={courseStatus}
              onChange={(e) => setCourseStatus(e.target.value as CourseStatusFilter)}
              className="focus-ring rounded-lg border border-base-700 bg-base-800 px-2.5 py-1.5 text-sm text-zinc-100 outline-none"
            >
              <option value="all">All students</option>
              <option value="paid">Paid only</option>
              <option value="free">Free only</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="focus-ring rounded-lg border border-base-700 bg-base-800 px-2.5 py-1.5 text-sm text-zinc-100 outline-none"
            >
              <option value="all">All currencies</option>
              {(data?.filterOptions.currencies ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Group by</label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as Granularity)}
              className="focus-ring rounded-lg border border-base-700 bg-base-800 px-2.5 py-1.5 text-sm text-zinc-100 outline-none"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">Order status</span>
          {(data?.filterOptions.statuses ?? []).map((s) => {
            const active = selectedStatuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`focus-ring rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                  active ? (STATUS_TONE[s] ?? "bg-base-800 text-zinc-300") + " ring-1 ring-inset ring-accent-500/40" : "bg-base-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s}
              </button>
            );
          })}
          {selectedStatuses.length > 0 && (
            <button onClick={() => setSelectedStatuses([])} className="focus-ring text-[11px] text-zinc-500 hover:text-zinc-300">
              Clear
            </button>
          )}
        </div>
      </Card>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!data && !error && <p className="text-sm text-zinc-500">Loading…</p>}

      {data && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
            <StatCard label="Students in range" value={data.kpis.newStudentsInRange} icon={<UsersIcon />} hint={`${data.kpis.totalStudents} total`} />
            <StatCard label="Conversion" value={`${data.kpis.conversionRate}%`} icon={<TrendUpIcon />} tone="accent" hint={`${data.kpis.paidStudents} paid / ${data.kpis.freeStudents} free`} />
            <StatCard label="Revenue in range" value={formatUsd(data.kpis.totalRevenue)} icon={<CoinIcon />} tone="accent" hint={`${data.kpis.totalOrders} orders`} />
            <StatCard
              label="Avg. days to convert"
              value={data.kpis.avgDaysToConvert ?? "—"}
              icon={<TrendUpIcon />}
              hint={data.kpis.avgDaysToConvert != null ? "signup → paid" : "no conversions in range"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Avg. order value" value={formatUsd(data.kpis.avgOrderValue)} icon={<CoinIcon />} />
            <StatCard label="Lesson completion" value={`${data.kpis.avgLessonCompletionRate}%`} icon={<BookIcon />} hint="avg across active lessons" />
            <StatCard label="Underpaid (tolerated)" value={data.underpaidOrderCount} icon={<CoinIcon />} tone={data.underpaidOrderCount > 0 ? "warning" : "default"} />
            <StatCard label="Support tickets" value={data.supportStats.total} icon={<UsersIcon />} hint={`${data.supportStats.open} open`} tone={data.supportStats.open > 0 ? "warning" : "default"} />
          </div>

          {/* ------------------------------ Trends ------------------------------ */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-zinc-200">Revenue trend</h2>
                <button onClick={exportRevenueCsv} className="focus-ring flex items-center gap-1 text-xs text-zinc-500 hover:text-accent-300">
                  <DownloadIcon className="h-3.5 w-3.5" /> CSV
                </button>
              </div>
              {data.revenueTrend.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">No revenue in this range.</p>
              ) : (
                <BarChart points={data.revenueTrend.map((p) => ({ label: p.period, value: p.amount }))} formatValue={formatUsd} color="#34d399" />
              )}
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-zinc-200">Signup trend</h2>
                <span className="text-xs text-zinc-500">{data.signupTrend.reduce((s, p) => s + p.count, 0)} total</span>
              </div>
              {data.signupTrend.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">No signups in this range.</p>
              ) : (
                <BarChart
                  points={data.signupTrend.map((p) => ({ label: p.period, value: p.count }))}
                  formatValue={(v) => `${v} signup${v === 1 ? "" : "s"}`}
                  color="#60a5fa"
                />
              )}
            </Card>
          </div>

          {/* ------------------------------ Funnel + breakdowns ------------------------------ */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <h2 className="mb-3 text-sm font-medium text-zinc-200">Conversion funnel</h2>
              <div className="flex flex-col gap-2.5">
                {data.funnel.map((stage) => {
                  const pct = Math.round((stage.count / maxFunnel) * 100);
                  return (
                    <div key={stage.stage}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-zinc-400">{stage.stage}</span>
                        <span className="text-zinc-200">{stage.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-base-800">
                        <div className="h-full rounded-full bg-accent-500/70" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-medium text-zinc-200">Order status breakdown</h2>
              {data.statusBreakdown.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">No orders in this range.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {data.statusBreakdown.map((row) => {
                    const pct = totalStatusEvents ? Math.round((row.count / totalStatusEvents) * 100) : 0;
                    return (
                      <div key={row.status} className="flex items-center gap-3">
                        <span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium capitalize ${STATUS_TONE[row.status] ?? "bg-base-800 text-zinc-400"}`}>
                          {row.status}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-800">
                          <div className="h-full rounded-full bg-accent-500/70" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs text-zinc-400">{row.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-medium text-zinc-200">Revenue by currency</h2>
              {data.currencyBreakdown.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">No paid orders in this range.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {data.currencyBreakdown.map((row) => {
                    const pct = Math.round((row.amount / maxCurrency) * 100);
                    return (
                      <div key={row.currency} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 truncate text-xs uppercase text-zinc-400">{row.currency}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-800">
                          <div className="h-full rounded-full bg-blue-400/70" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs text-zinc-400">{formatUsd(row.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ------------------------------ Lesson completion ------------------------------ */}
          <Card className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-800 px-4 py-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">Lesson completion</h2>
                <p className="text-xs text-zinc-500">
                  {courseStatus === "all" ? "All students" : courseStatus === "paid" ? "Paid students only" : "Free students only"} · sorted by course order
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={chapterFilter}
                  onChange={(e) => setChapterFilter(e.target.value)}
                  className="focus-ring rounded-lg border border-base-700 bg-base-800 px-2.5 py-1.5 text-xs text-zinc-100 outline-none"
                >
                  <option value="all">All chapters</option>
                  {data.chapterCompletion.map((c) => (
                    <option key={c.chapterName} value={c.chapterName}>
                      {c.chapterName}
                    </option>
                  ))}
                </select>
                <button
                  onClick={exportLessonCsv}
                  className="focus-ring flex items-center gap-1.5 rounded-lg border border-base-700 px-2.5 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-base-800"
                >
                  <DownloadIcon className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>
            </div>
            {visibleLessons.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No lessons to show.</div>
            ) : (
              <div className="divide-y divide-base-800/60">
                {visibleLessons.map((l) => (
                  <div key={l.lessonNumber} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-100">
                        {l.lessonNumber}. {l.title}
                      </div>
                      <div className="text-xs text-zinc-500">{l.chapterName}</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <ProgressBar pct={l.completionRate} />
                      <span className="w-24 shrink-0 text-right text-xs text-zinc-400">
                        {l.completedCount}/{l.totalEligible} · {l.completionRate}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ------------------------------ Support ------------------------------ */}
          <Card>
            <h2 className="mb-3 text-sm font-medium text-zinc-200">Support inbox (in range)</h2>
            <div className="flex gap-3">
              <StatCard label="Open" value={data.supportStats.open} tone={data.supportStats.open > 0 ? "warning" : "default"} />
              <StatCard label="Resolved" value={data.supportStats.resolved} tone="accent" />
              <StatCard label="Total" value={data.supportStats.total} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
