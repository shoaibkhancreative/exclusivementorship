// Single source of truth for Phase 3 (section/layout control): which
// pages support block reordering/hiding, which blocks exist on each page,
// their default (current, unchanged-by-this-work) order, and a friendly
// label for the admin Sections page.
//
// Scoped to the marketing/conversion pages that are genuinely made of
// independent, reorderable blocks — Home, Access. (There is no longer a
// standalone Unlock page — see App.tsx / UnlockModalContext.) Learn/Lesson/
// Login are functional app screens driven by lesson/course data and a
// guided multi-step flow (progress → outline, video → completion state,
// email step → code step); reordering those isn't "hide/reorder a
// section", it's rearranging how the product works, which is why they're
// deliberately left out here.
//
// Adding a new page here means: (1) add its default block list below,
// (2) render its blocks from getBlockOrder()/useLayout() on the client
// instead of fixed JSX order. Adding a genuinely new *kind* of block to an
// existing page is still a code change — this registry only lets existing
// blocks be reordered or hidden, per the ground rules for this work.
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

/** The as-shipped order for a page: every known block, all visible, in registry order. */
export function defaultLayout(pageKey: string): LayoutBlockState[] {
  return (PAGE_BLOCKS[pageKey] ?? []).map((b) => ({ id: b.id, visible: true }));
}

/**
 * Reconciles a stored order against the registry: drops any id the page no
 * longer defines (e.g. a block was removed from code), and appends any
 * registry block missing from the stored order (e.g. a block was added to
 * code after this row was saved) as visible, at the end — so a code change
 * never causes a block to silently disappear or a stale id to crash
 * rendering.
 */
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
