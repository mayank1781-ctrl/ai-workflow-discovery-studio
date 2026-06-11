// Executed tests for PR 31 Slice 1 — field-level correction. applyFieldEdit is
// the one edit path for string grid cells: user-edited writes via patchField
// (auto-retiring the cell's question through the existing hook), plus the
// retirement EXCEPTION — emptying a field reopens its intent now; a material
// change keeps it retired but re-ask ELIGIBLE; trivial edits (whitespace, case,
// punctuation, small typo fixes) change nothing. Real shipped source extracted
// and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();

function correctionSandbox() {
  const state = { questionHistory: [], workflowGrid: { steps: [] } };
  const fns = buildSandbox(source, {
    consts: ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"],
    functions: [
      "computeFieldEditorPosition",
      "applyFieldEdit",
      "patchField",
      "getField",
      "deriveLegacyCellSource",
      "newGridStep",
      "newGridCell",
      "makeId",
      "questionIntentId",
      "recordAskedQuestion",
      "retireQuestionsForCell",
      "reopenQuestionsForCell",
      "markQuestionsReaskEligible",
      "fieldEditNormalize",
      "fieldEditDistance",
      "isMaterialFieldChange"
    ],
    globals: { state, console: { info: () => {}, warn: () => {}, error: () => {} }, currentGridStep: () => null }
  });
  return { ...fns, state };
}

test("applyFieldEdit writes user-edited at confidence 1 and auto-retires the cell's question", () => {
  const { applyFieldEdit, getField, newGridStep, recordAskedQuestion, state } = correctionSandbox();
  const step = newGridStep();
  recordAskedQuestion(["timeTaken"], "Roughly how long does the whole workflow take end to end?");
  assert.equal(state.questionHistory[0].status, "open");

  const result = applyFieldEdit(step, "timeTaken", "about 45 minutes per run");
  assert.equal(result.changed, true);
  const cell = getField(step, null, "timeTaken");
  assert.equal(cell.value, "about 45 minutes per run");
  assert.equal(cell.source, "user-edited");
  assert.equal(cell.confidence, 1);
  assert.equal(cell.state, "confirmed");
  // The existing patchField hook retired the question — no new wiring needed.
  assert.equal(state.questionHistory[0].status, "retired");
  assert.equal(state.questionHistory[0].retiredBy, "user-edited");
});

test("retirement exception, clear arm: emptying the field reopens its intent immediately", () => {
  const { applyFieldEdit, getField, newGridStep, patchField, recordAskedQuestion, state } = correctionSandbox();
  const step = newGridStep();
  recordAskedQuestion(["dataSensitivity"], "What data sensitivity applies here?");
  patchField(step, "risk", "dataSensitivity", "Client confidential", "doc-extracted", 0.9);
  assert.equal(state.questionHistory[0].status, "retired", "doc capture above 0.7 retires");

  const result = applyFieldEdit(step, "dataSensitivity", "   ");
  assert.equal(result.cleared, true);
  const cell = getField(step, null, "dataSensitivity");
  assert.equal(cell.value, "");
  assert.equal(cell.state, "empty");
  const entry = state.questionHistory[0];
  assert.equal(entry.status, "open", "the answer is gone — the question reopens NOW");
  assert.equal(entry.retiredBy, "");
  assert.equal(entry.reaskEligible, false, "reopened, not merely eligible");
  // Clearing an already-empty cell is a no-op, not a phantom change.
  assert.equal(applyFieldEdit(step, "dataSensitivity", "").changed, false);
});

test("retirement exception, material arm: stays retired but becomes re-ask eligible; trivial edits do not", () => {
  const { applyFieldEdit, newGridStep, patchField, recordAskedQuestion, state } = correctionSandbox();
  const step = newGridStep();
  recordAskedQuestion(["systemsTools"], "What systems or tools are used across these steps?");
  patchField(step, "flow", "systemsTools", "Excel and the recievables system", "user-stated", 0.95);
  assert.equal(state.questionHistory[0].status, "retired");

  // Trivial: typo + case fix — normalized distance within the allowance.
  const trivial = applyFieldEdit(step, "systemsTools", "Excel and the Receivables system");
  assert.equal(trivial.changed, true);
  assert.equal(trivial.material, false, "typo/case fix is not material");
  assert.equal(Boolean(state.questionHistory[0].reaskEligible), false);
  assert.equal(state.questionHistory[0].status, "retired");

  // Material: the substance of the answer changed.
  const material = applyFieldEdit(step, "systemsTools", "Bloomberg terminal plus an internal ledger tool");
  assert.equal(material.material, true);
  const entry = state.questionHistory[0];
  assert.equal(entry.status, "retired", "user just supplied the new answer — not open");
  assert.equal(entry.reaskEligible, true, "but the intent may be asked again");

  // Eligibility is consumed by the next ask: recordAskedQuestion reopens it.
  const reasked = recordAskedQuestion(["systemsTools"], "Which systems does this step touch now?");
  assert.equal(reasked.status, "open");
  assert.equal(reasked.reaskEligible, false);
  assert.equal(reasked.askCount, 2);
  // Without eligibility, retired stays sacrosanct (pre-PR 31 behavior).
  reasked.status = "retired";
  const deduped = recordAskedQuestion(["systemsTools"], "Asking again?");
  assert.equal(deduped.status, "retired", "a retired, non-eligible intent is never reopened");
});

