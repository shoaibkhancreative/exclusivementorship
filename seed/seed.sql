-- Exclusive Mentorship — seed content
-- Edit freely: this is the single place lesson content lives.
-- Replace youtube_video_id and thumbnail_url with real values before launch.
--
-- CURRICULUM STRUCTURE (Next Level Trader / Exclusive Mentorship)
-- =================================================================
-- 6 semesters, 38 classes total. Semester grouping + numbering/taglines are
-- defined once in src/worker/lib/semesters.ts and matched to lessons here by
-- `chapter_name` — do not rename a chapter_name value here without updating
-- that file too.
--
-- Every class is now a real on-site video lesson: free classes are hosted
-- as unlisted YouTube videos, paid classes on Bunny.net — either way the
-- admin pastes one ready-to-embed iframe URL per lesson into
-- `video_embed_url` (see the admin Lessons page / db.ts createLesson /
-- updateLesson). How many classes (in sequence) are free is fully
-- admin-editable too (Settings → Course, site_settings key
-- `free_lesson_count`) — nothing about "which classes are free" is
-- hardcoded in this file or in code.
--
-- Classes 7–38 below don't have a real video yet (this repo ships without
-- footage) — they're seeded with `video_embed_url` left NULL and
-- `is_active = 0` so they never appear half-broken on a fresh install.
-- Paste each one's real embed link into the admin Lessons page and flip it
-- active when its video is ready.
--
-- IMPORTANT — this full DELETE + re-INSERT is meant for a fresh/local/dev
-- database with no real users yet. Once real students have progress against
-- lesson ids 1–6, do NOT reseed a live database this way (re-inserting
-- reassigns ids and, via lesson_progress's ON DELETE CASCADE, would wipe
-- their progress). Use migrations/0006_curriculum_update_38_classes.sql
-- instead, which UPDATEs rows 1–6 in place (preserving id/progress) and only
-- INSERTs the new outline-only rows 7–38.

DELETE FROM lessons;

INSERT INTO lessons (lesson_number, title, chapter_name, thumbnail_url, youtube_video_id, description, tagline, is_free, is_active, sort_order, assignment_title, assignment_instruction) VALUES

-- ============================== SEMESTER 01 — FOUNDATION ==============================

(1, 'The Real Game of Trading', 'Foundation', '/thumbnails/lesson-01.jpg', 'REPLACE_YT_ID_1',
 'What trading actually is once you strip away the noise, and the small number of ideas everything else in this course builds on.',
 'Understand what trading really is before you chase the idea of making money from it.',
 1, 1, 1,
 'Frame your current approach',
 'In a few sentences, write down how you currently decide when to enter a trade. Be honest — this is only for you.'),

(2, 'Build Your Trading Account From Zero', 'Foundation', '/thumbnails/lesson-02.jpg', 'REPLACE_YT_ID_2',
 'Choosing a broker, understanding order types, and setting up your account the right way before any money is at risk.',
 'Set up the tools, account and execution basics you need to enter the market.',
 1, 1, 2,
 'Set up your workspace',
 'List the broker/platform you plan to use and take a screenshot of your account dashboard once it''s set up.'),

(3, 'Build Your Crypto Funding Setup', 'Foundation', '/thumbnails/lesson-03.jpg', 'REPLACE_YT_ID_3',
 'How custody, wallets, and on-chain payments actually work — the practical basics you need before enrolling in anything paid.',
 'Understand the essential crypto wallet and transfer process for modern trading.',
 1, 1, 3,
 'Confirm your wallet setup',
 'Install or confirm access to a USDT-compatible wallet and write one sentence on how you plan to keep it secure.'),

(4, 'Why Most Technical Analysis Fails', 'Foundation', '/thumbnails/lesson-04.jpg', 'REPLACE_YT_ID_4',
 'Why most retail chart patterns fail in practice, and what that tells you about who is really moving price.',
 'Discover why reading charts is not the same as understanding how price actually moves.',
 1, 1, 4,
 'Audit a past trade',
 'Look back at one recent trade that didn''t work out. Was it based on a textbook pattern? Write two sentences on what you''d question about it now.'),

-- ============================== SEMESTER 02 — TECHNICAL EDGE ==============================

