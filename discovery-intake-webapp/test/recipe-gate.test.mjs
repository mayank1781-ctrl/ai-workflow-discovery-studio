// Executed tests for PR 30b — confidence-gated recipe generation. The gate's
// "confirmed enough" rule is provenance-first (user sources always count,
// doc-extracted by confidence, ai-inferred never), gap questions respect
// questionHistory retirement, and "Generate anyway" is always available by
// construction. Real shipped source extracted and evaluated (see
// test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function gateSandbox() {
  const state = { questionHistory: [], workflowGrid: { steps: [] } };
  const fns = buildSandbox(source, {
    consts: ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER", "RECIPE_CONFIDENCE_THRESHOLD", "RECIPE_CRITICAL_FIELDS"],
    functions: [
      "cellConfirmedEnough",
      "recipeGateCheck",
      "getField",
      "patchField",
      "ensureCellLog",
      "newLedgerEntry",
      "projectCellLedgerDetailed",
      "projectCellLedger",
      "deriveLegacyCellSource",
      "questionIntentId",
      "questionStatusForIntent",
      "recordAskedQuestion",
      "retireQuestionsForCell",
      "newGridStep",
      "newGridCell",
      "makeId"
    ],
    globals: { state, console: { info: () => {}, warn: () => {}, error: () => {} }, currentGridStep: () => null }
  });
  return { ...fns, state };
}

function cell(value, source, confidence) {
  return { value, state: source === "user-stated" || source === "user-edited" ? "confirmed" : "inferred", confidence, source };
}

test("confirmed-enough thresholds: user sources always, doc-extracted by confidence, ai-inferred never", () => {
  const { cellConfirmedEnough } = gateSandbox();
  assert.equal(cellConfirmedEnough(cell("Excel", "user-stated", 0.1)), true, "user-stated counts at any confidence");
  assert.equal(cellConfirmedEnough(cell("Excel", "user-edited", 0)), true, "user-edited counts at any confidence");
  assert.equal(cellConfirmedEnough(cell("Excel", "doc-extracted", 0.69)), false, "doc-extracted below 0.70 fails");
  assert.equal(cellConfirmedEnough(cell("Excel", "doc-extracted", 0.7)), true, "doc-extracted at the threshold passes");
  assert.equal(cellConfirmedEnough(cell("Excel", "ai-inferred", 0.95)), false, "ai-inferred never auto-counts");
  assert.equal(cellConfirmedEnough({ value: "", state: "empty", confidence: "", source: "" }), false, "empty never counts");
  assert.equal(cellConfirmedEnough({ value: "", state: "unknown", confidence: 0, source: "user-stated" }), false, "unknown never counts");
});

test("field-level OR: volume passes when only timeTaken is confirmed", () => {
  const { recipeGateCheck, patchField, newGridStep } = gateSandbox();
  const step = newGridStep();
  patchField(step, null, "timeTaken", "30 minutes", "user-stated", 0.9);
  const gate = recipeGateCheck(step);
  assert.ok(!gate.gaps.some((gap) => gap.field === "volume"), "volume passes via timeTaken alone");
  assert.ok(gate.gaps.some((gap) => gap.field === "systemsTools"), "other fields still gap");
});

test("gap questions respect retirement and cap at 3", () => {
  const { recipeGateCheck, recordAskedQuestion, patchField, newGridStep, state } = gateSandbox();
  const step = newGridStep(); // everything empty → all 5 fields gap
  let gate = recipeGateCheck(step);
  assert.equal(gate.gaps.length, 5, "all five critical fields gap on an empty step");
  assert.equal(gate.askable.length, 3, "askable capped at 3");

  // Retire the systemsTools intent the way real flow does: ask, then capture
  // user-stated on ANOTHER step (the question intent is retired session-wide,
  // while THIS step's field stays unconfirmed).
  recordAskedQuestion(["systemsTools"], "What systems or tools are used across these steps?");
  const otherStep = newGridStep();
  patchField(otherStep, null, "systemsTools", "Outlook", "user-stated", 0.9);
  assert.equal(state.questionHistory[0].status, "retired");
  gate = recipeGateCheck(step);
  const sysGap = gate.gaps.find((gap) => gap.field === "systemsTools");
  assert.ok(sysGap, "field still reported as a gap (it IS unconfirmed on this step)");
  assert.equal(sysGap.retired, true, "but flagged retired");
  assert.ok(!gate.askable.some((gap) => gap.field === "systemsTools"), "retired intent never resurfaces as a question");
});

test("p9Unconfirmed flips with the sensitivity field", () => {
  const { recipeGateCheck, patchField, newGridStep } = gateSandbox();
  const step = newGridStep();
  assert.equal(recipeGateCheck(step).p9Unconfirmed, true, "empty sensitivity → unconfirmed");
  patchField(step, null, "dataSensitivity", "Client confidential", "ai-inferred", 0.9);
  assert.equal(recipeGateCheck(step).p9Unconfirmed, true, "ai-inferred sensitivity stays unconfirmed");
  patchField(step, null, "dataSensitivity", "Client confidential", "user-stated", 0.9);
  assert.equal(recipeGateCheck(step).p9Unconfirmed, false, "user-stated sensitivity confirms P9");
});

test("generate-anyway is always available: no block state, button never disabled", () => {
  const { recipeGateCheck, newGridStep } = gateSandbox();
  // (a) By construction: the gate result has no blocking field at all.
  const gate = recipeGateCheck(newGridStep());
  assert.deepEqual(Object.keys(gate).sort(), ["askable", "gaps", "p9Unconfirmed"], "no block/blocked/disabled key exists");
  // (b) Source-level: the gate panel's generate-anyway button carries no
  // disabled attribute, and the force path bypasses the gate.
  const panelSource = extractFunction(source, "renderRecipeGatePanel");
  assert.ok(panelSource.includes("data-gate-generate-anyway"), "panel renders the generate-anyway button");
  assert.ok(!/data-gate-generate-anyway[^>]*disabled/.test(panelSource), "generate-anyway is never disabled");
  const generateSource = extractFunction(source, "generateRecipePrompt");
  assert.ok(generateSource.includes("options.force"), "explicit force bypasses the gate");
});
