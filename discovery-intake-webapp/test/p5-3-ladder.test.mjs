// P5-3 — Confirmation Ladder.
// Tests prove:
//   • empty session → "Not started" (level 0)
//   • captured-only → "Captured" (level 1)
//   • classified but unconfirmed → "Classified" (level 2); nextHint names count
//   • workbench-confirmed but bridge-incomplete → "Workbench confirmed" (level 3); missingFields present
//   • engine-complete but engine unavailable → "Engine complete" (level 4)
//   • fully confirmed + engine loaded → "Portfolio counted" (level 5); complete=true, missingFields=[]
//   • LADDER_LEVELS has 5 entries in correct order
//   • confirmationLadderHtml renders all rung labels, highlights current, shows hints + missing
//   • dashboard empty state names the ladder level
//   • renderAnalysisTabWorkbench calls confirmationLadderHtml (typeof-guarded)
//   • bridge behavior unchanged (P5-2 separation)
//   • no headcount / reduction framing
//   • Phase 6 items absent

import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Mock helpers ──────────────────────────────────────────────────────────────

// A step that has cls AND dataTier (needed for "classified" level).
const CLASSIFIED_STEP = { id: "s1", cls: "gather", step: "Collect data", dataTier: "confidential" };
// A step that has cls but NO dataTier (stuck at "captured" level).
const UNCLASSIFIED_STEP = { id: "s2", cls: "gather", step: "Do something" };

// A fully-populated record that satisfies all 15 engine REQUIRED fields.
const FULL_RECORD = {
  header:   { persona: "Analyst", dept: "Operations", anchor: "My workflow", lifecycle: "session" },
  trigger:  { trigger: "Weekly batch", cadence: "weekly", volume: "20/wk" },
  steps:    [{ step: "Do work", cls: "judgment", data: "confidential" }],
  seams:    [{ from: "A", to: "B", friction: "low", latency: "low", crit: "high" }],
  judgment: { needs: "Expert judgment", hard: "Policy threshold", cues: "Flag if borderline", human: "Do work" },
  confirm:  { acceptance: "Done when approved", escalation: "Escalate to manager", dataTier: "confidential" },
  recap:    { confirmed: true }
};

// A partial record with missing engine fields.
const PARTIAL_RECORD = {
  header:   { persona: "", dept: "", anchor: "My workflow" },
  trigger:  { trigger: "", cadence: "" },
  steps:    [{ step: "Do work", cls: "gather", data: "confidential" }],
  seams:    [],
  judgment: {}, confirm: {}, recap: { confirmed: true }
};

// ── Sandbox factory ────────────────────────────────────────────────────────────

function makeLadderSandbox(opts = {}) {
  const {
    steps = [],
    confirmedViewResult = { total: 0, unconfirmed: [] },
    intakeRecord = PARTIAL_RECORD,
    mockEngine = null
  } = opts;

  return buildSandbox(source, {
    consts: ["BRIDGE_REQUIRED_META", "BRIDGE_REQUIRED_CHECKS", "LADDER_LEVELS"],
    functions: ["bridgeMissingFields", "buildConfirmationLadder", "confirmationLadderHtml"],
    globals: {
      analysisGridSteps: () => steps,
      engineStepClass: (s) => (s && s.cls) || "assembly",
      engineDataTier: (s) => (s && s.dataTier) || undefined,
      confirmedView: () => confirmedViewResult,
      appWorkflowToIntake: () => intakeRecord,
      studioEngine: () => mockEngine,
      escapeHtml: (s) => String(s == null ? "" : s),
      state: { fields: {}, sessionMeta: {} },
      console: { warn() {}, error() {} }
    }
  });
}

// ── Level 0: Not started ──────────────────────────────────────────────────────

test("P5-3: empty session (no steps) → level 0, label Not started", () => {
  const { buildConfirmationLadder } = makeLadderSandbox({ steps: [] });
  const r = buildConfirmationLadder();
  assert.equal(r.level, 0);
  assert.equal(r.label, "Not started");
  assert.equal(r.complete, false);
  assert.ok(r.nextHint, "nextHint present at level 0");
});

// ── Level 1: Captured ─────────────────────────────────────────────────────────

test("P5-3: steps captured but no data sensitivity → level 1, label Captured", () => {
  const { buildConfirmationLadder } = makeLadderSandbox({ steps: [UNCLASSIFIED_STEP] });
  const r = buildConfirmationLadder();
  assert.equal(r.level, 1);
  assert.equal(r.levelId, "captured");
  assert.equal(r.label, "Captured");
  assert.ok(r.nextHint.toLowerCase().includes("data sensitivity"), `nextHint mentions data sensitivity: "${r.nextHint}"`);
});

