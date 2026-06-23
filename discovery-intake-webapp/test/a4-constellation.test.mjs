// A-4 — Portfolio Constellation: enabled clusters, blocked candidates,
// shared AI capability inventory. Uses existing engineAdjacency +
// engineCapabilityMap outputs; no new engine math.
// Tests use source-level extraction (buildSandbox) — no DOM, no live engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Sandbox ────────────────────────────────────────────────────────────────────

function a4SandboxWith(adjOverride = null, capOverride = null, stateOverride = {}) {
  const stateObj = { roleTags: {}, solutionShapes: {}, ...stateOverride };
  return buildSandbox(source, {
    consts: ["A4_DIM_LABEL", "A4_SHAPE_LABEL", "A4_CAP_COLOR"],
    functions: [
      "a4EmptyHtml", "a4BlockedDimLabel", "a4ClusterCardHtml",
      "a4BlockedCardHtml", "a4CapabilityPillsHtml", "a4ConstellationHtml",
      "escapeHtml"
    ],
    globals: {
      state: stateObj,
      engineAdjacency: () => adjOverride,
      engineCapabilityMap: () => capOverride,
      setAnalysisTab: () => {},
      document: { getElementById: () => null },
      console: { warn() {}, error() {}, info() {} }
    }
  });
}

function makeAdj(opts = {}) {
  return {
    enabledGroups: opts.enabledGroups || [],
    whyBlocked: opts.whyBlocked || [],
    enabledCount: (opts.enabledGroups || []).length,
    blockedCount: (opts.whyBlocked || []).length,
    candidateCount: (opts.enabledGroups || []).length + (opts.whyBlocked || []).length
  };
}

function makeCap(capabilities = []) {
  return { capabilities, confirmedCount: 1 };
}

function makeLv(opts = {}) {
  return { confirmedCount: opts.confirmedCount ?? 2, note: opts.note || null };
}

// ── a4EmptyHtml ───────────────────────────────────────────────────────────────

test("a4EmptyHtml: title + workbench CTA present", () => {
  const { a4EmptyHtml } = a4SandboxWith();
  const out = a4EmptyHtml();
  assert.ok(out.includes("Portfolio Constellation"), "title present");
  assert.ok(out.includes("data-a4-to-workbench"), "workbench CTA attribute present");
  assert.ok(out.includes("Workbench"), "Workbench mentioned");
});

test("a4EmptyHtml: custom note rendered", () => {
  const { a4EmptyHtml } = a4SandboxWith();
  const out = a4EmptyHtml("Engine loading…");
  assert.ok(out.includes("Engine loading"), "custom note shown");
});

// ── empty state when no confirmed records ─────────────────────────────────────

test("a4ConstellationHtml: confirmedCount=0 → empty state", () => {
  const { a4ConstellationHtml } = a4SandboxWith();
  const out = a4ConstellationHtml({ confirmedCount: 0 }, []);
  assert.ok(out.includes("data-a4-to-workbench"), "empty state CTA present");
  assert.ok(!out.includes("Enabled clusters"), "no cluster section in empty state");
});

test("a4ConstellationHtml: null lv → empty state", () => {
  const { a4ConstellationHtml } = a4SandboxWith();
  const out = a4ConstellationHtml(null, []);
  assert.ok(out.includes("data-a4-to-workbench"), "empty state on null lv");
});

test("a4ConstellationHtml: lv.note → empty state with note", () => {
  const { a4ConstellationHtml } = a4SandboxWith();
  const out = a4ConstellationHtml({ confirmedCount: 0, note: "Engine loading…" }, []);
  assert.ok(out.includes("data-a4-to-workbench"), "empty state CTA present");
  assert.ok(out.includes("Engine loading"), "note text shown in empty state");
});

// ── enabled groups rendered as connected components ───────────────────────────

