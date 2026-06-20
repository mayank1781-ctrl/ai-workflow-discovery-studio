// Edition 2 — Engine integration. Proves the app CALLS studio_engine.mjs (the single source
// of truth) through a thin adapter, rather than forking the math: the app's capacity / cost /
// net / flow / spec equal the engine for the FP&A fixture, the adapter round-trips provenance,
// and railCheck is the one surface-aware authority (delegated to the engine).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// FP&A app workflow — a fully-specified unit carrying the engine-relevant fields, mirroring
// engine.FPA_INTAKE.steps. The adapter maps these straight through; engine does the math.
const FPA_STEPS = [
  { step: "Collect & consolidate", cls: "assembly", data: "confidential", time: 18, theo: 85, touch: 90, wait: 0, waitKind: "reducible", tool: "ERP, Excel", inputs: "GL extract", output: "consolidated actuals" },
  { step: "Reconcile & validate", cls: "assembly", data: "confidential", time: 16, theo: 70, touch: 120, wait: 240, waitKind: "reducible", tool: "ERP, Excel" },
  { step: "Build & refresh models", cls: "assembly", data: "confidential", time: 14, theo: 55, touch: 90, wait: 0, waitKind: "reducible", tool: "Excel" },
  { step: "Variance analysis", cls: "judgment", data: "confidential", time: 14, theo: 30, touch: 60, wait: 0, waitKind: "reducible" },
  { step: "Draft commentary", cls: "assembly", data: "confidential", time: 16, theo: 60, touch: 60, wait: 480, waitKind: "reducible" },
  { step: "Forecast updates", cls: "assembly", data: "confidential", time: 12, theo: 50, touch: 45, wait: 2880, waitKind: "protected" },
  { step: "Stakeholder advisory", cls: "decision", data: "MNPI", time: 10, theo: 10, touch: 30, wait: 0, waitKind: "reducible" },
];
const FPA_SEAMS = [
  { fromName: "ERP", toName: "Excel", type: "re-key", friction: "high", latency: "low", criticality: "medium", note: "Export then manual reformat" },
  { fromName: "Pack", toName: "leadership", type: "handoff", friction: "low", latency: "high", criticality: "high", note: "Human decision" },
];
const FPA_META = {
  header: { persona: "FP&A analyst", dept: "Finance", anchor: "Forecast & variance pack", lifecycle: "confirmed" },
  trigger: { trigger: "month-end close completes", cadence: "monthly", volume: "~12/yr" },
  judgment: { needs: "variance and advisory", human: "the advisory call (MNPI)", hard: "real variance vs noise", cues: "size vs threshold" },
  confirm: { acceptance: "ties to source, reconciles to zero, reviewer sign-off", escalation: "unexplained variance above threshold", dataTier: "MNPI", evals: "clean month -> reconciles\nFX reval -> escalated" },
  recap: { confirmed: true },
};

function adapterSandbox() {
  return buildSandbox(source, {
    functions: [
      "studioEngine", "railCheck", "engineProvValue", "engineStepClass", "engineDataTier",
      "appStepToEngineStep", "appWorkflowToIntake", "engineWorkflowSpec", "engineWorkflowCapacity",
      "engineWorkflowCost", "engineWorkflowFlow", "engineLeaderView",
    ],
    globals: {
      window: { StudioEngine: engine },
      gridCellValue: () => "",
      stepTypeOf: () => null,
      inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step",
      analysisGridSteps: () => [],
      recipeConnectionSeams: () => [],
      analysisWorkflowName: () => "",
    },
  });
}

test("the adapter maps an app workflow to the engine intake (steps + 3-dim seams)", () => {
  const sb = adapterSandbox();
  const intake = sb.appWorkflowToIntake({ steps: FPA_STEPS, seams: FPA_SEAMS, meta: FPA_META });
  assert.equal(intake.steps.length, 7);
  assert.equal(intake.steps[0].cls, "assembly");
  assert.equal(intake.steps[6].cls, "decision");
  assert.equal(intake.steps[6].data, "MNPI");
  assert.equal(intake.seams[0].friction, "high");
  assert.equal(intake.seams[0].latency, "low");
  assert.equal(intake.seams[1].crit, "high");
  // the mapped intake is a VALID engine intake (the engine accepts it)
  assert.equal(engine.validateIntake(intake).ok, true, JSON.stringify(engine.validateIntake(intake).errors));
});

