// Edition 3 — F3: routing. The recipe stops being a straight line. routes[] overlay it: onReject (the
// rework loop) and onSlaRisk (escalate per tier) are DERIVED from controls + escalation; onFlag (the AML
// halt) is AUTHORED, carrying a negativeConstraint. Each route carries routeOrigin: derived | authored.
// These are ANNOTATIONS, not new flow math — the happy-path cycleTime is unchanged. ADDITIVE: no controls
// + no authored routes => linear (no routes), as today.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
const FPA = engine.FPA_INTAKE;

function adapterSandbox() {
  return buildSandbox(source, {
    functions: [
      "studioEngine", "engineProvValue", "engineStepClass", "engineDataTier",
      "appStepToEngineStep", "appWorkflowToIntake", "engineWorkflowRoutes",
    ],
    globals: {
      window: { StudioEngine: engine },
      gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [],
      recipeConnectionSeams: () => [], analysisWorkflowName: () => "",
    },
  });
}

test("onReject is DERIVED from an approval gate: a four-eyes step loops back to the prior doer step", () => {
  const routes = engine.deriveRoutes(RECON);
  const reject = routes.find((r) => r.kind === "onReject");
  assert.ok(reject, "a reject route exists");
  assert.equal(reject.fromStep, "Approve adjustment");
  assert.equal(reject.toStep, "Propose resolution", "rework loops back to the prior step");
  assert.equal(reject.routeOrigin, "derived");
});

test("onFlag is AUTHORED and round-trips with its negativeConstraint", () => {
  const flag = engine.deriveRoutes(RECON).find((r) => r.kind === "onFlag" && r.routeOrigin === "authored");
  assert.ok(flag, "the authored AML route is present");
  assert.match(flag.negativeConstraint, /preserve evidence|tip-off/);
  assert.equal(flag.to, "finCrime");
});

test("onSlaRisk is DERIVED once from the escalation/authority structure", () => {
  const sla = engine.deriveRoutes(RECON).filter((r) => r.kind === "onSlaRisk");
  assert.equal(sla.length, 1);
  assert.equal(sla[0].routeOrigin, "derived");
  assert.match(sla[0].reason, /escalate per tier/i);
});

test("every route carries a routeOrigin in {derived, authored}", () => {
  const routes = engine.deriveRoutes(RECON);
  assert.ok(routes.length >= 3);
  assert.ok(routes.every((r) => r.routeOrigin === "derived" || r.routeOrigin === "authored"));
});

test("a halt-on-flag with NO authored route still gets a DERIVED halt edge (never-a-dead-end)", () => {
  const haltOnly = { ...RECON, routes: [] };
  const derivedFlag = engine.deriveRoutes(haltOnly).find((r) => r.kind === "onFlag" && r.fromStep === "Investigate root cause");
  assert.ok(derivedFlag, "the halt control still produces its edge");
  assert.equal(derivedFlag.routeOrigin, "derived");
  assert.equal(derivedFlag.to, "finCrime");
});

test("ADDITIVE: a single-persona, control-free workflow derives NO routes (stays linear)", () => {
  assert.deepEqual(engine.deriveRoutes(FPA), [], "FP&A has no controls + no authored routes => linear");
  assert.equal(engine.buildRecipe(FPA).routes.length, 0, "the recipe stays linear");
});

test("routes add NO new flow math — cycleTime is byte-identical with and without the routes overlay", () => {
  const withRoutes = engine.cycleTime(engine.normalizeIntake(RECON).steps);
  const stripped = { ...RECON }; delete stripped.routes;
  const withoutRoutes = engine.cycleTime(engine.normalizeIntake(stripped).steps);
  assert.deepEqual(withRoutes, withoutRoutes, "the happy-path flow math is unchanged by routes");
});

test("the rail blocks an auto-resolve past a halt route", () => {
  const autoHalt = { ...RECON, steps: [{ ...RECON.steps[1], autoResolve: true }] };
  const r = engine.controlRail(autoHalt);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.rule === "halt-no-auto-resolve"));
});

test("an unknown route kind is surfaced by validateIntake", () => {
  assert.ok(engine.validateIntake({ ...RECON, routes: [{ kind: "onWhatever" }] }).errors.some((e) => /unknown kind "onWhatever"/.test(e)));
});

// ---------- adapter: carries routes through + delegates ----------
test("the adapter carries authored routes into the intake and engineWorkflowRoutes delegates (no fork)", () => {
  const sb = adapterSandbox();
  const intake = sb.appWorkflowToIntake({ steps: RECON.steps, meta: { header: RECON.header, actors: RECON.actors, routes: RECON.routes } });
  assert.equal(intake.routes.length, 1, "the authored route is carried");
  const viaApp = sb.engineWorkflowRoutes({ record: RECON });
  assert.deepEqual(viaApp, engine.deriveRoutes(RECON), "the app reads the engine's routes — no fork");
});
