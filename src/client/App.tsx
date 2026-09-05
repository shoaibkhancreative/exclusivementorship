import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./lib/SessionContext";
import { TopBar } from "./components/TopBar";
import { LoadingScreen } from "./components/ui";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Learn from "./pages/Learn";
import Lesson from "./pages/Lesson";
import Unlock from "./pages/Unlock";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentPending from "./pages/PaymentPending";
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
            <Route
              path="/unlock"
              element={
                <RequireAuth>
                  <Unlock />
                </RequireAuth>
              }
            />
            <Route path="/payment/success" element={<PaymentSuccess />} />
            <Route path="/payment/pending" element={<PaymentPending />} />
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
      </div>
    </SessionProvider>
  );
}