(5, 'Where the Market Hunts Liquidity — Volume 1', 'Technical Edge', '/thumbnails/lesson-05.jpg', 'REPLACE_YT_ID_5',
 'An introduction to liquidity — where it rests, why it exists, and how it starts to explain price movement that retail analysis can''t.',
 'Start seeing the liquidity behind the moves most traders chase.',
 1, 1, 5,
 'Mark liquidity on a chart',
 'Open any chart you follow and mark two areas of obvious resting liquidity (equal highs or equal lows).'),

(6, 'The Trap Before the Move', 'Technical Edge', '/thumbnails/lesson-06.jpg', 'REPLACE_YT_ID_6',
 'This class is part of Exclusive Mentorship.',
 'Understand inducement and why the market often creates false commitment first.',
 0, 1, 6, NULL, NULL),

(7, 'The Footprints of Inefficiency', 'Technical Edge', '/thumbnails/lesson-07.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Learn how Fair Value Gaps reveal what price leaves behind.',
 0, 1, 7, NULL, NULL),

(8, 'Reading the Market''s Liquidity Map — Volume 2', 'Technical Edge', '/thumbnails/lesson-08.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Go deeper into how liquidity shapes the path of price.',
 0, 1, 8, NULL, NULL),

(9, 'The Blocks Behind Price Delivery', 'Technical Edge', '/thumbnails/lesson-09.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Understand the institutional blocks that can influence where price moves next.',
 0, 1, 9, NULL, NULL),

(10, 'Read the Market Like an Institution', 'Technical Edge', '/thumbnails/lesson-10.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Build a structural view of the market instead of reacting to isolated candles.',
 0, 1, 10, NULL, NULL),

(11, 'Premium, Discount & OTE', 'Technical Edge', '/thumbnails/lesson-11.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Learn where an opportunity becomes more meaningful within the range.',
 0, 1, 11, NULL, NULL),

(12, 'The Market''s Hidden Timing Framework', 'Technical Edge', '/thumbnails/lesson-12.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Understand how Power of Three and Quarterly Theory add timing to your analysis.',
 0, 1, 12, NULL, NULL),

(13, 'The Time Windows Behind Price Delivery', 'Technical Edge', '/thumbnails/lesson-13.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Explore how IPDA and 90-minute cycles can frame the market''s timing.',
 0, 1, 13, NULL, NULL),

(14, 'The Range That Shapes the Day', 'Technical Edge', '/thumbnails/lesson-14.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Discover how CBDR can provide important context before the trading day unfolds.',
 0, 1, 14, NULL, NULL),

(15, 'The Small Clues Behind Big Moves', 'Technical Edge', '/thumbnails/lesson-15.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Learn how ICT Macros can reveal short-term shifts hidden inside price action.',
 0, 1, 15, NULL, NULL),

(16, 'Read the Candle Range, Read the Reversal', 'Technical Edge', '/thumbnails/lesson-16.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Use Candle Range Theory to understand possible shifts in price delivery.',
 0, 1, 16, NULL, NULL),

-- ============================== SEMESTER 03 — FUNDAMENTAL EDGE ==============================

(17, 'Trade the Data, Not the Headline', 'Fundamental Edge', '/thumbnails/lesson-17.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Learn how to approach economic releases without becoming a victim of the news.',
 0, 1, 17, NULL, NULL),

(18, 'Understand Money Before You Trade It', 'Fundamental Edge', '/thumbnails/lesson-18.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Build a better foundation by understanding what gives money its value.',
 0, 1, 18, NULL, NULL),

(19, 'Who Controls the World''s Liquidity?', 'Fundamental Edge', '/thumbnails/lesson-19.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Understand the role major central banks play in global markets.',
 0, 1, 19, NULL, NULL),

(20, 'How Central Banks Move Markets', 'Fundamental Edge', '/thumbnails/lesson-20.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Learn the tools and mandates that shape monetary conditions.',
 0, 1, 20, NULL, NULL),

(21, 'Read the Macro Environment', 'Fundamental Edge', '/thumbnails/lesson-21.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Connect economic conditions to the bigger picture behind price movement.',
 0, 1, 21, NULL, NULL),

(22, 'Follow the Money Across Markets', 'Fundamental Edge', '/thumbnails/lesson-22.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Use inter-market relationships to understand what different markets are telling you.',
 0, 1, 22, NULL, NULL),

