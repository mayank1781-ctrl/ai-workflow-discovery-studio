// P10 / m1 + m2 — F0 intake reconcile (drifted field names) + capability-vocabulary integrity.
//
// m2 (field-name drift): the stress dataset uses header.department, seam.criticality, and
// judgmentCore, where the engine's canonical intake names are header.dept, seam.crit, and
// judgment{needs,hard,cues,human}. The engine now reconciles these at F0 (additively), so a
// drifted record validates and hardens without editing every dataset entry.
//
// m1 (unresolved capability tag): a step.capability outside the controlled ~12-tag vocabulary
// (e.g. wf-cib-operations-recon-exception-matching:s1's typo) is surfaced at intake, never
// silently accepted (it would corrupt the reuse / adjacency clustering).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";

// A clean record using the DRIFTED field names.
function driftedRecord() {
  const r = structuredClone(engine.RECON_INTAKE);
  r.header = { persona: "Ops Analyst", department: "CIB Operations", anchor: "Recon (drifted names)", lifecycle: "confirmed" };
  delete r.header.dept;
  r.judgmentCore = r.judgment; delete r.judgment;
  r.seams = r.seams.map((s) => { const c = { ...s, criticality: s.crit }; delete c.crit; return c; });
  return r;
}

test("m2 — reconcileIntake maps department->dept, criticality->crit, judgmentCore->judgment", () => {
  const r = engine.reconcileIntake(driftedRecord());
  assert.equal(r.header.dept, "CIB Operations", "department -> dept");
  assert.ok(r.seams.every((s) => s.crit), "criticality -> crit on every seam");
  assert.ok(r.judgment && r.judgment.needs && r.judgment.human, "judgmentCore -> judgment{needs,hard,cues,human}");
});

test("m2 — a drifted-but-clean record now VALIDATES (coverage 100) and HARDENS", () => {
  const drift = driftedRecord();
  // Without reconcile, dept / judgment.* would read as coverage gaps. With it, coverage is complete.
  assert.equal(engine.validateIntake(drift).coverage.pct, 100, JSON.stringify(engine.validateIntake(drift).coverage.gaps));
  assert.ok(engine.canHarden(drift), JSON.stringify(engine.confirmBlockers(drift)));
});

test("m2 — reconcile is idempotent + additive (a canonical record is returned by reference, unchanged)", () => {
  // No drift fields present -> the same object is returned (byte-identical path for every caller).
  assert.equal(engine.reconcileIntake(engine.RECON_INTAKE), engine.RECON_INTAKE);
  assert.equal(engine.reconcileIntake(engine.FPA_INTAKE), engine.FPA_INTAKE);
  // Reconciling an already-reconciled record is a no-op.
  const once = engine.reconcileIntake(driftedRecord());
  assert.deepEqual(engine.reconcileIntake(once), once);
});

test("m2 — an explicit canonical field is never clobbered by its drifted twin", () => {
  const both = structuredClone(engine.RECON_INTAKE);
  both.header = { ...both.header, department: "WRONG", dept: "CIB Operations" };
  assert.equal(engine.reconcileIntake(both).header.dept, "CIB Operations", "canonical dept wins over department");
});

test("m1 — an unresolved capability tag is SURFACED at intake (not silently accepted)", () => {
  const bad = { ...engine.RECON_INTAKE, steps: engine.RECON_INTAKE.steps.map((s, i) => i === 0 ? { ...s, capability: "frobnicate-widgets" } : s) };
  const v = engine.validateIntake(bad);
  assert.equal(v.ok, false, "the unresolved tag fails validation");
  assert.ok(v.errors.some((e) => /capability/.test(e) && /frobnicate-widgets/.test(e)), "the error names the bad tag");
  // And it blocks hardening (the gate reads validateIntake errors).
  assert.equal(engine.canHarden(bad), false);
});

test("m1 — every tag in the controlled vocabulary is accepted", () => {
  const VOCAB = ["classify-and-route", "extract-and-map", "reconcile-two-sources", "draft-from-template", "summarize-thread", "validate-against-rules", "research-and-synthesize", "assemble-evidence-pack", "schedule-and-coordinate", "screen-against-list", "spread-into-schema", "generate-report"];
  for (const tag of VOCAB) {
    const rec = { ...engine.RECON_INTAKE, steps: engine.RECON_INTAKE.steps.map((s, i) => i === 0 ? { ...s, capability: tag } : s) };
    assert.equal(engine.validateIntake(rec).ok, true, `${tag} is accepted`);
  }
});
