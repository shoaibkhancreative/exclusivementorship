import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type SupportAttachmentInput, type SupportMessage, type SupportTicket } from "../lib/api";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { fileToCompressedDataUrl } from "../lib/imageAttachment";
import { Button } from "./ui";

const TICKET_LIST_POLL_MS = 45_000;
// Snappy enough that a reply feels close to real-time without needing
// WebSockets/Durable Objects — only runs while a thread is actually open,
// and only while the tab is visible (see the visibilitychange handling
// below), so it's cheap even at this cadence.
const THREAD_POLL_MS = 4_000;

type View = "list" | "new" | "thread";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Splits an imageAttachment.ts "code:message" error into just the human-readable part; falls back to a generic message for anything else. */
function friendlyAttachmentError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const idx = raw.indexOf(":");
  if (raw.startsWith("unsupported_format:")) return raw.slice(idx + 1);
  return "Couldn't process that image. Please try another, or a screenshot instead.";
}

interface Props {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onMinimize: () => void;
  /** Bubbles the caller's latest ticket list up so the floating button's badge stays in sync without a second poll loop. */
  onTicketsChange: (tickets: SupportTicket[]) => void;
}

export function SupportChatPanel({ fullscreen, onToggleFullscreen, onMinimize, onTicketsChange }: Props) {
  const { me } = useSession();
  const { t } = useContent();
  const [view, setView] = useState<View>("list");
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [composerText, setComposerText] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<(SupportAttachmentInput & { previewUrl: string }) | null>(null);
  const [sending, setSending] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadTickets = useCallback(() => {
    api
      .get<{ tickets: SupportTicket[] }>("/support/tickets")
      .then((res) => {
        setTickets(res.tickets);
        onTicketsChange(res.tickets);
      })
      .catch(() => {
        // Silent — the panel just shows whatever it last had.
      });
  }, [onTicketsChange]);

  useEffect(() => {
    loadTickets();
    const id = setInterval(loadTickets, TICKET_LIST_POLL_MS);
    return () => clearInterval(id);
  }, [loadTickets]);

  const loadThread = useCallback((id: string) => {
    api
      .get<{ ticket: SupportTicket; messages: SupportMessage[] }>(`/support/tickets/${id}/messages`)
      .then((res) => setMessages(res.messages))
      .catch(() => {
        // Silent — keep showing whatever's already rendered.
      });
  }, []);

  // Only polls while the thread view is open AND the tab is actually
  // visible — no point burning requests on a backgrounded tab, and it
  // re-fetches immediately the moment the person switches back rather than
  // waiting out the rest of the interval.
  useEffect(() => {
    if (view !== "thread" || !ticketId) return;
    loadThread(ticketId);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadThread(ticketId);
    }, THREAD_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadThread(ticketId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [view, ticketId, loadThread]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, view]);

  const hasOpenTicket = (tickets ?? []).length > 0;

  function openTicket(id: string) {
    setTicketId(id);
    setMessages(null);
    setComposerText("");
    setPendingAttachment(null);
    setError(null);
    setView("thread");
  }

  function startNewTicket() {
    setError(null);
    setComposerText("");
    setPendingAttachment(null);
    setView("new");
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "") {
      setError("Only image attachments are supported.");
      return;
    }
    setCompressing(true);
    setError(null);
    try {
      const { dataUrl, filename } = await fileToCompressedDataUrl(file);
      setPendingAttachment({ dataUrl, filename, previewUrl: dataUrl });
    } catch (err) {
      setError(friendlyAttachmentError(err));
    } finally {
      setCompressing(false);
    }
  }

  async function sendNewTicket() {
    if (!composerText.trim() && !pendingAttachment) return;
    if (!me?.authenticated && !guestEmail.trim()) {
      setError("Please enter your email so we can reach you.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ ticket: SupportTicket; message: SupportMessage }>("/support/tickets", {
        body: composerText.trim() || undefined,
        guestEmail: me?.authenticated ? undefined : guestEmail.trim(),
        originPath: window.location.pathname,
        attachment: pendingAttachment ? { dataUrl: pendingAttachment.dataUrl, filename: pendingAttachment.filename } : undefined
      });
      setTickets((prev) => [res.ticket, ...(prev ?? [])]);
      onTicketsChange([res.ticket, ...(tickets ?? [])]);
      openTicket(res.ticket.id);
      // The panel just opened this ticket fresh — show the first message
      // immediately rather than waiting on the next poll tick.
      setMessages([res.message]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function sendReply() {
    if (!ticketId || (!composerText.trim() && !pendingAttachment)) return;
    const text = composerText.trim();
    const attachment = pendingAttachment;

    // Optimistic append: the sender sees their own message land instantly
    // instead of waiting for the next poll tick. A temporary id is swapped
    // out once the next successful poll brings back the real row; if the
    // send fails, the optimistic bubble is removed and the text restored.
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: SupportMessage = {
      id: tempId,
      senderType: "user",
      body: text || null,
      hasAttachment: Boolean(attachment),
      attachmentFilename: attachment?.filename ?? null,
      attachmentMime: null,
      createdAt: new Date().toISOString(),
      attachmentUrl: attachment?.previewUrl ?? null
    };
    setMessages((prev) => [...(prev ?? []), optimisticMessage]);
    setComposerText("");
    setPendingAttachment(null);
    setSending(true);
    setError(null);
    try {
      await api.post<{ message: SupportMessage }>(`/support/tickets/${ticketId}/messages`, {
        body: text || undefined,
        attachment: attachment ? { dataUrl: attachment.dataUrl, filename: attachment.filename } : undefined
      });
      loadThread(ticketId);
      loadTickets();
    } catch (err) {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== tempId));
      setComposerText(text);
      setPendingAttachment(attachment);
      setError(err instanceof ApiError ? err.message : "Couldn't send that. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function closeConversation() {
    if (!ticketId) return;
    if (!window.confirm(t("support.close_confirm"))) return;
    setClosing(true);
    try {
      await api.post(`/support/tickets/${ticketId}/close`);
      setTickets((prev) => (prev ?? []).filter((t2) => t2.id !== ticketId));
      onTicketsChange((tickets ?? []).filter((t2) => t2.id !== ticketId));
      setView("list");
      setTicketId(null);
    } catch {
      setError("Couldn't close this conversation. Please try again.");
    } finally {
      setClosing(false);
    }
  }

  const composerBox = (onSend: () => void, placeholder: string) => (
    <div className="border-t border-base-700 bg-base-900 p-3">
      {pendingAttachment && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-base-700 bg-base-950 p-1.5">
          <img src={pendingAttachment.previewUrl} alt="Attachment preview" className="h-10 w-10 rounded object-cover" />
          <span className="flex-1 truncate text-xs text-zinc-500">{pendingAttachment.filename}</span>
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            className="focus-ring rounded p-1 text-zinc-500 hover:text-zinc-200"
            aria-label="Remove attachment"
          >
            ✕
          </button>
        </div>
      )}
      {error && <div className="mb-2 text-xs text-accent-300">{error}</div>}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={compressing || sending}
          className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-base-700 text-zinc-500 transition-colors hover:border-base-600 hover:text-zinc-300 disabled:opacity-40"
          aria-label="Attach an image"
          title="Attach an image"
        >
          {compressing ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 12.5v4A4.5 4.5 0 0 1 16.5 21h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3H12M17 3l4 4m0 0-6 6m6-6h-6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickFile} />
        <textarea
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="focus-ring max-h-24 flex-1 resize-none rounded-md border border-base-700 bg-base-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
        />
        <Button
          onClick={onSend}
          disabled={sending || compressing || (!composerText.trim() && !pendingAttachment)}
          className="!px-3 !py-2"
        >
          {sending ? "…" : "Send"}
        </Button>
      </div>
    </div>
  );

  return (
    <div
      style={{ transformOrigin: "bottom right" }}
      className={`animate-scale-in fixed z-[100] flex flex-col overflow-hidden border border-base-700 bg-base-900 shadow-2xl ${
        fullscreen
          ? "inset-0 rounded-none"
          : "inset-x-3 bottom-3 top-16 rounded-2xl sm:inset-x-auto sm:top-auto sm:bottom-24 sm:right-6 sm:h-[560px] sm:w-[380px] sm:rounded-xl"
      }`}
      role="dialog"
      aria-label="Support chat"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-base-700 bg-base-950 px-3.5 py-3">
        {view !== "list" ? (
          <button
            type="button"
            onClick={() => setView("list")}
            className="focus-ring -ml-1 flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200"
            aria-label="Back to tickets"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14.5 6 8 12.5 14.5 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-500 text-[11px] font-bold text-base-950">EM</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-zinc-100">
            {view === "thread" ? tickets?.find((t2) => t2.id === ticketId)?.agentDisplayName ?? t("support.panel_title") : t("support.panel_title")}
          </div>
          {view === "list" && <div className="text-[11.5px] text-zinc-500">{t("support.panel_subtitle")}</div>}
        </div>
        {view === "thread" && (
          <button
            type="button"
            onClick={closeConversation}
            disabled={closing}
            className="focus-ring flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-zinc-500 hover:text-accent-300 disabled:opacity-50"
            title={t("support.close_button")}
          >
            {t("support.close_button")}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200"
          aria-label={fullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {fullscreen ? (
              <path
                d="M9 4v5H4M15 4v5h5M9 20v-5H4m11 5v-5h5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <path
                d="M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </button>
        <button
          type="button"
          onClick={onMinimize}
          className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200"
          aria-label="Minimize"
          title="Minimize"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      {view === "list" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {tickets === null ? (
              <div className="p-4 text-center text-sm text-zinc-500">Loading…</div>
            ) : tickets.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">{t("support.empty_state")}</div>
            ) : (
              <ul className="divide-y divide-base-800">
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => openTicket(ticket.id)}
                      className="focus-ring flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-base-800/40"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-800 text-[11px] font-semibold text-zinc-400">
                        {ticket.agentDisplayName[0]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-medium text-zinc-100">{ticket.agentDisplayName}</span>
                          <span className="shrink-0 text-[10.5px] text-zinc-500">{formatTime(ticket.lastMessageAt)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="truncate text-[12px] text-zinc-500">{ticket.subject || "New ticket"}</span>
                          {ticket.status === "closed" && (
                            <span className="shrink-0 rounded-full border border-base-700 px-1.5 py-[1px] text-[9.5px] text-zinc-500">
                              Closed
                            </span>
                          )}
                        </span>
                      </span>
                      {ticket.unreadCount > 0 && (
                        <span className="mt-1 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent-500 px-1 text-[9.5px] font-bold text-base-950">
                          {ticket.unreadCount}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="shrink-0 border-t border-base-700 p-3">
            <Button
              onClick={startNewTicket}
              disabled={hasOpenTicket}
              className="w-full"
              title={hasOpenTicket ? t("support.ticket_limit_message") : undefined}
            >
              {t("support.new_ticket_button")}
            </Button>
            {hasOpenTicket && <p className="mt-1.5 text-center text-[11px] text-zinc-500">{t("support.ticket_limit_message")}</p>}
          </div>
        </div>
      )}

      {view === "new" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3.5">
            {!me?.authenticated && (
              <div className="mb-3">
                <label className="mb-1 block text-[12px] text-zinc-500">{t("support.email_prompt_label")}</label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="focus-ring w-full rounded-md border border-base-700 bg-base-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
                <p className="mt-1 text-[11px] text-zinc-500">{t("support.email_prompt_note")}</p>
              </div>
            )}
            <p className="text-[12.5px] text-zinc-500">What can we help with?</p>
          </div>
          {composerBox(sendNewTicket, t("support.compose_placeholder"))}
        </div>
      )}

      {view === "thread" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
            {messages === null ? (
              <div className="text-center text-sm text-zinc-500">Loading…</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.senderType === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-[13px] ${
                      m.senderType === "user" ? "bg-accent-500 text-base-950" : "border border-base-700 bg-base-950 text-zinc-100"
                    } ${m.id.startsWith("temp-") ? "opacity-60" : ""}`}
                  >
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    {m.hasAttachment && m.attachmentUrl && (
                      <img
                        src={m.attachmentUrl}
                        alt={m.attachmentFilename ?? "Attachment"}
                        className={`max-h-48 max-w-full rounded-md object-cover ${m.body ? "mt-1.5" : ""}`}
                      />
                    )}
                    <div className={`mt-1 text-[10px] ${m.senderType === "user" ? "text-base-950/60" : "text-zinc-500"}`}>
                      {formatTime(m.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={threadEndRef} />
          </div>
          {composerBox(sendReply, t("support.reply_placeholder"))}
        </div>
      )}
    </div>
  );
}
