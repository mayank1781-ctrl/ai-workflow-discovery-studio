// V3-15 — Step typology (structural axis). Executed, deterministic tests (NO live
// model — the suggestion path is stubbed). Covers: manual pick (user-stated), AI
// suggest (ai-inferred) with taxonomy validation + graceful failure, confirm
// (promote) / reject, ai-inferred never auto-hardens, distinct rendering, and the
// hard rail that typology NEVER feeds or alters the opportunity score. Real shipped
// source extracted and evaluated (see helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();
const serverSource = readServerSource();

// Pure helpers + mutators + renderers (state-only; no persist/render/fetch here).
function typoSandbox(state) {
  return buildSandbox(source, {
    consts: ["STEP_TYPE_OPTIONS"],
    functions: [
      "isValidStepType", "ensureStepTypes", "stepTypeOf",
      "setStepType", "applyStepTypeSuggestion", "confirmStepType", "rejectStepType",
      "stepTypeTagHtml", "stepTypePickerHtml", "provenanceBadgeHtml", "escapeHtml"
    ],
    globals: { state: state || { stepTypes: {} } }
  });
}

// The async suggest action, with its side-effecting deps stubbed.
function suggestSandbox(state, { requestJson, calls }) {
  return buildSandbox(source, {
    consts: ["STEP_TYPE_OPTIONS"],
    functions: ["suggestStepType", "applyStepTypeSuggestion", "isValidStepType", "ensureStepTypes", "stepTypeOf", "stepTypeSuggestionInput"],
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

test("manual pick stores a user-stated tag; an invalid/empty value clears it", () => {
  const state = { stepTypes: {} };
  const sb = typoSandbox(state);
  assert.equal(sb.setStepType("s1", "data-op"), true);
  assert.deepEqual(state.stepTypes.s1, { value: "data-op", source: "user-stated", confidence: 1 });
  assert.equal(sb.setStepType("s1", "bogus"), false);
  assert.equal(state.stepTypes.s1, undefined, "off-taxonomy clears (never stored)");
  sb.setStepType("s2", "review");
  sb.setStepType("s2", "");
  assert.equal(state.stepTypes.s2, undefined, '"not classified" clears');
});

test("AI suggestion stores an ai-inferred tag (mocked, no live model); confidence normalized", () => {
  const state = { stepTypes: {} };
  const sb = typoSandbox(state);
  assert.equal(sb.applyStepTypeSuggestion("s1", { value: "handoff", confidence: 0.8 }), true);
  assert.deepEqual(state.stepTypes.s1, { value: "handoff", source: "ai-inferred", confidence: 0.8 });
  sb.applyStepTypeSuggestion("s2", { value: "decision" });
  assert.equal(state.stepTypes.s2.confidence, 0.5, "missing confidence → 0.5");
  sb.applyStepTypeSuggestion("s3", { value: "review", confidence: 9 });
  assert.equal(state.stepTypes.s3.confidence, 0.5, "out-of-range confidence → 0.5");
});

test("an off-taxonomy / empty / malformed suggestion writes NO key — never a fabricated ai-inferred value", () => {
  const state = { stepTypes: {} };
  const sb = typoSandbox(state);
  assert.equal(sb.applyStepTypeSuggestion("s1", { value: "automate-it", confidence: 0.9 }), false);
  assert.equal(sb.applyStepTypeSuggestion("s2", { value: "", confidence: 0.9 }), false);
  assert.equal(sb.applyStepTypeSuggestion("s3", null), false);
  assert.equal(sb.applyStepTypeSuggestion("s4", {}), false);
  assert.deepEqual(state.stepTypes, {}, "no fabricated value is ever stored");
});

test("confirm promotes ai-inferred → user-stated (value preserved); reject clears", () => {
  const state = { stepTypes: { s1: { value: "judgment", source: "ai-inferred", confidence: 0.7 } } };
  const sb = typoSandbox(state);
  assert.equal(sb.confirmStepType("s1"), true);
  assert.deepEqual(state.stepTypes.s1, { value: "judgment", source: "user-stated", confidence: 1 });

  const state2 = { stepTypes: { s1: { value: "judgment", source: "ai-inferred", confidence: 0.7 } } };
  const sb2 = typoSandbox(state2);
  assert.equal(sb2.rejectStepType("s1"), true);
  assert.equal(state2.stepTypes.s1, undefined);
  assert.equal(sb2.confirmStepType("nope"), false, "confirm is a no-op on an untyped step");
});

test("an ai-inferred tag never auto-hardens: stays ai-inferred on read, and load never promotes it", () => {
  const state = { stepTypes: { s1: { value: "data-op", source: "ai-inferred", confidence: 0.6 } } };
  const sb = typoSandbox(state);
  assert.equal(sb.stepTypeOf("s1").source, "ai-inferred", "read never hardens");
  const norm = extractFunction(source, "normalizeLoadedState");
  assert.ok(/stepTypes:\s*parsed\.stepTypes/.test(norm), "load passes stepTypes through unchanged");
  assert.ok(!/stepTypes[\s\S]{0,120}user-stated/.test(norm), "load never rewrites stepTypes to user-stated");
});

test("ai-inferred renders distinctly from user-stated (flat single-hue, no gradient); confirm/reject only for ai-inferred", () => {
  const state = { stepTypes: { ai: { value: "handoff", source: "ai-inferred", confidence: 0.7 }, us: { value: "review", source: "user-stated", confidence: 1 } } };
  const sb = typoSandbox(state);
  const aiHtml = sb.stepTypeTagHtml({ id: "ai" });
  const usHtml = sb.stepTypeTagHtml({ id: "us" });
  assert.match(aiHtml, />AI</, 'ai-inferred shows the "AI" provenance badge');
  assert.match(aiHtml, /suggested/);
  assert.match(aiHtml, /data-step-type-confirm="ai"/);
  assert.match(aiHtml, /data-step-type-reject="ai"/);
  assert.match(usHtml, />User</, 'user-stated shows the "User" provenance badge');
  assert.ok(!/data-step-type-(confirm|reject)/.test(usHtml), "user-stated shows no confirm/reject");
  assert.ok(!/gradient/i.test(aiHtml) && !/gradient/i.test(usHtml), "no gradient on the meaning-bearing tag");
});

test("byte-identical when unused: untyped → null tag and empty tag HTML; taxonomy pinned", () => {
  const sb = typoSandbox({ stepTypes: {} });
  assert.equal(sb.stepTypeOf("nope"), null, "untyped → null (never fabricated)");
  assert.equal(sb.stepTypeTagHtml({ id: "nope" }), "", "untyped tag renders nothing");
  for (const t of ["decision", "handoff", "data-op", "judgment", "review"]) assert.equal(sb.isValidStepType(t), true);
  assert.equal(sb.isValidStepType("automate"), false);
  assert.equal(sb.isValidStepType(""), false);
  assert.ok(/decision[\s\S]*handoff[\s\S]*data-op[\s\S]*judgment[\s\S]*review/.test(extractConst(source, "STEP_TYPE_OPTIONS")), "taxonomy pinned to the 5 values");
});

test("typology never feeds or alters the opportunity score (functional + source-level)", () => {
  // Functional: getStepOpportunityMeta is pure over the step's cells; setting a
  // type writes a SEPARATE sidecar (state.stepTypes), so the score is unchanged.
  const getStepOpportunityMeta = eval(`(${extractFunction(source, "getStepOpportunityMeta")})`);
  const step = { id: "s1", cells: { name: { value: "Reconcile balances", state: "confirmed", confidence: 0.9 }, frequencyVolume: { value: "daily", state: "confirmed", confidence: 0.9 }, dataProcessing: { value: "copy rows", state: "confirmed", confidence: 0.8 } } };
  const before = getStepOpportunityMeta(step);
  const state = { stepTypes: {} };
  const sb = typoSandbox(state);
  sb.setStepType("s1", "judgment");
  sb.applyStepTypeSuggestion("s1b", { value: "data-op", confidence: 0.9 });
  const after = getStepOpportunityMeta(step);
  assert.deepEqual(after, before, "no type / ai-inferred / user-stated → identical opportunity");
  // Source-level: the scorers never read stepTypes.
  for (const fn of ["getStepOpportunityMeta", "stepTrustSignals", "scoreRecipeReadiness"]) {
    assert.ok(!/stepTypes/.test(extractFunction(source, fn)), `${fn} must not reference stepTypes`);
  }
});

test("the typology path makes no grid write, no scoring call, no telemetry of the type value", () => {
  for (const fn of ["setStepType", "applyStepTypeSuggestion", "confirmStepType", "rejectStepType", "stepTypeOf", "stepTypeTagHtml", "stepTypePickerHtml", "stepTypologyHtml", "wireStepTypology", "suggestStepType"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/patchField/.test(body), `${fn}: no grid write`);
    assert.ok(!/recordTelemetry|\/api\/telemetry/.test(body), `${fn}: no telemetry of the type value`);
    assert.ok(!/buildAgentRecipeIr|scoreRecipeReadiness|getStepOpportunityMeta/.test(body), `${fn}: never touches scorers`);
  }
  // The ONLY model/server call is the narrow suggest endpoint, in suggestStepType.
  const suggest = extractFunction(source, "suggestStepType");
  assert.ok(suggest.includes("/api/suggest-step-type"), "suggest uses the narrow endpoint");
  assert.ok(!/\/api\/(recipe|chat|harvest-grid|business-case)/.test(suggest), "not the recipe/scoring/harvest paths");
  for (const fn of ["setStepType", "applyStepTypeSuggestion", "confirmStepType", "rejectStepType", "stepTypeTagHtml", "stepTypePickerHtml", "stepTypologyHtml"]) {
    assert.ok(!/requestJson|\/api\//.test(extractFunction(source, fn)), `${fn}: no server call`);
  }
});

test("suggest action: success stores ai-inferred; off-taxonomy server result writes no key; failure is graceful", async () => {
  // success
  const stateOk = { stepTypes: {} };
  const callsOk = {};
  const ok = suggestSandbox(stateOk, { requestJson: async () => ({ value: "data-op", confidence: 0.8 }), calls: callsOk });
  assert.equal(await ok.suggestStepType("s1"), true);
  assert.deepEqual(stateOk.stepTypes.s1, { value: "data-op", source: "ai-inferred", confidence: 0.8 });
  assert.equal(callsOk.persist, 1);

  // off-taxonomy server result → no key (stubbed model response)
  const stateOff = { stepTypes: {} };
  const off = suggestSandbox(stateOff, { requestJson: async () => ({ value: "automate", confidence: 0.9 }), calls: {} });
  assert.equal(await off.suggestStepType("s1"), false);
  assert.equal(stateOff.stepTypes.s1, undefined, "off-taxonomy server response → untyped");

  // graceful failure: thrown error → no key, no crash, no persist
  const stateFail = { stepTypes: {} };
  const callsFail = {};
  const fail = suggestSandbox(stateFail, { requestJson: async () => { throw new Error("network"); }, calls: callsFail });
  assert.equal(await fail.suggestStepType("s1"), false, "failure resolves false, never throws");
  assert.equal(stateFail.stepTypes.s1, undefined, "failure leaves the step untyped");
  assert.equal(callsFail.persist, undefined, "no persist on failure");
});

test("server: /api/suggest-step-type is a descriptive classifier — never scoring/opportunity, validates the taxonomy, gated on the key", () => {
  // Route is registered and additive.
  assert.ok(/\/api\/suggest-step-type/.test(serverSource), "route registered");
  const handler = extractFunction(serverSource, "handleSuggestStepType");
  assert.ok(/STEP_TYPE_VALUES/.test(handler), "validates the model output against the taxonomy");
  assert.ok(/getOpenAiKey/.test(handler), "gated on the server-side key");
  assert.ok(/!getOpenAiKey\(\)/.test(handler) && /400/.test(handler), "empty key → 400 (offline)");
  assert.ok(!/opportunity|getStepOpportunity|computeBusinessCase|buildAgentRecipeIr|readiness|scoreRecipe/i.test(handler), "descriptive only — no scoring/opportunity");
});

test("no firm names / banned phrase in the new typology code (client + server)", () => {
  // Capture the server prompt by slice (it contains semicolons inside backticks,
  // which the brace-only extractConst would truncate).
  const pIdx = serverSource.indexOf("STEP_TYPE_SYSTEM_PROMPT =");
  const promptSlice = pIdx >= 0 ? serverSource.slice(pIdx, pIdx + 800) : "";
  const blob = [
    extractFunction(source, "suggestStepType"),
    extractFunction(source, "stepTypologyHtml"),
    extractFunction(source, "stepTypePickerHtml"),
    extractFunction(source, "stepTypeTagHtml"),
    extractFunction(serverSource, "handleSuggestStepType"),
    promptSlice
  ].join("\n");
  assert.ok(!/work with your development team/i.test(blob), "banned phrase absent");
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i.test(blob), "no firm names");
});
