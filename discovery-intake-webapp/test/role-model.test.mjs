// V3-18 — Role-centric pivot. Executed, deterministic tests (NO live model — the
// suggest path is stubbed). Built to the locked contract in
// docs/roadmap/V3-18-role-model.md: role is a firm-defined controlled-vocabulary
// value above job title, assigned PER STEP as exactly ONE primary value (never a
// list), never auto-derived from a title; a role's FOOTPRINT = its steps across all
// workflows. AI may SUGGEST an ai-inferred role the user confirms (promote) or
// rejects (clear). LEVERAGE framing ONLY — no headcount / FTE / automatable-%. Role
// reuses the V3-16 generic provenance-tag core and NEVER feeds the opportunity score
// or any scorer. Real shipped source extracted/evaluated (see helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();
const serverSource = readServerSource();

const ROLE = ["operations", "analysis", "review-approval", "client-facing", "project-management", "specialist", "support"];

// Pure helpers + mutators + renderers. Role wrappers reuse the V3-16 generic core,
// so the core fns are included too (state-only; no persist/fetch here).
function coreSandbox(state) {
  return buildSandbox(source, {
    consts: ["ROLE_VALUES"],
    functions: [
      "isInAllowedSet", "structuralTagOf", "setStructuralTag", "applyStructuralSuggestion",
      "confirmStructuralTag", "rejectStructuralTag",
      "ensureRoleTags", "roleTagOf", "setRoleTag", "applyRoleSuggestion", "confirmRole", "rejectRole",
      "roleTagHtml", "rolePickerHtml", "stepRoleHtml",
      "provenanceBadgeHtml", "escapeHtml"
    ],
    globals: { state: state || { roleTags: {} } }
  });
}

// The async suggest action, with its side-effecting deps stubbed.
function suggestSandbox(state, steps, { requestJson, calls }) {
  return buildSandbox(source, {
    consts: ["ROLE_VALUES"],
    functions: [
      "suggestRole", "applyRoleSuggestion", "roleTagOf", "ensureRoleTags", "structuralTagOf",
      "applyStructuralSuggestion", "isInAllowedSet", "roleSuggestionInput", "structuralCellText"
    ],
    globals: {
      state,
      analysisGridSteps: () => steps,
      requestJson,
      persistState: () => { if (calls) calls.persist = (calls.persist || 0) + 1; },
      render: () => { if (calls) calls.render = (calls.render || 0) + 1; },
      toast: (m) => { if (calls) (calls.toast = calls.toast || []).push(m); }
    }
  });
}

// The pure footprint resolver (workflows passed as an argument).
function footprintSandbox() {
  return buildSandbox(source, {
    consts: ["ROLE_VALUES"],
    functions: ["buildRoleFootprints", "structuralTagOf", "isInAllowedSet"]
  });
}

// The footprint render, fed a stubbed session library.
function footprintRenderSandbox(library) {
  return buildSandbox(source, {
    consts: ["ROLE_VALUES"],
    functions: ["roleFootprintHtml", "collectRoleWorkflows", "buildRoleFootprints", "structuralTagOf", "isInAllowedSet", "escapeHtml"],
    globals: { getCombinedSessionLibrary: () => library }
  });
}

test("role is assigned per step as a SINGLE value (never a list); re-assign replaces (no co-ownership); invalid/empty clears", () => {
  const state = { roleTags: {} };
  const sb = coreSandbox(state);
  assert.equal(sb.setRoleTag("s1", "operations"), true);
  assert.deepEqual(state.roleTags.s1, { value: "operations", source: "user-stated", confidence: 1 });
  assert.equal(typeof state.roleTags.s1.value, "string", "the role value is a single scalar");
  assert.ok(!Array.isArray(state.roleTags.s1.value), "never a list");
  sb.setRoleTag("s1", "analysis");
  assert.equal(state.roleTags.s1.value, "analysis", "re-assign replaces the single primary role");
  assert.equal(Object.keys(state.roleTags).length, 1, "one tag for the step — no co-ownership");
  assert.equal(sb.setRoleTag("s1", "bogus"), false);
  assert.equal(state.roleTags.s1, undefined, "off-set clears (never stored)");
  sb.setRoleTag("s2", "support");
  sb.setRoleTag("s2", "");
  assert.equal(state.roleTags.s2, undefined, "empty clears");
});

