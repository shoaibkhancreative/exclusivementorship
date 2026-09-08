// A minimal R2Bucket-compatible in-memory stand-in, used ONLY for tests.
// Implements just the subset of the API our worker code actually calls:
// put / get / delete. Mirrors fakeD1.ts's approach for D1.

export function createTestR2(): R2Bucket {
  const store = new Map<string, { body: Uint8Array; httpMetadata?: { contentType?: string } }>();

  const bucket = {
    async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }) {
      let bytes: Uint8Array;
      if (typeof value === "string") {
        bytes = new TextEncoder().encode(value);
      } else if (value instanceof Uint8Array) {
        bytes = value;
      } else {
        bytes = new Uint8Array(value);
      }
      store.set(key, { body: bytes, httpMetadata: options?.httpMetadata });
      return { key } as unknown;
    },
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        body: new Response(entry.body.slice()).body,
        httpMetadata: entry.httpMetadata,
        async text() {
          return new TextDecoder().decode(entry.body);
        }
      } as unknown;
    },
    async delete(key: string) {
      store.delete(key);
    }
  };

  return bucket as unknown as R2Bucket;
}
