// V3-14 — Portfolio dimensions & capacity. Executed, deterministic tests (NO live
// LLM) over the pure capacity model + adapter + rollup render. Proves the locked
// decisions: value/hours from explicit business-case snapshots only (valueComputed
// :false contributes nothing, never $0); persona-band rates only (blank ⇒ "not
// computed", never fabricated); fully-loaded cost AND bill shown separately;
// recurring run-rate ⟂ one-off project savings (never blended); shared persona+step
// work de-duplicated; provenance preserved + inferred-never-hardens; FTE denominator
// is ANNUAL HOURS (1920), not weeks; byte-identical when unused; no telemetry/model/
// grid-write. Real shipped source (helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

const modelSandbox = () => buildSandbox(source, { functions: ["buildPortfolioCapacityModel"] });
const adapterSandbox = () => buildSandbox(source, { functions: ["capacityItemFromSession", "normalizeCapacityPersona"] });
const renderSandbox = () => buildSandbox(source, {
  consts: ["usdRound"],
  functions: ["renderPortfolioCapacityRollupHtml", "provenanceBadgeHtml"],
  globals: { escapeHtml: (s) => String(s == null ? "" : s) }
});

// A flat capacity item (what buildPortfolioCapacityModel consumes).
function item(over = {}) {
  return {
    id: "w1", name: "WF", isCurrent: false, isSample: false, valueComputed: true, mode: "recurring",
    recurringHours: 480, recurringValue: 48000, projectHours: null, projectValue: null,
    persona: "Analyst", personaKey: "analyst", personaProvenance: { source: "user-stated", confidence: 0.9 },
    department: "Operations", departmentProvenance: { source: "user-stated", confidence: 1 },
    dedupKey: "analyst|step-a", ...over
  };
}

test("recurring run-rate and one-off project savings are kept strictly separate (never blended)", () => {
  const { buildPortfolioCapacityModel } = modelSandbox();
  const bands = { bands: { analyst: { fullyLoadedCost: 100, billRate: 150 } }, hoursPerFteYear: 1920, weeklyHoursBasis: 40 };
  const m = buildPortfolioCapacityModel([
    item({ id: "r1", mode: "recurring", recurringHours: 1920, personaKey: "analyst", persona: "Analyst", department: "Ops", dedupKey: "a" }),
    item({ id: "p1", mode: "project", projectHours: 200, projectValue: 30000, recurringHours: null, dedupKey: "b" })
  ], bands);
  assert.equal(m.usable, true);
  assert.equal(m.recurringTotals.hours, 1920);
  assert.equal(m.recurringTotals.cost, 192000);
  assert.equal(m.recurringTotals.bill, 288000);
  assert.equal(m.projectTotals.hours, 200, "project hours tracked separately");
  assert.equal(m.projectTotals.value, 30000);
  assert.equal(m.projectTotals.count, 1);
  // The run-rate totals must contain ONLY the recurring workflow — project never folded in.
  assert.equal(m.recurringTotals.hours, 1920, "project hours never added to run-rate");
});

test("FTE denominator is ANNUAL HOURS (default 1920 = 48 weeks × 40), not weeks", () => {
  const { buildPortfolioCapacityModel } = modelSandbox();
  const def = buildPortfolioCapacityModel([item({ recurringHours: 1920, personaKey: "analyst", dedupKey: "x" })], { bands: { analyst: { fullyLoadedCost: 100 } } });
  assert.equal(def.hoursPerFteYear, 1920, "default seed is 1920 annual hours");
  assert.equal(def.recurringTotals.fte, 1.0, "1920 hrs ÷ 1920 = 1.0 FTE (not ~40)");
  // Default seed is wired in defaultState as annual hours, never the 48-week count.
  assert.ok(/capacityBands:\s*\{\s*bands:\s*\{\},\s*hoursPerFteYear:\s*1920,\s*weeklyHoursBasis:\s*40\s*\}/.test(source), "defaultState seeds hoursPerFteYear=1920, weeklyHoursBasis=40");
});

test("value/hours come from explicit business-case only — valueComputed:false contributes nothing (never $0)", () => {
  const { buildPortfolioCapacityModel } = modelSandbox();
  const m = buildPortfolioCapacityModel([
    item({ id: "computed", valueComputed: true, mode: "recurring", recurringHours: 960, personaKey: "analyst", dedupKey: "c" }),
    item({ id: "uncomputed", valueComputed: false, mode: "", recurringHours: null, projectHours: null, dedupKey: "u" })
  ], { bands: { analyst: { fullyLoadedCost: 100, billRate: 150 } } });
  assert.equal(m.recurringTotals.hours, 960, "only the computed workflow contributes");
  assert.equal(m.recurringTotals.cost, 96000);
  const personaCount = m.departments.reduce((n, d) => n + d.personas.length, 0);
  assert.equal(personaCount, 1, "the uncomputed workflow adds no persona row (no fabricated $0)");
});

