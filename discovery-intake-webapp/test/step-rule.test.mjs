// A1 — the unit-of-work STEP RULE (rubric Section 0), enforced in the engine:
//   a step is one CLASS of work, by one PERSON, spanning any number of systems at once, ending at
//   the first of (a) class change · (b) person change · (c) wait-on-signal. Switching systems is NOT
//   a boundary; a DECISION is always its own step. Counting is Option A — a multi-system step's
//   capacity counts to the step as a whole, never split per system.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

test("A1 — STEP_RULE encodes the three boundaries, the non-boundary, and decision-always", () => {
  assert.deepEqual(E.STEP_RULE.boundaries, ["class-change", "person-change", "wait-on-signal"]);
  assert.ok(E.STEP_RULE.notABoundary.includes("system-switch"));
  assert.match(E.STEP_RULE.always, /decision/);
  assert.match(E.STEP_RULE.counting, /Option A/);
});

test("A1 — a 'draft and approve' utterance flags a required split (class-change boundary)", () => {
  const f = E.flagCombinedStep("I draft the memo and approve the waiver");
  assert.equal(f.combined, true);
  assert.equal(f.boundary, "class-change");
  assert.ok(f.acts.some((a) => a.cls === "build" || a.cls === "gather" || a.cls === "assembly"), "the draft is AI-class (build)");
  assert.ok(f.acts.some((a) => a.cls === "decision" || a.cls === "judgment"), "the call stays human-held");
});

test("A1 — a single-act assembly step is NOT split (no false positive; round-trips as one)", () => {
  const f = E.flagCombinedStep("reconcile the two ledgers");
  assert.equal(f.combined, false);
  assert.equal(f.boundary, null);
  const s = E.splitCombinedStep({ step: "Reconcile the two ledgers", cls: "assembly", data: "internal", time: 12 });
  assert.equal(s.combined, false);
  assert.equal(s.steps.length, 1);
  assert.equal(s.steps[0].cls, "assembly");
});

test("A1 — recon s1 'Classify and open' splits into two steps: a human read + a carried open", () => {
  const s1 = E.splitCombinedStep(E.RECON_S1_COMBINED);
  assert.equal(s1.combined, true);
  assert.equal(s1.steps.length, 2);
  assert.ok(s1.steps.some((x) => x.cls === "judgment"), "the read whether-real-break stays human-held");
  assert.ok(s1.steps.some((x) => x.cls === "gather" || x.cls === "build" || x.cls === "assembly"), "opening/pulling the case is AI can carry");
  // the data tier rides along to each atomic step; no invented per-act time
  assert.ok(s1.steps.every((x) => x.data === "confidential"));
  assert.ok(s1.steps.every((x) => x.time === undefined), "time is re-inferred by class, not a split share");
});

test("A1 — a decision in a combined utterance is always carved into its own step", () => {
  const s = E.splitCombinedStep({ step: "post the entry and sign off the close", utterance: "post the entry and sign off the close", cls: "assembly", data: "internal" });
  assert.equal(s.combined, true);
  assert.ok(s.steps.some((x) => x.cls === "decision"), "the sign-off is its own decision step");
});

test("A1 — stepSystems records every involved system without dividing the work", () => {
  assert.equal(E.stepSystems({ tool: "ERP, SharePoint, recon engine" }).length, 3);
  assert.equal(E.stepSystems({ tool: "ERP" }).length, 1);
  assert.equal(E.stepSystems({ systems: [{ ref: "sysA" }, { id: "sysB" }, "sysC"] }).length, 3);
  assert.deepEqual(E.stepSystems({}), []);
});

test("A1 — Option-A: a one-class step touching three systems keeps its capacity whole (not divided)", () => {
  const mk = (tool) => E.normalizeIntake({ steps: [{ step: "Pull and reconcile feeds", cls: "assembly", data: "internal", time: 100, theo: 80, tool }] }).steps;
  const one = E.roleCapacity(mk("ERP"), "Conservative");
  const three = E.roleCapacity(mk("ERP, SharePoint, recon engine"), "Conservative");
  assert.equal(three.grossValue, one.grossValue, "capacity is the step's, never split per system");
  assert.equal(three.permittedHrs, one.permittedHrs);
  // cost-to-serve is likewise the step's, not per-system
  const cOne = E.costToServe(mk("ERP"), "Conservative", "routed").annual;
  const cThree = E.costToServe(mk("ERP, SharePoint, recon engine"), "Conservative", "routed").annual;
  assert.equal(cThree, cOne);
});

test("A1 — additive: absent the new fields, the canonical seeds are unchanged", () => {
  // splitCombinedStep never mutates a step that doesn't bundle classes; capacity on the seeds is intact
  const recon = E.roleCapacity(E.normalizeIntake(E.RECON_INTAKE).steps, "Conservative");
  assert.ok(recon.grossValue > 0);
  // the canonical RECON_INTAKE still has its original 6 steps (the split is demonstrated on the s1 example, not the seed)
  assert.equal(E.RECON_INTAKE.steps.length, 6);
});
