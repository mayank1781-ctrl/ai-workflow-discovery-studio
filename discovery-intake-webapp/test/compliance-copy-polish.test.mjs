// Executed test for the UX polish PR, Slice 4 — compliance/P9 advisory copy
// (item 11, COPY ONLY). The settled framing: Compliance is a flag for
// governance review, not a gate — recipes are still produced. The tier value,
// the P9 override rule, the P9 lock, and the generation flow are all pinned
// elsewhere (scoring.test.mjs, p9-lock.test.mjs, recipe-gate.test.mjs) and
// untouched here; this file pins the two P9-note surfaces to the SAME
// advisory sentence so card and download can't drift apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();
const ADVISORY = "Flagged for governance review — recipe produced; review data handling against firm AI policy before deploying.";

test("P9 note: card and download carry the same advisory sentence; the gate-y copy is gone", () => {
  const card = extractFunction(source, "renderAnalysisTabRecipe");
  const download = extractFunction(source, "downloadRecipeBook");
  for (const [name, fn] of [["recipe card", card], ["download", download]]) {
    assert.ok(fn.includes(ADVISORY), `${name} carries the advisory sentence`);
    assert.ok(!fn.includes("verify data handling before sharing outputs"), `${name} dropped the old copy`);
  }
});

test("advisory copy did not touch the override logic or the generation flow", () => {
  // The override rule is byte-identical logic — only the label string moved.
  const scoring = extractFunction(source, "getStepOpportunityMeta");
  assert.ok(scoring.includes('if (P.dataSensitivity.score === 1) {'), "P9 override condition unchanged");
  assert.ok(scoring.includes('tier = "compliance"; priority = null;'), "override outcome unchanged");
  // Generation still never blocks on compliance: the gate knows no tier and
  // no "block" state (re-asserting the 30b contract from this slice's angle).
  const gate = extractFunction(source, "recipeGateCheck");
  assert.ok(!/compliance|tier/i.test(gate), "the recipe gate is tier-blind");
});
