// Shared input-validation helpers used by the admin routes.
//
// Every "paste a link" field an admin can set (lesson video/thumbnail URLs,
// site logo/favicon, the homepage intro video) is
// rendered back out on the PUBLIC site — as an <iframe src>, an <img src>,
// or a plain link. None of it is attacker-controlled today (only an
// authenticated admin can set these), but validating the URL scheme here
// is a cheap, meaningful defense-in-depth measure: it means a compromised
// or careless admin account can never turn one of these fields into a
// `javascript:`/`data:`/`vbscript:` URI that executes in a visitor's
// browser, and it catches obvious typos (a bare domain with no scheme)
// before they reach the public site as a broken link.

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * True if `value` is a syntactically valid absolute URL using http or
 * https. Empty string / undefined are NOT valid here — callers that treat
 * "clear this field" as a separate, explicit case (empty string/null) must
 * check for that themselves before calling this.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ALLOWED_URL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Validates an optional URL field for an admin form: `undefined` (field
 * omitted) and `""` (explicitly cleared) both pass through as `null`
 * (nothing to store / falls back to default). Any non-empty value must be
 * a safe absolute http(s) URL, or this throws `"invalid_url"` so the route
 * can turn it into a clean 400 rather than silently storing something
 * unsafe or broken.
 */
export function normalizeOptionalUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!isSafeHttpUrl(trimmed)) {
    throw new Error("invalid_url");
  }
  return trimmed;
}

/**
 * Decodes a `data:<mime>;base64,<...>` URL (what a client's canvas
 * resize/compress step produces — see support-chat attach flow) into raw
 * bytes, enforcing the image-mimetype allowlist and the hard byte-size cap
 * server-side, independent of whatever the client claims. Used by both
 * routes/support.ts and routes/admin-support.ts so the two attach flows
 * (learner + admin reply) can never diverge in what they'll accept.
 *
 * Throws "invalid_attachment" for a malformed/non-data URL, "invalid_mime"
 * for a disallowed content type, and "attachment_too_large" for anything
 * over `maxBytes`.
 */
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

/**
 * Validates an optional lesson thumbnail field for an admin form. Unlike
 * `normalizeOptionalUrl`, this accepts TWO shapes:
 *
 *   1. A safe absolute http(s) URL (unchanged behaviour — lets existing
 *      lessons that still point at an external image keep working).
 *   2. A `data:<mime>;base64,<...>` URL — what the admin panel's file-upload
 *      flow produces client-side (see fileToCompressedDataUrl in
 *      client/lib/imageAttachment.ts) after resizing/compressing the picked
 *      image. Decoded and re-checked against `maxBytes`/`allowedMimeTypes`
 *      server-side via decodeImageDataUrl — never trusting the client's own
 *      resize step — but the ORIGINAL data URL string (not the decoded
 *      bytes) is what's returned, since that's what gets stored verbatim in
 *      `lessons.thumbnail_url` and rendered straight back out as an
 *      `<img src>`/CSS background-image.
 *
 * `undefined` (field omitted) and `""` (explicitly cleared) both pass
 * through as `null`, same convention as normalizeOptionalUrl. Throws
 * `"invalid_thumbnail"` for anything else so the route can turn it into a
 * clean 400.
 */
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

/**
 * Matches a duration label like "9:05", "12:45", or "1:04:30" — one or two
 * leading digits for minutes/hours, then one or more `:SS` groups of
 * exactly two digits each. Deliberately permissive about the leading
 * number (so both "5:00" and "05:00" are fine) but strict about the
 * trailing groups, since those are always seconds and must be zero-padded.
 */
const DURATION_LABEL_PATTERN = /^\d{1,2}(:\d{2}){1,2}$/;

/**
 * Validates the admin-entered, per-lesson video duration label (e.g.
 * "12:45") used for the thumbnail duration badge — see migration 0018.
 * This is never auto-detected from the video itself; it's just free text
 * an admin types in, checked here only to keep the badge from ever
 * rendering garbage. `undefined` (field omitted) and `""` (explicitly
 * cleared) both pass through as `null`. Throws `"invalid_duration"` for
 * anything that doesn't look like `m:ss`, `mm:ss`, or `h:mm:ss`.
 */
export function normalizeLessonDuration(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!DURATION_LABEL_PATTERN.test(trimmed)) {
    throw new Error("invalid_duration");
  }
  return trimmed;
}

/**
 * Parses a route param (e.g. `c.req.param("id")`) as a positive integer
 * database id. Returns null for anything that isn't a clean positive
 * integer — including "NaN"-producing input like "abc", "1.5", "-1", "0",
 * or an empty string — so callers can return a clean 400/404 instead of
 * letting a NaN reach a D1 `.bind()` call (which throws an unhandled
 * "Type 'number' with value 'NaN' not supported" error that previously
 * surfaced as an opaque 500).
 */
export function parsePositiveIntId(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Validates a client-submitted array of database ids (bulk actions,
 * reorder payloads): every element must be a positive integer, the array
 * must be non-empty, and — as defense-in-depth against a compromised/
 * careless admin session building a pathologically large request — capped
 * at `maxLength` entries (well beyond any realistic course size). Returns
 * null (rather than throwing) so every call site can turn a bad payload
 * into a uniform 400.
 */
export function validateIdArray(value: unknown, maxLength = 500): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxLength) return null;
  const ids: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isSafeInteger(entry) || entry <= 0) return null;
    ids.push(entry);
  }
  return ids;
}
