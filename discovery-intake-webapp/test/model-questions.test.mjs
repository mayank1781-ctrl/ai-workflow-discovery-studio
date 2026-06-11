// Executed tests for PR 31 Slice 4 — carry-items 3 + 4. Model-generated
// questions (doc-extraction followUpQuestions) join the intent machinery via a
// deterministic text→cells mapper: mapped intents dedupe AND retire through
// the existing patchField hook; unmapped ones get a stable "model:…" intent so
// dedupe still applies (no cell linkage → honestly never retires). The
// Answering-banner escape gets its keyboard twin (Esc) and advertises it.
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function sandbox() {
  const state = { questionHistory: [], workflowGrid: { steps: [] } };
  const fns = buildSandbox(source, {
    consts: ["MODEL_QUESTION_INTENT_RULES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"],
    functions: [
      "modelQuestionIntent",
      "fieldEditNormalize",
      "questionIntentId",
      "recordAskedQuestion",
      "questionStatusForIntent",
      "retireQuestionsForCell",
      "reopenQuestionsForCell",
      "markQuestionsReaskEligible",
      "patchField",
      "getField",
      "deriveLegacyCellSource",
      "newGridStep",
      "newGridCell",
      "makeId"
    ],
    globals: { state, console: { info: () => {}, warn: () => {}, error: () => {} }, currentGridStep: () => null }
  });
  return { ...fns, state };
}

test("modelQuestionIntent routes model questions onto grid cells deterministically", () => {
  const { modelQuestionIntent } = sandbox();
  assert.deepEqual(
    modelQuestionIntent("Is any client-confidential or regulated data involved here?"),
    ["dataSensitivity", "regulatoryContext"]
  );
  assert.deepEqual(modelQuestionIntent("How often does this run each week?"), ["timeTaken", "frequencyVolume"]);
  assert.deepEqual(modelQuestionIntent("What happens if the reconciliation fails?"), ["exceptionBranching"]);
  assert.deepEqual(modelQuestionIntent("Which systems does the team use for this?"), ["systemsTools"]);
  // First match wins: a sensitivity cue beats a later systems cue.
  assert.deepEqual(
    modelQuestionIntent("Does the Excel workbook hold PII?"),
    ["dataSensitivity", "regulatoryContext"]
  );
  // Unmapped → stable "model:…" intent; same text always yields the same key.
  const a = modelQuestionIntent("What is the annual budget?");
  const b = modelQuestionIntent("  What is the Annual Budget?? ");
  assert.equal(a.length, 1);
  assert.ok(a[0].startsWith("model:"), "no cell match falls back to a model: intent");
  assert.deepEqual(a, b, "normalization makes the fallback intent stable");
  assert.deepEqual(modelQuestionIntent("   "), [], "blank text has no intent");
});

test("a mapped model question dedupes and RETIRES when the grid captures its cell", () => {
  const { modelQuestionIntent, recordAskedQuestion, questionStatusForIntent, patchField, newGridStep, state } = sandbox();
  const question = "Is any client-confidential or regulated data involved here?";
  const intent = modelQuestionIntent(question);

  recordAskedQuestion(intent, question);
  recordAskedQuestion(intent, question);
  assert.equal(state.questionHistory.length, 1, "asked twice, remembered once");
  assert.equal(state.questionHistory[0].askCount, 2);

  // The user answers in the grid — the existing patchField hook retires it.
  const step = newGridStep();
  patchField(step, "risk", "dataSensitivity", "Client confidential", "user-stated", 0.95);
  assert.equal(questionStatusForIntent(intent), "retired", "model question retired by the grid capture");
});

test("an unmapped model question dedupes but never retires via the grid (no cell linkage)", () => {
  const { modelQuestionIntent, recordAskedQuestion, questionStatusForIntent, patchField, newGridStep, state } = sandbox();
  const question = "What is the annual budget?";
  const intent = modelQuestionIntent(question);
  recordAskedQuestion(intent, question);
  recordAskedQuestion(intent, question);
  assert.equal(state.questionHistory.length, 1);
  assert.equal(state.questionHistory[0].askCount, 2, "dedupe applies");

  const step = newGridStep();
  patchField(step, "risk", "dataSensitivity", "Internal", "user-stated", 0.9);
  patchField(step, "flow", "systemsTools", "Excel", "user-stated", 0.9);
  assert.equal(questionStatusForIntent(intent), "open", "no grid cell answers it — stays open, honestly");
});

test("evidence wiring: tapping is asking, retired stays quiet, banner activates", () => {
  const card = extractFunction(source, "evidenceArtifactCard");
  assert.ok(card.includes("data-model-question"), "follow-up questions are askable affordances");
  assert.ok(card.includes("questionStatusForIntent(modelQuestionIntent("), "render shows retired memory");
  assert.ok(card.includes("answered"), "retired questions display as answered, not nagging");

  const bind = extractFunction(source, "bindEvidenceActions");
  assert.ok(bind.includes("recordAskedQuestion(modelQuestionIntent("), "tap records through the intent machinery");
  assert.ok(bind.includes("setActiveGapQuestion("), "tap activates the Answering banner");
  assert.ok(bind.includes('"retired"'), "a still-retired intent toasts instead of re-asking");
});

test("Answering banner: Esc is wired and advertised next to the ×", () => {
  const keydown = extractFunction(source, "handleChatInputKeydown");
  assert.ok(keydown.includes('"Escape"') && keydown.includes("clearActiveGapQuestion()"),
    "Esc on the composer clears the active question");
  assert.ok(keydown.includes("activeGapQuestion"), "Esc only intercepts while a question is active");

  const banner = extractFunction(source, "renderActiveQuestionLabel");
  assert.ok(banner.includes("<kbd"), "the escape is advertised, not hidden");
  assert.ok(banner.includes("Esc"), "hint names the key");
  assert.ok(banner.includes("data-clear-question"), "the × clear affordance remains");
});
