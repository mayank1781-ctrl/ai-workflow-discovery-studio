// P3 / M3 — a decision is NEVER given to AI: zero permitted automation, zero capacity.
//
// Audit major: decision steps still carried a 5% / 10% / 15% ceiling, so an all-decision record
// produced positive capacity ("never AI" was enforced in words, not in math). The fix sets the
// decision permitted ceiling to 0 on every profile AND clamps it structurally in stepPermitted,
// so AI prep for a decision must live in a separate upstream assembly/judgment support step —
// never credited to the decision itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";

const ALL_DECISION = { steps: [
  { step: "Approve the covenant waiver", cls: "decision", data: "confidential", time: 25, theo: 15 },
  { step: "Sign off on the year-end close", cls: "decision", data: "MNPI", time: 25, theo: 12 },
  { step: "Authorize the payment release", cls: "decision", data: "PII", time: 10, theo: 10 },
] };

test("M3 — a single decision step earns ZERO permitted automation on every profile", () => {
  for (const profile of ["Conservative", "Moderate", "Progressive"]) {
    // Even with an absurdly high theoretical and the most permissive public tier, permitted is 0.
    assert.equal(engine.stepPermitted({ cls: "decision", data: "public", theo: 99 }, profile), 0, `decision permitted is 0 on ${profile}`);
  }
});

test("M3 — an all-decision workflow yields ZERO AI capacity (no fake positive number)", () => {
  for (const profile of ["Conservative", "Moderate", "Progressive"]) {
    const cap = engine.roleCapacity(engine.normalizeIntake(ALL_DECISION).steps, profile);
    assert.equal(cap.permittedPct, 0, `permitted share is 0 on ${profile}`);
    assert.equal(cap.permittedHrs, 0, `permitted hours are 0 on ${profile}`);
    assert.equal(cap.freedHrs, 0, `freed hours are 0 on ${profile}`);
    assert.equal(cap.grossValue, 0, `gross capacity value is 0 on ${profile}`);
  }
});

test("M3 — an all-decision workflow has ZERO cost-to-serve (nothing is routed to AI)", () => {
  const cost = engine.costToServe(engine.normalizeIntake(ALL_DECISION).steps, "Progressive", "routed");
  assert.equal(cost.annual, 0);
  assert.equal(cost.runsPerYr, 0);
});

test("M3 — the change is decision-only: assembly and judgment still earn capacity", () => {
  assert.ok(engine.stepPermitted({ cls: "assembly", data: "public", theo: 80 }, "Conservative") > 0, "assembly still addressable");
  assert.ok(engine.stepPermitted({ cls: "judgment", data: "public", theo: 35 }, "Conservative") > 0, "judgment still addressable");
  // A mixed workflow still has positive capacity from its assembly/judgment, just nothing from the decision.
  const mixed = { steps: [
    { step: "Reconcile sub-ledger", cls: "assembly", data: "confidential", time: 40, theo: 80 },
    { step: "Approve the adjustment", cls: "decision", data: "confidential", time: 10, theo: 15 },
  ] };
  const cap = engine.roleCapacity(engine.normalizeIntake(mixed).steps, "Conservative");
  assert.ok(cap.grossValue > 0, "mixed workflow keeps assembly capacity");
});

test("M3 — the model tier for a decision stays human (AI is never routed to it)", () => {
  assert.equal(engine.modelTier("decision", "confidential", "routed"), "human");
  assert.equal(engine.modelTier("decision", "PII", "frontier"), "human");
});

test("M3 — AI prep for a decision is honored as a SEPARATE upstream support step", () => {
  // The honest pattern: the prep is its own assembly step (earns capacity); the decision earns none.
  const prep = { cls: "assembly", data: "confidential", theo: 75 };
  const decision = { cls: "decision", data: "confidential", theo: 15 };
  assert.ok(engine.stepPermitted(prep, "Conservative") > 0, "the prep support step earns capacity");
  assert.equal(engine.stepPermitted(decision, "Conservative"), 0, "the decision itself earns none");
});
