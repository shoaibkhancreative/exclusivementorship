import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type PublicConfig } from "../lib/api";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { Button, Card } from "../components/ui";
import { IllustrationBadge } from "../components/IllustrationBadge";

// Same illustration language as the checkout popup (UnlockModal): one soft
// round badge, flat two/three-tone shapes, built only from brand colors —
// swapped per step so the page still reads as "just one friendly picture",
// never two competing for attention. Envelope while an address is being
// collected, a little padlock once a code has actually been sent.
function EnvelopeBadge() {
  return (
    <IllustrationBadge size={60} bg="linear-gradient(180deg, rgba(230,57,70,0.14), rgba(184,134,46,0.12))" breathe>
      <svg viewBox="0 0 80 80" width={36} height={36} aria-hidden="true">
        <rect x="12" y="24" width="56" height="38" rx="8" fill="#e63946" />
        <path d="M12 28 L40 50 L68 28" fill="none" stroke="#fdf8e9" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="60" cy="24" r="7" fill="#c99a49" />
        <path d="M57 24l2 2 3.5-4" fill="none" stroke="#fdf8e9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IllustrationBadge>
  );
}

function LockBadge() {
  return (
    <IllustrationBadge size={60} bg="rgba(230,57,70,0.14)">
      <svg viewBox="0 0 80 80" width={34} height={34} className="animate-[gentle-pop_0.4s_ease-out]" aria-hidden="true">
        <path d="M28 36v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#c99a49" strokeWidth="5" strokeLinecap="round" />
        <rect x="20" y="36" width="40" height="30" rx="8" fill="#e63946" />
        <circle cx="40" cy="49" r="4.5" fill="#fdf8e9" />
        <rect x="38" y="49" width="4" height="8" rx="2" fill="#fdf8e9" />
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

    // Google's button has no "100% width" option of its own — it only takes
    // a fixed pixel width (200–400) — so instead of the old hardcoded 320,
    // measure the form's actual content width and render at that size. That
    // keeps the button lined up with the email input directly below it
    // (same left/right edges) on every screen, instead of floating at a
    // fixed width that could overflow a narrow phone or look undersized
    // inside a wider card.
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
          // "interaction-only": renders nothing at all unless Cloudflare
          // actually needs the visitor to prove they're human — in the
          // common case (silent pass) the widget takes up zero visible
          // space instead of showing its checkbox box above the form.
          // "flexible" lets it fill the card's width instead of forcing
          // its own fixed 300px box.
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
    // relative + overflow-hidden so the soft brand-color glow behind the
    // card can bleed off the viewport edge; min-h-screen (rather than a
    // fixed vh) keeps the card vertically centered the same way on a small
    // phone and a tall ultrawide monitor instead of drifting to the top on
    // very tall screens.
    <div className="page-enter relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-6">
      {/* Purely decorative — ONE small, low-opacity glow so the page still
          feels considered on a wide desktop viewport instead of a lone
          narrow card floating in empty cream space. Kept to a single blob
          and turned down further than the admin login's version so it
          reads as a whisper of warmth, not a second thing to look at. */}
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
              {error && <p className="text-sm text-accent-300">{error}</p>}
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
              {error && <p className="text-sm text-accent-300">{error}</p>}
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
          {/* ONE persistent node, kept as a sibling of both forms (never
              inside the ternary above) so it's never unmounted when `step`
              changes — Turnstile tokens are single-use, and "Resend code"
              on the OTP step needs this exact same widget instance to still
              be alive to hand back a fresh one. Placed at the very bottom of
              the card, out of the way of the actual form fields, and hidden
              outright on the OTP step since there's nothing left to verify
              there. In the common case (no challenge needed) "interaction-
              only" appearance (see the render call above) means this
              renders at zero height even while visible. */}
          <div ref={turnstileContainerRef} className={step === "otp" ? "hidden" : "mt-1"} />
        </Card>
      </div>
    </div>
  );
}
