// Executed tests for PR 31 Slice 2 — live re-score. explainTierChange names the
// decisive principle behind a tier flip in the breakdown's own evidence
// language (override flips are pinned to P9/P7 explicitly; numeric flips fall
// to the largest mover). composeWhatIfMeta + tierSensitivity is the live
// warning recompute (carry-item 2): overrides update the knife-edge warning on
// the same repaint, and a user override never reads as "insufficient data".
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function sandbox() {
  const state = { questionHistory: [], workflowGrid: { steps: [] } };
  const fns = buildSandbox(source, {
    consts: ["SCORING_PRINCIPLES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"],
    functions: [
      "explainTierChange",
      "composeWhatIfMeta",
      "tierSensitivity",
      "scoringTierFromScores",
      "scoringTierBadge",
      "getStepOpportunityMeta",
      "applyFieldEdit",
      "patchField",
      "getField",
      "deriveLegacyCellSource",
      "newGridStep",
      "newGridCell",
      "makeId",
      "isMaterialFieldChange",
      "fieldEditNormalize",
      "fieldEditDistance",
      "markQuestionsReaskEligible",
      "reopenQuestionsForCell"
    ],
    globals: { state, console: { info: () => {}, warn: () => {}, error: () => {} }, currentGridStep: () => null }
  });
  return { ...fns, state };
}

const KEYS = [
  "repetitiveness", "ruleDensity", "dataStructure", "volumeFrequency", "timeCostPerInstance",
  "errorRateAndConsequence", "humanJudgmentRequired", "integrationComplexity", "dataSensitivity", "outputClarity"
];

function metaFromScores(scoreMap, tier) {
  const principleScores = {};
  KEYS.forEach((key) => {
    principleScores[key] = { score: scoreMap[key] ?? 2, reason: "scored from captured fields" };
  });
  return { tier, principleScores };
}

test("known flip end-to-end: a regulatory edit flips Strategic to Compliance and the explanation names P9", () => {
  const { explainTierChange, getStepOpportunityMeta, applyFieldEdit, newGridStep } = sandbox();
  const step = newGridStep();
  // Empty step: every principle is neutral (2) -> total 20 -> strategic.
  const before = getStepOpportunityMeta(step);
  assert.equal(before.tier, "strategic", "baseline tier for the fixture");

  // The PR 31 edit path itself causes the flip — the real engine, both runs.
  assert.equal(applyFieldEdit(step, "regulatoryContext", "SOX controls govern this reconciliation").changed, true);
  const after = getStepOpportunityMeta(step);
  assert.equal(after.tier, "compliance", "P9 override forces compliance");

  const change = explainTierChange(before, after);
  assert.equal(change.principle, "dataSensitivity", "entering Compliance is always P9's doing");
  assert.equal(change.n, 9);
  assert.equal(change.fromScore, 2);
  assert.equal(change.toScore, 1);
  assert.ok(change.message.includes("Strategic → Compliance"), "names both tiers in badge language");
  assert.ok(/regulatory/i.test(change.message), "carries the scoring run's own evidence reason");
});

test("numeric flip: the largest mover is named with its score movement", () => {
  const { explainTierChange } = sandbox();
  // 3 threes + 7 twos = 23 -> strategic; volumeFrequency 2->3 = 24 -> quick-win.
  const baseScores = { repetitiveness: 3, ruleDensity: 3, dataStructure: 3 };
  const before = metaFromScores(baseScores, "strategic");
  const after = metaFromScores({ ...baseScores, volumeFrequency: 3 }, "quick-win");
  const change = explainTierChange(before, after);
  assert.equal(change.principle, "volumeFrequency");
  assert.equal(change.fromScore, 2);
  assert.equal(change.toScore, 3);
  assert.ok(change.message.includes("Strategic → Quick Win"));

  // No flip -> null; identical tiers never explain.
  assert.equal(explainTierChange(before, before), null);
});

test("leaving compliance is also pinned to P9, not the largest mover", () => {
  const { explainTierChange } = sandbox();
  const before = metaFromScores({ dataSensitivity: 1, repetitiveness: 3, ruleDensity: 3, dataStructure: 3 }, "compliance");
  // P9 corrected to 3 AND another principle moved: P9 must still be named.
  const after = metaFromScores({ dataSensitivity: 3, repetitiveness: 1, ruleDensity: 3, dataStructure: 3 }, "strategic");
  const change = explainTierChange(before, after);
  assert.equal(change.principle, "dataSensitivity");
  assert.ok(change.message.includes("Compliance → Strategic"));
});

test("live warning recompute: an override resolves a knife-edge and never reads as low-data", () => {
  const { composeWhatIfMeta, tierSensitivity } = sandbox();
  // Baseline: total 23 (one point from quick-win), volumeFrequency uncertain.
  const originals = { repetitiveness: 3, ruleDensity: 3, dataStructure: 3 };
  KEYS.forEach((key) => { originals[key] = originals[key] ?? 2; });
  const reasons = {};
  KEYS.forEach((key) => { reasons[key] = key === "volumeFrequency" ? "insufficient data" : "scored from captured fields"; });

  const baseline = tierSensitivity(composeWhatIfMeta(originals, reasons, { ...originals }));
  assert.equal(baseline.kind, "flip", "the AI baseline sits on a numeric knife-edge");

  // What-if: the user overrides volumeFrequency to 3 -> total 24, quick-win.
  const overridden = composeWhatIfMeta(originals, reasons, { ...originals, volumeFrequency: 3 });
  assert.equal(overridden.principleScores.volumeFrequency.score, 3);
  assert.ok(!/insufficient data/i.test(overridden.principleScores.volumeFrequency.reason),
    "a user override is an assessment, not missing data");
  const after = tierSensitivity(overridden);
  // The warning changed with the what-if scores — it is no longer the same
  // baseline knife-edge (24 sits on its own boundary, so a new flip may
  // legitimately surface; what may NOT happen is the stale baseline warning).
  assert.notDeepEqual(after, baseline, "warning recomputed from live scores");
});

test("structurally: paintScoringCard recomputes the warning; the block only seeds the container", () => {
  const paint = extractFunction(source, "paintScoringCard");
  assert.ok(paint.includes("composeWhatIfMeta(") && paint.includes("tierSensitivity("),
    "repaint recomputes the warning from the live what-if scores");
  assert.ok(paint.includes("data-sc-sensitivity"), "repaint writes the warning container");
  const block = extractFunction(source, "scoringTransparencyBlockHtml");
  assert.ok(block.includes("data-sc-sensitivity") && block.includes("data-reasons"),
    "block renders the container + the reasons the repaint needs");
});
