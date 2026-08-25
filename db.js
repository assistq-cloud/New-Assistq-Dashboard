// db.js — Postgres-backed persistence for the ASSISTQ store.
//
// Why this exists: the original server.js kept its entire dataset in one
// JSON file on local disk (data/store.json). That works on a laptop, but on
// Railway/Render the container filesystem is rebuilt on every deploy and can
// be reset on restart — so every client, lead, and conversation vanished.
//
// This module swaps the file for a real Postgres database while keeping the
// exact same readStore()/writeStore() functions server.js already calls
// everywhere (synchronously, dozens of call sites). To do that without
// rewriting every route handler to async/await:
//   - The full store is kept in memory (cachedStore) for instant sync reads.
//   - On boot, initDB() loads the latest copy from Postgres into memory.
//   - Every writeStore(s) updates memory immediately AND queues an async
//     write to Postgres, serialized so writes can never race or land
//     out of order.
//
// The data itself stays as one JSON blob (a single row), so none of
// server.js's existing logic has to change — only where it's saved.
import pg from "pg";
const { Pool } = pg;

let pool = null;
let cachedStore = null;
let writeChain = Promise.resolve();

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add a Postgres database and set DATABASE_URL " +
      "in your environment (Railway/Render inject this automatically when you " +
      "attach a Postgres service — see DATABASE_SETUP.md)."
    );
  }
  return url;
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistq_store (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);
}

// Call once at startup, before app.listen(). Populates the in-memory cache
// from Postgres, creating the row with defaultStore if this is a fresh DB.
export async function initDB(defaultStore) {
  const url = connectionString();
  // Local dev Postgres, and Railway's own *internal* Postgres hostname
  // (postgres.railway.internal, used when app + DB are linked in the same
  // project) both run without SSL. Public/external hosts (Render, Supabase,
  // Railway's public proxy host, etc.) require it. Rather than guess wrong
  // and crash-loop the app, try SSL first, then fall back automatically.
  const looksInternal = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url);
  const attempts = looksInternal
    ? [false, { rejectUnauthorized: false }]
    : [{ rejectUnauthorized: false }, false];

  let lastErr;
  for (const ssl of attempts) {
    const candidate = new Pool({ connectionString: url, ssl });
    try {
      await candidate.query("SELECT 1");
      pool = candidate;
      console.log(`ASSISTQ: connected to Postgres (ssl=${ssl ? "on" : "off"}).`);
      break;
    } catch (err) {
      lastErr = err;
      await candidate.end().catch(() => {});
    }
  }
  if (!pool) {
    throw new Error(
      `Could not connect to Postgres with or without SSL. Last error: ${lastErr?.message}`
    );
  }

  await ensureTable();

  const { rows } = await pool.query("SELECT data FROM assistq_store WHERE id = 1");
  if (rows.length === 0) {
    await pool.query("INSERT INTO assistq_store (id, data) VALUES (1, $1)", [
      JSON.stringify(defaultStore),
    ]);
    cachedStore = JSON.parse(JSON.stringify(defaultStore));
    console.log("ASSISTQ: no existing data found in Postgres — seeded default store.");
  } else {
    cachedStore = rows[0].data;
    console.log("ASSISTQ: loaded existing store from Postgres.");
  }

  // Belt-and-suspenders: make sure the process doesn't die silently if the
  // DB connection drops (Pool emits 'error' on idle client failures).
  pool.on("error", (err) => console.error("ASSISTQ: Postgres pool error", err));
}

// Synchronous read, matching the old fs.readFileSync-based behaviour: every
// call returns a fresh deep copy so callers can freely mutate it without
// touching the shared cache until they explicitly call writeStore().
export function readStore() {
  if (cachedStore === null) {
    throw new Error("readStore() called before initDB() finished — check startup order.");
  }
  return JSON.parse(JSON.stringify(cachedStore));
}

// Synchronous-looking write: updates the in-memory cache immediately (so the
// very next readStore() call in the same request sees it), then queues the
// Postgres write. Writes are chained one after another so two rapid writes
// can never race and overwrite each other out of order.
export function writeStore(s) {
  cachedStore = s;
  const payload = JSON.stringify(s);
  writeChain = writeChain
    .then(() =>
      pool.query(
        "UPDATE assistq_store SET data = $1, updated_at = now() WHERE id = 1",
        [payload]
      )
    )
    .catch((err) => {
      console.error("ASSISTQ: failed to persist store to Postgres", err);
    });
}

// Optional: await this if you need to be sure every pending write has
// landed in Postgres (e.g. before a graceful shutdown).
export function flushPendingWrites() {
  return writeChain;
}
