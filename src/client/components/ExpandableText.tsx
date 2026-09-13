import { useState } from "react";

interface ExpandableTextProps {
  text: string;
  maxChars?: number;
  className?: string;
  moreLabel: string;
  lessLabel: string;
}

export function ExpandableText({ text, maxChars = 220, className = "", moreLabel, lessLabel }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const canTruncate = text.length > maxChars;

  if (!canTruncate) {
    return <p className={className}>{text}</p>;
  }

  const truncated = text.slice(0, maxChars).replace(/\s+\S*$/, "");

  return (
    <p className={className}>
      {expanded ? text : `${truncated}…`}{" "}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="focus-ring inline font-medium text-accent-400 transition-colors hover:text-accent-300"
      >
        {expanded ? lessLabel : moreLabel}
      </button>
    </p>
  );
}
