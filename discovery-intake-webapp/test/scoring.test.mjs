// Unit tests for getStepOpportunityMeta() — the gated opportunity scoring in
// app.js (regulatory override → completeness gate → time-based Quick Win /
// Strategic). See ROSETTA L47.
//
// app.js is a browser classic script (it touches `document`/`window` at load),
// so it can't be imported in Node. getStepOpportunityMeta is pure, though — it
// only reads `step.cells` — so we extract its source from app.js and evaluate
// it here. That keeps app.js untouched while testing the real shipped code, so
// any future edit to the function is covered by these tests.
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
const valueCell = (value) => ({ value });
const confirmedCell = (value = "") => ({ value, state: "confirmed" });
const step = (cells = {}) => ({ cells });

// Confirm N of the 5 critical fields, avoiding ones that would trip the
// regulatory override (dataSensitivity value / regulatoryContext value).
const NEUTRAL_FIELDS = ["systemsTools", "output", "rulesDecisionLogic", "dataSensitivity", "regulatoryContext"];
function confirmFields(count, extra = {}) {
  const cells = {};
  for (let i = 0; i < count; i += 1) cells[NEUTRAL_FIELDS[i]] = confirmedCell("");
  return step({ ...cells, ...extra });
}

// === Check 2: regulatory override (runs first) ==============================

test('"very high" data sensitivity → compliance, no priority', () => {
  const result = getStepOpportunityMeta(step({
    dataSensitivity: confirmedCell("Very High"),
    timeTaken: valueCell("5 min")
  }));
  assert.deepEqual(result, { label: "Compliance review required", tier: "compliance", priority: null });
});

test('"very high" match is case-insensitive and substring-based', () => {
  const result = getStepOpportunityMeta(step({ dataSensitivity: valueCell("Extremely VERY HIGH risk") }));
  assert.equal(result.tier, "compliance");
});

test("non-empty regulatoryContext → compliance", () => {
  const result = getStepOpportunityMeta(step({ regulatoryContext: valueCell("GDPR Article 5") }));
  assert.deepEqual(result, { label: "Compliance review required", tier: "compliance", priority: null });
});

test("regulatory override beats the completeness gate (ordering)", () => {
  // Zero confirmed fields would normally be Speculative, but a regulatory
  // value must win because the override runs first.
  const result = getStepOpportunityMeta(step({ regulatoryContext: valueCell("SOX") }));
  assert.equal(result.tier, "compliance");
});

test("whitespace-only regulatoryContext does NOT trigger compliance (.trim())", () => {
  const result = getStepOpportunityMeta(step({ regulatoryContext: valueCell("   ") }));
  assert.notEqual(result.tier, "compliance");
});

test('plain "high" (not "very high") does NOT trigger compliance', () => {
  const result = getStepOpportunityMeta(confirmFields(3, {
    dataSensitivity: confirmedCell("High"),
    timeTaken: valueCell("10 min")
  }));
  assert.notEqual(result.tier, "compliance");
});

// === Check 1: completeness gate =============================================

test("fewer than 60% of critical fields confirmed → speculative", () => {
  const result = getStepOpportunityMeta(confirmFields(2)); // 2/5 = 0.4 < 0.6
  assert.deepEqual(result, { label: "Speculative", tier: "speculative", priority: null });
});

test("exactly 60% (3/5) confirmed clears the gate (0.6 is not < 0.6)", () => {
  const result = getStepOpportunityMeta(confirmFields(3, { timeTaken: valueCell("10 min") }));
  assert.notEqual(result.tier, "speculative");
  assert.equal(result.tier, "quick-win");
});

test("empty step → speculative (0/5 confirmed, no regulatory)", () => {
  assert.equal(getStepOpportunityMeta(step({})).tier, "speculative");
});

test("undefined step → speculative (defensive nullish handling)", () => {
  assert.equal(getStepOpportunityMeta(undefined).tier, "speculative");
});

// === Time-based scoring once both gates clear ===============================

test("gates cleared + timeTaken < 30 → Quick Win (priority 1)", () => {
  const result = getStepOpportunityMeta(confirmFields(3, { timeTaken: valueCell("20 minutes") }));
  assert.deepEqual(result, { label: "Quick Win", tier: "quick-win", priority: 1 });
});

test("gates cleared + timeTaken >= 30 → Strategic (priority 2)", () => {
  const result = getStepOpportunityMeta(confirmFields(3, { timeTaken: valueCell("90 minutes") }));
  assert.deepEqual(result, { label: "Strategic", tier: "strategic", priority: 2 });
});

test("30-minute boundary is exclusive: 29 → Quick Win, 30 → Strategic", () => {
  assert.equal(getStepOpportunityMeta(confirmFields(3, { timeTaken: valueCell("29") })).tier, "quick-win");
  assert.equal(getStepOpportunityMeta(confirmFields(3, { timeTaken: valueCell("30") })).tier, "strategic");
});

test("gates cleared + missing/non-numeric timeTaken → Strategic (NaN < 30 is false)", () => {
  assert.equal(getStepOpportunityMeta(confirmFields(3)).tier, "strategic");
  assert.equal(getStepOpportunityMeta(confirmFields(3, { timeTaken: valueCell("soon") })).tier, "strategic");
});
