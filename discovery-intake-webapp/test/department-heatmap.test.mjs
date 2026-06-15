// V3-19 — Department heatmap (closes the structural axis). Executed, deterministic
// tests (NO model call — the heatmap is a pure derived VIEW over the saved session
// library). Built to docs/roadmap/V3-19-uncertainty-language.md + V3-18-role-model.md.
// Covers: aggregation by role across workflows; the three provenance states always
// distinguished via source-dot; the LEAST-ASSERTED rollup (any inferred => inferred);
// inferred rendered un-asserted (AI-grey), never as a stated value; tiles carry
// hue + shade + a text label (never color-only); human-hold = reserved Human Pink,
// nothing automatable; an always-on legend; LEVERAGE-only (no headcount/FTE/auto-%);
// opportunity + scorers untouched (functional + source-level); byte-identical when
// unused; no new color / no gradient. Real shipped source extracted/evaluated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

// Pure aggregation (workflows passed as an argument).
function aggSandbox() {
  return buildSandbox(source, {
    consts: ["ROLE_VALUES", "STEP_TYPE_OPTIONS", "FRICTION_KINDS", "HANDOFF_KINDS"],
    functions: ["buildDepartmentHeatmap", "structuralTagOf", "isInAllowedSet", "leastAssertedState", "provenanceToState", "strengthLevel"]
  });
}

// Pure helpers.
function helperSandbox() {
  return buildSandbox(source, { functions: ["leastAssertedState", "provenanceToState", "strengthLevel"] });
}

// The render, fed a stubbed session library. Const order matters: HUMAN_HOLD_HUE is
// referenced inside HEATMAP_WORK_TYPE_HUES, so it must be declared first.
function renderSandbox(library) {
  return buildSandbox(source, {
    consts: ["ROLE_VALUES", "STEP_TYPE_OPTIONS", "FRICTION_KINDS", "HANDOFF_KINDS", "HEATMAP_STATE_DOTS", "HUMAN_HOLD_HUE", "HEATMAP_WORK_TYPE_HUES"],
    functions: ["departmentHeatmapHtml", "buildDepartmentHeatmap", "collectStructuralWorkflows", "structuralTagOf", "isInAllowedSet", "leastAssertedState", "provenanceToState", "strengthLevel", "heatmapSourceDot", "heatmapLegendHtml", "heatmapTileHtml", "escapeHtml"],
    globals: { getCombinedSessionLibrary: () => library }
  });
}

const tag = (value, source, confidence) => ({ value, source, confidence: confidence != null ? confidence : (source === "user-stated" ? 1 : 0.6) });
const wf = (id, steps, roleTags, stepTypes, frictionTags, handoffTags) => ({ id, name: id, steps, roleTags, stepTypes: stepTypes || {}, frictionTags: frictionTags || {}, handoffTags: handoffTags || {} });
const libEntry = (id, st) => ({ sessionId: id, workflowName: id, state: st });

// Shared render fixture: operations (data-op stated, judgment ai-inferred = human-held),
// review-approval (review stated); friction on a1; one handoff a1>a2.
const RENDER_LIB = [
  libEntry("wfA", {
    workflowGrid: { steps: [
      { id: "a1", cells: { name: { value: "Collect" } } },
      { id: "a2", cells: { name: { value: "Decide" } } },
      { id: "a3", cells: { name: { value: "Check" } } }
    ] },
    roleTags: { a1: tag("operations", "user-stated"), a2: tag("operations", "user-stated"), a3: tag("review-approval", "user-stated") },
    stepTypes: { a1: tag("data-op", "user-stated"), a2: tag("judgment", "ai-inferred"), a3: tag("review", "user-stated") },
    frictionTags: { a1: tag("manual-entry", "user-stated") },
    handoffTags: { "h:a1>a2": tag("role-to-role", "user-stated") }
  })
];

