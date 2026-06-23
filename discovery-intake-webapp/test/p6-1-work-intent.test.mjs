// P6-1 — Work Intent / Step Function tags. Executed, deterministic tests (NO live
// model — the suggestion path is stubbed). Mirrors the V3-15 step-typology suite.
// Covers: pinned 17-value taxonomy; manual pick (user-stated); AI suggest
// (ai-inferred) with taxonomy validation + graceful failure; multi-intent writes
// nothing and flags decomposition; confirm (promote) / reject (clear); ai-inferred
// never auto-hardens; distinct rendering; workIntent kept SEPARATE from class /
// stepType / actionVerb; and the hard rail that work intent NEVER feeds opportunity,
// the confirmation/engine gate, scoring, or official counted rollups. Real shipped
// source extracted and evaluated (see helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();
const serverSource = readServerSource();

// Pure helpers + mutators + renderers (state-only; no persist/render/fetch here).
function wiSandbox(state) {
  return buildSandbox(source, {
    consts: ["WORK_INTENT_OPTIONS"],
    functions: [
      "isValidWorkIntent", "ensureWorkIntents", "workIntentOf",
      "setWorkIntent", "applyWorkIntentSuggestion", "workIntentSuggestionIsMultiple",
      "confirmWorkIntent", "rejectWorkIntent",
      "workIntentTagHtml", "workIntentPickerHtml", "provenanceBadgeHtml", "escapeHtml"
    ],
    globals: { state: state || { workIntents: {} } }
  });
}

// The async suggest action, with its side-effecting deps stubbed.
function suggestSandbox(state, { requestJson, calls }) {
  return buildSandbox(source, {
    consts: ["WORK_INTENT_OPTIONS"],
    functions: ["suggestWorkIntent", "applyWorkIntentSuggestion", "workIntentSuggestionIsMultiple", "isValidWorkIntent", "ensureWorkIntents", "workIntentOf", "workIntentSuggestionInput"],
    globals: {
      state,
      analysisGridSteps: () => [{ id: "s1", cells: { name: { value: "Reconcile balances" } } }],
      requestJson,
      persistState: () => { if (calls) calls.persist = (calls.persist || 0) + 1; },
      render: () => { if (calls) calls.render = (calls.render || 0) + 1; },
      toast: (m) => { if (calls) (calls.toast = calls.toast || []).push(m); }
    }
  });
}

const TAXONOMY = ["retrieve", "extract", "validate", "reconcile", "calculate", "draft", "summarize", "classify", "route", "monitor", "notify", "escalate", "approve", "release", "attest", "advise", "negotiate"];

// ── Taxonomy ────────────────────────────────────────────────────────────────

test("the work-intent taxonomy is pinned to the 17 values", () => {
  const sb = wiSandbox();
  const optsSrc = extractConst(source, "WORK_INTENT_OPTIONS");
  for (const v of TAXONOMY) assert.ok(optsSrc.includes(`"${v}"`), `taxonomy pins ${v}`);
  for (const v of TAXONOMY) assert.equal(sb.isValidWorkIntent(v), true);
  assert.equal(sb.isValidWorkIntent("automate"), false);
  assert.equal(sb.isValidWorkIntent("decision"), false, "a stepType value is not a work intent");
  assert.equal(sb.isValidWorkIntent(""), false);
  assert.equal(sb.isValidWorkIntent(null), false);
});

// ── Manual pick ───────────────────────────────────────────────────────────────

test("manual pick stores a user-stated tag; an invalid/empty value clears it", () => {
  const state = { workIntents: {} };
  const sb = wiSandbox(state);
  assert.equal(sb.setWorkIntent("s1", "reconcile"), true);
  assert.deepEqual(state.workIntents.s1, { value: "reconcile", source: "user-stated", confidence: 1 });
  assert.equal(sb.setWorkIntent("s1", "bogus"), false);
  assert.equal(state.workIntents.s1, undefined, "off-taxonomy clears (never stored)");
  sb.setWorkIntent("s2", "draft");
  sb.setWorkIntent("s2", "");
  assert.equal(state.workIntents.s2, undefined, '"no work intent" clears');
});

