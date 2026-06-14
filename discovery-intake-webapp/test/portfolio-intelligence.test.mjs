// Executed tests for V3-6 portfolio intelligence — the cross-workflow value ×
// readiness model and its clustering. Real shipped source extracted and
// evaluated (see test/helpers/extract.mjs). The trust spine here:
//   * VALUE comes ONLY from each session's stored businessCaseSnapshot (an
//     explicit user compute) — never telemetry, never a recompute. Absent →
//     valueComputed:false, NEVER fabricated as $0.
//   * READINESS is the canonical client scorer aggregated per workflow.
//   * The current session is held SEPARATE and never blended into portfolio
//     totals.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// Pure model helpers (no app deps) extracted together.
function modelSandbox() {
  return buildSandbox(source, {
    functions: ["buildPortfolioModel", "buildPortfolioClusters", "portfolioRankScore"]
  });
}

test("portfolio ranks by value × readiness on fixtures", () => {
  const { buildPortfolioModel } = modelSandbox();
  const items = [
    { id: "a", name: "A", valueComputed: true, value: 100000, readinessScore: 80, tokens: [], isCurrent: false },
    { id: "b", name: "B", valueComputed: true, value: 100000, readinessScore: 40, tokens: [], isCurrent: false },
    { id: "c", name: "C", valueComputed: true, value: 200000, readinessScore: 80, tokens: [], isCurrent: false }
  ];
  // rank keys: c = 200000*0.80 = 160000; a = 100000*0.80 = 80000; b = 100000*0.40 = 40000
  const model = buildPortfolioModel(items, "");
  assert.deepEqual(model.ranked.map((i) => i.id), ["c", "a", "b"]);
  assert.equal(model.totals.sessionCount, 3);
  assert.equal(model.totals.totalValue, 400000);
  assert.equal(model.totals.avgReadiness, Math.round((80 + 40 + 80) / 3));
});

test("value comes from the stored snapshot only — absent value is never fabricated as $0", () => {
  const { buildPortfolioModel, portfolioRankScore } = modelSandbox();
  const items = [
    { id: "x", name: "X", valueComputed: false, value: null, readinessScore: 90, tokens: [], isCurrent: false },
    { id: "y", name: "Y", valueComputed: true, value: 50000, readinessScore: 50, tokens: [], isCurrent: false }
  ];
  const model = buildPortfolioModel(items, "");
  // Valued workflow ranks ahead of the unvalued one (which sorts last on a
  // negative key) — the high-readiness unvalued workflow is NOT treated as top.
  assert.deepEqual(model.ranked.map((i) => i.id), ["y", "x"]);
  assert.equal(model.ranked.find((i) => i.id === "x").value, null, "unvalued stays null, never $0");
  assert.equal(model.totals.valuedCount, 1);
  assert.equal(model.totals.unvaluedCount, 1);
  assert.equal(model.totals.totalValue, 50000, "unvalued workflow contributes nothing, not 0-as-value");
  assert.equal(portfolioRankScore({ valueComputed: false, value: null, readinessScore: 99 }), -1);
});

test("current session is separated and never blended into portfolio totals", () => {
  const { buildPortfolioModel } = modelSandbox();
  const items = [
    { id: "cur", name: "Current", valueComputed: true, value: 999999, readinessScore: 100, tokens: [], isCurrent: true },
    { id: "p1", name: "P1", valueComputed: true, value: 1000, readinessScore: 50, tokens: [], isCurrent: false }
  ];
  const model = buildPortfolioModel(items, "cur");
  assert.equal(model.current.id, "cur");
  assert.equal(model.totals.sessionCount, 1, "portfolio excludes the current session");
  assert.equal(model.totals.totalValue, 1000, "current session value is not blended into the portfolio total");
  assert.ok(!model.ranked.some((i) => i.id === "cur"), "current session is not in the ranked portfolio list");
});

test("clusters group workflows that share a system/knowledge token (>= 2)", () => {
  const { buildPortfolioClusters } = modelSandbox();
  const items = [
    { id: "a", tokens: ["sharepoint", "excel"] },
    { id: "b", tokens: ["sharepoint", "teams"] },
    { id: "c", tokens: ["outlook"] }
  ];
  const clusters = buildPortfolioClusters(items);
  assert.equal(clusters.length, 1, "only the shared token forms a cluster");
  assert.equal(clusters[0].key, "sharepoint");
  assert.deepEqual([...clusters[0].sessionIds].sort(), ["a", "b"]);
});

