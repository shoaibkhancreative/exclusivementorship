import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Button, Card } from "../../components/ui";
import { ImageUrlPreview } from "../../components/ImageUrlPreview";
import { DocumentIcon } from "../components/icons";

interface ContentField {
  key: string;
  value: string | null;
  default_value: string;
  group: string;
  label: string;
  type: "text" | "textarea" | "image";
}

/**
 * One field row: local draft state, save, and reset-to-default. Kept as its
 * own component (rather than one giant form) so saving field A never
 * re-renders or risks clobbering an in-progress edit to field B.
 */
function ContentFieldRow({ field, onSaved }: { field: ContentField; onSaved: (key: string, value: string | null) => void }) {
  const [draft, setDraft] = useState(field.value ?? field.default_value);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const isOverridden = field.value !== null && field.value !== "";
  const dirty = draft !== (field.value ?? field.default_value);

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    try {
      await api.post("/admin/content", { key: field.key, value: draft });
      onSaved(field.key, draft);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setStatus("idle");
    try {
      const res = await api.post<{ ok: true; value: string }>(`/admin/content/${encodeURIComponent(field.key)}/reset`);
      setDraft(res.value);
      onSaved(field.key, null);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setResetting(false);
    }
  }

  const isImage = field.type === "image";

  return (
    <div className="border-b border-base-800/70 py-4 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={field.key} className="text-[13px] font-medium text-zinc-300">
          {field.label}
        </label>
        {isOverridden && (
          <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-[11px] font-medium text-accent-400">Customized</span>
        )}
      </div>

      {field.type === "textarea" ? (
        <textarea
          id={field.key}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setStatus("idle");
          }}
          rows={3}
          className="focus-ring w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-zinc-100"
        />
      ) : (
        <input
          id={field.key}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setStatus("idle");
          }}
          className="focus-ring w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-zinc-100"
        />
      )}

      {isImage && <ImageUrlPreview url={draft} />}

      <div className="mt-2 flex items-center gap-3">
        <Button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="!px-3 !py-1.5 text-xs"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting || (!isOverridden && draft === field.default_value)}
          className="focus-ring text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
        >
          {resetting ? "Resetting…" : "Reset to default"}
        </button>
        {status === "saved" && <span className="text-xs text-accent-400">Saved.</span>}
        {status === "error" && <span className="text-xs text-red-400">Couldn't save.</span>}
      </div>
    </div>
  );
}

export default function ContentPage() {
  const [fields, setFields] = useState<ContentField[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    try {
      const res = await api.get<{ fields: ContentField[] }>("/admin/content");
      setFields(res.fields);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load content.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleSaved(key: string, value: string | null) {
    setFields((prev) => (prev ? prev.map((f) => (f.key === key ? { ...f, value } : f)) : prev));
  }

  const grouped = useMemo(() => {
    if (!fields) return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? fields.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
      : fields;
    const map = new Map<string, ContentField[]>();
    for (const f of filtered) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return Array.from(map.entries());
  }, [fields, query]);

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
          <DocumentIcon />
        </span>
        <h1 className="text-lg text-zinc-100">Content</h1>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-zinc-500">
        Every piece of text on the public site, grouped by page. Changes go live immediately — no redeploy needed. "Reset
        to default" restores the original wording for that field.
      </p>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search fields…"
        className="focus-ring mb-6 w-full max-w-sm rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
      />

      {!fields ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-zinc-500">No fields match "{query}".</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([group, groupFields]) => (
            <div key={group}>
              <h2 className="mb-2 text-sm font-semibold text-zinc-200">{group}</h2>
              <Card>
                {groupFields.map((field) => (
                  <ContentFieldRow key={field.key} field={field} onSaved={handleSaved} />
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
