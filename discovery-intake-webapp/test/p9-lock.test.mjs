// Executed tests for PR 31 Slice 3 — P9 confirm-to-lock / unlock. "Locked" is
// pure provenance: every captured P9 basis cell (dataSensitivity /
// regulatoryContext) carries user provenance, so patchField's precedence makes
// the lock re-extraction-proof — no new flag, no new write path. The approved
// constraint is pinned structurally: lock affects SCORING permanence only and
// never touches recipe generation ("Generate anyway" stays, nothing disabled).
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function sandbox() {
  const state = { questionHistory: [], workflowGrid: { steps: [] } };
  const fns = buildSandbox(source, {
    consts: ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER", "FIELD_EDIT_DEFS"],
    functions: [
      "p9SensitivityLocked",
      "lockP9Sensitivity",
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

test("confirm-to-lock promotes the basis to user provenance without changing values, and re-extraction is refused", () => {
  const { p9SensitivityLocked, lockP9Sensitivity, patchField, getField, newGridStep } = sandbox();
  const step = newGridStep();
  patchField(step, "risk", "dataSensitivity", "Client confidential", "doc-extracted", 0.9);
  patchField(step, "risk", "regulatoryContext", "SOX controls apply", "ai-inferred", 0.6);
  assert.equal(p9SensitivityLocked(step), false, "doc/ai provenance is not locked");

  assert.equal(lockP9Sensitivity(step), true);
  const sens = getField(step, null, "dataSensitivity");
  const reg = getField(step, null, "regulatoryContext");
  assert.equal(sens.value, "Client confidential", "lock endorses the CURRENT value");
  assert.equal(reg.value, "SOX controls apply");
  assert.equal(sens.source, "user-edited");
  assert.equal(reg.source, "user-edited");
  assert.equal(p9SensitivityLocked(step), true);

  // Permanence: re-extraction at any confidence cannot silently change a
  // locked P9 — patchField's provenance precedence refuses the write.
  assert.equal(patchField(step, "risk", "dataSensitivity", "Public data", "doc-extracted", 0.99), false);
  assert.equal(patchField(step, "risk", "regulatoryContext", "None", "ai-inferred", 0.99), false);
  assert.equal(getField(step, null, "dataSensitivity").value, "Client confidential", "locked value survives");
  assert.equal(getField(step, null, "regulatoryContext").value, "SOX controls apply");
});

test("lock with no captured basis returns false; a partial basis locks what exists", () => {
  const { p9SensitivityLocked, lockP9Sensitivity, patchField, getField, newGridStep } = sandbox();
  const empty = newGridStep();
  assert.equal(lockP9Sensitivity(empty), false, "nothing to endorse — caller routes to the editor");
  assert.equal(p9SensitivityLocked(empty), false);

  const partial = newGridStep();
  patchField(partial, "risk", "dataSensitivity", "Internal only", "doc-extracted", 0.8);
  assert.equal(lockP9Sensitivity(partial), true, "the one captured cell is enough to lock");
  assert.equal(getField(partial, null, "dataSensitivity").source, "user-edited");
  assert.equal(getField(partial, null, "regulatoryContext").state, "empty", "empty basis cell untouched");
  assert.equal(p9SensitivityLocked(partial), true, "locked = every CAPTURED basis cell is user-authoritative");
  // Idempotent: locking again is a no-op that stays locked.
  assert.equal(lockP9Sensitivity(partial), true);
});

test("unlock is reclassification through the shared field editor, with the tier flip explained", () => {
  const wire = extractFunction(source, "wireScoringCards");
  assert.ok(wire.includes("data-sc-p9-lock") && wire.includes("data-sc-p9-edit"), "both controls wired on the scoring card");
  assert.ok(wire.includes("lockP9Sensitivity("), "lock routes through the provenance promotion");
  assert.ok(wire.includes("openFieldEditor(") && wire.includes("FIELD_EDIT_DEFS.sensitivity"),
    "unlock opens the field editor on the P9 BASIS cells — the tier moves only by correcting what drove it");
  assert.ok(wire.includes("explainTierChange("), "a reclassification flip is explained in evidence language");
});

test("scoring permanence ONLY: generation never consults the lock and 'Generate anyway' is untouched", () => {
  for (const fn of ["recipeGateCheck", "generateRecipePrompt", "renderRecipeGatePanel", "runRecipeGeneration"]) {
    const body = extractFunction(source, fn);
    assert.ok(!body.includes("p9SensitivityLocked") && !body.includes("lockP9Sensitivity"),
      `${fn} must not consult the P9 lock`);
  }
  const gatePanel = extractFunction(source, "renderRecipeGatePanel");
  assert.ok(gatePanel.includes("data-gate-generate-anyway"), "the Generate anyway escape hatch is still present");
  assert.ok(!/\bdisabled\b/.test(gatePanel), "nothing in the gate panel is hard-disabled");
});