test("portfolioItemFromSession reads stored value + scored readiness; absent snapshot → not fabricated", () => {
  const { portfolioItemFromSession } = buildSandbox(source, {
    functions: ["portfolioItemFromSession", "readinessLabelForScore", "portfolioSessionTokens"],
    globals: {
      // Canonical scorers are stubbed (they have a deep dep chain of their own);
      // the portfolio adapter only needs their numeric/category outputs.
      scoreRecipeReadiness: () => ({ score: 70 }),
      getStepOpportunityMeta: () => ({ tier: "quick-win" })
    }
  });

  const withBc = portfolioItemFromSession({
    sessionId: "s1", workflowName: "WF1",
    state: {
      businessCaseSnapshot: { workflowMode: "role", results: { annualValue: 12000, projectValue: 0 } },
      workflowGrid: { steps: [{ cells: { systemsTools: { value: "SharePoint, Excel" } } }] },
      systems: [{ name: "Teams" }]
    }
  }, "");
  assert.equal(withBc.valueComputed, true);
  assert.equal(withBc.value, 12000, "value read from the stored snapshot");
  assert.equal(withBc.readinessScore, 70);
  assert.equal(withBc.readinessLabel, "Usable with caveats");
  assert.deepEqual([...withBc.tokens].sort(), ["excel", "sharepoint", "teams"]);
  assert.equal(withBc.tier, "quick-win");

  const noBc = portfolioItemFromSession({
    sessionId: "s2", workflowName: "WF2",
    state: { workflowGrid: { steps: [{ cells: {} }] } }
  }, "");
  assert.equal(noBc.valueComputed, false);
  assert.equal(noBc.value, null, "absent business case is never fabricated as $0");
});

test("remote-only session (no full state) is counted but value/readiness are not fabricated", () => {
  const { portfolioItemFromSession } = buildSandbox(source, {
    functions: ["portfolioItemFromSession", "readinessLabelForScore", "portfolioSessionTokens"],
    globals: {
      scoreRecipeReadiness: () => ({ score: 70 }),
      getStepOpportunityMeta: () => ({ tier: "quick-win" })
    }
  });
  const remote = portfolioItemFromSession({ id: "r1", workflowName: "Remote", remoteOnly: true }, "");
  assert.equal(remote.hasState, false);
  assert.equal(remote.valueComputed, false);
  assert.equal(remote.value, null);
  assert.equal(remote.readinessScore, null);
  assert.deepEqual(remote.tokens, []);
});

test("readiness label bands mirror the recipe readiness thresholds", () => {
  const { readinessLabelForScore } = buildSandbox(source, { functions: ["readinessLabelForScore"] });
  assert.equal(readinessLabelForScore(85), "Ready for controlled use");
  assert.equal(readinessLabelForScore(80), "Ready for controlled use");
  assert.equal(readinessLabelForScore(79), "Usable with caveats");
  assert.equal(readinessLabelForScore(60), "Usable with caveats");
  assert.equal(readinessLabelForScore(35), "Draft until confirmed");
  assert.equal(readinessLabelForScore(34), "Not enough information");
  assert.equal(readinessLabelForScore(0), "Not enough information");
});

test("the portfolio path invokes no recompute, no engine call, and no telemetry read", () => {
  for (const name of [
    "portfolioItemFromSession",
    "buildPortfolioModel",
    "buildPortfolioClusters",
    "portfolioRankScore",
    "portfolioSessionTokens",
    "portfolioIntelligenceHtml"
  ]) {
    const body = extractFunction(source, name);
    assert.ok(!body.includes("/api/business-case"), `${name} must not call the business-case engine`);
    assert.ok(!body.includes("requestJson"), `${name} must not fetch`);
    assert.ok(!/\bfetch\s*\(/.test(body), `${name} must not fetch`);
    assert.ok(!body.includes("computeBusinessCase"), `${name} must not (re)compute the business case`);
    assert.ok(!/value_num|telemetr|emitEvent|recordEvent/i.test(body), `${name} must not read telemetry`);
  }
});
