// Edition 3 — F1: firm-level actors + per-step parts. Identity (who) lives ONCE in a firm-level
// actors[] registry and is referenced by id; the part played (doer/approver/…) is per step. Capacity
// rolls up by the step's DOER; a non-doer part frees 0. A hand-off is where the doer changes.
// ADDITIVE: a record with no participants behaves byte-identically (one implicit doer = persona).
// The math lives in studio_engine.mjs; the app calls it through the thin adapter (no fork).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const RECON = engine.RECON_INTAKE;
const FPA = engine.FPA_INTAKE;

function adapterSandbox() {
  return buildSandbox(source, {
    functions: [
      "studioEngine", "engineProvValue", "engineStepClass", "engineDataTier",
      "appStepToEngineStep", "appWorkflowToIntake", "engineWorkflowRoleCapacity", "engineWorkflowHandoffs",
    ],
    globals: {
      window: { StudioEngine: engine },
      gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [],
      recipeConnectionSeams: () => [], analysisWorkflowName: () => "",
    },
  });
}

// ---------- engine: identity is referenced, not embedded ----------
test("the actor registry is referenced by id — a step holds only an actorId; the role comes from the registry", () => {
  // the step carries no role text, only an actorId
  const approve = RECON.steps.find((s) => s.step === "Approve adjustment");
  assert.deepEqual(approve.participants.map((p) => p.actorId), ["maker", "checker"]);
  assert.ok(!approve.participants.some((p) => "role" in p), "the part references identity, never copies it");
  // identity resolves from the firm-level registry
  assert.equal(engine.resolveActor("maker", RECON).role, "Ops Analyst");
  assert.equal(engine.resolveActor("finCrime", RECON).line, "2LoD");
});

test("the doer is the performer (not the approver) on a multi-part step", () => {
  const approve = RECON.steps.find((s) => s.step === "Approve adjustment");
  assert.equal(engine.stepDoerId(approve, RECON), "maker", "maker is the doer; checker is the approver");
  assert.equal(engine.stepDoerRole(approve, RECON), "Ops Analyst");
});

// ---------- engine: a hand-off is where the doer changes ----------
test("a hand-off is detected exactly where the doer changes between consecutive steps", () => {
  const hos = engine.detectHandoffs(RECON);
  // teamLead (Allocate) -> maker (Investigate), and maker (Post) -> teamLead (Close)
  assert.ok(hos.some((h) => h.fromActorId === "teamLead" && h.toActorId === "maker"));
  assert.ok(hos.some((h) => h.fromActorId === "maker" && h.toActorId === "teamLead"));
  // no hand-off inside a same-doer run
  assert.ok(!hos.some((h) => h.fromStep === "Investigate root cause" && h.toStep === "Propose resolution"));
  // hand-off carries role labels (for the leader/org view downstream)
  const first = hos[0];
  assert.ok(first.fromRole && first.toRole && first.fromRole !== first.toRole);
});

test("a hand-off across a line-of-defence is flagged crossLine (where controls usually sit)", () => {
  const refer = { ...RECON, steps: [RECON.steps[1], { ...RECON.steps[1], step: "Refer to FinCrime", participants: [{ actorId: "finCrime", part: "doer" }] }] };
  const hos = engine.detectHandoffs(refer);
  assert.equal(hos.length, 1);
  assert.equal(hos[0].crossLine, true, "1LoD maker -> 2LoD finCrime crosses the line");
});

// ---------- engine: capacity scoped per doer; non-doer parts free 0 ----------
test("capacity rolls up by the doer's role; a non-doer part (approver-only) frees 0", () => {
  const rc = engine.roleCapacityByActor(RECON, "Conservative");
  const roles = rc.roles.map((r) => r.role);
  assert.ok(roles.includes("Ops Analyst"), "the maker (doer of investigate/propose/post) frees capacity");
  assert.ok(roles.includes("Team Lead"), "the team lead (doer of allocate/close) frees capacity");
  assert.ok(!roles.includes("Senior Analyst"), "the checker is only an approver — never a doer — so 0 freed (no group)");
  assert.ok(!roles.includes("Ops Manager"), "the manager is only accountable — never a doer — so 0 freed");
  assert.ok(rc.roles.find((r) => r.role === "Ops Analyst").freedHrs > 0);
});

