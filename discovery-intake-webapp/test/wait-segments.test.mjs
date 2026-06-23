// P4 A-3 — waitSegments sub-types alongside step.wait (flat minutes).
// deliberation (committee/sign-off) is protected: lRed=12%. reducible + coordination are
// compressible: wRed=30%. waitBefore always uses step.wait (flat total) — byte-identical on
// steps without segments. Seeds carry no waitSegments so all golden numbers are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

const wRed = 0.30, lRed = 0.12;

function makeStep(waitSegments, opts = {}) {
  return {
    step: "test step", cls: opts.cls ?? "build", data: "internal",
    time: 10, touch: 60, wait: opts.wait ?? 480, theo: 70,
    waitKind: opts.waitKind ?? "reducible",
    waitSegments,
  };
}

// ---- segment-level reduction ----

test("P4 A3 — deliberation segment is protected (lRed=12%), reducible is compressible (wRed=30%)", () => {
  const s = makeStep([{ kind: "reducible", minutes: 480 }, { kind: "deliberation", minutes: 240 }], { wait: 720 });
  const ct = E.cycleTime([s]);
  const expected = 480 * (1 - wRed) + 240 * (1 - lRed);
  assert.ok(Math.abs(ct.waitAfter - expected) < 0.01, `waitAfter ${ct.waitAfter} expected ${expected}`);
});

test("P4 A3 — coordination segment reduces the same as reducible (wRed)", () => {
  const s = makeStep([{ kind: "coordination", minutes: 300 }], { wait: 300 });
  const ct = E.cycleTime([s]);
  assert.ok(Math.abs(ct.waitAfter - 300 * (1 - wRed)) < 0.01);
});

test("P4 A3 — waitBefore is always step.wait (flat total); segments only affect waitAfter", () => {
  const s = makeStep([{ kind: "reducible", minutes: 200 }, { kind: "deliberation", minutes: 100 }], { wait: 999 });
  const ct = E.cycleTime([s]);
  assert.equal(ct.waitBefore, 999, "waitBefore unchanged from step.wait");
});

test("P4 A3 — two deliberation segments: both protected (total reduction = lRed×Σminutes)", () => {
  const s = makeStep([{ kind: "deliberation", minutes: 240 }, { kind: "deliberation", minutes: 120 }], { wait: 360 });
  const ct = E.cycleTime([s]);
  assert.ok(Math.abs(ct.waitAfter - 360 * (1 - lRed)) < 0.01);
});

test("P4 A3 — cycleTime over mixed steps: segmented and flat steps compose correctly", () => {
  const segmented = makeStep([{ kind: "deliberation", minutes: 240 }], { wait: 240, waitKind: "protected" });
  const flat = makeStep(undefined, { wait: 480, waitKind: "reducible" });
  const ct = E.cycleTime([segmented, flat]);
  const expectedWaitA = 240 * (1 - lRed) + 480 * (1 - wRed);
  assert.ok(Math.abs(ct.waitAfter - expectedWaitA) < 0.01);
});

// ---- fallback to existing waitKind when segments absent ----

test("P4 A3 — absent waitSegments falls back to waitKind (byte-identical with prior behaviour)", () => {
  const s = makeStep(undefined, { wait: 480, waitKind: "reducible" });
  const ct = E.cycleTime([s]);
  assert.ok(Math.abs(ct.waitAfter - 480 * (1 - wRed)) < 0.01);
});

test("P4 A3 — empty waitSegments also falls back to waitKind", () => {
  const s = makeStep([], { wait: 480, waitKind: "protected" });
  const ct = E.cycleTime([s]);
  assert.ok(Math.abs(ct.waitAfter - 480 * (1 - lRed)) < 0.01);
});

// ---- validateIntake ----

test("P4 A3 — unknown waitSegment kind is rejected", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ step: "x", cls: "build", data: "internal", time: 10, theo: 70,
      waitSegments: [{ kind: "pending", minutes: 60 }] }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /waitSegment/.test(e) && /unknown kind/.test(e)), `errors: ${r.errors}`);
});

test("P4 A3 — negative minutes in a waitSegment is rejected", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ step: "x", cls: "build", data: "internal", time: 10, theo: 70,
      waitSegments: [{ kind: "reducible", minutes: -30 }] }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /waitSegment/.test(e)), `errors: ${r.errors}`);
});

test("P4 A3 — valid waitSegments on a gather step passes validateIntake", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ step: "Pull and queue", cls: "gather", data: "internal", time: 10, theo: 80,
      wait: 120, waitSegments: [{ kind: "coordination", minutes: 120 }] }],
  });
  assert.equal(r.ok, true, `unexpected errors: ${r.errors}`);
});

// ---- additive / golden-set ----

test("P4 A3 — FPA_INTAKE and RECON_INTAKE have no waitSegments (additive, no seed change)", () => {
  assert.ok(E.FPA_INTAKE.steps.every(s => !s.waitSegments), "FPA: no waitSegments");
  assert.ok(E.RECON_INTAKE.steps.every(s => !s.waitSegments), "RECON: no waitSegments");
});

test("P4 A3 — FPA_INTAKE cycle-time golden numbers unchanged (no waitSegments on seeds)", () => {
  const ct = E.cycleTime(E.normalizeIntake(E.FPA_INTAKE).steps);
  assert.ok(ct.cycleAfter < ct.cycleBefore, "some reduction still expected from touch + flat wait");
  assert.ok(ct.cycleAfter > 0);
});