// ── Level 2: Classified ───────────────────────────────────────────────────────

test("P5-3: steps classified, not yet workbench-confirmed → level 2, label Classified", () => {
  const { buildConfirmationLadder } = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: ["s1"] }
  });
  const r = buildConfirmationLadder();
  assert.equal(r.level, 2);
  assert.equal(r.levelId, "classified");
  assert.equal(r.label, "Classified");
});

test("P5-3: classified — nextHint names the count of unconfirmed steps", () => {
  const { buildConfirmationLadder } = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: ["s1"] }
  });
  const r = buildConfirmationLadder();
  assert.ok(r.nextHint.includes("1 step"), `nextHint: "${r.nextHint}"`);
  assert.ok(r.nextHint.toLowerCase().includes("workbench"), `nextHint mentions Workbench: "${r.nextHint}"`);
});

test("P5-3: classified — multiple unconfirmed steps uses plural", () => {
  const { buildConfirmationLadder } = makeLadderSandbox({
    steps: [CLASSIFIED_STEP, { ...CLASSIFIED_STEP, id: "s2", step: "Step 2" }],
    confirmedViewResult: { total: 2, unconfirmed: ["s1", "s2"] }
  });
  const r = buildConfirmationLadder();
  assert.ok(r.nextHint.includes("2 steps"), `nextHint: "${r.nextHint}"`);
});

// ── Level 3: Workbench confirmed (bridge incomplete) ──────────────────────────

test("P5-3: workbench confirmed but bridge fields missing → level 3, label Workbench confirmed", () => {
  const { buildConfirmationLadder } = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: [] },  // all confirmed in workbench
    intakeRecord: PARTIAL_RECORD  // missing many bridge fields
  });
  const r = buildConfirmationLadder();
  assert.equal(r.level, 3);
  assert.equal(r.levelId, "workbench-confirmed");
  assert.equal(r.label, "Workbench confirmed");
  assert.equal(r.complete, false);
});

test("P5-3: workbench confirmed — missingFields list is present and non-empty", () => {
  const { buildConfirmationLadder } = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: [] },
    intakeRecord: PARTIAL_RECORD
  });
  const r = buildConfirmationLadder();
  assert.ok(Array.isArray(r.missingFields), "missingFields is an array");
  assert.ok(r.missingFields.length > 0, `missingFields non-empty; got: ${r.missingFields.length}`);
  // Each entry has field, label, hint
  const first = r.missingFields[0];
  assert.ok(first.field, "missing entry has field");
  assert.ok(first.label, "missing entry has label");
  assert.ok(first.hint, "missing entry has hint");
});

test("P5-3: workbench confirmed — specific bridge fields are listed as missing", () => {
  const { buildConfirmationLadder } = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: [] },
    intakeRecord: PARTIAL_RECORD  // persona, dept, trigger, cadence, etc. are empty
  });
  const r = buildConfirmationLadder();
  const fields = r.missingFields.map((f) => f.field);
  assert.ok(fields.includes("header.persona"), "header.persona listed as missing");
  assert.ok(fields.includes("trigger.trigger"), "trigger.trigger listed as missing");
  assert.ok(!fields.includes("recap.confirmed"), "recap.confirmed NOT listed (it is true)");
});

// ── Level 4: Engine complete (engine not yet loaded) ──────────────────────────

test("P5-3: all bridge fields present but engine not loaded → level 4, label Engine complete", () => {
  const { buildConfirmationLadder } = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: [] },
    intakeRecord: FULL_RECORD,
    mockEngine: null   // engine not loaded
  });
  const r = buildConfirmationLadder();
  assert.equal(r.level, 4);
  assert.equal(r.levelId, "engine-complete");
  assert.equal(r.label, "Engine complete");
  assert.equal(r.complete, false);
  assert.equal(r.missingFields.length, 0, "no missing fields at engine-complete");
});

// ── Level 5: Portfolio counted ─────────────────────────────────────────────────

test("P5-3: all fields present + engine.isConfirmed=true → level 5, Portfolio counted", () => {
  const mockEng = { isConfirmed: () => true };
  const { buildConfirmationLadder } = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: [] },
    intakeRecord: FULL_RECORD,
    mockEngine: mockEng
  });
  const r = buildConfirmationLadder();
  assert.equal(r.level, 5);
  assert.equal(r.levelId, "portfolio-counted");
  assert.equal(r.label, "Portfolio counted");
  assert.equal(r.complete, true);
  assert.equal(r.nextHint, null, "no nextHint at portfolio-counted");
  assert.equal(r.missingFields.length, 0);
});

