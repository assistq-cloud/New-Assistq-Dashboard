// db.js — Postgres-backed persistence for the ASSISTQ store.
//
// HISTORY: this used to keep the ENTIRE dataset — every client, every lead,
// every conversation, all of it — as one JSON blob in a single Postgres row.
// That was fine at a handful of clients, but breaks down as real client
// count grows past roughly 50:
//   - Every write sent the WHOLE blob back to Postgres, even to change one
//     field on one lead — so one busy client's writes queued up behind
//     every other client's, and write cost scaled with TOTAL data across
//     ALL clients, not just the client actually being touched.
//   - Postgres MVCC means constantly UPDATE-ing one single row creates a
//     new row version every time — a hot single row under constant writes
//     bloats badly and needs frequent VACUUMing to stay healthy. Spreading
//     writes across many rows (one per client) avoids this entirely.
//   - The blob only ever grows, forever, coupling every client's
//     performance to the size of everyone else's data combined.
//
// THE FIX: shard storage into one row per client (assistq_client_data),
// plus one small row for genuinely cross-client data — the client account
// list, admin settings/security (assistq_global). Writes are diffed against
// what was last persisted, so a normal request that only touched one
// client's data results in exactly one small row write, not a rewrite of
// everyone's.
//
// WHY server.js DIDN'T NEED TO CHANGE: server.js calls readStore()/
// writeStore() synchronously, dozens of call sites, all still expecting
// the exact same single merged object shape it always has (s.leads,
// s.realEstate.visits, etc. as flat arrays spanning every client). Rather
// than rewrite every route to async per-client queries — a much larger,
// far riskier change — this module still assembles that exact same merged
// shape in memory (mergeStore below) and hands it out synchronously. Only
// the Postgres I/O underneath changed; server.js's own logic is untouched.
//
// A NOTE FOR FUTURE CHANGES: if a new top-level field is ever added to
// defaultStore in server.js, add it to one of the classification lists
// below (GLOBAL fields / PER_CLIENT_ARRAY_KEYS / PER_CLIENT_OBJECT_KEYS /
// RE_ARRAY_KEYS / RE_OBJECT_KEYS) so it gets sharded correctly. Anything
// NOT listed anywhere defaults to staying in the global row — safe (never
// lost), just not sharded for write-scaling purposes.
import pg from "pg";
const { Pool } = pg;

let pool = null;

export function getDBPool() {
  if (!pool) throw new Error("Postgres is not initialized yet.");
  return pool;
}
let cachedStore = null;       // the full merged object, exactly as before
let writeChain = Promise.resolve();
let lastWrittenGlobal = null;               // JSON string of last-persisted global slice
let lastWrittenClient = new Map();          // clientId -> JSON string of last-persisted shard

// ---------- schema classification (see note above) ----------
const PER_CLIENT_ARRAY_KEYS = ["keywords", "leads", "reportHistory"];
const PER_CLIENT_OBJECT_KEYS = ["clientProfiles", "seoAudits", "whatsappThreads"];
const RE_ARRAY_KEYS = ["projects","team","visits","followups","activities","inventory","channelPartners","adSpend","documents","commissions","possession","testimonials"];
const RE_OBJECT_KEYS = ["automationByClient","roundRobin"];