test("aggregation is correct across roles AND across workflows; all three provenance states appear", () => {
  const agg = aggSandbox();
  const A = wf("wfA",
    [{ id: "a1", cells: { name: { value: "Collect" } } }, { id: "a2", cells: { name: { value: "Verify" } } }, { id: "a3", cells: { name: { value: "Judge" } } }],
    { a1: tag("operations", "user-stated"), a2: tag("review-approval", "user-stated"), a3: tag("operations", "user-stated") },
    { a1: tag("data-op", "user-stated"), a2: tag("review", "user-stated"), a3: tag("judgment", "ai-inferred") },
    { a1: tag("manual-entry", "user-stated") },
    { "h:a1>a2": tag("role-to-role", "user-stated") }
  );
  const B = wf("wfB",
    [{ id: "b1", cells: { name: { value: "Pull" } } }],
    { b1: tag("operations", "user-stated") },
    { b1: tag("data-op", "ai-inferred") }
  );
  const model = agg.buildDepartmentHeatmap([A, B]);
  assert.deepEqual(model.rows.map((r) => r.role).sort(), ["operations", "review-approval"]);
  const ops = model.rows.find((r) => r.role === "operations");
  assert.equal(ops.footprint.count, 3, "operations owns a1, a3, b1");
  assert.equal(ops.footprint.state, "computed", "footprint is a COMPUTED rollup");
  assert.equal(ops.workflowCount, 2, "across 2 workflows");
  const opsDataOp = ops.tiles.find((t) => t.workType === "data-op");
  assert.equal(opsDataOp.count, 2, "a1 + b1 are data-op");
  assert.equal(opsDataOp.state, "inferred", "a1 stated + b1 inferred → least-asserted = inferred");
  assert.equal(ops.friction.count, 1, "a1 is friction-tagged");
  assert.equal(ops.friction.state, "stated");
  assert.equal(ops.handoffs.count, 1, "h:a1>a2 touches operations (a1)");
  assert.equal(ops.handoffs.state, "computed");
  const rev = model.rows.find((r) => r.role === "review-approval");
  assert.equal(rev.handoffs.count, 1, "h:a1>a2 also touches review-approval (a2)");
});

test("ROLLUP least-asserted rule: a cell mixing stated + inferred renders INFERRED; all-stated renders STATED", () => {
  const agg = aggSandbox();
  const mixed = agg.buildDepartmentHeatmap([wf("w",
    [{ id: "s1", cells: {} }, { id: "s2", cells: {} }],
    { s1: tag("operations", "user-stated"), s2: tag("operations", "user-stated") },
    { s1: tag("data-op", "user-stated"), s2: tag("data-op", "ai-inferred") }
  )]);
  assert.equal(mixed.rows[0].tiles.find((t) => t.workType === "data-op").state, "inferred", "any inferred content ⇒ inferred");
  const allStated = agg.buildDepartmentHeatmap([wf("w",
    [{ id: "s1", cells: {} }],
    { s1: tag("operations", "user-stated") },
    { s1: tag("review", "user-stated") }
  )]);
  assert.equal(allStated.rows[0].tiles.find((t) => t.workType === "review").state, "stated", "all-stated ⇒ stated");
});

test("helpers: leastAssertedState (inferred<computed<stated, empty→null), provenanceToState, strengthLevel", () => {
  const h = helperSandbox();
  assert.equal(h.leastAssertedState(["stated", "inferred"]), "inferred");
  assert.equal(h.leastAssertedState(["stated", "computed"]), "computed");
  assert.equal(h.leastAssertedState(["stated", "stated"]), "stated");
  assert.equal(h.leastAssertedState([]), null);
  assert.equal(h.provenanceToState("ai-inferred"), "inferred");
  assert.equal(h.provenanceToState("user-stated"), "stated");
  assert.equal(h.provenanceToState("user-edited"), "stated");
  assert.equal(h.provenanceToState("doc-extracted"), "computed");
  assert.equal(h.strengthLevel(0), 0);
  assert.equal(h.strengthLevel(1), 1);
  assert.equal(h.strengthLevel(3), 2);
  assert.equal(h.strengthLevel(9), 3);
});