test("P5-3: engine.isConfirmed=false → stays at engine-complete (not portfolio counted)", () => {
  const mockEng = { isConfirmed: () => false };
  const { buildConfirmationLadder } = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: [] },
    intakeRecord: FULL_RECORD,
    mockEngine: mockEng
  });
  const r = buildConfirmationLadder();
  assert.equal(r.level, 4, "engine.isConfirmed=false → engine-complete not portfolio-counted");
});

// ── LADDER_LEVELS structure ────────────────────────────────────────────────────

test("P5-3: LADDER_LEVELS has 5 entries in the correct order", () => {
  const { buildConfirmationLadder } = makeLadderSandbox();
  const r = buildConfirmationLadder();
  assert.equal(r.levels.length, 5);
  assert.equal(r.levels[0].id, "captured");
  assert.equal(r.levels[1].id, "classified");
  assert.equal(r.levels[2].id, "workbench-confirmed");
  assert.equal(r.levels[3].id, "engine-complete");
  assert.equal(r.levels[4].id, "portfolio-counted");
});

// ── confirmationLadderHtml ─────────────────────────────────────────────────────

test("P5-3: confirmationLadderHtml renders all 5 rung labels", () => {
  const mockEng = { isConfirmed: () => true };
  const sb = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: [] },
    intakeRecord: FULL_RECORD, mockEngine: mockEng
  });
  const r = sb.buildConfirmationLadder();
  const html = sb.confirmationLadderHtml(r);
  assert.ok(html.includes("Captured"), "Captured label present");
  assert.ok(html.includes("Classified"), "Classified label present");
  assert.ok(html.includes("Workbench confirmed"), "Workbench confirmed label present");
  assert.ok(html.includes("Engine complete"), "Engine complete label present");
  assert.ok(html.includes("Portfolio counted"), "Portfolio counted label present");
});

test("P5-3: confirmationLadderHtml highlights the current level", () => {
  const sb = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: ["s1"] }
  });
  const r = sb.buildConfirmationLadder(); // level 2 — Classified
  const html = sb.confirmationLadderHtml(r);
  assert.ok(html.includes("p53-ladder"), "has p53-ladder class");
  assert.ok(html.includes("Classified"), "current level label present");
  // The current level (Classified) should be rendered with font-weight:700
  assert.ok(html.includes("font-weight:700"), "current level is bold");
});

test("P5-3: confirmationLadderHtml shows nextHint when present", () => {
  const sb = makeLadderSandbox({ steps: [] });
  const r = sb.buildConfirmationLadder();
  const html = sb.confirmationLadderHtml(r);
  assert.ok(html.includes("Next:"), "Next hint label present");
  assert.ok(html.includes("Discovery"), "nextHint content shown");
});

test("P5-3: confirmationLadderHtml shows missing fields at level 3", () => {
  const sb = makeLadderSandbox({
    steps: [CLASSIFIED_STEP],
    confirmedViewResult: { total: 1, unconfirmed: [] },
    intakeRecord: PARTIAL_RECORD
  });
  const r = sb.buildConfirmationLadder();
  const html = sb.confirmationLadderHtml(r);
  // Missing field labels should appear in the HTML
  assert.ok(html.includes("Your role"), "persona label in missing fields");
  assert.ok(html.includes("Department"), "dept label in missing fields");
});

test("P5-3: confirmationLadderHtml returns empty string for null input", () => {
  const sb = makeLadderSandbox();
  assert.equal(sb.confirmationLadderHtml(null), "");
  assert.equal(sb.confirmationLadderHtml(undefined), "");
});

// ── Dashboard empty state integration ─────────────────────────────────────────

test("P5-3: dashEmptyHtml renders ladderStatus when passed", () => {
  // Extract dashEmptyHtml + its dependencies for testing.
  const sb = buildSandbox(source, {
    functions: ["dashEmptyHtml", "escapeHtml"],
    globals: {
      DASH: { pos: "#00d4b4", ink: "#EAEFFF", dim: "#A6ADC4", faint: "#737A92", line: "#16263a", panel: "#0c1726" }
    }
  });
  const html = sb.dashEmptyHtml(null, null, "Classified");
  assert.ok(html.includes("Confirmation status"), "confirmation status label present");
  assert.ok(html.includes("Classified"), "ladder level shown in empty state");
});

