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
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined })
};

export interface PublicConfig {
  enrollmentPrice: number;
  referencePrice: number;
  discountPercent: number;
  mentorshipPdfUrl: string;
  turnstileSiteKey: string;
}

export interface MeResponse {
  authenticated: boolean;
  email?: string;
  currentLesson?: number;
  courseStatus?: "free" | "paid";
}

export interface OutlineItem {
  lessonNumber: number;
  title: string;
  chapterName: string;
  thumbnailUrl: string | null;
  isFree: boolean;
  state: "locked" | "available" | "current" | "completed";
}

export interface OutlineResponse {
  outline: OutlineItem[];
  currentLesson: number;
  courseStatus: "free" | "paid";
  freeLessonCount: number;
}

export interface LessonDetail {
  lessonNumber: number;
  title: string;
  chapterName: string;
  description: string | null;
  youtubeVideoId: string;
  assignmentTitle: string | null;
  assignmentInstruction: string | null;
  videoCompleted: boolean;
  assignmentSubmitted: boolean;
  isLastFreeLesson: boolean;
}
