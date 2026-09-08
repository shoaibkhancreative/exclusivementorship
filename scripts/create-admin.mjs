#!/usr/bin/env node
// Bootstraps an admin account. There is no admin sign-up route on purpose —
// this script is the only way an `admins` row is ever created.
//
// Usage:
//   node scripts/create-admin.mjs you@example.com "a strong password" --local
//   node scripts/create-admin.mjs you@example.com "a strong password" --remote
//
// --local (default)  -> writes to the local D1 (wrangler dev) database
// --remote            -> writes to the REAL production D1 database
//
// The password hash format produced here (`pbkdf2:<iterations>:<saltHex>:<hashHex>`)
// is byte-for-byte compatible with src/worker/lib/crypto.ts's hashPassword/
// verifyPassword, since both use PBKDF2-SHA256 via Web Crypto
// (`crypto.subtle`) — this script just imports it from Node's
// `node:crypto` webcrypto implementation instead of the Workers runtime.

import { webcrypto as crypto } from "node:crypto";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_BYTES = 32;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8
  );
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toHex(saltBytes.buffer)}:${toHex(derived)}`;
}

function escapeSqlString(value) {
  return value.replace(/'/g, "''");
}

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const positional = args.filter((a) => !a.startsWith("--"));
  const [email, password] = positional;
  const target = flags.includes("--remote") ? "--remote" : "--local";

  if (!email || !password) {
    console.error('Usage: node scripts/create-admin.mjs <email> "<password>" [--local|--remote]');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const id = randomUUID();
  const passwordHash = await hashPassword(password);

  const sql =
    `INSERT INTO admins (id, email, password_hash) VALUES ` +
    `('${id}', '${escapeSqlString(normalizedEmail)}', '${passwordHash}') ` +
    `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash;`;

  console.log(`Creating/updating admin '${normalizedEmail}' in the ${target.slice(2)} database...`);

  // Written to a temp .sql file and run via `--file=` (same as db:seed:*)
  // instead of passing the SQL inline via `--command`. This sidesteps a
  // real-world Windows footgun: `npx`/`wrangler` are .cmd files there, so
  // Node has to relaunch them through cmd.exe, and cmd.exe's own argument
  // parsing can mangle a long inline SQL string (parentheses, quotes,
  // etc. from ON CONFLICT(...) or a password's derived hash). A bare file
  // path has none of that risk on any OS.
  const tempFile = join(tmpdir(), `create-admin-${id}.sql`);
  writeFileSync(tempFile, sql, "utf-8");

  try {
    // Windows needs the .cmd extension named explicitly to launch npx
    // (batch files aren't directly executable there) — Node then wraps it
    // through cmd.exe internally with correct argument escaping on its
    // own, so no shell:true / DEP0190 warning is needed. macOS/Linux just
    // use the plain "npx" binary, spawned directly with no shell at all.
    const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
    execFileSync(
      npxCommand,
      ["wrangler", "d1", "execute", "exclusive-mentorship-db", target, "--file", tempFile],
      { stdio: "inherit" }
    );
    console.log(`\nDone. You can now log in at /admin/login with:\n  email: ${normalizedEmail}`);
  } catch (err) {
    console.error("\nwrangler d1 execute failed. If you'd rather run it yourself, here's the SQL:\n");
    console.error(sql);
    process.exit(1);
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {
      // best-effort cleanup only
    }
  }
}

main();
