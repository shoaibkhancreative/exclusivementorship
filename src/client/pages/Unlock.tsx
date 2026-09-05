import { useEffect, useState } from "react";
import { api, ApiError, type PublicConfig } from "../lib/api";
import { Button, Card, LoadingScreen } from "../components/ui";

export default function Unlock() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PublicConfig>("/config/public").then(setConfig);
  }, []);

  async function handleUnlock() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{ payUrl: string }>("/payments/create-order");
      window.location.href = result.payUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the payment. Please try again.");
      setSubmitting(false);
    }
  }

  if (!config) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-xl px-6 py-14">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-zinc-50">You've completed the free foundation.</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          The next lessons are part of Exclusive Mentorship — the full framework for intraday execution, risk
          management, and building a personal trading process.
        </p>
      </div>

      <Card className="mb-6 text-center">
        <a
          href={config.mentorshipPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-block text-sm text-accent-400 hover:underline"
        >
          View Mentorship Details PDF
        </a>
      </Card>

      <Card className="text-center">
        <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Premium Enrollment</div>
        <div className="mb-1 text-sm text-zinc-500 line-through">Reference Value: ${config.referencePrice} USDT</div>
        <div className="mb-1 text-3xl font-semibold text-zinc-50">${config.enrollmentPrice} USDT</div>
        <div className="mb-6 text-xs font-medium text-accent-400">{config.discountPercent}% OFF</div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <Button onClick={handleUnlock} disabled={submitting} className="w-full">
          {submitting ? "Preparing checkout…" : "Unlock Exclusive Mentorship"}
        </Button>
      </Card>
    </div>
  );
}
