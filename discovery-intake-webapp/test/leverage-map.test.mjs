// Leverage Map (b6) — per-step AND per-connection "AI assist traction". Executed,
// deterministic tests (NO model call — the map is a PURE derived VIEW over the
// CURRENT workflow's captured shape). Option A: seams are first-class from v1.
// Covers: per-step leverage read from the shape; the four seam motivators, each
// EARNED by a captured commonality (no commonality => no seam, never "score every
// pair"); recall-biased surfacing (one signal still surfaces a lo candidate);
// human-hold inherited by an adjacent seam (AI routes, the person approves);
// tiles carry one hue + a shade + a lo/md/hi TEXT label (never color-only, never a
// gradient); provenance worn via the heatmap source-dots (inferred input => grey);
// byte-identical when unused; LEVERAGE framing (the word "leverage" IS the intended
// framing here and is permitted — but no headcount/FTE/automation/ROI/hours-saved/
// opportunity); separation from the opportunity scorer (no cross-reference, output
// unchanged); no new color; no firm names. Real shipped source extracted/evaluated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

// Permits "leverage" (the feature's framing); bans the headcount / automation /
// opportunity family — modeled on recipe-book.test.mjs, NOT discovery-final-sweep
// (whose FORBIDDEN bans "leverage" because that is descriptive-capture copy).
const FORBIDDEN = /headcount|\bFTE\b|full-time equivalent|automat|% *automat|\bROI\b|hours saved|time saved|\bopportunity\b/i;
const LOCKED_HEXES = ["#0c1726", "#16263a", "#e2e8f0", "#7a93b4", "#8aa0b8", "#cfe0f2", "#ff4fc8", "#3f5878", "#3b82f6"];

const tag = (value, src, confidence) => ({ value, source: src, confidence: confidence != null ? confidence : (src === "user-stated" ? 1 : 0.6) });
// A shaped step for the PURE builder.
const S = (id, opts = {}) => ({ id, name: opts.name || id, tool: opts.tool || "", channel: opts.channel || "", accessMode: opts.accessMode || "", hasHumanCheckpoint: Boolean(opts.hasHumanCheckpoint) });

// Pure builder + helpers (steps passed as an argument; no DOM, no state).
function pureSandbox() {
  return buildSandbox(source, {
    consts: ["STEP_TYPE_OPTIONS", "FRICTION_KINDS", "HANDOFF_KINDS", "ROLE_VALUES", "DECISION_KINDS"],
    functions: [
      "buildWorkflowLeverage", "leverageSeamMotivators", "leverageToolTokens", "leverageManualChannel",
      "leverageLevelFor", "leverageStepHumanHeld", "seamMotivatorPhrase",
      "structuralTagOf", "isInAllowedSet", "leastAssertedState", "provenanceToState", "handoffId"
    ]
  });
}

// The render, fed a stubbed current workflow (grid steps + the four sidecars).
function renderSandbox({ steps = [], stepTypes = {}, frictionTags = {}, roleTags = {}, handoffTags = {}, decisionTags = {} } = {}) {
  const state = { stepTypes, frictionTags, roleTags, handoffTags, decisionTags };
  return buildSandbox(source, {
    consts: ["STEP_TYPE_OPTIONS", "FRICTION_KINDS", "HANDOFF_KINDS", "ROLE_VALUES", "DECISION_KINDS", "HEATMAP_STATE_DOTS", "HUMAN_HOLD_HUE", "LEVERAGE_HUE", "LEVERAGE_LEVELS", "LEVERAGE_SHADE"],
    functions: [
      "leverageMapHtml", "buildWorkflowLeverage", "leverageSeamMotivators", "leverageToolTokens", "leverageManualChannel",
      "leverageLevelFor", "leverageStepHumanHeld", "seamMotivatorPhrase", "leverageTileHtml",
      "structuralTagOf", "isInAllowedSet", "leastAssertedState", "provenanceToState", "handoffId",
      "heatmapSourceDot", "heatmapLegendHtml", "escapeHtml"
    ],
    globals: {
      state,
      analysisGridSteps: () => steps,
      gridCellValue: (step, key) => ((step && step.cells && step.cells[key] && step.cells[key].value) || ""),
      stepDisplayName: (step, i) => (step && step.name) || `Step ${i + 1}`
    }
  });
}