test("materiality rule: whitespace/case/punctuation and small typos are trivial; rewording is material", () => {
  const { isMaterialFieldChange } = correctionSandbox();
  assert.equal(isMaterialFieldChange("Daily at 9am", "  daily at 9AM. "), false, "case/whitespace/punctuation");
  assert.equal(isMaterialFieldChange("recieve invoices", "receive invoices"), false, "single typo fix");
  assert.equal(isMaterialFieldChange("Ops analyst reviews", "Ops analysts review"), false, "within the typo allowance");
  assert.equal(isMaterialFieldChange("Daily at 9am", "Monthly, after close"), true, "different answer");
  assert.equal(isMaterialFieldChange("", "Anything"), true, "filling an empty field is material");
  assert.equal(isMaterialFieldChange("Excel", "Excel, Outlook, and the trade booking system"), true, "substantial expansion");
});

test("editor containment: the popup stays fully inside the viewport for every anchor", () => {
  const { computeFieldEditorPosition } = correctionSandbox();
  const margin = 8;
  const width = 360;
  const W = 1280;
  const H = 720;
  // A cell near the bottom edge (the reported bug), a tall editor, plus top,
  // right, and a viewport too short to hold the natural height.
  const cases = [
    { name: "bottom-row cell, tall editor", anchorTop: 690, anchorBottom: 712, anchorLeft: 600, naturalHeight: 420, viewportH: H },
    { name: "top-row cell", anchorTop: 40, anchorBottom: 62, anchorLeft: 20, naturalHeight: 300, viewportH: H },
    { name: "far-right cell", anchorTop: 300, anchorBottom: 322, anchorLeft: 1260, naturalHeight: 200, viewportH: H },
    { name: "editor taller than viewport", anchorTop: 360, anchorBottom: 382, anchorLeft: 500, naturalHeight: 2000, viewportH: H },
    { name: "very short viewport", anchorTop: 300, anchorBottom: 322, anchorLeft: 500, naturalHeight: 500, viewportH: 240 }
  ];
  for (const c of cases) {
    const { top, left, maxHeight } = computeFieldEditorPosition({
      anchorTop: c.anchorTop, anchorBottom: c.anchorBottom, anchorLeft: c.anchorLeft,
      naturalHeight: c.naturalHeight, width, viewportW: W, viewportH: c.viewportH
    });
    const boxHeight = Math.min(c.naturalHeight, maxHeight);
    assert.ok(top >= margin, `${c.name}: top within top margin (${top})`);
    assert.ok(top + boxHeight <= c.viewportH - margin + 0.001, `${c.name}: bottom (Save/Cancel) within viewport (${top}+${boxHeight} <= ${c.viewportH})`);
    assert.ok(left >= margin, `${c.name}: left within margin (${left})`);
    assert.ok(left + width <= W - margin + 0.001, `${c.name}: right edge within viewport (${left})`);
    assert.ok(maxHeight >= 120 || maxHeight === c.viewportH - 2 * margin, `${c.name}: cap not collapsed (${maxHeight})`);
  }
});

test("patchField clear path is user-only and never blanks via extraction sources", () => {
  const { patchField, getField, newGridStep } = correctionSandbox();
  const step = newGridStep();
  patchField(step, "flow", "output", "Reconciliation report", "user-stated", 0.9);
  assert.equal(patchField(step, "flow", "output", "", "doc-extracted", 0.9, { clear: true }), false, "doc-extracted cannot clear");
  assert.equal(patchField(step, "flow", "output", "", "ai-inferred", 0.9, { clear: true }), false, "ai-inferred cannot clear");
  assert.equal(getField(step, null, "output").value, "Reconciliation report", "value untouched");
  assert.equal(patchField(step, "flow", "output", "", "user-edited", 1, { clear: true }), true, "user clear lands");
  assert.equal(getField(step, null, "output").state, "empty");
});