test("a tile carries hue + shade + a TEXT label (never color-only); an empty tile shows a '·' label", () => {
  const sb = renderSandbox([]);
  const t = sb.heatmapTileHtml({ workType: "data-op", count: 3, strength: 2, state: "stated", humanHeld: false });
  assert.match(t, /data-op/, "the work-type text label is present (never color-only)");
  assert.match(t, />3</, "the count text label is present");
  assert.match(t, /#00d4b47a/, "hue + shade (alpha) background present");
  const empty = sb.heatmapTileHtml({ workType: "review", count: 0, strength: 0, state: null, humanHeld: false });
  assert.match(empty, /review/, "an empty tile still carries the work-type text label");
  assert.match(empty, /·/, "empty tile shows a · label, never color-only");
});

test("the three provenance states are always distinguished via the source-dot; INFERRED is the AI-grey dot, never the stated teal", () => {
  const sb = renderSandbox(RENDER_LIB);
  const html = sb.departmentHeatmapHtml();
  assert.match(html, /background:#00d4b4;/, "STATED → Cyan Trace dot");
  assert.match(html, /background:#3b82f6;/, "COMPUTED → Electric Blue dot (footprint/handoffs)");
  assert.match(html, /background:#5b7186;/, "INFERRED → Signal Gray (AI-grey) dot");
  // The judgment cell (a2) is ai-inferred → its source-dot is grey, the un-asserted
  // treatment — proven at the model level so it can't be the stated teal.
  const model = sb.buildDepartmentHeatmap([{ id: "wfA", name: "wfA",
    steps: [{ id: "a2", cells: {} }], roleTags: { a2: tag("operations", "user-stated") }, stepTypes: { a2: tag("judgment", "ai-inferred") }, frictionTags: {}, handoffTags: {} }]);
  assert.equal(model.rows[0].tiles.find((t) => t.workType === "judgment").state, "inferred", "inferred stays inferred — never promoted to stated");
});

test("human-hold (judgment) uses the reserved Human Pink and implies nothing automatable", () => {
  const sb = renderSandbox(RENDER_LIB);
  const html = sb.departmentHeatmapHtml();
  assert.match(html, /human-hold/, "human-hold is labelled");
  assert.match(html, /#FF4FD8/, "Human Pink is used for human-hold");
  const agg = aggSandbox();
  const model = agg.buildDepartmentHeatmap([wf("w", [{ id: "s1", cells: {} }], { s1: tag("operations", "user-stated") }, { s1: tag("judgment", "user-stated") })]);
  assert.equal(model.rows[0].tiles.find((t) => t.workType === "judgment").humanHeld, true, "the judgment tile is flagged human-held");
  assert.ok(!/headcount|\bFTE\b|automatable|% *automat|percent *automat|automation +(potential|rate)/i.test(html), "human-hold never implies a role is automatable; no headcount/FTE/%");
});

test("an always-on legend maps the three source-dots + human-hold", () => {
  const sb = renderSandbox(RENDER_LIB);
  const legend = sb.heatmapLegendHtml();
  for (const word of ["stated", "computed", "inferred", "human-hold"]) assert.match(legend, new RegExp(word), `legend names ${word}`);
  for (const hex of ["#00d4b4", "#3b82f6", "#5b7186", "#FF4FD8"]) assert.ok(legend.includes(hex), `legend shows ${hex}`);
  assert.match(sb.departmentHeatmapHtml(), /hm-legend/, "the heatmap always renders the legend");
});

test("byte-identical when unused: empty library → ''; a library with steps but no role tags → ''; empty aggregation → no rows", () => {
  assert.equal(renderSandbox([]).departmentHeatmapHtml(), "", "no saved workflow → ''");
  const noRole = renderSandbox([libEntry("w", { workflowGrid: { steps: [{ id: "s1", cells: {} }] }, roleTags: {}, stepTypes: { s1: tag("data-op", "user-stated") } })]);
  assert.equal(noRole.departmentHeatmapHtml(), "", "no role tagged (role is the row key) → ''");
  assert.deepEqual(aggSandbox().buildDepartmentHeatmap([]).rows, [], "empty aggregation → no rows");
});

test("shade carries strength within one hue (never a gradient); meaning-colors are locked Signal Glass hexes (no new color)", () => {
  const sb = renderSandbox(RENDER_LIB);
  const html = sb.departmentHeatmapHtml();
  assert.ok(!/gradient/i.test(html), "strength is a shade ramp, never a gradient");
  assert.deepEqual(extractConst(source, "HEATMAP_STATE_DOTS").match(/#[0-9a-fA-F]{6}/g).sort(), ["#00d4b4", "#3b82f6", "#5b7186"].sort(), "source-dots reuse locked hexes");
  assert.ok(/#FF4FD8/.test(extractConst(source, "HUMAN_HOLD_HUE")), "human-hold reuses the locked pink");
  const hues = extractConst(source, "HEATMAP_WORK_TYPE_HUES");
  const allowed = ["#a855f7", "#06b6d4", "#00d4b4", "#f59e0b"];
  (hues.match(/#[0-9a-fA-F]{6}/g) || []).forEach((hex) => assert.ok(allowed.includes(hex), `${hex} is a locked work-type hue (judgment uses HUMAN_HOLD_HUE)`));
});

test("rendering the heatmap never changes opportunity and mutates nothing it reads", () => {
  const getStepOpportunityMeta = eval(`(${extractFunction(source, "getStepOpportunityMeta")})`);
  const step = { id: "s1", cells: { name: { value: "Reconcile balances", state: "confirmed", confidence: 0.9 }, frequencyVolume: { value: "daily", state: "confirmed", confidence: 0.9 }, dataProcessing: { value: "copy rows", state: "confirmed", confidence: 0.8 } } };
  const before = getStepOpportunityMeta(step);
  const libCopy = JSON.parse(JSON.stringify(RENDER_LIB));
  const sb = renderSandbox(RENDER_LIB);
  sb.departmentHeatmapHtml();
  assert.deepEqual(getStepOpportunityMeta(step), before, "opportunity is unchanged by the heatmap render");
  assert.deepEqual(RENDER_LIB, libCopy, "the heatmap mutates nothing it reads");
});

test("source-level: the scorers and the IR builder never reference heatmap state", () => {
  for (const fn of ["getStepOpportunityMeta", "stepTrustSignals", "scoreRecipeReadiness", "buildAgentRecipeIr"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/buildDepartmentHeatmap|collectStructuralWorkflows|departmentHeatmapHtml|leastAssertedState|HEATMAP_/.test(body), `${fn} must not reference heatmap state`);
  }
});

test("the heatmap path never feeds a scorer, writes no grid/state, makes no model call (pure derived view)", () => {
  for (const fn of ["buildDepartmentHeatmap", "collectStructuralWorkflows", "departmentHeatmapHtml", "heatmapTileHtml", "heatmapSourceDot", "heatmapLegendHtml", "leastAssertedState", "provenanceToState", "strengthLevel"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/getStepOpportunityMeta|scoreRecipeReadiness|buildAgentRecipeIr/.test(body), `${fn}: never calls a scorer`);
    assert.ok(!/patchField/.test(body), `${fn}: no grid write`);
    assert.ok(!/persistState/.test(body), `${fn}: pure read — no persist`);
    assert.ok(!/recordTelemetry|\/api\/|requestJson/.test(body), `${fn}: no telemetry / server / model call`);
  }
});

test("LEVERAGE-only: no headcount / FTE / automatable-% anywhere in the heatmap model, labels, or consts", () => {
  const blob = [
    extractConst(source, "HEATMAP_STATE_DOTS"), extractConst(source, "HUMAN_HOLD_HUE"), extractConst(source, "HEATMAP_WORK_TYPE_HUES"),
    extractFunction(source, "buildDepartmentHeatmap"), extractFunction(source, "departmentHeatmapHtml"),
    extractFunction(source, "heatmapTileHtml"), extractFunction(source, "heatmapLegendHtml"), extractFunction(source, "heatmapSourceDot")
  ].join("\n");
  assert.ok(!/headcount|\bFTE\b|full-time equivalent|automatable|% *automat|percent *automat|automation +(potential|rate)/i.test(blob), "the heatmap never expresses headcount / FTE / automatable-%");
});

test("no firm names / banned phrase in the new heatmap code", () => {
  const blob = [
    extractFunction(source, "buildDepartmentHeatmap"), extractFunction(source, "collectStructuralWorkflows"),
    extractFunction(source, "departmentHeatmapHtml"), extractFunction(source, "heatmapTileHtml"),
    extractFunction(source, "heatmapLegendHtml"), extractFunction(source, "heatmapSourceDot")
  ].join("\n");
  assert.ok(!/work with your development team/i.test(blob), "banned phrase absent");
  assert.ok(!/compliance approved|approved for use/i.test(blob), "no compliance-approval claims");
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i.test(blob), "no firm names");
});