// ── AI suggestion ─────────────────────────────────────────────────────────────

test("AI suggestion stores an ai-inferred tag only when valid; confidence normalized", () => {
  const state = { workIntents: {} };
  const sb = wiSandbox(state);
  assert.equal(sb.applyWorkIntentSuggestion("s1", { value: "validate", confidence: 0.8 }), true);
  assert.deepEqual(state.workIntents.s1, { value: "validate", source: "ai-inferred", confidence: 0.8 });
  sb.applyWorkIntentSuggestion("s2", { value: "summarize" });
  assert.equal(state.workIntents.s2.confidence, 0.5, "missing confidence → 0.5");
  sb.applyWorkIntentSuggestion("s3", { value: "route", confidence: 9 });
  assert.equal(state.workIntents.s3.confidence, 0.5, "out-of-range confidence → 0.5");
});

test("an off-taxonomy / empty / malformed suggestion writes NO key — never fabricated", () => {
  const state = { workIntents: {} };
  const sb = wiSandbox(state);
  assert.equal(sb.applyWorkIntentSuggestion("s1", { value: "automate-it", confidence: 0.9 }), false);
  assert.equal(sb.applyWorkIntentSuggestion("s2", { value: "", confidence: 0.9 }), false);
  assert.equal(sb.applyWorkIntentSuggestion("s3", null), false);
  assert.equal(sb.applyWorkIntentSuggestion("s4", {}), false);
  assert.deepEqual(state.workIntents, {}, "no fabricated value is ever stored");
});

test("a MULTI-INTENT suggestion writes nothing — a compound step is never parent-tagged", () => {
  const state = { workIntents: {} };
  const sb = wiSandbox(state);
  // explicit multiIntent flag
  assert.equal(sb.workIntentSuggestionIsMultiple({ multiIntent: true }), true);
  assert.equal(sb.applyWorkIntentSuggestion("s1", { multiIntent: true, value: "reconcile", confidence: 0.9 }), false);
  // a list value is also multi-intent
  assert.equal(sb.workIntentSuggestionIsMultiple({ value: ["retrieve", "reconcile"] }), true);
  assert.equal(sb.applyWorkIntentSuggestion("s2", { value: ["retrieve", "reconcile"], confidence: 0.9 }), false);
  // a single value is NOT multi-intent
  assert.equal(sb.workIntentSuggestionIsMultiple({ value: "retrieve" }), false);
  // a single-ELEMENT array is not "multi", but it is still not a string → off-taxonomy,
  // so it must write nothing (defends the validation-order against future refactors).
  assert.equal(sb.workIntentSuggestionIsMultiple({ value: ["retrieve"] }), false);
  assert.equal(sb.applyWorkIntentSuggestion("s3", { value: ["retrieve"], confidence: 0.9 }), false, "single-element array is off-taxonomy, never stored");
  assert.deepEqual(state.workIntents, {}, "multi-intent / list-valued suggestions never write a key");
});

// ── Confirm / reject ──────────────────────────────────────────────────────────

test("confirm promotes ai-inferred → user-stated (value preserved); reject clears", () => {
  const state = { workIntents: { s1: { value: "reconcile", source: "ai-inferred", confidence: 0.7 } } };
  const sb = wiSandbox(state);
  assert.equal(sb.confirmWorkIntent("s1"), true);
  assert.deepEqual(state.workIntents.s1, { value: "reconcile", source: "user-stated", confidence: 1 });

  const state2 = { workIntents: { s1: { value: "reconcile", source: "ai-inferred", confidence: 0.7 } } };
  const sb2 = wiSandbox(state2);
  assert.equal(sb2.rejectWorkIntent("s1"), true);
  assert.equal(state2.workIntents.s1, undefined);
  assert.equal(sb2.confirmWorkIntent("nope"), false, "confirm is a no-op on an untagged step");
});

