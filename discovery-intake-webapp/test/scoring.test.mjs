// Unit tests for getStepOpportunityMeta() — the 10-principle AI opportunity
// scoring in app.js (ROSETTA L47). Each principle scores 1 (low AI fit) to 3
// (high AI fit) from the session grid; the 10 scores sum to a 10–30 total that
// maps to a tier (speculative / strategic / quick-win). Two overrides sit on
// top: P9 = 1 (highly sensitive) → compliance; P7 = 1 (heavy judgment) caps at
// strategic. The function also returns a principleScores transparency object.
//
// app.js is a browser classic script (it touches `document`/`window` at load),
// so it can't be imported in Node. getStepOpportunityMeta is pure, though — it
// only reads `step.cells` — so we extract its source from app.js and evaluate
// it here. That keeps app.js untouched while testing the real shipped code.
//
// Run with: npm test   (node --test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Extract a top-level `function <name>(...) { ... }` block by brace-matching.
// Sufficient here because the function body has no braces inside strings or
// comments; if that ever changes, this helper would need a real tokenizer.
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} not found in app.js`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces extracting ${name}`);
}

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
// eslint-disable-next-line no-eval
const getStepOpportunityMeta = eval(`(${extractFunction(appSource, "getStepOpportunityMeta")})`);

// --- helpers ----------------------------------------------------------------
const cell = (value) => ({ value });
const step = (cells = {}) => ({ cells });
const total = (meta) => Object.values(meta.principleScores).reduce((sum, p) => sum + p.score, 0);

const PRINCIPLES = [
  "repetitiveness", "ruleDensity", "dataStructure", "volumeFrequency", "timeCostPerInstance",
  "errorRateAndConsequence", "humanJudgmentRequired", "integrationComplexity", "dataSensitivity", "outputClarity"
];

// A maxed-out, high-AI-fit step: every principle scores 3 (total 30) with no
// judgment and low sensitivity, so no override fires.
const HIGH_FIT = step({
  frequencyVolume: cell("Runs daily, the same standard way every time"),
  trigger: cell("Triggered when the structured report lands"),
  output: cell("Produces an approved summary report"),
  handoff: cell("Handed to the reviewer"),
  rulesDecisionLogic: cell("Threshold-based rules and clear criteria"),
  painFriction: cell("Frequent errors with high costly impact, but governed by clear rules"),
  exceptionBranching: cell("Standard exception checklist"),
  dataProcessing: cell("Structured tables and spreadsheet records"),
  systemsTools: cell("Excel"),
  timeTaken: cell("90 minutes"),
  dataSensitivity: cell("Internal low risk"),
  description: cell("Generates a clear report deliverable"),
  personaActors: cell("Operations analyst")
});

// === Output shape ===========================================================

test("returns label/tier/priority/principleScores; all 10 principles scored 1–3 with reasons", () => {
  const result = getStepOpportunityMeta(HIGH_FIT);
  assert.deepEqual(Object.keys(result).sort(), ["label", "principleScores", "priority", "tier"]);
  assert.deepEqual(Object.keys(result.principleScores), PRINCIPLES);
  for (const name of PRINCIPLES) {
    const entry = result.principleScores[name];
    assert.ok(entry.score >= 1 && entry.score <= 3, `${name} score in range`);
    assert.equal(typeof entry.reason, "string");
    assert.ok(entry.reason.length > 0, `${name} has a reason`);
  }
});

// === Missing data → neutral 2 / "insufficient data" =========================

test("a field with no data scores 2 (neutral) with reason 'insufficient data'", () => {
  const { principleScores } = getStepOpportunityMeta(step({}));
  for (const name of PRINCIPLES) {
    assert.equal(principleScores[name].score, 2, `${name} neutral`);
    assert.equal(principleScores[name].reason, "insufficient data", `${name} reason`);
  }
});

test("empty step totals 20 (all neutral) → strategic; undefined step does not throw", () => {
  const result = getStepOpportunityMeta(step({}));
  assert.equal(total(result), 20);
  assert.equal(result.tier, "strategic");
  assert.equal(result.priority, 2);
  assert.equal(getStepOpportunityMeta(undefined).tier, "strategic"); // defensive nullish handling
});

// === Tier mapping from the total ============================================

test("high-fit step → quick-win, priority 1, total 30", () => {
  const result = getStepOpportunityMeta(HIGH_FIT);
  assert.equal(total(result), 30);
  assert.equal(result.tier, "quick-win");
  assert.equal(result.priority, 1);
  assert.equal(result.label, "Quick Win");
});

test("low-fit step (total ≤ 15) → speculative, priority null", () => {
  const result = getStepOpportunityMeta(step({
    frequencyVolume: cell("Happens rarely, a few times a year, ad-hoc"),
    output: cell("Output is vague and varies, not defined"),
    rulesDecisionLogic: cell("Heavy judgment and subjective interpretation"),
    painFriction: cell("Subjective interpretation requiring heavy judgment; errors are rare and minor with low impact"),
    dataProcessing: cell("Free-text emails and narrative notes"),
    systemsTools: cell("Outlook, Word, SharePoint, Teams, SAP, Murex"),
    timeTaken: cell("5 minutes"),
    dataSensitivity: cell("Confidential"),
    description: cell("vague and undefined")
  }));
  assert.ok(total(result) <= 15, `total ${total(result)} ≤ 15`);
  assert.equal(result.tier, "speculative");
  assert.equal(result.priority, null);
});

