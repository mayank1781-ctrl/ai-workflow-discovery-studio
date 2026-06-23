// P4 A1 Addendum — ownershipFamily + workflowOwnershipSplit
// Pure engine functions; additive — zero change to any seed numeric output.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

// ---- constant exports ----

test("P4 A1 — AI_LED_CLASSES contains gather and build only", () => {
  assert.ok(E.AI_LED_CLASSES.includes("gather"), "gather in AI_LED_CLASSES");
  assert.ok(E.AI_LED_CLASSES.includes("build"), "build in AI_LED_CLASSES");
  assert.equal(E.AI_LED_CLASSES.length, 2, "exactly two ai_led classes");
});

test("P4 A1 — HUMAN_LED_CLASSES contains judgment, decision, human_held", () => {
  for (const cls of ["judgment", "decision", "human_held"]) {
    assert.ok(E.HUMAN_LED_CLASSES.includes(cls), `${cls} in HUMAN_LED_CLASSES`);
  }
  assert.equal(E.HUMAN_LED_CLASSES.length, 3, "exactly three human_led classes");
});

test("P4 A1 — OWNERSHIP_FAMILIES exports the two family names", () => {
  assert.ok(E.OWNERSHIP_FAMILIES.includes("ai_led"), "ai_led in OWNERSHIP_FAMILIES");
  assert.ok(E.OWNERSHIP_FAMILIES.includes("human_led"), "human_led in OWNERSHIP_FAMILIES");
  assert.equal(E.OWNERSHIP_FAMILIES.length, 2);
});

// ---- ownershipFamily: all five rung mappings ----

test("P4 A1 — ownershipFamily: gather → ai_led", () => {
  assert.equal(E.ownershipFamily("gather"), "ai_led");
});

test("P4 A1 — ownershipFamily: build → ai_led", () => {
  assert.equal(E.ownershipFamily("build"), "ai_led");
});

test("P4 A1 — ownershipFamily: judgment → human_led", () => {
  assert.equal(E.ownershipFamily("judgment"), "human_led");
});

test("P4 A1 — ownershipFamily: decision → human_led", () => {
  assert.equal(E.ownershipFamily("decision"), "human_led");
});

test("P4 A1 — ownershipFamily: human_held → human_led", () => {
  assert.equal(E.ownershipFamily("human_held"), "human_led");
});

test("P4 A1 — ownershipFamily: legacy 'assembly' maps to ai_led", () => {
  assert.equal(E.ownershipFamily("assembly"), "ai_led");
});

test("P4 A1 — ownershipFamily: unknown cls → null", () => {
  assert.equal(E.ownershipFamily("unknown"), null);
  assert.equal(E.ownershipFamily(""), null);
  assert.equal(E.ownershipFamily(null), null);
  assert.equal(E.ownershipFamily(undefined), null);
  assert.equal(E.ownershipFamily(42), null);
});

// ---- workflowOwnershipSplit: rollup arithmetic ----

test("P4 A1 — workflowOwnershipSplit: all-ai_led steps → aiLed=100", () => {
  const steps = [{ cls: "gather", time: 30 }, { cls: "build", time: 20 }];
  const split = E.workflowOwnershipSplit(steps);
  assert.equal(split.aiLed, 100, "should be 100% ai_led");
  assert.equal(split.humanLed, 0);
  assert.equal(split.unknown, 0);
});

test("P4 A1 — workflowOwnershipSplit: all-human_led steps → humanLed=100", () => {
  const steps = [{ cls: "judgment", time: 20 }, { cls: "decision", time: 30 }, { cls: "human_held", time: 10 }];
  const split = E.workflowOwnershipSplit(steps);
  assert.equal(split.humanLed, 100);
  assert.equal(split.aiLed, 0);
  assert.equal(split.unknown, 0);
});

test("P4 A1 — workflowOwnershipSplit: 50/50 mix computes correct shares", () => {
  const steps = [{ cls: "gather", time: 50 }, { cls: "judgment", time: 50 }];
  const split = E.workflowOwnershipSplit(steps);
  assert.equal(split.aiLed, 50);
  assert.equal(split.humanLed, 50);
  assert.equal(split.unknown, 0);
});