test("a blank persona band → cost/bill 'not computed' (null), never fabricated or defaulted to $0", () => {
  const { buildPortfolioCapacityModel } = modelSandbox();
  const m = buildPortfolioCapacityModel(
    [item({ recurringHours: 1000, personaKey: "manager", persona: "Manager", department: "Ops", dedupKey: "m" })],
    { bands: {} } // no manager band; usable via the department tag
  );
  const p = m.departments[0].personas[0];
  assert.equal(p.cost, null, "blank band → cost not computed (null)");
  assert.equal(p.bill, null, "blank band → bill not computed (null)");
  assert.equal(m.recurringTotals.cost, 0, "no fabricated cost added to the total");
  assert.equal(m.recurringTotals.costComputed, false, "the total is flagged partial");
  assert.ok(m.notComputed.length >= 1, "the not-computed persona is surfaced");
});

test("fully-loaded cost and bill rate are computed SEPARATELY (one blank does not affect the other)", () => {
  const { buildPortfolioCapacityModel } = modelSandbox();
  const m = buildPortfolioCapacityModel(
    [item({ recurringHours: 1000, personaKey: "analyst", dedupKey: "a" })],
    { bands: { analyst: { billRate: 150 } } } // fully-loaded blank, bill present
  );
  const p = m.departments[0].personas[0];
  assert.equal(p.cost, null, "fully-loaded blank → not computed");
  assert.equal(p.bill, 150000, "bill computed independently");
  assert.equal(m.recurringTotals.costComputed, false);
  assert.equal(m.recurringTotals.billComputed, true);
});

test("shared persona+step work (identical dedup key) is counted once", () => {
  const { buildPortfolioCapacityModel } = modelSandbox();
  const m = buildPortfolioCapacityModel([
    item({ id: "w1", recurringHours: 500, personaKey: "analyst", dedupKey: "same" }),
    item({ id: "w2", recurringHours: 500, personaKey: "analyst", dedupKey: "same" }),
    item({ id: "w3", recurringHours: 300, personaKey: "analyst", dedupKey: "diff" })
  ], { bands: { analyst: { fullyLoadedCost: 100 } } });
  assert.equal(m.dedupedCount, 1, "the duplicate-mapped workflow is de-duplicated");
  assert.equal(m.recurringTotals.hours, 800, "500 (first 'same') + 300 (diff); the duplicate 500 is excluded");
});

test("current session and the guided sample are excluded from capacity", () => {
  const { buildPortfolioCapacityModel } = modelSandbox();
  const m = buildPortfolioCapacityModel([
    item({ id: "real", recurringHours: 100, personaKey: "analyst", dedupKey: "r" }),
    item({ id: "cur", isCurrent: true, recurringHours: 9999, personaKey: "analyst", dedupKey: "c" }),
    item({ id: "samp", isSample: true, recurringHours: 8888, personaKey: "analyst", dedupKey: "s" })
  ], { bands: { analyst: { fullyLoadedCost: 100 } } });
  assert.equal(m.recurringTotals.hours, 100, "current + sample never counted");
});

test("usable:false (no band rate + no department tag) ⇒ the rollup renders nothing (byte-identical unused)", () => {
  const { buildPortfolioCapacityModel } = modelSandbox();
  const m = buildPortfolioCapacityModel([item({ recurringHours: 1000, personaKey: "analyst", department: "", dedupKey: "a" })], { bands: {} });
  assert.equal(m.usable, false);
  const { renderPortfolioCapacityRollupHtml } = renderSandbox();
  assert.equal(renderPortfolioCapacityRollupHtml(m), "", "unusable model → no rollup, no fabricated figures");
  assert.equal(renderPortfolioCapacityRollupHtml({ usable: false }), "");
});

test("the rollup shows fully-loaded cost AND bill rate side by side, labelled as estimates", () => {
  const { buildPortfolioCapacityModel } = modelSandbox();
  const { renderPortfolioCapacityRollupHtml } = renderSandbox();
  const m = buildPortfolioCapacityModel([item({ recurringHours: 1000, personaKey: "analyst", dedupKey: "a" })], { bands: { analyst: { fullyLoadedCost: 100, billRate: 150 } } });
  const html = renderPortfolioCapacityRollupHtml(m);
  assert.ok(/Fully-loaded/.test(html) && /Bill/.test(html), "both lenses present and labelled");
  assert.ok(/run-rate/i.test(html), "labelled as the recurring run-rate");
});

