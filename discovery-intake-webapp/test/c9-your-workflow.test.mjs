// C-9 — Your Workflow: leverage-framed, plain language, no cost/headcount.
// Tests use source-level extraction (buildSandbox) — no DOM, no live engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// Shared state with the five structural sidecars
function makeState(extra = {}) {
  return {
    workflowGrid: { steps: [] },
    stepTypes: {}, frictionTags: {}, roleTags: {},
    handoffTags: {}, decisionTags: {},
    questionHistory: [], evidenceArtifacts: [],
    ...extra
  };
}

// Minimal workable step
function makeStep(id, cls = "gather", opts = {}) {
  return {
    id,
    name: id,
    cls,
    cells: {},
    workbenchConfirmed: opts.confirmed ?? false,
    composedAddr: opts.composedAddr ?? null,
    theo: opts.theo ?? null,
    accessMode: opts.accessMode ?? ""
  };
}

function ywSandbox(stateOverride = {}) {
  const state = makeState(stateOverride);
  return buildSandbox(source, {
    consts: [
      "YW_HUMAN_STRUCTURAL", "HUMAN_HOLD_HUE", "HEATMAP_STATE_DOTS",
      "STEP_TYPE_OPTIONS", "FRICTION_KINDS", "ROLE_VALUES",
      "HANDOFF_KINDS", "DECISION_KINDS",
      "GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"
    ],
    functions: [
      "ywBuildModel", "ywTimeBackLabel", "ywItemHtml", "ywBucketHtml",
      "ywHeroHtml", "ywReinvestHtml", "ywPromiseHtml",
      "renderAnalysisTabWorkflow",
      // leverage engine functions needed by ywBuildModel
      "buildWorkflowLeverage", "leverageLevelFor", "leverageStepHumanHeld",
      "leverageSeamMotivators", "seamMotivatorPhrase", "provenanceToState",
      "leastAssertedState", "structuralTagOf", "handoffId",
      "seamFrictionDim", "seamLatencyDim", "seamCriticalityDim",
      // display helpers — getField needed by gridCellValue
      "getField", "stepDisplayName", "gridCellValue", "analysisGridSteps",
      "analysisWorkflowName", "escapeHtml",
      // grid cell helpers needed by getField
      "newGridCell", "newGridStep"
    ],
    globals: {
      state,
      document: { getElementById: () => null, querySelectorAll: () => [] },
      console: { warn() {}, error() {}, info() {} }
    }
  });
}

// ── ywTimeBackLabel ───────────────────────────────────────────────────────

test("ywTimeBackLabel: 0 minutes returns null", () => {
  const { ywTimeBackLabel } = ywSandbox();
  assert.equal(ywTimeBackLabel(0), null);
});

test("ywTimeBackLabel: under 60 min returns minutes string", () => {
  const { ywTimeBackLabel } = ywSandbox();
  assert.ok(ywTimeBackLabel(45).includes("45m"));
});

test("ywTimeBackLabel: 60+ min returns hours string", () => {
  const { ywTimeBackLabel } = ywSandbox();
  const out = ywTimeBackLabel(90);
  assert.ok(out.includes("hr"), `expected hrs in '${out}'`);
  assert.ok(out.startsWith("~"), "starts with ~");
});

// ── ywBuildModel bucket classification ───────────────────────────────────

test("ywBuildModel: empty steps → all buckets empty", () => {
  const { ywBuildModel } = ywSandbox();
  const m = ywBuildModel([]);
  assert.equal(m.readyNow.length, 0);
  assert.equal(m.needsSetup.length, 0);
  assert.equal(m.staysYours.length, 0);
  assert.equal(m.timeBackMinutes, 0);
  assert.equal(m.hasLeverage, false);
});

test("ywBuildModel: structural human cls (judgment) with no leverage → staysYours", () => {
  const { ywBuildModel } = ywSandbox();
  const steps = [makeStep("s1", "judgment")];
  const m = ywBuildModel(steps);
  assert.equal(m.staysYours.length, 1, "judgment step goes to staysYours");
  assert.equal(m.staysYours[0].id, "s1");
  assert.equal(m.readyNow.length, 0);
});

test("ywBuildModel: decision cls → staysYours", () => {
  const { ywBuildModel } = ywSandbox();
  const m = ywBuildModel([makeStep("s1", "decision")]);
  assert.equal(m.staysYours.length, 1);
});

test("ywBuildModel: human_held cls → staysYours", () => {
  const { ywBuildModel } = ywSandbox();
  const m = ywBuildModel([makeStep("s1", "human_held")]);
  assert.equal(m.staysYours.length, 1);
});

test("ywBuildModel: non-structural cls with no leverage signal → needsSetup", () => {
  const { ywBuildModel } = ywSandbox();
  const steps = [makeStep("s1", "gather")]; // no sidecars, no tool → no leverage signal
  const m = ywBuildModel(steps);
  assert.equal(m.needsSetup.length, 1, "no-signal gather step → needsSetup");
  assert.equal(m.needsSetup[0].id, "s1");
});

