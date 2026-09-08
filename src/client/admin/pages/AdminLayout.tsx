import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAdminSession } from "../lib/AdminSessionContext";

const NAV_ITEMS = [
  { to: "/admin/students", label: "Students" },
  { to: "/admin/lessons", label: "Lessons & Chapters" },
  { to: "/admin/settings", label: "Settings" }
];

export default function AdminLayout() {
  const { admin, refresh } = useAdminSession();
  const navigate = useNavigate();

  async function handleLogout() {
    await api.post("/admin/logout");
    await refresh();
    navigate("/admin/login");
  }

  return (
    <div className="min-h-screen bg-base-950">
      <header className="border-b border-base-700/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-6">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-accent-500">Exclusive Mentorship</div>
            <div className="text-[15px] leading-tight text-zinc-100">Admin Panel</div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-500">{admin?.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="focus-ring rounded border border-base-600 px-3 py-1.5 text-zinc-300 transition-colors hover:border-accent-500 hover:text-accent-300"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-5 pb-3 text-sm sm:px-6">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `focus-ring whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
                  isActive ? "bg-accent-500 text-base-950" : "text-zinc-400 hover:bg-base-800 hover:text-zinc-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
