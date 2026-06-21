// P2 / B2 — semantic class check at the confirm gate.
//
// The audit blocker: "Approve covenant waiver and send final decision" tagged cls:"assembly"
// passed canHarden, became an ai-step, and generated ~$26.6k of net capacity for a call a human
// must keep. The fix: a step whose TEXT reads as a firm decision/commitment (scored by the same
// eval-gated rubric the rest of the app uses) but is DECLARED assembly/judgment is refused at the
// gate, earns ZERO permitted automation, and is never rendered as an AI step — unless the step is
// split, or an explicit human override rationale is supplied.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";

// The exact audit probe: a firm commitment mislabeled as automatable assembly.
const PROBE = { step: "Approve covenant waiver and send final decision", cls: "assembly", data: "confidential", time: 30, theo: 80, touch: 60, output: "final approval" };

test("B2 — the audit's 'approve waiver and send' assembly step is a detected mislabel", () => {
  assert.equal(engine.stepDecisionLanguage(PROBE), true, "decision/commitment text tagged assembly is flagged");
  // The correctly-tagged decision is NOT a mislabel (no over-block).
  assert.equal(engine.stepDecisionLanguage({ ...PROBE, cls: "decision" }), false);
  // Plain assembly work is untouched (byte-identical capture).
  assert.equal(engine.stepDecisionLanguage({ step: "Reconcile sub-ledger to GL", cls: "assembly" }), false);
  assert.equal(engine.stepDecisionLanguage({ step: "Draft the variance commentary", cls: "assembly" }), false);
});

test("B2 — the mislabeled step earns ZERO capacity (no fake $26.6k)", () => {
  assert.equal(engine.stepPermitted(PROBE, "Conservative"), 0, "permitted automation is zero");
  assert.equal(engine.stepPermitted(PROBE, "Progressive"), 0, "zero on every profile — not a ceiling");
  const cap = engine.roleCapacity(engine.normalizeIntake({ steps: [PROBE] }).steps, "Conservative");
  assert.equal(cap.permittedPct, 0, "role permitted share is zero");
  assert.equal(cap.grossValue, 0, "gross capacity value is zero");
});

test("B2 — a confirmed record carrying the mislabel CANNOT harden, and the blocker names it", () => {
  // Start from a clean, fully-confirmed multi-actor record (it hardens), then mislabel one step.
  assert.equal(engine.canHarden(engine.RECON_INTAKE), true, "baseline clean record hardens");
  const mislabel = { ...engine.RECON_INTAKE, steps: engine.RECON_INTAKE.steps.map(s =>
    s.step === "Post adjustment" ? { ...s, step: "Approve the write-off and post the final entry" } : s) };
  assert.equal(engine.canHarden(mislabel), false, "the mislabeled record is refused");
  const blockers = engine.confirmBlockers(mislabel);
  assert.ok(blockers.some(b => b.rule === "class-mismatch-decision"), "the class-mismatch blocker is present");
  const b = blockers.find(b => b.rule === "class-mismatch-decision");
  assert.match(b.detail, /decision|approval|commitment/i, "the reason explains the mismatch");
});

test("B2 — buildRecipe never renders the mislabel as an ai-step (it is a human checkpoint)", () => {
  const rec = engine.buildRecipe({
    header: { persona: "Ops", anchor: "x" }, trigger: { trigger: "t", cadence: "daily" },
    confirm: { acceptance: "a" }, steps: [PROBE],
  });
  const st = rec.orderedSteps.find(s => /Approve covenant waiver/.test(s.step));
  assert.ok(st, "the step is in the recipe");
  assert.notEqual(st.kind, "ai-step", "a firm commitment is never an AI step");
  assert.equal(st.kind, "human-checkpoint");
  assert.match(st.action, /split|person|prepares the lead-up/i, "it tells the consultant to split prep from the decision");
});

test("B2 — splitting (prep vs decision) resolves the mismatch the honest way", () => {
  // The decision clause, correctly tagged decision, is never a mislabel.
  assert.equal(engine.stepDecisionLanguage({ step: "Approve the covenant waiver", cls: "decision" }), false, "decision step is correctly a decision");
  // Pure prep — gathering/drafting the lead-up material — classifies assembly and passes clean.
  assert.equal(engine.stepDecisionLanguage({ step: "Draft the recommendation memo from the credit file", cls: "assembly" }), false, "prep step is clean assembly");
  assert.equal(engine.stepDecisionLanguage({ step: "Assemble the covenant pack for the credit committee", cls: "assembly" }), false, "assembling the pack for a decision-maker is still assembly");
});

test("B2 — rounds UP toward the human: an assembly step that NAMES a commitment is flagged (conservative, not a bypass)", () => {
  // Reusing the eval-gated rubric means a prep step that still carries commitment language
  // (e.g. mentions the waiver/approval as its subject) rounds up to "confirm with a human"
  // rather than silently hardening. This is the safe direction; the escape is split or override.
  assert.equal(engine.stepDecisionLanguage({ step: "Draft the covenant waiver memo", cls: "assembly" }), true, "naming the commitment rounds up to flagged");
  // ...and the documented override is exactly how a consultant clears a true false-positive.
  assert.equal(engine.stepDecisionLanguage({ step: "Draft the covenant waiver memo", cls: "assembly", classOverride: "Drafting the memo only — the approval is a separate, downstream decision step." }), false, "an explicit rationale clears it");
});

test("B2 — an explicit, documented override lets a genuine edge case through (but only then)", () => {
  assert.equal(engine.stepDecisionLanguage({ ...PROBE, classOverride: "Control owner reviewed: this is a rote system posting, not a firm commitment." }), false, "a real rationale unblocks");
  assert.equal(engine.stepDecisionLanguage({ ...PROBE, classOverride: "ok" }), true, "a token rationale (< 8 chars) does NOT unblock");
  assert.equal(engine.stepDecisionLanguage({ ...PROBE, classOverride: "" }), true, "an empty rationale does NOT unblock");
});
