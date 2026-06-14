// V3-9 — Guided first-run / sample workflow. Executed, deterministic tests (NO
// live LLM). The two hardest guarantees are asserted directly:
//   (1) clearGuidedSampleState over a sample-loaded state deep-equals
//       normalizeLoadedState({}) on every workflow-bearing field, with
//       onboarding.dismissed=true as the ONLY delta (byte-identical clean start);
//   (2) the sample is excluded from buildPortfolioModel/portfolioItemFromSession
//       and never server-persisted.
// Plus: no model/fakery in the sample path, structural-only telemetry, honest
// labels, no firm names / banned phrase. Real shipped source (helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

// --- (2) sample excluded from the portfolio -----------------------------------

test("the sample is excluded from portfolio totals, ranking, and clusters", () => {
  const { buildPortfolioModel } = buildSandbox(source, {
    functions: ["buildPortfolioModel", "buildPortfolioClusters", "portfolioRankScore"]
  });
  const items = [
    { id: "real1", isSample: false, valueComputed: true, value: 1000, readinessScore: 50, tokens: [] },
    { id: "sample", isSample: true, valueComputed: true, value: 999999, readinessScore: 100, tokens: ["x", "y"] }
  ];
  const model = buildPortfolioModel(items, "");
  assert.equal(model.totals.sessionCount, 1, "sample is not counted");
  assert.equal(model.totals.totalValue, 1000, "sample value never enters totals");
  assert.ok(!model.ranked.some((i) => i.id === "sample"), "sample is not ranked");
  assert.ok(!model.clusters.some((c) => c.sessionIds.includes("sample")), "sample not clustered");
});

test("portfolioItemFromSession flags an isSample session from its stored meta", () => {
  const { portfolioItemFromSession } = buildSandbox(source, {
    functions: ["portfolioItemFromSession", "readinessLabelForScore", "portfolioSessionTokens"],
    globals: { scoreRecipeReadiness: () => ({ score: 70 }), getStepOpportunityMeta: () => ({ tier: "quick-win" }) }
  });
  const sample = portfolioItemFromSession({ sessionId: "s", state: { sessionMeta: { isSample: true }, workflowGrid: { steps: [{ cells: {} }] } } }, "");
  assert.equal(sample.isSample, true);
  const real = portfolioItemFromSession({ sessionId: "s2", state: { sessionMeta: {}, workflowGrid: { steps: [{ cells: {} }] } } }, "");
  assert.equal(real.isSample, false);
});

test("the sample is never written to the server library and never listed as a saved session", () => {
  // Server guard (source-level): saveSessionToServer bails on an isSample state.
  const save = extractFunction(source, "saveSessionToServer");
  assert.ok(/isSample/.test(save), "saveSessionToServer guards against persisting the sample");
  // Saved-list visibility (functional): an isSample entry is hidden even with steps.
  const { savedSessionVisibleInList } = buildSandbox(source, { functions: ["savedSessionVisibleInList"] });
  assert.equal(savedSessionVisibleInList({ stepCount: 3, isSample: true }), false);
  assert.equal(savedSessionVisibleInList({ stepCount: 3, state: { sessionMeta: { isSample: true } } }), false);
  assert.equal(savedSessionVisibleInList({ stepCount: 3, workflowName: "Real workflow" }), true, "a real session stays visible");
});

// --- (1) byte-identical clean start after dismiss -----------------------------

function cleanFixture() {
  return {
    workflowGrid: { schemaVersion: 1, steps: [], dataSensitivityBaseline: { value: "", state: "empty", confidence: "", source: "" }, stepListLocked: false },
    steps: [], data: [], systems: [], decisions: [], patterns: [],
    conversation: [], aiChat: [], transcript: "",
    businessCaseSnapshot: null, businessCaseSnapshotPrior: null, businessCaseScenarios: [],
    appliedKnowledge: [], auditTrail: [], evalSuites: {},
    artifactCompiler: { compiled: {}, compiledPrior: {}, bundles: {}, bundlePrior: {}, reviewed: {} },
    sessionMeta: { id: "default", name: "", workflowName: "" },
    appMode: "interview", demoCaseId: "strategy-workshop-prep",
    onboarding: { dismissed: false }
  };
}

