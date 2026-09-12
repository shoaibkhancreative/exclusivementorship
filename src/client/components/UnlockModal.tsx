import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type CreateOrderResponse, type PaymentStatusResponse } from "../lib/api";
import { useConfig } from "../lib/useConfig";
import { useContent } from "../lib/useContent";
import { useSession } from "../lib/SessionContext";
import { Button } from "./ui";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 240; // ~20 minutes at the interval above — matches the address window itself

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

function CopyGlyph({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 10.5l3.8 3.8L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 13V4.5a1 1 0 0 1 1-1H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The in-site crypto checkout — the single unlock action in the whole
 * product (there's no separate /unlock page before this). Framed as a
 * payment ticket/stub rather than a stack of bordered fields: a torn-edge
 * QR stub up top (network + live countdown chip on it) and a receipt-style
 * details stub below it (amount / address, each with its own copy
 * control), split by a perforation. One short Bangla instruction line, the
 * unchanged countdown/progress behavior, no PDF, nothing else.
 */
export function UnlockModal({ onClose }: { onClose: () => void }) {
  const config = useConfig();
  const { t } = useContent();
  const { refresh } = useSession();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which field the "Copy" button most recently copied — drives its own
  // brief confirmation glyph, independent of the other field's button.
  const [copiedField, setCopiedField] = useState<"amount" | "address" | null>(null);
  const [paid, setPaid] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
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
      setError(err instanceof ApiError ? err.message : "Couldn't start the payment. Please try again.");
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
    setPollingStopped(false);
    let count = 0;
    const id = setInterval(() => {
      count += 1;
      if (count > MAX_POLLS) {
        clearInterval(id);
        // Background safety net only — the countdown/expiry UI above is
        // what a user normally sees first. This only matters for the rare
        // case of a payment sent right at the very end of the window, where
        // confirmation arrives after we've stopped checking — so we say so
        // plainly instead of the status line just going quiet.
        setPollingStopped(true);
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
    QRCode.toDataURL(order.payAddress, { margin: 1, width: 240, color: { dark: "#1c1b17", light: "#ffffff" } })
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

  function handleCopy(field: "amount" | "address", value: string | undefined | null) {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1800);
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

  // Kept intentionally short — a status word or two, never a paragraph. The
  // one-line Bangla instruction above this row is what carries the actual
  // "what do I do" guidance; this line only ever reports a state change.
  const statusLabel: Record<string, string> = {
    created: "Preparing address…",
    waiting: "Waiting for payment…",
    confirming: "Confirming on the network…",
    confirmed: "Confirmed! Unlocking…",
    finished: "Confirmed! Unlocking…",
    failed: "Payment didn't go through — try again.",
    expired: "Address expired.",
    cancelled: "Payment cancelled."
  };

  // Shifted from 15% to 25% remaining — gives the color/urgency shift a
  // longer runway before the deadline so it reads as "time's getting short"
  // rather than "you're about to lose this," which is what was prompting
  // panic-abandons right at the wire.
  const URGENT_THRESHOLD_PERCENT = 25;

  const progressPercent =
    secondsLeft !== null ? Math.max(0, Math.min(100, (secondsLeft / WINDOW_SECONDS) * 100)) : 100;
  const urgent = progressPercent <= URGENT_THRESHOLD_PERCENT;
  const mm = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0;
  const ss = secondsLeft !== null ? secondsLeft % 60 : 0;

  const copyBtnClass =
    "focus-ring inline-flex h-8 w-8 flex-none items-center justify-center rounded-full border border-base-700 text-zinc-400 transition-colors hover:border-accent-500 hover:text-accent-500";

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-[#1c1b17]/70 backdrop-blur-sm sm:items-center"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Unlock Exclusive Mentorship"
    >
      <div className="animate-slide-up max-h-[92vh] w-full overflow-hidden overflow-y-auto rounded-t-2xl bg-base-900 shadow-xl sm:max-w-sm sm:rounded-2xl">
        {/* Progress bar lives on the card's own top edge — always visible,
            doubles as the card's only "chrome" so it never has to compete
            with a boxed status row further down. */}
        <div className="h-1.5 w-full bg-base-800">
          {secondsLeft !== null && !timeExpired && (
            <div
              className={`h-full transition-all duration-1000 ease-linear ${urgent ? "bg-red-500" : "bg-accent-500"}`}
              style={{ width: `${progressPercent}%` }}
            />
          )}
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-50">Complete your payment</h2>
              {config && (
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-semibold text-accent-500">${config.enrollmentPrice} USDT</span>
                  <span className="text-xs text-zinc-500 line-through">${config.referencePrice}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="focus-ring -m-2 -mt-1 flex-none rounded-md p-2 text-zinc-500 transition-colors hover:text-zinc-200"
            >
              ✕
            </button>
          </div>

          {paid ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-accent-500">Payment confirmed.</p>
              <p className="mt-1 text-sm text-zinc-500">Unlocking access…</p>
            </div>
          ) : loading ? (
            <div className="py-10 text-center text-sm text-zinc-500">Preparing your payment…</div>
          ) : error ? (
            <div className="py-6 text-center">
              <p className="mb-4 text-sm text-red-500">{error}</p>
              <Button variant="secondary" onClick={onClose} className="w-full">
                Close
              </Button>
            </div>
          ) : order ? (
            timeExpired ? (
              /* Expired state — the ticket goes visually "cancelled" (a
                 rotated stamp over a dimmed frame) rather than just
                 vanishing, so it's obvious *why* there's nothing to scan. */
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-xl border border-dashed border-base-700 py-10 text-center">
                  <span className="-rotate-6 select-none rounded border-2 border-red-500/60 px-3 py-1 text-xs font-bold uppercase tracking-widest text-red-500/70">
                    Expired
                  </span>
                  <p className="mt-4 px-6 text-xs text-zinc-500">Haven't sent the payment yet? Get a new address.</p>
                </div>
                <Button onClick={() => beginCheckout(true)} disabled={regenerating} className="w-full">
                  {regenerating ? "Generating new address…" : "Generate new address"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* --- The ticket --- */}
                <div className="rounded-xl border border-base-700">
                  {/* Stub 1: scan target */}
                  <div className="relative flex flex-col items-center gap-3 px-5 pb-5 pt-4">
                    <div className="flex w-full items-center justify-between">
                      <span className="rounded-full bg-base-800 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                        BEP20 network
                      </span>
                      {secondsLeft !== null && !pollingStopped && (
                        <span
                          className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-medium ${
                            urgent ? "bg-red-500/10 text-red-500" : "bg-base-800 text-zinc-400"
                          }`}
                        >
                          {mm}:{String(ss).padStart(2, "0")}
                        </span>
                      )}
                    </div>

                    <div className="relative p-2">
                      {/* corner brackets — turns the plain QR square into a
                          "scan here" target instead of a bordered box */}
                      <span className="absolute -left-0.5 -top-0.5 h-5 w-5 rounded-tl-md border-l-2 border-t-2 border-accent-500" />
                      <span className="absolute -right-0.5 -top-0.5 h-5 w-5 rounded-tr-md border-r-2 border-t-2 border-accent-500" />
                      <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-bl-md border-b-2 border-l-2 border-accent-500" />
                      <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-br-md border-b-2 border-r-2 border-accent-500" />
                      <div className="flex h-[180px] w-[180px] items-center justify-center rounded-md bg-white p-2">
                        {qrDataUrl ? (
                          <img src={qrDataUrl} alt="Scan to pay" width={164} height={164} />
                        ) : (
                          <span className="text-xs text-zinc-400">Loading QR…</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Perforation — a dashed rule with a notch cut from each
                      edge, so the card reads as two torn ticket stubs. */}
                  <div className="relative border-t border-dashed border-base-700">
                    <span className="absolute -left-[9px] -top-[9px] h-[18px] w-[18px] rounded-full bg-base-900" />
                    <span className="absolute -right-[9px] -top-[9px] h-[18px] w-[18px] rounded-full bg-base-900" />
                  </div>

                  {/* Stub 2: the receipt — amount and address as two rows,
                      each with its own copy control. */}
                  <div className="divide-y divide-dashed divide-base-700 px-5">
                    <div className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <div className="text-[11px] text-zinc-500">Amount to send</div>
                        <div className="mt-0.5 truncate font-mono text-base font-semibold text-zinc-100">
                          {order.payAmount} {(order.payCurrency ?? "").toUpperCase()}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Copy amount"
                        onClick={() => handleCopy("amount", order.payAmount != null ? String(order.payAmount) : null)}
                        className={copyBtnClass}
                      >
                        <CopyGlyph done={copiedField === "amount"} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <div className="text-[11px] text-zinc-500">Address</div>
                        <div className="mt-0.5 break-all font-mono text-xs text-zinc-300">{order.payAddress}</div>
                      </div>
                      <button
                        type="button"
                        aria-label="Copy address"
                        onClick={() => handleCopy("address", order.payAddress)}
                        className={copyBtnClass}
                      >
                        <CopyGlyph done={copiedField === "address"} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* One short, simple instruction line in Bangla — the only
                    "how to pay" copy shown. */}
                <p className="rounded-lg bg-highlight-500/10 px-4 py-2.5 text-center text-[13px] leading-relaxed text-zinc-200">
                  {t("unlock_modal.instruction_bn")}
                </p>

                {/* Status caption — plain text, no box; the timer already
                    lives on the ticket above. */}
                <p className="text-center text-xs text-zinc-500">
                  {pollingStopped
                    ? "Still waiting — contact support."
                    : statusLabel["status" in order ? order.status : "waiting"] ?? "Waiting for payment…"}
                </p>
              </div>
            )
          ) : null}

          {/* Discreet attribution, not a feature — smallest readable size,
              muted, tucked in the corner so it never competes with checkout. */}
          <div className="mt-4 text-right text-[9px] leading-none text-zinc-700">Powered by NOWPayments</div>
        </div>
      </div>
    </div>
  );
}