test("an ai-inferred tag never auto-hardens: stays ai-inferred on read, and load never promotes it", () => {
  const state = { workIntents: { s1: { value: "draft", source: "ai-inferred", confidence: 0.6 } } };
  const sb = wiSandbox(state);
  assert.equal(sb.workIntentOf("s1").source, "ai-inferred", "read never hardens");
  const norm = extractFunction(source, "normalizeLoadedState");
  assert.ok(/workIntents:\s*parsed\.workIntents/.test(norm), "load passes workIntents through unchanged");
  assert.ok(!/workIntents[\s\S]{0,120}user-stated/.test(norm), "load never rewrites workIntents to user-stated");
});

// ── Rendering ─────────────────────────────────────────────────────────────────

test("ai-inferred renders distinctly from user-stated (flat single-hue, no gradient); confirm/reject only for ai-inferred", () => {
  const state = { workIntents: { ai: { value: "reconcile", source: "ai-inferred", confidence: 0.7 }, us: { value: "approve", source: "user-stated", confidence: 1 } } };
  const sb = wiSandbox(state);
  const aiHtml = sb.workIntentTagHtml({ id: "ai" });
  const usHtml = sb.workIntentTagHtml({ id: "us" });
  assert.match(aiHtml, /Work intent:/);
  assert.match(aiHtml, />AI</, 'ai-inferred shows the "AI" provenance badge');
  assert.match(aiHtml, /suggested/);
  assert.match(aiHtml, /data-work-intent-confirm="ai"/);
  assert.match(aiHtml, /data-work-intent-reject="ai"/);
  assert.match(usHtml, />User</, 'user-stated shows the "User" provenance badge');
  assert.ok(!/data-work-intent-(confirm|reject)/.test(usHtml), "user-stated shows no confirm/reject");
  assert.ok(!/gradient/i.test(aiHtml) && !/gradient/i.test(usHtml), "no gradient on the meaning-bearing tag");
});

test("byte-identical when unused: untagged → null tag and empty tag HTML", () => {
  const sb = wiSandbox({ workIntents: {} });
  assert.equal(sb.workIntentOf("nope"), null, "untagged → null (never fabricated)");
  assert.equal(sb.workIntentTagHtml({ id: "nope" }), "", "untagged tag renders nothing");
});

// ── Separation from class / stepType / actionVerb ───────────────────────────

test("workIntent is a SEPARATE axis from class, stepType, and actionVerb", () => {
  const state = { workIntents: {}, stepTypes: {} };
  const sb = wiSandbox(state);
  // It writes its own sidecar, never the typology sidecar.
  sb.setWorkIntent("s1", "reconcile");
  assert.deepEqual(state.workIntents.s1, { value: "reconcile", source: "user-stated", confidence: 1 });
  assert.deepEqual(state.stepTypes, {}, "setting work intent never touches stepTypes");
  // The taxonomy is its own controlled vocabulary, distinct from the 5-value typology.
  const stepTypeOpts = extractConst(source, "STEP_TYPE_OPTIONS");
  assert.ok(!/reconcile|summarize|negotiate|attest/.test(stepTypeOpts), "stepType taxonomy does not contain work-intent values");
  // Source-level: the work-intent code never reads the class, the typology, or the action verb.
  for (const fn of ["workIntentSuggestionInput", "setWorkIntent", "applyWorkIntentSuggestion", "workIntentTagHtml", "workIntentPickerHtml", "stepWorkIntentHtml"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/stepTypes|stepTypeOf|STEP_TYPE_OPTIONS/.test(body), `${fn}: independent of stepType`);
    assert.ok(!/\bactionVerb\b|engineStepClass|step\.cls/.test(body), `${fn}: independent of class/actionVerb`);
  }
  // The rendered label is its own ("Work intent:"), not "Step type:".
  assert.ok(/Work intent:/.test(extractFunction(source, "workIntentTagHtml")));
});