test("the per-role freed capacity reconciles EXACTLY to the workflow roleCapacity (linear decomposition)", () => {
  const rc = engine.roleCapacityByActor(RECON, "Conservative");
  const whole = engine.roleCapacity(engine.normalizeIntake(RECON).steps, "Conservative");
  assert.ok(near(rc.totalFreedHrs, whole.freedHrs, 0.01), `${rc.totalFreedHrs} vs ${whole.freedHrs}`);
  // gross also reconciles (same linearity)
  const grossSum = rc.roles.reduce((n, r) => n + r.grossValue, 0);
  assert.ok(near(grossSum, whole.grossValue, 1), `${grossSum} vs ${whole.grossValue}`);
});

test("the assembly->judgment shift is reported per role", () => {
  const rc = engine.roleCapacityByActor(RECON, "Conservative");
  const analyst = rc.roles.find((r) => r.role === "Ops Analyst");
  // the analyst does both judgment (investigate/propose) and assembly (post)
  assert.ok(analyst.assemblyShareOfRole > 0 && analyst.humanHeldShareOfRole > 0);
  assert.ok(near(analyst.assemblyShareOfRole + analyst.humanHeldShareOfRole, 1, 1e-9));
});

// ---------- ADDITIVE: absent participants => byte-identical single-persona math ----------
test("ADDITIVE: a single-persona workflow (no participants) => one implicit doer = persona, math unchanged", () => {
  const solo = engine.roleCapacityByActor(FPA, "Conservative");
  assert.equal(solo.roles.length, 1);
  assert.equal(solo.roles[0].role, "FP&A analyst", "the implicit doer is the workflow persona");
  assert.equal(solo.handoffs.length, 0, "a single persona never hands off");
  const whole = engine.roleCapacity(engine.normalizeIntake(FPA).steps, "Conservative");
  assert.ok(near(solo.roles[0].freedHrs, whole.freedHrs, 1e-6), "freed is byte-identical to roleCapacity(allSteps)");
  assert.ok(near(solo.roles[0].grossValue, whole.grossValue, 1e-6));
});

// ---------- engine: enum integrity surfaced, never silently coerced ----------
test("an unknown participant part is surfaced by validateIntake (never silently dropped)", () => {
  const bad = { ...FPA, steps: [{ step: "x", cls: "assembly", data: "public", participants: [{ actorId: "a", part: "owner" }] }] };
  const v = engine.validateIntake(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /unknown part "owner"/.test(e)));
});

test("an unknown actor line is surfaced; the FP&A + RECON fixtures stay valid (coverage 100)", () => {
  assert.equal(engine.validateIntake(RECON).ok, true, JSON.stringify(engine.validateIntake(RECON).errors));
  assert.equal(engine.validateIntake(RECON).coverage.pct, 100);
  assert.equal(engine.validateIntake(FPA).coverage.pct, 100, "FP&A unchanged — additive");
  const bad = { ...RECON, actors: [{ id: "x", role: "X", line: "4LoD" }] };
  assert.ok(engine.validateIntake(bad).errors.some((e) => /unknown line "4LoD"/.test(e)));
});

// ---------- adapter: the app maps participants/actors through and DELEGATES (no fork) ----------
test("the adapter maps participants + the firm-level actors registry into the engine intake", () => {
  const sb = adapterSandbox();
  const intake = sb.appWorkflowToIntake({ steps: RECON.steps, meta: { header: RECON.header, actors: RECON.actors } });
  assert.equal(intake.actors.length, 6, "the firm-level registry is carried (referenced)");
  assert.deepEqual(intake.steps[3].participants.map((p) => p.part), ["doer", "approver"], "per-step parts carried");
});

test("engineWorkflowRoleCapacity delegates to the engine — equal to a direct roleCapacityByActor", () => {
  const sb = adapterSandbox();
  const viaApp = sb.engineWorkflowRoleCapacity({ record: RECON });
  const direct = engine.roleCapacityByActor(RECON, "Conservative");
  assert.equal(viaApp.roles.length, direct.roles.length);
  assert.ok(near(viaApp.totalFreedHrs, direct.totalFreedHrs, 1e-9), "no fork — the app reads the engine number");
  assert.deepEqual(viaApp.roles.map((r) => r.role).sort(), direct.roles.map((r) => r.role).sort());
});

test("engineWorkflowHandoffs delegates; a single-persona app workflow yields no hand-offs (additive)", () => {
  const sb = adapterSandbox();
  const reconHos = sb.engineWorkflowHandoffs({ record: RECON });
  assert.ok(reconHos.length >= 2, "the recon SOP crosses roles");
  const soloHos = sb.engineWorkflowHandoffs({ record: FPA });
  assert.equal(soloHos.length, 0, "no participants => no hand-offs");
});
