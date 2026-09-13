import { useState } from "react";

export function ImageUrlPreview({ url, className = "h-20 w-32" }: { url: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const [lastUrl, setLastUrl] = useState(url);

  if (url !== lastUrl) {
    setLastUrl(url);
    setBroken(false);
  }

  if (!url) return null;

  return (
    <div
      className={`mt-2 flex items-center justify-center overflow-hidden rounded-md border border-base-700 bg-base-900 ${className}`}
    >
      {broken ? (
        <span className="px-2 text-center text-[11px] text-zinc-500">Image didn't load</span>
      ) : (
        <img src={url} onError={() => setBroken(true)} className="h-full w-full object-cover" alt="" />
      )}
    </div>
  );
}
