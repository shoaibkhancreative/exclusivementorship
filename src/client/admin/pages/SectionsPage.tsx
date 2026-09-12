import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Button, Card } from "../../components/ui";
import { LayersIcon } from "../components/icons";

interface LayoutBlock {
  id: string;
  visible: boolean;
  label: string;
}

interface LayoutPage {
  pageKey: string;
  label: string;
  blocks: LayoutBlock[];
}

function PageLayoutCard({ page, onSaved }: { page: LayoutPage; onSaved: (pageKey: string, blocks: LayoutBlock[]) => void }) {
  const [blocks, setBlocks] = useState(page.blocks);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const dirty = JSON.stringify(blocks) !== JSON.stringify(page.blocks);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);
    setStatus("idle");
  }

  function toggleVisible(index: number) {
    const next = [...blocks];
    next[index] = { ...next[index], visible: !next[index].visible };
    setBlocks(next);
    setStatus("idle");
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await api.post<{ ok: true; blocks: { id: string; visible: boolean }[] }>(`/admin/layout/${page.pageKey}`, {
        blocks: blocks.map(({ id, visible }) => ({ id, visible }))
      });
      const saved = res.blocks.map((b) => ({ ...b, label: blocks.find((x) => x.id === b.id)?.label ?? b.id }));
      setBlocks(saved);
      onSaved(page.pageKey, saved);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-zinc-200">{page.label}</h2>
      <Card>
        <ul className="divide-y divide-base-800/70">
          {blocks.map((block, index) => (
            <li key={block.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="focus-ring text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === blocks.length - 1}
                    className="focus-ring text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
                <span className={`text-sm ${block.visible ? "text-zinc-200" : "text-zinc-500 line-through"}`}>{block.label}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={block.visible} onChange={() => toggleVisible(index)} />
                Visible
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-3 border-t border-base-800/70 pt-3">
          <Button type="button" onClick={handleSave} disabled={!dirty || saving} className="!px-3 !py-1.5 text-xs">
            {saving ? "Saving…" : "Save order"}
          </Button>
          {status === "saved" && <span className="text-xs text-accent-400">Saved.</span>}
          {status === "error" && <span className="text-xs text-red-400">Couldn't save.</span>}
        </div>
      </Card>
    </div>
  );
}

export default function SectionsPage() {
  const [pages, setPages] = useState<LayoutPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get<{ pages: LayoutPage[] }>("/admin/layout");
      setPages(res.pages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load sections.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleSaved(pageKey: string, blocks: LayoutBlock[]) {
    setPages((prev) => (prev ? prev.map((p) => (p.pageKey === pageKey ? { ...p, blocks } : p)) : prev));
  }

  if (error) {
    return (
      <div className="page-enter">
        <p className="mb-4 text-sm text-red-400">{error}</p>
        <Button variant="secondary" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-base-800 text-zinc-400">
          <LayersIcon />
        </span>
        <h1 className="text-lg text-zinc-100">Sections</h1>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-zinc-500">
        Reorder or hide sections on each page. Wording is edited separately on the Content page — this only controls
        which sections show and in what order. Changes go live immediately.
      </p>

      {!pages ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          {pages.map((page) => (
            <PageLayoutCard key={page.pageKey} page={page} onSaved={handleSaved} />
          ))}
        </div>
      )}
    </div>
  );
}
