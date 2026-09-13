import type { Env } from "./config";

const DEFAULT_TTL_SECONDS = 120;

export async function getCached<T>(
  env: Env,
  key: string,
  loader: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<T> {
  if (!env.CONFIG_CACHE) {
    return loader();
  }

  try {
    const cached = await env.CONFIG_CACHE.get(key, "json");
    if (cached !== null) {
      return cached as T;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`CONFIG_CACHE get failed for key "${key}"`, err);
  }

  const fresh = await loader();

  try {
    await env.CONFIG_CACHE.put(key, JSON.stringify(fresh), { expirationTtl: ttlSeconds });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`CONFIG_CACHE put failed for key "${key}"`, err);
  }

  return fresh;
}

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
  lessonsOutline: "lessons:outline"
} as const;

export const SESSION_CACHE_TTL_SECONDS = 45;

export function sessionCacheKey(tokenHash: string): string {
  return `session:${tokenHash}`;
}

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