test("AI suggestion stores an ai-inferred role (mocked, no live model); confidence normalized", () => {
  const state = { roleTags: {} };
  const sb = coreSandbox(state);
  assert.equal(sb.applyRoleSuggestion("s1", { value: "project-management", confidence: 0.7 }), true);
  assert.deepEqual(state.roleTags.s1, { value: "project-management", source: "ai-inferred", confidence: 0.7 });
  sb.applyRoleSuggestion("s2", { value: "analysis" });
  assert.equal(state.roleTags.s2.confidence, 0.5, "missing confidence → 0.5");
  sb.applyRoleSuggestion("s3", { value: "support", confidence: 9 });
  assert.equal(state.roleTags.s3.confidence, 0.5, "out-of-range confidence → 0.5");
});

test("GUARD 1: an off-set / empty / malformed suggestion writes NO key — never a fabricated role", () => {
  const state = { roleTags: {} };
  const sb = coreSandbox(state);
  assert.equal(sb.applyRoleSuggestion("s1", { value: "ceo", confidence: 0.9 }), false);
  assert.equal(sb.applyRoleSuggestion("s2", { value: "", confidence: 0.9 }), false);
  assert.equal(sb.applyRoleSuggestion("s3", null), false);
  assert.equal(sb.applyRoleSuggestion("s4", {}), false);
  assert.deepEqual(state.roleTags, {}, "no fabricated value is ever stored");
});

test("confirm promotes ai-inferred → user-stated (value preserved); reject deletes the key", () => {
  const state = { roleTags: { s1: { value: "client-facing", source: "ai-inferred", confidence: 0.6 } } };
  const sb = coreSandbox(state);
  assert.equal(sb.confirmRole("s1"), true);
  assert.deepEqual(state.roleTags.s1, { value: "client-facing", source: "user-stated", confidence: 1 });

  const state2 = { roleTags: { s1: { value: "client-facing", source: "ai-inferred", confidence: 0.6 } } };
  const sb2 = coreSandbox(state2);
  assert.equal(sb2.rejectRole("s1"), true);
  assert.equal(state2.roleTags.s1, undefined);
  assert.equal(sb2.confirmRole("nope"), false, "confirm is a no-op on an unassigned step");
});

test("an ai-inferred role never auto-hardens: stays ai-inferred on read; load passes through, never promotes", () => {
  const state = { roleTags: { s1: { value: "specialist", source: "ai-inferred", confidence: 0.6 } } };
  const sb = coreSandbox(state);
  assert.equal(sb.roleTagOf("s1").source, "ai-inferred", "read never hardens");
  const norm = extractFunction(source, "normalizeLoadedState");
  assert.ok(/roleTags:\s*parsed\.roleTags/.test(norm), "load passes roleTags through unchanged");
  assert.ok(!/roleTags[\s\S]{0,120}user-stated/.test(norm), "load never rewrites roleTags to user-stated");
});

test("ai-inferred renders distinct from a confirmed role (flat single-hue, no gradient); confirm/reject only for ai-inferred", () => {
  const state = {
    roleTags: {
      ai: { value: "analysis", source: "ai-inferred", confidence: 0.7 },
      us: { value: "operations", source: "user-stated", confidence: 1 }
    }
  };
  const sb = coreSandbox(state);
  const aiHtml = sb.roleTagHtml({ id: "ai" });
  const usHtml = sb.roleTagHtml({ id: "us" });
  assert.match(aiHtml, />AI</, 'ai-inferred shows the "AI" provenance badge');
  assert.match(aiHtml, /suggested/, "an unconfirmed suggestion reads as a suggestion, never as an asserted role");
  assert.match(aiHtml, /data-role-confirm="ai"/);
  assert.match(aiHtml, /data-role-reject="ai"/);
  assert.match(usHtml, />User</, 'user-stated shows the "User" provenance badge');
  assert.ok(!/data-role-(confirm|reject)/.test(usHtml), "a confirmed role shows no confirm/reject");
  assert.ok(!/suggested/.test(usHtml), "a confirmed role is not labelled (suggested)");
  assert.ok(!/gradient/i.test(aiHtml) && !/gradient/i.test(usHtml), "no gradient on the meaning-bearing tag");
});

