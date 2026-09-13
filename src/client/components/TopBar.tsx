import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { useConfig } from "../lib/useConfig";
import { ProfileMenu } from "./ProfileMenu";

// Flat, single-stroke "mentor" mark — an open book standing in for guided
// learning. Deliberately hand-drawn/rounded rather than a sharp corporate
// glyph, and only ever tinted with the brand accent, matching the same
// currentColor/rounded-stroke language as the small icons elsewhere on the
// site (see OutlineList's Lock/Check/Play glyphs). Only shown as a stand-in
// for a real logo — the moment an admin sets siteLogoUrl this disappears.
function BrandMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <header className="sticky top-0 z-40 border-b border-base-800 bg-base-950/85 shadow-sm shadow-base-800/20 backdrop-blur-md">
      <div className={`mx-auto flex items-center justify-between px-5 py-4 sm:px-6 ${containerWidthClass}`}>
        <Link to="/" className="focus-ring flex items-center gap-2.5 rounded-full text-[15px] font-semibold tracking-tight text-zinc-100">
          {/* Logo is optional (Phase 4) — an admin can paste a URL from
              Settings and it replaces the plain text brand name; until
              then a soft rounded chip with a flat brand mark stands in for
              it, so the wordmark is never left floating on its own. */}
          {config?.siteLogoUrl && !logoBroken ? (
            <img src={config.siteLogoUrl} alt={t("site.brand_name")} className="h-6 w-auto" onError={() => setLogoBroken(true)} />
          ) : (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-accent-500">
                <BrandMark />
              </span>
              <span>{t("site.brand_name")}</span>
            </>
          )}
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {me?.authenticated ? (
            <>
              {/* A separate, explicit way back to the dashboard — not
                  everyone realizes the logo itself is clickable. A soft
                  pill on hover instead of bare underline-less text keeps
                  it in the same rounded, friendly shape-language as the
                  buttons and chips elsewhere on the site. */}
              <Link
                to="/"
                className="focus-ring rounded-full px-3 py-1.5 text-zinc-400 transition-colors hover:bg-base-800 hover:text-zinc-100"
              >
                {t("topbar.nav_home")}
              </Link>
              <ProfileMenu />
            </>
          ) : (
            <Link
              to="/login"
              className="focus-ring rounded-full px-4 py-1.5 text-zinc-200 transition-colors hover:bg-base-800 hover:text-accent-400"
            >
              {t("topbar.nav_login")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}