test("per-step leverage reads the shape: data-op + reducible friction + a tool => hi; evidence names the signals; provenance is the least-asserted input", () => {
  const model = pureSandbox().buildWorkflowLeverage(
    [S("s1", { name: "Reconcile", tool: "Excel" })],
    { stepTypes: { s1: tag("data-op", "user-stated") }, frictionTags: { s1: tag("manual-entry", "ai-inferred") } }
  );
  assert.equal(model.steps.length, 1);
  const s = model.steps[0];
  assert.equal(s.level, "hi", "data-op + manual-entry + a tool = 3 signals => hi");
  assert.equal(s.state, "inferred", "the friction is ai-inferred => least-asserted => inferred (wears its uncertainty)");
  const ev = s.evidence.join(" ");
  assert.ok(/data-op/.test(ev) && /manual-entry/.test(ev) && /Excel/.test(ev), "evidence names each motivating signal");
  assert.equal(s.humanHeld, false);
  assert.match(s.assist, /assist this step/);
});

test("a judgment step is human-held: assist + verify framing, and human-hold never LOWERS the level", () => {
  const model = pureSandbox().buildWorkflowLeverage(
    [S("s1", { name: "Approve", tool: "Workday" })],
    { stepTypes: { s1: tag("judgment", "user-stated") }, frictionTags: { s1: tag("rework", "user-stated") } }
  );
  const s = model.steps[0];
  assert.equal(s.humanHeld, true);
  assert.match(s.assist, /the person decides/);
  assert.equal(s.level, "md", "rework + tool = 2 signals => md; the human-hold does not lower it");
});

test("seam discipline: a boundary with NO captured commonality yields NO seam (never 'score every pair')", () => {
  const model = pureSandbox().buildWorkflowLeverage(
    [S("s1", { tool: "Excel" }), S("s2", { tool: "Salesforce" })],
    {}
  );
  assert.deepEqual(model.seams, [], "different tools, no channel, no friction, no transition => no seam");
});

test("each of the four motivators earns a seam (shared tool / manual channel / system-switching / classified transition)", () => {
  const sb = pureSandbox();

  const sharedTool = sb.buildWorkflowLeverage([S("a", { tool: "Excel" }), S("b", { tool: "Excel, Outlook" })], {});
  assert.equal(sharedTool.seams.length, 1);
  assert.ok(sharedTool.seams[0].motivators.includes("shared-tool"));

  const manual = sb.buildWorkflowLeverage([S("a", { tool: "Excel", channel: "export the file and email it over" }), S("b", { tool: "SAP" })], {});
  assert.ok(manual.seams.length === 1 && manual.seams[0].motivators.includes("manual-channel"));

  const sysSwitch = sb.buildWorkflowLeverage([S("a"), S("b")], { frictionTags: { a: tag("system-switching", "user-stated") } });
  assert.ok(sysSwitch.seams.length === 1 && sysSwitch.seams[0].motivators.includes("system-switching"));

  const transition = sb.buildWorkflowLeverage([S("a"), S("b")], { handoffTags: { "h:a>b": tag("human-to-system", "ai-inferred") } });
  assert.ok(transition.seams.length === 1 && transition.seams[0].motivators.includes("transition"));
  assert.equal(transition.seams[0].state, "inferred", "an ai-inferred transition => the seam wears the grey/inferred state");
});

test("recall-biased: a single present commonality still surfaces a (lo) candidate seam for the human to prune", () => {
  const model = pureSandbox().buildWorkflowLeverage([S("a", { tool: "Excel" }), S("b", { tool: "excel" })], {});
  assert.equal(model.seams.length, 1);
  assert.equal(model.seams[0].level, "lo", "one motivator => lo (surfaced, not hidden)");
});

