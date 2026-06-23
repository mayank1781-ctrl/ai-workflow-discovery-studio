// A-3 — Portfolio Lens Heatmap: five-rung × role grid, four lenses (opportunity /
// shape / risk / readiness), confirmed-only totals, whyBlocked surfaced.
// Tests use source-level extraction (buildSandbox) — no DOM, no live engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Sandbox ────────────────────────────────────────────────────────────────────

function a3Sandbox(stateOverride = {}) {
  const stateObj = { roleTags: {}, solutionShapes: {}, a3Lens: "opportunity", ...stateOverride };
  return buildSandbox(source, {
    consts: ["A3_RUNGS", "A3_RUNG_LABEL", "A3_OPP_COLOR", "A3_SHAPE_COLOR", "A3_SENS_COLOR"],
    functions: [
      "a3RoleFor", "a3OppTier", "a3ShapeFor", "a3SensFor",
      "a3CapacityLensEnabled", "a3CellHtml", "a3HeatmapTableHtml",
      "a3LensSelectorHtml", "a3ShapeMixBarHtml", "a3BlockedHtml",
      "a3RiskTableHtml", "a3EmptyHtml", "a3PortfolioLensHtml",
      "escapeHtml"
    ],
    globals: {
      state: stateObj,
      getStepOpportunityMeta: (step) => ({ tier: step._mockTier || "quick-win", label: "Quick Win", priority: 1, principleScores: {} }),
      gridCellValue: (step, key) => (step._mockCells && step._mockCells[key]) || "",
      stepDisplayName: (s, i) => s.name || `Step ${i + 1}`,
      dashKpiVal: (lv, key) => (lv && lv._mockKpis && lv._mockKpis[key] != null ? lv._mockKpis[key] : null),
      engineAdjacency: () => null,
      persistState: () => {},
      renderAnalysisTabDashboard: () => {},
      setAnalysisTab: () => {},
      document: { getElementById: () => null },
      console: { warn() {}, error() {}, info() {} }
    }
  });
}

function makeStep(opts = {}) {
  return {
    id: opts.id || "s1",
    cls: opts.cls || "gather",
    name: opts.name || "Step A",
    workActions: opts.workActions || [],
    workbenchConfirmed: opts.confirmed ?? false,
    _mockTier: opts.tier || "quick-win",
    _mockCells: opts.cells || {}
  };
}

function makeLv(opts = {}) {
  return {
    confirmedCount: opts.confirmedCount ?? 2,
    note: opts.note || null,
    _mockKpis: opts.kpis || {}
  };
}

// ── a3EmptyHtml ───────────────────────────────────────────────────────────────

test("a3EmptyHtml: default message contains 'Portfolio Lens' and workbench CTA", () => {
  const { a3EmptyHtml } = a3Sandbox();
  const out = a3EmptyHtml();
  assert.ok(out.includes("Portfolio Lens"), "Portfolio Lens title present");
  assert.ok(out.includes("data-a3-to-workbench"), "workbench CTA attribute present");
  assert.ok(out.includes("Workbench"), "Workbench mentioned");
});

test("a3EmptyHtml: custom note rendered", () => {
  const { a3EmptyHtml } = a3Sandbox();
  const out = a3EmptyHtml("Custom loading message");
  assert.ok(out.includes("Custom loading message"), "custom note shown");
});

// ── empty state when no confirmed records ─────────────────────────────────────

test("a3PortfolioLensHtml: lv.note → returns empty state", () => {
  const { a3PortfolioLensHtml } = a3Sandbox();
  const out = a3PortfolioLensHtml({ note: "Engine loading…", confirmedCount: 0 }, [], []);
  assert.ok(out.includes("data-a3-to-workbench"), "empty state CTA present");
  assert.ok(out.includes("Engine loading"), "note text shown");
});

test("a3PortfolioLensHtml: confirmedCount=0 → empty state", () => {
  const { a3PortfolioLensHtml } = a3Sandbox();
  const out = a3PortfolioLensHtml({ confirmedCount: 0 }, [], []);
  assert.ok(out.includes("data-a3-to-workbench"), "empty state CTA present");
  assert.ok(!out.includes("data-a3-lens"), "no lens selector in empty state");
});

test("a3PortfolioLensHtml: null lv → empty state", () => {
  const { a3PortfolioLensHtml } = a3Sandbox();
  const out = a3PortfolioLensHtml(null, [], []);
  assert.ok(out.includes("data-a3-to-workbench"), "empty state on null lv");
});

// ── confirmed-only totals ─────────────────────────────────────────────────────

test("a3PortfolioLensHtml: unconfirmed steps noted but not counted", () => {
  const { a3PortfolioLensHtml } = a3Sandbox();
  const steps = [
    makeStep({ id: "s1", confirmed: true }),
    makeStep({ id: "s2", confirmed: false })
  ];
  const out = a3PortfolioLensHtml(makeLv({ confirmedCount: 1 }), steps, []);
  assert.ok(out.includes("1 confirmed step"), "confirmed count shown");
  assert.ok(out.includes("not counted"), "explicit 'not counted' label");
  assert.ok(out.includes("1 unconfirmed"), "unconfirmed count shown");
});