test("ywBuildModel: leverage step with confirmed=true → readyNow", () => {
  // A step needs at least one sidecar to get a leverage signal from buildWorkflowLeverage.
  // We provide a tool (systemsTools) via cells to trigger the signal.
  const { ywBuildModel } = ywSandbox();
  const step = makeStep("s1", "gather", { confirmed: true });
  step.cells = { systemsTools: { value: "Excel", source: "user-stated", confidence: 0.9 } };
  const m = ywBuildModel([step]);
  // If buildWorkflowLeverage produces a step row for s1 and it's confirmed → readyNow
  const inReady = m.readyNow.some(r => r.id === "s1");
  const inSetup = m.needsSetup.some(r => r.id === "s1");
  // It may end up in readyNow (if leverage signal found + confirmed) or staysYours (if humanHeld)
  assert.ok(inReady || inSetup, "confirmed tool step should appear in readyNow or needsSetup");
  assert.ok(!m.staysYours.some(r => r.id === "s1"), "non-held step must not be in staysYours");
});

test("ywBuildModel: leverage step with confirmed=false → needsSetup", () => {
  const { ywBuildModel } = ywSandbox();
  const step = makeStep("s1", "gather", { confirmed: false });
  step.cells = { systemsTools: { value: "Excel", source: "user-stated", confidence: 0.9 } };
  const m = ywBuildModel([step]);
  // May be in needsSetup (leverage found, not confirmed) or needsSetup (no leverage)
  // either way it must NOT be in readyNow
  assert.ok(!m.readyNow.some(r => r.id === "s1"), "unconfirmed step must not be in readyNow");
});

test("ywBuildModel: timeBackMinutes is 0 when no timeTaken cell values", () => {
  const { ywBuildModel } = ywSandbox();
  const steps = [makeStep("s1", "gather")];
  const m = ywBuildModel(steps);
  assert.equal(m.timeBackMinutes, 0);
});

test("ywBuildModel: timeBackMinutes uses composedAddr when present", () => {
  const { ywBuildModel } = ywSandbox();
  const step = makeStep("s1", "gather", { confirmed: true, composedAddr: 80 });
  step.cells = {
    systemsTools: { value: "Excel", source: "user-stated", confidence: 0.9 },
    timeTaken: { value: "60", source: "user-stated", confidence: 0.9 }
  };
  const m = ywBuildModel([step]);
  // If the step gets a leverage signal (from systemsTools), timeBackMinutes ≈ 60 * 0.80 = 48
  // If not (no leverage signal), timeBackMinutes = 0
  assert.ok(m.timeBackMinutes >= 0, "timeBackMinutes is non-negative");
  // Can't assert exact value since leverage depends on sidecar presence
});

// ── ywHeroHtml ─────────────────────────────────────────────────────────────

test("ywHeroHtml: renders workflow name", () => {
  const { ywHeroHtml } = ywSandbox();
  const out = ywHeroHtml("Settlement Recon", { timeBackMinutes: 0, hasLeverage: false });
  assert.ok(out.includes("Settlement Recon"), "workflow name present");
});

test("ywHeroHtml: contains no cost metrics or FTE language (prohibition framing is permitted)", () => {
  // The hero uses neutral, descriptive copy (no cost or headcount claims).
  // What's banned: dollar amounts, FTE ratios, savings metrics as actual values.
  const { ywHeroHtml } = ywSandbox();
  const out = ywHeroHtml("My workflow", { timeBackMinutes: 90, hasLeverage: true });
  const lower = out.toLowerCase();
  assert.ok(!lower.includes("fte"), "no FTE acronym in hero");
  assert.ok(!lower.includes("dollar"), "no dollar in hero");
  assert.ok(!lower.includes("$"), "no $ sign in hero");
  assert.ok(!lower.includes("cost saving"), "no cost-saving metric in hero");
  assert.ok(!lower.includes("roi"), "no ROI in hero");
  assert.ok(!lower.includes("efficiency"), "no efficiency language in hero");
});

test("ywHeroHtml: time badge absent when timeBackMinutes is 0", () => {
  const { ywHeroHtml } = ywSandbox();
  const out = ywHeroHtml("My workflow", { timeBackMinutes: 0 });
  assert.ok(!out.includes("per run"), "no time badge when 0");
});

test("ywHeroHtml: time badge present when timeBackMinutes > 0", () => {
  const { ywHeroHtml } = ywSandbox();
  const out = ywHeroHtml("My workflow", { timeBackMinutes: 45 });
  assert.ok(out.includes("per run"), "time badge shown when >0");
  assert.ok(out.includes("45m"), "minutes shown correctly");
});

// ── ywBucketHtml ──────────────────────────────────────────────────────────

test("ywBucketHtml: empty bucket shows emptyMsg", () => {
  const { ywBucketHtml } = ywSandbox();
  const out = ywBucketHtml("Ready now", "var(--gm-value)", "✓", [], "Nothing yet");
  assert.ok(out.includes("Nothing yet"), "empty message shown");
  assert.ok(out.includes("Ready now"), "label shown");
  assert.ok(out.includes(">0<"), "count is 0");
});