test("adapter reads value/hours/mode from the stored business-case snapshot only", () => {
  const { capacityItemFromSession } = adapterSandbox();
  const recurring = capacityItemFromSession({ sessionId: "s1", workflowName: "WF1", state: {
    businessCaseSnapshot: { workflowMode: "role", results: { annualHours: 1920, annualValue: 192000 } },
    workflowGrid: { steps: [{ cells: { name: { value: "Collect" }, personaActors: { value: "Analyst, Ops", source: "user-stated", confidence: 0.9 } } }] },
    sessionMeta: { departmentTag: { value: "Operations", source: "user-stated", confidence: 1 } }
  } }, "");
  assert.equal(recurring.valueComputed, true);
  assert.equal(recurring.mode, "recurring");
  assert.equal(recurring.recurringHours, 1920);
  assert.equal(recurring.personaKey, "analyst", "primary persona normalized from the cell");
  assert.equal(recurring.personaProvenance.source, "user-stated");
  assert.equal(recurring.department, "Operations");

  const proj = capacityItemFromSession({ sessionId: "s2", state: { businessCaseSnapshot: { workflowMode: "project", results: { totalHours: 200, projectValue: 30000 } }, workflowGrid: { steps: [] }, sessionMeta: {} } }, "");
  assert.equal(proj.mode, "project");
  assert.equal(proj.projectHours, 200);

  const none = capacityItemFromSession({ sessionId: "s3", state: { workflowGrid: { steps: [] }, sessionMeta: {} } }, "");
  assert.equal(none.valueComputed, false, "no snapshot → not computed");
  assert.equal(none.recurringHours, null, "no fabricated hours");
});

test("adapter flags current + sample and preserves an inferred department tag (never hardens to asserted)", () => {
  const { capacityItemFromSession } = adapterSandbox();
  const samp = capacityItemFromSession({ sessionId: "s", state: { sessionMeta: { isSample: true }, workflowGrid: { steps: [] } } }, "");
  assert.equal(samp.isSample, true);
  const cur = capacityItemFromSession({ sessionId: "cur", state: { sessionMeta: {}, workflowGrid: { steps: [] } } }, "cur");
  assert.equal(cur.isCurrent, true);
  const inferred = capacityItemFromSession({ sessionId: "s", state: { sessionMeta: { departmentTag: { value: "Finance", source: "ai-inferred", confidence: 0.4 } }, workflowGrid: { steps: [] } } }, "");
  assert.equal(inferred.departmentProvenance.source, "ai-inferred", "an inferred tag stays inferred");
  assert.equal(inferred.departmentProvenance.confidence, 0.4, "its confidence is preserved, not promoted");
});

test("the capacity path touches no telemetry, makes no model/server call, and writes no grid cell", () => {
  for (const name of ["buildPortfolioCapacityModel", "capacityItemFromSession", "renderPortfolioCapacityRollupHtml", "renderPortfolioCapacityHtml", "renderCapacityAssumptionsEditorHtml", "normalizeCapacityPersona"]) {
    const body = extractFunction(source, name);
    assert.ok(!/value_num|telemetr|recordTelemetry|\/api\/telemetry/i.test(body), `${name} must not touch telemetry`);
    assert.ok(!/buildAgentRecipeIr|requestJson|\bfetch\s*\(|\/api\/recipe|\/api\/chat|\/api\/extract/.test(body), `${name} must make no model/server call`);
    assert.ok(!/patchField/.test(body), `${name} must not write a grid cell`);
  }
});

test("byte-identical when unused: no portfolio ⇒ the capacity mount renders nothing", () => {
  const mount = extractFunction(source, "renderPortfolioCapacityHtml");
  assert.ok(/if \(!portfolio\.length\) return "";/.test(mount), "no portfolio → returns '' (adds nothing to the tab)");
  // And the model fabricates nothing when there is nothing computed/usable.
  const { buildPortfolioCapacityModel } = modelSandbox();
  const empty = buildPortfolioCapacityModel([], {});
  assert.equal(empty.usable, false);
  assert.deepEqual(empty.departments, []);
  assert.equal(empty.recurringTotals.cost, 0);
  assert.equal(empty.projectTotals.value, 0);
});

test("no firm names and no banned phrase in the capacity feature", () => {
  const code = [
    "buildPortfolioCapacityModel", "capacityItemFromSession", "renderPortfolioCapacityRollupHtml",
    "renderPortfolioCapacityHtml", "renderCapacityAssumptionsEditorHtml", "wireCapacitySection"
  ].map((n) => extractFunction(source, n)).join("\n");
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i.test(code), "no firm names");
  assert.ok(!/work with your development team/i.test(code), "banned phrase absent");
});
