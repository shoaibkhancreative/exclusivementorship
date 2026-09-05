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
    <div className="mx-auto max-w-xl px-6 py-14">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-zinc-50">You've completed the free foundation.</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          The next lessons are part of Exclusive Mentorship — the full framework for intraday execution, risk
          management, and building a personal trading process.
        </p>
      </div>

      {config.mentorshipPdfUrl && (
        <Card className="mb-6 text-center">
          <a
            href={config.mentorshipPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-block text-sm text-accent-400 hover:underline"
          >
            View Mentorship Details PDF
          </a>
        </Card>
      )}

      <Card className="text-center">
        <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Premium Enrollment</div>
        <div className="mb-1 text-sm text-zinc-500 line-through">Reference Value: ${config.referencePrice} USDT</div>
        <div className="mb-1 text-3xl font-semibold text-zinc-50">${config.enrollmentPrice} USDT</div>
        <div className="mb-6 text-xs font-medium text-accent-400">{config.discountPercent}% OFF</div>

        <Button onClick={openUnlockModal} className="w-full">
          Unlock Exclusive Mentorship
        </Button>
      </Card>
    </div>
  );
}
