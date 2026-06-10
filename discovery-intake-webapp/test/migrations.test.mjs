// Executed tests for the PR 33 session-schema migration framework: the
// sequential migrations registry, v1->v2 registered + idempotent, the
// client/server LOCKSTEP guarantee, and the startup batch over a real sqlite
// DB — .bak creation, refusal naming the failing row, and the no-op path.
// Pure parts use the source-extraction pattern; the batch boots the real
// server.mjs as a child process against a seeded temp DATA_DIR.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, readServerSource, buildSandbox } from "./helpers/extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "..", "server.mjs");
const MIGRATION_PORT = Number(process.env.TEST_MIGRATION_PORT || 5197);

const serverSource = readServerSource();
const appSource = readAppSource();

function v1Fixture() {
  return {
    sessionMeta: { id: "sess-legacy", workflowName: "Legacy Flow" },
    fields: { workflowName: "Legacy Flow" },
    workflowGrid: { schemaVersion: 1, workflowName: "Legacy Flow", steps: [] }
    // no schemaVersion (pre-v2), no businessCaseSnapshot
  };
}

function serverSandbox() {
  return buildSandbox(serverSource, {
    functions: ["migrateSessionStateV2", "migrateSessionRecord"],
    consts: ["SESSION_SCHEMA_VERSION", "SESSION_MIGRATIONS"],
    globals: {}
  });
}

test("migrations run in sequence, each stamping its version", () => {
  const { migrateSessionRecord } = serverSandbox();
  const order = [];
  const fake = [
    { to: 2, name: "a", migrate: (s) => { order.push("a"); s.a = true; } },
    { to: 3, name: "b", migrate: (s) => { order.push("b"); s.b = true; } },
    { to: 4, name: "c", migrate: (s) => { order.push("c"); s.c = true; } }
  ];
  const { state, changed } = migrateSessionRecord({ schemaVersion: 2 }, fake);
  assert.equal(changed, true);
  assert.deepEqual(order, ["b", "c"], "only steps above the current version run, in order");
  assert.equal(state.schemaVersion, 4, "final version stamped");
  assert.ok(!state.a && state.b && state.c);
  // Already at the latest -> untouched.
  const idle = migrateSessionRecord({ schemaVersion: 4 }, fake);
  assert.equal(idle.changed, false);
});

test("v1->v2 is registered and idempotent", () => {
  const { migrateSessionRecord, migrateSessionStateV2 } = serverSandbox();
  const first = migrateSessionRecord(v1Fixture()).state;
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.businessCaseSnapshot, null, "no figure at migration");
  assert.equal(first.businessCaseSnapshotPrior, null);
  // Idempotent: running the step again changes nothing.
  const again = JSON.parse(JSON.stringify(first));
  migrateSessionStateV2(again);
  assert.deepEqual(again, first, "v1->v2 is idempotent");
  // A v2 state with a computed snapshot keeps it.
  const computed = { schemaVersion: 2, businessCaseSnapshot: { rate: 100 } };
  const kept = migrateSessionRecord(computed);
  assert.equal(kept.changed, false);
  assert.deepEqual(computed.businessCaseSnapshot, { rate: 100 });
});

test("LOCKSTEP: client migrateSessionState and server migrateSessionStateV2 produce identical output", () => {
  const { migrateSessionStateV2 } = serverSandbox();
  const { migrateSessionState } = buildSandbox(appSource, { functions: ["migrateSessionState"], globals: {} });
  const a = v1Fixture();
  const b = JSON.parse(JSON.stringify(a));
  migrateSessionState(a);      // client (app.js)
  migrateSessionStateV2(b);    // server (server.mjs)
  assert.deepEqual(a, b, "client and server v1->v2 transforms must not drift");
  // And on an already-v2 state with data:
  const c = { schemaVersion: 2, businessCaseSnapshot: { rate: 75 }, businessCaseSnapshotPrior: null };
  const d = JSON.parse(JSON.stringify(c));
  migrateSessionState(c);
  migrateSessionStateV2(d);
  assert.deepEqual(c, d);
});

