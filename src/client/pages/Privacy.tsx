export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-14 text-sm leading-relaxed text-zinc-400">
      <h1 className="mb-6 text-xl font-semibold text-zinc-50">Privacy Policy</h1>
      <p className="mb-4">
        Exclusive Mentorship ("we", "us") collects only what's needed to run the mentorship: your email
        address, your lesson progress, and payment/order metadata (never your card or wallet contents — crypto
        payments are processed by NOWPayments).
      </p>
      <p className="mb-4">
        Assignment "uploads" are not stored — only the fact that you submitted an assignment is recorded, to
        unlock your next lesson.
      </p>
      <p className="mb-4">
        We use Resend to deliver login codes by email, NOWPayments to process crypto payments, and Telegram to
        deliver mentorship access after enrollment. Each of those providers processes the minimum data required
        for that function.
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