test("clearGuidedSampleState returns a clean start — onboarding.dismissed=true is the ONLY delta, no sample residue", () => {
  const { clearGuidedSampleState } = buildSandbox(source, {
    functions: ["clearGuidedSampleState"],
    globals: { normalizeLoadedState: () => cleanFixture() }
  });
  // A sample-loaded state: clean shape PLUS sample residue that must not survive.
  const sampleState = {
    ...cleanFixture(),
    workflowGrid: { schemaVersion: 1, steps: [{ id: "x", cells: { name: { value: "Collect", state: "confirmed", confidence: 0.9, source: "doc-extracted" } } }], dataSensitivityBaseline: { value: "Medium", state: "inferred", confidence: "" }, stepListLocked: false },
    appMode: "analysis", analysisActiveTab: "grid",
    sessionMeta: { id: "sample-1", name: "Sample", workflowName: "Sample", isSample: true },
    onboarding: { dismissed: false }
  };
  const cleared = clearGuidedSampleState(sampleState);
  const clean = cleanFixture();
  for (const key of Object.keys(clean)) {
    if (key === "onboarding") continue;
    assert.deepEqual(cleared[key], clean[key], `${key} is reset to the clean start (no sample residue)`);
  }
  assert.deepEqual(cleared.workflowGrid.steps, [], "sample grid steps are gone");
  assert.ok(!cleared.sessionMeta.isSample, "the isSample flag is gone");
  assert.equal(cleared.onboarding.dismissed, true, "the only retained delta: dismissed=true");
  assert.deepEqual({ ...cleared.onboarding, dismissed: false }, clean.onboarding, "nothing else in onboarding diverged");
});

test("dismiss (no sample active) just records onboarding.dismissed; the sample branch clears via clearGuidedSampleState", () => {
  const st = { sessionMeta: {}, onboarding: { dismissed: false } };
  const calls = { persist: 0, render: 0, close: 0 };
  const { dismissGuidedFirstRun } = buildSandbox(source, {
    functions: ["dismissGuidedFirstRun", "clearGuidedSampleState"],
    globals: {
      state: st,
      normalizeLoadedState: () => cleanFixture(),
      closeGuidedFirstRun: () => { calls.close += 1; },
      persistState: () => { calls.persist += 1; },
      render: () => { calls.render += 1; }
    }
  });
  dismissGuidedFirstRun();
  assert.equal(st.onboarding.dismissed, true, "non-sample dismiss sets the flag (no state wipe)");
  assert.equal(calls.persist, 1);
  assert.equal(calls.close, 1);
  // The sample branch routes through clearGuidedSampleState (source-level).
  const body = extractFunction(source, "dismissGuidedFirstRun");
  assert.ok(/isSample/.test(body) && /clearGuidedSampleState/.test(body), "sample dismiss clears via clearGuidedSampleState");
});

// --- first-run gating + onboarding flag ---------------------------------------

test("onboarding defaults to not-dismissed, is backfilled on load, and gates the first-run overlay", () => {
  assert.ok(/onboarding:\s*\{\s*dismissed:\s*false\s*\}/.test(extractConst(source, "defaultState")), "defaultState declares onboarding.dismissed=false");
  assert.ok(/onboarding:/.test(extractFunction(source, "normalizeLoadedState")), "normalizeLoadedState backfills onboarding");
  const maybe = extractFunction(source, "maybeShowGuidedFirstRun");
  assert.ok(/onboarding[\s\S]*dismissed/.test(maybe), "first-run checks the dismissed flag");
  assert.ok(/sessionHasContent/.test(maybe), "first-run only auto-opens on an empty session");
  assert.ok(/isSample/.test(maybe), "first-run does not auto-open over the sample");
});

