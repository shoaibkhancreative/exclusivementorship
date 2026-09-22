import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { useConfig } from "../lib/useConfig";
import { ProfileMenu } from "./ProfileMenu";

function BrandMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 6.5c-1.7-1.3-4-1.8-6.2-1.3-.5.1-.8.6-.8 1.1v10.4c0 .7.6 1.1 1.2 1 2-.4 4.1 0 5.8 1.2 1.7-1.2 3.8-1.6 5.8-1.2.6.1 1.2-.3 1.2-1V6.3c0-.5-.3-1-.8-1.1-2.2-.5-4.5 0-6.2 1.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 6.5v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar() {
  const { me } = useSession();
  const { t } = useContent();
  const config = useConfig();
  const { pathname } = useLocation();
  const [logoBroken, setLogoBroken] = useState(false);

  const isLessonPage = pathname.startsWith("/lesson");
  const isWideContentPage =
    pathname.startsWith("/learn") || isLessonPage || (pathname === "/" && Boolean(me?.authenticated));
  const containerWidthClass = isLessonPage
    ? "max-w-[min(96vw,1920px)]"
    : isWideContentPage
      ? "max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]"
      : "max-w-4xl";

  return (
    <header className="sticky top-0 z-40 border-b border-base-800 bg-base-950/85 shadow-sm shadow-black/50 backdrop-blur-md">
      <div className={`mx-auto flex items-center justify-between px-4 py-2.5 sm:px-5 sm:py-3 ${containerWidthClass}`}>
        <Link
          to="/"
          className="focus-ring flex min-w-0 items-center gap-2.5 rounded-full text-[15px] font-semibold tracking-tight text-zinc-100"
        >
          {config?.siteLogoUrl && !logoBroken ? (
            <img
              src={config.siteLogoUrl}
              alt={t("site.brand_name")}
              decoding="async"
              className="h-5 w-auto shrink-0"
              onError={() => setLogoBroken(true)}
            />
          ) : (
            <>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-accent-500">
                <BrandMark />
              </span>
              <span className="truncate">{t("site.brand_name")}</span>
            </>
          )}
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {me?.authenticated ? (
            <>
              <Link
                to="/"
                className="focus-ring rounded-full px-2.5 py-1.5 text-zinc-400 transition-colors hover:bg-base-800 hover:text-zinc-100"
              >
                {t("topbar.nav_home")}
              </Link>
              <ProfileMenu />
            </>
          ) : (
            <Link
              to="/login"
              className="focus-ring rounded-full px-3.5 py-1.5 text-zinc-200 transition-colors hover:bg-base-800 hover:text-accent-400"
            >
              {t("topbar.nav_login")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