// === P9 override: highly sensitive → compliance =============================

test("P9 = 1 (PII) overrides to compliance regardless of total", () => {
  const result = getStepOpportunityMeta(step({ dataSensitivity: cell("PII / personal data") }));
  assert.equal(result.principleScores.dataSensitivity.score, 1);
  assert.deepEqual(
    { label: result.label, tier: result.tier, priority: result.priority },
    // Polish item 11: advisory label — the tier value and override are unchanged.
    { label: "Flagged for governance review", tier: "compliance", priority: null }
  );
});

test('"very high" sensitivity and a non-empty regulatoryContext both → P9 = 1 → compliance', () => {
  const veryHigh = getStepOpportunityMeta(step({ dataSensitivity: cell("Very High") }));
  assert.equal(veryHigh.principleScores.dataSensitivity.score, 1);
  assert.equal(veryHigh.tier, "compliance");
  // HIGH_FIT would be quick-win, but a regulatory context forces compliance.
  const regulated = getStepOpportunityMeta(step({ ...HIGH_FIT.cells, regulatoryContext: cell("SOX") }));
  assert.equal(regulated.principleScores.dataSensitivity.score, 1);
  assert.equal(regulated.tier, "compliance");
});

test('P9 "internal" → 3 (low risk) and "confidential" → 2 (controlled); neither is compliance', () => {
  const internal = getStepOpportunityMeta(step({ dataSensitivity: cell("Internal") }));
  assert.equal(internal.principleScores.dataSensitivity.score, 3);
  assert.notEqual(internal.tier, "compliance");
  const confidential = getStepOpportunityMeta(step({ dataSensitivity: cell("Confidential") }));
  assert.equal(confidential.principleScores.dataSensitivity.score, 2);
  assert.notEqual(confidential.tier, "compliance");
});

// === P7 cap: heavy judgment never quick-win =================================

test("P7 = 1 (heavy judgment) caps a would-be quick-win at strategic", () => {
  const judged = step({ ...HIGH_FIT.cells, personaActors: cell("Requires expert judgment and discretion") });
  const result = getStepOpportunityMeta(judged);
  assert.equal(result.principleScores.humanJudgmentRequired.score, 1);
  assert.ok(total(result) >= 24, "total still in quick-win band");
  assert.equal(result.tier, "strategic");
  assert.equal(result.priority, 2);
});

// === Individual principle heuristics ========================================

test("P5 timeCostPerInstance: >60 min → 3, 15–60 → 2, <15 → 1", () => {
  const p5 = (t) => getStepOpportunityMeta(step({ timeTaken: cell(t) })).principleScores.timeCostPerInstance.score;
  assert.equal(p5("90 minutes"), 3);
  assert.equal(p5("2 hours"), 3);
  assert.equal(p5("30 minutes"), 2); // 15–60 inclusive
  assert.equal(p5("60 minutes"), 2); // boundary: not > 60
  assert.equal(p5("61 minutes"), 3);
  assert.equal(p5("10 minutes"), 1);
});

test("P8 integrationComplexity: 1–2 systems → 3, 3–4 → 2, 5+ → 1", () => {
  const p8 = (t) => getStepOpportunityMeta(step({ systemsTools: cell(t) })).principleScores.integrationComplexity.score;
  assert.equal(p8("Excel"), 3);
  assert.equal(p8("Excel and Outlook"), 3);
  assert.equal(p8("Excel, Outlook, SAP"), 2);
  assert.equal(p8("Excel, Outlook, SAP, Murex, Teams, SharePoint"), 1);
});

test("P4 volumeFrequency: daily → 3, weekly → 2, monthly → 1", () => {
  const p4 = (t) => getStepOpportunityMeta(step({ frequencyVolume: cell(t) })).principleScores.volumeFrequency.score;
  assert.equal(p4("Runs daily"), 3);
  assert.equal(p4("A few times a week"), 3);
  assert.equal(p4("Once a week"), 2);
  assert.equal(p4("Monthly"), 1);
  assert.equal(p4("A few times a year"), 1);
});

test("P1 repetitiveness and P3 dataStructure read their fields", () => {
  const p1 = (t) => getStepOpportunityMeta(step({ frequencyVolume: cell(t) })).principleScores.repetitiveness.score;
  assert.equal(p1("The same standard routine"), 3);
  assert.equal(p1("It varies and is ad-hoc"), 1);

  const p3 = (t) => getStepOpportunityMeta(step({ dataProcessing: cell(t) })).principleScores.dataStructure.score;
  assert.equal(p3("Structured tables in a spreadsheet"), 3);
  assert.equal(p3("Free-text emails and narrative notes"), 1);
});

test("transparency: each scored-from-data principle gives a non-empty, specific reason", () => {
  const { principleScores } = getStepOpportunityMeta(HIGH_FIT);
  for (const name of PRINCIPLES) {
    assert.notEqual(principleScores[name].reason, "insufficient data", `${name} reasoned from data`);
    assert.ok(principleScores[name].reason.length > 10, `${name} reason is a sentence`);
  }
});
