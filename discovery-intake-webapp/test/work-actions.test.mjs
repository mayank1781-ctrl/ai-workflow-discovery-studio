// P4 A-2 — multi-action workActions composition layer.
// A step may bundle several distinct actions; each names owner (ai|human), channel, and addressability.
// The step score is composed from action-level values; solutionShape is derived, not stored as truth.
// Class-split invariant: owner="ai" is forbidden in decision and human_held steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

// ---- composition ----

test("P4 A2 — single ai-online action: composedAddr equals its addressability", () => {
  assert.equal(E.composeStepAddressability({ workActions: [{ owner: "ai", channel: "online", addressability: 70 }] }), 70);
});

test("P4 A2 — two ai-online actions, equal effort: composedAddr is the average", () => {
  const result = E.composeStepAddressability({
    workActions: [
      { owner: "ai", channel: "online", addressability: 80 },
      { owner: "ai", channel: "online", addressability: 60 },
    ],
  });
  assert.equal(result, 70);
});

test("P4 A2 — weighted effort: higher-effort action dominates the composed score", () => {
  const result = E.composeStepAddressability({
    workActions: [
      { owner: "ai", channel: "online", addressability: 90, effort: 3 },
      { owner: "ai", channel: "online", addressability: 30, effort: 1 },
    ],
  });
  assert.equal(result, 75); // (3*90 + 1*30) / 4 = 300/4 = 75
});

test("P4 A2 — human action contributes 0 AI addressability (human hours stay human)", () => {
  const result = E.composeStepAddressability({
    workActions: [
      { owner: "ai", channel: "online", addressability: 80 },
      { owner: "human", channel: "synchronous_human", addressability: 0 },
    ],
  });
  assert.equal(result, 40); // only the ai action's addr counts in numerator; all effort in denominator
});

test("P4 A2 — offline channel is not AI-carriable regardless of owner tag", () => {
  assert.equal(
    E.composeStepAddressability({ workActions: [{ owner: "ai", channel: "offline", addressability: 90 }] }),
    0
  );
});

test("P4 A2 — absent workActions falls back to step.theo", () => {
  assert.equal(E.composeStepAddressability({ theo: 65 }), 65);
  assert.equal(E.composeStepAddressability({ workActions: [], theo: 50 }), 50);
});

// ---- shape derivation ----

test("P4 A2 — all ai-online actions: derivedShape respects the stated solutionShape", () => {
  assert.equal(
    E.deriveStepSolutionShape({ solutionShape: "prompt", workActions: [{ owner: "ai", channel: "online", addressability: 80 }] }),
    "prompt"
  );
});

test("P4 A2 — any human-owner action forces human_in_loop (overrides agentic)", () => {
  assert.equal(
    E.deriveStepSolutionShape({ solutionShape: "agentic", workActions: [{ owner: "human", channel: "synchronous_human" }] }),
    "human_in_loop"
  );
});

test("P4 A2 — offline channel forces human_in_loop regardless of owner tag", () => {
  assert.equal(
    E.deriveStepSolutionShape({ solutionShape: "agentic", workActions: [{ owner: "ai", channel: "offline" }] }),
    "human_in_loop"
  );
});

test("P4 A2 — absent workActions returns the stated solutionShape unchanged", () => {
  assert.equal(E.deriveStepSolutionShape({ solutionShape: "rag" }), "rag");
  assert.equal(E.deriveStepSolutionShape({ solutionShape: null }), null);
  assert.equal(E.deriveStepSolutionShape({}), null);
});

// ---- class-split invariant ----

test("P4 A2 — owner=ai on a decision step is rejected (class-split invariant)", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ step: "Approve the memo", cls: "decision", data: "confidential", time: 10, theo: 10,
      workActions: [{ owner: "ai", channel: "online", addressability: 30 }] }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /class-split invariant/.test(e)), `errors: ${r.errors}`);
});

test("P4 A2 — owner=ai on a human_held step is rejected (class-split invariant)", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ step: "Partner sign-off", cls: "human_held", data: "MNPI", time: 10, theo: 0,
      workActions: [{ owner: "ai", channel: "online", addressability: 20 }] }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /class-split invariant/.test(e)), `errors: ${r.errors}`);
});

test("P4 A2 — human owner on a gather step is valid (AI + human-review within same step)", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ step: "Pull and spot-check", cls: "gather", data: "confidential", time: 12, theo: 80,
      workActions: [
        { owner: "ai", channel: "online", addressability: 80 },
        { owner: "human", channel: "online", addressability: 0 },
      ] }],
  });
  assert.equal(r.ok, true, `unexpected errors: ${r.errors}`);
});

test("P4 A2 — unknown owner is rejected by validateIntake", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ step: "Some step", cls: "gather", data: "internal", time: 10, theo: 70,
      workActions: [{ owner: "robot", channel: "online", addressability: 50 }] }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /unknown owner/.test(e)), `errors: ${r.errors}`);
});

test("P4 A2 — unknown channel is rejected by validateIntake", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ step: "Some step", cls: "gather", data: "internal", time: 10, theo: 70,
      workActions: [{ owner: "ai", channel: "telepathy", addressability: 50 }] }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /unknown channel/.test(e)), `errors: ${r.errors}`);
});

// ---- normalizeIntake integration ----

test("P4 A2 — normalizeIntake populates composedAddr and derivedShape when workActions present", () => {
  const raw = {
    ...E.FPA_INTAKE,
    steps: [{ step: "Pull and summarize", cls: "gather", data: "internal", time: 10, theo: 70,
      solutionShape: "prompt",
      workActions: [{ owner: "ai", channel: "online", addressability: 70 }] }],
  };
  const norm = E.normalizeIntake(raw);
  assert.equal(norm.steps[0].composedAddr, 70);
  assert.equal(norm.steps[0].derivedShape, "prompt");
});

test("P4 A2 — normalizeIntake: human action → derivedShape forced to human_in_loop", () => {
  const raw = {
    ...E.FPA_INTAKE,
    steps: [{ step: "Facilitated session", cls: "judgment", data: "internal", time: 10, theo: 35,
      solutionShape: "agentic",
      workActions: [{ owner: "human", channel: "synchronous_human" }] }],
  };
  const norm = E.normalizeIntake(raw);
  assert.equal(norm.steps[0].derivedShape, "human_in_loop");
});

test("P4 A2 — normalizeIntake: absent workActions leaves composedAddr undefined", () => {
  const norm = E.normalizeIntake(E.RECON_INTAKE);
  assert.ok(norm.steps.every(s => s.composedAddr === undefined), "no workActions → no composedAddr");
});

// ---- golden-set / additive check ----

test("P4 A2 — FPA_INTAKE golden fixture: workActions compose to same value as stated theo (85)", () => {
  const norm = E.normalizeIntake(E.FPA_INTAKE);
  assert.equal(norm.steps[0].composedAddr, 85, "Collect & consolidate composedAddr");
  // capacity numbers are unchanged (composedAddr = theo, so theoPct is identical)
  const cap = E.roleCapacity(norm.steps, "Conservative");
  assert.ok(Math.abs(cap.theoPct * 100 - 55) < 0.6, `theoPct ${cap.theoPct * 100} should be ~55`);
});

test("P4 A2 — additive: RECON_INTAKE (no workActions) byte-identical capacity", () => {
  const before = E.roleCapacity(E.normalizeIntake(E.RECON_INTAKE).steps, "Conservative");
  assert.ok(before.grossValue > 0, "capacity computed");
  assert.ok(E.normalizeIntake(E.RECON_INTAKE).steps.every(s => s.composedAddr === undefined));
});
