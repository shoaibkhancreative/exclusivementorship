import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoadingScreen } from "../components/ui";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get("order");

  useEffect(() => {
    // The real source of truth is the server-confirmed payment status, not
    // this URL. Send the user to the pending page which polls securely and
    // will forward to /access automatically once confirmed.
    navigate(`/payment/pending${orderId ? `?order=${orderId}` : ""}`, { replace: true });
  }, [navigate, orderId]);

  return <LoadingScreen />;
}
