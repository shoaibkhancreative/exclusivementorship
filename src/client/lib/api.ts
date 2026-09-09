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
  /** Always-public destination for anonymous/free visitors. The paid-mentor Telegram link is intentionally not here — see MeResponse.supportTelegramUrl. */
  supportTelegramFreeUrl: string;
}

export interface MeResponse {
  authenticated: boolean;
  email?: string;
  displayName?: string;
  currentLesson?: number;
  courseStatus?: "free" | "paid";
  freeLessonCount?: number;
  /** Server-resolved from the real session course_status — only present when authenticated. */
  supportTelegramUrl?: string;
}

export interface OutlineItem {
  lessonNumber: number;
  title: string;
  chapterName: string;
  tagline: string | null;
  thumbnailUrl: string | null;
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
