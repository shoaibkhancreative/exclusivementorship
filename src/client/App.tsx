import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./lib/SessionContext";
import { UnlockModalProvider } from "./lib/UnlockModalContext";
import { useConfig } from "./lib/useConfig";
import { useContent } from "./lib/useContent";
import { TopBar } from "./components/TopBar";
import { SupportButton } from "./components/SupportButton";
import { LoadingScreen } from "./components/ui";
import Home from "./pages/Home";

const Login = lazy(() => import("./pages/Login"));
const Learn = lazy(() => import("./pages/Learn"));
const Lesson = lazy(() => import("./pages/Lesson"));
const Access = lazy(() => import("./pages/Access"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const AdminApp = lazy(() => import("./admin/AdminApp"));

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  return children;
}

function RootRoute() {
  const { me, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (me?.authenticated) return <Learn />;
  return <Home />;
}

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
    const link =
      (document.querySelector("link[rel='icon']") as HTMLLinkElement | null) ?? document.createElement("link");
    link.rel = "icon";
    link.href = config.siteFaviconUrl;
    if (!link.parentNode) document.head.appendChild(link);
  }, [config?.siteFaviconUrl]);

  return null;
}

function StudentApp() {
  return (
    <SessionProvider>
      <UnlockModalProvider>
        <SiteChrome />
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <main className="flex-1">
            <Suspense fallback={<LoadingScreen />}>
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
                <Route path="/unlock" element={<Navigate to="/learn" replace />} />
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
            </Suspense>
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
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<LoadingScreen />}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="/*" element={<StudentApp />} />
    </Routes>
  );
}
