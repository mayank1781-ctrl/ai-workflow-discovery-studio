// A4 — entitlement × sensitivity. The access level (read · write · approve) layered on the data tier
//   is the truer value/risk signal than tier alone: read-only on confidential scores below write/approve
//   on the same tier, and elevated entitlement on sensitive data + a decision is the high-value,
//   human-held core. Captured light: infer-then-confirm. Additive: value/risk is a separate lens,
//   capacity is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

const conf = { cls: "assembly", data: "confidential", theo: 80, time: 10 };

test("A4 — the entitlement ladder exists", () => {
  assert.deepEqual(E.ENTITLEMENTS, ["read", "write", "approve"]);
});

test("A4 — read-only on confidential scores lower value/risk than write/approve on the same tier", () => {
  const read = E.stepValueRisk({ ...conf, entitlement: "read" });
  const write = E.stepValueRisk({ ...conf, entitlement: "write" });
  const approve = E.stepValueRisk({ ...conf, entitlement: "approve" });
  assert.ok(read < write, `read ${read} < write ${write}`);
  assert.ok(write < approve, `write ${write} < approve ${approve}`);
});

test("A4 — elevated entitlement + a decision marks the highest value/risk", () => {
  const decisionApprove = E.stepValueRisk({ ...conf, cls: "decision", entitlement: "approve" });
  const assemblyWrite = E.stepValueRisk({ ...conf, entitlement: "write" });
  assert.ok(decisionApprove > assemblyWrite, "the decision multiplier lifts it above a plain write");
});

test("A4 — infer-then-confirm: the engine infers from verb + class; the human confirms", () => {
  assert.equal(E.inferEntitlement({ cls: "decision" }), "approve");
  assert.equal(E.inferEntitlement({ cls: "assembly", action: "write-in-place" }), "write");
  assert.equal(E.inferEntitlement({ cls: "assembly", action: "approve" }), "approve");
  assert.equal(E.inferEntitlement({ cls: "assembly" }), "read"); // floor; rounds up at the Workbench
  assert.equal(E.entitlementOf({ entitlement: "write" }).source, "stated");
  assert.equal(E.entitlementOf({ cls: "assembly" }).source, "inferred");
});

test("A4 — the high-value human-held core = elevated entitlement on sensitive data + a decision", () => {
  const er = E.buildEntitlementRisk(E.RECON_INTAKE);
  assert.ok(er.highValueCore.some((s) => /Approve adjustment/.test(s.step) && s.cls === "decision"));
  // the approval step is human-held — it earns zero permitted automation
  const approveStep = E.RECON_INTAKE.steps.find((s) => /Approve adjustment/.test(s.step));
  assert.equal(E.stepPermitted(approveStep, "Conservative"), 0);
});

test("A4 — inferred entitlements are flagged for confirm (never counted until confirmed)", () => {
  const er = E.buildEntitlementRisk(E.RECON_INTAKE);
  assert.ok(er.inferredCount > 0);
  assert.equal(er.confirmQueue.length, er.inferredCount);
  assert.ok(er.profile.every((e) => E.ENTITLEMENTS.includes(e)), "the entitlement profile is the B1 adjacency leg");
});

test("A4 — enum integrity surfaced; a stated entitlement validates", () => {
  const bad = { ...E.RECON_INTAKE, steps: E.RECON_INTAKE.steps.map((s, i) => (i === 0 ? { ...s, entitlement: "superuser" } : s)) };
  assert.equal(E.validateIntake(bad).ok, false);
  const good = { ...E.RECON_INTAKE, steps: E.RECON_INTAKE.steps.map((s, i) => (i === 0 ? { ...s, entitlement: "read" } : s)) };
  assert.equal(E.validateIntake(good).ok, true);
});

test("A4 — additive: entitlement is a separate value/risk lens; capacity is unchanged", () => {
  const withEnt = E.roleCapacity(E.normalizeIntake({ steps: [{ ...conf, entitlement: "write" }] }).steps, "Conservative").grossValue;
  const without = E.roleCapacity(E.normalizeIntake({ steps: [conf] }).steps, "Conservative").grossValue;
  assert.equal(withEnt, without);
});
