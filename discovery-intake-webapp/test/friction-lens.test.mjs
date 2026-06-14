// V3-17 — Friction lens (ANNOTATE-ONLY). Executed, deterministic tests (NO live
// model — the suggest path is stubbed). The USER is the provenance: a friction
// flag is user-authored. AI may SUGGEST an ai-inferred flag (+ optional note) that
// the user confirms (promote) or rejects (clear); the value is a descriptive KIND,
// never a numeric pain score. Reuses the V3-16 generic provenance-tag core for
// value + provenance + promotion; the optional note is layered on top. Covers:
// manual (user-stated) + note, AI-suggest (ai-inferred) with taxonomy validation +
// graceful failure (the two guards), confirm (promote, note preserved) / reject,
// ai-inferred never auto-hardens, distinct rendering, byte-identical-when-unused,
// and the hard rail that friction NEVER feeds or alters opportunity. Real shipped
// source extracted/evaluated (see helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();
const serverSource = readServerSource();

// The pinned friction taxonomy (a separate test asserts this matches the real
// FRICTION_KINDS / FRICTION_VALUES consts).
const FRICTION = ["manual-entry", "system-switching", "rework", "waiting", "error-prone"];

// Pure helpers + mutators + renderers. The friction wrappers reuse the V3-16
// generic core, so the core fns are included too (state-only; no persist/fetch).
function coreSandbox(state) {
  return buildSandbox(source, {
    consts: ["FRICTION_KINDS"],
    functions: [
      "isInAllowedSet", "structuralTagOf", "setStructuralTag", "applyStructuralSuggestion",
      "confirmStructuralTag", "rejectStructuralTag",
      "ensureFrictionTags", "sanitizeFrictionNote", "frictionTagOf",
      "setFrictionTag", "applyFrictionSuggestion", "confirmFriction", "rejectFriction",
      "frictionTagHtml", "frictionPickerHtml", "stepFrictionHtml",
      "provenanceBadgeHtml", "escapeHtml"
    ],
    globals: { state: state || { frictionTags: {} } }
  });
}

