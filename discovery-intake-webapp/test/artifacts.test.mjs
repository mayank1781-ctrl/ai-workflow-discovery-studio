// P4 A-4 — step.artifacts[] + convening channel (covered by workActions channel="synchronous_human").
// Artifacts are additive on any step. type + direction must resolve to the controlled vocabulary.
// The convening action (a meeting that produces decisions) is captured via workActions channel, not a
// separate field. Tests here cover artifact enumeration, validateIntake guards, and stepArtifacts().
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

// ---- stepArtifacts ----

test("P4 A4 — stepArtifacts returns known type+direction pairs", () => {
  const s = { artifacts: [
    { type: "recording", direction: "produced" },
    { type: "transcript", direction: "produced" },
  ]};
  const result = E.stepArtifacts(s);
  assert.equal(result.length, 2);
  assert.equal(result[0].type, "recording");
  assert.equal(result[1].direction, "produced");
});

test("P4 A4 — stepArtifacts filters out unknown type or direction silently", () => {
  const s = { artifacts: [
    { type: "recording", direction: "produced" },
    { type: "whiteboard", direction: "produced" },   // unknown type
    { type: "file", direction: "archived" },          // unknown direction
  ]};
  assert.equal(E.stepArtifacts(s).length, 1, "only the valid artifact survives");
});

test("P4 A4 — stepArtifacts returns [] when artifacts absent", () => {
  assert.deepEqual(E.stepArtifacts({}), []);
  assert.deepEqual(E.stepArtifacts({ artifacts: [] }), []);
  assert.deepEqual(E.stepArtifacts(null), []);
});

// ---- all ARTIFACT_TYPES and ARTIFACT_DIRECTIONS are exported and non-empty ----

test("P4 A4 — ARTIFACT_TYPES covers the expected set", () => {
  for (const t of ["recording", "transcript", "decision_log", "email_thread", "file", "system_record"]) {
    assert.ok(E.ARTIFACT_TYPES.includes(t), `missing type: ${t}`);
  }
});

test("P4 A4 — ARTIFACT_DIRECTIONS covers consumed and produced", () => {
  assert.ok(E.ARTIFACT_DIRECTIONS.includes("consumed") && E.ARTIFACT_DIRECTIONS.includes("produced"));
});

// ---- validateIntake guards ----

test("P4 A4 — unknown artifact type is rejected", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ ...E.FPA_INTAKE.steps[0], artifacts: [{ type: "whiteboard", direction: "produced" }] }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /artifact/.test(e) && /unknown type/.test(e)), `errors: ${r.errors}`);
});

test("P4 A4 — unknown artifact direction is rejected", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ ...E.FPA_INTAKE.steps[0], artifacts: [{ type: "file", direction: "stored" }] }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /artifact/.test(e) && /unknown direction/.test(e)), `errors: ${r.errors}`);
});

test("P4 A4 — valid artifacts pass validateIntake", () => {
  const r = E.validateIntake({
    ...E.FPA_INTAKE,
    steps: [{ ...E.FPA_INTAKE.steps[0], artifacts: [
      { type: "decision_log", direction: "produced" },
      { type: "email_thread", direction: "consumed" },
    ]}],
  });
  assert.equal(r.ok, true, `unexpected errors: ${r.errors}`);
});

// ---- convening channel (P4 A-5 §5.5 coverage via workActions) ----

test("P4 A4 — a synchronous_human channel (meeting/convening) forces human_in_loop derivedShape", () => {
  const shape = E.deriveStepSolutionShape({
    solutionShape: "agentic",
    workActions: [
      { owner: "ai",    channel: "online",             addressability: 70 },
      { owner: "human", channel: "synchronous_human",                    },
    ],
  });
  assert.equal(shape, "human_in_loop");
});

// ---- additive ----

test("P4 A4 — FPA_INTAKE and RECON_INTAKE have no artifacts (additive, seeds unchanged)", () => {
  assert.ok(E.FPA_INTAKE.steps.every(s => !s.artifacts || s.artifacts.length === 0));
  assert.ok(E.RECON_INTAKE.steps.every(s => !s.artifacts || s.artifacts.length === 0));
});
