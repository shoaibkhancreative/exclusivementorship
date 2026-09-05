import { TelegramAccessPanel } from "../components/TelegramAccessPanel";

export default function Access() {
  return (
    <div className="mx-auto max-w-md px-6 py-14">
      <div className="mb-6 text-center">
        <p className="mb-1 text-sm font-medium text-accent-400">Payment successful ✓</p>
        <h1 className="text-xl font-semibold text-zinc-50">Welcome to Exclusive Mentorship.</h1>
        <p className="mt-1 text-sm text-zinc-400">Your mentorship is now unlocked.</p>
      </div>

      <TelegramAccessPanel showIntro={false} />
    </div>
  );
}