// ── Hard rail: never feeds opportunity / scoring / gate / counted rollups ────

test("work intent never feeds or alters the opportunity score (functional + source-level)", () => {
  const getStepOpportunityMeta = eval(`(${extractFunction(source, "getStepOpportunityMeta")})`);
  const step = { id: "s1", cells: { name: { value: "Reconcile balances", state: "confirmed", confidence: 0.9 }, frequencyVolume: { value: "daily", state: "confirmed", confidence: 0.9 }, dataProcessing: { value: "copy rows", state: "confirmed", confidence: 0.8 } } };
  const before = getStepOpportunityMeta(step);
  const state = { workIntents: {} };
  const sb = wiSandbox(state);
  sb.setWorkIntent("s1", "reconcile");
  sb.applyWorkIntentSuggestion("s1b", { value: "extract", confidence: 0.9 });
  const after = getStepOpportunityMeta(step);
  assert.deepEqual(after, before, "no intent / ai-inferred / user-stated → identical opportunity");
  for (const fn of ["getStepOpportunityMeta", "stepTrustSignals", "scoreRecipeReadiness"]) {
    assert.ok(!/workIntent/i.test(extractFunction(source, fn)), `${fn} must not reference workIntent`);
  }
});

test("the work-intent path makes no grid write, no scoring call, no telemetry of the value", () => {
  for (const fn of ["setWorkIntent", "applyWorkIntentSuggestion", "confirmWorkIntent", "rejectWorkIntent", "workIntentOf", "workIntentTagHtml", "workIntentPickerHtml", "stepWorkIntentHtml", "wireWorkIntent", "suggestWorkIntent"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/patchField/.test(body), `${fn}: no grid write`);
    assert.ok(!/recordTelemetry|\/api\/telemetry/.test(body), `${fn}: no telemetry of the value`);
    assert.ok(!/buildAgentRecipeIr|scoreRecipeReadiness|getStepOpportunityMeta/.test(body), `${fn}: never touches scorers`);
  }
  const suggest = extractFunction(source, "suggestWorkIntent");
  assert.ok(suggest.includes("/api/suggest-work-intent"), "suggest uses the narrow endpoint");
  assert.ok(!/\/api\/(recipe|chat|harvest-grid|business-case)/.test(suggest), "not the recipe/scoring/harvest paths");
});

test("work intent does not feed the confirmation/engine gate or counted rollups (source-level)", () => {
  for (const fn of ["recipeGateCheck", "isUnitConfirmed", "confirmedView", "hardenedRecipeSpec", "confirmUnit"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/workIntent/i.test(body), `${fn} (gate/rollup) must not reference workIntent`);
  }
});

test("no Phase 5 / gate function references P6-1 symbols", () => {
  const phase5Fns = [
    "buildModeledWorkActions", "modeledWorkActionsHtml",
    "recipeGateCheck", "isUnitConfirmed", "confirmedView", "hardenedRecipeSpec", "confirmUnit",
    "buildConfirmationLadder", "buildPlacementExplainer", "detectCompoundStep"
  ];
  const p61Tokens = ["workIntent", "WORK_INTENT", "suggestWorkIntent"];
  for (const fn of phase5Fns) {
    const body = extractFunction(source, fn);
    for (const tok of p61Tokens) {
      assert.ok(!body.includes(tok), `${fn} must not reference P6-1 token ${tok}`);
    }
  }
});

// ── Async suggest action ──────────────────────────────────────────────────────

