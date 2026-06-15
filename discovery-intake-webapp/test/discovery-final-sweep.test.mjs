// Discovery final sweep — a bounded, DESCRIPTIVE closing pass over the thinnest
// captured areas, near the end of the interview. Executed, deterministic tests (NO
// model call — the sweep only produces question text from captured state). Covers:
// thin-area detection is descriptive/structural (by captured detail, never
// opportunity); the bound (<=3 areas, <=2 follow-ups each) is enforced; the sweep is
// skipped/closed cleanly when nothing is thin; the lifecycle starts at the closing arc
// and never loops; the follow-up templates are descriptive-only (no opportunity /
// leverage / time / automation / headcount framing); and the sweep never calls a
// scorer / suggestion endpoint nor writes the grid or a provenance tag. Real shipped
// source extracted/evaluated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();
const serverSource = readServerSource();

const REQUIRED = ["action", "actor", "tool", "accessMode", "input", "dataHandling", "output", "handoff", "trigger", "time", "decision", "dataSensitivity"];
const step = (name, capturedKeys = []) => {
  const s = { name };
  capturedKeys.forEach((k) => { s[k] = `${k} detail`; });
  return s;
};
const thinStep = (name) => step(name, ["action"]);                          // ~8% complete
const fullStep = (name) => step(name, REQUIRED);                            // 100% complete
const fullNoHandoff = (name) => step(name, REQUIRED.filter((k) => k !== "handoff")); // ~92%, handoff empty

// Pure plan / detection / templates.
function pureSandbox(steps = []) {
  return buildSandbox(source, {
    consts: ["FINAL_SWEEP_MAX_AREAS", "FINAL_SWEEP_MAX_FOLLOWUPS_PER_AREA", "FINAL_SWEEP_FIELDS"],
    functions: [
      "finalSweepBuildPlan", "finalSweepThinAreas", "finalSweepStepQuestions", "finalSweepHandoffQuestions", "finalSweepFieldQuestion",
      "stepCompletion", "stepMissingFields", "stepFieldStatusList", "stepFieldMeta", "stepFieldValue", "stepLabel", "isCapturedValue"
    ],
    globals: { state: { steps }, getCurrentStepIndex: () => 0 }
  });
}

// Lifecycle: advance (side-effecting) + pending (pure), with the heavy closing-arc
// gate stubbed via globals (currentValidationStage) and isSameQuestion stubbed to an
// exact match (the sweep always shows the exact text it tracks).
function lifecycleSandbox(steps, stageId) {
  const state = { steps };
  const sb = buildSandbox(source, {
    consts: ["FINAL_SWEEP_MAX_AREAS", "FINAL_SWEEP_MAX_FOLLOWUPS_PER_AREA", "FINAL_SWEEP_FIELDS", "FINAL_SWEEP_INTRO", "FINAL_SWEEP_CLOSE"],
    functions: [
      "advanceFinalSweep", "finalSweepEligible", "finalSweepPendingQuestion", "ensureFinalSweep",
      "finalSweepBuildPlan", "finalSweepThinAreas", "finalSweepStepQuestions", "finalSweepHandoffQuestions", "finalSweepFieldQuestion",
      "stepCompletion", "stepMissingFields", "stepFieldStatusList", "stepFieldMeta", "stepFieldValue", "stepLabel", "isCapturedValue"
    ],
    globals: {
      state,
      currentValidationStage: () => ({ id: stageId }),
      isSameQuestion: (a, b) => String(a) === String(b),
      getCurrentStepIndex: () => 0
    }
  });
  return { sb, state };
}

const FORBIDDEN = /where could ai help|how much time|could this be automated|automat|headcount|\bFTE\b|full-time equivalent|leverage|\bROI\b|opportunity|hours saved|time saved|capacity|% *automat/i;

test("thin-area detection is DESCRIPTIVE/structural (ranked by captured detail), never opportunity", () => {
  const sb = pureSandbox();
  const steps = [fullStep("A"), thinStep("B"), step("C", ["action", "actor", "tool"])]; // completions ~100 / ~8 / 25
  const areas = sb.finalSweepThinAreas(steps);
  const thinStepAreas = areas.filter((a) => a.type === "step");
  assert.deepEqual(thinStepAreas.map((a) => a.index), [1, 2], "only the two thin steps, thinnest first");
  assert.ok(thinStepAreas[0].completion < thinStepAreas[1].completion, "ranked ascending by completion");
  // Source-level: detection reads ONLY captured-detail signals, not any scorer.
  const body = extractFunction(source, "finalSweepThinAreas");
  assert.ok(/stepCompletion|stepFieldValue|isCapturedValue/.test(body), "uses descriptive coverage");
  assert.ok(!/opportunityScore|getStepOpportunityMeta|scoreRecipeReadiness|painFriction|frequencyVolume/.test(body), "no opportunity inputs");
});