test("P4 A1 — workflowOwnershipSplit: aiLed + humanLed + unknown ≤ 100.1 (rounding tolerance)", () => {
  const steps = [
    { cls: "gather", time: 10 }, { cls: "build", time: 10 },
    { cls: "judgment", time: 10 }, { cls: "decision", time: 10 }, { cls: "human_held", time: 10 },
  ];
  const { aiLed, humanLed, unknown } = E.workflowOwnershipSplit(steps);
  assert.ok(aiLed + humanLed + unknown <= 100.1, `sum ${aiLed + humanLed + unknown} should be ≤ 100.1`);
  assert.ok(aiLed + humanLed + unknown >= 99.9, `sum ${aiLed + humanLed + unknown} should be ≥ 99.9`);
});

test("P4 A1 — workflowOwnershipSplit: legacy assembly counted as ai_led", () => {
  const steps = [{ cls: "assembly", time: 50 }, { cls: "decision", time: 50 }];
  const split = E.workflowOwnershipSplit(steps);
  assert.equal(split.aiLed, 50, "assembly counts as ai_led");
  assert.equal(split.humanLed, 50);
});

test("P4 A1 — workflowOwnershipSplit: steps without time are excluded from rollup", () => {
  const steps = [{ cls: "gather", time: 40 }, { cls: "judgment" }, { cls: "decision", time: 0 }];
  const split = E.workflowOwnershipSplit(steps);
  assert.equal(split.aiLed, 100, "timeless/zero-time steps excluded");
  assert.equal(split.humanLed, 0);
});

test("P4 A1 — workflowOwnershipSplit: empty array → zeroes, no throw", () => {
  const split = E.workflowOwnershipSplit([]);
  assert.deepEqual(split, { aiLed: 0, humanLed: 0, unknown: 0 });
});

test("P4 A1 — workflowOwnershipSplit: non-array input → zeroes, no throw", () => {
  assert.deepEqual(E.workflowOwnershipSplit(null), { aiLed: 0, humanLed: 0, unknown: 0 });
  assert.deepEqual(E.workflowOwnershipSplit(undefined), { aiLed: 0, humanLed: 0, unknown: 0 });
});

// ---- golden-seed guard: FPA_INTAKE and RECON_INTAKE ----

test("P4 A1 — FPA_INTAKE: majority ai_led, non-zero human_led (gather/build dominate; judgment+decision exist)", () => {
  const steps = E.normalizeIntake(E.FPA_INTAKE).steps;
  const split = E.workflowOwnershipSplit(steps);
  assert.ok(split.aiLed > 50, `FPA_INTAKE aiLed=${split.aiLed} should be majority`);
  assert.ok(split.humanLed > 0, "FPA_INTAKE has human_led steps (judgment + decision)");
  assert.equal(split.unknown, 0, "no unknown cls in FPA_INTAKE");
});

test("P4 A1 — RECON_INTAKE: majority human_led (judgment + decision dominate)", () => {
  const steps = E.normalizeIntake(E.RECON_INTAKE).steps;
  const split = E.workflowOwnershipSplit(steps);
  assert.ok(split.humanLed > split.aiLed, `RECON_INTAKE humanLed=${split.humanLed} should exceed aiLed=${split.aiLed}`);
  assert.ok(split.aiLed > 0, "RECON_INTAKE has ai_led steps (build steps)");
  assert.equal(split.unknown, 0, "no unknown cls in RECON_INTAKE");
});

test("P4 A1 — zero change to roleCapacity on FPA_INTAKE (additive proof)", () => {
  const steps = E.normalizeIntake(E.FPA_INTAKE).steps;
  const cap1 = E.roleCapacity(steps, "Conservative");
  const cap2 = E.roleCapacity(steps, "Conservative");
  assert.equal(cap1.theoPct, cap2.theoPct, "roleCapacity unchanged — ownershipFamily is pure, no mutation");
});
