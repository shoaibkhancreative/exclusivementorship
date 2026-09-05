// A minimal D1Database-compatible adapter backed by Node's built-in
// node:sqlite, used ONLY for tests. It implements the small subset of the
// D1 prepared-statement API that our worker code actually calls
// (prepare().bind().first()/.all()/.run()), so our real route/service code
// can be exercised against a real SQLite engine without needing a live
// `wrangler dev`/Miniflare process.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// Loaded via CJS require (through the well-known "node:module" built-in)
// rather than a static/dynamic ESM import, because Vite/vitest's SSR module
// graph mishandles the "node:sqlite" specifier (an experimental Node
// built-in) during transform even with /* @vite-ignore */. require() is
// untouched by that analysis and resolves it natively at runtime.
const nodeRequire = createRequire(import.meta.url);

export async function createTestD1() {
  const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
  const db = new DatabaseSync(":memory:");

  // Apply every migration in order (not just 0001) so the in-memory test DB
  // schema always matches what actually gets deployed via `wrangler d1
  // migrations apply`.
  const migrationsDir = join(__dirname, "..", "migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    const migration = readFileSync(join(migrationsDir, file), "utf-8");
    db.exec(migration);
  }
  const seed = readFileSync(join(__dirname, "..", "seed", "seed.sql"), "utf-8");
  db.exec(seed);

  function boundStatement(stmt: ReturnType<typeof db.prepare>, args: unknown[]) {
    return {
      async first<T>() {
        const row = stmt.get(...(args as never[]));
        return (row ?? null) as T | null;
      },
      async all<T>() {
        const rows = stmt.all(...(args as never[]));
        return { results: rows as T[], success: true, meta: {} };
      },
      async run() {
        const info = stmt.run(...(args as never[]));
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      }
    };
  }

  const fakeD1 = {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      // Mirrors D1's real API: .first()/.all()/.run() are callable directly
      // (for parameterless statements) OR after .bind(...args).
      return {
        ...boundStatement(stmt, []),
        bind(...args: unknown[]) {
          return boundStatement(stmt, args);
        }
      };
    }
  };

  return { db, fakeD1 };
}
