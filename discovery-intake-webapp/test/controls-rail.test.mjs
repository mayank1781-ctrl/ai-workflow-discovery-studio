// Edition 3 — F2: controls + shared rules + the control-aware rail. A control makes a "decision"
// graduated & structural; the authority ladder is written ONCE in sharedRules and referenced. The
// rail gains deterministic, gating, control-aware checks (one place, same authority): four-eyes
// actors must be distinct; an authority step must name a HUMAN approver; a halt-on-flag may never be
// auto-resolved. ADDITIVE: a control-free workflow has nothing to gate => decision = human, as today.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
const FPA = engine.FPA_INTAKE;
const withSteps = (steps) => ({ ...RECON, steps });

function adapterSandbox() {
  return buildSandbox(source, {
    functions: [
      "studioEngine", "railCheck", "engineProvValue", "engineStepClass", "engineDataTier",
      "appStepToEngineStep", "appWorkflowToIntake", "engineControlRail", "engineResolveApprover",
    ],
    globals: {
      window: { StudioEngine: engine },
      gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [],
      recipeConnectionSeams: () => [], analysisWorkflowName: () => "",
    },
  });
}

// ---------- shared rules: write once, referenced ----------
test("the authority ladder lives once in sharedRules and is referenced by the step (not copied)", () => {
  const approve = RECON.steps.find((s) => s.step === "Approve adjustment");
  assert.equal(approve.control.authorityRef, "authorityMatrix:writeOff", "the step references the rule by id");
  assert.ok(!approve.control.bands, "the ladder is not copied onto the step");
  assert.ok(engine.sharedRule(RECON, "authorityMatrix:writeOff").bands.length === 4, "the ladder lives once in sharedRules");
});

test("authority resolves the right approver per value band, from the shared ladder", () => {
  assert.equal(engine.resolveAuthorityApprover(RECON, "authorityMatrix:writeOff", 50).approver, "checker");
  assert.equal(engine.resolveAuthorityApprover(RECON, "authorityMatrix:writeOff", 1000).approver, "teamLead");
  assert.equal(engine.resolveAuthorityApprover(RECON, "authorityMatrix:writeOff", 5000).approver, "opsManager");
  assert.equal(engine.resolveAuthorityApprover(RECON, "authorityMatrix:writeOff", 99999).approver, "opsManager+finance");
  assert.equal(engine.resolveAuthorityApprover(RECON, "authorityMatrix:missing", 10), null, "a missing rule is surfaced, never assumed");
});

// ---------- (1) four-eyes / segregation: distinct actors ----------
test("four-eyes enforces two DIFFERENT actors; same actor is a hard violation", () => {
  assert.ok(engine.controlRail(RECON).ok, "the clean recon SOP passes (maker != checker)");
  const same = withSteps([{ ...RECON.steps[3], participants: [{ actorId: "maker", part: "doer" }, { actorId: "maker", part: "approver" }] }]);
  const r = engine.controlRail(same);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.rule === "four-eyes-distinct"));
});

test("an AI/system actor may never be the approver in a four-eyes (no self-approval)", () => {
  const ai = withSteps([{ ...RECON.steps[3], participants: [{ actorId: "maker", part: "doer" }, { actorId: "system:autoApprove", part: "approver" }] }]);
  assert.ok(engine.controlRail(ai).violations.some((v) => v.rule === "approver-must-be-human"));
});

// ---------- (2) authority: names a human approver, ladder exists ----------
test("an authority step missing its approver, or referencing a missing ladder, is a violation", () => {
  const noAppr = withSteps([{ ...RECON.steps[3], participants: [{ actorId: "maker", part: "doer" }] }]);
  assert.ok(engine.controlRail(noAppr).violations.some((v) => v.rule === "authority-named-approver"));
  const badRef = withSteps([{ ...RECON.steps[3], control: { type: "four-eyes", distinct: ["doer", "approver"], authorityRef: "authorityMatrix:ghost" } }]);
  assert.ok(engine.controlRail(badRef).violations.some((v) => v.rule === "authority-rule-missing"));
});

