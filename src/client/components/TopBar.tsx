import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { useConfig } from "../lib/useConfig";
import { ProfileMenu } from "./ProfileMenu";

export function TopBar() {
  const { me } = useSession();
  const { t } = useContent();
  const config = useConfig();
  const { pathname } = useLocation();
  const [logoBroken, setLogoBroken] = useState(false);

  // The Dashboard (Learn, rendered at both "/" once logged in and "/learn")
  // and Lesson pages use a wider content stage (max-w-6xl, growing further
  // at xl/2xl) than every other page (max-w-4xl) — see Learn.tsx/Lesson.tsx.
  // The header used to stay a fixed max-w-4xl everywhere, which made it
  // visibly narrower than the content it sits above on those two pages.
  // Matching the header's max-width to whichever page is actually showing
  // keeps the header edge-aligned with the content edge on every page,
  // instead of hardcoding one width for all of them.
  const isWideContentPage =
    pathname.startsWith("/learn") || pathname.startsWith("/lesson") || (pathname === "/" && Boolean(me?.authenticated));
  const containerWidthClass = isWideContentPage ? "max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]" : "max-w-4xl";

  return (
    // Sticky + a translucent brand-cream backdrop: on scroll the header
    // stays put and content passes gently underneath it instead of
    // scrolling away and reappearing.
    <header className="sticky top-0 z-40 border-b border-base-800 bg-base-950/85 backdrop-blur-md">
      <div className={`mx-auto flex items-center justify-between px-5 py-5 sm:px-6 ${containerWidthClass}`}>
        <Link to="/" className="focus-ring flex items-center gap-2 rounded text-[15px] font-semibold tracking-tight text-zinc-100">
          {/* Logo is optional (Phase 4) — an admin can paste a URL from
              Settings and it replaces the plain text brand name; until
              then this renders exactly as before. */}
          {config?.siteLogoUrl && !logoBroken ? (
            <img src={config.siteLogoUrl} alt={t("site.brand_name")} className="h-6 w-auto" onError={() => setLogoBroken(true)} />
          ) : (
            t("site.brand_name")
          )}
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          {me?.authenticated ? (
            <>
              {/* A separate, explicit way back to the dashboard — not
                  everyone realizes the logo itself is clickable. */}
              <Link to="/" className="focus-ring rounded text-zinc-400 transition-colors hover:text-zinc-100">
                {t("topbar.nav_home")}
              </Link>
              <ProfileMenu />
            </>
          ) : (
            <Link to="/login" className="focus-ring rounded text-zinc-200 transition-colors hover:text-accent-400">
              {t("topbar.nav_login")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}