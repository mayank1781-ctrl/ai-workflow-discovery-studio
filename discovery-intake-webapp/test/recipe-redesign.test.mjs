// Edition 3 — F7: Recipe (the multi-actor build artifact). Renders the recipe as the worked example
// shows: ordered steps with the doer/part; control gates inline (four-eyes badge, the authority matrix
// resolved from sharedRules, halt with its negativeConstraint); routes as loop/halt/escalation edges; the
// rail checks visible; cost/model-fit on this ENGINEERING surface. All structure comes from engine.buildRecipe
// (no fork). ADDITIVE: a single-actor, control-free, linear unit renders as today (no multi-actor overlay).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
const FPA = engine.FPA_INTAKE;

function sandbox() {
  return buildSandbox(source, {
    functions: [
      "studioEngine", "engineProvValue", "engineStepClass", "engineDataTier", "appStepToEngineStep", "appWorkflowToIntake",
      "recipeEsc", "recipeControlTint", "recipeKindTint", "recipeControlGateHtml", "recipeStepRowHtml",
      "recipeRouteEdgeHtml", "recipeRailChecksHtml", "recipeMultiActorHtml",
    ],
    globals: {
      window: { StudioEngine: engine },
      escapeHtml: (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
      gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [],
      recipeConnectionSeams: () => [], analysisWorkflowName: () => "",
    },
  });
}

test("the recipe renders participants (doer + part) for the recon fixture", () => {
  const sb = sandbox();
  const html = sb.recipeMultiActorHtml(RECON);
  assert.match(html, /Multi-actor recipe/);
  assert.match(html, /Ops Analyst/, "the maker (doer)");
  assert.match(html, /Team Lead/, "the team lead (doer of allocate/close)");
  assert.match(html, /approver: Senior Analyst/, "the approver part on the four-eyes step");
  assert.match(html, /1LoD/, "the line-of-defence chip");
});

test("control gates render inline — four-eyes badge + the authority matrix resolved from sharedRules", () => {
  const sb = sandbox();
  const html = sb.recipeMultiActorHtml(RECON);
  assert.match(html, /4-EYES/);
  // the authority ladder resolves onto the artifact (the value bands -> approver roles)
  assert.match(html, /checker/);
  assert.match(html, /opsManager/);
  assert.match(html, /opsManager\+finance/);
});

test("the halt-on-flag renders with its escalation target and negativeConstraint", () => {
  const sb = sandbox();
  const html = sb.recipeMultiActorHtml(RECON);
  assert.match(html, /⛔ HALT/);
  assert.match(html, /Financial Crime|finCrime/);
  assert.match(html, /do not:.*tip-off/);
});

test("routes render as loop / halt / escalation edges with their derived|authored origin", () => {
  const sb = sandbox();
  const html = sb.recipeMultiActorHtml(RECON);
  assert.match(html, /onReject/);
  assert.match(html, /onFlag/);
  assert.match(html, /onSlaRisk/);
  assert.match(html, /derived/);
  assert.match(html, /authored/);
});

test("the three rail checks are visible and HOLD on the clean recon SOP", () => {
  const sb = sandbox();
  const html = sb.recipeMultiActorHtml(RECON);
  assert.match(html, /✓ Rail/);
  assert.match(html, /four-eyes/);
  assert.match(html, /never auto-resolved/);
  // a violating record shows the failing rail
  const dirty = { ...RECON, steps: RECON.steps.map((s) => (s.step === "Approve adjustment" ? { ...s, participants: [{ actorId: "maker", part: "doer" }, { actorId: "maker", part: "approver" }] } : s)) };
  assert.match(sb.recipeMultiActorHtml(dirty), /✕ Rail/);
});

test("cost / model-fit shows (engineering surface): the artifact passes the recipe rail and FAILS on capture", () => {
  const sb = sandbox();
  const html = sb.recipeMultiActorHtml(RECON);
  assert.match(html, /Model-fit · cost-to-serve/);
  assert.equal(engine.railCheck(html, "recipe").ok, true, JSON.stringify(engine.railCheck(html, "recipe").violations));
  assert.equal(engine.railCheck(html, "capture").ok, false, "cost-to-serve is blocked on the capture surface");
});

test("control tints follow the locked color map (four-eyes=blue, authority=amber, halt=pink, SoD/completeness=violet)", () => {
  const sb = sandbox();
  assert.equal(sb.recipeControlTint("four-eyes"), "var(--sg-blue)");
  assert.equal(sb.recipeControlTint("authority"), "var(--sg-amber)");
  assert.equal(sb.recipeControlTint("halt-on-flag"), "var(--sg-pink)");
  assert.equal(sb.recipeControlTint("segregation"), "var(--sg-violet)");
  assert.equal(sb.recipeControlTint("completeness"), "var(--sg-violet)");
});

test("ADDITIVE: a single-actor / six-field unit renders as today (no multi-actor overlay)", () => {
  const sb = sandbox();
  assert.equal(sb.recipeMultiActorHtml(FPA), "", "FP&A (single persona, control-free, linear) => no overlay");
  assert.equal(sb.recipeMultiActorHtml({ steps: [{ step: "x", cls: "assembly", data: "public" }] }), "", "a plain step => no overlay");
});
