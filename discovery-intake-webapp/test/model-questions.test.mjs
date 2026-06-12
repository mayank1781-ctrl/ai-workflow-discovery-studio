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
      "modelQuestionForCells",
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

test("modelQuestionForCells: the doc's phrasing wins a slot only when its cells intersect", () => {
  const { modelQuestionForCells, state } = sandbox();
  state.evidenceArtifacts = [
    { id: "ev-1", followUpQuestions: ["What is the annual budget?", "Is any client-confidential or regulated data involved here?"] },
    { id: "ev-2", followUpQuestions: ["How often does this run each week?"] }
  ];
  // Intersection match: the sensitivity slot ([dataSensitivity]) takes the
  // doc's sensitivity question; the unmapped budget question never competes.
  assert.equal(
    modelQuestionForCells(["dataSensitivity"]),
    "Is any client-confidential or regulated data involved here?"
  );
  assert.equal(modelQuestionForCells(["timeTaken", "frequencyVolume"]), "How often does this run each week?");
  // No artifact question maps to these cells -> "" (caller keeps canonical q).
  assert.equal(modelQuestionForCells(["output"]), "");
  assert.equal(modelQuestionForCells([]), "");
  state.evidenceArtifacts = [];
  assert.equal(modelQuestionForCells(["dataSensitivity"]), "", "no artifacts -> canonical wording everywhere");
});

test("no duplicate visible wording: a doc question is claimed by at most one slot per surface", () => {
  const { modelQuestionForCells, state } = sandbox();
  // The sensitivity question maps to BOTH dataSensitivity and regulatoryContext
  // — the two distinct KEY_QUESTION_FIELDS gap intents that rendered it twice.
  state.evidenceArtifacts = [
    { id: "ev-1", followUpQuestions: ["Is any client-confidential or regulated data involved here?"] }
  ];
  const claimed = new Set();
  // Slots map in render order, sharing one claim set (as the builders do).
  const slot1 = modelQuestionForCells(["dataSensitivity"], claimed);
  const slot2 = modelQuestionForCells(["regulatoryContext"], claimed);
  assert.equal(slot1, "Is any client-confidential or regulated data involved here?", "first slot takes the doc wording");
  assert.equal(slot2, "", "second slot does NOT repeat it -> caller keeps canonical wording");

  // Without a shared set the old double-render returns (proves the set is the fix).
  assert.equal(modelQuestionForCells(["dataSensitivity"]), modelQuestionForCells(["regulatoryContext"]),
    "unclaimed lookups both match the same question (the bug, now guarded by the claim set)");

  // A second distinct doc question still fills its own slot.
  state.evidenceArtifacts = [
    { id: "ev-1", followUpQuestions: ["Is any client-confidential or regulated data involved here?", "How often does this run each week?"] }
  ];
  const claimed2 = new Set();
  assert.ok(modelQuestionForCells(["dataSensitivity"], claimed2));
  assert.equal(modelQuestionForCells(["timeTaken", "frequencyVolume"], claimed2), "How often does this run each week?",
    "a different doc question is unaffected by an earlier claim");
});

test("builder pins: both reachable surfaces substitute wording, intents stay canonical, slots stay <=3", () => {
  // Slice 4a re-landed carry-item 3 on the two surfaces that actually render —
  // the dead per-artifact evidence list is gone (ghost-host lesson from PR 33).
  const inline = extractFunction(source, "renderInlineKeyQuestions");
  assert.ok(inline.includes("modelQuestionForCells([field.key], claimedWording) || field.q"), "key-questions slot takes the doc's wording, threading a claim set");
  assert.ok(inline.includes('data-gap-key="${escapeHtml(field.key)}"'), "intent stays the canonical cell key");
  assert.ok(inline.includes(".slice(0, 3)"), "slot count unchanged");

  const gatePanel = extractFunction(source, "renderRecipeGatePanel");
  assert.ok(gatePanel.includes("modelQuestionForCells(gap.cells, claimedWording) || gap.q"), "gate slot takes the doc's wording, threading a claim set");
  assert.ok(gatePanel.includes('data-gate-cells="${escapeHtml(gap.cells.join("+"))}"'), "intent stays the canonical cell set");

  // The dead evidence card lost its affordance in 4a and the WHOLE function in
  // PR 36 Slice A (its only callers were the ghost workbench renderers).
  assert.ok(!/function evidenceArtifactCard\b/.test(source), "dead evidence card removed entirely");
  const bind = extractFunction(source, "bindEvidenceActions");
  assert.ok(!bind.includes("data-model-question"), "dead evidence wiring removed");
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