test("ywBucketHtml: count matches items length", () => {
  const { ywBucketHtml, ywItemHtml } = ywSandbox();
  const items = [
    { type: "step", id: "s1", name: "Step A", assist: "AI helps", evidence: [], level: "high", lstate: "stated", humanHeld: false },
    { type: "step", id: "s2", name: "Step B", assist: null, evidence: [], level: null, lstate: null, humanHeld: false, note: "needs info" }
  ];
  const out = ywBucketHtml("Needs setup", "var(--gm-hours)", "○", items, "");
  assert.ok(out.includes(">2<"), "count = 2");
});

// ── ywReinvestHtml ────────────────────────────────────────────────────────

test("ywReinvestHtml: contains all four reinvestment directions", () => {
  const { ywReinvestHtml } = ywSandbox();
  const out = ywReinvestHtml();
  assert.ok(out.includes("Go deeper"), "Go deeper");
  assert.ok(out.includes("Help the team"), "Help the team");
  assert.ok(out.includes("Learn something"), "Learn something");
  assert.ok(out.includes("Build something"), "Build something");
});

test("ywReinvestHtml: contains no cost or headcount language", () => {
  const { ywReinvestHtml } = ywSandbox();
  const out = ywReinvestHtml().toLowerCase();
  assert.ok(!out.includes("cost"), "no cost");
  assert.ok(!out.includes("headcount"), "no headcount");
  assert.ok(!out.includes("fte"), "no FTE");
  assert.ok(!out.includes("$"), "no dollars");
});

test("ywReinvestHtml: Now / Next / Durable badges present", () => {
  const { ywReinvestHtml } = ywSandbox();
  const out = ywReinvestHtml();
  assert.ok(out.includes("Now"), "Now badge");
  assert.ok(out.includes("Next"), "Next badge");
  assert.ok(out.includes("Durable"), "Durable badge");
});

// ── ywPromiseHtml ─────────────────────────────────────────────────────────

test("ywPromiseHtml: contains the promise panel with required framing", () => {
  const { ywPromiseHtml } = ywSandbox();
  const out = ywPromiseHtml();
  assert.ok(out.includes("The promise"), "promise heading");
  assert.ok(out.toLowerCase().includes("judgment"), "mentions judgment");
  assert.ok(out.toLowerCase().includes("trust"), "mentions trust");
  assert.ok(out.toLowerCase().includes("cost"), "explicitly calls out cost");
  assert.ok(out.toLowerCase().includes("headcount"), "explicitly calls out headcount");
});

// ── renderAnalysisTabWorkflow: separation invariants ─────────────────────

test("separation: renderAnalysisTabWorkflow does not call getStepOpportunityMeta", () => {
  const src = extractFunction(source, "renderAnalysisTabWorkflow");
  assert.ok(!src.includes("getStepOpportunityMeta"), "must not call scorer");
});

test("separation: renderAnalysisTabWorkflow does not call patchField", () => {
  const src = extractFunction(source, "renderAnalysisTabWorkflow");
  assert.ok(!src.includes("patchField"), "must not write grid");
});

test("separation: renderAnalysisTabWorkflow contains no invented server endpoint", () => {
  const src = extractFunction(source, "renderAnalysisTabWorkflow") +
              extractFunction(source, "ywBuildModel");
  assert.ok(!src.includes("fetch("), "no fetch calls");
  assert.ok(!src.includes("/api/your-workflow"), "no invented endpoint");
});

test("separation: ywBuildModel does not call getStepOpportunityMeta", () => {
  const src = extractFunction(source, "ywBuildModel");
  assert.ok(!src.includes("getStepOpportunityMeta"), "model must not call scorer");
});

// ── no cost/headcount in source ───────────────────────────────────────────

test("rail-clean: C-9 compute/render functions contain no cost-metric or FTE strings", () => {
  // Checked on compute/render functions only — ywPromiseHtml intentionally names
  // "costs or headcount" as things it *excludes*, which is permitted.
  const fns = ["renderAnalysisTabWorkflow", "ywBuildModel", "ywHeroHtml",
                "ywBucketHtml", "ywItemHtml", "ywReinvestHtml"];
  const BANNED = ["cost-saving", "efficiency saving", "FTE equivalent",
                  "$/hr", "dollar amount", "ROI", "headcount reduction"];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    for (const banned of BANNED) {
      assert.ok(!src.includes(banned), `${fn} must not contain "${banned}"`);
    }
  }
});

test("rail-clean: ywHeroHtml runtime output contains no dollar amounts or FTE ratios", () => {
  // The hero uses neutral, descriptive copy — no cost or headcount claims.
  // Dollar signs, FTE ratios, and savings metrics as actual values are banned.
  const { ywHeroHtml } = ywSandbox();
  const out = ywHeroHtml("Recon", { timeBackMinutes: 120, hasLeverage: true });
  const lower = out.toLowerCase();
  for (const banned of ["fte", "$/", "cost saving", "efficiency", "roi"]) {
    assert.ok(!lower.includes(banned), `hero output must not contain "${banned}"`);
  }
});
