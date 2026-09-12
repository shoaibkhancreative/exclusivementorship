import { Link } from "react-router-dom";
import { useContent } from "../lib/useContent";

/**
 * Footer shown only on the Dashboard (Learn) page — see pages/Learn.tsx.
 * Deliberately not global: on every other page (Home, Login, Lesson,
 * Access) it would just be a distraction, so this is the only place
 * /privacy and /terms are ever linked from.
 */
export function Footer() {
  const { t } = useContent();

  return (
    <footer className="border-t border-base-800 py-8">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 px-5 text-xs text-zinc-500 sm:flex-row sm:justify-between sm:px-6">
        <span>
          © {new Date().getFullYear()} {t("site.brand_name")}
        </span>
        <nav className="flex items-center gap-5">
          <Link to="/privacy" className="focus-ring rounded transition-colors hover:text-zinc-300">
            {t("footer.privacy_link")}
          </Link>
          <Link to="/terms" className="focus-ring rounded transition-colors hover:text-zinc-300">
            {t("footer.terms_link")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}