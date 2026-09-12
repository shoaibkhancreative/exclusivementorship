import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAdminSession } from "../lib/AdminSessionContext";
import { Button, Card } from "../../components/ui";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { refresh } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/admin/login", { email, password });
      await refresh();
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-enter relative flex min-h-screen items-center justify-center overflow-hidden bg-base-950 px-5">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-accent-500/10 blur-3xl" />
      <Card className="relative w-full max-w-sm border-base-700/60">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-sm font-bold text-base-950 shadow-lg shadow-accent-500/30">
            EM
          </span>
          <div className="text-[10px] uppercase tracking-wide text-accent-500">Exclusive Mentorship</div>
          <h1 className="text-xl text-zinc-100">Admin Panel</h1>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="admin-email" className="mb-1 block text-xs text-zinc-400">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-accent-500/60"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="mb-1 block text-xs text-zinc-400">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-accent-500/60"
            />
          </div>
          {error && (
            <p className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-400">{error}</p>
          )}
          <Button type="submit" disabled={submitting} className="mt-1">
            {submitting ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
