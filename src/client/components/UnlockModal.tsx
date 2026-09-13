import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type CreateOrderResponse, type PaymentStatusResponse } from "../lib/api";
import { useConfig } from "../lib/useConfig";
import { useContent } from "../lib/useContent";
import { useSession } from "../lib/SessionContext";
import { IllustrationBadge } from "./IllustrationBadge";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 240; // ~20 minutes at the interval above — matches the address window itself

// NOWPayments' non-hosted "payment" endpoint locks the exchange rate for a
// fixed ~20-minute window per order (see createNowPaymentsPayment). Used
// only to size the ring timer — the real deadline is always `expiresAt`.
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

/** Offer step hero — a friendly open-gift-box badge. Warm, round, one shape doing all the work. */
function GiftBadge() {
  return (
    <IllustrationBadge size={92} bg="linear-gradient(180deg, rgba(184,134,46,0.18), rgba(230,57,70,0.14))" breathe>
      <svg viewBox="0 0 80 80" width={56} height={56} aria-hidden="true">
        <rect x="16" y="34" width="48" height="30" rx="8" fill="#e63946" />
        <rect x="12" y="24" width="56" height="14" rx="6" fill="#ef4f5b" />
        <rect x="36" y="24" width="8" height="40" fill="#fdf8e9" opacity="0.85" />
        <path d="M40 24c-6-10-22-8-18 2 2 5 12 5 18-2z" fill="#c99a49" />
        <path d="M40 24c6-10 22-8 18 2-2 5-12 5-18-2z" fill="#c99a49" />
      </svg>
    </IllustrationBadge>
  );
}

/** Payment-confirmed hero — bookends the padlock with a matching check badge. */
function CheckBadge() {
  return (
    <IllustrationBadge size={92} bg="rgba(230,57,70,0.14)" >
      <svg viewBox="0 0 80 80" width={56} height={56} className="animate-[gentle-pop_0.5s_ease-out]" aria-hidden="true">
        <circle cx="40" cy="40" r="25" fill="#e63946" />
        <path d="M28 41l8 8 16-18" fill="none" stroke="#fdf8e9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IllustrationBadge>
  );
}

/** Expired-address hero — soft and sleepy, not alarming. */
function ClockBadge() {
  return (
    <IllustrationBadge size={76} bg="var(--tw-base-800, #f0e3b8)">
      <svg viewBox="0 0 64 64" width={40} height={40} aria-hidden="true">
        <circle cx="32" cy="34" r="18" fill="none" stroke="#a69f89" strokeWidth="4" />
        <path d="M32 25v9l6 6" fill="none" stroke="#a69f89" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="27" y="9" width="10" height="5" rx="2.5" fill="#a69f89" />
      </svg>
    </IllustrationBadge>
  );
}

/**
 * Slim inline countdown — sits directly under the QR sticker instead of
 * floating on top of it, so it never covers a corner of the code. One
 * thin bar + one small mm:ss label, same warm palette as everything else.
 */
function SlimTimer({ percent, urgent, mm, ss }: { percent: number; urgent: boolean; mm: number; ss: number }) {
  return (
    <div className="mx-auto flex w-36 flex-col items-center gap-1.5 pt-1">
      <div className="h-1 w-full overflow-hidden rounded-full bg-base-700">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${urgent ? "bg-accent-500" : "bg-[#b8862e]"}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      <span className={`font-mono text-[11px] font-semibold tabular-nums ${urgent ? "text-accent-500" : "text-zinc-500"}`}>
        {mm}:{String(ss).padStart(2, "0")}
      </span>
    </div>
  );
}

const pillPrimaryClass =
  "inline-flex w-full items-center justify-center rounded-full bg-accent-500 px-6 py-3.5 text-[15px] font-semibold text-base-950 transition-transform duration-150 active:scale-[0.97] hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40";
const pillSecondaryClass =
  "inline-flex w-full items-center justify-center rounded-full border border-base-700 px-6 py-3.5 text-[15px] font-semibold text-zinc-200 transition-colors duration-150 hover:border-base-600 hover:bg-base-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40";