// Canonical, key-order-independent JSON serialization — see note above.
// Arrays keep their order (meaningful data); object keys are sorted
// recursively so the same logical value always serializes identically,
// regardless of insertion order or a round trip through Postgres jsonb.
function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(v => v === undefined ? "null" : stableStringify(v)).join(",") + "]";
  if (value && typeof value === "object") {
    // undefined-valued keys are dropped entirely, matching native
    // JSON.stringify's own behaviour (this is exactly how emptyShard()
    // represents "this client has no entry here" — see note there).
    const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function emptyShard() {
  const shard = { conversations: {}, utm: {}, realEstate: {} };
  for (const k of PER_CLIENT_ARRAY_KEYS) shard[k] = [];
  // Deliberately NOT defaulted to {} — undefined here means "this client
  // genuinely has no entry for this field", matching the original data's
  // shape (e.g. a client with no SEO audit yet has no seoAudits[clientId]
  // key at all, not an empty-object placeholder). undefined fields are
  // dropped by JSON.stringify on write and simply absent on read, so this
  // round-trips correctly through Postgres without special-casing.
  for (const k of PER_CLIENT_OBJECT_KEYS) shard[k] = undefined;
  shard.gscByClient = undefined; shard.ga4ByClient = undefined; shard.googleByClient = undefined;
  for (const k of RE_ARRAY_KEYS) shard.realEstate[k] = [];
  for (const k of RE_OBJECT_KEYS) shard.realEstate[k] = undefined;
  return shard;
}

// Splits the full merged store into { global, shards: Map<clientId, shard> }
// — orphans catches any per-client-shaped data whose clientId doesn't match
// a known client (e.g. a deleted client's leftover leads), so a deletion or
// a bad clientId can never silently destroy data — it just lands in the
// global row's __orphans bucket instead, still inspectable.
function partitionStore(s) {
  const clientIds = new Set((s.clients || []).map(c => c.id));
  const global = {
    settings: s.settings, clients: s.clients, security: s.security,
    gsc: { connected: s.gsc?.connected, property: s.gsc?.property, rows: s.gsc?.rows, syncedAt: s.gsc?.syncedAt },
    ga4: { connected: s.ga4?.connected, propertyId: s.ga4?.propertyId, metrics: s.ga4?.metrics, rows: s.ga4?.rows, syncedAt: s.ga4?.syncedAt },
    realEstate: { automation: s.realEstate?.automation },
    __orphans: {}
  };
  const shards = new Map();
  const orphanBucket = (key) => { global.__orphans[key] = global.__orphans[key] || []; return global.__orphans[key]; };
  const shardFor = (cid) => { if (!shards.has(cid)) shards.set(cid, emptyShard()); return shards.get(cid); };

  for (const key of PER_CLIENT_ARRAY_KEYS) {
    for (const item of (s[key] || [])) {
      const cid = item && item.clientId;
      if (cid && clientIds.has(cid)) shardFor(cid)[key].push(item);
      else orphanBucket(key).push(item);
    }
  }
  for (const key of PER_CLIENT_OBJECT_KEYS) {
    for (const [cid, val] of Object.entries(s[key] || {})) {
      if (clientIds.has(cid)) shardFor(cid)[key] = val;
      else (global.__orphans[key] = global.__orphans[key] || {})[cid] = val;
    }
  }
  for (const [cid, val] of Object.entries(s.conversations || {})) {
    const owner = val && val.clientId;
    if (owner && clientIds.has(owner)) shardFor(owner).conversations[cid] = val;
    else orphanBucket("conversations").push({ id: cid, ...val });
  }
  for (const [key, val] of Object.entries(s.utm || {})) {
    const cid = String(key).split("|")[0];
    if (clientIds.has(cid)) shardFor(cid).utm[key] = val;
    else orphanBucket("utm").push({ key, val });
  }
  for (const [cid, val] of Object.entries(s.gsc?.byClient || {})) { if (clientIds.has(cid)) shardFor(cid).gscByClient = val; }
  for (const [cid, val] of Object.entries(s.ga4?.byClient || {})) { if (clientIds.has(cid)) shardFor(cid).ga4ByClient = val; }
  for (const [cid, val] of Object.entries(s.google?.byClient || {})) { if (clientIds.has(cid)) shardFor(cid).googleByClient = val; }
  for (const key of RE_ARRAY_KEYS) {
    for (const item of (s.realEstate?.[key] || [])) {
      const cid = item && item.clientId;
      if (cid && clientIds.has(cid)) shardFor(cid).realEstate[key].push(item);
      else orphanBucket("realEstate." + key).push(item);
    }
  }
  for (const key of RE_OBJECT_KEYS) {
    for (const [cid, val] of Object.entries(s.realEstate?.[key] || {})) {
      if (clientIds.has(cid)) shardFor(cid).realEstate[key] = val;
      else (global.__orphans["realEstate." + key] = global.__orphans["realEstate." + key] || {})[cid] = val;
    }
  }
  // make sure every known client has at least an empty shard row, even one
  // with no data yet at all (a just-created client) — keeps client_ids in
  // Postgres matching s.clients exactly, so deletion detection works.
  for (const cid of clientIds) shardFor(cid);

  return { global, shards };
}

// The exact inverse of partitionStore — rebuilds the single merged object
// server.js expects, from a global slice + every client's shard.
function mergeStore(global, shardEntries /* iterable of [clientId, shard] */) {
  const s = {
    settings: global.settings, clients: global.clients, security: global.security,
    keywords: [], leads: [], reportHistory: [], clientProfiles: {}, seoAudits: {}, whatsappThreads: {},
    conversations: {}, utm: {},
    gsc: { ...(global.gsc || {}), byClient: {} },
    ga4: { ...(global.ga4 || {}), byClient: {} },
    google: { byClient: {} },
    realEstate: { automation: global.realEstate?.automation, automationByClient: {}, roundRobin: {} }
  };
  for (const key of RE_ARRAY_KEYS) s.realEstate[key] = [];

  for (const [cid, shard] of shardEntries) {
    for (const key of PER_CLIENT_ARRAY_KEYS) s[key].push(...(shard[key] || []));
    for (const key of PER_CLIENT_OBJECT_KEYS) if (shard[key] !== undefined && shard[key] !== null) s[key][cid] = shard[key];
    Object.assign(s.conversations, shard.conversations || {});
    Object.assign(s.utm, shard.utm || {});
    if (shard.gscByClient !== undefined) s.gsc.byClient[cid] = shard.gscByClient;
    if (shard.ga4ByClient !== undefined) s.ga4.byClient[cid] = shard.ga4ByClient;
    if (shard.googleByClient !== undefined) s.google.byClient[cid] = shard.googleByClient;
    for (const key of RE_ARRAY_KEYS) s.realEstate[key].push(...((shard.realEstate || {})[key] || []));
    for (const key of RE_OBJECT_KEYS) { const v = (shard.realEstate || {})[key]; if (v !== undefined && v !== null) s.realEstate[key][cid] = v; }
  }

  // Orphaned data (from a deleted/unknown client) is never dropped — folded
  // back in under its original top-level key so ensureStoreShape() and any
  // admin tooling can still see it exists, just no longer tied to an active
  // client's views.
  const orphans = global.__orphans || {};
  for (const key of PER_CLIENT_ARRAY_KEYS) if (orphans[key]) s[key].push(...orphans[key]);
  for (const key of RE_ARRAY_KEYS) if (orphans["realEstate." + key]) s.realEstate[key].push(...orphans["realEstate." + key]);
  if (orphans.conversations) for (const c of orphans.conversations) { const { id, ...rest } = c; s.conversations[id] = rest; }
  if (orphans.utm) for (const { key, val } of orphans.utm) s.utm[key] = val;

  return s;
}

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

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistq_global (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistq_client_data (
      client_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assistq_client_data_updated ON assistq_client_data (updated_at);`);
  // Persistent session storage for Railway production. The default
  // express-session MemoryStore loses all login sessions whenever the
  // process restarts or a new deployment replaces the container.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistq_sessions (
      sid TEXT PRIMARY KEY,
      sess JSONB NOT NULL,
      expire TIMESTAMPTZ NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assistq_sessions_expire ON assistq_sessions (expire);`);
}

// One-time migration path: if this deployment previously used the old
// single-row assistq_store table and the new sharded tables are empty,
// load the old blob and partition it into the new tables — so upgrading
// to this version never loses existing data. Safe to leave the old table
// in place afterward (unused, harmless) rather than risk a destructive drop.
async function migrateFromLegacyStoreIfNeeded(defaultStore) {
  const { rows: globalRows } = await pool.query("SELECT 1 FROM assistq_global WHERE id = 1");
  const { rows: clientRows } = await pool.query("SELECT 1 FROM assistq_client_data LIMIT 1");
  if (globalRows.length || clientRows.length) return false; // already on the new schema

  const legacy = await pool.query(`SELECT to_regclass('public.assistq_store') as exists`);
  if (!legacy.rows[0]?.exists) return false; // fresh install, nothing to migrate

  const { rows } = await pool.query("SELECT data FROM assistq_store WHERE id = 1");
  if (!rows.length) return false;

  console.log("ASSISTQ: migrating existing data from single-row storage to per-client storage...");
  const legacyStore = rows[0].data;
  const { global, shards } = partitionStore({ ...defaultStore, ...legacyStore });
  await persist(global, shards, true);
  console.log(`ASSISTQ: migration complete — ${shards.size} client(s) migrated.`);
  return true;
}

async function persist(global, shards, isFullRewrite = false) {
  const globalJSON = stableStringify(global);
  const toWrite = [];
  for (const [cid, shard] of shards) {
    const json = stableStringify(shard);
    if (isFullRewrite || lastWrittenClient.get(cid) !== json) toWrite.push({ cid, json });
  }
  const toDelete = [];
  if (!isFullRewrite) {
    for (const cid of lastWrittenClient.keys()) if (!shards.has(cid)) toDelete.push(cid);
  }

  const jobs = [];
  if (isFullRewrite || lastWrittenGlobal !== globalJSON) {
    jobs.push(pool.query(
      `INSERT INTO assistq_global (id, data, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [globalJSON]
    ).then(() => { lastWrittenGlobal = globalJSON; }));
  }
  if (toWrite.length) {
    const values = [];
    const placeholders = toWrite.map((r, i) => { values.push(r.cid, r.json); return `($${i*2+1}, $${i*2+2}::jsonb, now())`; }).join(",");
    jobs.push(pool.query(
      `INSERT INTO assistq_client_data (client_id, data, updated_at) VALUES ${placeholders}
       ON CONFLICT (client_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      values
    ).then(() => { for (const r of toWrite) lastWrittenClient.set(r.cid, r.json); }));
  }
  if (toDelete.length) {
    jobs.push(pool.query(`DELETE FROM assistq_client_data WHERE client_id = ANY($1::text[])`, [toDelete])
      .then(() => { for (const cid of toDelete) lastWrittenClient.delete(cid); }));
  }
  await Promise.all(jobs);
}

// Call once at startup, before app.listen(). Populates the in-memory cache
// from Postgres, creating the rows with defaultStore if this is a fresh DB.
export async function initDB(defaultStore) {
  const url = connectionString();
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
    throw new Error(`Could not connect to Postgres with or without SSL. Last error: ${lastErr?.message}`);
  }

  await ensureTables();
  const migrated = await migrateFromLegacyStoreIfNeeded(defaultStore);

  if (!migrated) {
    const { rows: gRows } = await pool.query("SELECT data FROM assistq_global WHERE id = 1");
    if (gRows.length === 0) {
      // Fresh database — seed both tables from defaultStore.
      const { global, shards } = partitionStore(defaultStore);
      await persist(global, shards, true);
      console.log("ASSISTQ: no existing data found in Postgres — seeded default store.");
    }
  }

  const { rows: gRows2 } = await pool.query("SELECT data FROM assistq_global WHERE id = 1");
  const { rows: cRows } = await pool.query("SELECT client_id, data FROM assistq_client_data");
  const global = gRows2[0]?.data || {};
  lastWrittenGlobal = stableStringify(global);
  const shardEntries = cRows.map(r => [r.client_id, r.data]);
  lastWrittenClient = new Map(cRows.map(r => [r.client_id, stableStringify(r.data)]));
  cachedStore = mergeStore(global, shardEntries);
  console.log(`ASSISTQ: loaded store from Postgres (${cRows.length} client row(s)).`);

  pool.on("error", (err) => console.error("ASSISTQ: Postgres pool error", err));
}

// Synchronous read, matching the previous behaviour exactly: every call
// returns a fresh deep copy so callers can freely mutate it without
// touching the shared cache until they explicitly call writeStore().
export function readStore() {
  if (cachedStore === null) {
    throw new Error("readStore() called before initDB() finished — check startup order.");
  }
  return JSON.parse(JSON.stringify(cachedStore));
}

// Synchronous-looking write: updates the in-memory cache immediately (so
// the very next readStore() call in the same request sees it), then queues
// the underlying Postgres writes. Only clients whose data actually changed
// since the last successful write get written — a normal request that
// only touched one client's lead results in one small row write, not a
// rewrite of the whole dataset. Queued and chained so concurrent writes can
// never race or land out of order.
export function writeStore(s) {
  cachedStore = s;
  const { global, shards } = partitionStore(s);
  writeChain = writeChain
    .then(async () => {
      let lastErr;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await persist(global, shards, false);
          return;
        } catch (err) {
          lastErr = err;
          console.error(`ASSISTQ: Postgres write failed (attempt ${attempt}/5):`, err.message);
          if (attempt < 5) await new Promise(r => setTimeout(r, Math.min(2000 * attempt, 8000)));
        }
      }
      // Do not silently pretend the write succeeded. The dirty cache remains
      // in memory, and the error is explicit in logs for Railway monitoring.
      throw lastErr;
    })
    .catch((err) => {
      console.error("ASSISTQ: CRITICAL — data could not be persisted to Postgres after retries:", err.message);
    });
}

// Optional: await this if you need to be sure every pending write has
// landed in Postgres (e.g. before a graceful shutdown).
export function flushPendingWrites() {
  return writeChain;
}
