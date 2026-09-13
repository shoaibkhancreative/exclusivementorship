const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ALLOWED_URL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function normalizeOptionalUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!isSafeHttpUrl(trimmed)) {
    throw new Error("invalid_url");
  }
  return trimmed;
}

export function decodeImageDataUrl(
  dataUrl: string,
  maxBytes: number,
  allowedMimeTypes: Set<string>
): { bytes: Uint8Array; mime: string } {
  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) throw new Error("invalid_attachment");
  const mime = match[1].toLowerCase();
  if (!allowedMimeTypes.has(mime)) throw new Error("invalid_mime");

  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    throw new Error("invalid_attachment");
  }

  if (binary.length > maxBytes) throw new Error("attachment_too_large");

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

export function normalizeLessonThumbnail(
  value: string | null | undefined,
  maxBytes: number,
  allowedMimeTypes: Set<string>
): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (isSafeHttpUrl(trimmed)) return trimmed;
  try {
    decodeImageDataUrl(trimmed, maxBytes, allowedMimeTypes);
  } catch {
    throw new Error("invalid_thumbnail");
  }
  return trimmed;
}

const DURATION_LABEL_PATTERN = /^\d{1,2}(:\d{2}){1,2}$/;

export function normalizeLessonDuration(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!DURATION_LABEL_PATTERN.test(trimmed)) {
    throw new Error("invalid_duration");
  }
  return trimmed;
}

export function parsePositiveIntId(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function validateIdArray(value: unknown, maxLength = 500): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxLength) return null;
  const ids: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isSafeInteger(entry) || entry <= 0) return null;
    ids.push(entry);
  }
  return ids;
}