// ---------- (3) halt-on-flag: human target, negativeConstraint, never auto-resolved ----------
test("a halt-on-flag may NEVER be auto-resolved by AI, must name a human target + a negativeConstraint", () => {
  const autoHalt = withSteps([{ ...RECON.steps[1], autoResolve: true }]);
  assert.ok(engine.controlRail(autoHalt).violations.some((v) => v.rule === "halt-no-auto-resolve"));
  const noTarget = withSteps([{ ...RECON.steps[1], control: { type: "halt-on-flag", on: "AML", negativeConstraint: "no tip-off" } }]);
  assert.ok(engine.controlRail(noTarget).violations.some((v) => v.rule === "halt-escalation-target"));
  const noConstraint = withSteps([{ ...RECON.steps[1], control: { type: "halt-on-flag", on: "AML", escalateTo: "finCrime" } }]);
  assert.ok(engine.controlRail(noConstraint).violations.some((v) => v.rule === "halt-negative-constraint"));
  // the clean recon halt (human target + constraint + no auto-resolve) passes
  assert.ok(engine.controlRail(withSteps([RECON.steps[1]])).ok);
});

// ---------- one rail, two modes; vocabulary rail byte-identical ----------
test("railCheck is ONE entry point: a record delegates to the control rail; a string stays the surface rail", () => {
  assert.equal(engine.railCheck(RECON).ok, engine.controlRail(RECON).ok, "record -> control rail");
  // the vocabulary rail is unchanged (byte-identical behavior on strings)
  assert.equal(engine.railCheck("capacity freed", "dashboard").ok, true);
  assert.equal(engine.railCheck("capacity freed", "capture").ok, false);
  assert.equal(engine.railCheck("reduce headcount", "dashboard").ok, false);
});

// ---------- enum integrity + additive ----------
test("an unknown control type is surfaced by validateIntake; a control-free workflow stays clean", () => {
  const bad = { ...FPA, steps: [{ step: "x", cls: "assembly", data: "public", control: { type: "rubber-stamp" } }] };
  assert.ok(engine.validateIntake(bad).errors.some((e) => /unknown control type "rubber-stamp"/.test(e)));
  assert.equal(engine.controlRail(FPA).ok, true, "no controls => nothing to gate (additive)");
  assert.equal(engine.validateIntake(FPA).coverage.pct, 100, "FP&A unchanged");
});

test("buildRecipe surfaces the control inline (resolved authority ladder) but a single-actor step is byte-identical", () => {
  const fpaStep = engine.buildRecipe(FPA).orderedSteps[0];
  assert.ok(!("control" in fpaStep) && !("doer" in fpaStep), "control-free single-actor step unchanged");
  const approve = engine.buildRecipe(RECON).orderedSteps.find((s) => s.step === "Approve adjustment");
  assert.equal(approve.control.type, "four-eyes");
  assert.ok(Array.isArray(approve.control.authority.bands), "the authority ladder is resolved onto the recipe step");
  assert.equal(approve.doer.role, "Ops Analyst");
  assert.ok(engine.buildRecipe(RECON).rail.ok, "the recipe carries a passing control rail for the clean SOP");
});

// ---------- adapter: the app passes controls/sharedRules through and DELEGATES ----------
test("the adapter carries the step control + the firm-level sharedRules into the engine intake", () => {
  const sb = adapterSandbox();
  const intake = sb.appWorkflowToIntake({ steps: RECON.steps, meta: { header: RECON.header, actors: RECON.actors, sharedRules: RECON.sharedRules } });
  assert.equal(intake.sharedRules.length, 1, "the write-once ladder is carried");
  const approve = intake.steps.find((s) => s.step === "Approve adjustment");
  assert.equal(approve.control.type, "four-eyes", "the step control is carried");
});

test("engineControlRail + engineResolveApprover delegate to the engine (no fork)", () => {
  const sb = adapterSandbox();
  assert.equal(sb.engineControlRail({ record: RECON }).ok, engine.controlRail(RECON).ok);
  const dirty = { ...RECON, steps: [{ ...RECON.steps[3], participants: [{ actorId: "maker", part: "doer" }, { actorId: "maker", part: "approver" }] }] };
  assert.equal(sb.engineControlRail({ record: dirty }).ok, false, "a same-actor four-eyes fails through the adapter too");
  assert.equal(sb.engineResolveApprover("authorityMatrix:writeOff", 5000, { record: RECON }).approver, "opsManager");
  // app railCheck(record) also delegates to the control rail
  assert.equal(sb.railCheck(dirty).ok, false);
});
