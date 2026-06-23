// A2 (M5) — run-cost vs total cost of ownership, as two separate lenses with payback bands.
// Regression pins:
//   (1) engine exposes runCost and tco separately, each a low/high band, plus a payback range;
//   (2) shape drives the TCO components — an agentic recipe has a higher TCO and longer payback
//       than the same work as a prompt, and the TCO gap exceeds the run-cost gap (the lens reveals
//       build/maintain that run-cost alone misses);
//   (3) net realized value keeps using run-cost only (TCO is a second lens, not a re-definition).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

const wf = (shape) => ({
  ...E.FPA_INTAKE,
  steps: E.FPA_INTAKE.steps.map(s => (s.cls === "gather" || s.cls === "build" || s.cls === "assembly") ? { ...s, solutionShape: shape } : s),
});

test("A2 — runCost and TCO are exposed separately, both as bands", () => {
  const t = E.buildTco(wf("rag"), { instances: 10 });
  for (const b of [t.runCost, t.tco.buildOneTime, t.tco.annualOngoing, t.tco.firstYear]) {
    assert.ok(b.low <= b.point && b.point <= b.high, `band ordered: ${JSON.stringify(b)}`);
    assert.ok(b.low < b.high, "a band is a range, not a point");
  }
  // TCO is more than run-cost — it adds the build/own components run-cost ignores
  assert.ok(t.tco.firstYear.point > t.runCost.point, "first-year TCO exceeds run-cost alone");
  assert.ok(t.tco.components.build > 0 && t.tco.components.maintenance > 0 && t.tco.components.rework > 0);
});

test("A2 — an agentic recipe shows higher TCO and longer payback than a prompt", () => {
  const prompt = E.buildTco(wf("prompt"), { instances: 18 });
  const agentic = E.buildTco(wf("agentic"), { instances: 18 });
  assert.ok(agentic.tco.buildOneTime.point > prompt.tco.buildOneTime.point, "agentic costs more to build");
  assert.ok(agentic.tco.firstYear.point > prompt.tco.firstYear.point, "agentic costs more first-year");
  assert.ok(
    agentic.payback.highYears > prompt.payback.highYears,
    `agentic payback (${agentic.payback.highYears}y) longer than prompt (${prompt.payback.highYears}y)`,
  );
  // both have a real (finite, banded) payback at this scale
  assert.ok(prompt.payback.lowYears > 0 && prompt.payback.highYears > prompt.payback.lowYears);
});

test("A2 — even when run-cost is similar, TCO diverges by shape (the point of the lens)", () => {
  // a tiny-volume step makes run-cost near-zero for both shapes, so the difference is all build/maintain
  const tiny = (shape) => E.buildTco(
    { ...E.FPA_INTAKE, steps: [{ step: "reconcile", cls: "assembly", data: "internal", time: 1, theo: 80, solutionShape: shape }], recap: { confirmed: true } },
    { instances: 5 },
  );
  const runGap = Math.abs(tiny("agentic").runCost.point - tiny("prompt").runCost.point);
  const tcoGap = tiny("agentic").tco.buildOneTime.point - tiny("prompt").tco.buildOneTime.point;
  assert.ok(tcoGap > runGap, `TCO gap (${tcoGap}) must exceed run-cost gap (${runGap})`);
});

test("A2 — net realized value still uses run-cost only (TCO is a second lens)", () => {
  const steps = E.normalizeIntake(wf("agentic")).steps;
  const runOnlyNet = E.netValue(E.roleCapacity(steps, "Conservative").grossValue, E.costToServe(steps, "Conservative", "routed").annual);
  const t = E.buildTco(wf("agentic")); // instances default 1
  assert.ok(Math.abs(t.netRunCost - runOnlyNet) < 1, "netRunCost equals the run-cost-only net at single-role scale");
});

test("A2 — payback is honest when ownership cost isn't recovered", () => {
  // single agentic step, single instance, modest value → ownership cost not recovered
  const t = E.buildTco(
    { ...E.FPA_INTAKE, steps: [{ step: "reconcile", cls: "assembly", data: "internal", time: 5, theo: 80, solutionShape: "agentic" }], recap: { confirmed: true } },
    { instances: 1 },
  );
  assert.equal(t.payback.lowYears, null, "no fabricated payback when net benefit is negative");
  assert.ok(/not recovered|defer|route-down/i.test(t.payback.note));
});