// --- real flow, no fakery, no hidden model call -------------------------------

test("the sample loads through the REAL grid builder, is flagged, and fabricates no scores", () => {
  const load = extractFunction(source, "loadGuidedSample");
  assert.ok(load.includes("buildWorkflowGridFromExtraction"), "sample is built by the real grid builder");
  assert.ok(/isSample:\s*true/.test(load), "the sample session is flagged isSample");
  assert.ok(!/getStepOpportunityMeta|scoreRecipeReadiness|buildAgentRecipeIr/.test(load), "scores/IR are NOT fabricated — they compute downstream from the real grid");
  assert.ok(!/compiledPrior|rotateArtifactSnapshot/.test(load), "no fabricated artifact snapshot");
});

test("nothing in the guided path makes a model/extraction call; telemetry is structural via the single gated client path", () => {
  for (const name of ["loadGuidedSample", "clearGuidedSampleState", "dismissGuidedFirstRun", "maybeShowGuidedFirstRun", "openGuidedFirstRun"]) {
    const body = extractFunction(source, name);
    assert.ok(!/\/api\/recipe|\/api\/chat|\/api\/extract|extractDocument/.test(body), `${name} must make no model/extraction call`);
    assert.ok(!/requestJson/.test(body), `${name} must not call the server directly`);
  }
  const load = extractFunction(source, "loadGuidedSample");
  assert.ok(load.includes("recordTelemetryClient"), "telemetry routes through the single gated client emitter");
  assert.ok(!load.includes("/api/telemetry"), "no raw telemetry endpoint call");
});

test("real builder produces genuine provenance-tagged cells from a sample extraction (no fabrication)", () => {
  const sb = buildSandbox(source, {
    consts: ["EXTRACTION_CELL_KEY_MAP", "GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"],
    functions: ["buildWorkflowGridFromExtraction", "newWorkflowGrid", "newGridStep", "newGridCell", "newAiPatternEntry", "patchField", "deriveLegacyCellSource", "makeId"],
    globals: { state: { sessionMeta: {} }, console: { warn() {}, info() {}, error() {} }, currentGridStep: () => null }
  });
  const grid = sb.buildWorkflowGridFromExtraction({
    workflowName: "Sample workflow",
    steps: [{ cells: { workflowStep: { value: "Collect inputs", state: "confirmed", confidence: 0.9 }, systemsTools: { value: "Email", state: "confirmed", confidence: 0.8 } } }]
  });
  assert.equal(grid.steps.length, 1, "a real grid step is produced");
  assert.equal(grid.steps[0].cells.name.value, "Collect inputs");
  assert.equal(grid.steps[0].cells.name.source, "doc-extracted", "cells carry real provenance, not a fabricated value");
});

// --- honesty + neutrality -----------------------------------------------------

test("the sample is labeled illustrative/synthetic and introduces the four signals; no firm names or banned phrase", () => {
  const config = extractConst(source, "GUIDED_SAMPLE_CONFIG");
  assert.ok(/Synthetic \/ sample/.test(config), "the sample is labeled Synthetic / sample");
  const modal = extractFunction(source, "guidedFirstRunModalHtml");
  assert.ok(/[Ii]llustrative/.test(modal), "the overlay labels the sample illustrative");
  for (const signal of ["Extraction confidence", "Opportunity", "Readiness", "Provenance"]) {
    assert.ok(modal.includes(signal), `the overlay introduces the "${signal}" signal`);
  }
  const newCode = extractConst(source, "SAMPLE_EXTRACTION") + config + modal + extractFunction(source, "loadGuidedSample");
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i.test(newCode), "no firm names in the sample/onboarding");
  assert.ok(!/work with your development team/i.test(newCode), "banned phrase absent");
});
