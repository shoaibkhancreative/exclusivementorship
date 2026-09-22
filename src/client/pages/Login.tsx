import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type PublicConfig } from "../lib/api";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { Button, Card } from "../components/ui";
import { IllustrationBadge } from "../components/IllustrationBadge";

function EnvelopeBadge() {
  return (
    <IllustrationBadge size={60} bg="linear-gradient(180deg, rgba(18,196,107,0.20), rgba(155,130,255,0.12))" breathe>
      <svg viewBox="0 0 80 80" width={36} height={36} aria-hidden="true">
        <rect x="12" y="24" width="56" height="38" rx="8" fill="#12C46B" />
        <path
          d="M12 28 L40 50 L68 28"
          fill="none"
          stroke="#0B0F0D"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="60" cy="24" r="7" fill="#9B82FF" />
        <path
          d="M57 24l2 2 3.5-4"
          fill="none"
          stroke="#0B0F0D"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </IllustrationBadge>
  );
}

function LockBadge() {
  return (
    <IllustrationBadge size={60} bg="rgba(18,196,107,0.16)">
      <svg viewBox="0 0 80 80" width={34} height={34} className="animate-[gentle-pop_0.4s_ease-out]" aria-hidden="true">
        <path d="M28 36v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#7E9188" strokeWidth="5" strokeLinecap="round" />
        <rect x="20" y="36" width="40" height="30" rx="8" fill="#12C46B" />
        <circle cx="40" cy="49" r="4.5" fill="#0B0F0D" />
        <rect x="38" y="49" width="4" height="8" rx="2" fill="#0B0F0D" />
      </svg>
    </IllustrationBadge>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; appearance?: string; size?: string }
      ) => string;
      reset: (widgetId?: string) => void;
    };
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (
            container: HTMLElement,
            options: { theme?: string; size?: string; width?: number; text?: string; shape?: string }
          ) => void;
        };
      };
    };
  }
}

type Step = "email" | "otp";

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useSession();
  const { t } = useContent();

  useDocumentMeta({
    title: "Log in",
    description: "Log in with a one-time email code or Google to access your mentorship lessons.",
    path: "/login"
  });

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [config, setConfig] = useState<PublicConfig | null>(null);
  const turnstileTokenRef = useRef<string>("");
  const turnstileWidgetIdRef = useRef<string | undefined>(undefined);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<PublicConfig>("/config/public")
      .then(setConfig)
      .catch(() => {});
  }, []);

  async function handleGoogleCredential(response: { credential: string }) {
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/google", { credential: response.credential });
      await refresh();
      navigate("/learn");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!config?.googleClientId || step !== "email") return;
    const clientId = config.googleClientId;
    const scriptId = "google-identity-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    function renderGoogleButton() {
      const container = googleButtonRef.current;
      if (!container || !window.google?.accounts?.id) return;
      const width = Math.max(200, Math.min(400, Math.round(container.clientWidth)));
      container.innerHTML = "";
      window.google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        width,
        text: "continue_with",
        shape: "pill"
      });
    }

    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
    function handleResize() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(renderGoogleButton, 150);
    }

    const interval = setInterval(() => {
      if (window.google?.accounts?.id && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredential
        });
        renderGoogleButton();
        window.addEventListener("resize", handleResize);
        clearInterval(interval);
      }
    }, 200);
    return () => {
      clearInterval(interval);
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, step]);

  useEffect(() => {
    if (!config?.turnstileSiteKey) return;
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
        turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: config.turnstileSiteKey,
          appearance: "interaction-only",
          size: "flexible",
          callback: (token) => {
            turnstileTokenRef.current = token;
          }
        });
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [config]);

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
      turnstileTokenRef.current = "";
      if (turnstileWidgetIdRef.current !== undefined) {
        window.turnstile?.reset(turnstileWidgetIdRef.current);
      }
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
    <div className="page-enter relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-accent-500/[0.08] blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        <Card className="!p-5 border-base-800 sm:!p-6">
          {step === "email" ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="text-center">
                <EnvelopeBadge />
                <h1 className="mt-3 text-xl text-zinc-50">{t("login.email_title")}</h1>
                <p className="mt-1 text-sm text-zinc-400">{t("login.email_subtitle")}</p>
              </div>
              {config?.googleClientId && (
                <>
                  <div ref={googleButtonRef} className="flex justify-center" />
                  <div className="flex items-center gap-3 text-xs text-zinc-600">
                    <div className="h-px flex-1 bg-base-800" />
                    <span>{t("login.google_divider")}</span>
                    <div className="h-px flex-1 bg-base-800" />
                  </div>
                </>
              )}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs text-zinc-500">
                  {t("login.email_label")}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("login.email_placeholder")}
                  className="focus-ring w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? t("login.send_otp_button_loading") : t("login.send_otp_button")}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="text-center">
                <LockBadge />
                <h1 className="mt-3 text-xl text-zinc-50">{t("login.otp_title")}</h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {t("login.otp_subtitle").split("{email}")[0]}
                  <span className="text-zinc-200">{email}</span>
                  {t("login.otp_subtitle").split("{email}")[1]}
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
                className="focus-ring w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2.5 text-center text-lg tracking-[0.5em] text-zinc-100 placeholder:text-zinc-700"
              />
              {error && <p className="text-sm text-red-700">{error}</p>}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? t("login.verify_button_loading") : t("login.verify_button")}
              </Button>
              <button
                type="button"
                disabled={cooldown > 0}
                onClick={() => handleSendOtp(new Event("submit") as unknown as React.FormEvent)}
                className="focus-ring w-full text-center text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
              >
                {cooldown > 0 ? t("login.resend_button_cooldown", { seconds: cooldown }) : t("login.resend_button")}
              </button>
            </form>
          )}
          <div ref={turnstileContainerRef} className={step === "otp" ? "hidden" : "mt-1"} />
        </Card>
      </div>
    </div>
  );
}