// The async suggest action, with its side-effecting deps stubbed.
function suggestSandbox(state, steps, { requestJson, calls }) {
  return buildSandbox(source, {
    consts: ["FRICTION_KINDS"],
    functions: [
      "suggestFriction", "applyFrictionSuggestion", "sanitizeFrictionNote", "frictionTagOf",
      "ensureFrictionTags", "structuralTagOf", "applyStructuralSuggestion", "isInAllowedSet",
      "frictionSuggestionInput", "structuralCellText"
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

test("manual friction annotation writes a user-stated tag (+ note); an invalid/empty value clears it", () => {
  const state = { frictionTags: {} };
  const sb = coreSandbox(state);
  assert.equal(sb.setFrictionTag("s1", "manual-entry", "the Excel work, not the upload"), true);
  assert.deepEqual(state.frictionTags.s1, { value: "manual-entry", source: "user-stated", confidence: 1, note: "the Excel work, not the upload" });
  // a tag with no note carries no note key (byte-stable envelope)
  assert.equal(sb.setFrictionTag("s2", "waiting"), true);
  assert.deepEqual(state.frictionTags.s2, { value: "waiting", source: "user-stated", confidence: 1 });
  // off-set / empty clears (the note goes with it) — never a fabricated value
  assert.equal(sb.setFrictionTag("s1", "bogus", "x"), false);
  assert.equal(state.frictionTags.s1, undefined, "off-set clears");
  sb.setFrictionTag("s2", "");
  assert.equal(state.frictionTags.s2, undefined, "empty clears");
});

test("AI suggestion stores an ai-inferred tag (mocked, no live model); confidence normalized; suggested note carried", () => {
  const state = { frictionTags: {} };
  const sb = coreSandbox(state);
  assert.equal(sb.applyFrictionSuggestion("s1", { value: "system-switching", confidence: 0.7, note: "toggles 3 systems" }), true);
  assert.deepEqual(state.frictionTags.s1, { value: "system-switching", source: "ai-inferred", confidence: 0.7, note: "toggles 3 systems" });
  sb.applyFrictionSuggestion("s2", { value: "rework" });
  assert.equal(state.frictionTags.s2.confidence, 0.5, "missing confidence → 0.5");
  assert.equal(state.frictionTags.s2.note, undefined, "no note key when none suggested");
  sb.applyFrictionSuggestion("s3", { value: "waiting", confidence: 9 });
  assert.equal(state.frictionTags.s3.confidence, 0.5, "out-of-range confidence → 0.5");
});

test("GUARD 1: an off-set / empty / malformed suggestion writes NO key — never a fabricated friction flag", () => {
  const state = { frictionTags: {} };
  const sb = coreSandbox(state);
  assert.equal(sb.applyFrictionSuggestion("s1", { value: "automate", confidence: 0.9 }), false);
  assert.equal(sb.applyFrictionSuggestion("s2", { value: "", confidence: 0.9 }), false);
  assert.equal(sb.applyFrictionSuggestion("s3", null), false);
  assert.equal(sb.applyFrictionSuggestion("s4", {}), false);
  // a well-formed note cannot rescue an invalid/absent kind
  assert.equal(sb.applyFrictionSuggestion("s5", { note: "very painful", confidence: 0.9 }), false);
  assert.deepEqual(state.frictionTags, {}, "no fabricated value is ever stored");
});

test("confirm promotes ai-inferred → user-stated (value AND note preserved); reject clears", () => {
  const state = { frictionTags: { s1: { value: "rework", source: "ai-inferred", confidence: 0.6, note: "double keying" } } };
  const sb = coreSandbox(state);
  assert.equal(sb.confirmFriction("s1"), true);
  assert.deepEqual(state.frictionTags.s1, { value: "rework", source: "user-stated", confidence: 1, note: "double keying" });

  const state2 = { frictionTags: { s1: { value: "rework", source: "ai-inferred", confidence: 0.6 } } };
  const sb2 = coreSandbox(state2);
  assert.equal(sb2.rejectFriction("s1"), true);
  assert.equal(state2.frictionTags.s1, undefined);
  assert.equal(sb2.confirmFriction("nope"), false, "confirm is a no-op on an untagged step");
});

test("an ai-inferred friction flag never auto-hardens: stays ai-inferred on read; load passes through, never promotes", () => {
  const state = { frictionTags: { s1: { value: "waiting", source: "ai-inferred", confidence: 0.6, note: "waits on approver" } } };
  const sb = coreSandbox(state);
  assert.equal(sb.frictionTagOf("s1").source, "ai-inferred", "read never hardens");
  assert.equal(sb.frictionTagOf("s1").note, "waits on approver", "the note survives a read");
  const norm = extractFunction(source, "normalizeLoadedState");
  assert.ok(/frictionTags:\s*parsed\.frictionTags/.test(norm), "load passes frictionTags through unchanged");
  assert.ok(!/frictionTags[\s\S]{0,120}user-stated/.test(norm), "load never rewrites friction tags to user-stated");
});

test("ai-inferred renders distinct from a confirmed user flag (flat single-hue, no gradient); confirm/reject only for ai-inferred; note shown", () => {
  const state = {
    frictionTags: {
      ai: { value: "manual-entry", source: "ai-inferred", confidence: 0.7, note: "rekeys totals" },
      us: { value: "waiting", source: "user-stated", confidence: 1 }
    }
  };
  const sb = coreSandbox(state);
  const aiHtml = sb.frictionTagHtml({ id: "ai" });
  const usHtml = sb.frictionTagHtml({ id: "us" });
  assert.match(aiHtml, />AI</, 'ai-inferred shows the "AI" provenance badge');
  assert.match(aiHtml, /suggested/, "an unconfirmed suggestion reads as a suggestion, never as an asserted user flag");
  assert.match(aiHtml, /rekeys totals/, "the note is shown");
  assert.match(aiHtml, /data-friction-confirm="ai"/);
  assert.match(aiHtml, /data-friction-reject="ai"/);
  assert.match(usHtml, />User</, 'user-stated shows the "User" provenance badge');
  assert.ok(!/data-friction-(confirm|reject)/.test(usHtml), "a confirmed user flag shows no confirm/reject");
  assert.ok(!/suggested/.test(usHtml), "a confirmed user flag is not labelled (suggested)");
  assert.ok(!/gradient/i.test(aiHtml) && !/gradient/i.test(usHtml), "no gradient on the meaning-bearing tag");
});

test("byte-identical when unused: untagged → null tag and empty tag HTML; taxonomy pinned", () => {
  const sb = coreSandbox({ frictionTags: {} });
  assert.equal(sb.frictionTagOf("nope"), null, "untagged → null (never fabricated)");
  assert.equal(sb.frictionTagHtml({ id: "nope" }), "", "untagged → the friction tag render returns ''");
  const pinned = extractConst(source, "FRICTION_KINDS");
  assert.ok(/manual-entry[\s\S]*system-switching[\s\S]*rework[\s\S]*waiting[\s\S]*error-prone/.test(pinned), "taxonomy pinned to the 5 kinds");
});

test("the picker exposes all friction kinds, a note field, and AI-suggest (additive); stepFrictionHtml mounts the control without an asserted tag", () => {
  const sb = coreSandbox({ frictionTags: {} });
  const picker = sb.frictionPickerHtml({ id: "s1" });
  for (const k of FRICTION) assert.match(picker, new RegExp(`value="${k}"`), `picker offers ${k}`);
  assert.match(picker, /data-friction-id="s1"/, "kind select wired by step id");
  assert.match(picker, /data-friction-note="s1"/, "the \"what's painful here\" note input is present");
  assert.match(picker, /data-friction-suggest="s1"/, "AI-suggest action present");
  const block = sb.stepFrictionHtml({ id: "s1" });
  assert.match(block, /data-friction-id="s1"/, "stepFrictionHtml includes the picker (additive control)");
  assert.ok(!/Friction: <strong/.test(block), "no asserted tag text when unused");
  assert.equal(sb.stepFrictionHtml({}), "", "no step id → empty");
});

test("friction is STRICTLY SEPARATE from opportunity (functional deepEqual + source-level no-reference)", () => {
  // Functional: getStepOpportunityMeta is pure over the step's cells (it reads the
  // pre-existing painFriction CELL, but never the friction-LENS sidecar). Tagging
  // friction writes a SEPARATE sidecar, so the opportunity score is unchanged.
  const getStepOpportunityMeta = eval(`(${extractFunction(source, "getStepOpportunityMeta")})`);
  const step = { id: "s1", cells: {
    name: { value: "Reconcile balances", state: "confirmed", confidence: 0.9 },
    frequencyVolume: { value: "daily", state: "confirmed", confidence: 0.9 },
    dataProcessing: { value: "copy rows", state: "confirmed", confidence: 0.8 },
    painFriction: { value: "manual and slow", state: "confirmed", confidence: 0.7 }
  } };
  const before = getStepOpportunityMeta(step);
  const state = { frictionTags: {} };
  const sb = coreSandbox(state);
  sb.setFrictionTag("s1", "manual-entry", "the Excel work");              // user-stated
  sb.applyFrictionSuggestion("s1b", { value: "waiting", confidence: 0.8 }); // ai-inferred
  assert.deepEqual(getStepOpportunityMeta(step), before, "no-tag / ai-inferred / user-stated → identical opportunity");
  // Source-level: the scorers never read the friction-lens state (the pre-existing
  // painFriction cell key is a different thing and is allowed).
  for (const fn of ["getStepOpportunityMeta", "stepTrustSignals", "scoreRecipeReadiness"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/frictionTags|frictionTagOf|setFrictionTag|applyFrictionSuggestion|FRICTION_KINDS/.test(body), `${fn} must not reference friction-lens state`);
  }
});

test("the friction path makes no grid write, no scoring call, no telemetry; only one model call (the narrow endpoint)", () => {
  for (const fn of ["setFrictionTag", "applyFrictionSuggestion", "confirmFriction", "rejectFriction", "frictionTagOf", "frictionTagHtml", "frictionPickerHtml", "stepFrictionHtml", "wireFriction", "suggestFriction", "frictionSuggestionInput", "sanitizeFrictionNote"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/patchField/.test(body), `${fn}: no grid write`);
    assert.ok(!/recordTelemetry|\/api\/telemetry/.test(body), `${fn}: no telemetry of the friction value`);
    assert.ok(!/buildAgentRecipeIr|scoreRecipeReadiness|getStepOpportunityMeta/.test(body), `${fn}: never touches scorers`);
  }
  const suggest = extractFunction(source, "suggestFriction");
  assert.ok(suggest.includes("/api/suggest-friction"), "suggest uses the narrow friction endpoint");
  assert.ok(!/\/api\/(recipe|chat|harvest-grid|business-case|suggest-step-type|suggest-structural-type)/.test(suggest), "not the recipe/scoring/other suggest paths");
  for (const fn of ["setFrictionTag", "applyFrictionSuggestion", "confirmFriction", "rejectFriction", "frictionTagHtml", "frictionPickerHtml", "stepFrictionHtml"]) {
    assert.ok(!/requestJson|\/api\//.test(extractFunction(source, fn)), `${fn}: no server call`);
  }
});

test("suggest action: success stores ai-inferred (+ note); off-set server result writes no key; GUARD 2 failure is graceful", async () => {
  const stepsFix = [{ id: "s1", cells: { name: { value: "Reconcile balances" }, painFriction: { value: "manual" } } }];

  // success
  const stateOk = { frictionTags: {} };
  const callsOk = {};
  const ok = suggestSandbox(stateOk, stepsFix, { requestJson: async () => ({ value: "manual-entry", confidence: 0.8, note: "rekeys rows" }), calls: callsOk });
  assert.equal(await ok.suggestFriction("s1"), true);
  assert.deepEqual(stateOk.frictionTags.s1, { value: "manual-entry", source: "ai-inferred", confidence: 0.8, note: "rekeys rows" });
  assert.equal(callsOk.persist, 1);

  // off-set server result → no key (stubbed model response)
  const stateOff = { frictionTags: {} };
  const off = suggestSandbox(stateOff, stepsFix, { requestJson: async () => ({ value: "automate", confidence: 0.9 }), calls: {} });
  assert.equal(await off.suggestFriction("s1"), false);
  assert.equal(stateOff.frictionTags.s1, undefined, "off-set server response → untagged");

  // GUARD 2 — graceful failure: thrown error → no key, no crash, no persist
  const stateFail = { frictionTags: {} };
  const callsFail = {};
  const fail = suggestSandbox(stateFail, stepsFix, { requestJson: async () => { throw new Error("network"); }, calls: callsFail });
  assert.equal(await fail.suggestFriction("s1"), false, "failure resolves false, never throws");
  assert.equal(stateFail.frictionTags.s1, undefined, "failure leaves the step untagged");
  assert.equal(callsFail.persist, undefined, "no persist on failure");

  // unknown step id → false, writes nothing, never throws
  const stateMiss = { frictionTags: {} };
  const miss = suggestSandbox(stateMiss, stepsFix, { requestJson: async () => ({ value: "rework", confidence: 0.9 }), calls: {} });
  assert.equal(await miss.suggestFriction("ghost"), false, "unknown step → false");
  assert.deepEqual(stateMiss.frictionTags, {}, "unknown step writes nothing");
});

test("server: /api/suggest-friction is a descriptive classifier — validates the taxonomy, key-gated, never scoring, never a pain score", () => {
  assert.ok(/\/api\/suggest-friction/.test(serverSource), "route registered");
  const handler = extractFunction(serverSource, "handleSuggestFriction");
  assert.ok(/FRICTION_VALUES/.test(handler), "validates the model output against the taxonomy");
  assert.ok(/!getOpenAiKey\(\)/.test(handler) && /400/.test(handler), "empty key → 400 (offline)");
  assert.ok(!/opportunity|getStepOpportunity|computeBusinessCase|buildAgentRecipeIr|readiness|scoreRecipe/i.test(handler), "descriptive only — no scoring/opportunity");
  // The taxonomy const matches the client's FRICTION_KINDS.
  assert.ok(/manual-entry[\s\S]*system-switching[\s\S]*rework[\s\S]*waiting[\s\S]*error-prone/.test(extractConst(serverSource, "FRICTION_VALUES")), "server taxonomy pinned to the 5 kinds");
  // The system prompt forbids a numeric pain score (friction is never a fabricated number).
  const pIdx = serverSource.indexOf("FRICTION_SUGGEST_SYSTEM_PROMPT =");
  const promptSlice = pIdx >= 0 ? serverSource.slice(pIdx, pIdx + 1200) : "";
  assert.ok(/never a pain score or magnitude/i.test(promptSlice), "the prompt explicitly forbids a pain score / magnitude");
  assert.ok(/DESCRIPTIVE classification ONLY/i.test(promptSlice), "the prompt is descriptive-only");
});

test("no firm names / banned phrase in the new friction code (client + server)", () => {
  const pIdx = serverSource.indexOf("FRICTION_SUGGEST_SYSTEM_PROMPT =");
  const promptSlice = pIdx >= 0 ? serverSource.slice(pIdx, pIdx + 1200) : "";
  const blob = [
    extractFunction(source, "suggestFriction"),
    extractFunction(source, "frictionTagHtml"),
    extractFunction(source, "frictionPickerHtml"),
    extractFunction(source, "stepFrictionHtml"),
    extractFunction(source, "frictionSuggestionInput"),
    extractFunction(serverSource, "handleSuggestFriction"),
    extractConst(source, "FRICTION_KINDS"),
    promptSlice
  ].join("\n");
  assert.ok(!/work with your development team/i.test(blob), "banned phrase absent");
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i.test(blob), "no firm names");
});
