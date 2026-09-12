import { useState } from "react";

/**
 * A thin `<img>` preview beneath a URL input, with a broken-image fallback.
 * Deliberately dumb — it doesn't own the input's value, just renders
 * whatever URL it's given. Reset `imgBroken` whenever the url changes so a
 * fixed/corrected URL gets a fresh chance to load instead of staying stuck
 * on the last failure.
 */
export function ImageUrlPreview({ url, className = "h-20 w-32" }: { url: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const [lastUrl, setLastUrl] = useState(url);

  if (url !== lastUrl) {
    setLastUrl(url);
    setBroken(false);
  }

  if (!url) return null;

  return (
    <div className={`mt-2 flex items-center justify-center overflow-hidden rounded-md border border-base-700 bg-base-900 ${className}`}>
      {broken ? (
        <span className="px-2 text-center text-[11px] text-zinc-500">Image didn't load</span>
      ) : (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={url} onError={() => setBroken(true)} className="h-full w-full object-cover" alt="" />
      )}
    </div>
  );
}