test("the bound is enforced: at most 3 areas, at most 2 follow-ups each (<= 6 questions)", () => {
  const sb = pureSandbox();
  const steps = [thinStep("A"), thinStep("B"), thinStep("C"), thinStep("D"), thinStep("E")];
  const plan = sb.finalSweepBuildPlan(steps);
  assert.ok(plan.length <= 6, `plan length ${plan.length} <= 6`);
  const walkthroughs = plan.filter((q) => /^Walk me through/.test(q));
  assert.equal(walkthroughs.length, 3, "exactly 3 areas covered (capped), even with 5 thin steps");
  assert.equal(Number(extractConst(source, "FINAL_SWEEP_MAX_AREAS").match(/=\s*(\d+)/)[1]), 3);
  assert.equal(Number(extractConst(source, "FINAL_SWEEP_MAX_FOLLOWUPS_PER_AREA").match(/=\s*(\d+)/)[1]), 2);
});

test("a thin step yields <=2 descriptive follow-ups (walk-through + one targeted mechanic)", () => {
  const sb = pureSandbox();
  const qs = sb.finalSweepStepQuestions(thinStep("Reconcile the sub-ledger"), 0);
  assert.ok(qs.length <= 2);
  assert.match(qs[0], /^Walk me through what actually happens during "Reconcile the sub-ledger"/);
  assert.ok(qs.every((q) => !FORBIDDEN.test(q)), "no evaluative / opportunity framing");
});

test("a thin handoff yields descriptive follow-ups about how the handoff happens", () => {
  const sb = pureSandbox();
  const qs = sb.finalSweepHandoffQuestions("Collect inputs", "Draft memo");
  assert.ok(qs.length <= 2);
  assert.match(qs[0], /walk me through how that actually happens/i);
  assert.ok(qs.every((q) => !FORBIDDEN.test(q)));
});

test("every field follow-up template is descriptive-only (no evaluative framing)", () => {
  const sb = pureSandbox();
  for (const key of ["actor", "tool", "accessMode", "input", "dataHandling", "output", "handoff", "trigger", "decision", "nope"]) {
    const q = sb.finalSweepFieldQuestion("My step", key);
    assert.ok(q && !FORBIDDEN.test(q), `field "${key}" template is descriptive: ${q}`);
  }
});

test("nothing thin → the plan is empty (the sweep will skip / close cleanly)", () => {
  const sb = pureSandbox();
  const steps = [fullStep("A"), fullStep("B"), fullStep("C")];
  assert.deepEqual(sb.finalSweepBuildPlan(steps), [], "all steps fully detailed → no thin areas");
});

test("a thin HANDOFF (complete step but uncaptured handoff) is detected without double-covering a thin step", () => {
  const sb = pureSandbox();
  const steps = [fullNoHandoff("A"), fullStep("B"), fullStep("C")]; // A is ~92% (not a thin step) but its handoff is empty
  const areas = sb.finalSweepThinAreas(steps);
  assert.ok(!areas.some((a) => a.type === "step"), "no thin steps here");
  assert.ok(areas.some((a) => a.type === "handoff" && a.index === 0), "the uncaptured handoff from A is a thin area");
});

test("lifecycle: not at the closing arc → the sweep never starts (pending stays empty)", () => {
  const { sb } = lifecycleSandbox([thinStep("A"), thinStep("B"), thinStep("C")], "detail");
  sb.advanceFinalSweep("some earlier question");
  assert.equal(sb.finalSweepPendingQuestion(), "", "mid-interview: no sweep");
});

test("lifecycle: <3 steps → never eligible even at the closing arc", () => {
  const { sb } = lifecycleSandbox([thinStep("A"), thinStep("B")], "candidate");
  sb.advanceFinalSweep("q");
  assert.equal(sb.finalSweepPendingQuestion(), "", "no real process map → no sweep");
});

