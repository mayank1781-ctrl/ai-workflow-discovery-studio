// V3-16 — Handoffs + decisions as first-class structural objects. Executed,
// deterministic tests (NO live model — the suggest path is stubbed). Both entities
// reuse ONE generic provenance-tag core. Covers: manual (user-stated), AI-suggest
// (ai-inferred) with per-kind taxonomy validation + graceful failure, confirm
// (promote) / reject, ai-inferred never auto-hardens, distinct rendering,
// byte-identical-when-unused, and the hard rail that structural tags NEVER feed or
// alter opportunity. Real shipped source extracted/evaluated (see helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();
const serverSource = readServerSource();

// The pinned allowed sets (buildSandbox returns only functions, not consts — a
// separate test asserts these match the real HANDOFF_KINDS / DECISION_KINDS consts).
const HANDOFF = ["role-to-role", "human-to-system", "system-to-human", "system-to-system"];
const DECISION = ["approval", "routing", "prioritization", "exception-handling", "judgment-call"];

// Generic provenance-tag core (pure; operates on a plain map + allowed set).
function coreSandbox() {
  return buildSandbox(source, {
    functions: [
      "isInAllowedSet", "structuralTagOf", "setStructuralTag", "applyStructuralSuggestion",
      "confirmStructuralTag", "rejectStructuralTag", "handoffId", "buildHandoffCandidates", "structuralCellText"
    ]
  });
}

function renderSandbox(state) {
  return buildSandbox(source, {
    consts: ["HANDOFF_KINDS", "DECISION_KINDS"],
    functions: ["structuralTagHtml", "structuralPickerHtml", "stepStructuralHtml", "structuralMapFor", "structuralTagOf", "isInAllowedSet", "handoffId", "provenanceBadgeHtml", "escapeHtml"],
    globals: { state: state || { handoffTags: {}, decisionTags: {}, workflowGrid: { steps: [] } } }
  });
}

function suggestSandbox(state, { requestJson, calls }) {
  return buildSandbox(source, {
    consts: ["HANDOFF_KINDS", "DECISION_KINDS"],
    functions: ["suggestStructuralTag", "applyStructuralSuggestion", "structuralTagOf", "isInAllowedSet", "ensureHandoffTags", "ensureDecisionTags", "buildHandoffCandidates", "handoffId", "handoffSuggestionInput", "decisionSuggestionInput", "structuralCellText"],
    globals: {
      state,
      analysisGridSteps: () => state.workflowGrid.steps,
      requestJson,
      persistState: () => { if (calls) calls.persist = (calls.persist || 0) + 1; },
      render: () => {},
      toast: () => {}
    }
  });
}

test("manual entry writes a user-stated tag (both entities); invalid/empty clears", () => {
  const { setStructuralTag } = coreSandbox();
  const handoffs = {};
  assert.equal(setStructuralTag(handoffs, "h:a>b", "role-to-role", HANDOFF), true);
  assert.deepEqual(handoffs["h:a>b"], { value: "role-to-role", source: "user-stated", confidence: 1 });
  const decisions = {};
  assert.equal(setStructuralTag(decisions, "s1", "approval", DECISION), true);
  assert.deepEqual(decisions.s1, { value: "approval", source: "user-stated", confidence: 1 });
  assert.equal(setStructuralTag(handoffs, "h:a>b", "bogus", HANDOFF), false);
  assert.equal(handoffs["h:a>b"], undefined, "off-set clears");
  setStructuralTag(decisions, "s1", "");
  assert.equal(decisions.s1, undefined, "empty clears");
});

test("AI-suggest writes an ai-inferred tag; confidence normalized", () => {
  const { applyStructuralSuggestion } = coreSandbox();
  const map = {};
  assert.equal(applyStructuralSuggestion(map, "s1", { value: "approval", confidence: 0.7 }, DECISION), true);
  assert.deepEqual(map.s1, { value: "approval", source: "ai-inferred", confidence: 0.7 });
  applyStructuralSuggestion(map, "s2", { value: "routing" }, DECISION);
  assert.equal(map.s2.confidence, 0.5, "missing confidence → 0.5");
  applyStructuralSuggestion(map, "s3", { value: "approval", confidence: 9 }, DECISION);
  assert.equal(map.s3.confidence, 0.5, "out-of-range → 0.5");
});

