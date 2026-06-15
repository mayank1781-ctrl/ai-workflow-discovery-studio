// Recipe Book — "by connection" view (Option A seams). Executed, deterministic tests
// (NO model call — the view reads existing recipe data and CONSUMES the Leverage Map's
// per-seam signal). Covers: the view consumes buildWorkflowLeverage's seams and does NOT
// re-detect them (no commonality => no connection); a connection recipe is resolved
// through the SINGLE source boundary (recipeUnitSource), generation-backed today and a
// one-point swap to a trusted library later; the recipe unit is a connection, not step-
// locked (Option A), and every emitted value carries {value, source, confidence}; the
// human-hold is INHERITED from the seam (a held adjacent decision step) => assist-not-
// replace, the reserved Human Pink, never "eliminate", and the level is never lowered;
// provenance reuses the merged .prov classes (AI grey, never auto-hardens); the view is
// never a dead end; and the rails hold (no banned economics tokens, no gradient, no firm
// names; "leverage" framing is permitted here). Real shipped source extracted/evaluated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// Permits "leverage" (the signal this view consumes); bans the economics family.
const FORBIDDEN = /headcount|\bFTE\b|full-time equivalent|automat|\bROI\b|hours? saved|time saved|\bopportunity\b/i;
const HUMAN_PINK = /#ff4fc8/i;

const tag = (value, src, confidence) => ({ value, source: src, confidence: confidence != null ? confidence : (src === "user-stated" ? 1 : 0.6) });
// A shaped grid step (cells carry {value}); the connection view reads tool + handoff.
const GS = (id, opts = {}) => ({ id, name: opts.name || id, cells: { systemsTools: { value: opts.tool || "" }, handoff: { value: opts.channel || "" }, humanCheckpoint: { value: opts.checkpoint || "" } } });
// A seam as the Leverage Map emits it (for the pure recipeForConnection tests).
const SEAM = (opts = {}) => ({ fromId: opts.fromId || "a", fromName: opts.fromName || "A", toId: opts.toId || "b", toName: opts.toName || "B", level: opts.level || "lo", state: opts.state || "computed", humanHeld: Boolean(opts.humanHeld), motivators: opts.motivators || ["shared-tool"] });

function sandbox({ recipeCache = {}, recipeBookView = "connection", steps = [], stepTypes = {}, frictionTags = {}, roleTags = {}, handoffTags = {}, decisionTags = {} } = {}) {
  const state = { recipeCache, recipeBookView, stepTypes, frictionTags, roleTags, handoffTags, decisionTags };
  return buildSandbox(source, {
    consts: [
      "STEP_TYPE_OPTIONS", "FRICTION_KINDS", "HANDOFF_KINDS", "ROLE_VALUES", "DECISION_KINDS",
      "LEVERAGE_HUE", "LEVERAGE_LEVELS", "LEVERAGE_SHADE", "HUMAN_HOLD_HUE", "HEATMAP_STATE_DOTS",
      "RECIPE_STATUS_RAIL", "RECIPE_STATUS_META"
    ],
    functions: [
      "recipeUnitSource", "recipeUnitConfidence", "recipeConnectionSeams", "recipeForConnection",
      "recipeBookByConnection", "recipeBookConnectionCardHtml", "recipeBookConnectionSectionHtml",
      "recipeForStep", "recipeBookByStep", "recipeBookByStatus", "recipeBookHasAnyRecipe",
      "recipeStatusChipHtml", "recipeProvChipHtml", "recipeBookCardHtml", "recipeBookStatusGroupHtml",
      "recipeBookEmptyNoteHtml", "recipeBookHtml",
      "buildWorkflowLeverage", "leverageSeamMotivators", "seamMotivatorPhrase", "leverageToolTokens", "leverageManualChannel",
      "leverageLevelFor", "leverageStepHumanHeld", "leverageTileHtml",
      "structuralTagOf", "isInAllowedSet", "leastAssertedState", "provenanceToState", "handoffId",
      "heatmapSourceDot", "escapeHtml"
    ],
    globals: {
      state,
      analysisGridSteps: () => steps,
      gridCellValue: (step, key) => ((step && step.cells && step.cells[key] && step.cells[key].value) || ""),
      stepDisplayName: (step, i) => (step && step.name) || `Step ${i + 1}`,
      recipeGateCheck: (step) => ({ gaps: (step && step._gaps) || [], p9Unconfirmed: Boolean(step && step._p9) }),
      stepPrimaryPattern: (step) => (step && step._pattern) || ""
    }
  });
}