// --- Startup batch over a real sqlite DB -------------------------------------

const DDL = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
`;

function seedDb(dataDir, rows) {
  const dbPath = path.join(dataDir, "sessions.db");
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  const insert = db.prepare("INSERT INTO sessions (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
  const now = new Date().toISOString();
  for (const [id, data] of rows) insert.run(id, "anon", data, now, now);
  db.close();
  return dbPath;
}

function bootOnce(dataDir, port) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [SERVER], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        PORT: String(port),
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        AUTH_ENABLED: "false"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    let stdout = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.on("exit", (code) => resolve({ exited: true, code, stderr, stdout, proc }));
    // Poll /health; resolve as healthy once up.
    const base = `http://127.0.0.1:${port}`;
    let tries = 0;
    const tick = setInterval(async () => {
      tries += 1;
      try {
        const res = await fetch(`${base}/health`);
        if (res.ok) { clearInterval(tick); resolve({ exited: false, stderr, stdout, proc, base }); }
      } catch { /* not up yet */ }
      if (tries > 100) { clearInterval(tick); proc.kill(); resolve({ exited: true, code: -1, stderr, stdout, proc }); }
    }, 100);
  });
}

test("startup batch: v1 rows are migrated with a .bak created first; v2-only DB boots with no .bak", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "discovery-migrate-"));
  try {
    const payload = (state) => JSON.stringify({ version: 1, savedAt: new Date().toISOString(), summary: { id: state.sessionMeta.id }, state });
    seedDb(dataDir, [["sess-legacy", payload(v1Fixture())]]);
    const boot = await bootOnce(dataDir, MIGRATION_PORT);
    assert.equal(boot.exited, false, `server must boot after migrating (stderr: ${boot.stderr.slice(0, 300)})`);
    const res = await fetch(`${boot.base}/api/sessions/sess-legacy`);
    const loaded = await res.json();
    assert.equal(loaded.state.schemaVersion, 2, "row migrated to v2");
    assert.equal(loaded.state.businessCaseSnapshot, null, "no figure at migration");
    boot.proc.kill();
    const baks = (await readdir(dataDir)).filter((name) => name.includes(".bak"));
    assert.equal(baks.length, 1, "exactly one timestamped .bak created before migrating");
    assert.match(baks[0], /^sessions\.db\..+\.bak$/);

    // Second boot: everything already v2 -> no new .bak (no-op path).
    const boot2 = await bootOnce(dataDir, MIGRATION_PORT + 10);
    assert.equal(boot2.exited, false);
    boot2.proc.kill();
    const baks2 = (await readdir(dataDir)).filter((name) => name.includes(".bak"));
    assert.equal(baks2.length, 1, "no-op startup creates no additional .bak");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("startup batch: refusal names the failing row and the .bak; DB left unmigrated", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "discovery-refuse-"));
  try {
    const payload = (state) => JSON.stringify({ version: 1, savedAt: new Date().toISOString(), summary: {}, state });
    const dbPath = seedDb(dataDir, [
      ["sess-good", payload(v1Fixture())],
      ["sess-poison", "{this is not json"]
    ]);
    const boot = await bootOnce(dataDir, MIGRATION_PORT + 20);
    assert.equal(boot.exited, true, "server must refuse to start");
    assert.notEqual(boot.code, 0, "non-zero exit");
    assert.match(boot.stderr, /REFUSING TO START/);
    assert.match(boot.stderr, /sess-poison/, "the failing row is named");
    assert.match(boot.stderr, /sessions\.db\..+\.bak/, "the .bak path is named");
    assert.match(boot.stderr, /To restore: cp /, "the restore command is given");
    // The good v1 row must be untouched — never a partially-migrated database.
    const db = new DatabaseSync(dbPath);
    const row = db.prepare("SELECT data FROM sessions WHERE id = ?").get("sess-good");
    db.close();
    const state = JSON.parse(row.data).state;
    assert.ok(!state.schemaVersion || state.schemaVersion < 2, "good row left at v1 — no partial migration");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
