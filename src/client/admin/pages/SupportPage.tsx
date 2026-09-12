import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type AdminSupportTicket, type SupportAgentProfileId, type SupportMessage } from "../../lib/api";
import { fileToCompressedDataUrl } from "../../lib/imageAttachment";
import { Button } from "../../components/ui";
import { SearchIcon } from "../components/icons";
import { NewConversationModal } from "../components/NewConversationModal";

const TICKETS_POLL_MS = 20_000;
const THREAD_POLL_MS = 5_000;

const AGENT_PROFILES: { id: SupportAgentProfileId; label: string }[] = [
  { id: "nlt", label: "NLT" },
  { id: "void", label: "Void" },
  { id: "venom", label: "Venom" },
  { id: "shadow", label: "Shadow" }
];

type StatusFilter = "all" | "open" | "closed";
type ProfileFilter = "all" | SupportAgentProfileId;
type UserStatusFilter = "all" | "paid" | "free" | "guest";

interface Identity {
  key: string;
  isGuest: boolean;
  label: string;
  email: string | null;
  courseStatus: "free" | "paid" | null;
  currentLesson: number | null;
  completedLessons: number | null;
  totalLessons: number | null;
  tickets: AdminSupportTicket[];
  unreadCount: number;
  lastActivityAt: string;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function identityKeyOf(t: AdminSupportTicket): string {
  return t.userId ? `user:${t.userId}` : `guest:${t.guestId}`;
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<AdminSupportTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const [selectedIdentityKey, setSelectedIdentityKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{ dataUrl: string; filename: string } | null>(null);
  const [showNewConversation, setShowNewConversation] = useState(false);

  const selectedTicket = tickets?.find((t) => t.id === selectedId) ?? null;

  const loadTickets = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (profileFilter !== "all") params.set("agent_profile", profileFilter);
    if (userStatusFilter !== "all") params.set("user_status", userStatusFilter);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (search.trim()) params.set("search", search.trim());

    api
      .get<{ tickets: AdminSupportTicket[] }>(`/admin/support/tickets?${params.toString()}`)
      .then((res) => setTickets(res.tickets))
      .catch(() => setError("Couldn't load the support inbox."));
  }, [statusFilter, profileFilter, userStatusFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    loadTickets();
    const id = setInterval(loadTickets, TICKETS_POLL_MS);
    return () => clearInterval(id);
  }, [loadTickets]);