test("consumes the Leverage Map seam signal: a shared tool surfaces a connection; no commonality surfaces none (does NOT re-detect / score every pair)", () => {
  const surfaced = sandbox({ steps: [GS("s1", { tool: "Excel" }), GS("s2", { tool: "Excel, Outlook" })] }).recipeBookByConnection();
  assert.equal(surfaced.length, 1, "the shared tool earns exactly one connection");
  assert.equal(surfaced[0].connId, "h:s1>s2", "keyed by the handoffId");

  const none = sandbox({ steps: [GS("s1", { tool: "Excel" }), GS("s2", { tool: "Salesforce" })] }).recipeBookByConnection();
  assert.deepEqual(none, [], "no shared tool / channel / friction / transition => no connection row (absent, not 'lo')");
});

test("a connection recipe resolves through the source boundary: none cached => null (the card shows the add state); cached => present", () => {
  const seam = SEAM({ fromId: "s1", toId: "s2" });
  assert.equal(sandbox({ recipeCache: {} }).recipeForConnection(seam), null, "no cached recipe for the connection => null");
  const r = sandbox({ recipeCache: { "h:s1>s2": "Carry the reconciliation packet to approval." } }).recipeForConnection(seam);
  assert.ok(r, "a cached recipe for the connection id => a recipe");
  assert.equal(r.connId, "h:s1>s2");
});

test("Option A: the recipe unit is a connection (not step-locked) and carries {value, source, confidence}", () => {
  const r = sandbox({ recipeCache: { "h:s1>s2": "Carry the packet." } }).recipeForConnection(SEAM({ fromId: "s1", toId: "s2", state: "computed" }));
  assert.equal(r.kind, "connection", "the unit is a connection, not hard-locked to one step");
  assert.equal(r.value, "Carry the packet.", "value present");
  assert.equal(r.source, "ai-inferred", "source present (proposed rests on AI-inferred inputs)");
  assert.equal(typeof r.confidence, "number");
  assert.ok(r.confidence > 0 && r.confidence <= 1, "confidence in (0,1]");
});

test("human-hold is INHERITED from the seam: assist+verify framing, reserved Human Pink, NEVER 'eliminate', and the level is not lowered", () => {
  const sb = sandbox({ recipeCache: { "h:s1>s2": "Package the handoff." } });
  const held = sb.recipeForConnection(SEAM({ fromId: "s1", toId: "s2", level: "hi", humanHeld: true }));
  assert.equal(held.humanHeld, true);
  assert.match(held.assist, /the person approves/, "assist + verify: the person approves");
  assert.match(held.assist, /AI packages, drafts, and routes the handoff/);
  assert.ok(!/eliminate/i.test(held.assist), "never 'eliminate'");
  assert.equal(held.level, "hi", "the human-hold reframes, it never LOWERS the level");

  const free = sb.recipeForConnection(SEAM({ fromId: "s1", toId: "s2", level: "hi", humanHeld: false }));
  assert.match(free.assist, /AI can carry the handoff between these steps/);

  // The Human Pink renders on the held connection card; never on a free one.
  const heldCard = sb.recipeBookConnectionCardHtml({ seam: SEAM({ humanHeld: true }), connId: "h:s1>s2", fromName: "A", toName: "B", level: "hi", humanHeld: true, recipe: held });
  assert.match(heldCard, HUMAN_PINK, "a human-held connection wears the reserved Human Pink");
  assert.match(heldCard, /human-hold/);
});

