// Edition 3 — F5: Discovery capture (render layer). Elicits the multi-actor structure in WORKER-SAFE
// language: per step the doer + other parts, the class WITH the interpretation rubric inline (the eval
// traps as warnings), the data tier, any control; a coverage meter extended to actors/controls/parts;
// per seam the three dims scored independently. Every Discovery string passes the worker rail (no cost/
// capacity/headcount). The engine owns the rubric; this is a thin projection. ADDITIVE: no steps => "".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
const FORBIDDEN = /headcount|\bFTE\b|cost-to-serve|capacity|leverage|net value|hours saved/i;

function sandbox() {
  return buildSandbox(source, {
    consts: ["DISCOVERY_CLASS_PROMPT", "DISCOVERY_DATA_PROMPT"],
    functions: [
      "studioEngine", "engineProvValue", "engineStepClass", "engineDataTier", "appStepToEngineStep", "appWorkflowToIntake",
      "discoveryClassTint", "discoveryControlTint", "discoveryStepRubricHint", "discoveryStepCaptureModel",
      "discoveryMultiActorCoverage", "discoverySeamCaptureModel", "discoveryMultiActorCaptureHtml",
    ],
    globals: {
      window: { StudioEngine: engine },
      escapeHtml: (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
      gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [],
      recipeConnectionSeams: () => [], analysisWorkflowName: () => "",
    },
  });
}

test("the capture maps to a VALID multi-actor intake the engine accepts (coverage 100)", () => {
  const sb = sandbox();
  const intake = sb.appWorkflowToIntake({ steps: RECON.steps, meta: { header: RECON.header, actors: RECON.actors, sharedRules: RECON.sharedRules, trigger: RECON.trigger, judgment: RECON.judgment, confirm: RECON.confirm, seams: RECON.seams, recap: RECON.recap } });
  const v = engine.validateIntake(intake);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test("per-step capture model carries the doer + other parts, the class, and its tint (locked color map)", () => {
  const sb = sandbox();
  const approve = RECON.steps.find((s) => s.step === "Approve adjustment");
  const m = sb.discoveryStepCaptureModel(approve, RECON);
  assert.equal(m.doer.role, "Ops Analyst");
  assert.deepEqual(m.otherParts.map((p) => p.part), ["approver"]);
  assert.equal(m.cls, "decision");
  assert.equal(m.classTint, "var(--sg-pink)", "decision = pink");
  assert.equal(sb.discoveryClassTint("assembly"), "var(--sg-green)");
  assert.equal(sb.discoveryClassTint("judgment"), "var(--sg-amber)");
  assert.equal(sb.discoveryControlTint("four-eyes"), "var(--sg-blue)");
});

test("the rubric hints fire on the eval-set traps (worker-safe, never an answer)", () => {
  const sb = sandbox();
  assert.match(sb.discoveryStepRubricHint({ step: "I just sign off that we're compliant" }), /hides a decision/);
  assert.match(sb.discoveryStepRubricHint({ step: "draft the memo and recommend the waiver" }), /split/i);
  assert.match(sb.discoveryStepRubricHint({ step: "flag it to the officer — it's one click" }), /one click/i);
  assert.equal(sb.discoveryStepRubricHint({ step: "Reconcile the ledger" }), null, "no trap => no hint");
  // hints carry no economics/headcount vocabulary
  for (const t of ["I just sign off and send it on", "draft the memo and recommend the waiver", "it's one click"]) {
    const h = sb.discoveryStepRubricHint({ step: t });
    if (h) assert.ok(!FORBIDDEN.test(h), `hint clean: ${h}`);
  }
});

test("the coverage meter is extended to actors / controls / parts and reflects what is missing", () => {
  const sb = sandbox();
  const full = sb.discoveryMultiActorCoverage(RECON);
  assert.equal(full.pct, 100, JSON.stringify(full.gaps));
  // strip the actors registry + the doers => the meter shows the gaps
  const thin = { ...RECON, actors: [], steps: RECON.steps.map((s) => ({ ...s, participants: undefined, data: undefined })) };
  const cov = sb.discoveryMultiActorCoverage(thin);
  assert.ok(cov.pct < 100);
  assert.ok(cov.gaps.includes("actors named"));
  assert.ok(cov.gaps.includes("a doer on every step"));
  assert.ok(cov.gaps.includes("a data tier on every step"));
});

test("per-seam capture scores friction / latency / criticality INDEPENDENTLY (criticality from consequence)", () => {
  const sb = sandbox();
  const m = sb.discoverySeamCaptureModel({ from: "Ops Analyst", to: "Senior Analyst", friction: "low", latency: "medium", note: "Four-eyes approval gate; one click but the call commits" });
  assert.equal(m.friction, "low");
  assert.equal(m.criticality, "high", "a hand-off into an approval is high-criticality regardless of friction");
  assert.match(m.hint, /consequence/i);
});

test("every Discovery string passes the WORKER rail and the economics family FAILS on capture", () => {
  const sb = sandbox();
  // the capture prompts + panel are worker-safe
  assert.equal(engine.railCheck(sb.discoveryStepCaptureModel(RECON.steps[0], RECON).classPrompt, "capture").ok, true);
  assert.equal(engine.railCheck(sb.discoveryStepCaptureModel(RECON.steps[0], RECON).dataPrompt, "capture").ok, true);
  const html = sb.discoveryMultiActorCaptureHtml(RECON);
  assert.equal(engine.railCheck(html, "capture").ok, true, JSON.stringify(engine.railCheck(html, "capture").violations));
  assert.ok(!FORBIDDEN.test(html), "no economics/headcount vocabulary in the capture panel");
  // the inverse proves the rail is real: an economics string is blocked on capture, allowed on recipe/dashboard
  assert.equal(engine.railCheck("cost-to-serve is a band", "capture").ok, false);
  assert.equal(engine.railCheck("cost-to-serve is a band", "recipe").ok, true);
  assert.equal(engine.railCheck("capacity freed", "dashboard").ok, true);
});

test("the panel renders the multi-actor map; ADDITIVE: no steps => empty string (byte-identical)", () => {
  const sb = sandbox();
  const html = sb.discoveryMultiActorCaptureHtml(RECON);
  assert.match(html, /Who does each step/);
  assert.match(html, /Ops Analyst/);
  assert.match(html, /four-eyes/);
  assert.match(html, /Capture coverage 100%/);
  assert.equal(sb.discoveryMultiActorCaptureHtml({ steps: [] }), "", "no steps => nothing");
  assert.equal(sb.discoveryMultiActorCaptureHtml({}), "", "no record => nothing");
});
