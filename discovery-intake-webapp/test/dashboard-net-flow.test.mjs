// E5 — Executive Dashboard (capacity net of cost-to-serve + flow). The Dashboard is a RENDER
// LAYER: every figure is read from engine.buildLeaderView() + engine.cycleTime(); the render
// computes nothing. Confirmed-only, firewalled, rail-guarded (surface:"dashboard"), labeled
// placeholders, never-a-dead-end empty state. Tests per DASHBOARD_KPI_VISUAL_SPEC §6.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const near = (a, b, t) => Math.abs(a - b) <= t;

// A small confirmed-mostly department fixture (mirrors the mockup): 4 confirmed + 1 unconfirmed.
const FPA = engine.FPA_INTAKE;
const withLife = (lc) => ({ ...FPA, header: { ...FPA.header, lifecycle: lc } });
const HEAVY = { avgTaskMin: 8, baseInTokens: 8000, baseOutTokens: 1500, agenticMultiplier: 30, retryFactor: 3 };
const TREASURY = { ...FPA, header: { ...FPA.header, persona: "Treasury analyst", lifecycle: "confirmed" }, steps: [{ step: "Real-time exposure pack", cls: "assembly", data: "MNPI", time: 100, theo: 40, touch: 40, wait: 0, waitKind: "reducible" }], cost: HEAVY };
const DEPT = [withLife("in-telemetry"), withLife("specified"), withLife("confirmed"), TREASURY, { ...FPA, recap: { confirmed: false } }];