test("app capacity / cost / net == engine for the FP&A fixture (gross ~$20,849; cost ~$161; net ~$20,688)", () => {
  const sb = adapterSandbox();
  const cap = sb.engineWorkflowCapacity({ steps: FPA_STEPS });
  const cost = sb.engineWorkflowCost({ steps: FPA_STEPS });
  assert.ok(near(cap.grossValue, 20849, 30), `gross ${cap.grossValue}`);
  assert.ok(near(cost.annual, 161, 8), `cost ${cost.annual}`);
  assert.ok(near(cap.grossValue - cost.annual, 20688, 35), `net ${cap.grossValue - cost.annual}`);
  // the wrapper truly delegates: it equals a direct engine call on the same intake
  const direct = engine.roleCapacity(engine.normalizeIntake(sb.appWorkflowToIntake({ steps: FPA_STEPS })).steps, "Conservative");
  assert.equal(cap.grossValue, direct.grossValue);
});

test("app flow == engine for the fixture (cycle 8d 4h -> 7d 2h; ~89% of the saving is wait)", () => {
  const sb = adapterSandbox();
  const flow = sb.engineWorkflowFlow({ steps: FPA_STEPS });
  assert.equal(flow.cycleBefore, 4095);
  assert.ok(near(flow.cycleAfter, 3460.5, 1.5), `after ${flow.cycleAfter}`);
  assert.equal(engine.fmtDur(flow.cycleBefore), "8d 4h");
  assert.equal(engine.fmtDur(flow.cycleAfter), "7d 2h");
  assert.ok(near(flow.pctSavingFromWait, 88.5, 1.5), `wait% ${flow.pctSavingFromWait}`);
});

test("app spec == engine.buildSpec for the fixture (field 7 modelFit + readiness, residency note)", () => {
  const sb = adapterSandbox();
  const spec = sb.engineWorkflowSpec({ steps: FPA_STEPS, seams: FPA_SEAMS, meta: FPA_META });
  assert.ok(spec.modelFit && spec.modelFit.value, "field 7 present");
  assert.match(spec.modelFit.value, /in-VPC|restricted|approved/, "residency note present (MNPI/confidential)");
  assert.ok(spec.readiness && /now|gated|future/.test(spec.readiness.value), "readiness present");
  // identical to a direct engine.buildSpec on the same intake (no fork)
  const intake = sb.appWorkflowToIntake({ steps: FPA_STEPS, seams: FPA_SEAMS, meta: FPA_META });
  assert.equal(spec.modelFit.value, engine.buildSpec(intake).modelFit.value);
});

test("the adapter preserves provenance through presence: stated capture -> engine stated; absent -> inferred", () => {
  const sb = adapterSandbox();
  const withTime = engine.normalizeIntake(sb.appWorkflowToIntake({ steps: FPA_STEPS }));
  assert.equal(withTime.steps[0]._timeProv, "stated", "a captured time is stated");
  assert.equal(withTime.steps[0]._theoProv, "stated", "a captured theo is stated");
  const noQuant = engine.normalizeIntake(sb.appWorkflowToIntake({ steps: [{ step: "x", cls: "assembly", data: "public" }] }));
  assert.equal(noQuant.steps[0]._timeProv, "inferred", "an absent time is inferred (engine class default)");
  assert.equal(noQuant.steps[0]._theoProv, "inferred");
});

test("railCheck is the one surface-aware authority (delegated to the engine), gating per surface", () => {
  const sb = adapterSandbox();
  assert.equal(sb.railCheck("capacity freed this quarter", "dashboard").ok, true, "capacity ok on dashboard");
  assert.equal(sb.railCheck("capacity freed this quarter", "workbench").ok, false, "capacity blocked on a worker surface");
  assert.equal(sb.railCheck("cost-to-serve is a band", "recipe").ok, true, "cost-to-serve ok on recipe");
  assert.equal(sb.railCheck("cost-to-serve is a band", "capture").ok, false, "cost-to-serve blocked on capture");
  assert.equal(sb.railCheck("reduce headcount", "dashboard").ok, false, "reduction blocked everywhere");
  assert.equal(sb.railCheck("reduce headcount", "recipe").ok, false);
});

test("engineLeaderView delegates and renders confirmed-only (drops the unconfirmed unit)", () => {
  const sb = adapterSandbox();
  const confirmed = { ...engine.FPA_INTAKE };
  const unconfirmed = { ...engine.FPA_INTAKE, recap: { confirmed: false } };
  const lv = sb.engineLeaderView([confirmed, confirmed, unconfirmed]);
  assert.equal(lv.confirmedCount, 2);
  assert.equal(lv.skippedUnconfirmed, 1);
  assert.equal(lv.surface, "dashboard");
});
