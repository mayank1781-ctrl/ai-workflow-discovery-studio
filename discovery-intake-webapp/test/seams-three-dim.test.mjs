// E1 — Three-dimension seams (friction · latency · criticality). Each seam from
// buildWorkflowLeverage now carries three ORTHOGONAL .prov.* triples. Additive: a seam with
// no latency/criticality signal renders friction exactly as before (byte-identical). Rails
// pass on any generated seam text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const FORBIDDEN = /headcount|\bFTE\b|full-time equivalent|automat|\bROI\b|hours saved|time saved|\bopportunity\b/i;
const tag = (value, src, confidence) => ({ value, source: src, confidence: confidence != null ? confidence : (src === "user-stated" ? 1 : 0.6) });
const S = (id, opts = {}) => ({ id, name: opts.name || id, tool: opts.tool || "", channel: opts.channel || "", accessMode: "", hasHumanCheckpoint: Boolean(opts.hasHumanCheckpoint) });
const isDim = (d) => d && typeof d === "object" && ["low", "medium", "high"].includes(d.value)
  && ["stated", "computed", "inferred"].includes(d.source) && "confidence" in d;

function pureSandbox() {
  return buildSandbox(source, {
    consts: ["STEP_TYPE_OPTIONS", "FRICTION_KINDS", "HANDOFF_KINDS", "ROLE_VALUES", "DECISION_KINDS"],
    functions: [
      "buildWorkflowLeverage", "leverageSeamMotivators", "leverageToolTokens", "leverageManualChannel",
      "leverageLevelFor", "leverageStepHumanHeld", "seamMotivatorPhrase",
      "structuralTagOf", "isInAllowedSet", "leastAssertedState", "provenanceToState", "handoffId",
      "seamFrictionDim", "seamLatencyDim", "seamCriticalityDim",
    ],
  });
}

function renderSandbox({ steps = [], stepTypes = {}, frictionTags = {}, roleTags = {}, handoffTags = {}, decisionTags = {} } = {}) {
  const state = { stepTypes, frictionTags, roleTags, handoffTags, decisionTags };
  return buildSandbox(source, {
    consts: ["STEP_TYPE_OPTIONS", "FRICTION_KINDS", "HANDOFF_KINDS", "ROLE_VALUES", "DECISION_KINDS", "HEATMAP_STATE_DOTS", "HUMAN_HOLD_HUE", "LEVERAGE_HUE", "LEVERAGE_LEVELS", "LEVERAGE_SHADE"],
    functions: [
      "leverageMapHtml", "buildWorkflowLeverage", "leverageSeamMotivators", "leverageToolTokens", "leverageManualChannel",
      "leverageLevelFor", "leverageStepHumanHeld", "seamMotivatorPhrase", "leverageTileHtml",
      "structuralTagOf", "isInAllowedSet", "leastAssertedState", "provenanceToState", "handoffId",
      "heatmapSourceDot", "heatmapLegendHtml", "escapeHtml",
      "seamFrictionDim", "seamLatencyDim", "seamCriticalityDim", "seamDimChipHtml", "seamDimsHtml",
    ],
    globals: {
      state,
      analysisGridSteps: () => steps,
      gridCellValue: (step, key) => ((step && step.cells && step.cells[key] && step.cells[key].value) || ""),
      stepDisplayName: (step, i) => (step && step.name) || `Step ${i + 1}`,
    },
  });
}

test("a held + handed-off seam exposes all three dims as provenance triples", () => {
  const model = pureSandbox().buildWorkflowLeverage(
    [S("s1", { name: "Reconcile", tool: "Excel" }), S("s2", { name: "Approve", tool: "Excel" })],
    { frictionTags: { s1: tag("manual-entry", "ai-inferred") }, handoffTags: { "h:s1>s2": tag("role-to-role", "user-stated") }, decisionTags: { s2: tag("approval", "user-stated") } }
  );
  assert.equal(model.seams.length, 1);
  const seam = model.seams[0];
  assert.ok(isDim(seam.friction), "friction is a valid prov triple");
  assert.ok(isDim(seam.latency), "latency is a valid prov triple");
  assert.ok(isDim(seam.criticality), "criticality is a valid prov triple");
  assert.equal(seam.friction.value, "high", "manual-entry => high mechanical friction");
  assert.equal(seam.criticality.value, "high", "a human-held decision => high criticality (the protect signal)");
  assert.equal(seam.criticality.source, "stated", "criticality provenance follows the stated decision tag");
});

