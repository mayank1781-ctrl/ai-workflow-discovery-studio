// D1 (Phase 2) — computed, never fixed. The deck's signature figures must be COMPUTED outputs, not
// constants: the realization uplift is driven by the builder-ladder rung; the governance unlock is the
// policy-gap dollars that move when the profile shifts; the model-fit lever is frontier-everywhere minus
// routed. Each MUST change when its driver changes — that is the proof it is not a literal constant.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";

const SET = [engine.FPA_INTAKE];

test("D1 — the realization uplift changes when the builder-ladder rung changes", () => {
  const r85 = engine.realizationUplift(SET, { targetRealizationFactor: 0.85 });
  const r95 = engine.realizationUplift(SET, { targetRealizationFactor: 0.95 });
  assert.ok(r85.upliftDollars > 0);
  assert.notEqual(r85.upliftDollars, r95.upliftDollars);
  assert.ok(r95.upliftDollars > r85.upliftDollars, "a higher rung → a bigger uplift (computed)");
});

test("D1 — the governance unlock changes when the policy profile shifts", () => {
  const toMod = engine.governanceUnlock(SET, { toProfile: "Moderate" });
  const toProg = engine.governanceUnlock(SET, { toProfile: "Progressive" });
  assert.notEqual(toMod.unlockDollars, toProg.unlockDollars);
  assert.ok(toProg.unlockDollars >= toMod.unlockDollars, "Progressive unlocks at least as much as Moderate");
  assert.match(toMod.note, /Conservative -> Moderate/);
});

test("D1 — the governance unlock tracks the actual policy gap (no gap → ~0, not a fixed figure)", () => {
  const noGap = {
    steps: [{ step: "x", cls: "assembly", data: "internal", time: 10, theo: 30 }], // low theo, internal → no policy cap
    recap: { confirmed: true }, header: { persona: "p", dept: "d", anchor: "a" },
    trigger: { trigger: "t", cadence: "daily" }, seams: [{ friction: "low", latency: "low", crit: "low" }],
    judgment: { needs: "n", hard: "h", cues: "c", human: "h" }, confirm: { acceptance: "a", escalation: "e", dataTier: "internal" },
  };
  assert.equal(engine.governanceUnlock([noGap], { fromProfile: "Conservative", toProfile: "Moderate" }).unlockDollars, 0);
});

test("D1 — the model-fit lever is frontier-everywhere minus routed (computed)", () => {
  const steps = engine.normalizeIntake(engine.FPA_INTAKE).steps;
  const routed = engine.costToServe(steps, "Conservative", "routed").annual;
  const frontier = engine.costToServe(steps, "Conservative", "frontier").annual;
  const lever = engine.buildRecipeProof(engine.FPA_INTAKE).modelFitLever;
  assert.ok(Math.abs(lever.delta - Math.round(frontier - routed)) <= 1, "lever == frontier − routed");
  assert.ok(lever.delta > 0);
});

test("D1 — none of the three figures is a literal: each varies across two different inputs", () => {
  // uplift across two record sets
  const upA = engine.realizationUplift([engine.FPA_INTAKE]).upliftDollars;
  const upB = engine.realizationUplift([engine.FPA_INTAKE, engine.FPA_INTAKE]).upliftDollars;
  assert.notEqual(upA, upB, "uplift scales with the record set (not a constant)");
  // governance unlock across two record sets
  const guA = engine.governanceUnlock([engine.FPA_INTAKE]).unlockDollars;
  const guB = engine.governanceUnlock([engine.FPA_INTAKE, engine.FPA_INTAKE]).unlockDollars;
  assert.notEqual(guA, guB);
});