function dashSandbox() {
  return buildSandbox(source, {
    consts: ["DASH", "DASH_LIFE"],
    functions: [
      "studioEngine", "engineProvValue", "engineStepClass", "engineDataTier", "appStepToEngineStep", "appWorkflowToIntake", "engineLeaderView",
      "dashFmtUsd", "dashKpi", "dashKpiVal", "dashProvDot", "dashPlaceholder", "dashboardModel",
      "dashHeaderHtml", "dashEvidenceChainHtml", "dashCapacityNetHtml", "dashFlowHtml", "dashAgendasHtml", "dashEmptyHtml",
    ],
    globals: { window: { StudioEngine: engine }, escapeHtml: (s) => String(s == null ? "" : s), gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown", stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [], recipeConnectionSeams: () => [], analysisWorkflowName: () => "" },
  });
}

const LV = engine.buildLeaderView(DEPT);

test("confirmed-only: the leader view counts 4 confirmed / 1 skipped; the header renders both", () => {
  const sb = dashSandbox();
  assert.equal(LV.confirmedCount, 4);
  assert.equal(LV.skippedUnconfirmed, 1);
  const html = sb.dashHeaderHtml(LV);
  assert.match(html, /4<\/span> <span[^>]*>confirmed units · 1 unconfirmed skipped/);
});

test("each KPI tile value EQUALS its buildLeaderView KPI (gross / cost / net / policy-gap / realization-gap)", () => {
  const sb = dashSandbox();
  const cap = sb.dashCapacityNetHtml(LV), agendas = sb.dashAgendasHtml(LV);
  assert.ok(cap.includes(sb.dashFmtUsd(sb.dashKpiVal(LV, "gross_capacity"))), "gross tile == KPI");
  assert.ok(cap.includes(sb.dashFmtUsd(sb.dashKpiVal(LV, "cost_to_serve"))), "cost tile == KPI");
  assert.ok(cap.includes(sb.dashFmtUsd(sb.dashKpiVal(LV, "net_capacity"))), "net tile == KPI");
  assert.ok(cap.includes(sb.dashFmtUsd(sb.dashKpiVal(LV, "model_fit_lever"))), "model-fit lever == KPI");
  assert.ok(agendas.includes(`${Math.round(sb.dashKpiVal(LV, "policy_gap"))} h/wk`), "policy-gap tile == KPI");
  assert.ok(agendas.includes(`${Math.round(sb.dashKpiVal(LV, "realization_gap"))} h/wk`), "realization-gap tile == KPI");
});

test("V2 waterfall stages equal roleCapacity hours; the net tile equals net_capacity; gated units are flagged, floored from net", () => {
  const sb = dashSandbox();
  const ch = LV.breakdown.deployable.chain, html = sb.dashCapacityNetHtml(LV);
  for (const k of ["theoHrs", "permittedHrs", "freedHrs", "realizedHrs"]) assert.ok(html.includes(`${Math.round(ch[k])}h`), `cascade has ${k}`);
  assert.equal(sb.dashKpiVal(LV, "economics_gated"), 1, "the heavy MNPI unit is economics-gated");
  assert.match(html, /economics-gated/, "gated units flagged (pink, not red alarm)");
  // the net tile equals the net_capacity KPI (the heavy unit floored out of the deployable net)
  assert.ok(html.includes(sb.dashFmtUsd(sb.dashKpiVal(LV, "net_capacity"))), "final/net == net_capacity KPI");
  assert.ok(near(LV.breakdown.deployable.gross - LV.breakdown.deployable.cost, LV.breakdown.deployable.net, 1), "deployable reconciles (±rounding)");
});

test("V4 cycle-time: labels + reductions equal cycleTime()+fmtDur (8d 4h -> 7d 2h, ~15%, ~89%); the protected block never reaches zero", () => {
  const sb = dashSandbox();
  const sample = engine.normalizeIntake(FPA).steps, flow = engine.cycleTime(sample);
  const html = sb.dashFlowHtml(LV, sample, flow);
  assert.match(html, /8d 4h/);
  assert.match(html, /7d 2h/);
  assert.ok(near(flow.azReductionPct, 15.5, 0.6) && html.includes(`${Math.round(flow.azReductionPct)}%`), "A-Z reduction ~15%");
  assert.ok(near(flow.pctSavingFromWait, 88.5, 1) && html.includes(`${Math.round(flow.pctSavingFromWait)}%`), "~89% from wait");
  assert.match(html, /protected wait/, "protected wait drawn");
  // the protected wait is preserved (only lead-up compressed), never zero
  const protectedAfter = sample.filter((s) => s.waitKind === "protected").reduce((n, s) => n + s.wait * (1 - engine.CONFIG.flow.decisionLeadReduction), 0);
  assert.ok(protectedAfter > 0, "the decision wait is never compressed to zero");
});

test("V5 readiness-mix segment counts equal readiness_mix", () => {
  const sb = dashSandbox();
  const mix = sb.dashKpiVal(LV, "readiness_mix"), html = sb.dashAgendasHtml(LV);
  assert.equal(mix["gated-economics"], 1);
  assert.ok(mix["gated-policy"] >= 1);
  for (const [k, v] of Object.entries(mix)) if (v > 0) assert.ok(html.includes(`${k} ${v}`), `mix shows ${k} ${v}`);
});

test("evidence chain: capacity & flow is engine-live; adoption/fluency/outcome are LABELED placeholders (never fabricated)", () => {
  const sb = dashSandbox();
  const flow = engine.cycleTime(engine.normalizeIntake(FPA).steps);
  const html = sb.dashEvidenceChainHtml(LV, flow);
  assert.ok(html.includes(sb.dashFmtUsd(sb.dashKpiVal(LV, "net_capacity"))), "capacity&flow shows the live net figure");
  assert.match(html, /awaiting telemetry/, "telemetry layers are labeled placeholders");
  assert.equal((html.match(/awaiting telemetry/g) || []).length, 3, "adoption + fluency + outcome placeholders");
});

test("firewall + rail: dashboard capacity/cost/flow strings pass on dashboard and FAIL on a worker surface", () => {
  for (const s of ["Net capacity value", "Cost-to-serve (routed)", "capacity freed", "net capacity"]) {
    assert.equal(engine.railCheck(s, "dashboard").ok, true, `${s} ok on dashboard`);
  }
  assert.equal(engine.railCheck("Net capacity value", "workbench").ok, false, "net capacity blocked on workbench");
  assert.equal(engine.railCheck("Cost-to-serve (routed)", "capture").ok, false, "cost-to-serve blocked on capture");
  assert.equal(engine.railCheck("capacity freed", "recipe").ok, false, "capacity blocked on recipe (dashboard-only)");
});

test("never-a-dead-end: an empty Dashboard renders the engine note + a Workbench link", () => {
  const sb = dashSandbox();
  const empty = engine.buildLeaderView([{ ...FPA, recap: { confirmed: false } }]);
  assert.ok(empty.note && /confirm units on the Workbench/i.test(empty.note));
  const html = sb.dashEmptyHtml(empty);
  assert.match(html, /confirm units on the Workbench/i);
  assert.match(html, /data-dashboard-to-workbench/);
});
