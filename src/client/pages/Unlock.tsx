import { useConfig } from "../lib/useConfig";
import { Button, Card, LoadingScreen } from "../components/ui";
import { useUnlockModal } from "../lib/UnlockModalContext";

/**
 * The calm transition between the free foundation and the paid checkout —
 * this is "the most important conversion screen" per the product spec:
 * no aggressive sales copy, just a plain acknowledgement that the free
 * foundation is complete, an optional PDF with the full mentorship details,
 * and a transparent Reference/Enrollment price framing. The actual crypto
 * checkout (address/QR/status polling) lives in UnlockModal — this page's
 * only job is to show the offer honestly before that popup ever opens.
 */
export default function Unlock() {
  const config = useConfig();
  const { openUnlockModal } = useUnlockModal();

  if (!config) return <LoadingScreen />;

  return (
    <div className="page-enter mx-auto max-w-lg px-6 py-16 sm:px-8">
      <div className="mb-10 text-center">
        <h1 className="text-[26px] font-semibold leading-snug text-zinc-50 sm:text-[28px]">
          You've completed the free foundation.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-zinc-400">
          The next lessons are part of Exclusive Mentorship — the full framework for intraday execution, risk
          management, and building a personal trading process.
        </p>
      </div>

      {config.mentorshipPdfUrl && (
        <div className="mb-8 text-center">
          <a
            href={config.mentorshipPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-block text-sm text-accent-400 hover:underline"
          >
            View mentorship details (PDF)
          </a>
        </div>
      )}

      <Card className="text-center">
        <div className="mb-3 flex items-baseline justify-center gap-2">
          <span className="text-3xl font-semibold text-zinc-50">${config.enrollmentPrice}</span>
          <span className="text-sm text-zinc-500 line-through">${config.referencePrice}</span>
        </div>
        <div className="mb-7 text-sm text-zinc-500">USDT · {config.discountPercent}% off today</div>

        <Button onClick={openUnlockModal} className="w-full">
          Unlock Exclusive Mentorship
        </Button>
      </Card>
    </div>
  );
}
