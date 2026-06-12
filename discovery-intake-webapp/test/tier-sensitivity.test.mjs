// Executed tests for PR 30 Slice 3 — tierSensitivity(): threshold-sensitivity
// first (which single principle correction flips the tier), then the low-data
// fallback (>4 neutral principles, P7/P9 double-weighted). Real shipped source
// extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();

function sandbox() {
  return buildSandbox(source, {
    consts: ["SCORING_PRINCIPLES"],
    functions: ["tierSensitivity", "scoringTierFromScores"],
    globals: {}
  });
}

const KEYS = [
  "repetitiveness", "ruleDensity", "dataStructure", "volumeFrequency", "timeCostPerInstance",
  "errorRateAndConsequence", "humanJudgmentRequired", "integrationComplexity", "dataSensitivity", "outputClarity"
];

// Build a principleScores meta from a per-key score map; keys listed in
// `uncertainKeys` get the literal "insufficient data" reason.
function meta(scoreMap, uncertainKeys = []) {
  const principleScores = {};
  KEYS.forEach((key) => {
    principleScores[key] = {
      score: scoreMap[key] ?? 2,
      reason: uncertainKeys.includes(key) ? "insufficient data" : "scored from captured fields"
    };
  });
  return { principleScores };
}

test("knife-edge total: the uncertain principle is named with the flipped tier (P5 example)", () => {
  const { tierSensitivity } = sandbox();
  // Total exactly 24 (Quick Win boundary): four 3s + six 2s = 12 + 12 = 24 —
  // a knife edge where any single -1 lands at 23 (Strategic). P5 is the only
  // uncertain principle, so the sort must name it.
  const scores = {
    repetitiveness: 3, ruleDensity: 3, dataStructure: 3, volumeFrequency: 3,
    timeCostPerInstance: 2, errorRateAndConsequence: 2, integrationComplexity: 2,
    outputClarity: 2, humanJudgmentRequired: 2, dataSensitivity: 2
  };
  const result = tierSensitivity(meta(scores, ["timeCostPerInstance"]));
  assert.equal(result.kind, "flip");
  assert.equal(result.principle, "timeCostPerInstance", "the uncertain principle wins the sort");
  assert.match(result.message, /Quick Win, but confirm P5/);
  assert.match(result.message, /Strategic/);
});

test("uncertain P9 surfaces the compliance flip even far from the numeric boundary", () => {
  const { tierSensitivity } = sandbox();
  // Total 28 — no numeric flip within ±1 — but P9 is neutral AND uncertain.
  const scores = {
    repetitiveness: 3, ruleDensity: 3, dataStructure: 3, volumeFrequency: 3,
    timeCostPerInstance: 3, errorRateAndConsequence: 3, integrationComplexity: 3,
    outputClarity: 3, humanJudgmentRequired: 3, dataSensitivity: 2
  };
  const result = tierSensitivity(meta(scores, ["dataSensitivity"]));
  assert.equal(result.kind, "flip");
  assert.equal(result.principle, "dataSensitivity");
  assert.match(result.message, /confirm P9/);
  // Polish item 11: the flip warning names the tier plainly ("becomes
  // Compliance"), without the "review required" gate energy.
  assert.match(result.message, /becomes Compliance\./);
});

test("uncertain P7 on a Quick Win surfaces the strategic cap", () => {
  const { tierSensitivity } = sandbox();
  // Total 29, P7 neutral+uncertain: P7 → 1 caps quick-win at strategic.
  const scores = {
    repetitiveness: 3, ruleDensity: 3, dataStructure: 3, volumeFrequency: 3,
    timeCostPerInstance: 3, errorRateAndConsequence: 3, integrationComplexity: 3,
    outputClarity: 3, dataSensitivity: 3, humanJudgmentRequired: 2
  };
  const result = tierSensitivity(meta(scores, ["humanJudgmentRequired"]));
  assert.equal(result.kind, "flip");
  assert.equal(result.principle, "humanJudgmentRequired");
  assert.match(result.message, /confirm P7/);
  assert.match(result.message, /Strategic/);
});

test("certain P7/P9 at 2 do not warn; >4-weighted neutrals trigger the low-data fallback", () => {
  const { tierSensitivity } = sandbox();
  // Five 3s + five 2s = 25 (margin 2 from both boundaries → no numeric flip).
  // P7 and P9 are neutral but CERTAIN → override flips skipped. Neutral weight:
  // P7(2) + P9(2) + three others = 7 > 4 → fallback fires.
  const scores = {
    repetitiveness: 3, ruleDensity: 3, dataStructure: 3, volumeFrequency: 3, outputClarity: 3,
    timeCostPerInstance: 2, errorRateAndConsequence: 2, integrationComplexity: 2,
    humanJudgmentRequired: 2, dataSensitivity: 2
  };
  const result = tierSensitivity(meta(scores, []));
  assert.equal(result.kind, "low-data", "no flip candidates → fallback");
  assert.equal(result.neutralWeight, 7, "P7 and P9 each count double");
  assert.match(result.message, /provisional/);
});

test("well-evidenced score away from boundaries returns no warning", () => {
  const { tierSensitivity } = sandbox();
  // Total 28, two certain neutrals on ordinary principles (weight 2 ≤ 4).
  const scores = {
    repetitiveness: 3, ruleDensity: 3, dataStructure: 3, volumeFrequency: 3,
    errorRateAndConsequence: 3, outputClarity: 3, humanJudgmentRequired: 3, dataSensitivity: 3,
    timeCostPerInstance: 2, integrationComplexity: 2
  };
  const result = tierSensitivity(meta(scores, []));
  assert.equal(result, null);
});
