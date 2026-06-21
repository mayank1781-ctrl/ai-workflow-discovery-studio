// Edition 3 — F6: Workbench (confirm the map, enforce the controls). The confirm gate now confirms
// actors/parts/controls/routes and ENFORCES at confirm: four-eyes actors distinct; an authority step
// names a HUMAN approver; a halt is never auto-resolved. The enforcement is the engine's control rail
// (confirmBlockers / canHarden) reused — one authority. Promote inferred -> stated on confirm (provenance
// preserved); mark controls protected; nothing hardens unconfirmed or with a broken control. Buttons are
// never hard-disabled (toast guard + return).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
const FPA = engine.FPA_INTAKE;
const withApprove = (parts) => ({ ...RECON, steps: RECON.steps.map((s) => (s.step === "Approve adjustment" ? { ...s, participants: parts } : s)) });

function sandbox(extraGlobals = {}) {
  return buildSandbox(source, {
    functions: [
      "studioEngine", "engineProvValue", "engineStepClass", "engineDataTier", "appStepToEngineStep", "appWorkflowToIntake",
      "workbenchControlChecks", "workbenchConfirmModel", "workbenchPromoteOnConfirm", "confirmMultiActorWorkflow", "workbenchControlGateHtml",
    ],
    globals: {
      window: { StudioEngine: engine },
      escapeHtml: (s) => String(s == null ? "" : s),
      toast: () => {}, gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [],
      recipeConnectionSeams: () => [], analysisWorkflowName: () => "",
      ...extraGlobals,
    },
  });
}

// ---------- engine: the control-aware harden gate ----------
test("engine: a clean confirmed multi-actor unit can harden; an unconfirmed one cannot", () => {
  assert.equal(engine.canHarden(RECON), true, JSON.stringify(engine.confirmBlockers(RECON)));
  assert.equal(engine.canHarden({ ...RECON, recap: { confirmed: false } }), false);
  assert.ok(engine.confirmBlockers({ ...RECON, recap: { confirmed: false } }).some((b) => b.rule === "not-confirmed"));
});

test("engine: a four-eyes with the same actor, or an authority missing its approver, blocks hardening with a reason", () => {
  const same = withApprove([{ actorId: "maker", part: "doer" }, { actorId: "maker", part: "approver" }]);
  assert.equal(engine.canHarden(same), false);
  assert.ok(engine.confirmBlockers(same).some((b) => b.rule === "four-eyes-distinct"));
  const noAppr = withApprove([{ actorId: "maker", part: "doer" }]);
  assert.equal(engine.canHarden(noAppr), false);
  assert.ok(engine.confirmBlockers(noAppr).some((b) => /approver|named/.test(b.rule)));
});

test("engine: a single-persona confirmed workflow still hardens (additive)", () => {
  assert.equal(engine.canHarden(FPA), true, JSON.stringify(engine.confirmBlockers(FPA)));
});

// ---------- app: the confirm model + the three enforced checks ----------
test("the confirm model says CAN-confirm for the clean recon SOP; all three control checks pass", () => {
  const sb = sandbox();
  const m = sb.workbenchConfirmModel(RECON);
  assert.equal(m.canConfirm, true, JSON.stringify(m.blockers));
  assert.deepEqual(m.checks.map((c) => c.ok), [true, true, true]);
  assert.ok(m.protectedControls.some((c) => c.type === "four-eyes"));
});

test("a four-eyes with the same actor CANNOT be confirmed, and the four-eyes check names the reason", () => {
  const sb = sandbox();
  const m = sb.workbenchConfirmModel(withApprove([{ actorId: "maker", part: "doer" }, { actorId: "maker", part: "approver" }]));
  assert.equal(m.canConfirm, false);
  const fe = m.checks.find((c) => c.id === "four-eyes");
  assert.equal(fe.ok, false);
  assert.ok(fe.reasons.join(" ").match(/different actors|same actor/));
});

test("an authority step missing its approver CANNOT be confirmed (the authority check fails)", () => {
  const sb = sandbox();
  const m = sb.workbenchConfirmModel(withApprove([{ actorId: "maker", part: "doer" }]));
  assert.equal(m.canConfirm, false);
  assert.ok(m.checks.some((c) => c.id === "authority" && c.ok === false));
});

// ---------- promote inferred -> stated, provenance preserved ----------
test("promote-on-confirm marks participants/controls user-stated and preserves the prior source (provenance)", () => {
  const sb = sandbox();
  const input = { ...RECON, steps: RECON.steps.map((s) => ({ ...s, participants: (s.participants || []).map((p) => ({ ...p, source: "ai-inferred" })) })) };
  const promoted = sb.workbenchPromoteOnConfirm(input);
  const approve = promoted.steps.find((s) => s.step === "Approve adjustment");
  assert.ok(approve.participants.every((p) => p.source === "user-stated"), "promoted to stated");
  assert.ok(approve.participants.every((p) => p._priorSource === "ai-inferred"), "prior provenance preserved");
  assert.equal(approve.control.protected, true, "control marked protected");
  // input is not mutated (pure)
  assert.equal(input.steps.find((s) => s.step === "Approve adjustment").participants[0].source, "ai-inferred");
});

// ---------- the confirm action: never hard-disabled; toast guard + return ----------
test("confirm advances lifecycle to confirmed when clean; toasts + returns (no advance) when blocked", () => {
  const toasts = [];
  const sb = sandbox({ toast: (m) => toasts.push(m) });
  const ok = sb.confirmMultiActorWorkflow(RECON);
  assert.equal(ok.confirmed, true);
  assert.equal(ok.record.header.lifecycle, "confirmed");
  const blocked = sb.confirmMultiActorWorkflow(withApprove([{ actorId: "maker", part: "doer" }, { actorId: "maker", part: "approver" }]));
  assert.equal(blocked.confirmed, false);
  assert.ok(blocked.blockers.length > 0);
  assert.ok(toasts.some((t) => /can't confirm/i.test(t)), "a toast explains why (never a hard-disabled button)");
});

test("the gate renders the three checks + a confirm affordance that is never hard-disabled (no disabled attr)", () => {
  const sb = sandbox();
  const html = sb.workbenchControlGateHtml(RECON);
  assert.match(html, /Four-eyes actors are distinct/);
  assert.match(html, /human approver/);
  assert.match(html, /never auto-resolved/);
  assert.match(html, /data-workbench-confirm/);
  assert.ok(!/disabled/.test(html), "the button is never hard-disabled");
  // additive: a single-persona, control-free workflow renders no gate
  assert.equal(sb.workbenchControlGateHtml(FPA), "", "no multi-actor data => no gate (byte-identical)");
});

test("only confirmable flows pass downstream: a control-violating unit can't harden (engine boundary)", () => {
  // the dashboard/recipe read confirmed-only; F6 additionally blocks a broken-control unit from hardening
  assert.equal(engine.canHarden(withApprove([{ actorId: "maker", part: "doer" }, { actorId: "maker", part: "approver" }])), false);
  assert.equal(engine.buildLeaderView([withApprove([{ actorId: "maker", part: "doer" }])]).confirmedCount, 1, "still counted as a confirmed record, but...");
  assert.equal(engine.canHarden(withApprove([{ actorId: "maker", part: "doer" }])), false, "...it cannot harden (missing approver)");
});