test("a seam INHERITS the human-hold from either step (an approval decision, or a judgment step) => AI routes, the person approves", () => {
  const sb = pureSandbox();

  const approval = sb.buildWorkflowLeverage(
    [S("a", { tool: "Excel" }), S("b", { tool: "Excel" })],
    { decisionTags: { b: tag("approval", "user-stated") } }
  );
  assert.equal(approval.seams.length, 1, "the shared tool earns the seam");
  assert.equal(approval.seams[0].humanHeld, true, "the approval decision on b => human-held seam");
  assert.match(approval.seams[0].assist, /the person approves/);

  const heldStep = sb.buildWorkflowLeverage(
    [S("a", { tool: "Excel" }), S("b", { tool: "Excel" })],
    { stepTypes: { b: tag("judgment", "user-stated") } }
  );
  assert.equal(heldStep.seams[0].humanHeld, true, "a judgment step on the boundary => the seam inherits the hold");
});

test("a leverage tile carries one hue + a shade + a lo/md/hi TEXT label (never color-only, never a gradient)", () => {
  const sb = renderSandbox();
  const hi = sb.leverageTileHtml("hi", "stated", false);
  assert.match(hi, />hi</, "the lo/md/hi text label is present (never color-only)");
  assert.match(hi, /#3b82f6b3/, "computed-blue hue + hi shade (alpha) — one hue, a discrete shade");
  assert.ok(!/gradient/i.test(hi), "a shade, never a gradient");
  const held = sb.leverageTileHtml("md", "inferred", true);
  assert.match(held, /#ff4fc8/, "a human-held tile uses the reserved Human Pink");
});

test("the rendered map shows By step + By connection, the always-on source-dot legend, and the inferred grey dot", () => {
  const html = renderSandbox({
    steps: [
      { id: "s1", name: "Pull", cells: { systemsTools: { value: "Excel" }, handoff: { value: "export and email the file" } } },
      { id: "s2", name: "Post", cells: { systemsTools: { value: "Excel" } } }
    ],
    stepTypes: { s1: tag("data-op", "user-stated") },
    frictionTags: { s1: tag("manual-entry", "ai-inferred") },
    handoffTags: { "h:s1>s2": tag("role-to-role", "ai-inferred") }
  }).leverageMapHtml();
  assert.match(html, /By step/);
  assert.match(html, /By connection/);
  assert.match(html, /hm-legend/, "reuses the always-on source-dot legend");
  assert.match(html, /Pull/);
  assert.match(html, /background:#5b7186;/, "an ai-inferred input renders the grey / inferred source-dot");
  assert.match(html, /Shared system \(excel\)/i, "the seam evidence is assist-framed and names the shared tool");
});

test("byte-identical when unused: no steps => ''; steps with no shape (no tags, no tool) => ''", () => {
  assert.equal(renderSandbox({ steps: [] }).leverageMapHtml(), "", "no steps => ''");
  const noShape = renderSandbox({ steps: [{ id: "s1", name: "X", cells: {} }, { id: "s2", name: "Y", cells: {} }] });
  assert.equal(noShape.leverageMapHtml(), "", "steps but no tags + no tools + no seam => ''");
  const empty = pureSandbox().buildWorkflowLeverage([], {});
  assert.deepEqual(empty.steps, []);
  assert.deepEqual(empty.seams, []);
});

test("helpers: tool tokenization, manual-channel detection, level mapping", () => {
  const sb = pureSandbox();
  assert.deepEqual(sb.leverageToolTokens("Excel, Outlook").sort(), ["excel", "outlook"]);
  assert.deepEqual(sb.leverageToolTokens(""), []);
  assert.equal(sb.leverageManualChannel("export to a file and email it"), true);
  assert.equal(sb.leverageManualChannel("direct system access"), false);
  assert.equal(sb.leverageLevelFor(0), "lo");
  assert.equal(sb.leverageLevelFor(2), "md");
  assert.equal(sb.leverageLevelFor(3), "hi");
});

test("LEVERAGE framing only: no headcount / FTE / automation / ROI / hours-saved / opportunity in the module (the word 'leverage' IS permitted here)", () => {
  const blob = [
    extractConst(source, "LEVERAGE_HUE"), extractConst(source, "LEVERAGE_LEVELS"), extractConst(source, "LEVERAGE_SHADE"),
    extractFunction(source, "buildWorkflowLeverage"), extractFunction(source, "leverageMapHtml"),
    extractFunction(source, "leverageTileHtml"), extractFunction(source, "seamMotivatorPhrase"),
    extractFunction(source, "leverageSeamMotivators"), extractFunction(source, "renderAnalysisTabLeverage")
  ].join("\n");
  assert.ok(!FORBIDDEN.test(blob), "no banned leverage-economics language");
  assert.match(blob, /leverage/i, "the feature's intended 'leverage' framing is present and permitted");
});

test("separation: the Leverage Map references no scorer; the scorers reference no leverage; opportunity output is unchanged by a render", () => {
  for (const fn of ["buildWorkflowLeverage", "leverageMapHtml", "leverageSeamMotivators", "leverageTileHtml", "renderAnalysisTabLeverage", "seamMotivatorPhrase"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/getStepOpportunityMeta|principleScores|scoreRecipeReadiness|buildAgentRecipeIr/.test(body), `${fn} must not touch a scorer`);
    assert.ok(!/patchField|persistState/.test(body), `${fn}: pure read — no grid write / persist`);
    assert.ok(!/recordTelemetry|\/api\/|requestJson/.test(body), `${fn}: no telemetry / server / model call`);
  }
  for (const fn of ["getStepOpportunityMeta", "stepTrustSignals", "scoreRecipeReadiness", "buildAgentRecipeIr"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/buildWorkflowLeverage|leverageMapHtml|LEVERAGE_/.test(body), `${fn} must not reference the leverage map`);
  }
  const getStepOpportunityMeta = eval(`(${extractFunction(source, "getStepOpportunityMeta")})`);
  const step = { id: "s1", cells: { name: { value: "Reconcile balances", state: "confirmed", confidence: 0.9 }, frequencyVolume: { value: "daily", state: "confirmed", confidence: 0.9 }, dataProcessing: { value: "copy rows", state: "confirmed", confidence: 0.8 } } };
  const before = getStepOpportunityMeta(step);
  renderSandbox({ steps: [{ id: "s1", name: "Reconcile", cells: { systemsTools: { value: "Excel" } } }], stepTypes: { s1: tag("data-op", "user-stated") } }).leverageMapHtml();
  assert.deepEqual(getStepOpportunityMeta(step), before, "opportunity scoring is untouched by the leverage render");
});

test("mints no new color: every hex in the Leverage Map is a locked-palette hex; no gradient on the data surface", () => {
  const blob = [
    extractConst(source, "LEVERAGE_HUE"), extractConst(source, "LEVERAGE_SHADE"),
    extractFunction(source, "leverageTileHtml"), extractFunction(source, "leverageMapHtml"), extractFunction(source, "renderAnalysisTabLeverage")
  ].join("\n");
  (blob.match(/#[0-9a-fA-F]{6}/g) || []).forEach((hex) => assert.ok(LOCKED_HEXES.includes(hex.toLowerCase()), `${hex} must be a locked-palette hex`));
  assert.ok(!/gradient/i.test(blob), "strength is a shade ramp, never a gradient");
});

test("no firm names, no banned phrase, no compliance-approval claim in the Leverage Map code", () => {
  const blob = ["buildWorkflowLeverage", "leverageMapHtml", "leverageSeamMotivators", "seamMotivatorPhrase", "leverageTileHtml", "renderAnalysisTabLeverage"]
    .map((fn) => extractFunction(source, fn)).join("\n");
  assert.ok(!/work with your development team/i.test(blob), "banned phrase absent");
  assert.ok(!/compliance approved|approved for use/i.test(blob), "no compliance-approval claims");
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i.test(blob), "no firm names");
});