test("a4ConstellationHtml: enabled groups shown as connected-component cards", () => {
  const adj = makeAdj({
    enabledGroups: [
      { workflows: ["Reconciliation", "Trade matching"], size: 2, reason: "Both classify ledger breaks", combinedFreedHrs: 3.5, edgeCount: 1 }
    ]
  });
  const sb = a4SandboxWith(adj, null);
  const out = sb.a4ConstellationHtml(makeLv(), []);
  assert.ok(out.includes("Reconciliation"), "cluster workflow W1 present");
  assert.ok(out.includes("Trade matching"), "cluster workflow W2 present");
  assert.ok(out.includes("Both classify ledger breaks"), "cluster reason shown");
  assert.ok(out.includes("Enabled clusters (1)"), "cluster count in header");
});

test("a4ClusterCardHtml: size and freed hours shown", () => {
  const { a4ClusterCardHtml } = a4SandboxWith();
  const group = { workflows: ["W1", "W2"], size: 2, reason: "Shared classify pattern", combinedFreedHrs: 4.2, edgeCount: 1 };
  const out = a4ClusterCardHtml(group, []);
  assert.ok(out.includes("2 workflow"), "workflow count shown");
  assert.ok(out.includes("4.2"), "freed hours shown");
  assert.ok(out.includes("Shared classify pattern"), "reason shown");
});

test("a4ClusterCardHtml: shared capability pills shown when caps match workflow", () => {
  const { a4ClusterCardHtml } = a4SandboxWith();
  const group = { workflows: ["W1", "W2"], size: 2, reason: "Both reconcile" };
  const caps = [
    { capability: "reconcile", reuseCount: 2, workflows: ["W1", "W2"], buildOnce: true },
    { capability: "classify",  reuseCount: 1, workflows: ["W3"],       buildOnce: false }
  ];
  const out = a4ClusterCardHtml(group, caps);
  assert.ok(out.includes("reconcile"), "matching capability pill shown");
  assert.ok(!out.includes("classify"),  "non-matching capability omitted");
});

// ── blocked candidates surfaced (never silently dropped) ─────────────────────

test("a4ConstellationHtml: blocked candidates shown with whyBlocked reason", () => {
  const adj = makeAdj({
    whyBlocked: [
      { workflows: ["W1", "W2"], blockedDimension: "data", reason: "Data tier mismatch: PII vs Internal" }
    ]
  });
  const sb = a4SandboxWith(adj, null);
  const out = sb.a4ConstellationHtml(makeLv(), []);
  assert.ok(out.includes("Data tier mismatch"), "whyBlocked reason surfaced");
  assert.ok(out.includes("Blocked candidates (1)"), "blocked count in header");
});

test("a4BlockedCardHtml: dimension label and reason rendered", () => {
  const { a4BlockedCardHtml } = a4SandboxWith();
  const blocked = { workflows: ["W1", "W2"], blockedDimension: "data", reason: "Data tier mismatch" };
  const out = a4BlockedCardHtml(blocked);
  assert.ok(out.includes("Data tier"), "data dimension label shown");
  assert.ok(out.includes("Data tier mismatch"), "reason shown");
  assert.ok(out.includes("W1"), "workflow W1 shown");
  assert.ok(out.includes("⛉"), "blocked icon present");
});

test("a4ConstellationHtml: more than 8 blocked → capped with overflow note", () => {
  const blocked = Array.from({ length: 10 }, (_, i) => ({
    workflows: [`W${i}`, `W${i + 1}`],
    blockedDimension: "data",
    reason: `Mismatch ${i}`
  }));
  const adj = makeAdj({ whyBlocked: blocked });
  const sb = a4SandboxWith(adj, null);
  const out = sb.a4ConstellationHtml(makeLv(), []);
  assert.ok(out.includes("more blocked candidate"), "overflow note present");
});

// ── role-only overlap does not cluster when data/system/control differs ───────

