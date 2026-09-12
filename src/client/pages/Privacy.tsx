import { useContent } from "../lib/useContent";

export default function Privacy() {
  const { t } = useContent();
  return (
    <div className="page-enter mx-auto max-w-2xl px-6 py-14 text-sm leading-relaxed text-zinc-400">
      <h1 className="mb-7 text-2xl text-zinc-50">{t("privacy.title")}</h1>
      <p className="mb-4">{t("privacy.p1")}</p>
      <p className="mb-4">{t("privacy.p2")}</p>
      <p className="mb-4">{t("privacy.p3")}</p>
      <p className="mb-4">
        {t("privacy.p4_prefix")}{" "}
        <a className="text-accent-400 hover:underline" href={`mailto:${t("privacy.contact_email")}`}>
          {t("privacy.contact_email")}
        </a>
        .
      </p>
    </div>
  );
}