test("orthogonality: low friction does NOT lower criticality (a low-friction handoff into a decision stays high-criticality)", () => {
  const model = pureSandbox().buildWorkflowLeverage(
    [S("s1", { name: "Prepare", tool: "Excel" }), S("s2", { name: "Decide", tool: "Excel" })],
    { handoffTags: { "h:s1>s2": tag("role-to-role", "user-stated") }, decisionTags: { s2: tag("approval", "user-stated") } }
  );
  const seam = model.seams[0];
  assert.equal(seam.friction.value, "low", "no toil signal => low friction");
  assert.equal(seam.criticality.value, "high", "criticality stays high regardless of low friction");
});

test("additive: a friction-only seam leaves latency/criticality undefined and renders byte-identical (no dims row)", () => {
  const model = pureSandbox().buildWorkflowLeverage(
    [S("s1", { name: "Pull", tool: "Excel" }), S("s2", { name: "Post", tool: "Excel" })], {}
  );
  const seam = model.seams[0];
  assert.equal(seam.latency, undefined, "no wait signal => latency undefined");
  assert.equal(seam.criticality, undefined, "not human-held => criticality undefined");
  assert.ok(isDim(seam.friction), "friction is still present");
  // render: no three-dim chip row appears for a friction-only seam
  const html = renderSandbox({ steps: [{ id: "s1", name: "Pull", cells: { systemsTools: { value: "Excel" } } }, { id: "s2", name: "Post", cells: { systemsTools: { value: "Excel" } } }] }).leverageMapHtml();
  assert.ok(html.includes("Leverage Map"), "the map renders");
  assert.ok(!/friction (low|medium|high)/i.test(html), "no dims chip row when latency+criticality are absent (byte-identical)");
});

test("render: all three dims appear as chips when present, reusing existing hues + source-dots", () => {
  const html = renderSandbox({
    steps: [{ id: "s1", name: "Reconcile", cells: { systemsTools: { value: "Excel" } } }, { id: "s2", name: "Approve", cells: { systemsTools: { value: "Excel" } } }],
    frictionTags: { s1: tag("manual-entry", "ai-inferred") },
    handoffTags: { "h:s1>s2": tag("role-to-role", "user-stated") },
    decisionTags: { s2: tag("approval", "user-stated") },
  }).leverageMapHtml();
  assert.match(html, /friction high/);
  assert.match(html, /latency medium/);
  assert.match(html, /criticality high/);
  assert.ok(!/gradient/i.test(html), "flat hues only — no gradient on the data surface");
});

test("rails: generated seam text passes on the workbench surface (engine railCheck) and carries no banned vocabulary", () => {
  const model = pureSandbox().buildWorkflowLeverage(
    [S("s1", { name: "Reconcile", tool: "Excel" }), S("s2", { name: "Approve", tool: "Excel" })],
    { frictionTags: { s1: tag("manual-entry", "ai-inferred") }, handoffTags: { "h:s1>s2": tag("role-to-role", "user-stated") }, decisionTags: { s2: tag("approval", "user-stated") } }
  );
  const seam = model.seams[0];
  const text = `${seam.assist}. ${seam.evidence.join("; ")}. friction ${seam.friction.value} latency ${seam.latency.value} criticality ${seam.criticality.value}.`;
  assert.equal(engine.railCheck(text, "workbench").ok, true, JSON.stringify(engine.railCheck(text, "workbench").violations));
  assert.ok(!FORBIDDEN.test(text), "no banned economics vocabulary in seam text");
});
