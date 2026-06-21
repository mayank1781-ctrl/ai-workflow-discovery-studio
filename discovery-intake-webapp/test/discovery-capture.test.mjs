// B1 (Phase 2) — Discovery clean capture: policy-first frame, combined-step split flag, contradiction
// queue, and solution-shape capture per step (the A1 axis). The split + contradiction logic lives in the
// engine (deterministic); the app surfaces it (sidecar + adapter + render). Real shipped source extracted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const SHAPES = ["prompt", "rag", "deterministic-tool", "agentic", "human-in-loop"];

// ---- engine detectors (the deterministic core) ----
test("B1 — 'draft and approve' is flagged for split at capture (engine)", () => {
  const f = engine.flagCombinedStep("draft and approve the memo");
  assert.equal(f.combined, true);
  assert.ok(f.acts.some((a) => a.cls === "assembly") && f.acts.some((a) => a.cls === "decision"));
  assert.match(f.suggestion, /Split into/);
  assert.equal(engine.flagCombinedStep("reconcile the ledgers").combined, false); // no false split
});

test("B1 — a contradiction lands in the queue (engine)", () => {
  const misTag = engine.detectContradictions({ steps: [{ step: "Approve the waiver and send it", cls: "assembly", data: "internal", time: 10, theo: 80 }] });
  assert.ok(misTag.some((c) => c.kind === "class-vs-language"));
  const sens = engine.detectContradictions({ steps: [{ step: "Pull client financials", cls: "assembly", data: "MNPI", time: 10, theo: 80 }], confirm: { dataTier: "internal" } });
  assert.ok(sens.some((c) => c.kind === "sensitivity"));
  assert.equal(engine.detectContradictions(engine.FPA_INTAKE).length, 0); // clean capture → empty queue
});

// ---- app: solution-shape sidecar (reuses the generic structural-tag core) ----
function shapeSandbox(state) {
  return buildSandbox(source, {
    consts: ["SOLUTION_SHAPE_VALUES", "CAPTURE_POLICY_PROFILES"],
    functions: [
      "isInAllowedSet", "structuralTagOf", "setStructuralTag", "applyStructuralSuggestion",
      "confirmStructuralTag", "rejectStructuralTag",
      "ensureSolutionShapes", "solutionShapeOf", "setSolutionShape", "applySolutionShapeSuggestion",
      "confirmSolutionShape", "rejectSolutionShape",
      "ensureCapturePolicy", "capturePolicyProfile", "setCapturePolicyProfile",
    ],
    globals: { state: state || { solutionShapes: {} } },
  });
}

test("B1 — solution-shape captures per step (manual → user-stated, round-trips, off-set rejected)", () => {
  const state = { solutionShapes: {} };
  const sb = shapeSandbox(state);
  assert.equal(sb.setSolutionShape("s1", "agentic"), true);
  assert.equal(sb.solutionShapeOf("s1").value, "agentic");
  assert.equal(sb.solutionShapeOf("s1").source, "user-stated");
  assert.equal(sb.setSolutionShape("s1", "not-a-shape"), false, "off-set value rejected");
  assert.equal(sb.solutionShapeOf("s2"), null, "unset → null, never fabricated");
});

test("B1 — the app's shape allowed-set behaviourally equals the engine vocabulary (no drift)", () => {
  // accepts exactly the engine's five shapes, rejects anything else
  for (const v of engine.SOLUTION_SHAPES) {
    const sb = shapeSandbox({ solutionShapes: {} });
    assert.equal(sb.setSolutionShape("s", v), true, `app must accept engine shape "${v}"`);
  }
  const sb = shapeSandbox({ solutionShapes: {} });
  assert.equal(sb.setSolutionShape("s", "workflow"), false, "a non-engine value is rejected");
  assert.deepEqual(engine.SOLUTION_SHAPES, SHAPES); // the engine itself is the five
});

test("B1 — Discovery opens POLICY-FIRST (profile defaults Conservative; settable to the three)", () => {
  const state = {};
  const sb = shapeSandbox(state);
  assert.equal(sb.capturePolicyProfile(), "Conservative");
  for (const p of ["Conservative", "Moderate", "Progressive"]) assert.equal(sb.setCapturePolicyProfile(p), true);
  assert.equal(sb.capturePolicyProfile(), "Progressive");
  assert.equal(sb.setCapturePolicyProfile("nope"), false);
  assert.equal(sb.capturePolicyProfile(), "Progressive", "an invalid profile leaves the frame unchanged");
});

// ---- app: the engine adapters + the capture-surface helpers ----
function adapterSandbox(state, steps) {
  return buildSandbox(source, {
    functions: ["studioEngine", "engineFlagCombinedStep", "engineDetectContradictions", "refreshContradictionQueue", "captureSplitFlags"],
    globals: {
      state: state || {},
      window: { StudioEngine: engine },
      analysisGridSteps: () => steps || [],
      stepDisplayName: (s) => (s && s.step) || "Step",
      appWorkflowToIntake: (opts) => (opts && opts.record) || { steps: [{ step: "Approve and send the waiver", cls: "assembly", data: "internal", time: 10, theo: 80 }] },
    },
  });
}

test("B1 — the app adapters delegate split + contradiction detection to the engine", () => {
  const sb = adapterSandbox({}, []);
  assert.equal(sb.engineFlagCombinedStep("draft and approve").combined, true);
  assert.ok(sb.engineDetectContradictions({ record: { steps: [{ step: "Approve and send", cls: "assembly", data: "internal", time: 5, theo: 80 }] } }).some((c) => c.kind === "class-vs-language"));
});

test("B1 — captureSplitFlags flags combined grid steps; refreshContradictionQueue stores the queue", () => {
  const state = {};
  const steps = [{ id: "a", step: "draft and approve the memo" }, { id: "b", step: "reconcile two ledgers" }];
  const sb = adapterSandbox(state, steps);
  const flags = sb.captureSplitFlags();
  assert.equal(flags.length, 1, "only the combined step is flagged");
  assert.equal(flags[0].stepId, "a");
  const queue = sb.refreshContradictionQueue();
  assert.ok(Array.isArray(queue) && queue.length >= 1, "the contradiction queue is populated from the engine");
  assert.equal(state.contradictionQueue, queue, "the queue is stored on state for the capture surface");
});