test("end-to-end: the human-hold is read from a held adjacent DECISION step through the real Leverage Map signal", () => {
  // s2 carries an `approval` decision tag; buildWorkflowLeverage marks the s1->s2 seam
  // human-held, and the connection recipe inherits it — proving it reads the decision tag
  // via the signal, not a handoff tag.
  const sb = sandbox({
    steps: [GS("s1", { name: "Pull", tool: "Excel", channel: "export and email the file" }), GS("s2", { name: "Approve", tool: "Excel" })],
    decisionTags: { s2: tag("approval", "user-stated") },
    recipeCache: { "h:s1>s2": "Package and route the reconciliation packet to the approver." }
  });
  const rows = sb.recipeBookByConnection();
  assert.equal(rows.length, 1, "the shared tool + manual channel earn the seam");
  assert.equal(rows[0].humanHeld, true, "the approval decision on the adjacent step => human-held connection");
  assert.equal(rows[0].recipe.humanHeld, true, "the recipe inherits the hold");
  assert.match(rows[0].recipe.assist, /the person approves/);
});

test("provenance reuses the merged .prov classes and never auto-hardens: a proposed connection recipe reads AI grey", () => {
  const r = sandbox({ recipeCache: { "h:s1>s2": "x" } }).recipeForConnection(SEAM({ fromId: "s1", toId: "s2" }));
  assert.equal(r.status, "proposed");
  assert.equal(r.source, "ai-inferred", "proposed rests on AI-inferred inputs");
  const card = sandbox({ recipeCache: { "h:s1>s2": "x" } }).recipeBookConnectionCardHtml({ seam: SEAM(), connId: "h:s1>s2", fromName: "A", toName: "B", level: "lo", humanHeld: false, recipe: r });
  assert.match(card, /class="prov ai"/, "reuses the merged .prov.ai class (grey/inferred)");
  // The source boundary returns confirmed:false today — nothing auto-hardens to trusted.
  assert.equal(sandbox({ recipeCache: { "h:s1>s2": "x" } }).recipeUnitSource("h:s1>s2").confirmed, false);
});

test("confidence derives deterministically from the seam's provenance state (never a model number)", () => {
  const sb = sandbox();
  assert.equal(sb.recipeUnitConfidence("stated", false), 0.9);
  assert.equal(sb.recipeUnitConfidence("computed", false), 0.7);
  assert.equal(sb.recipeUnitConfidence("inferred", false), 0.5);
  assert.equal(sb.recipeUnitConfidence("anything", true), 1, "an explicitly confirmed unit reads full");
});

test("the recipe-source boundary is the SINGLE swap point: recipeForConnection routes through recipeUnitSource; only recipeUnitSource reads the cache", () => {
  const forConn = extractFunction(source, "recipeForConnection");
  assert.ok(/recipeUnitSource\(connId\)/.test(forConn), "the connection recipe is resolved THROUGH the boundary");
  assert.ok(!/recipeCache/.test(forConn), "recipeForConnection never reads the cache directly — only via the boundary");
  const boundary = extractFunction(source, "recipeUnitSource");
  assert.ok(/state\.recipeCache/.test(boundary), "today the boundary reads the generation cache");
  assert.ok(/origin: "generation"/.test(boundary), "today the origin is generation (a one-point swap to 'library' later)");
});

test("render: the By connection view surfaces the connection, the reused leverage tile, and the toggle — never a dead end with no recipe", () => {
  const html = sandbox({
    recipeBookView: "connection",
    steps: [GS("s1", { name: "Pull", tool: "Excel" }), GS("s2", { name: "Post", tool: "Excel" })]
  }).recipeBookHtml();
  assert.match(html, /data-recipe-book-view="connection"/, "the By connection toggle is present");
  assert.match(html, /Pull/);
  assert.match(html, /&rarr;/, "from -> to connection title");
  assert.match(html, /No recipe yet/, "an unfilled connection is never a dead end");
  assert.match(html, /lev-tile/, "reuses the Leverage Map tile");
});

test("render: an attached connection recipe shows its status, the merged .prov provenance, and the assist line", () => {
  const html = sandbox({
    recipeBookView: "connection",
    steps: [GS("s1", { name: "Pull", tool: "Excel", channel: "export and email" }), GS("s2", { name: "Post", tool: "Excel" })],
    recipeCache: { "h:s1>s2": "Carry the packet." }
  }).recipeBookHtml();
  assert.match(html, /Proposed/, "status chip");
  assert.match(html, /class="prov ai"/, "merged provenance chip");
  assert.match(html, /AI can carry the handoff between these steps/, "the assist line");
});

