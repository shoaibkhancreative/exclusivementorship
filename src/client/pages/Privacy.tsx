export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-14 text-sm leading-relaxed text-zinc-400">
      <h1 className="mb-7 text-2xl text-zinc-50">Privacy Policy</h1>
      <p className="mb-4">
        Exclusive Mentorship ("we", "us") collects only what's needed to run the mentorship: your email
        address, your lesson progress, and payment/order metadata (never your card or wallet contents — crypto
        payments are processed by NOWPayments).
      </p>
      <p className="mb-4">
        Watching a class's video to the end unlocks the next class in the sequence — we record that a video was
        completed, not any video-viewing analytics beyond that.
      </p>
      <p className="mb-4">
        We use Resend to deliver login codes by email and NOWPayments to process crypto payments. Each of those
        providers processes the minimum data required for that function. A support button on the site links out
        to Telegram for support conversations only — no mentorship content or access is delivered through it.
      </p>
      <p className="mb-4">
        You may request deletion of your account and associated data at any time by contacting{" "}
        <a className="text-accent-400 hover:underline" href="mailto:support@exclusivementorship.xyz">
          support@exclusivementorship.xyz
        </a>
        .
      </p>
      <p className="text-xs text-zinc-500">
        TODO: replace this placeholder with counsel-reviewed privacy language before launch.
      </p>
    </div>
  );
}
