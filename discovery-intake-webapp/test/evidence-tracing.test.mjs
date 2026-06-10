// Executed tests for PR 30 Slice 4 — per-principle evidence tracing inside
// getStepOpportunityMeta: each principle carries evidence entries with the
// source field, an excerpt, provenance, hover-only confidence, and the
// scaffolded offset slot (null until the harvest returns real offsets).
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();

function sandbox() {
  return buildSandbox(source, { functions: ["getStepOpportunityMeta"], globals: {} });
}

function cell(value, state, confidence, src) {
  const out = { value, state, confidence };
  if (src !== undefined) out.source = src;
  return out;
}

test("each scored principle cites its source field with excerpt, provenance, and offset scaffold", () => {
  const { getStepOpportunityMeta } = sandbox();
  const step = {
    cells: {
      systemsTools: cell("Outlook, Excel", "confirmed", 0.9, "user-stated"),
      timeTaken: cell("45 minutes", "inferred", 0.6, "doc-extracted")
    }
  };
  const meta = getStepOpportunityMeta(step);
  const p8 = meta.principleScores.integrationComplexity;
  assert.equal(p8.evidence.length, 1);
  assert.deepEqual(p8.evidence[0], {
    field: "systemsTools",
    excerpt: "Outlook, Excel",
    source: "user-stated",
    confidence: 0.9,
    offset: null
  });
  const p5 = meta.principleScores.timeCostPerInstance;
  assert.ok(p5.evidence.some((item) => item.field === "timeTaken" && item.source === "doc-extracted"));
});

test("evidence provenance falls back to legacy state derivation when cell.source is missing", () => {
  const { getStepOpportunityMeta } = sandbox();
  const step = {
    cells: {
      frequencyVolume: cell("daily, 50 a week", "confirmed", 0.85), // pre-provenance cell
      painFriction: cell("manual rework", "inferred", 0.55)
    }
  };
  const meta = getStepOpportunityMeta(step);
  const p4 = meta.principleScores.volumeFrequency.evidence[0];
  assert.equal(p4.source, "user-stated", "confirmed derives user-stated");
  const p2 = meta.principleScores.ruleDensity.evidence.find((item) => item.field === "painFriction");
  assert.equal(p2.source, "ai-inferred", "inferred derives ai-inferred");
});

test("excerpts truncate at 140 chars with an ellipsis — stored alongside the field, never alone", () => {
  const { getStepOpportunityMeta } = sandbox();
  const long = "x".repeat(200);
  const step = { cells: { systemsTools: cell(long, "confirmed", 0.9, "user-stated") } };
  const item = getStepOpportunityMeta(step).principleScores.integrationComplexity.evidence[0];
  assert.equal(item.excerpt.length, 141, "140 chars + ellipsis");
  assert.ok(item.excerpt.endsWith("…"));
  assert.equal(item.field, "systemsTools", "field reference always present");
});

test("empty cells produce no evidence; insufficient-data principles carry an empty list", () => {
  const { getStepOpportunityMeta } = sandbox();
  const meta = getStepOpportunityMeta({ cells: {} });
  for (const [name, entry] of Object.entries(meta.principleScores)) {
    assert.deepEqual(entry.evidence, [], `${name} has no evidence on an empty step`);
    assert.equal(entry.reason, "insufficient data");
  }
});