test("a3PortfolioLensHtml: all confirmed → no 'not counted' note", () => {
  const { a3PortfolioLensHtml } = a3Sandbox();
  const steps = [
    makeStep({ id: "s1", confirmed: true }),
    makeStep({ id: "s2", confirmed: true })
  ];
  const out = a3PortfolioLensHtml(makeLv({ confirmedCount: 2 }), steps, []);
  assert.ok(!out.includes("not counted"), "no 'not counted' when all confirmed");
});

// ── capacity lens guard ───────────────────────────────────────────────────────

test("a3LensSelectorHtml: no capacity lens button", () => {
  const src = extractFunction(source, "a3LensSelectorHtml");
  assert.ok(!src.includes('data-a3-lens="capacity"'), "no capacity lens button in selector");
  assert.ok(!src.includes("capacity"), "capacity word absent from lens selector source");
});

test("a3LensSelectorHtml: renders all four expected lens buttons", () => {
  const { a3LensSelectorHtml } = a3Sandbox();
  const out = a3LensSelectorHtml("opportunity");
  assert.ok(out.includes('data-a3-lens="opportunity"'), "opportunity lens button present");
  assert.ok(out.includes('data-a3-lens="shape"'), "shape lens button present");
  assert.ok(out.includes('data-a3-lens="risk"'), "risk lens button present");
  assert.ok(out.includes('data-a3-lens="readiness"'), "readiness lens button present");
});

test("a3CapacityLensEnabled: no KPIs → false", () => {
  const { a3CapacityLensEnabled } = a3Sandbox();
  assert.equal(a3CapacityLensEnabled(makeLv()), false, "disabled when no cost/flow KPIs");
  assert.equal(a3CapacityLensEnabled(null), false, "disabled for null lv");
});

test("a3CapacityLensEnabled: cost_to_serve + gross_capacity present → true", () => {
  const { a3CapacityLensEnabled } = a3Sandbox();
  const lv = makeLv({ kpis: { cost_to_serve: 100, gross_capacity: 200 } });
  assert.equal(a3CapacityLensEnabled(lv), true, "enabled when both KPIs present");
});

// ── solution-shape mix ────────────────────────────────────────────────────────

test("a3ShapeMixBarHtml: shape mix visible when shapes assigned", () => {
  const sb = a3Sandbox({ solutionShapes: { s1: { value: "rag", source: "user-stated" }, s2: { value: "prompt", source: "user-stated" } } });
  const steps = [makeStep({ id: "s1" }), makeStep({ id: "s2" })];
  const out = sb.a3ShapeMixBarHtml(steps, makeLv());
  assert.ok(out.includes("RAG"), "RAG label visible");
  assert.ok(out.includes("#4D8BFF"), "RAG color present");
  assert.ok(out.includes("Prompt"), "Prompt label visible");
  assert.ok(out.includes("Solution-shape mix"), "section heading present");
});

test("a3ShapeMixBarHtml: no shapes → honest empty message, no fabricated data", () => {
  const { a3ShapeMixBarHtml } = a3Sandbox();
  const out = a3ShapeMixBarHtml([makeStep({ id: "s1" })], makeLv());
  assert.ok(out.includes("No solution shapes captured"), "honest empty message shown");
  assert.ok(!out.includes("Prompt"), "no fabricated shape data");
});

// ── data / control risk ───────────────────────────────────────────────────────

test("a3RiskTableHtml: PII step shown in risk table with correct color", () => {
  const { a3RiskTableHtml } = a3Sandbox();
  const step = makeStep({ id: "s1", name: "Process PII report", cells: { dataSensitivity: "PII" } });
  const out = a3RiskTableHtml([step]);
  assert.ok(out.includes("PII"), "PII sensitivity shown");
  assert.ok(out.includes("#FF4FD8"), "PII color (#FF4FD8) present");
  assert.ok(out.includes("Process PII report"), "step name present");
  assert.ok(out.includes("Data"), "Data &amp; control risk heading present");
});

test("a3RiskTableHtml: Client Confidential uses amber color", () => {
  const { a3RiskTableHtml } = a3Sandbox();
  const step = makeStep({ id: "s1", cells: { dataSensitivity: "Client Confidential" } });
  const out = a3RiskTableHtml([step]);
  assert.ok(out.includes("#FFB454"), "amber color for Client Confidential");
});

test("a3RiskTableHtml: no elevated sensitivity → honest 'no elevated' message", () => {
  const { a3RiskTableHtml } = a3Sandbox();
  const out = a3RiskTableHtml([makeStep({ id: "s1", cells: { dataSensitivity: "Internal" } })]);
  assert.ok(out.includes("No elevated"), "honest 'no elevated' message when no risky steps");
  assert.ok(!out.includes("<table"), "no table rendered for clean steps");
});

// ── whyBlocked surfaced ───────────────────────────────────────────────────────