test("byte-identical when unused: unassigned → null tag and empty tag HTML; empty footprint; allowed-set pinned", () => {
  const sb = coreSandbox({ roleTags: {} });
  assert.equal(sb.roleTagOf("nope"), null, "unassigned → null (never fabricated)");
  assert.equal(sb.roleTagHtml({ id: "nope" }), "", "unassigned → the role tag render returns ''");
  const fp = footprintSandbox();
  assert.deepEqual(fp.buildRoleFootprints([{ id: "w", steps: [{ id: "s", cells: {} }], roleTags: {} }]), {}, "no role tagged → empty footprint");
  const fr = footprintRenderSandbox([]);
  assert.equal(fr.roleFootprintHtml(), "", "no role anywhere → footprint render returns ''");
  const pinned = extractConst(source, "ROLE_VALUES");
  for (const r of ROLE) assert.ok(pinned.includes(`"${r}"`), `allowed-set pins ${r}`);
});

test("role FOOTPRINT = the steps tagged with each role, ACROSS all workflows (provenance preserved; off-set ignored)", () => {
  const fp = footprintSandbox();
  const workflows = [
    { id: "wfA", name: "Onboarding", steps: [
      { id: "a1", cells: { name: { value: "Collect docs" } } },
      { id: "a2", cells: { name: { value: "Verify" } } }
    ], roleTags: {
      a1: { value: "operations", source: "user-stated", confidence: 1 },
      a2: { value: "review-approval", source: "ai-inferred", confidence: 0.7 }
    } },
    { id: "wfB", name: "Renewal", steps: [
      { id: "b1", cells: { name: { value: "Pull data" } } }
    ], roleTags: {
      b1: { value: "operations", source: "user-stated", confidence: 1 }
    } }
  ];
  const out = fp.buildRoleFootprints(workflows);
  assert.deepEqual(Object.keys(out).sort(), ["operations", "review-approval"]);
  assert.equal(out.operations.length, 2, "operations spans 2 steps");
  assert.deepEqual(out.operations.map((h) => h.workflowId).sort(), ["wfA", "wfB"], "across 2 workflows");
  assert.equal(out.operations[0].stepName, "Collect docs", "step name carried");
  assert.equal(out["review-approval"][0].source, "ai-inferred", "provenance preserved per contributing step");
  const fp2 = fp.buildRoleFootprints([{ id: "x", steps: [{ id: "s", cells: {} }], roleTags: { s: { value: "bogus", source: "user-stated", confidence: 1 } } }]);
  assert.deepEqual(fp2, {}, "off-set role values never enter the footprint");
});

test("the footprint render is LEVERAGE-framed (no headcount / FTE / automatable-%) and shows steps-across-workflows", () => {
  const lib = [
    { sessionId: "wfA", workflowName: "Onboarding", state: { workflowGrid: { steps: [
      { id: "a1", cells: { name: { value: "Collect" } } }, { id: "a2", cells: { name: { value: "Verify" } } }
    ] }, roleTags: { a1: { value: "operations", source: "user-stated", confidence: 1 }, a2: { value: "operations", source: "user-stated", confidence: 1 } } } },
    { sessionId: "wfB", workflowName: "Renewal", state: { workflowGrid: { steps: [{ id: "b1", cells: { name: { value: "Pull" } } }] }, roleTags: { b1: { value: "analysis", source: "ai-inferred", confidence: 0.6 } } } }
  ];
  const sb = footprintRenderSandbox(lib);
  const html = sb.roleFootprintHtml();
  assert.match(html, /Role across workflows/);
  assert.match(html, /operations/);
  assert.match(html, /2 steps across 1 workflow/, "leverage view: steps across workflows");
  assert.match(html, /suggested, unconfirmed/, "an unconfirmed ai-inferred contribution is flagged");
  assert.ok(!/headcount|\bFTE\b|full-time equivalent|automatable|% *automat|percent *automat|automation +(potential|rate)/i.test(html), "no headcount / FTE / automatable-% in the footprint output");
});

