import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type PublicConfig } from "../lib/api";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { Button, Card } from "../components/ui";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string;
      reset: (widgetId?: string) => void;
    };
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
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
    api.get<PublicConfig>("/config/public").then(setConfig).catch(() => {});
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
    const interval = setInterval(() => {
      if (window.google?.accounts?.id && googleButtonRef.current && !googleButtonRef.current.hasChildNodes()) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredential
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          width: 320,
          text: "continue_with",
          shape: "pill"
        });
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, step]);

  // Mounted once, for the lifetime of the whole login flow — NOT gated on
  // `step`. Turnstile tokens are single-use: verifying one against
  // /request-otp permanently spends it. If this widget only existed while
  // step === "email" (as it originally did), it would unmount the moment the
  // user moved to the OTP screen, leaving "Resend code" with no way to fetch
  // a fresh token — it would keep resubmitting the same already-spent one,
  // which Cloudflare always rejects. Keeping the widget alive (see the
  // always-rendered container below, hidden via CSS during the OTP step) and
  // calling turnstile.reset() after every send (see handleSendOtp) keeps a
  // valid, unused token ready at all times.
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
      // The token we just sent (whether it was accepted or not) is spent —
      // Turnstile tokens are single-use. Reset now so a fresh token is ready
      // by the time the user can click "Resend code" (cooldown is 60s,
      // comfortably more than Turnstile needs to silently re-verify).
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
    <div className="page-enter mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6">
      <Card className="border-base-800">
        {/* Always mounted (both steps) so the widget — and its single-use
            token — survives the transition into the OTP step, where
            "Resend code" needs a fresh token without re-rendering Turnstile
            from scratch. Hidden visually, not unmounted, while on the OTP
            step. */}
        <div ref={turnstileContainerRef} className={step === "otp" ? "hidden" : undefined} />
        {step === "email" ? (
          <form onSubmit={handleSendOtp} className="space-y-5">
            <div>
              <h1 className="text-xl text-zinc-50">{t("login.email_title")}</h1>
              <p className="mt-1.5 text-sm text-zinc-400">{t("login.email_subtitle")}</p>
            </div>
            {config?.googleClientId && (
              <>
                <div className="flex justify-center" ref={googleButtonRef} />
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
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? t("login.send_otp_button_loading") : t("login.send_otp_button")}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-5">
            <div>
              <h1 className="text-xl text-zinc-50">{t("login.otp_title")}</h1>
              <p className="mt-1.5 text-sm text-zinc-400">
                {/* {email} in the admin-edited copy renders as JSX (not a plain string
                    interpolation) so the address itself keeps its own styling. */}
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
            {error && <p className="text-sm text-red-400">{error}</p>}
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
      </Card>
    </div>
  );
}
