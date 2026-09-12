import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAdminSession } from "../lib/AdminSessionContext";
import { GridIcon, UsersIcon, BookIcon, GearIcon, LogoutIcon, DocumentIcon, LayersIcon, ChatIcon, TrendUpIcon } from "../components/icons";

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard", icon: <GridIcon /> },
  { to: "/admin/analytics", label: "Analytics", icon: <TrendUpIcon /> },
  { to: "/admin/students", label: "Students", icon: <UsersIcon /> },
  { to: "/admin/lessons", label: "Lessons & Chapters", icon: <BookIcon /> },
  { to: "/admin/support", label: "Support", icon: <ChatIcon /> },
  { to: "/admin/content", label: "Content", icon: <DocumentIcon /> },
  { to: "/admin/sections", label: "Sections", icon: <LayersIcon /> },
  { to: "/admin/settings", label: "Settings", icon: <GearIcon /> }
];

function AdminBadge() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 text-[11px] font-bold text-base-950 shadow-sm shadow-accent-500/30">
      EM
    </span>
  );
}

function initialFrom(email?: string) {
  if (!email) return "A";
  return email.trim()[0]?.toUpperCase() ?? "A";
}

export default function AdminLayout() {
  const { admin, refresh } = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeItem = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to));

  async function handleLogout() {
    await api.post("/admin/logout");
    await refresh();
    navigate("/admin/login");
  }

  const navList = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `focus-ring group flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-[13.5px] transition-colors ${
              isActive
                ? "border-accent-500 bg-base-800/70 text-zinc-100"
                : "border-transparent text-zinc-500 hover:border-base-600 hover:bg-base-800/40 hover:text-zinc-300"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={isActive ? "text-accent-500" : "text-zinc-600 group-hover:text-zinc-400"}>{item.icon}</span>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const accountBlock = (
    <div className="border-t border-base-700/60 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-base-800 text-[11px] font-semibold text-zinc-300">
          {initialFrom(admin?.email)}
        </span>
        <div className="min-w-0 truncate text-[12px] text-zinc-500">{admin?.email}</div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-zinc-400 transition-colors hover:bg-base-800/60 hover:text-accent-300"
      >
        <LogoutIcon />
        Log out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-base-950 lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-base-700/60 bg-base-950 lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <AdminBadge />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] leading-tight text-zinc-100">Exclusive Mentorship</div>
            <div className="text-[11.5px] leading-tight text-zinc-500">Admin panel</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">{navList()}</div>
        {accountBlock}
      </aside>

      {/* Mobile drawer + overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-base-700/60 bg-base-950 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-2.5">
                <AdminBadge />
                <div className="text-[13.5px] text-zinc-100">Admin panel</div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="focus-ring rounded p-1 text-zinc-400 hover:text-zinc-100"
                aria-label="Close menu"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                  <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3">{navList(() => setDrawerOpen(false))}</div>
            {accountBlock}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-base-700/60 bg-base-950/95 px-5 py-4 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="focus-ring rounded p-1.5 text-zinc-400 hover:text-zinc-100 lg:hidden"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-zinc-600 lg:hidden">{activeItem?.icon}</span>
          <h1 className="text-[15px] font-medium text-zinc-100">{activeItem?.label ?? "Admin"}</h1>
        </header>
        <main className="flex-1 px-5 py-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
