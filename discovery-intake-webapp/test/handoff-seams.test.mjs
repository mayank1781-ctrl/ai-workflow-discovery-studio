// A5 — cross-system handoffs as SEAM attributes (not steps). An output in one system triggers work in
//   another (email / notification / file-drop). They feed the swivel-chair leverage number: the
//   mechanical re-entry AI collapses into assembly — while a high-criticality handoff is a hidden
//   control and is never compressed to zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

const reconHandoff = {
  ...E.RECON_INTAKE,
  seams: [
    ...E.RECON_INTAKE.seams,
    { from: "email", to: "recon engine", type: "handoff", friction: "high", latency: "medium", crit: "low", note: "email confirmation sends me back into the recon system", handoff: { bridges: ["email", "recon engine"], trigger: "email" } },
    { from: "case manager", to: "FinCrime system", type: "handoff", friction: "low", latency: "low", crit: "high", note: "AML referral gate", handoff: { bridges: ["case manager", "FinCrime system"], trigger: "notification" } },
  ],
};

test("A5 — the handoff trigger vocabulary exists", () => {
  assert.deepEqual(E.HANDOFF_TRIGGERS, ["email", "notification", "file-drop"]);
});

test("A5 — an 'email confirmation sends me back into system X' pattern is captured as a handoff seam", () => {
  const hs = E.seamHandoffs(reconHandoff);
  const email = hs.find((h) => h.trigger === "email");
  assert.ok(email, "the email handoff is captured");
  assert.equal(email.bridges.length, 2);
  assert.equal(email.protected, false, "a low-criticality re-entry is relievable");
});

test("A5 — the handoff seam counts toward the swivel-chair relief number", () => {
  const sc = E.buildSwivelChairRelief([reconHandoff]);
  assert.ok(sc.swivelChairRelieved >= 1);
  assert.equal(sc.byTrigger.email, 1);
});

test("A5 — a high-criticality handoff is protected — never compressed to zero", () => {
  const sc = E.buildSwivelChairRelief([reconHandoff]);
  assert.equal(sc.protectedHandoffs, 1, "the AML referral gate stays");
  assert.equal(sc.swivelChairRelieved, 1, "only the mechanical re-entry is relieved");
});

test("A5 — the de-identified handoff keeps the trigger pattern, not the vendor system name", () => {
  const pooled = E.deIdentify(reconHandoff);
  const json = JSON.stringify(pooled);
  assert.ok(json.includes("email"), "the trigger pattern pools");
  assert.ok(!json.includes("FinCrime system"), "the vendor system name never pools");
});

test("A5 — enum integrity: an unknown handoff trigger is surfaced; a valid one validates", () => {
  const bad = { ...E.RECON_INTAKE, seams: [{ ...E.RECON_INTAKE.seams[0], handoff: { bridges: ["a", "b"], trigger: "carrier-pigeon" } }] };
  assert.equal(E.validateIntake(bad).ok, false);
  const good = { ...E.RECON_INTAKE, seams: [{ ...E.RECON_INTAKE.seams[0], handoff: { bridges: ["a", "b"], trigger: "file-drop" } }, E.RECON_INTAKE.seams[1]] };
  assert.equal(E.validateIntake(good).ok, true);
});

test("A5 — additive: a workflow with no handoff seams has a swivel-chair number of 0", () => {
  const sc = E.buildSwivelChairRelief([E.RECON_INTAKE]);
  assert.equal(sc.handoffSeams, 0);
  assert.equal(sc.swivelChairRelieved, 0);
  // and cycle-time is untouched by the new attribute
  assert.ok(E.cycleTime(E.normalizeIntake(E.RECON_INTAKE).steps).cycleBefore > 0);
});
