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
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" })
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
  supportTelegramPremiumUrl: string;
  supportTelegramFreeUrl: string;
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
  videoEmbedUrl: string | null;
  videoCompleted: boolean;
  isLastFreeLesson: boolean;
  /** Sequentially reached but payment-gated: show a locked preview, not the real video. */
  isLocked: boolean;
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