test("GUARD: an off-set / empty / malformed suggestion writes NO key (per-kind validation)", () => {
  const { applyStructuralSuggestion } = coreSandbox();
  const map = {};
  assert.equal(applyStructuralSuggestion(map, "s1", { value: "automate", confidence: 0.9 }, DECISION), false);
  // role-to-role is valid for handoffs but NOT for decisions — per-kind rejection.
  assert.equal(applyStructuralSuggestion(map, "s2", { value: "role-to-role", confidence: 0.9 }, DECISION), false);
  assert.equal(applyStructuralSuggestion(map, "s3", { value: "", confidence: 0.9 }, HANDOFF), false);
  assert.equal(applyStructuralSuggestion(map, "s4", null, HANDOFF), false);
  assert.equal(applyStructuralSuggestion(map, "s5", {}, HANDOFF), false);
  assert.deepEqual(map, {}, "no fabricated value is ever stored");
});

test("confirm promotes ai-inferred → user-stated (value preserved); reject clears", () => {
  const { confirmStructuralTag, rejectStructuralTag } = coreSandbox();
  const map = { s1: { value: "judgment-call", source: "ai-inferred", confidence: 0.6 } };
  assert.equal(confirmStructuralTag(map, "s1", DECISION), true);
  assert.deepEqual(map.s1, { value: "judgment-call", source: "user-stated", confidence: 1 });
  const map2 = { h: { value: "role-to-role", source: "ai-inferred", confidence: 0.6 } };
  assert.equal(rejectStructuralTag(map2, "h"), true);
  assert.equal(map2.h, undefined);
  assert.equal(confirmStructuralTag({}, "nope", DECISION), false, "no-op on unset");
});

test("ai-inferred never auto-hardens: stays ai-inferred on read; load passes through, never promotes", () => {
  const { structuralTagOf } = coreSandbox();
  const map = { "h:s1>s2": { value: "role-to-role", source: "ai-inferred", confidence: 0.6 } };
  assert.equal(structuralTagOf(map, "h:s1>s2", HANDOFF).source, "ai-inferred", "read never hardens");
  const norm = extractFunction(source, "normalizeLoadedState");
  assert.ok(/handoffTags:\s*parsed\.handoffTags/.test(norm), "handoffTags passed through on load");
  assert.ok(/decisionTags:\s*parsed\.decisionTags/.test(norm), "decisionTags passed through on load");
  assert.ok(!/handoffTags[\s\S]{0,120}user-stated/.test(norm) && !/decisionTags[\s\S]{0,120}user-stated/.test(norm), "load never rewrites to user-stated");
});

test("handoff candidates derive from the step chain with stable ids", () => {
  const { buildHandoffCandidates, handoffId } = coreSandbox();
  const steps = [
    { id: "s1", cells: { name: { value: "Collect" } } },
    { id: "s2", cells: { name: { value: "Draft" } } },
    { id: "s3", cells: { name: { value: "Send" } } }
  ];
  const c = buildHandoffCandidates(steps);
  assert.equal(c.length, 2, "n steps → n-1 handoffs");
  assert.equal(c[0].id, handoffId("s1", "s2"));
  assert.equal(c[0].id, "h:s1>s2");
  assert.equal(c[0].fromName, "Collect");
  assert.equal(c[0].toName, "Draft");
  assert.equal(buildHandoffCandidates([{ id: "only", cells: {} }]).length, 0, "single step → no handoff");
});

test("ai-inferred renders distinct from user-stated (flat single-hue, no gradient); confirm/reject only for ai-inferred; tag is '' when unset", () => {
  const state = {
    handoffTags: { "h:s1>s2": { value: "role-to-role", source: "ai-inferred", confidence: 0.7 } },
    decisionTags: { s1: { value: "approval", source: "user-stated", confidence: 1 } },
    workflowGrid: { steps: [] }
  };
  const sb = renderSandbox(state);
  const hAi = sb.structuralTagHtml("Handoff", "handoff", "h:s1>s2", HANDOFF);
  assert.match(hAi, />AI</, 'ai-inferred shows the "AI" badge');
  assert.match(hAi, /suggested/);
  assert.match(hAi, /data-struct-confirm="handoff:h:s1(&gt;|>)s2"/);
  assert.match(hAi, /data-struct-reject="handoff:h:s1(&gt;|>)s2"/);
  const dUs = sb.structuralTagHtml("Decision", "decision", "s1", DECISION);
  assert.match(dUs, />User</, 'user-stated shows the "User" badge');
  assert.ok(!/data-struct-(confirm|reject)/.test(dUs), "user-stated shows no confirm/reject");
  assert.ok(!/gradient/i.test(hAi) && !/gradient/i.test(dUs), "no gradient on the meaning-bearing tag");
  // byte-identical when unset: the tag render is "".
  assert.equal(sb.structuralTagHtml("Handoff", "handoff", "nope", HANDOFF), "");
  assert.equal(sb.structuralTagHtml("Decision", "decision", "nope", DECISION), "");
});

