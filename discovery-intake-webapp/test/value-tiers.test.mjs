// P4 A-5 — value tiers + augmentation floor config.
// valueTier (routine|valued|critical) and augmentationFloor (0..100) are advisory and
// presentational — they do not change capacity/cost math. Additive: absent fields return
// defaults and seeds are byte-identical. buildValueProfile() is the derivation function.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

function cap() {
  return E.roleCapacity(E.normalizeIntake(E.FPA_INTAKE).steps, "Conservative");
}

// ---- VALUE_TIERS exported ----

test("P4 A5 — VALUE_TIERS exports routine, valued, critical", () => {
  for (const t of ["routine", "valued", "critical"]) {
    assert.ok(E.VALUE_TIERS.includes(t), `missing: ${t}`);
  }
});

// ---- buildValueProfile ----

test("P4 A5 — buildValueProfile: absent fields use defaults (valueTier=routine, floor=50)", () => {
  const vp = E.buildValueProfile({}, cap());
  assert.equal(vp.valueTier, "routine");
  assert.equal(vp.augmentationFloor, E.AUGMENTATION_FLOOR_DEFAULT);
  assert.equal(typeof vp.theoPct, "number");
  assert.equal(typeof vp.belowFloor, "boolean");
});

test("P4 A5 — buildValueProfile: stated valueTier and augmentationFloor are honoured", () => {
  const vp = E.buildValueProfile({ valueTier: "critical", augmentationFloor: 80 }, cap());
  assert.equal(vp.valueTier, "critical");
  assert.equal(vp.augmentationFloor, 80);
});

test("P4 A5 — buildValueProfile: belowFloor=true and advisory message when theoPct < floor", () => {
  // FPA theoPct ~55%, so floor=80 should trigger
  const vp = E.buildValueProfile({ augmentationFloor: 80 }, cap());
  assert.equal(vp.belowFloor, true);
  assert.ok(typeof vp.advisory === "string" && vp.advisory.length > 0, "advisory is a non-empty string");
  assert.match(vp.advisory, /augmentation floor/);
});

test("P4 A5 — buildValueProfile: belowFloor=false and advisory=null when theoPct >= floor", () => {
  const vp = E.buildValueProfile({ augmentationFloor: 30 }, cap());
  assert.equal(vp.belowFloor, false);
  assert.equal(vp.advisory, null);
});

test("P4 A5 — buildValueProfile: unknown valueTier falls back to routine (no throw)", () => {
  const vp = E.buildValueProfile({ valueTier: "super-critical" }, cap());
  assert.equal(vp.valueTier, "routine");
});

test("P4 A5 — buildValueProfile: absent cap returns theoPct=0", () => {
  const vp = E.buildValueProfile({ valueTier: "valued" }, null);
  assert.equal(vp.theoPct, 0);
});

// ---- validateIntake guards ----

test("P4 A5 — unknown valueTier is rejected by validateIntake", () => {
  const r = E.validateIntake({ ...E.FPA_INTAKE, valueTier: "tier-X" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /valueTier/.test(e)), `errors: ${r.errors}`);
});

test("P4 A5 — valid valueTiers pass validateIntake", () => {
  for (const t of E.VALUE_TIERS) {
    const r = E.validateIntake({ ...E.FPA_INTAKE, valueTier: t });
    assert.equal(r.ok, true, `${t} should pass; errors: ${r.errors}`);
  }
});

test("P4 A5 — augmentationFloor out of bounds is rejected", () => {
  assert.equal(E.validateIntake({ ...E.FPA_INTAKE, augmentationFloor: -5 }).ok, false);
  assert.equal(E.validateIntake({ ...E.FPA_INTAKE, augmentationFloor: 150 }).ok, false);
});

test("P4 A5 — valid augmentationFloor values pass", () => {
  assert.equal(E.validateIntake({ ...E.FPA_INTAKE, augmentationFloor: 0 }).ok, true);
  assert.equal(E.validateIntake({ ...E.FPA_INTAKE, augmentationFloor: 50 }).ok, true);
  assert.equal(E.validateIntake({ ...E.FPA_INTAKE, augmentationFloor: 100 }).ok, true);
});

// ---- additive ----

test("P4 A5 — FPA_INTAKE and RECON_INTAKE have no valueTier or augmentationFloor (seeds unchanged)", () => {
  assert.ok(!("valueTier" in E.FPA_INTAKE), "FPA: no valueTier");
  assert.ok(!("augmentationFloor" in E.FPA_INTAKE), "FPA: no augmentationFloor");
  assert.ok(!("valueTier" in E.RECON_INTAKE), "RECON: no valueTier");
});

test("P4 A5 — absent valueTier + augmentationFloor leaves existing validateIntake intact", () => {
  const r = E.validateIntake(E.FPA_INTAKE);
  assert.equal(r.ok, true, `FPA_INTAKE should still pass: ${r.errors}`);
});