test("lifecycle: at the closing arc with thin areas → starts (framed), walks the bounded plan, then closes; never loops", () => {
  const { sb, state } = lifecycleSandbox([thinStep("A"), thinStep("B"), thinStep("C"), thinStep("D")], "candidate");
  // First eligible answer starts the sweep.
  sb.advanceFinalSweep("prior detail question");
  const first = sb.finalSweepPendingQuestion();
  assert.match(first, /^A few last things to make sure I've got this right\./, "light framing on the first sweep turn");

  const shown = [];
  let guard = 0;
  let q = sb.finalSweepPendingQuestion();
  while (q && guard < 25) {
    shown.push(q);
    sb.advanceFinalSweep(q);      // the person answers the shown question
    q = sb.finalSweepPendingQuestion();
    guard += 1;
  }
  assert.ok(guard < 25, "the sweep terminates — it never loops");
  assert.ok(state.finalSweep.closed, "the sweep closes");
  assert.equal(sb.finalSweepPendingQuestion(), "", "after close, nothing more is asked");
  const followUps = shown.filter((s) => s !== state.finalSweep && !/^Got it —/.test(s));
  assert.ok(shown.length <= 7, `<= 6 follow-ups + 1 close line (was ${shown.length})`);
  assert.ok(shown.some((s) => /^Got it — that's a clear picture/.test(s)), "ends with a clean close line");
  // Bound: at most 3 areas (walk-throughs).
  assert.ok(shown.filter((s) => /Walk me through/.test(s)).length <= 3, "<= 3 areas");
  // No evaluative framing anywhere in the shown sequence.
  assert.ok(shown.every((s) => !FORBIDDEN.test(s)), "every sweep turn is descriptive-only");
});

test("lifecycle: nothing thin → closes cleanly with one reassuring line, no interrogation", () => {
  const { sb, state } = lifecycleSandbox([fullStep("A"), fullStep("B"), fullStep("C")], "candidate");
  sb.advanceFinalSweep("prior question");
  const only = sb.finalSweepPendingQuestion();
  assert.match(only, /^Got it — that's a clear picture/, "clean close, not a follow-up");
  sb.advanceFinalSweep(only);
  assert.ok(state.finalSweep.closed);
  assert.equal(sb.finalSweepPendingQuestion(), "");
});

test("the sweep is wired into the router (pure) and advanced once per answer (side-effecting)", () => {
  const router = extractFunction(source, "nextQuestionRouteAfterExtraction");
  assert.ok(/finalSweepPendingQuestion\(\)/.test(router), "router reads the sweep (pure)");
  assert.ok(/source:\s*"Final sweep"/.test(router), "sweep questions are sourced as Final sweep");
  // Advanced exactly where the frame gate advances — once per answer.
  assert.ok(/advanceFinalSweep\(options\.askedQuestion/.test(source), "advanced once per answer, next to advanceWorkflowFrameGate");
});

test("RAIL: the sweep never calls a scorer/endpoint and never writes the grid or a provenance tag", () => {
  for (const fn of ["finalSweepThinAreas", "finalSweepBuildPlan", "finalSweepStepQuestions", "finalSweepHandoffQuestions", "finalSweepFieldQuestion", "finalSweepPendingQuestion", "advanceFinalSweep", "finalSweepEligible", "ensureFinalSweep"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/\/api\//.test(body), `${fn}: no endpoint call`);
    assert.ok(!/getStepOpportunityMeta|scoreRecipeReadiness|buildAgentRecipeIr|opportunityScore/.test(body), `${fn}: no scorer`);
    assert.ok(!/patchField|setStructuralTag|applyStructuralSuggestion|confirmStructuralTag|setRoleTag|setFrictionTag|recordTelemetry/.test(body), `${fn}: no grid write / no provenance auto-harden / no telemetry`);
  }
});

test("RAIL: no leverage / headcount / FTE / automatable / opportunity framing anywhere in the sweep code", () => {
  const blob = [
    extractConst(source, "FINAL_SWEEP_FIELDS"),
    extractConst(source, "FINAL_SWEEP_INTRO"),
    extractConst(source, "FINAL_SWEEP_CLOSE"),
    extractFunction(source, "finalSweepFieldQuestion"),
    extractFunction(source, "finalSweepStepQuestions"),
    extractFunction(source, "finalSweepHandoffQuestions"),
    extractFunction(source, "finalSweepThinAreas"),
    extractFunction(source, "advanceFinalSweep")
  ].join("\n");
  assert.ok(!FORBIDDEN.test(blob), "the sweep code carries no evaluative / opportunity framing");
  assert.ok(!/work with your development team/i.test(blob), "banned phrase absent");
});

test("RAIL: the four suggestion-endpoint contracts are unchanged (descriptive, {value,...}|{value:null}, no scorer)", () => {
  for (const route of ["/api/suggest-role", "/api/suggest-step-type", "/api/suggest-structural-type", "/api/suggest-friction"]) {
    assert.ok(serverSource.includes(route), `${route} still registered`);
  }
  for (const handler of ["handleSuggestRole", "handleSuggestStepType", "handleSuggestStructuralType", "handleSuggestFriction"]) {
    const body = extractFunction(serverSource, handler);
    assert.ok(/value:\s*null/.test(body), `${handler} still returns {value:null} on no-match`);
    assert.ok(!/opportunity|getStepOpportunity|computeBusinessCase|buildAgentRecipeIr|scoreRecipe/i.test(body), `${handler} stays descriptive — no scorer/opportunity`);
  }
});