test("a4ConstellationHtml: role-only pair with data conflict → blocked only, not enabled", () => {
  const adj = makeAdj({
    enabledGroups: [],
    whyBlocked: [
      { workflows: ["W1", "W2"], blockedDimension: "data", reason: "Roles match; data tier incompatible: PII vs Internal" }
    ]
  });
  const sb = a4SandboxWith(adj, null);
  const out = sb.a4ConstellationHtml(makeLv(), []);
  assert.ok(out.includes("Enabled clusters (0)"), "zero enabled clusters");
  assert.ok(out.includes("Blocked candidates (1)"), "pair appears in blocked");
  assert.ok(out.includes("Roles match"), "block reason surfaced");
});

test("separation: a4ConstellationHtml uses engineAdjacency, not own clustering logic", () => {
  const src = extractFunction(source, "a4ConstellationHtml");
  assert.ok(src.includes("engineAdjacency"), "calls engineAdjacency");
  assert.ok(!src.includes("sharedRoles"), "no re-implemented role-clustering");
  assert.ok(!src.includes("unionFind") && !src.includes("union-find"), "no reinvented union-find");
});

// ── solution-shape context visible ────────────────────────────────────────────

test("a4CapabilityPillsHtml: capability labels visible with build-once flag", () => {
  const { a4CapabilityPillsHtml } = a4SandboxWith();
  const cap = makeCap([
    { capability: "classify", reuseCount: 3, workflows: ["W1", "W2", "W3"], buildOnce: true },
    { capability: "extract",  reuseCount: 1, workflows: ["W4"],             buildOnce: false }
  ]);
  const out = a4CapabilityPillsHtml(cap);
  assert.ok(out.includes("classify"), "classify capability shown");
  assert.ok(out.includes("extract"), "extract capability shown");
  assert.ok(out.includes("build-once"), "build-once flag shown");
  assert.ok(out.includes("Shared AI capability inventory"), "section heading present");
});

test("a4CapabilityPillsHtml: empty cap → empty string", () => {
  const { a4CapabilityPillsHtml } = a4SandboxWith();
  assert.equal(a4CapabilityPillsHtml(null), "", "null cap → empty");
  assert.equal(a4CapabilityPillsHtml({ capabilities: [] }), "", "empty capabilities → empty");
});

test("a4ConstellationHtml: capability inventory shown when cap present", () => {
  const cap = makeCap([{ capability: "reconcile", reuseCount: 2, workflows: ["W1", "W2"], buildOnce: true }]);
  const adj = makeAdj({ enabledGroups: [{ workflows: ["W1", "W2"], size: 2, reason: "Shared" }] });
  const sb = a4SandboxWith(adj, cap);
  const out = sb.a4ConstellationHtml(makeLv(), []);
  assert.ok(out.includes("reconcile"), "reconcile capability in inventory");
  assert.ok(out.includes("build-once"), "build-once flag in inventory");
});

// ── system/reachability context visible ──────────────────────────────────────

test("a4BlockedCardHtml: tooling dimension → system/reachability label", () => {
  const { a4BlockedCardHtml } = a4SandboxWith();
  const blocked = { workflows: ["W1", "W2"], blockedDimension: "tooling", reason: "Incompatible tooling profiles" };
  const out = a4BlockedCardHtml(blocked);
  assert.ok(out.includes("System / reachability"), "system/reachability dimension label shown");
  assert.ok(out.includes("Incompatible tooling profiles"), "reason shown");
});

test("a4BlockedCardHtml: system-class dimension → system class label", () => {
  const { a4BlockedCardHtml } = a4SandboxWith();
  const blocked = { workflows: ["W1", "W2"], blockedDimension: "system-class", reason: "Ledger vs CRM — different system classes" };
  const out = a4BlockedCardHtml(blocked);
  assert.ok(out.includes("System class"), "system class dimension label shown");
});

// ── data/control risk context visible ────────────────────────────────────────

test("a4BlockedCardHtml: control dimension → control checkpoint label", () => {
  const { a4BlockedCardHtml } = a4SandboxWith();
  const blocked = { workflows: ["W1", "W2"], blockedDimension: "control", reason: "Four-eyes conflict: same role as maker and checker" };
  const out = a4BlockedCardHtml(blocked);
  assert.ok(out.includes("Control checkpoint"), "control dimension label shown");
  assert.ok(out.includes("Four-eyes conflict"), "control reason shown");
});