function CopyPill({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`focus-ring inline-flex flex-none items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
        copied ? "bg-accent-500/15 text-accent-500" : "bg-base-700/70 text-zinc-300 hover:bg-base-700"
      }`}
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 10.5l3.8 3.8L16 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        "Copy"
      )}
    </button>
  );
}

/** Amount + address in a single soft card with one internal divider — the only "form-like" element in the whole popup. */
function PaymentDetailsCard({
  amount,
  address,
  copiedField,
  onCopy
}: {
  amount: string;
  address: string;
  copiedField: "amount" | "address" | null;
  onCopy: (field: "amount" | "address", value: string) => void;
}) {
  return (
    <div className="divide-y divide-base-700/50 rounded-2xl bg-base-800/60 p-4">
      <div className="pb-3.5">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-zinc-500">Amount</span>
          <CopyPill copied={copiedField === "amount"} onCopy={() => onCopy("amount", amount)} />
        </div>
        <div className="font-mono text-sm font-semibold text-zinc-100">{amount}</div>
      </div>
      <div className="pt-3.5">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-zinc-500">Address</span>
          <CopyPill copied={copiedField === "address"} onCopy={() => onCopy("address", address)} />
        </div>
        <div className="break-all font-mono text-sm font-semibold text-zinc-100">{address}</div>
      </div>
    </div>
  );
}

