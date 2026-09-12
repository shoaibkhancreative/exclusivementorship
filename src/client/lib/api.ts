export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "unknown_error", data.message ?? "Something went wrong.");
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined })
};

export interface PublicConfig {
  enrollmentPrice: number;
  referencePrice: number;
  discountPercent: number;
  freeLessonCount: number;
  introVideoEmbedUrl: string | null;
  mentorshipPdfUrl: string;
  turnstileSiteKey: string;
  googleClientId: string | null;
  /** Phase 4 — optional admin-set logo/favicon URLs. Null until an admin sets one; the client keeps its current default appearance when null. */
  siteLogoUrl: string | null;
  siteFaviconUrl: string | null;
}

export interface MeResponse {
  authenticated: boolean;
  email?: string;
  displayName?: string;
  currentLesson?: number;
  courseStatus?: "free" | "paid";
  freeLessonCount?: number;
}

export interface OutlineItem {
  lessonNumber: number;
  title: string;
  chapterName: string;
  tagline: string | null;
  thumbnailUrl: string | null;
  /** Admin-entered display label like "12:45" — shown as a badge on the thumbnail. Null if not set. */
  durationLabel: string | null;
  isFree: boolean;
  state: "locked" | "available" | "current" | "completed" | "preview";
}

export interface SemesterMeta {
  number: number;
  chapterName: string;
  name: string;
  tagline: string;
}

export interface OutlineResponse {
  outline: OutlineItem[];
  currentLesson: number;
  courseStatus: "free" | "paid";
  freeLessonCount: number;
  semesters: SemesterMeta[];
}

export interface LessonDetail {
  lessonNumber: number;
  title: string;
  chapterName: string;
  tagline: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  /** Admin-entered display label like "12:45" — shown as a badge on the thumbnail. Null if not set. */
  durationLabel: string | null;
  videoEmbedUrl: string | null;
  videoCompleted: boolean;
  isLastFreeLesson: boolean;
  /** Not yet watchable — see lockReason for why. Every lesson's page loads regardless. */
  isLocked: boolean;
  /**
   * Why isLocked is true: "sequence" means earlier classes aren't finished
   * yet (finish those first — applies to free and premium classes alike);
   * "payment" means it's been reached in order but is a premium class that
   * hasn't been unlocked yet. Null when isLocked is false.
   */
  lockReason: "sequence" | "payment" | null;
  /** Admin-editable per-lesson setting — only show the identity watermark when true (and the viewer is authenticated). */
  watermarkEnabled: boolean;
}

/** Response from POST /lessons/:number/video-token — see routes/lessons.ts. */
export interface VideoTokenResponse {
  embedUrl: string;
  expiresInSeconds: number;
}

export interface CreateOrderResponse {
  ok: true;
  orderId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  expiresAt: string | null;
  priceUsd: number;
}

export interface PaymentStatusResponse {
  orderId: string;
  status: "created" | "waiting" | "confirming" | "confirmed" | "finished" | "failed" | "expired" | "cancelled";
  courseStatus: "free" | "paid";
  payAddress: string | null;
  payAmount: number | null;
  payCurrency: string | null;
  expiresAt: string | null;
  priceUsd: number;
}

// ---------------------------------------------------------------------------
// Support inbox (in-site chat that replaced the Telegram button) — see
// routes/support.ts / routes/admin-support.ts.
// ---------------------------------------------------------------------------

export type SupportAgentProfileId = "nlt" | "void" | "venom" | "shadow";

export interface SupportTicket {
  id: string;
  subject: string | null;
  status: "open" | "closed";
  agentProfile: SupportAgentProfileId;
  agentDisplayName: string;
  lastMessageAt: string;
  createdAt: string;
  /** The page the learner was on when they opened this ticket (e.g. "/lesson/12"), captured client-side at creation. */
  originPath: string | null;
  unreadCount: number;
}

/** Same shape as SupportTicket, plus what only the admin inbox needs — including enough about the ticket's owner to show "who is this" without a second round trip (see SupportPage.tsx's Users column). */
export interface AdminSupportTicket extends SupportTicket {
  userId: string | null;
  guestId: string | null;
  isGuest: boolean;
  userEmail: string | null;
  userName: string | null;
  guestEmail: string | null;
  courseStatus: "free" | "paid" | null;
  currentLesson: number | null;
  completedLessons: number | null;
  totalLessons: number | null;
  /** True if the learner used "Close conversation" on their side — the ticket's still fully visible/actionable here, just gone from their own list until an admin unhides it. */
  hiddenByUser: boolean;
  lastMessagePreview: string | null;
}

export interface SupportMessage {
  id: string;
  senderType: "user" | "admin";
  body: string | null;
  hasAttachment: boolean;
  attachmentFilename: string | null;
  attachmentMime: string | null;
  createdAt: string;
  /** Fetch this (browser sends the session/guest cookie automatically) to render the actual image — attachment bytes are never inlined in this response. */
  attachmentUrl: string | null;
}

export interface SupportAttachmentInput {
  /** A `data:<mime>;base64,...` URL — produced client-side by resizing/compressing the picked image on a <canvas> before sending. */
  dataUrl: string;
  filename: string;
}

// ---------------------------------------------------------------------------
// In-site notifications (see routes/notifications.ts) — currently only
// 'support_reply' is ever created (an admin reply, or an admin-started new
// conversation); 'assignment_approved'/'assignment_rejected' are reserved
// for the future assignment-review UI (migrations/0008_admin_panel.sql).
// ---------------------------------------------------------------------------

export type NotificationType = "assignment_approved" | "assignment_rejected" | "support_reply";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  unreadCount: number;
}
