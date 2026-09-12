import { useConfig } from "../lib/useConfig";
import { useContent } from "../lib/useContent";
import { useLayout } from "../lib/useLayout";
import { Button, Card, LoadingScreen } from "../components/ui";
import { useUnlockModal } from "../lib/UnlockModalContext";

const DEFAULT_ORDER = ["intro", "pdf_link", "price_card"];

/**
 * The calm transition between the free foundation and the paid checkout —
 * this is "the most important conversion screen" per the product spec:
 * no aggressive sales copy, just a plain acknowledgement that the free
 * foundation is complete, an optional PDF with the full mentorship details,
 * and a transparent Reference/Enrollment price framing. The actual crypto
 * checkout (address/QR/status polling) lives in UnlockModal — this page's
 * only job is to show the offer honestly before that popup ever opens.
 *
 * "intro" keeps the title and description as one block (rather than two)
 * so reordering/hiding from the admin Sections page can't separate a
 * headline from its own subtitle — each is still independently editable as
 * text via the admin Content page, just not independently reorderable.
 */
export default function Unlock() {
  const config = useConfig();
  const { t } = useContent();
  const { getBlockOrder } = useLayout();
  const { openUnlockModal } = useUnlockModal();

  if (!config) return <LoadingScreen />;

  const blocks: Record<string, React.ReactNode> = {
    intro: (
      <div key="intro" className="mb-10 text-center">
        <h1 className="text-[26px] font-semibold leading-snug text-zinc-50 sm:text-[28px]">{t("unlock.title")}</h1>
        <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-zinc-400">{t("unlock.description")}</p>
      </div>
    ),
    pdf_link: config.mentorshipPdfUrl ? (
      <div key="pdf_link" className="mb-8 text-center">
        <a
          href={config.mentorshipPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-block text-sm text-accent-400 hover:underline"
        >
          {t("unlock.pdf_link_label")}
        </a>
      </div>
    ) : null,
    price_card: (
      <Card key="price_card" className="text-center">
        <div className="mb-3 flex items-baseline justify-center gap-2">
          <span className="text-3xl font-semibold text-zinc-50">${config.enrollmentPrice}</span>
          <span className="text-sm text-zinc-500 line-through">${config.referencePrice}</span>
        </div>
        <div className="mb-7 text-sm text-zinc-500">
          {t("unlock.price_currency_suffix")} · {config.discountPercent}% {t("unlock.price_discount_suffix")}
        </div>

        <Button onClick={openUnlockModal} className="w-full">
          {t("unlock.cta")}
        </Button>
        <p className="mt-3 text-xs text-zinc-500">{t("unlock.access_reassurance")}</p>
      </Card>
    )
  };

  const order = getBlockOrder("unlock", DEFAULT_ORDER);

  return (
    <div className="page-enter mx-auto max-w-lg px-6 py-16 sm:px-8">{order.map((id) => blocks[id] ?? null)}</div>
  );
}
