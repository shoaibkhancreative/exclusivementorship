import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type PublicConfig } from "../lib/api";
import { useSession } from "../lib/SessionContext";
import { Button, Card } from "../components/ui";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

type Step = "email" | "otp";

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useSession();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const turnstileTokenRef = useRef<string>("");
  const turnstileContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<PublicConfig>("/config/public").then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!config?.turnstileSiteKey || step !== "email") return;
    const scriptId = "turnstile-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const interval = setInterval(() => {
      if (window.turnstile && turnstileContainerRef.current && !turnstileContainerRef.current.hasChildNodes()) {
        window.turnstile.render(turnstileContainerRef.current, {
          sitekey: config.turnstileSiteKey,
          callback: (token) => {
            turnstileTokenRef.current = token;
          }
        });
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [config, step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/request-otp", { email, turnstileToken: turnstileTokenRef.current });
      setStep("otp");
      setCooldown(60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/verify-otp", { email, code });
      await refresh();
      navigate("/learn");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <Card>
        {step === "email" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold text-zinc-50">Log in</h1>
              <p className="mt-1 text-sm text-zinc-400">We'll email you a one-time code. No password needed.</p>
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-xs text-zinc-400">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="focus-ring w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <div ref={turnstileContainerRef} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Sending…" : "Send OTP"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold text-zinc-50">Enter the code</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Enter the 6-digit code sent to <span className="text-zinc-200">{email}</span>
              </p>
            </div>
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="focus-ring w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2.5 text-center text-lg tracking-[0.5em] text-zinc-100 placeholder:text-zinc-600"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Verifying…" : "Verify & Continue"}
            </Button>
            <button
              type="button"
              disabled={cooldown > 0}
              onClick={() => handleSendOtp(new Event("submit") as unknown as React.FormEvent)}
              className="focus-ring w-full text-center text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
