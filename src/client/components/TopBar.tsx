import { Link } from "react-router-dom";
import { useSession } from "../lib/SessionContext";
import { ProfileMenu } from "./ProfileMenu";

export function TopBar() {
  const { me } = useSession();

  return (
    <header className="border-b border-base-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5 sm:px-6">
        <Link to="/" className="focus-ring rounded text-[15px] font-semibold text-zinc-100">
          Exclusive Mentorship
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          {me?.authenticated ? (
            <>
              <Link to="/learn" className="focus-ring rounded text-zinc-400 hover:text-zinc-100">
                Learn
              </Link>
              <ProfileMenu />
            </>
          ) : (
            <Link to="/login" className="focus-ring rounded text-zinc-200 hover:text-accent-400">
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
