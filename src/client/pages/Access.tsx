import { Link } from "react-router-dom";
import { Button } from "../components/ui";
import { useContent } from "../lib/useContent";
import { useLayout } from "../lib/useLayout";

const DEFAULT_ORDER = ["badge", "title", "description", "cta"];

export default function Access() {
  const { t } = useContent();
  const { getBlockOrder } = useLayout();

  const blocks: Record<string, React.ReactNode> = {
    badge: (
      <p key="badge" className="mb-2 text-sm font-medium text-accent-400">
        {t("access.badge")}
      </p>
    ),
    title: (
      <h1 key="title" className="text-2xl font-semibold text-zinc-50">
        {t("access.title")}
      </h1>
    ),
    description: (
      <p key="description" className="mt-2 text-sm text-zinc-400">
        {t("access.description")}
      </p>
    ),
    cta: (
      <Link key="cta" to="/learn" className="mt-8 block">
        <Button className="w-full">{t("access.cta")}</Button>
      </Link>
    )
  };

  const order = getBlockOrder("access", DEFAULT_ORDER);

  return <div className="page-enter mx-auto max-w-lg px-6 py-16 text-center">{order.map((id) => blocks[id] ?? null)}</div>;
}