test("role is STRICTLY SEPARATE from opportunity and the other lenses (functional deepEqual + source-level no-reference)", () => {
  // Functional: getStepOpportunityMeta is pure over the step's cells; role writes a
  // SEPARATE sidecar, so the score (and the other lens maps) are unchanged.
  const getStepOpportunityMeta = eval(`(${extractFunction(source, "getStepOpportunityMeta")})`);
  const step = { id: "s1", cells: {
    name: { value: "Reconcile balances", state: "confirmed", confidence: 0.9 },
    frequencyVolume: { value: "daily", state: "confirmed", confidence: 0.9 },
    dataProcessing: { value: "copy rows", state: "confirmed", confidence: 0.8 }
  } };
  const before = getStepOpportunityMeta(step);
  const state = { roleTags: {}, stepTypes: { s1: { value: "data-op", source: "user-stated", confidence: 1 } }, frictionTags: { s1: { value: "manual-entry", source: "ai-inferred", confidence: 0.6 } }, decisionTags: {}, handoffTags: {} };
  const otherLenses = JSON.parse(JSON.stringify({ stepTypes: state.stepTypes, frictionTags: state.frictionTags, decisionTags: state.decisionTags, handoffTags: state.handoffTags }));
  const sb = coreSandbox(state);
  sb.setRoleTag("s1", "operations");                                   // user-stated
  sb.applyRoleSuggestion("s1b", { value: "analysis", confidence: 0.8 }); // ai-inferred
  sb.confirmRole("s1");
  assert.deepEqual(getStepOpportunityMeta(step), before, "no-tag / ai-inferred / user-stated → identical opportunity");
  assert.deepEqual({ stepTypes: state.stepTypes, frictionTags: state.frictionTags, decisionTags: state.decisionTags, handoffTags: state.handoffTags }, otherLenses, "role tagging never touches the other lens maps");
  // Source-level: the scorers + the IR builder never read role state.
  for (const fn of ["getStepOpportunityMeta", "stepTrustSignals", "scoreRecipeReadiness", "buildAgentRecipeIr"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/roleTags|roleTagOf|setRoleTag|applyRoleSuggestion|ROLE_VALUES/.test(body), `${fn} must not reference role state`);
  }
});

