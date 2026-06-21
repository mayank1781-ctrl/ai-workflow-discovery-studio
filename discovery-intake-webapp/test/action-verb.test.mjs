// A3 — the action-on-data verb (read · download · transform · write-in-place · generate-output ·
//   notify · approve, + a freeform actionNote). The verb drives controls and automatability MORE than
//   the system name does: in the SAME system and tier, `read` is cheap assembly AI can carry;
//   `write-in-place` / `approve` is controlled, often human-held. Additive: absent step.action,
//   every output is byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

const base = { step: "Reconcile the two feeds", cls: "assembly", data: "confidential", theo: 80, time: 100 };

test("A3 — the controlled action vocabulary exists", () => {
  assert.deepEqual(E.ACTION_VERBS, ["read", "download", "transform", "write-in-place", "generate-output", "notify", "approve"]);
});

test("A3 — read vs write-in-place yield different control requirements (same system/tier)", () => {
  const read = E.actionProfile("read");
  const write = E.actionProfile("write-in-place");
  assert.notDeepEqual(read.controls, write.controls);
  assert.ok(write.controls.some((c) => /four-eyes|authority|reversib/i.test(c)), "the write carries write-side controls");
  assert.equal(read.automatability, "high");
  assert.equal(write.automatability, "low");
});

test("A3 — approve is the human-held commit", () => {
  const a = E.actionProfile("approve");
  assert.equal(a.humanHeld, true);
  assert.equal(a.automatability, "human-held");
});

test("A3 — automatability is real: read carries more permitted than a controlled write", () => {
  const read = E.stepPermitted({ ...base, action: "read" }, "Conservative");
  const write = E.stepPermitted({ ...base, action: "write-in-place" }, "Conservative");
  assert.ok(read > write, `read ${read} should exceed write ${write}`);
  // an approve action earns zero permitted automation (the commit stays human)
  assert.equal(E.stepPermitted({ ...base, action: "approve" }, "Conservative"), 0);
});

test("A3 — read vs write-in-place yields different role capacity in the same tier", () => {
  const read = E.roleCapacity([{ ...base, action: "read" }], "Conservative").grossValue;
  const write = E.roleCapacity([{ ...base, action: "write-in-place" }], "Conservative").grossValue;
  assert.ok(read > write);
});

test("A3 — additive: an absent action behaves exactly like a read (no cap, byte-identical)", () => {
  assert.equal(
    E.stepPermitted(base, "Conservative"),
    E.stepPermitted({ ...base, action: "read" }, "Conservative"),
  );
  // the canonical seeds carry no action -> capacity unchanged
  assert.ok(E.roleCapacity(E.normalizeIntake(E.RECON_INTAKE).steps, "Conservative").grossValue > 0);
});

test("A3 — enum integrity: an unknown verb is surfaced; a verb + freeform note validate clean", () => {
  const bad = { ...E.RECON_INTAKE, steps: E.RECON_INTAKE.steps.map((s, i) => (i === 0 ? { ...s, action: "frobnicate" } : s)) };
  assert.equal(E.validateIntake(bad).ok, false);
  const good = { ...E.RECON_INTAKE, steps: E.RECON_INTAKE.steps.map((s, i) => (i === 0 ? { ...s, action: "read", actionNote: "screen-scrape exception list" } : s)) };
  assert.equal(E.validateIntake(good).ok, true);
});
