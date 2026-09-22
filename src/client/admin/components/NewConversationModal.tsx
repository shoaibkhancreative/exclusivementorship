import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Button } from "../../components/ui";
import { useDialogA11y } from "../../lib/useDialogA11y";
import { SearchIcon } from "./icons";

interface StudentOption {
  id: string;
  email: string;
  name: string | null;
  courseStatus: "free" | "paid";
}

export function NewConversationModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (ticketId: string, userId: string) => void;
}) {
  const [students, setStudents] = useState<StudentOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StudentOption | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selected) messageInputRef.current?.focus();
  }, [selected]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ students: StudentOption[] }>("/admin/students")
      .then((res) => setStudents(res.students))
      .catch(() => setLoadError("Couldn't load the student list."));
  }, []);

  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, { onClose });

  const filtered = useMemo(() => {
    if (!students) return [];
    const term = query.trim().toLowerCase();
    if (!term) return students;
    return students.filter((s) => s.email.toLowerCase().includes(term) || (s.name ?? "").toLowerCase().includes(term));
  }, [students, query]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  async function submit() {
    if (!selected || !message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ ticket: { id: string } }>("/admin/support/tickets", {
        userId: selected.id,
        body: message.trim()
      });
      onCreated(res.ticket.id, selected.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the conversation.");
    } finally {
      setSending(false);
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Start a new conversation"
    >
      <div
        className="animate-slide-up flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-base-800 bg-base-900 sm:max-w-md sm:rounded-xl"
        ref={panelRef}
      >
        <div className="flex items-center justify-between gap-3 border-b border-base-800 px-5 py-4">
          <div className="text-sm font-medium text-zinc-100">New conversation</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring -m-2 rounded-md p-2 text-zinc-500 transition-colors hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!selected ? (
            <>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search learners by name or email…"
                  className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none"
                />
              </div>

              <div className="max-h-64 overflow-y-auto rounded-md border border-base-800">
                {loadError ? (
                  <div className="p-4 text-center text-sm text-zinc-500">{loadError}</div>
                ) : students === null ? (
                  <div className="p-4 text-center text-sm text-zinc-500">Loading learners…</div>
                ) : filtered.length === 0 ? (
                  <div className="p-4 text-center text-sm text-zinc-500">No learners match.</div>
                ) : (
                  <ul className="divide-y divide-base-800">
                    {filtered.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(s)}
                          className="focus-ring flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left hover:bg-base-800/40"
                        >
                          <span className="truncate text-[13px] text-zinc-100">{s.name || s.email}</span>
                          <span className="flex items-center gap-1.5 text-[10.5px] text-zinc-500">
                            {s.name && <span className="truncate">{s.email}</span>}
                            <span
                              className={`rounded-full border px-1.5 py-[1px] ${
                                s.courseStatus === "paid" ? "border-accent-500/40 text-accent-500" : "border-base-700"
                              }`}
                            >
                              {s.courseStatus === "paid" ? "Paid" : "Free"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 rounded-md border border-base-700 bg-base-950 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-zinc-100">{selected.name || selected.email}</div>
                  {selected.name && <div className="truncate text-[11px] text-zinc-500">{selected.email}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="focus-ring shrink-0 rounded-md border border-base-700 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                >
                  Change
                </button>
              </div>

              <textarea
                ref={messageInputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write the first message…"
                rows={5}
                className="focus-ring w-full resize-none rounded-md border border-base-700 bg-base-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              />
            </>
          )}
        </div>

        <div className="border-t border-base-800 p-4">
          <Button onClick={submit} disabled={!selected || !message.trim() || sending} className="w-full">
            {sending ? "Starting…" : "Start conversation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
