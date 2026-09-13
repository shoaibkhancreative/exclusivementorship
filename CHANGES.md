# তোমার সাইটে যা যা পরিবর্তন করা হয়েছে

## Security রিভিউয়ের ফলাফল

পুরো worker কোড (auth, admin auth, crypto, session/admin-session middleware, security headers, webhooks,
payments, Google OAuth verify, lessons/access-control, admin routes, db.ts এর সব query, support/admin-support,
notifications, bunny.ts video signing) খুঁটিয়ে দেখা হয়েছে। **কোনো critical security bug পাওয়া যায়নি।**
SQL সব জায়গায় parameterized, session token hash+HMAC করে রাখা হয়, timing-safe compare ব্যবহার হয়,
webhook signature verify হয়, admin routes সব গার্ডেড — এটা যথেষ্ট যত্ন নিয়ে লেখা কোড।

## যা ফিক্স/ইম্প্রুভ করা হয়েছে

### ১. `wrangler.jsonc` — সবচেয়ে বড় স্কেলিং ফিক্স

- **আগে:** `run_worker_first: true` — মানে প্রতিটা রিকোয়েস্ট (এমনকি JS/CSS/ছবির মতো static asset-ও)
  Worker invoke করত, যেটা Cloudflare Free প্ল্যানের দৈনিক ১,০০,০০০ রিকোয়েস্ট লিমিটের মধ্যে গোনা হয়।
  ভাইরাল ট্রাফিকে এই লিমিট পার হলে **পুরো সাইট (HTML সহ) 429 এরর দিতে শুরু করত** — এমনকি static asset request-ও, যেগুলো
  আসলে Cloudflare-এ normally ফ্রি ও আনলিমিটেড হওয়ার কথা।
- **এখন:** `run_worker_first: ["/api/*"]` — শুধু `/api/*` রিকোয়েস্ট Worker-এ যায় (rate limit, auth login,
  payment ইত্যাদির জন্য দরকার)। বাকি সব (HTML/JS/CSS/ছবি) সরাসরি Cloudflare-এর edge থেকে সার্ভ হয় — Worker touch-ই করে
  না, তাই ফ্রি ও আনলিমিটেড, ১,০০,০০০/দিন লিমিটের বাইরে।

### ২. `src/client/public/_headers` (নতুন ফাইল)

Worker bypass হয়ে যাওয়া মানে সেই responses-এ আগের CSP/HSTS/X-Frame-Options হেডার আর বসত না
(কারণ সেগুলো Worker মিডলওয়্যার থেকে আসত)। তাই Cloudflare-এর নেটিভ `_headers` ফাইল দিয়ে ঠিক একই security
header গুলো static asset response-এও বসানো হয়েছে — security একই থাকল, খরচ কমল।

### ৩. `src/worker/routes/lessons.ts` + `src/worker/lib/cache.ts`

`GET /api/lessons` (সবচেয়ে বেশি-হিট হওয়া endpoint — প্রতিটা হোমপেজ/ড্যাশবোর্ড লোডে কল হয়) আগে প্রতিবার সরাসরি
D1 থেকে পড়ত, কোনো cache ছাড়া। এখন lessons/chapters/free-lesson-count অংশটা (per-user progress বাদে) ২ মিনিটের
জন্য KV cache-এ থাকে — ঠিক `/config/public`-এর মতো প্যাটার্নে। D1 free প্ল্যানের row-read/write লিমিটের ওপর চাপ কমবে।

### ৪. `src/worker/routes/admin.ts`

উপরের cache invalidate করার জন্য প্রতিটা lesson/chapter create/update/delete/reorder/duplicate/bulk-action এর
পরে cache purge কল যোগ করা হয়েছে, যাতে admin কিছু বদলালে সাথে সাথে পাবলিক সাইটে দেখা যায়।

### ৫. `src/worker/routes/support.ts` + `src/worker/lib/config.ts`

Support ticket/message routes-এ (guest সহ, যেটা শুধু একটা self-issued cookie — কেউ চাইলে cookie ক্লিয়ার করে
বারবার নতুন identity বানাতে পারত) কোনো rate limit ছিল না, অথচ প্রতিটা মেসেজে ১.৫MB পর্যন্ত attachment যেতে পারে।
বাকি সব write-heavy endpoint (OTP, payment, video-token, admin login) rate-limited থাকলেও এটা বাদ পড়েছিল —
স্প্যাম/স্টোরেজ-abuse এর একটা real vector। এখন IP + identity দুই দিক থেকেই rate limit করা হয়েছে
(ticket তৈরি: ঘণ্টায় ১০/IP, ৫/identity; মেসেজ পাঠানো: ঘণ্টায় ৩০/identity)।

সব পরিবর্তন `tsc --noEmit` দিয়ে টাইপচেক করে দেখা হয়েছে (worker + client দুটোই ক্লিন পাস করেছে)।
