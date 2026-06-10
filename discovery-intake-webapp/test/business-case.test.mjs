// Executed tests for computeBusinessCase() — PR 32 moved the formula to
// server.mjs as the single source (the app.js twin was deleted); the math
// assertions below are UNCHANGED from the PR 29c suite, only the extraction
// source moved. Also pins the PR 32 snapshot shape and rateSource semantics.
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readServerSource, buildSandbox } from "./helpers/extract.mjs";

const source = readServerSource();

function sandbox({ rateOverride = null } = {}) {
  return buildSandbox(source, {
    consts: ["BC_CONFIG"],
    functions: [
      "computeBusinessCase",
      "bcDetectWorkflowMode",
      "bcParseInstancesPerWeek",
      "bcParseMinutes",
      "bcParseDurationWeeks",
      "bcStepCellValue",
      "blendedRateForRole"
    ],
    globals: { settingsRateOverride: () => rateOverride }
  });
}

function step(frequencyVolume, timeTaken) {
  return {
    cells: {
      frequencyVolume: { value: frequencyVolume, state: "confirmed", confidence: 0.9 },
      timeTaken: { value: timeTaken, state: "confirmed", confidence: 0.9 }
    }
  };
}

const ROLE_TEXT = "This is part of my job, I do it every week as a recurring routine.";
const PROJECT_TEXT = "We're doing this for a client engagement project at the bank.";

test("business case math: role mode at two role rates", () => {
  const { computeBusinessCase } = sandbox();
  const steps = [step("10 times per week", "30 minutes")];

  const analyst = computeBusinessCase(steps, ROLE_TEXT, "analyst");
  assert.equal(analyst.workflowMode, "role");
  assert.equal(analyst.blendedRate, 75, "analyst rate from the config table");
  const { instances_per_week, mins_per_instance } = analyst.inputs;
  const expectedHours = (instances_per_week * mins_per_instance) / 60;
  assert.equal(analyst.results.hoursPerWeek, expectedHours);
  assert.equal(analyst.results.annualHours, expectedHours * 48);
  assert.equal(analyst.results.annualValue, expectedHours * 48 * 75);
  assert.equal(analyst.results.totalHours, null, "project-mode outputs stay null in role mode");

  const principal = computeBusinessCase(steps, ROLE_TEXT, "principal");
  assert.equal(principal.blendedRate, 200, "principal rate from the config table");
  assert.equal(principal.results.annualValue, expectedHours * 48 * 200);
  assert.ok(principal.results.annualValue > analyst.results.annualValue, "higher role rate must raise annual value");
});

test("business case math: project mode at two role rates", () => {
  const { computeBusinessCase } = sandbox();
  const steps = [step("20 times per week", "15 minutes")];

  const consultant = computeBusinessCase(steps, PROJECT_TEXT, "consultant");
  assert.equal(consultant.workflowMode, "project");
  assert.equal(consultant.blendedRate, 100, "consultant rate from the config table");
  assert.equal(consultant.reusabilityFlag, true, "project mode flags reusability");
  const { instances_per_week, mins_per_instance, project_duration_weeks } = consultant.inputs;
  assert.ok(project_duration_weeks > 0, "project mode must resolve a duration");
  const expectedTotal = (instances_per_week * project_duration_weeks * mins_per_instance) / 60;
  assert.equal(consultant.results.totalHours, expectedTotal);
  assert.equal(consultant.results.projectValue, expectedTotal * 100);
  assert.equal(consultant.results.annualValue, null, "role-mode outputs stay null in project mode");

  const manager = computeBusinessCase(steps, PROJECT_TEXT, "manager");
  assert.equal(manager.blendedRate, 150, "manager rate from the config table");
  assert.equal(manager.results.projectValue, expectedTotal * 150);
});

test("PR 32 snapshot shape: full computation context is present", () => {
  const { computeBusinessCase } = sandbox();
  const snapshot = computeBusinessCase([step("10 times per week", "30 minutes")], ROLE_TEXT, "consultant");
  assert.equal(snapshot.rate, 100);
  assert.equal(snapshot.rateSource, "role");
  assert.equal(typeof snapshot.instancesPerWeek, "number");
  assert.equal(typeof snapshot.minsPerInstance, "number");
  assert.equal(snapshot.durationWeeks, null, "role mode has no duration");
  assert.equal(snapshot.mode, "role");
  assert.equal(snapshot.formulaVersion, 1, "formulaVersion stamps the snapshot");
  assert.equal(snapshot.defaulted, false, "parsed inputs are not defaulted");
  // computedAt is stamped by the ENDPOINT (a snapshot exists only on explicit
  // user action), not by the pure formula.
  assert.ok(!("computedAt" in snapshot), "pure formula does not stamp computedAt");
});

test("rateSource: a Settings override wins and is labeled 'override'", () => {
  const { computeBusinessCase } = sandbox({ rateOverride: 145 });
  const snapshot = computeBusinessCase([step("10 times per week", "30 minutes")], ROLE_TEXT, "principal");
  assert.equal(snapshot.rate, 145, "override wins over the principal role rate");
  assert.equal(snapshot.rateSource, "override");
  assert.equal(snapshot.results.blendedRate, 145, "results use the override rate");
});
