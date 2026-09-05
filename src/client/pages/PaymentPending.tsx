import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useSession } from "../lib/SessionContext";
import { Button, Card } from "../components/ui";

const MAX_POLLS = 40; // ~ a few minutes at the interval below
const POLL_INTERVAL_MS = 5000;

export default function PaymentPending() {
  const [params] = useSearchParams();
  const orderId = params.get("order");
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [status, setStatus] = useState<string>("waiting");
  const pollCount = useRef(0);

  const poll = useCallback(async () => {
    if (!orderId) return;
    try {
      const result = await api.get<{ status: string; courseStatus: string }>(`/payments/status/${orderId}`);
      setStatus(result.status);
      if (result.courseStatus === "paid") {
        await refresh();
        navigate("/access", { replace: true });
      }
    } catch {
      // transient — keep polling
    }
  }, [orderId, navigate, refresh]);

  useEffect(() => {
    poll();
    const interval = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        clearInterval(interval);
        return;
      }
      poll();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  const friendly: Record<string, string> = {
    waiting: "Waiting for your payment to arrive on-chain.",
    confirming: "Payment detected — confirming on the network.",
    failed: "This payment didn't complete.",
    expired: "This payment window has expired.",
    cancelled: "This payment was cancelled."
  };

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <Card>
        <h1 className="mb-2 text-lg font-semibold text-zinc-50">Payment is being confirmed.</h1>
        <p className="mb-6 text-sm text-zinc-400">{friendly[status] ?? "We're checking on your payment."}</p>
        <Button onClick={poll} variant="secondary" className="w-full">
          Check Payment Status
        </Button>
      </Card>
    </div>
  );
}
