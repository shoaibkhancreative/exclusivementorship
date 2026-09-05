import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type CreateOrderResponse, type PaymentStatusResponse } from "../lib/api";
import { useConfig } from "../lib/useConfig";
import { useSession } from "../lib/SessionContext";
import { Button } from "./ui";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 240; // background safety net, not shown to the user

// NOWPayments' non-hosted "payment" endpoint locks the exchange rate for a
// fixed ~20-minute window per order (see createNowPaymentsPayment). Used
// only to size the progress bar — the real deadline is always `expiresAt`.
const WINDOW_SECONDS = 20 * 60;

type Order = CreateOrderResponse | PaymentStatusResponse;

/** Ticks every second; returns seconds remaining until `expiresAt` (never negative). */
function useSecondsLeft(expiresAt: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

/**
 * The in-site crypto checkout. Deliberately minimal: QR, amount, address,
 * a thin countdown bar, one status line. Every order's address is only
 * valid for a limited window (a NOWPayments constraint, not ours) — once it
 * runs out we hide the stale address/QR and offer one clear action:
 * generate a fresh one.
 */
export function UnlockModal({ onClose }: { onClose: () => void }) {
  const config = useConfig();
  const { refresh } = useSession();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const paidRef = useRef(false);

  const secondsLeft = useSecondsLeft(order?.expiresAt);
  const timeExpired = secondsLeft === 0;

  const poll = useCallback(
    async (orderId: string) => {
      if (paidRef.current) return;
      try {
        const result = await api.get<PaymentStatusResponse>(`/payments/status/${orderId}`);
        setOrder(result);
        if (result.courseStatus === "paid") {
          paidRef.current = true;
          setPaid(true);
          await refresh();
          setTimeout(() => {
            navigate("/access");
            onClose();
          }, 1600);
        }
      } catch {
        // transient network hiccup — keep polling
      }
    },
    [navigate, onClose, refresh]
  );

  const beginCheckout = useCallback(async (isRegenerate: boolean) => {
    isRegenerate ? setRegenerating(true) : setLoading(true);
    setError(null);
    try {
      const result = await api.post<CreateOrderResponse>("/payments/create-order");
      setOrder(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      isRegenerate ? setRegenerating(false) : setLoading(false);
    }
  }, []);

  // Initial order creation, once.
  useEffect(() => {
    beginCheckout(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)start polling whenever we have a fresh order id.
  useEffect(() => {
    if (!order?.orderId) return;
    let count = 0;
    const id = setInterval(() => {
      count += 1;
      if (count > MAX_POLLS) {
        clearInterval(id);
        return;
      }
      poll(order.orderId);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [order?.orderId, poll]);

  useEffect(() => {
    if (!order?.payAddress || timeExpired) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(order.payAddress, { margin: 1, width: 200, color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [order?.payAddress, timeExpired]);

  function handleCopy() {
    if (!order?.payAddress) return;
    navigator.clipboard?.writeText(order.payAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const statusLabel: Record<string, string> = {
    created: "প্রস্তুত হচ্ছে…",
    waiting: "পেমেন্টের অপেক্ষায়…",
    confirming: "পেমেন্ট পাওয়া গেছে, কনফার্ম হচ্ছে…",
    confirmed: "কনফার্ম হয়েছে! এক্সেস খোলা হচ্ছে…",
    finished: "কনফার্ম হয়েছে! এক্সেস খোলা হচ্ছে…",
    failed: "পেমেন্ট সম্পন্ন হয়নি। আবার চেষ্টা করুন।",
    expired: "সময় শেষ। নতুন Address জেনারেট করুন।",
    cancelled: "পেমেন্ট বাতিল হয়েছে।"
  };

  const progressPercent =
    secondsLeft !== null ? Math.max(0, Math.min(100, (secondsLeft / WINDOW_SECONDS) * 100)) : 100;
  const mm = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0;
  const ss = secondsLeft !== null ? secondsLeft % 60 : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Unlock Exclusive Mentorship"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-base-700 bg-base-900 p-6 shadow-2xl shadow-black/50 sm:max-w-sm sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">মেন্টরশিপ আনলক করুন</div>
            {config && (
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-zinc-50">${config.enrollmentPrice} USDT</span>
                <span className="text-sm text-zinc-500 line-through">${config.referencePrice}</span>
                <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[11px] font-semibold text-accent-400">
                  {config.discountPercent}% OFF
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring -m-2 rounded-lg p-2 text-zinc-500 transition-colors hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {paid ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-3xl">✓</div>
            <p className="text-sm font-medium text-accent-400">পেমেন্ট কনফার্ম হয়েছে।</p>
            <p className="mt-1 text-sm text-zinc-400">এক্সেস খোলা হচ্ছে…</p>
          </div>
        ) : loading ? (
          <div className="py-10 text-center text-sm text-zinc-500">প্রস্তুত হচ্ছে…</div>
        ) : error ? (
          <div className="py-6 text-center">
            <p className="mb-4 text-sm text-red-400">{error}</p>
            <Button variant="secondary" onClick={onClose} className="w-full">
              বন্ধ করুন
            </Button>
          </div>
        ) : order ? (
          <div className="space-y-3">
            {/* Thin countdown progress bar — replaces any numeric ticking clock */}
            {secondsLeft !== null && !timeExpired && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-base-800">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                    progressPercent <= 15 ? "bg-red-500" : "bg-accent-500"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            {timeExpired ? (
              <div className="space-y-3 py-4 text-center">
                <div className="text-3xl">⏱</div>
                <p className="text-sm text-zinc-300">এই Address-এর মেয়াদ শেষ হয়ে গেছে।</p>
                <p className="text-xs text-zinc-500">টাকা এখনো পাঠাননি? নতুন Address নিয়ে নিন।</p>
                <Button
                  onClick={() => beginCheckout(true)}
                  disabled={regenerating}
                  className="w-full"
                >
                  {regenerating ? "নতুন Address আসছে…" : "নতুন Address জেনারেট করুন"}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <div className="rounded-xl bg-white p-3">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Scan to pay" width={180} height={180} />
                    ) : (
                      <div className="flex h-[180px] w-[180px] items-center justify-center text-xs text-zinc-400">
                        QR লোড হচ্ছে…
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center text-sm text-zinc-400">
                  ঠিক{" "}
                  <span className="font-semibold text-zinc-100">
                    {order.payAmount} {(order.payCurrency ?? "").toUpperCase()}
                  </span>{" "}
                  পাঠান, শুধু <span className="font-semibold text-zinc-200">Network: BEP20</span>-তে।
                </div>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="focus-ring block w-full rounded-lg border border-base-700 bg-base-950 px-3 py-3 text-left transition-colors hover:border-accent-500/60"
                >
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                    Address (ট্যাপ করে কপি করুন)
                  </div>
                  <div className="break-all font-mono text-xs text-zinc-100">{order.payAddress}</div>
                  {copied && <div className="mt-1 text-xs text-accent-400">কপি হয়েছে ✓</div>}
                </button>

                <div className="flex items-center justify-between rounded-lg border border-base-700 bg-base-950 px-3 py-2.5 text-xs text-zinc-400">
                  <span>{statusLabel["status" in order ? order.status : "waiting"] ?? "পেমেন্টের অপেক্ষায়…"}</span>
                  {secondsLeft !== null && (
                    <span className={`font-mono ${progressPercent <= 15 ? "text-red-400" : "text-zinc-500"}`}>
                      {mm}:{String(ss).padStart(2, "0")}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