test("the role path makes no grid write, no scoring call, no telemetry; only one model call (the narrow endpoint)", () => {
  for (const fn of ["setRoleTag", "applyRoleSuggestion", "confirmRole", "rejectRole", "roleTagOf", "roleTagHtml", "rolePickerHtml", "stepRoleHtml", "wireRole", "suggestRole", "roleSuggestionInput", "buildRoleFootprints", "collectRoleWorkflows", "roleFootprintHtml"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/patchField/.test(body), `${fn}: no grid write`);
    assert.ok(!/recordTelemetry|\/api\/telemetry/.test(body), `${fn}: no telemetry of the role value`);
    assert.ok(!/buildAgentRecipeIr|scoreRecipeReadiness|getStepOpportunityMeta/.test(body), `${fn}: never touches scorers`);
  }
  const suggest = extractFunction(source, "suggestRole");
  assert.ok(suggest.includes("/api/suggest-role"), "suggest uses the narrow role endpoint");
  assert.ok(!/\/api\/(recipe|chat|harvest-grid|business-case|suggest-step-type|suggest-structural-type|suggest-friction)/.test(suggest), "not the recipe/scoring/other suggest paths");
  for (const fn of ["setRoleTag", "applyRoleSuggestion", "confirmRole", "rejectRole", "roleTagHtml", "rolePickerHtml", "stepRoleHtml", "buildRoleFootprints"]) {
    assert.ok(!/requestJson|\/api\//.test(extractFunction(source, fn)), `${fn}: no server call`);
  }
});

test("suggest action: success stores ai-inferred; off-set server result writes no key; GUARD 2 failure / unknown-step are graceful", async () => {
  const stepsFix = [{ id: "s1", cells: { name: { value: "Reconcile balances" }, personaActors: { value: "Ops analyst" } } }];

  // success
  const stateOk = { roleTags: {} };
  const callsOk = {};
  const ok = suggestSandbox(stateOk, stepsFix, { requestJson: async () => ({ value: "operations", confidence: 0.8 }), calls: callsOk });
  assert.equal(await ok.suggestRole("s1"), true);
  assert.deepEqual(stateOk.roleTags.s1, { value: "operations", source: "ai-inferred", confidence: 0.8 });
  assert.equal(callsOk.persist, 1);

  // off-set server result → no key
  const stateOff = { roleTags: {} };
  const off = suggestSandbox(stateOff, stepsFix, { requestJson: async () => ({ value: "ceo", confidence: 0.9 }), calls: {} });
  assert.equal(await off.suggestRole("s1"), false);
  assert.equal(stateOff.roleTags.s1, undefined, "off-set server response → unassigned");

  // GUARD 2 — graceful failure: thrown error → no key, no crash, no persist
  const stateFail = { roleTags: {} };
  const callsFail = {};
  const fail = suggestSandbox(stateFail, stepsFix, { requestJson: async () => { throw new Error("network"); }, calls: callsFail });
  assert.equal(await fail.suggestRole("s1"), false, "failure resolves false, never throws");
  assert.equal(stateFail.roleTags.s1, undefined, "failure leaves the step unassigned");
  assert.equal(callsFail.persist, undefined, "no persist on failure");

  // unknown step id → false, writes nothing
  const stateMiss = { roleTags: {} };
  const miss = suggestSandbox(stateMiss, stepsFix, { requestJson: async () => ({ value: "support", confidence: 0.9 }), calls: {} });
  assert.equal(await miss.suggestRole("ghost"), false, "unknown step → false");
  assert.deepEqual(stateMiss.roleTags, {}, "unknown step writes nothing");
});

test("LEVERAGE-only: no headcount / FTE / automatable-% anywhere in the role model or labels", () => {
  const blob = [
    extractConst(source, "ROLE_VALUES"),
    extractFunction(source, "roleTagHtml"),
    extractFunction(source, "rolePickerHtml"),
    extractFunction(source, "stepRoleHtml"),
    extractFunction(source, "roleFootprintHtml"),
    extractFunction(source, "buildRoleFootprints"),
    extractFunction(source, "collectRoleWorkflows")
  ].join("\n");
  assert.ok(!/headcount|\bFTE\b|full-time equivalent|automatable|% *automat|percent *automat|automation +(potential|rate)/i.test(blob), "the role model + labels never express headcount / FTE / automatable-%");
});

test("server: /api/suggest-role is a descriptive classifier — validates the allowed-set, key-gated, never scoring; frames role above-title; forbids headcount/FTE/automatable-%", () => {
  assert.ok(/\/api\/suggest-role/.test(serverSource), "route registered");
  const handler = extractFunction(serverSource, "handleSuggestRole");
  assert.ok(/ROLE_VALUES_SERVER/.test(handler), "validates the model output against the allowed-set");
  assert.ok(/!getOpenAiKey\(\)/.test(handler) && /400/.test(handler), "empty key → 400 (offline)");
  assert.ok(!/opportunity|getStepOpportunity|computeBusinessCase|buildAgentRecipeIr|readiness|scoreRecipe/i.test(handler), "descriptive only — no scoring/opportunity");
  assert.ok(/manual-entry|operations[\s\S]*support/.test(extractConst(serverSource, "ROLE_VALUES_SERVER")) || /operations/.test(extractConst(serverSource, "ROLE_VALUES_SERVER")), "server allowed-set present");
  const pIdx = serverSource.indexOf("ROLE_SUGGEST_SYSTEM_PROMPT =");
  const promptSlice = pIdx >= 0 ? serverSource.slice(pIdx, pIdx + 1400) : "";
  assert.ok(/above a job title/i.test(promptSlice) && /title-category/i.test(promptSlice), "prompt frames role as a category above the job title");
  assert.ok(/never derived from a title/i.test(promptSlice), "prompt forbids deriving role from a title string");
  assert.ok(/never assess[\s\S]*headcount[\s\S]*FTE/i.test(promptSlice), "prompt forbids headcount / FTE / automatable-%");
  assert.ok(/DESCRIPTIVE classification ONLY/i.test(promptSlice), "the prompt is descriptive-only");
});

test("no firm names / banned phrase in the new role code (client + server)", () => {
  const pIdx = serverSource.indexOf("ROLE_SUGGEST_SYSTEM_PROMPT =");
  const promptSlice = pIdx >= 0 ? serverSource.slice(pIdx, pIdx + 1400) : "";
  const blob = [
    extractFunction(source, "suggestRole"),
    extractFunction(source, "roleTagHtml"),
    extractFunction(source, "rolePickerHtml"),
    extractFunction(source, "stepRoleHtml"),
    extractFunction(source, "roleFootprintHtml"),
    extractFunction(serverSource, "handleSuggestRole"),
    extractConst(source, "ROLE_VALUES"),
    promptSlice
  ].join("\n");
  assert.ok(!/work with your development team/i.test(blob), "banned phrase absent");
  assert.ok(!/compliance approved|approved for use/i.test(blob), "no compliance-approval claims");
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i.test(blob), "no firm names");
});