test("a4BlockedCardHtml: entitlement dimension → entitlement profile label", () => {
  const { a4BlockedCardHtml } = a4SandboxWith();
  const blocked = { workflows: ["W1", "W2"], blockedDimension: "entitlement", reason: "Write vs approve entitlement mismatch" };
  const out = a4BlockedCardHtml(blocked);
  assert.ok(out.includes("Entitlement profile"), "entitlement dimension label shown");
});

test("a4BlockedDimLabel: unknown dimension falls back gracefully", () => {
  const { a4BlockedDimLabel } = a4SandboxWith();
  assert.equal(a4BlockedDimLabel("data"), "Data tier");
  assert.equal(a4BlockedDimLabel("tooling"), "System / reachability");
  assert.equal(a4BlockedDimLabel("unknown-dim"), "unknown-dim");
  assert.equal(a4BlockedDimLabel(undefined), "Compatibility check");
});

// ── separation invariants (source-level) ──────────────────────────────────────

test("separation: a4* functions do not call patchField, fetch, or invent endpoints", () => {
  const fns = [
    "a4EmptyHtml", "a4BlockedDimLabel", "a4ClusterCardHtml",
    "a4BlockedCardHtml", "a4CapabilityPillsHtml", "a4ConstellationHtml", "wireA4"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("patchField"), `${fn}: no patchField`);
    assert.ok(!src.includes("fetch("), `${fn}: no fetch`);
    assert.ok(!src.includes("/api/constellation"), `${fn}: no invented endpoint`);
  }
});

test("separation: renderAnalysisTabDashboard calls a4ConstellationHtml typeof-guarded", () => {
  const src = extractFunction(source, "renderAnalysisTabDashboard");
  assert.ok(src.includes("a4ConstellationHtml"), "a4ConstellationHtml called");
  assert.ok(src.includes("typeof a4ConstellationHtml"), "typeof guard present");
  assert.ok(src.includes("wireA4"), "wireA4 called");
  assert.ok(src.includes("typeof wireA4"), "wireA4 typeof-guarded");
});

// ── Phase 6 items remain untouched ────────────────────────────────────────────

test("Phase 6 guard: a4* functions contain no Phase 6 items", () => {
  const fns = ["a4ClusterCardHtml", "a4BlockedCardHtml", "a4CapabilityPillsHtml", "a4ConstellationHtml"];
  for (const fn of fns) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("workintent"),   `${fn}: no workIntent (Phase 6)`);
    assert.ok(!src.includes("stepfunction"), `${fn}: no stepFunction (Phase 6)`);
    assert.ok(!src.includes("policyupload"), `${fn}: no policy-upload (Phase 6)`);
    assert.ok(!src.includes("uniteconomics"),`${fn}: no unitEconomics (Phase 6)`);
  }
});

// ── rail-clean (source-level) ─────────────────────────────────────────────────

test("rail-clean: a4* functions contain no headcount/reduction vocabulary", () => {
  const fns = [
    "a4ClusterCardHtml", "a4BlockedCardHtml", "a4CapabilityPillsHtml",
    "a4EmptyHtml", "a4ConstellationHtml"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("headcount"), `${fn}: no headcount`);
    assert.ok(!src.includes("reduction"), `${fn}: no reduction`);
    assert.ok(!src.includes("eliminat"),  `${fn}: no eliminate`);
    assert.ok(!src.includes("layoff"),    `${fn}: no layoff`);
  }
});

test("rail-clean: a4* functions contain no banned output phrase", () => {
  const fns = ["a4EmptyHtml", "a4ConstellationHtml", "a4ClusterCardHtml", "a4BlockedCardHtml"];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("work with your development team"), `${fn}: banned phrase absent`);
  }
});
