import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// built-in) during transform even with /* @vite-ignore */. require() is
const nodeRequire = createRequire(import.meta.url);

export async function createTestD1() {
  const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
  const db = new DatabaseSync(":memory:");

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