test("never a dead end: with no seams the section explains how connections surface and never reads 'blocked'", () => {
  const sectionHtml = sandbox({ steps: [GS("s1", { tool: "Excel" }), GS("s2", { tool: "Salesforce" })] }).recipeBookConnectionSectionHtml();
  assert.match(sectionHtml, /No connections surfaced yet/);
  assert.ok(!/blocked/i.test(sectionHtml), "never 'blocked'");
});

test("RAIL: no banned economics tokens, no gradient on the data surface, Human Pink only on a held connection — and the by-step / by-status views stay Human-Pink-free", () => {
  const sb = sandbox({
    recipeBookView: "connection",
    steps: [GS("s1", { name: "Pull", tool: "Excel", channel: "export and email" }), GS("s2", { name: "Approve", tool: "Excel" })],
    decisionTags: { s2: tag("approval", "user-stated") },
    recipeCache: { "h:s1>s2": "Package and route the packet." }
  });
  const conn = sb.recipeBookHtml();
  assert.ok(!FORBIDDEN.test(conn), "no banned economics language in the by-connection render");
  assert.ok(!/gradient/i.test(conn), "no gradient on the data surface");
  assert.match(conn, HUMAN_PINK, "the held connection wears Human Pink");
  // The existing invariant: by-step / by-status renders never use Human Pink.
  const byStep = sandbox({ recipeBookView: "byStep", steps: [GS("s1", { name: "One" })] }).recipeBookHtml();
  const byStatus = sandbox({ recipeBookView: "status", steps: [GS("s1", { name: "One" })] }).recipeBookHtml();
  assert.ok(!HUMAN_PINK.test(byStep) && !HUMAN_PINK.test(byStatus), "Human Pink stays reserved — never leaks into by-step / by-status");
});

test("SEPARATION: the by-connection functions touch no scorer / no opportunity / no grid write / no endpoint / no telemetry", () => {
  for (const fn of ["recipeUnitSource", "recipeUnitConfidence", "recipeConnectionSeams", "recipeForConnection", "recipeBookByConnection", "recipeBookConnectionCardHtml", "recipeBookConnectionSectionHtml"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/getStepOpportunityMeta|principleScores|scoreRecipeReadiness|buildAgentRecipeIr/.test(body), `${fn}: no scorer / no opportunity`);
    assert.ok(!/patchField|persistState|setStructuralTag|applyStructuralSuggestion|confirmStructuralTag/.test(body), `${fn}: no grid write / no auto-harden`);
    assert.ok(!/\/api\/|requestJson|recordTelemetry/.test(body), `${fn}: no endpoint / no telemetry / no model call`);
  }
  // It consumes the leverage detector (the signal), not the opportunity scorer.
  assert.ok(/buildWorkflowLeverage/.test(extractFunction(source, "recipeConnectionSeams")), "consumes the leverage seam detector");
});

test("no firm names, no banned phrase, no 'eliminate' in the by-connection code", () => {
  const blob = ["recipeUnitSource", "recipeUnitConfidence", "recipeConnectionSeams", "recipeForConnection", "recipeBookByConnection", "recipeBookConnectionCardHtml", "recipeBookConnectionSectionHtml"]
    .map((fn) => extractFunction(source, fn)).join("\n");
  assert.ok(!/work with your development team/i.test(blob), "banned phrase absent");
  assert.ok(!/\beliminate\b/i.test(blob), "assist-not-replace: never 'eliminate'");
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i.test(blob), "no firm names");
});

test("integration: recipeBookHtml dispatches to the connection section and wireRecipeBook accepts the connection view", () => {
  const book = extractFunction(source, "recipeBookHtml");
  assert.ok(/recipeBookConnectionSectionHtml\(\)/.test(book), "the by-connection section is dispatched from the book");
  assert.ok(/toggleBtn\("connection"/.test(book), "the By connection toggle is registered");
  const wire = extractFunction(source, "wireRecipeBook");
  assert.ok(/=== "connection"/.test(wire), "the view handler accepts the connection view");
  assert.ok(/generateRecipePrompt\(stepId\)/.test(wire), "the existing step add path is preserved");
});
