// Executed tests for PR 30 Slice 2 — question memory. Dedupe is on intent
// (target cell keys), never exact text; retirement is driven from patchField,
// the single capture point: user-stated/user-edited retire immediately,
// doc-extracted retires above confidence 0.70, ai-inferred only deprioritizes.
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();

function memorySandbox() {
  const state = { questionHistory: [], workflowGrid: { steps: [] } };
  const logs = [];
  const recordingConsole = {
    info: (...args) => logs.push(args.map(String).join(" ")),
    warn: (...args) => logs.push(args.map(String).join(" ")),
    error: (...args) => logs.push(args.map(String).join(" "))
  };
  const fns = buildSandbox(source, {
    consts: ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER", "KEY_QUESTION_FIELDS"],
    functions: [
      "questionIntentId",
      "recordAskedQuestion",
      "questionStatusForIntent",
      "retireQuestionsForCell",
      "aiInferredConfirmFields",
      "patchField",
      "ensureCellLog",
      "newLedgerEntry",
      "projectCellLedgerDetailed",
      "projectCellLedger",
      "getField",
      "gridCellValue",
      "stepPatternList",
      "isCapturedValue",
      "deriveLegacyCellSource",
      "newGridStep",
      "newGridCell",
      "makeId"
    ],
    globals: { state, console: recordingConsole, currentGridStep: () => null }
  });
  return { ...fns, state, logs };
}

test("question dedupe is on intent, not exact text", () => {
  const { recordAskedQuestion, state } = memorySandbox();
  recordAskedQuestion(["personaActors"], "Who performs these steps?");
  recordAskedQuestion(["personaActors"], "Which roles or people run this?"); // reworded, same intent
  assert.equal(state.questionHistory.length, 1, "same intent must not create a second entry");
  assert.equal(state.questionHistory[0].askCount, 2);
  assert.equal(state.questionHistory[0].text, "Which roles or people run this?", "latest wording kept");
  // Intent id is order-insensitive for multi-key intents.
  recordAskedQuestion(["painFriction", "rulesDecisionLogic"], "Pain and rules?");
  recordAskedQuestion(["rulesDecisionLogic", "painFriction"], "Rules and pain?");
  assert.equal(state.questionHistory.length, 2, "key order must not change the intent id");
});

test("user-stated capture retires its question immediately (via patchField)", () => {
  const { recordAskedQuestion, patchField, newGridStep, state } = memorySandbox();
  recordAskedQuestion(["systemsTools"], "What systems are used?");
  const step = newGridStep();
  patchField(step, null, "systemsTools", "Outlook, Excel", "user-stated", 0.9);
  const entry = state.questionHistory[0];
  assert.equal(entry.status, "retired");
  assert.equal(entry.retiredBy, "user-stated");
  // user-edited retires identically.
  const sandbox2 = memorySandbox();
  sandbox2.recordAskedQuestion(["output"], "What output is produced?");
  sandbox2.patchField(sandbox2.newGridStep(), null, "output", "Weekly report", "user-edited", 0.9);
  assert.equal(sandbox2.state.questionHistory[0].status, "retired");
  assert.equal(sandbox2.state.questionHistory[0].retiredBy, "user-edited");
});

test("doc-extracted retires only above confidence 0.70", () => {
  const { recordAskedQuestion, patchField, newGridStep, state } = memorySandbox();
  recordAskedQuestion(["dataSensitivity"], "What sensitivity applies?");
  const step = newGridStep();
  patchField(step, null, "dataSensitivity", "Internal", "doc-extracted", 0.69);
  assert.equal(state.questionHistory[0].status, "open", "0.69 must NOT retire");
  patchField(step, null, "dataSensitivity", "Client confidential", "doc-extracted", 0.85);
  assert.equal(state.questionHistory[0].status, "retired", "0.85 must retire");
  assert.equal(state.questionHistory[0].retiredBy, "doc-extracted");
});

test("ai-inferred deprioritizes but never retires; a later user answer retires", () => {
  const { recordAskedQuestion, patchField, newGridStep, state } = memorySandbox();
  recordAskedQuestion(["painFriction"], "What's the biggest pain?");
  const step = newGridStep();
  patchField(step, null, "painFriction", "Probably rework", "ai-inferred", 0.6);
  assert.equal(state.questionHistory[0].status, "deprioritized", "ai-inferred deprioritizes");
  patchField(step, null, "painFriction", "Even stronger guess", "ai-inferred", 0.9);
  assert.equal(state.questionHistory[0].status, "deprioritized", "still never retired by inference");
  patchField(step, null, "painFriction", "Manual rework, weekly", "user-stated", 0.9);
  assert.equal(state.questionHistory[0].status, "retired", "the user's own answer retires it");
});

test("a retired intent is never reopened by re-asking", () => {
  const { recordAskedQuestion, questionStatusForIntent, patchField, newGridStep, state } = memorySandbox();
  recordAskedQuestion(["timeTaken"], "How long does it take?");
  patchField(newGridStep(), null, "timeTaken", "30 minutes", "user-stated", 0.9);
  assert.equal(questionStatusForIntent(["timeTaken"]), "retired");
  const entry = recordAskedQuestion(["timeTaken"], "Roughly how long, end to end?");
  assert.equal(entry.status, "retired", "re-asking returns the retired entry");
  assert.equal(entry.askCount, 1, "askCount untouched on a retired intent");
  assert.equal(state.questionHistory.length, 1, "no duplicate entry created");
});

test("confirm lane: ai-inferred-only fields surface, retired ones don't", () => {
  const { aiInferredConfirmFields, patchField, newGridStep, state } = memorySandbox();
  const step = newGridStep();
  state.workflowGrid.steps.push(step);
  patchField(step, null, "personaActors", "Probably the ops team", "ai-inferred", 0.6);
  let lane = aiInferredConfirmFields(state.workflowGrid.steps);
  assert.ok(lane.some((field) => field.key === "personaActors"), "ai-inferred field joins the confirm lane");
  // Once the user states it, the field leaves the lane (provenance upgraded).
  patchField(step, null, "personaActors", "Ops team", "user-stated", 0.9);
  lane = aiInferredConfirmFields(state.workflowGrid.steps);
  assert.ok(!lane.some((field) => field.key === "personaActors"), "user-stated field leaves the confirm lane");
});