test("byte-identical-when-unused: per-step block has no tag text but additive pickers; last step has no handoff-to-next", () => {
  const state = { handoffTags: {}, decisionTags: {}, workflowGrid: { steps: [{ id: "s1", cells: { name: { value: "A" } } }, { id: "s2", cells: { name: { value: "B" } } }] } };
  const sb = renderSandbox(state);
  const out = sb.stepStructuralHtml({ id: "s1" });
  assert.ok(!/Decision: <strong/.test(out), "no decision tag when unset");
  assert.ok(!/Handoff → [^:]*: <strong/.test(out), "no handoff tag when unset");
  assert.match(out, /data-struct-id="decision:s1"/, "decision picker present (additive)");
  assert.match(out, /data-struct-id="handoff:h:s1(&gt;|>)s2"/, "handoff-to-next picker present");
  const outLast = sb.stepStructuralHtml({ id: "s2" });
  assert.ok(!/data-struct-id="handoff:/.test(outLast), "the last step has no handoff-to-next");
});

test("opportunity is identical across no-entry / ai-inferred / user-stated (functional + source-level)", () => {
  const getStepOpportunityMeta = eval(`(${extractFunction(source, "getStepOpportunityMeta")})`);
  const step = { id: "s1", cells: { name: { value: "Reconcile balances", state: "confirmed", confidence: 0.9 }, frequencyVolume: { value: "daily", state: "confirmed", confidence: 0.9 }, dataProcessing: { value: "copy rows", state: "confirmed", confidence: 0.8 } } };
  const before = getStepOpportunityMeta(step);
  const { setStructuralTag, applyStructuralSuggestion } = coreSandbox();
  const decisions = {};
  const handoffs = {};
  setStructuralTag(decisions, "s1", "approval", DECISION);          // user-stated
  applyStructuralSuggestion(handoffs, "h:s1>s2", { value: "role-to-role", confidence: 0.8 }, HANDOFF); // ai-inferred
  assert.deepEqual(getStepOpportunityMeta(step), before, "handoff/decision tags never change the opportunity score");
  for (const fn of ["getStepOpportunityMeta", "stepTrustSignals", "scoreRecipeReadiness"]) {
    assert.ok(!/handoffTags|decisionTags|structuralTag/.test(extractFunction(source, fn)), `${fn} must not reference structural state`);
  }
});

test("the structural path makes no grid write, no scoring call, no telemetry; only one model call (the narrow endpoint)", () => {
  for (const fn of ["setStructuralTag", "applyStructuralSuggestion", "confirmStructuralTag", "rejectStructuralTag", "structuralTagOf", "structuralTagHtml", "structuralPickerHtml", "stepStructuralHtml", "wireStructural", "suggestStructuralTag", "buildHandoffCandidates"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/patchField/.test(body), `${fn}: no grid write`);
    assert.ok(!/recordTelemetry|\/api\/telemetry/.test(body), `${fn}: no telemetry of the value`);
    assert.ok(!/buildAgentRecipeIr|scoreRecipeReadiness|getStepOpportunityMeta/.test(body), `${fn}: never touches scorers`);
  }
  const suggest = extractFunction(source, "suggestStructuralTag");
  assert.ok(suggest.includes("/api/suggest-structural-type"), "suggest uses the narrow endpoint");
  assert.ok(!/\/api\/(recipe|chat|harvest-grid|business-case|suggest-step-type)/.test(suggest), "not the recipe/scoring/other paths");
  for (const fn of ["setStructuralTag", "applyStructuralSuggestion", "confirmStructuralTag", "rejectStructuralTag", "structuralTagHtml", "structuralPickerHtml", "stepStructuralHtml"]) {
    assert.ok(!/requestJson|\/api\//.test(extractFunction(source, fn)), `${fn}: no server call`);
  }
});

test("suggest action: success stores ai-inferred; off-set server result writes no key; failure is graceful", async () => {
  const stepsFix = [{ id: "s1", cells: { name: { value: "A" } } }, { id: "s2", cells: { name: { value: "B" } } }];
  // success (handoff)
  const stateOk = { handoffTags: {}, decisionTags: {}, workflowGrid: { steps: stepsFix } };
  const callsOk = {};
  const ok = suggestSandbox(stateOk, { requestJson: async () => ({ value: "role-to-role", confidence: 0.8 }), calls: callsOk });
  assert.equal(await ok.suggestStructuralTag("handoff", "h:s1>s2"), true);
  assert.deepEqual(stateOk.handoffTags["h:s1>s2"], { value: "role-to-role", source: "ai-inferred", confidence: 0.8 });
  assert.equal(callsOk.persist, 1);

  // off-set server result (a handoff value returned for a decision) → no key
  const stateOff = { handoffTags: {}, decisionTags: {}, workflowGrid: { steps: stepsFix } };
  const off = suggestSandbox(stateOff, { requestJson: async () => ({ value: "role-to-role", confidence: 0.9 }), calls: {} });
  assert.equal(await off.suggestStructuralTag("decision", "s1"), false);
  assert.equal(stateOff.decisionTags.s1, undefined, "off-set server response → unclassified");

  // graceful failure: thrown error → no key, no crash, no persist
  const stateFail = { handoffTags: {}, decisionTags: {}, workflowGrid: { steps: stepsFix } };
  const callsFail = {};
  const fail = suggestSandbox(stateFail, { requestJson: async () => { throw new Error("network"); }, calls: callsFail });
  assert.equal(await fail.suggestStructuralTag("decision", "s1"), false, "failure resolves false, never throws");
  assert.equal(stateFail.decisionTags.s1, undefined, "failure leaves it unclassified");
  assert.equal(callsFail.persist, undefined, "no persist on failure");
});

test("server: /api/suggest-structural-type is a descriptive classifier — per-kind validation, key-gated, never scoring", () => {
  assert.ok(/\/api\/suggest-structural-type/.test(serverSource), "route registered");
  const handler = extractFunction(serverSource, "handleSuggestStructuralType");
  assert.ok(/STRUCTURAL_KIND_SETS/.test(handler), "validates against the per-kind sets");
  assert.ok(/Unknown structural kind/.test(handler), "rejects an unknown kind");
  assert.ok(/!getOpenAiKey\(\)/.test(handler) && /400/.test(handler), "empty key → 400 (offline)");
  assert.ok(!/opportunity|getStepOpportunity|computeBusinessCase|buildAgentRecipeIr|readiness|scoreRecipe/i.test(handler), "descriptive only — no scoring/opportunity");
});

test("taxonomy consts pinned; no firm names / banned phrase in the new code (client + server)", () => {
  const hConst = extractConst(source, "HANDOFF_KINDS");
  const dConst = extractConst(source, "DECISION_KINDS");
  assert.ok(/role-to-role[\s\S]*human-to-system[\s\S]*system-to-human[\s\S]*system-to-system/.test(hConst), "HANDOFF_KINDS pinned");
  assert.ok(/approval[\s\S]*routing[\s\S]*prioritization[\s\S]*exception-handling[\s\S]*judgment-call/.test(dConst), "DECISION_KINDS pinned");
  const pIdx = serverSource.indexOf("STRUCTURAL_SYSTEM_PROMPTS");
  const promptSlice = pIdx >= 0 ? serverSource.slice(pIdx, pIdx + 1000) : "";
  const blob = [
    extractFunction(source, "suggestStructuralTag"),
    extractFunction(source, "stepStructuralHtml"),
    extractFunction(source, "structuralPickerHtml"),
    extractFunction(serverSource, "handleSuggestStructuralType"),
    promptSlice, hConst, dConst
  ].join("\n");
  assert.ok(!/work with your development team/i.test(blob), "banned phrase absent");
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i.test(blob), "no firm names");
});
