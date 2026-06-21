// P4 / M1 — the hardening boundary: numeric bounds + per-field provenance + draft/hardened split.
//
// Audit majors:
//  - buildSpec / buildRecipe produced outputs from UNCONFIRMED records (the trust boundary leaked).
//  - records with all key values inferred could still harden.
//  - negative time values passed validation and distorted the economics.
//
// Fix: buildSpec / buildRecipe now assert the full canHarden gate (refuse unconfirmed); explicit
// buildDraftSpec / buildDraftRecipe produce clearly-tagged previews; validateIntake enforces
// numeric bounds; confirmBlockers refuses an all-inferred (no stated time) record.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";

const unconfirmed = { ...engine.FPA_INTAKE, recap: { confirmed: false } };

test("M1 — the HARDENED buildSpec/buildRecipe REFUSE an unconfirmed unit", () => {
  assert.throws(() => engine.buildSpec(unconfirmed), /refused: cannot harden/i, "buildSpec refuses");
  assert.throws(() => engine.buildRecipe(unconfirmed), /refused: cannot harden/i, "buildRecipe refuses");
  // The confirmed fixture still hardens.
  assert.ok(engine.buildSpec(engine.FPA_INTAKE), "confirmed unit hardens");
  assert.ok(engine.buildRecipe(engine.FPA_INTAKE), "confirmed unit hardens");
});

test("M1 — buildDraft* previews an unconfirmed unit WITHOUT asserting, clearly tagged draft", () => {
  const ds = engine.buildDraftSpec(unconfirmed);
  assert.equal(ds.draft, true, "draft spec is tagged draft");
  assert.ok(ds.modelFit && ds.modelFit.value, "draft spec still has content for preview");
  const dr = engine.buildDraftRecipe(unconfirmed);
  assert.equal(dr.draft, true, "draft recipe is tagged draft");
  assert.ok(Array.isArray(dr.orderedSteps), "draft recipe still renders steps");
});

test("M1 — a hardened spec/recipe is tagged hardened (and not draft)", () => {
  const s = engine.buildSpec(engine.FPA_INTAKE);
  assert.equal(s.hardened, true);
  assert.equal(s.draft, false);
  const r = engine.buildRecipe(engine.FPA_INTAKE);
  assert.equal(r.hardened, true);
  assert.equal(r.draft, false);
});

test("M1 — numeric bounds: negative / out-of-range / NaN values are INVALID (never used)", () => {
  const negTime = { ...engine.FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "internal", time: -5 }] };
  const v = engine.validateIntake(negTime);
  assert.equal(v.ok, false, "negative time is invalid");
  assert.ok(v.errors.some(e => /time/.test(e) && /bounds|finite|valid/.test(e)), "the error names the bad time");

  assert.equal(engine.validateIntake({ ...engine.FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "internal", theo: 140 }] }).ok, false, "theo > 100 is invalid");
  assert.equal(engine.validateIntake({ ...engine.FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "internal", time: NaN }] }).ok, false, "NaN time is invalid");
  assert.equal(engine.validateIntake({ ...engine.FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "internal", wait: -1 }] }).ok, false, "negative wait is invalid");
  // A clean in-bounds record is still valid (no over-rejection).
  assert.equal(engine.validateIntake(engine.FPA_INTAKE).ok, true, "the clean fixture is still valid");
});

test("M1 — a negative-time record cannot harden (the gate blocks it end to end)", () => {
  const negTime = { ...engine.RECON_INTAKE, steps: engine.RECON_INTAKE.steps.map((s, i) => i === 0 ? { ...s, time: -10 } : s) };
  assert.equal(engine.canHarden(negTime), false);
  assert.throws(() => engine.buildSpec(negTime), /refused/i);
});

test("M1 — per-field provenance: an all-inferred (no stated time) record CANNOT harden", () => {
  // Strip every stated time -> the capacity would rest entirely on class defaults.
  const allInferred = { ...engine.RECON_INTAKE, steps: engine.RECON_INTAKE.steps.map(s => { const c = { ...s }; delete c.time; return c; }) };
  assert.equal(engine.canHarden(allInferred), false, "all-inferred cannot harden");
  assert.ok(engine.confirmBlockers(allInferred).some(b => b.rule === "all-inferred-time"), "the provenance blocker is named");
  assert.throws(() => engine.buildSpec(allInferred), /refused/i, "the hardened builder refuses it");
  // One stated time anywhere clears the provenance gate.
  const oneTime = { ...allInferred, steps: allInferred.steps.map((s, i) => i === 0 ? { ...s, time: 12 } : s) };
  assert.ok(engine.provenanceBlockers(oneTime).length === 0, "one stated time is enough to clear the provenance gate");
});

test("M1 — the confirmed golden fixtures still harden (no over-blocking)", () => {
  assert.ok(engine.canHarden(engine.FPA_INTAKE));
  assert.ok(engine.canHarden(engine.RECON_INTAKE));
  assert.equal(engine.provenanceBlockers(engine.FPA_INTAKE).length, 0);
});
