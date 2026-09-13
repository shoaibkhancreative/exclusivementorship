export interface ContentFieldDef {
  key: string;
  group: string;
  label: string;
  type: "text" | "textarea" | "image";
  defaultValue: string;
}

export const CONTENT_FIELDS: ContentFieldDef[] = [
  {
    key: "site.brand_name",
    group: "Site-wide",
    label: "Brand name (nav / footer)",
    type: "text",
    defaultValue: "Exclusive Mentorship"
  },

  { key: "topbar.nav_home", group: "Navigation", label: "Nav link — Home", type: "text", defaultValue: "Home" },
  { key: "topbar.nav_login", group: "Navigation", label: "Nav link — Log in", type: "text", defaultValue: "Log in" },

  { key: "home.kicker", group: "Home", label: "Kicker", type: "text", defaultValue: "Next Level Trader" },
  {
    key: "home.headline",
    group: "Home",
    label: "Headline",
    type: "text",
    defaultValue: "Trade With Structure, Not Guesswork"
  },
  {
    key: "home.intro_video_fallback",
    group: "Home",
    label: "Intro video placeholder text",
    type: "text",
    defaultValue: "Intro video coming soon"
  },
  {
    key: "home.body",
    group: "Home",
    label: "Body copy",
    type: "textarea",
    defaultValue:
      "Market structure, liquidity, and price delivery — a framework for traders ready to level up. Free lessons start today."
  },
  { key: "home.cta_start", group: "Home", label: "CTA button", type: "text", defaultValue: "Start Learning" },

  {
    key: "unlock_modal.title",
    group: "Unlock Modal",
    label: "Offer step — headline",
    type: "text",
    defaultValue: "Unlock Full Mentorship"
  },
  {
    key: "unlock_modal.description",
    group: "Unlock Modal",
    label: "Offer step — one-line description",
    type: "text",
    defaultValue: "Get lifetime access to every advanced class, right away."
  },
  {
    key: "unlock_modal.cta",
    group: "Unlock Modal",
    label: "Offer step — CTA button",
    type: "text",
    defaultValue: "Continue to Payment"
  },
  {
    key: "unlock_modal.pdf_link_label",
    group: "Unlock Modal",
    label: "Offer step — curriculum PDF link",
    type: "text",
    defaultValue: "View free curriculum PDF"
  },
  {
    key: "unlock_modal.instruction_bn",
    group: "Unlock Modal",
    label: "One-line payment instruction (Bangla)",
    type: "text",
    defaultValue: "QR কোড স্ক্যান করুন অথবা ঠিকানা কপি করে সঠিক পরিমাণ শুধুমাত্র BEP20 নেটওয়ার্কে পাঠান।"
  },

  { key: "access.badge", group: "Access", label: "Badge", type: "text", defaultValue: "Payment successful" },
  {
    key: "access.title",
    group: "Access",
    label: "Title",
    type: "text",
    defaultValue: "Welcome to Exclusive Mentorship."
  },
  {
    key: "access.description",
    group: "Access",
    label: "Description",
    type: "text",
    defaultValue: "Your mentorship is now unlocked — every class is available right away."
  },
  { key: "access.cta", group: "Access", label: "CTA button", type: "text", defaultValue: "Go to your lessons" },

  { key: "login.email_title", group: "Login", label: "Email step — title", type: "text", defaultValue: "Log in" },
  {
    key: "login.email_subtitle",
    group: "Login",
    label: "Email step — subtitle",
    type: "text",
    defaultValue: "We'll email you a one-time code. No password needed."
  },
  {
    key: "login.google_divider",
    group: "Login",
    label: "Divider word between Google button and email form",
    type: "text",
    defaultValue: "or"
  },
  { key: "login.email_label", group: "Login", label: "Email field label", type: "text", defaultValue: "Email" },
  {
    key: "login.email_placeholder",
    group: "Login",
    label: "Email field placeholder",
    type: "text",
    defaultValue: "you@example.com"
  },
  { key: "login.send_otp_button", group: "Login", label: "Send-code button", type: "text", defaultValue: "Send OTP" },
  {
    key: "login.send_otp_button_loading",
    group: "Login",
    label: "Send-code button (loading)",
    type: "text",
    defaultValue: "Sending…"
  },
  { key: "login.otp_title", group: "Login", label: "Code step — title", type: "text", defaultValue: "Enter the code" },
  {
    key: "login.otp_subtitle",
    group: "Login",
    label: "Code step — subtitle (use {email})",
    type: "text",
    defaultValue: "Enter the 6-digit code sent to {email}"
  },
  {
    key: "login.verify_button",
    group: "Login",
    label: "Verify button",
    type: "text",
    defaultValue: "Verify & Continue"
  },
  {
    key: "login.verify_button_loading",
    group: "Login",
    label: "Verify button (loading)",
    type: "text",
    defaultValue: "Verifying…"
  },
  {
    key: "login.resend_button",
    group: "Login",
    label: "Resend-code button",
    type: "text",
    defaultValue: "Resend code"
  },
  {
    key: "login.resend_button_cooldown",
    group: "Login",
    label: "Resend-code button, counting down (use {seconds})",
    type: "text",
    defaultValue: "Resend code in {seconds}s"
  },

  { key: "learn.page_title", group: "Learn", label: "Page title/heading", type: "text", defaultValue: "Dashboard" },
  {
    key: "learn.progress_kicker",
    group: "Learn",
    label: "Progress kicker",
    type: "text",
    defaultValue: "Your progress"
  },
  {
    key: "learn.progress_label",
    group: "Learn",
    label: "Progress unit label",
    type: "text",
    defaultValue: "classes completed"
  },
  {
    key: "learn.classes_count_label",
    group: "Learn",
    label: "Class count (use {count})",
    type: "text",
    defaultValue: "{count} classes"
  },
  {
    key: "learn.start_button",
    group: "Learn",
    label: '"Start from class 1" button (no progress yet)',
    type: "text",
    defaultValue: "Start Course"
  },
  {
    key: "learn.continue_label",
    group: "Learn",
    label: '"Continue" card label',
    type: "text",
    defaultValue: "Continue"
  },
  {
    key: "learn.completed_message",
    group: "Learn",
    label: "All-classes-completed message",
    type: "text",
    defaultValue: "You've finished the free foundation — unlock the full mentorship to keep going."
  },
  {
    key: "learn.load_error",
    group: "Learn",
    label: "Outline load-error message",
    type: "text",
    defaultValue: "Couldn't load your classes."
  },
  { key: "learn.retry_button", group: "Learn", label: "Retry button", type: "text", defaultValue: "Retry" },
  {
    key: "learn.cta_start_now",
    group: "Learn",
    label: "CTA — 0 classes completed",
    type: "text",
    defaultValue: "Start Now"
  },
  {
    key: "learn.cta_continue",
    group: "Learn",
    label: "CTA — mid-course (free or paid)",
    type: "text",
    defaultValue: "Continue"
  },
  {
    key: "learn.cta_unlock",
    group: "Learn",
    label: "CTA — free tier finished, not paid",
    type: "text",
    defaultValue: "Unlock Mentorship"
  },
  {
    key: "learn.cta_finished",
    group: "Learn",
    label: "CTA — entire course finished (paid)",
    type: "text",
    defaultValue: "Finished"
  },
  {
    key: "learn.finished_message",
    group: "Learn",
    label: "Friendly note shown once every class is finished (paid)",
    type: "text",
    defaultValue: "You've completed every class — congratulations on finishing the mentorship."
  },
  {
    key: "learn.empty_state",
    group: "Learn",
    label: "Shown when no classes have been published yet",
    type: "text",
    defaultValue: "Classes are on their way — check back soon."
  },

  {
    key: "lesson.back_to_home",
    group: "Lesson",
    label: '"Back to Home" button',
    type: "text",
    defaultValue: "Back to Home"
  },
  {
    key: "lesson.nav_previous",
    group: "Lesson",
    label: "Previous-class button",
    type: "text",
    defaultValue: "← Previous"
  },
  { key: "lesson.nav_next", group: "Lesson", label: "Next-class button", type: "text", defaultValue: "Next →" },
  {
    key: "lesson.nav_next_title_last",
    group: "Lesson",
    label: "Next-class button tooltip on the last class",
    type: "text",
    defaultValue: "This is the last class in the course"
  },
  {
    key: "lesson.locked_sequence_message_bn",
    group: "Lesson",
    label: "Locked (sequence) — message shown on tapping the lock (Bangla)",
    type: "text",
    defaultValue: "এই ক্লাসটি দেখতে হলে আগের ক্লাসটি আগে দেখে নিন।"
  },
  {
    key: "lesson.locked_payment_message_bn",
    group: "Lesson",
    label: "Locked (payment) — message shown on tapping the lock (Bangla)",
    type: "text",
    defaultValue: "এই ক্লাসটি দেখতে এক্সক্লুসিভ মেন্টরশিপ আনলক করুন।"
  },
  {
    key: "lesson.video_coming_soon",
    group: "Lesson",
    label: "No-video-yet placeholder",
    type: "text",
    defaultValue: "Video coming soon."
  },
  {
    key: "lesson.video_error",
    group: "Lesson",
    label: "Video playback error message",
    type: "text",
    defaultValue: "This video can't be played right now."
  },
  {
    key: "lesson.video_loading",
    group: "Lesson",
    label: "Video loading label",
    type: "text",
    defaultValue: "Loading video…"
  },
  {
    key: "lesson.watched_badge",
    group: "Lesson",
    label: "Watched badge",
    type: "text",
    defaultValue: "Watched — next class unlocked"
  },
  {
    key: "lesson.watch_prompt",
    group: "Lesson",
    label: "Unwatched prompt",
    type: "text",
    defaultValue: "Watch to the end to unlock the next class."
  },
  {
    key: "lesson.fallback_link",
    group: "Lesson",
    label: '"Not unlocking" fallback link',
    type: "text",
    defaultValue: "Video finished but not unlocking? Click here"
  },
  {
    key: "lesson.load_error",
    group: "Lesson",
    label: "Lesson load-error message",
    type: "text",
    defaultValue: "This lesson couldn't be loaded."
  },
  {
    key: "lesson.outline_error",
    group: "Lesson",
    label: "Outline load-error message",
    type: "text",
    defaultValue: "Couldn't load the course outline."
  },
  {
    key: "lesson.outline_loading",
    group: "Lesson",
    label: "Outline loading message",
    type: "text",
    defaultValue: "Loading outline…"
  },
  {
    key: "lesson.playlist_title",
    group: "Lesson",
    label: "Playlist panel title",
    type: "text",
    defaultValue: "Course content"
  },
  {
    key: "lesson.description_show_more",
    group: "Lesson",
    label: "Description \"Show more\" button",
    type: "text",
    defaultValue: "Show more"
  },
  {
    key: "lesson.description_show_less",
    group: "Lesson",
    label: "Description \"Show less\" button",
    type: "text",
    defaultValue: "Show less"
  },
  {
    key: "lesson.playlist_position",
    group: "Lesson",
    label: "Playlist position (use {current}, {total})",
    type: "text",
    defaultValue: "{current} / {total}"
  },

  {
    key: "profile.access_button",
    group: "Account menu",
    label: "Access button (paid users)",
    type: "text",
    defaultValue: "Access"
  },
  {
    key: "profile.unlock_button",
    group: "Account menu",
    label: "Unlock button (free users past the free classes)",
    type: "text",
    defaultValue: "Unlock Full Mentorship"
  },
  {
    key: "profile.logout_button",
    group: "Account menu",
    label: "Log out button",
    type: "text",
    defaultValue: "Log out"
  },

  {
    key: "footer.privacy_link",
    group: "Footer",
    label: "Privacy Policy link label",
    type: "text",
    defaultValue: "Privacy Policy"
  },
  {
    key: "footer.terms_link",
    group: "Footer",
    label: "Terms of Use link label",
    type: "text",
    defaultValue: "Terms of Use"
  },

  { key: "privacy.title", group: "Privacy page", label: "Title", type: "text", defaultValue: "Privacy Policy" },
  {
    key: "privacy.p1",
    group: "Privacy page",
    label: "Paragraph 1",
    type: "textarea",
    defaultValue:
      'Exclusive Mentorship ("we", "us", "our") collects only what\'s needed to run the mentorship: the email address you sign in with (by one-time code or Google Sign-In), your course progress (which classes you\'ve completed), and payment/order metadata for enrollment (order ID, amount, status, and confirmation time). We never see or store your card or crypto wallet contents — crypto payments are processed entirely by our payment provider, NOWPayments. If you contact support, we also keep the content of your messages and any images you attach, so we can help with your question.'
  },
  {
    key: "privacy.p2",
    group: "Privacy page",
    label: "Paragraph 2",
    type: "textarea",
    defaultValue:
      "Watching a class's video to the end is what unlocks the next class in the sequence — we record only that a video was completed, not detailed viewing analytics (we don't track how much of a video you watched, pausing/rewinding, or playback speed). This completion data is used solely to run the course structure and is visible to you in your own dashboard."
  },
  {
    key: "privacy.p3",
    group: "Privacy page",
    label: "Paragraph 3",
    type: "textarea",
    defaultValue:
      'We share the minimum data necessary with a small set of service providers to run the site: Resend (to deliver your login code and other account emails), NOWPayments (to process your crypto payment), Cloudflare Turnstile (to confirm you\'re not a bot when requesting a login code), and Google (only if you choose "Sign in with Google", to verify your identity). None of these providers may use your data for anything beyond providing that service to us.'
  },
  {
    key: "privacy.p4_prefix",
    group: "Privacy page",
    label: "Paragraph 4 (before the support email)",
    type: "textarea",
    defaultValue:
      "We keep your account data for as long as your account is active. Support conversations and expired login codes are deleted automatically after a short retention window; records of confirmed payments are kept indefinitely for financial and legal record-keeping. You may request access to, correction of, or deletion of your account and associated data at any time by contacting"
  },
  {
    key: "privacy.contact_email",
    group: "Privacy page",
    label: "Contact email",
    type: "text",
    defaultValue: "support@exclusivementorship.xyz"
  },

  { key: "terms.title", group: "Terms page", label: "Title", type: "text", defaultValue: "Terms of Use" },
  {
    key: "terms.p1",
    group: "Terms page",
    label: "Paragraph 1",
    type: "textarea",
    defaultValue:
      "Exclusive Mentorship provides educational content about trading concepts, market structure, and fundamental analysis. Nothing on this site is financial, investment, or trading advice, and no outcome, profit, or result is guaranteed. Trading involves substantial risk of loss, and you are solely responsible for any trading decisions you make."
  },
  {
    key: "terms.p2",
    group: "Terms page",
    label: "Paragraph 2",
    type: "textarea",
    defaultValue:
      "Enrollment in Exclusive Mentorship (currently $49 USDT, reference value $100 USDT) is a one-time payment that grants lifetime access to all premium lessons on this site, unlocked as soon as your payment is confirmed on-chain. Payments must be sent in USDT on the BEP20 network only, for the exact amount and to the address shown at checkout; each payment window is time-limited, and a new address is generated once it expires. We do not create, hold, or manage any cryptocurrency wallet on your behalf."
  },
  {
    key: "terms.p3_prefix",
    group: "Terms page",
    label: "Paragraph 3 (before the support email)",
    type: "textarea",
    defaultValue:
      "Payments are processed by our third-party payment provider, NOWPayments, and once your enrollment is confirmed it is generally non-refundable, given the nature of digital course access and cryptocurrency payments — if you believe you were charged in error, contact us as soon as possible. We may suspend or terminate access to your account for violating these terms (for example, sharing your login with others) or in cases of fraud or abuse. We may update these terms from time to time; continuing to use the site after a change means you accept the update. Questions about these terms can be sent to"
  },

  {
    key: "email.otp_subject",
    group: "Email — OTP",
    label: "Subject line",
    type: "text",
    defaultValue: "Your Exclusive Mentorship verification code"
  },
  { key: "email.otp_kicker", group: "Email — OTP", label: "Kicker", type: "text", defaultValue: "Next Level Trader" },
  {
    key: "email.otp_brand",
    group: "Email — OTP",
    label: "Brand line",
    type: "text",
    defaultValue: "Exclusive Mentorship"
  },
  {
    key: "email.otp_intro",
    group: "Email — OTP",
    label: "Intro line",
    type: "text",
    defaultValue: "Your verification code is:"
  },
  {
    key: "email.otp_expiry_note",
    group: "Email — OTP",
    label: "Expiry note",
    type: "text",
    defaultValue: "This code expires in 10 minutes and can only be used once."
  },
  {
    key: "email.otp_ignore_note",
    group: "Email — OTP",
    label: "Ignore note",
    type: "text",
    defaultValue: "If you didn't request this code, you can safely ignore this email."
  },

  {
    key: "email.reminder_subject",
    group: "Email — Checkout reminder",
    label: "Subject line",
    type: "text",
    defaultValue: "Your Exclusive Mentorship checkout is still open"
  },
  {
    key: "email.reminder_kicker",
    group: "Email — Checkout reminder",
    label: "Kicker",
    type: "text",
    defaultValue: "Next Level Trader"
  },
  {
    key: "email.reminder_brand",
    group: "Email — Checkout reminder",
    label: "Brand line",
    type: "text",
    defaultValue: "Exclusive Mentorship"
  },
  {
    key: "email.reminder_body",
    group: "Email — Checkout reminder",
    label: "Body copy",
    type: "textarea",
    defaultValue:
      "You started unlocking Exclusive Mentorship but the payment window closed before it went through. Your progress is saved — pick up right where you left off whenever you're ready."
  },
  {
    key: "email.reminder_cta",
    group: "Email — Checkout reminder",
    label: "CTA button",
    type: "text",
    defaultValue: "Resume checkout"
  },
  {
    key: "email.reminder_ignore_note",
    group: "Email — Checkout reminder",
    label: "Ignore note",
    type: "text",
    defaultValue: "If you've changed your mind, no action is needed — you can keep watching the free classes any time."
  },

  {
    key: "support.button_label",
    group: "Support chat",
    label: "Floating button tooltip",
    type: "text",
    defaultValue: "Support"
  },
  {
    key: "support.panel_title",
    group: "Support chat",
    label: "Panel header title",
    type: "text",
    defaultValue: "Support"
  },
  {
    key: "support.panel_subtitle",
    group: "Support chat",
    label: "Panel header subtitle (ticket list view)",
    type: "text",
    defaultValue: "We usually reply within a day"
  },
  {
    key: "support.empty_state",
    group: "Support chat",
    label: "No-conversations message",
    type: "text",
    defaultValue: "No conversations yet. Start one below."
  },
  {
    key: "support.new_ticket_button",
    group: "Support chat",
    label: '"New ticket" button',
    type: "text",
    defaultValue: "New ticket"
  },
  {
    key: "support.ticket_limit_message",
    group: "Support chat",
    label: '"Already have a ticket open" message',
    type: "text",
    defaultValue: "You already have an open conversation — close it to start a new one."
  },
  {
    key: "support.email_prompt_label",
    group: "Support chat",
    label: "Guest email field label",
    type: "text",
    defaultValue: "Your email"
  },
  {
    key: "support.email_prompt_note",
    group: "Support chat",
    label: "Guest email field helper note",
    type: "text",
    defaultValue: "So we can email you when we reply."
  },
  {
    key: "support.compose_placeholder",
    group: "Support chat",
    label: "New-ticket composer placeholder",
    type: "text",
    defaultValue: "Describe your issue…"
  },
  {
    key: "support.reply_placeholder",
    group: "Support chat",
    label: "Reply composer placeholder",
    type: "text",
    defaultValue: "Type a message…"
  },
  {
    key: "support.close_button",
    group: "Support chat",
    label: '"Close conversation" button',
    type: "text",
    defaultValue: "Close conversation"
  },
  {
    key: "support.close_confirm",
    group: "Support chat",
    label: "Close-conversation confirmation prompt",
    type: "text",
    defaultValue: "Close this conversation? You won't see it in your list anymore, but you can always start a new one."
  },

  {
    key: "notifications.panel_title",
    group: "Notifications",
    label: "Dropdown title",
    type: "text",
    defaultValue: "Notifications"
  },
  {
    key: "notifications.mark_all_read",
    group: "Notifications",
    label: '"Mark all read" button',
    type: "text",
    defaultValue: "Mark all read"
  },
  {
    key: "notifications.loading",
    group: "Notifications",
    label: "Loading label",
    type: "text",
    defaultValue: "Loading…"
  },
  {
    key: "notifications.empty_state",
    group: "Notifications",
    label: "Shown when there are no notifications",
    type: "text",
    defaultValue: "No notifications yet."
  }
];

export const CONTENT_DEFAULTS: Record<string, string> = Object.fromEntries(
  CONTENT_FIELDS.map((f) => [f.key, f.defaultValue])
);

export const CONTENT_GROUPS: string[] = Array.from(new Set(CONTENT_FIELDS.map((f) => f.group)));
