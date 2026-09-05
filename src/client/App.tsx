import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./lib/SessionContext";
import { UnlockModalProvider } from "./lib/UnlockModalContext";
import { TopBar } from "./components/TopBar";
import { SupportButton } from "./components/SupportButton";
import { LoadingScreen } from "./components/ui";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Learn from "./pages/Learn";
import Lesson from "./pages/Lesson";
import Unlock from "./pages/Unlock";
import Access from "./pages/Access";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (!me?.authenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <SessionProvider>
      <UnlockModalProvider>
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
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
              {/* /unlock is the calm "premium reveal" transition (reference
                  price, PDF, honest discount framing) shown before the actual
                  crypto checkout popup ever opens — see product spec §14. */}
              <Route
                path="/unlock"
                element={
                  <RequireAuth>
                    <Unlock />
                  </RequireAuth>
                }
              />
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