(23, 'See Where the Big Players Are Positioned', 'Fundamental Edge', '/thumbnails/lesson-23.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Learn how COT data can reveal positioning that price alone may not show.',
 0, 1, 23, NULL, NULL),

-- ============================== SEMESTER 04 — SYSTEM BUILDING ==============================

(24, 'Build Context Before You Trade', 'System Building', '/thumbnails/lesson-24.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Use Market Profiles to create a clearer picture before looking for an entry.',
 0, 1, 24, NULL, NULL),

(25, 'Decide the Direction Before the Entry', 'System Building', '/thumbnails/lesson-25.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Build a Weekly and Daily Bias so execution starts with a clear idea.',
 0, 1, 25, NULL, NULL),

(26, 'Build Your Own Trading Playbook', 'System Building', '/thumbnails/lesson-26.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Turn your knowledge into a personal trading plan you can actually follow.',
 0, 1, 26, NULL, NULL),

(27, 'Survive Long Enough to Become Consistent', 'System Building', '/thumbnails/lesson-27.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Build the risk framework that protects your capital and your decision-making.',
 0, 1, 27, NULL, NULL),

-- ============================== SEMESTER 05 — VALIDATION & PSYCHOLOGY ==============================

(28, 'Train the Trader, Not Just the Strategy', 'Validation & Psychology', '/thumbnails/lesson-28.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Develop the mindset required to follow your process when the market gets difficult.',
 0, 1, 28, NULL, NULL),

(29, 'Break the Habits That Sabotage Your Trades', 'Validation & Psychology', '/thumbnails/lesson-29.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Identify the psychological barriers that repeatedly damage execution.',
 0, 1, 29, NULL, NULL),

(30, 'Turn Every Trade Into Data', 'Validation & Psychology', '/thumbnails/lesson-30.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Use effective journaling to discover patterns, mistakes and opportunities for improvement.',
 0, 1, 30, NULL, NULL),

-- ============================== SEMESTER 06 — EXECUTION & PROP TRADING ==============================

(31, 'Trade When the Market Actually Moves', 'Execution & Prop Trading', '/thumbnails/lesson-31.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Learn how Sessions and Killzones can focus your execution around meaningful market activity.',
 0, 1, 31, NULL, NULL),

(32, 'Three High-Precision ICT Entry Models', 'Execution & Prop Trading', '/thumbnails/lesson-32.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Explore Unicorn, Turtle Soup and Venom as structured execution models.',
 0, 1, 32, NULL, NULL),

(33, 'Confirm the Shift Before You Commit', 'Execution & Prop Trading', '/thumbnails/lesson-33.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Use CISD, MSS and Sharp Turn to improve entry confirmation.',
 0, 1, 33, NULL, NULL),

(34, 'The Silver Bullet Setup', 'Execution & Prop Trading', '/thumbnails/lesson-34.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Understand one of ICT''s most recognizable time-based execution models.',
 0, 1, 34, NULL, NULL),

(35, 'Turn the Asian Range Into a Setup', 'Execution & Prop Trading', '/thumbnails/lesson-35.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Learn how the Asian session can become a structured execution framework.',
 0, 1, 35, NULL, NULL),

(36, 'From Personal Capital to Prop Capital', 'Execution & Prop Trading', '/thumbnails/lesson-36.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Understand how proprietary trading firms can fit into a trader''s journey.',
 0, 1, 36, NULL, NULL),

(37, 'Survive the Challenge', 'Execution & Prop Trading', '/thumbnails/lesson-37.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Learn the rules, constraints and common mistakes that can make or break a prop challenge.',
 0, 1, 37, NULL, NULL),

(38, 'Build a Prop-Firm-Ready Execution Plan', 'Execution & Prop Trading', '/thumbnails/lesson-38.jpg', 'N/A-TELEGRAM-DELIVERED',
 NULL,
 'Adapt your strategy, risk and execution process for the realities of prop trading.',
 0, 1, 38, NULL, NULL);

