import type { Env } from "./config";

/**
 * Thin cache-aside helper around the CONFIG_CACHE KV namespace.
 * Used for read-mostly, admin-editable data (public config, page content,
 * page layout) that gets read on nearly every page load but changes rarely
 * — the goal is to keep those reads off D1 entirely most of the time.
 *
 * TTL is deliberately short (default 2 minutes): if a KV purge on save
 * ever fails silently, the cache still self-heals within that window
 * instead of serving stale data indefinitely.
 */
const DEFAULT_TTL_SECONDS = 120;

export async function getCached<T>(
  env: Env,
  key: string,
  loader: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<T> {
  // No binding configured (e.g. an older deploy that hasn't added the KV
  // namespace yet) — fall straight through to D1 rather than throwing.
  if (!env.CONFIG_CACHE) {
    return loader();
  }

  try {
    const cached = await env.CONFIG_CACHE.get(key, "json");
    if (cached !== null) {
      return cached as T;
    }
  } catch (err) {
    // A KV read hiccup should never take the public site down with it.
    // eslint-disable-next-line no-console
    console.error(`CONFIG_CACHE get failed for key "${key}"`, err);
  }

  const fresh = await loader();

  try {
    await env.CONFIG_CACHE.put(key, JSON.stringify(fresh), { expirationTtl: ttlSeconds });
  } catch (err) {
    // Same here — a failed cache write just means the next request pays
    // the D1 cost again; it must never fail the request itself.
    // eslint-disable-next-line no-console
    console.error(`CONFIG_CACHE put failed for key "${key}"`, err);
  }

  return fresh;
}

/** Deletes one or more cache keys. Safe to call even if CONFIG_CACHE isn't bound. */
export async function purgeCache(env: Env, ...keys: string[]): Promise<void> {
  if (!env.CONFIG_CACHE) return;
  const kv = env.CONFIG_CACHE;
  await Promise.all(
    keys.map((key) =>
      kv.delete(key).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`CONFIG_CACHE delete failed for key "${key}"`, err);
      })
    )
  );
}

export const CACHE_KEYS = {
  publicConfig: "config:public",
  content: "config:content",
  layout: "config:layout",
  // The shared (non-personalized) part of GET /api/lessons — the lessons
  // list, chapters, and free-lesson-count — which used to be read straight
  // from D1 on every single call to the most-hit endpoint on the site
  // (every anonymous homepage/outline view). Per-user progress/state is
  // still computed fresh per-request outside this cache. See lessons.ts.
  lessonsOutline: "lessons:outline"
} as const;

/**
 * How long a resolved session (token hash → user row) is trusted from KV
 * before resolveSession() re-checks D1. Short on purpose: this is the
 * window during which a just-revoked/logged-out session could still be
 * treated as valid by a request that hit the cache instead of D1. 45s is a
 * reasonable trade for cutting the two D1 reads that would otherwise
 * happen on every single authenticated request.
 */
export const SESSION_CACHE_TTL_SECONDS = 45;

export function sessionCacheKey(tokenHash: string): string {
  return `session:${tokenHash}`;
}

/** Generic (non-JSON-assuming) KV read, used for the session cache. */
export async function getRawCached(env: Env, key: string): Promise<string | null> {
  if (!env.CONFIG_CACHE) return null;
  try {
    return await env.CONFIG_CACHE.get(key);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`CONFIG_CACHE get failed for key "${key}"`, err);
    return null;
  }
}

export async function putRawCached(env: Env, key: string, value: string, ttlSeconds: number): Promise<void> {
  if (!env.CONFIG_CACHE) return;
  try {
    await env.CONFIG_CACHE.put(key, value, { expirationTtl: ttlSeconds });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`CONFIG_CACHE put failed for key "${key}"`, err);
  }
}