test("a3BlockedHtml: adj.whyBlocked reason surfaced", () => {
  const { a3BlockedHtml } = a3Sandbox();
  const adj = { whyBlocked: [{ reason: "Data tier mismatch", workflows: ["Workflow A", "Workflow B"] }] };
  const out = a3BlockedHtml([], adj);
  assert.ok(out.includes("Data tier mismatch"), "whyBlocked reason shown");
  assert.ok(out.includes("Workflow A"), "blocked workflow name shown");
});

test("a3BlockedHtml: adj=null → blocked section still renders (no crash)", () => {
  const { a3BlockedHtml } = a3Sandbox();
  const out = a3BlockedHtml([], null);
  assert.ok(out.includes("Blocked / protected"), "blocked section header present even with null adj");
  assert.ok(out.includes("No blocked steps"), "honest 'no blocked' message");
});

test("a3BlockedHtml: human_held step appears in blocked section", () => {
  const { a3BlockedHtml } = a3Sandbox();
  const step = makeStep({ id: "s1", cls: "human_held", name: "Counterparty call" });
  const out = a3BlockedHtml([step], null);
  assert.ok(out.includes("Human-held by design"), "human_held flagged in blocked section");
  assert.ok(out.includes("Counterparty call"), "step name shown in blocked section");
});

// ── a3CellHtml ────────────────────────────────────────────────────────────────

test("a3CellHtml: empty cellSteps → em-dash cell with a3-empty class", () => {
  const { a3CellHtml } = a3Sandbox();
  const out = a3CellHtml([], "opportunity");
  assert.ok(out.includes("a3-empty"), "a3-empty class on empty cell");
  assert.ok(out.includes("—"), "em-dash shown");
});

test("a3CellHtml: opportunity lens quick-win → teal color (#00d4b4)", () => {
  const { a3CellHtml } = a3Sandbox();
  const steps = [makeStep({ id: "s1", tier: "quick-win" })];
  const out = a3CellHtml(steps, "opportunity");
  assert.ok(out.includes("#00d4b4"), "quick-win teal color present");
});

test("a3CellHtml: readiness lens shows confirmed/total ratio", () => {
  const { a3CellHtml } = a3Sandbox();
  const steps = [
    makeStep({ id: "s1", confirmed: true }),
    makeStep({ id: "s2", confirmed: false })
  ];
  const out = a3CellHtml(steps, "readiness");
  assert.ok(out.includes("1/2"), "confirmed/total ratio shown");
  assert.ok(out.includes("#FFB454"), "partial amber color for partial confirmation");
});

test("a3CellHtml: shape lens rag → blue color (#4D8BFF)", () => {
  const sb = a3Sandbox({ solutionShapes: { s1: { value: "rag" } } });
  const steps = [makeStep({ id: "s1" })];
  const out = sb.a3CellHtml(steps, "shape");
  assert.ok(out.includes("#4D8BFF"), "rag blue color present");
});

// ── separation invariants (source-level) ──────────────────────────────────────

test("separation: a3* functions do not call patchField or invent scoring", () => {
  const fns = [
    "a3CellHtml", "a3HeatmapTableHtml", "a3LensSelectorHtml",
    "a3ShapeMixBarHtml", "a3BlockedHtml", "a3RiskTableHtml",
    "a3EmptyHtml", "a3PortfolioLensHtml", "wireA3"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("patchField"), `${fn}: no patchField`);
    assert.ok(!src.includes("/api/portfolio"), `${fn}: no invented endpoint`);
    assert.ok(!src.includes("fetch("), `${fn}: no fetch`);
  }
});

test("separation: renderAnalysisTabDashboard calls a3PortfolioLensHtml typeof-guarded", () => {
  const src = extractFunction(source, "renderAnalysisTabDashboard");
  assert.ok(src.includes("a3PortfolioLensHtml"), "a3PortfolioLensHtml called from renderAnalysisTabDashboard");
  assert.ok(src.includes("typeof a3PortfolioLensHtml"), "typeof guard present");
  assert.ok(src.includes("wireA3"), "wireA3 called from renderAnalysisTabDashboard");
});

// ── rail-clean (source-level) ─────────────────────────────────────────────────

test("rail-clean: a3* functions contain no headcount/reduction vocabulary", () => {
  const fns = [
    "a3CellHtml", "a3HeatmapTableHtml", "a3LensSelectorHtml",
    "a3ShapeMixBarHtml", "a3BlockedHtml", "a3RiskTableHtml",
    "a3EmptyHtml", "a3PortfolioLensHtml"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("headcount"), `${fn}: no headcount`);
    assert.ok(!src.includes("reduction"), `${fn}: no reduction`);
    assert.ok(!src.includes("eliminat"), `${fn}: no eliminate`);
    assert.ok(!src.includes("layoff"), `${fn}: no layoff`);
  }
});

test("rail-clean: a3* functions contain no banned output phrase", () => {
  const fns = ["a3EmptyHtml", "a3PortfolioLensHtml", "a3BlockedHtml", "a3RiskTableHtml"];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("work with your development team"), `${fn}: banned phrase absent`);
  }
});
