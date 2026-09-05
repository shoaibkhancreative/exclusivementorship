import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { Button, Card, LoadingScreen } from "../components/ui";

interface TelegramAccessResponse {
  status: "pending" | "generated" | "failed";
  channelInviteLink: string | null;
  groupInviteLink: string | null;
}

export default function Access() {
  const [access, setAccess] = useState<TelegramAccessResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api.get<TelegramAccessResponse>("/telegram/access");
    setAccess(data);
    if (data.status === "pending") {
      generate();
    }
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const data = await api.post<TelegramAccessResponse>("/telegram/generate");
      setAccess(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't generate your invite links.");
      setAccess((prev) => (prev ? { ...prev, status: "failed" } : prev));
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!access) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-md px-6 py-14 text-center">
      <div className="mb-6">
        <p className="mb-1 text-sm font-medium text-accent-400">Payment successful ✓</p>
        <h1 className="text-xl font-semibold text-zinc-50">Welcome to Exclusive Mentorship.</h1>
        <p className="mt-1 text-sm text-zinc-400">Your mentorship is now unlocked.</p>
      </div>

      {access.status === "generated" && access.channelInviteLink && access.groupInviteLink ? (
        <div className="space-y-3">
          <Card>
            <div className="mb-2 text-sm font-medium text-zinc-200">Premium Telegram Channel</div>
            <a href={access.channelInviteLink} target="_blank" rel="noopener noreferrer">
              <Button className="w-full">Join Channel</Button>
            </a>
          </Card>
          <Card>
            <div className="mb-2 text-sm font-medium text-zinc-200">Premium Telegram Group</div>
            <a href={access.groupInviteLink} target="_blank" rel="noopener noreferrer">
              <Button className="w-full">Join Group</Button>
            </a>
          </Card>
          <p className="text-xs text-zinc-500">
            Save these links or join now. The mentorship will continue inside Telegram.
          </p>
        </div>
      ) : (
        <Card>
          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
          <p className="mb-4 text-sm text-zinc-400">
            {generating ? "Generating your Telegram invite links…" : "Your enrollment is confirmed."}
          </p>
          <Button onClick={generate} disabled={generating} className="w-full">
            {generating ? "Generating…" : "Retry"}
          </Button>
        </Card>
      )}
    </div>
  );
}
