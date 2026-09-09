import { Link } from "react-router-dom";
import { Button } from "../components/ui";

export default function Access() {
  return (
    <div className="page-enter mx-auto max-w-lg px-6 py-16 text-center">
      <p className="mb-2 text-sm font-medium text-accent-400">Payment successful</p>
      <h1 className="text-2xl font-semibold text-zinc-50">Welcome to Exclusive Mentorship.</h1>
      <p className="mt-2 text-sm text-zinc-400">Your mentorship is now unlocked — every class is available right away.</p>

      <Link to="/learn" className="mt-8 block">
        <Button className="w-full">Go to your lessons</Button>
      </Link>
    </div>
  );
}