test("suggest action: success stores ai-inferred; off-taxonomy → no key; multi-intent → decomposition hint; failure graceful", async () => {
  // success
  const stateOk = { workIntents: {} };
  const callsOk = {};
  const ok = suggestSandbox(stateOk, { requestJson: async () => ({ value: "reconcile", confidence: 0.8 }), calls: callsOk });
  assert.equal(await ok.suggestWorkIntent("s1"), true);
  assert.deepEqual(stateOk.workIntents.s1, { value: "reconcile", source: "ai-inferred", confidence: 0.8 });
  assert.equal(callsOk.persist, 1);

  // off-taxonomy server result → no key
  const stateOff = { workIntents: {} };
  const off = suggestSandbox(stateOff, { requestJson: async () => ({ value: "automate", confidence: 0.9 }), calls: {} });
  assert.equal(await off.suggestWorkIntent("s1"), false);
  assert.equal(stateOff.workIntents.s1, undefined, "off-taxonomy server response → untagged");

  // multi-intent → no key, surfaces a decomposition hint, no persist
  const stateMulti = { workIntents: {} };
  const callsMulti = {};
  const multi = suggestSandbox(stateMulti, { requestJson: async () => ({ value: null, multiIntent: true }), calls: callsMulti });
  assert.equal(await multi.suggestWorkIntent("s1"), false);
  assert.equal(stateMulti.workIntents.s1, undefined, "multi-intent leaves the step untagged");
  assert.equal(callsMulti.persist, undefined, "no persist on multi-intent");
  assert.ok((callsMulti.toast || []).some((m) => /decomposition|multiple intents/i.test(m)), "surfaces a decomposition hint");

  // graceful failure: thrown error → no key, no crash, no persist
  const stateFail = { workIntents: {} };
  const callsFail = {};
  const fail = suggestSandbox(stateFail, { requestJson: async () => { throw new Error("network"); }, calls: callsFail });
  assert.equal(await fail.suggestWorkIntent("s1"), false, "failure resolves false, never throws");
  assert.equal(stateFail.workIntents.s1, undefined, "failure leaves the step untagged");
  assert.equal(callsFail.persist, undefined, "no persist on failure");
});

// ── Server endpoint ──────────────────────────────────────────────────────────

test("server: /api/suggest-work-intent is a descriptive classifier — taxonomy-validated, key-gated, multi-intent aware, no scoring", () => {
  assert.ok(/\/api\/suggest-work-intent/.test(serverSource), "route registered");
  const handler = extractFunction(serverSource, "handleSuggestWorkIntent");
  assert.ok(/WORK_INTENT_VALUES/.test(handler), "validates the model output against the taxonomy");
  assert.ok(/getOpenAiKey/.test(handler), "gated on the server-side key");
  assert.ok(/!getOpenAiKey\(\)/.test(handler) && /400/.test(handler), "empty key → 400 (offline)");
  assert.ok(/multiIntent/.test(handler), "passes a multi-intent signal through (never tags a compound step)");
  assert.ok(!/opportunity|getStepOpportunity|computeBusinessCase|buildAgentRecipeIr|readiness|scoreRecipe/i.test(handler), "descriptive only — no scoring/opportunity");
  // taxonomy const pinned server-side
  assert.ok(/retrieve[\s\S]*reconcile[\s\S]*negotiate/.test(extractConst(serverSource, "WORK_INTENT_VALUES")), "server taxonomy pinned");
});

test("no firm names / banned phrase / rail families in the new work-intent code (client + server)", () => {
  const pIdx = serverSource.indexOf("WORK_INTENT_SYSTEM_PROMPT =");
  const promptSlice = pIdx >= 0 ? serverSource.slice(pIdx, pIdx + 900) : "";
  const blob = [
    extractFunction(source, "suggestWorkIntent"),
    extractFunction(source, "stepWorkIntentHtml"),
    extractFunction(source, "workIntentPickerHtml"),
    extractFunction(source, "workIntentTagHtml"),
    extractFunction(serverSource, "handleSuggestWorkIntent"),
    promptSlice
  ].join("\n").toLowerCase();
  for (const w of ["headcount", "fte", "eliminat", "work with your development team"]) {
    assert.ok(!blob.includes(w), `must not contain "${w}"`);
  }
});
