// V3-4 — Review/sign-off + engagement audit trail. Executed, deterministic tests
// (NO live LLM) over the self-contained audit primitive (auditChainHash /
// recordAuditEvent / verifyAuditTrail), the review-lock core
// (reviewSnapshotInCompiler), and source-level guarantees (no edit/delete path;
// hooks record events; no "approved" label). Each maps to a V3-4 acceptance
// criterion. Fixtures are neutral — no firm names.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// Affirmative approval claim — distinct from allowed NEGATING phrasing
// ("not a compliance approval").
const APPROVED_CLAIM = /\b(compliance[- ]approved|approved for (use|production|deployment|controlled use)|is (compliance[- ])?approved|certified compliant)\b/i;
const FIRM_NAMES = /\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i;
const BANNED_PHRASE = /work with your development team/i;

function sandbox() {
  const state = {};
  const fns = buildSandbox(source, {
    functions: [
      "auditChainHash", "deepFreeze", "recordAuditEvent", "verifyAuditTrail",
      "ensureAuditTrail", "exportAuditTrail", "reviewSnapshotInCompiler"
    ],
    globals: { state }
  });
  return { ...fns, state };
}

const ev = (over = {}) => ({
  actor: { name: "Reviewer R", email: "r@example.test" },
  action: "generated",
  target: { stepId: "s1", snapshotId: "art-1", kind: "compiled" },
  contentHash: "abc",
  ts: "2026-06-13T00:00:00.000Z",
  ...over
});

// --- audit primitive: append-only + hash chain -------------------------------

test("recordAuditEvent appends a frozen, hash-chained entry; verifyAuditTrail confirms", () => {
  const { recordAuditEvent, verifyAuditTrail } = sandbox();
  const trail = [];
  const e1 = recordAuditEvent(trail, ev({ action: "generated", ts: "t1" }));
  const e2 = recordAuditEvent(trail, ev({ action: "reviewed", ts: "t2" }));
  const e3 = recordAuditEvent(trail, ev({ action: "exported", target: { kind: "recipe-docx" }, ts: "t3" }));
  assert.equal(trail.length, 3);
  assert.deepEqual(trail.map((e) => e.seq), [1, 2, 3]);
  assert.equal(e1.prevHash, "");
  assert.equal(e2.prevHash, e1.entryHash);
  assert.equal(e3.prevHash, e2.entryHash);
  assert.match(e1.entryHash, /^[0-9a-f]{16}$/);
  assert.deepEqual(verifyAuditTrail(trail), { ok: true, brokenAt: -1, reason: "" });
});

test("auditChainHash is deterministic and differs on different input", () => {
  const { auditChainHash } = sandbox();
  assert.equal(auditChainHash({ a: 1, b: [2, 3] }), auditChainHash({ a: 1, b: [2, 3] }));
  assert.notEqual(auditChainHash({ a: 1 }), auditChainHash({ a: 2 }));
  assert.match(auditChainHash("x"), /^[0-9a-f]{16}$/);
});

test("a silent EDIT to a stored entry is detected by verifyAuditTrail", () => {
  const { recordAuditEvent, verifyAuditTrail } = sandbox();
  const trail = [];
  recordAuditEvent(trail, ev({ ts: "t1" }));
  recordAuditEvent(trail, ev({ action: "reviewed", ts: "t2" }));
  recordAuditEvent(trail, ev({ action: "exported", ts: "t3" }));
  const tampered = JSON.parse(JSON.stringify(trail)); // unfrozen deep copy
  tampered[1] = { ...tampered[1], action: "exported" }; // silently change the action
  const v = verifyAuditTrail(tampered);
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 1);
});

test("a silent DELETE / reorder is detected by verifyAuditTrail", () => {
  const { recordAuditEvent, verifyAuditTrail } = sandbox();
  const trail = [];
  recordAuditEvent(trail, ev({ ts: "t1" }));
  recordAuditEvent(trail, ev({ action: "reviewed", ts: "t2" }));
  recordAuditEvent(trail, ev({ action: "exported", ts: "t3" }));
  const deleted = JSON.parse(JSON.stringify(trail));
  deleted.splice(1, 1); // remove the middle entry
  assert.equal(verifyAuditTrail(deleted).ok, false);
  const reordered = JSON.parse(JSON.stringify(trail));
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.equal(verifyAuditTrail(reordered).ok, false);
});

test("recorded entries are frozen — in-place mutation throws (strict mode)", () => {
  const { recordAuditEvent } = sandbox();
  const trail = [];
  const e = recordAuditEvent(trail, ev());
  assert.ok(Object.isFrozen(e));
  assert.ok(Object.isFrozen(e.actor));
  assert.ok(Object.isFrozen(e.target));
  assert.throws(() => { e.action = "tampered"; }, TypeError);
  assert.throws(() => { e.actor.name = "x"; }, TypeError);
});

