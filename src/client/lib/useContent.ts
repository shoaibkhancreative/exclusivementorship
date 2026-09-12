import { useEffect, useState } from "react";
import { api } from "./api";

// Bundled fallback copy — mirrors worker/lib/content.ts's CONTENT_DEFAULTS.
// Used the moment a component renders (before the network response lands)
// and if the /config/content fetch ever fails outright, so the public site
// never shows a blank string or crashes on a missing key. Keeping this list
// in sync with the worker's CONTENT_FIELDS is a one-time cost each time a
// new key is added there; nothing here is a second source of truth for
// *values* an admin can change — it's only ever the last-resort fallback.
const BUNDLED_DEFAULTS: Record<string, string> = {
  "site.brand_name": "Exclusive Mentorship",
  "topbar.nav_home": "Home",
  "topbar.nav_login": "Log in",
  "home.kicker": "Next Level Trader",
  "home.headline": "Trade With Structure, Not Guesswork",
  "home.intro_video_fallback": "Intro video coming soon",
  "home.body": "Market structure, liquidity, and price delivery — a framework for traders ready to level up. Free lessons start today.",
  "home.cta_start": "Start Learning",
  "unlock_modal.instruction_bn":
    "QR কোড স্ক্যান করুন অথবা ঠিকানা কপি করে সঠিক পরিমাণ শুধুমাত্র BEP20 নেটওয়ার্কে পাঠান।",
  "access.badge": "Payment successful",
  "access.title": "Welcome to Exclusive Mentorship.",
  "access.description": "Your mentorship is now unlocked — every class is available right away.",
  "access.cta": "Go to your lessons",
  "login.email_title": "Log in",
  "login.email_subtitle": "We'll email you a one-time code. No password needed.",
  "login.google_divider": "or",
  "login.email_label": "Email",
  "login.email_placeholder": "you@example.com",
  "login.send_otp_button": "Send OTP",
  "login.send_otp_button_loading": "Sending…",
  "login.otp_title": "Enter the code",
  "login.otp_subtitle": "Enter the 6-digit code sent to {email}",
  "login.verify_button": "Verify & Continue",
  "login.verify_button_loading": "Verifying…",
  "login.resend_button": "Resend code",
  "login.resend_button_cooldown": "Resend code in {seconds}s",
  "learn.page_title": "Dashboard",
  "learn.progress_kicker": "Your progress",
  "learn.progress_label": "classes completed",
  "learn.classes_count_label": "{count} classes",
  "learn.start_button": "Start Course",
  "learn.continue_label": "Continue",
  "learn.completed_message": "You've finished the free foundation — unlock the full mentorship to keep going.",
  "learn.load_error": "Couldn't load your classes.",
  "learn.retry_button": "Retry",
  "learn.cta_start_now": "Start Now",
  "learn.cta_continue": "Continue",
  "learn.cta_unlock": "Unlock Mentorship",
  "learn.cta_finished": "Finished",
  "lesson.back_to_home": "Back to Home",
  "lesson.nav_previous": "← Previous",
  "lesson.nav_next": "Next →",
  "lesson.nav_next_title_last": "This is the last class in the course",
  "lesson.locked_sequence_message_bn": "এই ক্লাসটি দেখতে হলে আগের ক্লাসটি আগে দেখে নিন।",
  "lesson.locked_payment_message_bn": "এই ক্লাসটি দেখতে এক্সক্লুসিভ মেন্টরশিপ আনলক করুন।",
  "lesson.locked_payment_unlock_button": "Unlock Now",
  "lesson.video_coming_soon": "Video coming soon.",
  "lesson.watched_badge": "Watched — next class unlocked",
  "lesson.watch_prompt": "Watch to the end to unlock the next class.",
  "lesson.fallback_link": "Video finished but not unlocking? Click here",
  "lesson.load_error": "This lesson couldn't be loaded.",
  "lesson.outline_error": "Couldn't load the course outline.",
  "lesson.outline_loading": "Loading outline…",
  "lesson.playlist_title": "Course content",
  "lesson.playlist_position": "{current} / {total}",
  "profile.access_button": "Access",
  "profile.unlock_button": "Unlock Full Mentorship",
  "profile.logout_button": "Log out",
  "privacy.title": "Privacy Policy",
  "privacy.p1":
    "Exclusive Mentorship (\"we\", \"us\", \"our\") collects only what's needed to run the mentorship: the email address you sign in with (by one-time code or Google Sign-In), your course progress (which classes you've completed), and payment/order metadata for enrollment (order ID, amount, status, and confirmation time). We never see or store your card or crypto wallet contents — crypto payments are processed entirely by our payment provider, NOWPayments. If you contact support, we also keep the content of your messages and any images you attach, so we can help with your question.",
  "privacy.p2":
    "Watching a class's video to the end is what unlocks the next class in the sequence — we record only that a video was completed, not detailed viewing analytics (we don't track how much of a video you watched, pausing/rewinding, or playback speed). This completion data is used solely to run the course structure and is visible to you in your own dashboard.",
  "privacy.p3":
    "We share the minimum data necessary with a small set of service providers to run the site: Resend (to deliver your login code and other account emails), NOWPayments (to process your crypto payment), Cloudflare Turnstile (to confirm you're not a bot when requesting a login code), and Google (only if you choose \"Sign in with Google\", to verify your identity). None of these providers may use your data for anything beyond providing that service to us.",
  "privacy.p4_prefix":
    "We keep your account data for as long as your account is active. Support conversations and expired login codes are deleted automatically after a short retention window; records of confirmed payments are kept indefinitely for financial and legal record-keeping. You may request access to, correction of, or deletion of your account and associated data at any time by contacting",
  "privacy.contact_email": "support@exclusivementorship.xyz",
  "terms.title": "Terms of Use",
  "terms.p1":
    "Exclusive Mentorship provides educational content about trading concepts, market structure, and fundamental analysis. Nothing on this site is financial, investment, or trading advice, and no outcome, profit, or result is guaranteed. Trading involves substantial risk of loss, and you are solely responsible for any trading decisions you make.",
  "terms.p2":
    "Enrollment in Exclusive Mentorship (currently $49 USDT, reference value $100 USDT) is a one-time payment that grants lifetime access to all premium lessons on this site, unlocked as soon as your payment is confirmed on-chain. Payments must be sent in USDT on the BEP20 network only, for the exact amount and to the address shown at checkout; each payment window is time-limited, and a new address is generated once it expires. We do not create, hold, or manage any cryptocurrency wallet on your behalf.",
  "terms.p3_prefix":
    "Payments are processed by our third-party payment provider, NOWPayments, and once your enrollment is confirmed it is generally non-refundable, given the nature of digital course access and cryptocurrency payments — if you believe you were charged in error, contact us as soon as possible. We may suspend or terminate access to your account for violating these terms (for example, sharing your login with others) or in cases of fraud or abuse. We may update these terms from time to time; continuing to use the site after a change means you accept the update. Questions about these terms can be sent to",
  "support.button_label": "Support",
  "support.panel_title": "Support",
  "support.panel_subtitle": "We usually reply within a day",
  "support.empty_state": "No conversations yet. Start one below.",
  "support.new_ticket_button": "New ticket",
  "support.ticket_limit_message": "You already have an open conversation — close it to start a new one.",
  "support.email_prompt_label": "Your email",
  "support.email_prompt_note": "So we can email you when we reply.",
  "support.compose_placeholder": "Describe your issue…",
  "support.reply_placeholder": "Type a message…",
  "support.close_button": "Close conversation",
  "support.close_confirm": "Close this conversation? You won't see it in your list anymore, but you can always start a new one."
};

interface ContentResponse {
  content: Record<string, string>;
}

// Module-level cache/inflight, same pattern as useConfig — every component
// using useContent() shares one /config/content fetch.
let cached: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export interface UseContentResult {
  /** Looks up `key`, falling back to the bundled default if the network map hasn't loaded (or doesn't have it), then interpolates any `{placeholder}` vars. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  loaded: boolean;
}

export function useContent(): UseContentResult {
  const [map, setMap] = useState<Record<string, string> | null>(cached);

  useEffect(() => {
    if (cached) {
      setMap(cached);
      return;
    }
    if (!inflight) {
      inflight = api.get<ContentResponse>("/config/content").then((res) => res.content);
    }
    let cancelled = false;
    inflight
      .then((data) => {
        cached = data;
        if (!cancelled) setMap(data);
      })
      .catch(() => {
        inflight = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function t(key: string, vars?: Record<string, string | number>): string {
    const raw = map?.[key] ?? BUNDLED_DEFAULTS[key] ?? key;
    return interpolate(raw, vars);
  }

  return { t, loaded: map !== null };
}