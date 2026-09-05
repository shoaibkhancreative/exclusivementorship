import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useSession } from "../lib/SessionContext";

export function TopBar() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();

  async function handleLogout() {
    await api.post("/auth/logout");
    await refresh();
    navigate("/");
  }

  return (
    <header className="border-b border-base-700/60">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <Link to="/" className="focus-ring rounded">
          <div className="text-[11px] uppercase tracking-[0.2em] text-accent-500">Next Level Trader</div>
          <div className="text-sm font-semibold text-zinc-100">Exclusive Mentorship</div>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {me?.authenticated ? (
            <>
              <Link to="/learn" className="focus-ring rounded text-zinc-300 hover:text-zinc-100">
                Learn
              </Link>
              <button onClick={handleLogout} className="focus-ring rounded text-zinc-400 hover:text-zinc-100">
                Log out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="focus-ring rounded border border-base-600 px-3 py-1.5 text-zinc-200 hover:border-accent-500 hover:text-accent-300"
            >
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