-- ---------------------------------------------------------------------------
-- video_embed_url backfill (same rule as migrations/0010): real embed URL
-- for classes that shipped with a real (or placeholder) YouTube id, NULL +
-- deactivated for the classes that don't have footage in this repo yet.
-- ---------------------------------------------------------------------------
UPDATE lessons
   SET video_embed_url = 'https://www.youtube-nocookie.com/embed/' || youtube_video_id
 WHERE youtube_video_id NOT IN ('N/A-TELEGRAM-DELIVERED')
   AND youtube_video_id NOT LIKE 'REPLACE_YT_ID%';

UPDATE lessons SET is_active = 0 WHERE youtube_video_id = 'N/A-TELEGRAM-DELIVERED';

-- ---------------------------------------------------------------------------
-- site_content — seeded defaults for every admin-editable page-copy string
-- (Phase 1 of the site-manager work). These are `value = NULL` rows, i.e.
-- "no admin override yet, use default_value" — exactly the strings that
-- were previously hardcoded in the client/worker source, copied verbatim
-- (no re-translation/wording changes). See src/worker/lib/content.ts,
-- which is the source of truth this block was generated from — if you add
-- a new content key there, add its seed row here too.
-- ---------------------------------------------------------------------------
INSERT INTO site_content (key, value, default_value) VALUES
('site.brand_name', NULL, 'Exclusive Mentorship'),
('topbar.nav_learn', NULL, 'Learn'),
('topbar.nav_login', NULL, 'Log in'),
('home.kicker', NULL, 'Next Level Trader'),
('home.headline', NULL, 'Exclusive Mentorship'),
('home.intro_video_fallback', NULL, 'Intro video coming soon'),
('home.body', NULL, 'A structured trading framework — market structure, liquidity, and price delivery. Start with the free lessons.'),
('home.cta_start', NULL, 'Start Learning'),
('unlock.title', NULL, 'You''ve completed the free foundation.'),
('unlock.description', NULL, 'The next lessons are part of Exclusive Mentorship — the full framework for intraday execution, risk management, and building a personal trading process.'),
('unlock.pdf_link_label', NULL, 'View mentorship details (PDF)'),
('unlock.price_currency_suffix', NULL, 'USDT'),
('unlock.price_discount_suffix', NULL, 'off today'),
('unlock.cta', NULL, 'Unlock Exclusive Mentorship'),
('access.badge', NULL, 'Payment successful'),
('access.title', NULL, 'Welcome to Exclusive Mentorship.'),
('access.description', NULL, 'Your mentorship is now unlocked — every class is available right away.'),
('access.cta', NULL, 'Go to your lessons'),
('login.email_title', NULL, 'Log in'),
('login.email_subtitle', NULL, 'We''ll email you a one-time code. No password needed.'),
('login.google_divider', NULL, 'or'),
('login.email_label', NULL, 'Email'),
('login.email_placeholder', NULL, 'you@example.com'),
('login.send_otp_button', NULL, 'Send OTP'),
('login.send_otp_button_loading', NULL, 'Sending…'),
('login.otp_title', NULL, 'Enter the code'),
('login.otp_subtitle', NULL, 'Enter the 6-digit code sent to {email}'),
('login.verify_button', NULL, 'Verify & Continue'),
('login.verify_button_loading', NULL, 'Verifying…'),
('login.resend_button', NULL, 'Resend code'),
('login.resend_button_cooldown', NULL, 'Resend code in {seconds}s'),
('learn.progress_kicker', NULL, 'Your progress'),
('learn.progress_label', NULL, 'classes completed'),
('learn.continue_label', NULL, 'Continue'),
('learn.completed_message', NULL, 'All classes completed — you''ve finished the course.'),
('learn.load_error', NULL, 'Couldn''t load your classes.'),
('learn.retry_button', NULL, 'Retry'),
('lesson.nav_previous', NULL, '← Previous'),
('lesson.nav_next', NULL, 'Next →'),
('lesson.nav_next_title_last', NULL, 'This is the last class in the course'),
('lesson.locked_payment_title', NULL, 'This class is part of Exclusive Mentorship'),
('lesson.locked_payment_subtitle', NULL, 'Tap play to unlock and continue.'),
('lesson.locked_sequence_title', NULL, 'Finish your previous class first'),
('lesson.locked_sequence_subtitle', NULL, 'Complete the class before this one to unlock it.'),
('lesson.continue_button', NULL, 'Continue where you left off →'),
('lesson.video_coming_soon', NULL, 'Video coming soon.'),
('lesson.watched_badge', NULL, 'Watched — next class unlocked'),
('lesson.watch_prompt', NULL, 'Watch to the end to unlock the next class.'),
('lesson.fallback_link', NULL, 'Video finished but not unlocking? Click here'),
('lesson.load_error', NULL, 'This lesson couldn''t be loaded.'),
('lesson.outline_error', NULL, 'Couldn''t load the course outline.'),
('lesson.outline_loading', NULL, 'Loading outline…'),
('profile.access_button', NULL, 'Access'),
('profile.unlock_button', NULL, 'Unlock Full Mentorship'),
('profile.logout_button', NULL, 'Log out'),
('footer.privacy_link', NULL, 'Privacy Policy'),
('footer.terms_link', NULL, 'Terms of Use'),
('privacy.title', NULL, 'Privacy Policy'),
('privacy.p1', NULL, 'Exclusive Mentorship ("we", "us", "our") collects only what''s needed to run the mentorship: the email address you sign in with (by one-time code or Google Sign-In), your course progress (which classes you''ve completed), and payment/order metadata for enrollment (order ID, amount, status, and confirmation time). We never see or store your card or crypto wallet contents — crypto payments are processed entirely by our payment provider, NOWPayments. If you contact support, we also keep the content of your messages and any images you attach, so we can help with your question.'),
('privacy.p2', NULL, 'Watching a class''s video to the end is what unlocks the next class in the sequence — we record only that a video was completed, not detailed viewing analytics (we don''t track how much of a video you watched, pausing/rewinding, or playback speed). This completion data is used solely to run the course structure and is visible to you in your own dashboard.'),
('privacy.p3', NULL, 'We share the minimum data necessary with a small set of service providers to run the site: Resend (to deliver your login code and other account emails), NOWPayments (to process your crypto payment), Cloudflare Turnstile (to confirm you''re not a bot when requesting a login code), and Google (only if you choose "Sign in with Google", to verify your identity). None of these providers may use your data for anything beyond providing that service to us.'),
('privacy.p4_prefix', NULL, 'We keep your account data for as long as your account is active. Support conversations and expired login codes are deleted automatically after a short retention window; records of confirmed payments are kept indefinitely for financial and legal record-keeping. You may request access to, correction of, or deletion of your account and associated data at any time by contacting'),
('privacy.contact_email', NULL, 'support@exclusivementorship.xyz'),
('terms.title', NULL, 'Terms of Use'),
('terms.p1', NULL, 'Exclusive Mentorship provides educational content about trading concepts, market structure, and fundamental analysis. Nothing on this site is financial, investment, or trading advice, and no outcome, profit, or result is guaranteed. Trading involves substantial risk of loss, and you are solely responsible for any trading decisions you make.'),
('terms.p2', NULL, 'Enrollment in Exclusive Mentorship (currently $49 USDT, reference value $100 USDT) is a one-time payment that grants lifetime access to all premium lessons on this site, unlocked as soon as your payment is confirmed on-chain. Payments must be sent in USDT on the BEP20 network only, for the exact amount and to the address shown at checkout; each payment window is time-limited, and a new address is generated once it expires. We do not create, hold, or manage any cryptocurrency wallet on your behalf.'),
('terms.p3_prefix', NULL, 'Payments are processed by our third-party payment provider, NOWPayments, and once your enrollment is confirmed it is generally non-refundable, given the nature of digital course access and cryptocurrency payments — if you believe you were charged in error, contact us as soon as possible. We may suspend or terminate access to your account for violating these terms (for example, sharing your login with others) or in cases of fraud or abuse. We may update these terms from time to time; continuing to use the site after a change means you accept the update. Questions about these terms can be sent to'),
('email.otp_subject', NULL, 'Your Exclusive Mentorship verification code'),
('email.otp_kicker', NULL, 'Next Level Trader'),
('email.otp_brand', NULL, 'Exclusive Mentorship'),
('email.otp_intro', NULL, 'Your verification code is:'),
('email.otp_expiry_note', NULL, 'This code expires in 10 minutes and can only be used once.'),
('email.otp_ignore_note', NULL, 'If you didn''t request this code, you can safely ignore this email.');