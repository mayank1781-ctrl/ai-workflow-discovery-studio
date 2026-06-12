// Executed tests for PR 36 Slice B2 — the accessor rewire. patchField now
// appends to step.cellLog[cellKey] and materializes the projection into
// step.cells[cellKey]; the API contract is unchanged (the rest of the suite
// is the spec — it ran against the rewire unmodified). These pins cover what
// is NEW: shadowed history, the lazy pre-migration baseline, hook gating, and
// persist-time compaction wiring.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function rewireSandbox() {
  const state = { questionHistory: [], workflowGrid: { steps: [] } };
  const fns = buildSandbox(source, {
    consts: ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"],
    functions: [
      "patchField", "ensureCellLog", "newLedgerEntry",
      "projectCellLedgerDetailed", "projectCellLedger",
      "getField", "deriveLegacyCellSource", "newGridStep", "newGridCell", "makeId",
      "questionIntentId", "recordAskedQuestion", "questionStatusForIntent",
      "retireQuestionsForCell", "reopenQuestionsForCell"
    ],
    globals: { state, console: { info: () => {}, warn: () => {}, error: () => {} }, currentGridStep: () => null }
  });
  return { ...fns, state };
}

test("a shadowed append never projects and never retires — but it IS history now", () => {
  const { patchField, getField, newGridStep, recordAskedQuestion, questionStatusForIntent, state } = rewireSandbox();
  const step = newGridStep();
  recordAskedQuestion(["systemsTools"], "Any particular tools you use for this?");
  patchField(step, null, "systemsTools", "Murex + Excel", "user-stated", 0.95);
  assert.equal(questionStatusForIntent(["systemsTools"]), "retired", "user capture retires (existing contract)");

  // Re-open bookkeeping for the assertion: a SHADOWED doc write must not
  // touch question status, the cell, or the projection.
  state.questionHistory[0].status = "open";
  const refused = patchField(step, null, "systemsTools", "Aladdin", "doc-extracted", 0.99);
  assert.equal(refused, false, "refused, as before the ledger");
  assert.equal(getField(step, null, "systemsTools").value, "Murex + Excel", "projection unchanged");
  assert.equal(questionStatusForIntent(["systemsTools"]), "open", "shadowed append fires no retirement");
  // The refusal is no longer just a console line — it is visible history.
  const log = step.cellLog.systemsTools;
  assert.equal(log.length, 2, "accepted capture + shadowed capture both recorded");
  assert.equal(log[1].value, "Aladdin");
  assert.equal(log[1].source, "doc-extracted");
});

test("lazy baseline: a pre-migration cell (no ledger) seeds itself before the first append", () => {
  const { patchField, getField, newGridStep } = rewireSandbox();
  const step = newGridStep();
  // Simulate a loaded pre-ledger session: materialized cell, NO cellLog.
  step.cells.painFriction = { value: "manual rekeying", state: "confirmed", confidence: 0.9, source: "user-stated" };
  assert.equal(step.cellLog, undefined, "no ledger yet");
  // A doc write must lose to the seeded baseline, not win against an empty log.
  assert.equal(patchField(step, null, "painFriction", "no pain noted", "doc-extracted", 0.99), false);
  assert.equal(getField(step, null, "painFriction").value, "manual rekeying", "user value survives the first post-upgrade write");
  const log = step.cellLog.painFriction;
  assert.equal(log.length, 2, "baseline + shadowed doc entry");
  assert.equal(log[0].value, "manual rekeying");
  assert.equal(log[0].source, "user-stated");
  // Legacy cells without an explicit source derive it for the baseline.
  step.cells.output = { value: "breaks report", state: "confirmed", confidence: 0.8 };
  patchField(step, null, "output", "ignored", "ai-inferred", 0.9);
  assert.equal(step.cellLog.output[0].source, "user-stated", "baseline derives legacy provenance from state");
});

test("clears and unknowns are ledger entries; invalid attempts stay API no-ops, not history", () => {
  const { patchField, getField, newGridStep } = rewireSandbox();
  const step = newGridStep();
  patchField(step, null, "trigger", "month-end close", "user-edited", 1, { refresh: true });
  // Extraction clear: refused AND not recorded (API misuse, not history).
  assert.equal(patchField(step, null, "trigger", "", "doc-extracted", 0.9, { clear: true }), false);
  assert.equal(step.cellLog.trigger.length, 1, "refused clear appended nothing");
  // User clear: recorded, projects empty, and the ledger keeps the lineage.
  assert.equal(patchField(step, null, "trigger", "", "user-edited", 1, { clear: true }), true);
  assert.equal(getField(step, null, "trigger").state, "empty");
  assert.equal(step.cellLog.trigger[1].kind, "clear");
  // Unknown after the clear records; a second unknown is refused un-recorded.
  assert.equal(patchField(step, null, "trigger", "", "ai-inferred", 0, { state: "unknown" }), true);
  assert.equal(patchField(step, null, "trigger", "", "ai-inferred", 0, { state: "unknown" }), false);
  assert.equal(step.cellLog.trigger.length, 3, "exactly one unknown entry recorded");
  assert.equal(getField(step, null, "trigger").state, "unknown");
});

test("replay is hook-free: question hooks are called from patchField alone; projection/normalize never touch them", () => {
  // The only invocations of the two hooks in the whole shipped source must sit
  // inside patchField (live accepted appends). Projection, compaction, and the
  // load-path normalizers must not reference them — loading or re-projecting a
  // session can never retire or reopen a question.
  const patchFieldSrc = extractFunction(source, "patchField");
  const outside = source.replace(patchFieldSrc, "");
  for (const hook of ["retireQuestionsForCell", "reopenQuestionsForCell"]) {
    // Outside patchField, the only legitimate occurrence of `<hook>(` is the
    // function's own definition — strip it, then assert zero calls remain.
    const defStripped = outside.replace(new RegExp(`function ${hook}\\(`), "");
    const calls = (defStripped.match(new RegExp(`\\b${hook}\\(`, "g")) || []).length;
    assert.equal(calls, 0, `${hook} is only ever called inside patchField`);
  }
  for (const fn of ["projectCellLedgerDetailed", "projectCellLedger", "compactCellLedger", "normalizeGridStep", "normalizeWorkflowGrid", "compactStateCellLogs"]) {
    const body = extractFunction(source, fn);
    assert.ok(!body.includes("QuestionsForCell"), `${fn} is hook-free`);
  }
});

test("cellLog survives the load path and is compacted at persist time", () => {
  // normalizeGridStep spreads the saved step, so the ledger rides along.
  const { normalizeGridStep } = buildSandbox(source, {
    consts: ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"],
    functions: ["normalizeGridStep", "normalizeGridCell", "newGridStep", "newGridCell", "deriveLegacyCellSource", "makeId"]
  });
  const saved = {
    id: "s1",
    cells: { trigger: { value: "x", state: "confirmed", confidence: 1, source: "user-stated" } },
    cellLog: { trigger: [{ at: "t", kind: "capture", value: "x", source: "user-stated", confidence: 1, refresh: false }] }
  };
  const normalized = normalizeGridStep(saved);
  assert.deepEqual(normalized.cellLog, saved.cellLog, "history survives session load");
  // And persistState bounds it: the compaction call sits before the save.
  const persist = extractFunction(source, "persistState");
  assert.ok(persist.includes("compactStateCellLogs()"), "persist compacts the ledgers");
  const compactor = extractFunction(source, "compactStateCellLogs");
  assert.ok(compactor.includes("compactCellLedger("), "compaction routes through the pinned pure function");
});
