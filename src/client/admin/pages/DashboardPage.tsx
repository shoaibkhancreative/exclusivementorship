import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card } from "../../components/ui";
import StatCard from "../components/StatCard";
import BarChart from "../components/BarChart";
import { UsersIcon, CoinIcon, TrendUpIcon, BookIcon } from "../components/icons";

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

interface AdminLesson {
  id: number;
  isActive: boolean;
  videoEmbedUrl: string | null;
}

interface DailyPoint {
  date: string;
  amount: number;
  count: number;
}

interface SignupPoint {
  date: string;
  count: number;
}

interface StatusBreakdownRow {
  status: string;
  count: number;
}

interface RevenueAnalytics {
  totalRevenue: number;
  totalPaidOrders: number;
  avgOrderValue: number;
  revenueLast30Days: number;
  revenueThisMonth: number;
  revenuePrevMonth: number;
  dailyRevenue: DailyPoint[];
  dailySignups: SignupPoint[];
  statusBreakdown: StatusBreakdownRow[];
}

function formatUsd(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatShortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

/**
 * Overview built from the existing /admin/students + /admin/lessons
 * endpoints, PLUS /admin/analytics for revenue/signup trends and payment
 * status breakdown (see db.ts getRevenueAnalytics — aggregates
 * payment_orders/users, no new tables).
 */
export default function DashboardPage() {
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [lessons, setLessons] = useState<AdminLesson[] | null>(null);
  const [analytics, setAnalytics] = useState<RevenueAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ students: StudentRow[] }>("/admin/students"),
      api.get<{ lessons: AdminLesson[] }>("/admin/lessons"),
      api.get<RevenueAnalytics>("/admin/analytics")
    ])
      .then(([s, l, a]) => {
        setStudents(s.students);
        setLessons(l.lessons);
        setAnalytics(a);
      })
      .catch(() => setError("Couldn't load dashboard data."));
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!students || !lessons || !analytics) return <p className="text-sm text-zinc-500">Loading…</p>;

  const paidCount = students.filter((s) => s.courseStatus === "paid").length;
  const freeCount = students.length - paidCount;
  const conversionRate = students.length ? Math.round((paidCount / students.length) * 100) : 0;
  const publishedLessons = lessons.filter((l) => l.isActive).length;
  const missingVideo = lessons.filter((l) => !l.videoEmbedUrl).length;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = students.filter((s) => new Date(s.createdAt).getTime() >= sevenDaysAgo).length;

  const recentStudents = [...students]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const momChange =
    analytics.revenuePrevMonth > 0
      ? Math.round(((analytics.revenueThisMonth - analytics.revenuePrevMonth) / analytics.revenuePrevMonth) * 100)
      : analytics.revenueThisMonth > 0
        ? 100
        : 0;

  const totalStatusEvents = analytics.statusBreakdown.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="page-enter flex flex-col gap-6">
      <div>
        <h1 className="text-xl text-zinc-100">Overview</h1>
        <p className="text-sm text-zinc-500">A quick pulse on revenue, students, and course content.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total students" value={students.length} icon={<UsersIcon />} hint={`+${newThisWeek} this week`} />
        <StatCard label="Paid" value={paidCount} icon={<CoinIcon />} tone="accent" />
        <StatCard label="Conversion" value={`${conversionRate}%`} icon={<TrendUpIcon />} tone="accent" hint={`${freeCount} still free`} />
        <StatCard
          label="Published classes"
          value={`${publishedLessons}/${lessons.length}`}
          icon={<BookIcon />}
          tone={missingVideo > 0 ? "warning" : "default"}
          hint={missingVideo > 0 ? `${missingVideo} missing video` : undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total revenue" value={formatUsd(analytics.totalRevenue)} icon={<CoinIcon />} tone="accent" hint={`${analytics.totalPaidOrders} paid orders`} />
        <StatCard label="This month" value={formatUsd(analytics.revenueThisMonth)} icon={<TrendUpIcon />} tone={momChange >= 0 ? "accent" : "warning"} hint={`${momChange >= 0 ? "+" : ""}${momChange}% vs last month`} />
        <StatCard label="Last 30 days" value={formatUsd(analytics.revenueLast30Days)} icon={<CoinIcon />} />
        <StatCard label="Avg. order value" value={formatUsd(analytics.avgOrderValue)} icon={<TrendUpIcon />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-200">Revenue — last 30 days</h2>
            <span className="text-xs text-zinc-500">{formatUsd(analytics.revenueLast30Days)} total</span>
          </div>
          <BarChart
            points={analytics.dailyRevenue.map((d) => ({ label: formatShortDate(d.date), value: d.amount }))}
            formatValue={formatUsd}
            color="#34d399"
          />
          <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
            <span>{formatShortDate(analytics.dailyRevenue[0]?.date ?? "")}</span>
            <span>{formatShortDate(analytics.dailyRevenue[analytics.dailyRevenue.length - 1]?.date ?? "")}</span>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-200">New signups — last 30 days</h2>
            <span className="text-xs text-zinc-500">
              {analytics.dailySignups.reduce((sum, d) => sum + d.count, 0)} total
            </span>
          </div>
          <BarChart
            points={analytics.dailySignups.map((d) => ({ label: formatShortDate(d.date), value: d.count }))}
            formatValue={(v) => `${v} signup${v === 1 ? "" : "s"}`}
            color="#60a5fa"
          />
          <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
            <span>{formatShortDate(analytics.dailySignups[0]?.date ?? "")}</span>
            <span>{formatShortDate(analytics.dailySignups[analytics.dailySignups.length - 1]?.date ?? "")}</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-base-800 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-200">Recent signups</h2>
            <Link to="/admin/students" className="text-xs text-accent-300 hover:underline">
              View all students →
            </Link>
          </div>
          {recentStudents.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">No students yet.</div>
          ) : (
            <div className="divide-y divide-base-800/60">
              {recentStudents.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-100">{s.name || s.email}</div>
                    <div className="text-xs text-zinc-500">
                      Joined {new Date(s.createdAt).toLocaleDateString()} · Class {s.currentLesson}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.courseStatus === "paid" ? "bg-accent-500/15 text-accent-300" : "bg-base-800 text-zinc-400"
                    }`}
                  >
                    {s.courseStatus === "paid" ? "Paid" : "Free"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-0">
          <div className="border-b border-base-800 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-200">Payment status breakdown</h2>
            <p className="text-xs text-zinc-500">Every checkout order ever created, by its current status.</p>
          </div>
          {analytics.statusBreakdown.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">No payment orders yet.</div>
          ) : (
            <div className="flex flex-col gap-2.5 px-4 py-3">
              {analytics.statusBreakdown.map((row) => {
                const pct = totalStatusEvents ? Math.round((row.count / totalStatusEvents) * 100) : 0;
                return (
                  <div key={row.status} className="flex items-center gap-3">
                    <span
                      className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium capitalize ${
                        STATUS_TONE[row.status] ?? "bg-base-800 text-zinc-400"
                      }`}
                    >
                      {row.status}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-800">
                      <div className="h-full rounded-full bg-accent-500/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs text-zinc-400">
                      {row.count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