  // Groups the (already-filtered) ticket list by owner, one row per unique
  // user/guest — this is the "Users" column. Deliberately client-side
  // rather than a second endpoint: it's the exact same filtered result set
  // just re-shaped, so there's no way for the two views to disagree.
  const identities = useMemo<Identity[]>(() => {
    if (!tickets) return [];
    const map = new Map<string, Identity>();
    for (const t of tickets) {
      const key = identityKeyOf(t);
      const existing = map.get(key);
      if (existing) {
        existing.tickets.push(t);
        existing.unreadCount += t.unreadCount;
        if (t.lastMessageAt > existing.lastActivityAt) existing.lastActivityAt = t.lastMessageAt;
      } else {
        map.set(key, {
          key,
          isGuest: t.isGuest,
          label: t.isGuest ? t.guestEmail ?? "Guest (no email)" : t.userName || t.userEmail || "Learner",
          email: t.isGuest ? t.guestEmail : t.userEmail,
          courseStatus: t.courseStatus,
          currentLesson: t.currentLesson,
          completedLessons: t.completedLessons,
          totalLessons: t.totalLessons,
          tickets: [t],
          unreadCount: t.unreadCount,
          lastActivityAt: t.lastMessageAt
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
  }, [tickets]);

  const selectedIdentity = identities.find((i) => i.key === selectedIdentityKey) ?? null;

  const loadThread = useCallback((id: string) => {
    api
      .get<{ messages: SupportMessage[] }>(`/admin/support/tickets/${id}/messages`)
      .then((res) => setMessages(res.messages))
      .catch(() => {
        // Silent — keep whatever's already rendered.
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadThread(selectedId);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadThread(selectedId);
    }, THREAD_POLL_MS);
    return () => clearInterval(id);
  }, [selectedId, loadThread]);

  function selectIdentity(key: string) {
    setSelectedIdentityKey(key);
    setSelectedId(null);
    setMessages(null);
  }

  function selectTicket(id: string) {
    setSelectedId(id);
    setMessages(null);
    setReplyText("");
    setPendingAttachment(null);
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const result = await fileToCompressedDataUrl(file);
      setPendingAttachment(result);
    } catch {
      setError("Couldn't process that image.");
    }
  }

  async function sendReply() {
    if (!selectedId || (!replyText.trim() && !pendingAttachment)) return;
    setSending(true);
    try {
      await api.post(`/admin/support/tickets/${selectedId}/messages`, {
        body: replyText.trim() || undefined,
        attachment: pendingAttachment ?? undefined
      });
      setReplyText("");
      setPendingAttachment(null);
      loadThread(selectedId);
      loadTickets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the reply.");
    } finally {
      setSending(false);
    }
  }

  async function shiftProfile(profile: SupportAgentProfileId) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.post(`/admin/support/tickets/${selectedId}/shift`, { agent_profile: profile });
      loadTickets();
      loadThread(selectedId);
    } catch {
      setError("Couldn't shift the agent profile.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!selectedId || !selectedTicket) return;
    setBusy(true);
    try {
      await api.post(`/admin/support/tickets/${selectedId}/${selectedTicket.status === "open" ? "close" : "reopen"}`);
      loadTickets();
    } catch {
      setError("Couldn't update the ticket status.");
    } finally {
      setBusy(false);
    }
  }

  async function unhideTicket() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.post(`/admin/support/tickets/${selectedId}/unhide`);
      loadTickets();
    } catch {
      setError("Couldn't restore this ticket to the learner's list.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm("Delete this message? This cannot be undone.")) return;
    try {
      await api.delete(`/admin/support/messages/${id}`);
      if (selectedId) loadThread(selectedId);
    } catch {
      setError("Couldn't delete that message.");
    }
  }

  async function hideTicket() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.post(`/admin/support/tickets/${selectedId}/hide`);
      loadTickets();
    } catch {
      setError("Couldn't hide this ticket from the learner.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTicket() {
    if (!selectedId) return;
    if (!confirm("Delete this ticket and its entire conversation? This cannot be undone.")) return;
    setBusy(true);
    try {
      await api.delete(`/admin/support/tickets/${selectedId}`);
      setSelectedId(null);
      setMessages(null);
      loadTickets();
    } catch {
      setError("Couldn't delete this ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteIdentity(identity: Identity) {
    const ticketWord = identity.tickets.length === 1 ? "ticket" : "tickets";
    if (!confirm(`Delete all ${identity.tickets.length} ${ticketWord} for ${identity.label}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/support/identities/${encodeURIComponent(identity.key)}`);
      if (selectedIdentityKey === identity.key) {
        setSelectedIdentityKey(null);
        setSelectedId(null);
        setMessages(null);
      }
      loadTickets();
    } catch {
      setError("Couldn't delete this learner's tickets.");
    }
  }

  function handleConversationCreated(ticketId: string, userId: string) {
    setShowNewConversation(false);
    // Jump straight into the new thread. The Users/Tickets columns
    // themselves catch up on the next loadTickets() poll — selectedId
    // driving loadThread() doesn't depend on the ticket already being in
    // `tickets`, so the conversation still loads immediately.
    setSelectedIdentityKey(`user:${userId}`);
    setSelectedId(ticketId);
    setMessages(null);
    setReplyText("");
    setPendingAttachment(null);
    loadTickets();
  }

  return (
    <div className="page-enter flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl text-zinc-100">Support Inbox</h1>
        <Button variant="secondary" onClick={() => setShowNewConversation(true)} className="!px-3 !py-1.5 text-xs">
          New conversation
        </Button>
      </div>

      {showNewConversation && (
        <NewConversationModal onClose={() => setShowNewConversation(false)} onCreated={handleConversationCreated} />
      )}

      {error && <div className="rounded-md border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-sm text-accent-300">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or message…"
            className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none"
          />
        </div>
        <select
          value={userStatusFilter}
          onChange={(e) => setUserStatusFilter(e.target.value as UserStatusFilter)}
          className="focus-ring rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
        >
          <option value="all">All learners</option>
          <option value="paid">Paid</option>
          <option value="free">Free</option>
          <option value="guest">Not logged in</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="focus-ring rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={profileFilter}
          onChange={(e) => setProfileFilter(e.target.value as ProfileFilter)}
          className="focus-ring rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
        >
          <option value="all">All profiles</option>
          {AGENT_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="focus-ring rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="focus-ring rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_260px_1fr]">
        {/* Users column */}
        <div className="max-h-[70vh] overflow-y-auto rounded-md border border-base-800 bg-base-900/40">
          {tickets === null ? (
            <div className="p-4 text-center text-sm text-zinc-500">Loading…</div>
          ) : identities.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">No learners match these filters.</div>
          ) : (
            <ul className="divide-y divide-base-800">
              {identities.map((identity) => (
                <li key={identity.key} className="group relative">
                  <button
                    type="button"
                    onClick={() => selectIdentity(identity.key)}
                    className={`focus-ring flex w-full flex-col gap-1 px-3.5 py-3 pr-9 text-left transition-colors hover:bg-base-800/40 ${
                      selectedIdentityKey === identity.key ? "bg-base-800/60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-zinc-100">{identity.label}</span>
                      {identity.unreadCount > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent-500 px-1 text-[9.5px] font-bold text-base-950">
                          {identity.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-[10.5px] text-zinc-500">
                      {identity.isGuest ? (
                        <span className="rounded-full border border-base-700 px-1.5 py-[1px]">Not logged in</span>
                      ) : (
                        <span
                          className={`rounded-full border px-1.5 py-[1px] ${
                            identity.courseStatus === "paid" ? "border-accent-500/40 text-accent-400" : "border-base-700"
                          }`}
                        >
                          {identity.courseStatus === "paid" ? "Paid" : "Free"}
                        </span>
                      )}
                      <span>{identity.tickets.length} ticket{identity.tickets.length === 1 ? "" : "s"}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteIdentity(identity)}
                    className="focus-ring absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:text-accent-300 group-hover:opacity-100"
                    aria-label={`Delete all tickets for ${identity.label}`}
                    title="Delete all tickets for this learner"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tickets for the selected user */}
        <div className="max-h-[70vh] overflow-y-auto rounded-md border border-base-800 bg-base-900/40">
          {!selectedIdentity ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-zinc-500">
              Select a learner to see their tickets.
            </div>
          ) : (
            <ul className="divide-y divide-base-800">
              {selectedIdentity.tickets
                .slice()
                .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))
                .map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => selectTicket(t.id)}
                      className={`focus-ring flex w-full flex-col gap-1 px-3.5 py-3 text-left transition-colors hover:bg-base-800/40 ${
                        selectedId === t.id ? "bg-base-800/60" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] font-medium text-zinc-100">{t.subject || "New ticket"}</span>
                        {t.unreadCount > 0 && (
                          <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent-500 px-1 text-[9.5px] font-bold text-base-950">
                            {t.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-zinc-500">
                        <span className="rounded-full border border-base-700 px-1.5 py-[1px]">{t.agentDisplayName}</span>
                        <span className={`rounded-full border px-1.5 py-[1px] ${t.status === "open" ? "border-accent-500/40 text-accent-400" : "border-base-700"}`}>
                          {t.status}
                        </span>
                        {t.hiddenByUser && <span className="rounded-full border border-base-700 px-1.5 py-[1px]">Hidden from user</span>}
                        <span>{formatDateTime(t.lastMessageAt)}</span>
                      </div>
                      <div className="truncate text-[11.5px] text-zinc-500">{t.lastMessagePreview || "—"}</div>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Conversation */}
        <div className="flex min-h-[70vh] flex-col rounded-md border border-base-800 bg-base-900/40">
          {!selectedTicket ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">Select a ticket to view the conversation.</div>
          ) : (
            <>
              <div className="flex flex-col gap-2 border-b border-base-800 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {selectedTicket.isGuest ? `Guest — ${selectedTicket.guestEmail ?? "no email"}` : selectedTicket.userName || selectedTicket.userEmail}
                    </div>
                    <div className="text-[11.5px] text-zinc-500">{selectedTicket.subject}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTicket.agentProfile}
                      disabled={busy}
                      onChange={(e) => shiftProfile(e.target.value as SupportAgentProfileId)}
                      className="focus-ring rounded-lg border border-base-700 bg-base-800 px-2.5 py-1.5 text-xs text-zinc-100 outline-none"
                    >
                      {AGENT_PROFILES.map((p) => (
                        <option key={p.id} value={p.id}>
                          Shift to {p.label}
                        </option>
                      ))}
                    </select>
                    <Button variant="secondary" onClick={toggleStatus} disabled={busy} className="!px-3 !py-1.5 text-xs">
                      {selectedTicket.status === "open" ? "Close" : "Reopen"}
                    </Button>
                    {selectedTicket.hiddenByUser ? (
                      <Button variant="secondary" onClick={unhideTicket} disabled={busy} className="!px-3 !py-1.5 text-xs">
                        Unhide for user
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={hideTicket} disabled={busy} className="!px-3 !py-1.5 text-xs">
                        Hide from user
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={deleteTicket}
                      disabled={busy}
                      className="!px-3 !py-1.5 text-xs !text-accent-400"
                    >
                      Delete ticket
                    </Button>
                  </div>
                </div>

                {/* Learner status strip — login state, paid/free, lesson progress, and where they were when the ticket was opened. */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                  <span className="rounded-full border border-base-700 px-2 py-0.5">
                    {selectedTicket.isGuest ? "Not logged in" : "Logged in"}
                  </span>
                  {!selectedTicket.isGuest && (
                    <span className={`rounded-full border px-2 py-0.5 ${selectedTicket.courseStatus === "paid" ? "border-accent-500/40 text-accent-400" : "border-base-700"}`}>
                      {selectedTicket.courseStatus === "paid" ? "Paid student" : "Free student"}
                    </span>
                  )}
                  {!selectedTicket.isGuest && selectedTicket.currentLesson !== null && (
                    <span className="rounded-full border border-base-700 px-2 py-0.5">
                      Lesson {selectedTicket.currentLesson}
                      {selectedTicket.totalLessons ? ` of ${selectedTicket.totalLessons}` : ""}
                    </span>
                  )}
                  {!selectedTicket.isGuest && selectedTicket.completedLessons !== null && (
                    <span className="rounded-full border border-base-700 px-2 py-0.5">{selectedTicket.completedLessons} completed</span>
                  )}
                  {selectedTicket.originPath && <span className="rounded-full border border-base-700 px-2 py-0.5">Opened from {selectedTicket.originPath}</span>}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages === null ? (
                  <div className="text-center text-sm text-zinc-500">Loading…</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.senderType === "admin" ? "justify-end" : "justify-start"}`}>
                      <div className="group max-w-[75%]">
                        <div
                          className={`rounded-lg px-3 py-2 text-[13px] ${
                            m.senderType === "admin" ? "bg-accent-500 text-base-950" : "border border-base-700 bg-base-950 text-zinc-100"
                          }`}
                        >
                          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                          {m.hasAttachment && m.attachmentUrl && (
                            <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={m.attachmentUrl}
                                alt={m.attachmentFilename ?? "Attachment"}
                                className={`max-h-56 max-w-full rounded-md object-cover ${m.body ? "mt-1.5" : ""}`}
                              />
                            </a>
                          )}
                        </div>
                        <div className={`mt-1 flex items-center gap-2 text-[10.5px] text-zinc-500 ${m.senderType === "admin" ? "justify-end" : ""}`}>
                          <span>{formatDateTime(m.createdAt)}</span>
                          <button
                            type="button"
                            onClick={() => deleteMessage(m.id)}
                            className="opacity-0 transition-opacity hover:text-accent-300 group-hover:opacity-100"
                            aria-label="Delete message"
                            title="Delete message"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-base-800 p-3">
                {pendingAttachment && (
                  <div className="mb-2 flex items-center gap-2 rounded-md border border-base-700 bg-base-950 p-1.5">
                    <img src={pendingAttachment.dataUrl} alt="Attachment preview" className="h-10 w-10 rounded object-cover" />
                    <span className="flex-1 truncate text-xs text-zinc-500">{pendingAttachment.filename}</span>
                    <button type="button" onClick={() => setPendingAttachment(null)} className="focus-ring rounded p-1 text-zinc-500 hover:text-zinc-200">
                      ✕
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-base-700 text-zinc-500 hover:border-base-600 hover:text-zinc-300"
                    aria-label="Attach an image"
                  >
                    📎
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickFile} />
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder="Reply…"
                    rows={1}
                    className="focus-ring max-h-24 flex-1 resize-none rounded-md border border-base-700 bg-base-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                  />
                  <Button onClick={sendReply} disabled={sending || (!replyText.trim() && !pendingAttachment)} className="!px-3 !py-2">
                    {sending ? "…" : "Send"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