test("P5-3: dashEmptyHtml without ladderStatus stays backward-compatible (P5-2 contract)", () => {
  const sb = buildSandbox(source, {
    functions: ["dashEmptyHtml", "escapeHtml"],
    globals: {
      DASH: { pos: "#00d4b4", ink: "#EAEFFF", dim: "#A6ADC4", faint: "#737A92", line: "#16263a", panel: "#0c1726" }
    }
  });
  const html = sb.dashEmptyHtml({ note: null }, null);
  assert.ok(html.includes("Executive Dashboard"), "title still present");
  assert.ok(html.includes("data-dashboard-to-workbench"), "CTA still present");
  assert.ok(!html.includes("Confirmation status"), "no ladder label when not passed");
});

// ── renderAnalysisTabWorkbench wires the ladder ────────────────────────────────

test("P5-3: renderAnalysisTabWorkbench calls confirmationLadderHtml typeof-guarded", () => {
  const src = extractFunction(source, "renderAnalysisTabWorkbench");
  assert.ok(src.includes("confirmationLadderHtml"), "calls confirmationLadderHtml");
  assert.ok(src.includes("buildConfirmationLadder"), "calls buildConfirmationLadder");
  assert.ok(src.includes("typeof buildConfirmationLadder"), "typeof-guarded");
});

test("P5-3: renderAnalysisTabDashboard computes ladderStatus in the empty-state branch", () => {
  const src = extractFunction(source, "renderAnalysisTabDashboard");
  assert.ok(src.includes("ladderStatus"), "ladderStatus computed");
  assert.ok(src.includes("buildConfirmationLadder"), "buildConfirmationLadder called");
  assert.ok(src.includes("typeof buildConfirmationLadder"), "typeof-guarded");
});

// ── Separation + rail checks (source-level) ────────────────────────────────────

test("P5-3: buildConfirmationLadder does not call patchField, fetch, or scoring endpoints", () => {
  const src = extractFunction(source, "buildConfirmationLadder");
  assert.ok(!src.includes("patchField"), "no patchField");
  assert.ok(!src.includes("fetch("), "no fetch");
  assert.ok(!src.includes("/api/"), "no invented endpoint");
  assert.ok(!src.includes("getStepOpportunityMeta"), "no scorer");
});

test("P5-3: buildConfirmationLadder and confirmationLadderHtml are rail-clean (no headcount / reduction framing)", () => {
  for (const fn of ["buildConfirmationLadder", "confirmationLadderHtml"]) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("headcount"), `${fn}: no headcount`);
    assert.ok(!src.includes("reduction"), `${fn}: no reduction`);
    assert.ok(!src.includes("eliminat"), `${fn}: no eliminate`);
    assert.ok(!src.includes(" fte"), `${fn}: no FTE`);
  }
});

// ── Phase 6 guard ──────────────────────────────────────────────────────────────

test("P5-3: ladder functions contain no Phase 6 items", () => {
  for (const fn of ["buildConfirmationLadder", "confirmationLadderHtml"]) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("workintent"),    `${fn}: no workIntent`);
    assert.ok(!src.includes("stepfunction"),  `${fn}: no stepFunction`);
    assert.ok(!src.includes("uniteconomics"), `${fn}: no unitEconomics`);
    assert.ok(!src.includes("policyupload"),  `${fn}: no policyUpload`);
  }
});

// ── Official rollups count only portfolio-counted records ─────────────────────

test("P5-3: engine.isConfirmed is the gate for portfolio inclusion — true for full record", () => {
  // A record that the bridge would produce for a fully confirmed session.
  assert.equal(engine.isConfirmed(FULL_RECORD), true,
    "fully-specified record is engine-confirmed (portfolio counted)");
});

test("P5-3: engine.isConfirmed false for a partial record (not portfolio counted)", () => {
  assert.equal(engine.isConfirmed(PARTIAL_RECORD), false,
    "partial record is not engine-confirmed (not portfolio counted)");
});

test("P5-3: thin/empty session (empty record) is not portfolio counted", () => {
  assert.equal(engine.isConfirmed({}), false,
    "empty record not portfolio counted");
  assert.equal(engine.isConfirmed({ recap: { confirmed: true } }), false,
    "recap=true alone does not make a record portfolio counted");
});

// ── P5-2 bridge behavior unchanged ────────────────────────────────────────────

test("P5-3: bridgeMissingFields still returns 15 items for null (P5-2 contract unchanged)", () => {
  const sb = makeLadderSandbox();
  assert.equal(sb.bridgeMissingFields(null).length, 15);
});

test("P5-3: bridgeMissingFields still returns [] for a fully populated record (P5-2 contract unchanged)", () => {
  const sb = makeLadderSandbox();
  assert.equal(sb.bridgeMissingFields(FULL_RECORD).length, 0);
});