// --- structural guarantee: no edit/delete path exists ------------------------

test("no edit/delete path exists for auditTrail (source-level)", () => {
  const src = readAppSource();
  assert.ok(!/\bauditTrail\s*\.\s*(splice|pop|shift|unshift|reverse|sort|fill|copyWithin)\s*\(/.test(src),
    "no array mutators are called on auditTrail");
  assert.ok(!/\bauditTrail\s*\[\s*\d+\s*\]\s*=/.test(src), "no index assignment into auditTrail");
  assert.ok(!/\bdelete\s+[\w.?[\]]*auditTrail/.test(src), "no delete of auditTrail entries");
  // Every `auditTrail =` assignment is an init to [] (ensureAuditTrail), never a
  // reassignment to a filtered/derived array.
  const allAssign = (src.match(/auditTrail\s*=(?!=)/g) || []).length;
  const initAssign = (src.match(/auditTrail\s*=\s*\[\s*\]/g) || []).length;
  assert.equal(allAssign, initAssign, "every auditTrail assignment is an init to []");
  // The ONLY writer pushes.
  assert.ok(/trail\.push\(/.test(extractFunction(src, "recordAuditEvent")), "recordAuditEvent appends via push");
});

// --- review / sign-off: lock the exact snapshot ------------------------------

test("reviewSnapshotInCompiler locks the exact snapshot with identity + timestamp", () => {
  const { reviewSnapshotInCompiler, auditChainHash } = sandbox();
  const pkg = { a: 1, nested: { b: 2 } };
  const compiler = { compiled: { s1: { id: "art-1", generatedAt: "t", kind: "compiled", package: pkg } }, compiledPrior: {}, bundles: {}, reviewed: {} };
  const trail = [];
  const res = reviewSnapshotInCompiler(compiler, trail, "s1", "compiled", { name: "Reviewer R", email: "r@example.test" }, "2026-06-13T00:00:00.000Z");
  assert.equal(res.ok, true);
  const rec = compiler.reviewed["art-1"];
  assert.ok(rec, "stored under the reviewed snapshot id");
  assert.equal(rec.review.label, "Reviewed for controlled use");
  assert.equal(rec.review.reviewer.name, "Reviewer R");
  assert.equal(rec.review.reviewedAt, "2026-06-13T00:00:00.000Z");
  assert.equal(rec.review.snapshotId, "art-1");
  assert.equal(rec.review.contentHash, auditChainHash(JSON.stringify(pkg)), "snapshot-backed by a content hash");
  assert.ok(Object.isFrozen(rec.snapshot) && Object.isFrozen(rec.snapshot.package), "reviewed snapshot is deep-frozen");
  assert.notEqual(rec.snapshot, compiler.compiled.s1, "stored a deep copy, not the live ref");
  assert.notEqual(rec.snapshot.package, pkg, "deep copy of the package too");
  assert.equal(trail.length, 1);
  assert.equal(trail[0].action, "reviewed");
  assert.equal(trail[0].target.snapshotId, "art-1");
});

test("regeneration creates a new version and NEVER alters the reviewed snapshot", () => {
  const { reviewSnapshotInCompiler } = sandbox();
  const compiler = { compiled: { s1: { id: "art-1", generatedAt: "t", kind: "compiled", package: { a: 1 } } }, compiledPrior: {}, bundles: {}, reviewed: {} };
  reviewSnapshotInCompiler(compiler, [], "s1", "compiled", { name: "R" }, "t1");
  const frozenBefore = JSON.parse(JSON.stringify(compiler.reviewed["art-1"]));
  // Emulate rotateArtifactSnapshot: current -> prior, new current snapshot.
  compiler.compiledPrior.s1 = compiler.compiled.s1;
  compiler.compiled.s1 = { id: "art-2", generatedAt: "t2", kind: "compiled", package: { a: 99 } };
  assert.deepEqual(compiler.reviewed["art-1"], frozenBefore, "reviewed art-1 is byte-identical after regeneration");
  assert.equal(compiler.compiled.s1.id, "art-2", "regeneration produced a new version");
  // Structural: rotateArtifactSnapshot cannot touch `reviewed`.
  assert.ok(!/reviewed/.test(extractFunction(readAppSource(), "rotateArtifactSnapshot")),
    "rotateArtifactSnapshot never references reviewed");
});

test("review is idempotent and guards a missing snapshot", () => {
  const { reviewSnapshotInCompiler } = sandbox();
  const compiler = { compiled: { s1: { id: "art-1", package: { a: 1 } } }, reviewed: {} };
  const trail = [];
  assert.equal(reviewSnapshotInCompiler(compiler, trail, "s1", "compiled", { name: "R" }, "t1").ok, true);
  const second = reviewSnapshotInCompiler(compiler, trail, "s1", "compiled", { name: "R" }, "t2");
  assert.equal(second.ok, false);
  assert.equal(second.reason, "already reviewed");
  assert.equal(trail.length, 1, "no duplicate audit entry");
  const missing = reviewSnapshotInCompiler(compiler, trail, "nope", "compiled", { name: "R" }, "t3");
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "no snapshot");
  assert.equal(trail.length, 1, "a failed review records nothing");
});

// --- snapshot-backed + export reads stored entries only ----------------------

test("entries are snapshot-backed and exportAuditTrail returns stored entries verbatim", () => {
  const { recordAuditEvent, ensureAuditTrail, exportAuditTrail, state } = sandbox();
  const trail = ensureAuditTrail();
  recordAuditEvent(trail, ev({ contentHash: "abc" }));
  assert.equal(state.auditTrail.length, 1);
  assert.equal(state.auditTrail[0].target.snapshotId, "art-1");
  assert.equal(state.auditTrail[0].contentHash, "abc");
  const exported = exportAuditTrail();
  assert.deepEqual(exported, JSON.parse(JSON.stringify(state.auditTrail)), "export === stored entries");
  assert.notEqual(exported, state.auditTrail, "export is a copy, not the live array");
  assert.deepEqual(Object.keys(exported[0]).sort(),
    ["action", "actor", "contentHash", "entryHash", "prevHash", "seq", "target", "ts"],
    "no derived/extra fields are added on export");
});

test("ensureAuditTrail preserves an existing trail and only inits when missing", () => {
  const { ensureAuditTrail, state } = sandbox();
  const existing = [{ seq: 1, ts: "t", actor: { name: "A", email: "" }, action: "generated", target: {}, contentHash: "", prevHash: "", entryHash: "x" }];
  state.auditTrail = existing;
  assert.equal(ensureAuditTrail(), existing, "returns the SAME array — never drops a present trail");
  state.auditTrail = "corrupt";
  const t = ensureAuditTrail();
  assert.ok(Array.isArray(t) && t.length === 0, "inits to [] only when missing/invalid");
});

// --- no "approved" label; hooks record; neutral fixtures ---------------------

test('no "approved" label appears in the review/audit surfaces', () => {
  const { reviewSnapshotInCompiler } = sandbox();
  const compiler = { compiled: { s1: { id: "art-1", package: { a: 1 } } }, reviewed: {} };
  const r = reviewSnapshotInCompiler(compiler, [], "s1", "compiled", { name: "R" }, "t");
  assert.equal(r.review.label, "Reviewed for controlled use");
  for (const action of ["generated", "regenerated", "reviewed", "exported", "changed"]) {
    assert.ok(!/approv/i.test(action), `action "${action}" makes no approval claim`);
  }
  const src = readAppSource();
  const uiSrc = extractFunction(src, "renderAuditPanelHtml")
    + extractFunction(src, "markSnapshotReviewed")
    + extractFunction(src, "reviewSnapshotInCompiler");
  assert.ok(!APPROVED_CLAIM.test(uiSrc), "no affirmative approval claim in the review/audit surfaces");
});

test("the generate / change / export / review hooks each record an audit event (source)", () => {
  const src = readAppSource();
  const expectations = {
    compileArtifactForStep: /recordEngagementAudit\(/,
    computeBusinessCaseNow: /recordEngagementAudit\(/,
    handleRecipeExport: /recordExportAudit\(/,
    handleRecipePdfExport: /recordExportAudit\(/,
    downloadRecipeBook: /recordExportAudit\(/,
    markSnapshotReviewed: /reviewSnapshotInCompiler\(/
  };
  for (const [fn, re] of Object.entries(expectations)) {
    assert.match(extractFunction(src, fn), re, `${fn} records an audit event`);
  }
});

test("V3-4 audit/review code has no firm names or banned phrase", () => {
  const src = readAppSource();
  const v34 = extractFunction(src, "renderAuditPanelHtml")
    + extractFunction(src, "reviewSnapshotInCompiler")
    + extractFunction(src, "markSnapshotReviewed")
    + extractFunction(src, "recordAuditEvent")
    + extractFunction(src, "verifyAuditTrail");
  assert.ok(!FIRM_NAMES.test(v34), "no firm names");
  assert.ok(!BANNED_PHRASE.test(v34), "no banned phrase");
});
