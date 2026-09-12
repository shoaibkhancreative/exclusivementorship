import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./lib/SessionContext";
import { UnlockModalProvider } from "./lib/UnlockModalContext";
import { useConfig } from "./lib/useConfig";
import { useContent } from "./lib/useContent";
import { TopBar } from "./components/TopBar";
import { SupportButton } from "./components/SupportButton";
import { LoadingScreen } from "./components/ui";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Learn from "./pages/Learn";
import Lesson from "./pages/Lesson";
import Access from "./pages/Access";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import AdminApp from "./admin/AdminApp";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  return children;
}

/**
 * The "/" route. Logged-out visitors get the marketing homepage. Logged-in
 * users skip it entirely and land straight on the Learn page — the Learn
 * page effectively *is* the homepage once you're signed in, with no
 * separate authenticated-homepage route or client-side redirect bounce.
 */
function RootRoute() {
  const { me, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (me?.authenticated) return <Learn />;
  return <Home />;
}

/**
 * Sets the browser tab title and favicon from admin-editable values (Phase
 * 4: site.brand_name / Settings → siteFaviconUrl), falling back to
 * whatever's already in index.html when neither is set — this never
 * touches other <head> meta tags (OG/SEO tags are explicitly out of scope
 * for this work), just the tab title and the favicon <link>.
 */
function SiteChrome() {
  const config = useConfig();
  const { t, loaded } = useContent();

  useEffect(() => {
    if (!loaded) return;
    const brandName = t("site.brand_name");
    if (brandName) document.title = brandName;
  }, [loaded, t]);

  useEffect(() => {
    if (!config?.siteFaviconUrl) return;
    const link = (document.querySelector("link[rel='icon']") as HTMLLinkElement | null) ?? document.createElement("link");
    link.rel = "icon";
    link.href = config.siteFaviconUrl;
    if (!link.parentNode) document.head.appendChild(link);
  }, [config?.siteFaviconUrl]);

  return null;
}

/**
 * The original student-facing app tree, unchanged in behavior — just moved
 * into its own component so /admin/* (see App() below) can render a
 * completely separate tree without the student SessionProvider, TopBar, or
 * SupportButton anywhere near it.
 */
function StudentApp() {
  return (
    <SessionProvider>
      <UnlockModalProvider>
        <SiteChrome />
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<RootRoute />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/learn"
                element={
                  <RequireAuth>
                    <Learn />
                  </RequireAuth>
                }
              />
              <Route
                path="/lesson/:id"
                element={
                  <RequireAuth>
                    <Lesson />
                  </RequireAuth>
                }
              />
              {/* There is no standalone "/unlock" page anymore — every
                  "Unlock Mentorship" / "Unlock Now" trigger anywhere in the
                  app (Dashboard CTA, locked-class prompt, ProfileMenu
                  button) opens the checkout popup directly via
                  useUnlockModal().openUnlockModal(). Old bookmarks/emails
                  pointing at /unlock still land somewhere useful instead of
                  404ing — redirect to the Dashboard, where the same
                  state-driven Unlock CTA lives (see pages/Learn.tsx). */}
              <Route path="/unlock" element={<Navigate to="/learn" replace />} />
              {/* Old /payment/* links (from a prior checkout design) no longer
                  correspond to real pages — status is now shown inside the
                  closable checkout popup itself. Redirect instead of 404ing. */}
              <Route path="/payment/success" element={<Navigate to="/learn" replace />} />
              <Route path="/payment/pending" element={<Navigate to="/learn" replace />} />
              <Route
                path="/access"
                element={
                  <RequireAuth>
                    <Access />
                  </RequireAuth>
                }
              />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <SupportButton />
        </div>
      </UnlockModalProvider>
    </SessionProvider>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Admin panel: its own session system (em_admin_session cookie),
          own layout, own login page — deliberately never wrapped by the
          student SessionProvider/TopBar/SupportButton above. */}
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/*" element={<StudentApp />} />
    </Routes>
  );
}
