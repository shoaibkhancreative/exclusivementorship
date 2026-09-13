export interface BlockDef {
  id: string;
  label: string;
}

export const PAGE_BLOCKS: Record<string, BlockDef[]> = {
  home: [
    { id: "kicker", label: "Kicker" },
    { id: "headline", label: "Headline" },
    { id: "intro_video", label: "Intro video" },
    { id: "body", label: "Body copy" },
    { id: "cta", label: "CTA button" }
  ],
  access: [
    { id: "badge", label: "Badge" },
    { id: "title", label: "Title" },
    { id: "description", label: "Description" },
    { id: "cta", label: "CTA button" }
  ]
};

export const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  unlock: "Unlock",
  access: "Access"
};

export interface LayoutBlockState {
  id: string;
  visible: boolean;
}

export function defaultLayout(pageKey: string): LayoutBlockState[] {
  return (PAGE_BLOCKS[pageKey] ?? []).map((b) => ({ id: b.id, visible: true }));
}

export function reconcileLayout(pageKey: string, stored: LayoutBlockState[]): LayoutBlockState[] {
  const known = new Set((PAGE_BLOCKS[pageKey] ?? []).map((b) => b.id));
  const seen = new Set<string>();
  const reconciled: LayoutBlockState[] = [];
  for (const entry of stored) {
    if (known.has(entry.id) && !seen.has(entry.id)) {
      reconciled.push(entry);
      seen.add(entry.id);
    }
  }
  for (const block of PAGE_BLOCKS[pageKey] ?? []) {
    if (!seen.has(block.id)) {
      reconciled.push({ id: block.id, visible: true });
    }
  }
  return reconciled;
}
