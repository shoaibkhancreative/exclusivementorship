import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { Button, Card, LoadingScreen } from "./ui";

interface TelegramAccessResponse {
  status: "pending" | "generated" | "failed";
  channelInviteLink: string | null;
  groupInviteLink: string | null;
}

/**
 * Renders the real Telegram invite flow (backed by /api/telegram/access and
 * /api/telegram/generate — both server-side requirePaid-protected). Used in
 * two places: embedded inside Class 6 for paid users, and on the standalone
 * /access page reachable from the profile card at any time.
 */
export function TelegramAccessPanel({ showIntro = true }: { showIntro?: boolean }) {
  const [access, setAccess] = useState<TelegramAccessResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

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

  async function load() {
    try {
      const data = await api.get<TelegramAccessResponse>("/telegram/access");
      setAccess(data);
      if (data.status === "pending") {
        generate();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setForbidden(true);
      } else {
        setAccess({ status: "failed", channelInviteLink: null, groupInviteLink: null });
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (forbidden) {
    return (
      <Card className="text-center">
        <p className="text-sm text-zinc-400">This section is available to enrolled members.</p>
      </Card>
    );
  }

  if (!access) return <LoadingScreen />;

  return (
    <div className="text-center">
      {showIntro && (
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-zinc-50">Your remaining classes continue on Telegram.</h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            From here, the mentorship continues inside our private Telegram channel and group.
          </p>
        </div>
      )}

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
          <p className="text-xs text-zinc-500">You can come back to this anytime from your profile menu.</p>
        </div>
      ) : (
        <Card>
          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
          <p className="mb-4 text-sm text-zinc-400">
            {generating ? "Generating your Telegram invite links…" : "Access Telegram"}
          </p>
          <Button onClick={generate} disabled={generating} className="w-full">
            {generating ? "Generating…" : "Access Telegram"}
          </Button>
        </Card>
      )}
    </div>
  );
}