/** Warm three-dot loader instead of a technical spinner ring. */
function FriendlyLoader() {
  return (
    <div className="flex items-center justify-center gap-1.5" role="status" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full bg-accent-500"
          style={{ animation: "dot-bounce 1s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

/**
 * The in-site checkout flow, rebuilt around one rule: at most one
 * illustration, one heading, and one supporting line per screen — plus
 * whatever functional pieces (QR, amount/address, timer) the payment
 * itself actually needs. No step counters, no duplicate price rows, no
 * standalone network badges, no footer copy.
 */
export function UnlockModal({ onClose }: { onClose: () => void }) {
  const config = useConfig();
  const { t } = useContent();
  const { refresh } = useSession();
  const navigate = useNavigate();

  const [step, setStep] = useState<"offer" | "checkout">("offer");

  const [order, setOrder] = useState<Order | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleContinueToCheckout = useCallback(() => {
    setStep("checkout");
    beginCheckout(false);
  }, [beginCheckout]);

  useEffect(() => {
    if (step !== "checkout" || !order?.orderId) return;
    setPollingStopped(false);
    let count = 0;
    const id = setInterval(() => {
      count += 1;
      if (count > MAX_POLLS) {
        clearInterval(id);
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

  const statusLabel: Record<string, string> = {
    created: "Preparing…",
    waiting: "Waiting for your payment…",
    confirming: "Confirming on the network…",
    confirmed: "Confirmed! Unlocking…",
    finished: "Confirmed! Unlocking…",
    failed: "That payment didn't go through — try again.",
    expired: "This address expired.",
    cancelled: "Payment cancelled."
  };

  const URGENT_THRESHOLD_PERCENT = 25;
  const progressPercent =
    secondsLeft !== null ? Math.max(0, Math.min(100, (secondsLeft / WINDOW_SECONDS) * 100)) : 100;
  const urgent = progressPercent <= URGENT_THRESHOLD_PERCENT;
  const mm = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0;
  const ss = secondsLeft !== null ? secondsLeft % 60 : 0;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-[#2b1a10]/50 backdrop-blur-sm sm:items-center"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Unlock Exclusive Mentorship"
    >
      <div className="animate-slide-up relative max-h-[92vh] w-full overflow-hidden overflow-y-auto rounded-t-[28px] bg-base-900 shadow-[0_24px_70px_-20px_rgba(230,57,70,0.35)] sm:max-w-sm sm:rounded-[28px]">
        <div className="flex justify-center pb-1 pt-3 sm:hidden">
          <span className="h-1.5 w-10 rounded-full bg-base-700" />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-ring absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-base-800/80 text-zinc-500 transition-colors hover:bg-base-700 hover:text-zinc-200"
        >
          ✕
        </button>

        <div className="px-6 pb-6 pt-8 sm:pt-9">
          {step === "offer" ? (
            <div className="space-y-6 text-center">
              <GiftBadge />

              <div className="space-y-1.5">
                <h2 className="font-serif text-xl font-medium leading-snug text-zinc-50">{t("unlock_modal.title")}</h2>
                <p className="text-[15px] leading-relaxed text-zinc-400">{t("unlock_modal.description")}</p>
              </div>

              {config && (
                <div className="flex items-baseline justify-center gap-2.5 rounded-full bg-base-800/60 px-5 py-3">
                  <span className="text-2xl font-semibold text-zinc-50">${config.enrollmentPrice}</span>
                  <span className="text-sm text-zinc-500 line-through">${config.referencePrice}</span>
                  <span className="rounded-full bg-accent-500/15 px-2.5 py-0.5 text-xs font-semibold text-accent-500">
                    {config.discountPercent}% OFF
                  </span>
                </div>
              )}

              <div className="space-y-3">
                <button onClick={handleContinueToCheckout} disabled={!config} className={pillPrimaryClass}>
                  {t("unlock_modal.cta")}
                </button>

                {config?.mentorshipPdfUrl && (
                  <a
                    href={config.mentorshipPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring inline-block text-sm text-accent-400 hover:underline"
                  >
                    {t("unlock_modal.pdf_link_label")}
                  </a>
                )}
              </div>
            </div>
          ) : paid ? (
            <div className="space-y-4 py-4 text-center">
              <CheckBadge />
              <div>
                <p className="text-[15px] font-medium text-zinc-50">Payment confirmed.</p>
                <p className="mt-1 text-sm text-zinc-500">Unlocking your access…</p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <FriendlyLoader />
              <p className="text-sm text-zinc-500">Preparing your payment…</p>
            </div>
          ) : error ? (
            <div className="space-y-4 py-2 text-center">
              <p className="text-sm text-accent-300">{error}</p>
              <button onClick={onClose} className={pillSecondaryClass}>
                Close
              </button>
            </div>
          ) : order ? (
            timeExpired ? (
              <div className="space-y-5 text-center">
                <ClockBadge />
                <div>
                  <p className="text-[15px] font-medium text-zinc-50">This code has expired</p>
                  <p className="mt-1 text-sm text-zinc-500">No worries — grab a fresh address and try again.</p>
                </div>
                <button onClick={() => beginCheckout(true)} disabled={regenerating} className={pillPrimaryClass}>
                  {regenerating ? "Generating new address…" : "Get a new address"}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <h2 className="text-center font-serif text-lg font-medium text-zinc-50">Send Payment</h2>

                <div className="flex flex-col items-center">
                  <div className="rounded-[26px] bg-accent-500/8 p-4">
                    <div className="flex h-[208px] w-[208px] items-center justify-center rounded-2xl bg-white p-3">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="Scan to pay" width={184} height={184} />
                      ) : (
                        <span className="text-xs text-zinc-400">Loading QR…</span>
                      )}
                    </div>
                  </div>
                  {secondsLeft !== null && !pollingStopped && (
                    <SlimTimer percent={progressPercent} urgent={urgent} mm={mm} ss={ss} />
                  )}
                </div>

                <PaymentDetailsCard
                  amount={`${order.payAmount} ${(order.payCurrency ?? "").toUpperCase()}`}
                  address={order.payAddress ?? ""}
                  copiedField={copiedField}
                  onCopy={(field, value) => handleCopy(field, value)}
                />

                <p className="text-center text-[13px] leading-relaxed text-zinc-400">{t("unlock_modal.instruction_bn")}</p>

                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500">
                  {!pollingStopped && <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-highlight-500" />}
                  {pollingStopped
                    ? "Still waiting — contact support."
                    : statusLabel["status" in order ? order.status : "waiting"] ?? "Waiting for your payment…"}
                </p>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}