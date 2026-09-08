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
      navigate("/admin/students");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-950 px-5">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
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
              className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
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
              className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
