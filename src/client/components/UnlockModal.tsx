import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type CreateOrderResponse, type PaymentStatusResponse } from "../lib/api";
import { useConfig } from "../lib/useConfig";
import { useSession } from "../lib/SessionContext";
import { Button } from "./ui";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 240; // ~20 minutes, matching the payment's own expiry window

/**
 * The in-site crypto checkout. This is intentionally branding-neutral: it
 * only ever shows an address, an amount, and a QR code that the backend
 * already resolved — the underlying processor is never named here. Opened
 * as a popup (not a page) so it can be triggered from anywhere and closed
 * without navigating away.
 */
export function UnlockModal({ onClose }: { onClose: () => void }) {
  const config = useConfig();
  const { refresh } = useSession();
  const navigate = useNavigate();

  const [order, setOrder] = useState<CreateOrderResponse | PaymentStatusResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const poll = useCallback(
    async (orderId: string) => {
      try {
        const result = await api.get<PaymentStatusResponse>(`/payments/status/${orderId}`);
        setOrder(result);
        if (result.courseStatus === "paid") {
          stopPolling();
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
    [navigate, onClose, refresh, stopPolling]
  );

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.post<CreateOrderResponse>("/payments/create-order");
        if (cancelled) return;
        setOrder(result);
        pollTimer.current = setInterval(() => {
          pollCount.current += 1;
          if (pollCount.current > MAX_POLLS) {
            stopPolling();
            return;
          }
          poll(result.orderId);
        }, POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Couldn't start the payment. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    start();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!order?.payAddress) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(order.payAddress, { margin: 1, width: 220, color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [order?.payAddress]);

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
    created: "Preparing your payment…",
    waiting: "Waiting for payment to arrive.",
    confirming: "Payment detected — confirming on the network.",
    confirmed: "Confirmed! Unlocking your access…",
    finished: "Confirmed! Unlocking your access…",
    failed: "This payment didn't complete. Please try again.",
    expired: "This payment window has expired. Close and try again.",
    cancelled: "This payment was cancelled."
  };

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
            <div className="text-xs uppercase tracking-wide text-zinc-500">Unlock Exclusive Mentorship</div>
            {config && (
              <div className="mt-1 text-2xl font-semibold text-zinc-50">${config.enrollmentPrice} USDT</div>
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
            <p className="text-sm font-medium text-accent-400">Payment confirmed.</p>
            <p className="mt-1 text-sm text-zinc-400">Opening your access…</p>
          </div>
        ) : loading ? (
          <div className="py-10 text-center text-sm text-zinc-500">Preparing checkout…</div>
        ) : error ? (
          <div className="py-6 text-center">
            <p className="mb-4 text-sm text-red-400">{error}</p>
            <Button variant="secondary" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        ) : order ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="rounded-xl bg-white p-3">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Scan to pay" width={180} height={180} />
                ) : (
                  <div className="flex h-[180px] w-[180px] items-center justify-center text-xs text-zinc-400">
                    Loading QR…
                  </div>
                )}
              </div>
            </div>

            <div className="text-center text-sm text-zinc-400">
              Send exactly{" "}
              <span className="font-semibold text-zinc-100">
                {order.payAmount} {(order.payCurrency ?? "").toUpperCase()}
              </span>{" "}
              to the address below.
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="focus-ring block w-full rounded-lg border border-base-700 bg-base-950 px-3 py-3 text-left transition-colors hover:border-accent-500/60"
            >
              <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Payment Address (tap to copy)</div>
              <div className="break-all font-mono text-xs text-zinc-100">{order.payAddress}</div>
              {copied && <div className="mt-1 text-xs text-accent-400">Copied ✓</div>}
            </button>

            <div className="rounded-lg border border-base-700 bg-base-950 px-3 py-2.5 text-center text-xs text-zinc-400">
              {statusLabel["status" in order ? order.status : "waiting"] ?? "Waiting for your payment…"}
            </div>

            <p className="text-center text-[11px] leading-relaxed text-zinc-600">
              This checkout is monitored automatically — access unlocks the moment your payment is confirmed. You
              can safely close this and come back from your profile menu.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
