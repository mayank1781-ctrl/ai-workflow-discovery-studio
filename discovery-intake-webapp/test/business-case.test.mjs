// Executed tests for computeBusinessCase() — the role/project business-case
// math in app.js. The real shipped source is extracted and evaluated (see
// test/helpers/extract.mjs); no DOM, no network. The math is asserted exactly
// from the function's own echoed inputs, so the assertions hold whether the
// instance/minute parsers matched the cell text or fell back to defaults.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();

function sandbox() {
  return buildSandbox(source, {
    consts: ["BC_BLENDED_RATE", "BC_WORKING_WEEKS", "BC_ROLE_RATES"],
    functions: [
      "computeBusinessCase",
      "bcDetectWorkflowMode",
      "bcParseInstancesPerWeek",
      "bcParseMinutes",
      "bcParseDurationWeeks",
      "blendedRateForRole",
      "gridCellValue",
      "stepPatternList"
    ],
    globals: { state: { sessionMeta: {}, settings: {} } }
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
  assert.equal(analyst.blendedRate, 75, "analyst rate from BC_ROLE_RATES");
  const { instances_per_week, mins_per_instance } = analyst.inputs;
  const expectedHours = (instances_per_week * mins_per_instance) / 60;
  assert.equal(analyst.results.hoursPerWeek, expectedHours);
  assert.equal(analyst.results.annualHours, expectedHours * 48);
  assert.equal(analyst.results.annualValue, expectedHours * 48 * 75);
  assert.equal(analyst.results.totalHours, null, "project-mode outputs stay null in role mode");

  const principal = computeBusinessCase(steps, ROLE_TEXT, "principal");
  assert.equal(principal.blendedRate, 200, "principal rate from BC_ROLE_RATES");
  assert.equal(principal.results.annualValue, expectedHours * 48 * 200);
  assert.ok(principal.results.annualValue > analyst.results.annualValue, "higher role rate must raise annual value");
});

test("business case math: project mode at two role rates", () => {
  const { computeBusinessCase } = sandbox();
  const steps = [step("20 times per week", "15 minutes")];

  const consultant = computeBusinessCase(steps, PROJECT_TEXT, "consultant");
  assert.equal(consultant.workflowMode, "project");
  assert.equal(consultant.blendedRate, 100, "consultant rate from BC_ROLE_RATES");
  assert.equal(consultant.reusabilityFlag, true, "project mode flags reusability");
  const { instances_per_week, mins_per_instance, project_duration_weeks } = consultant.inputs;
  assert.ok(project_duration_weeks > 0, "project mode must resolve a duration");
  const expectedTotal = (instances_per_week * project_duration_weeks * mins_per_instance) / 60;
  assert.equal(consultant.results.totalHours, expectedTotal);
  assert.equal(consultant.results.projectValue, expectedTotal * 100);
  assert.equal(consultant.results.annualValue, null, "role-mode outputs stay null in project mode");

  const manager = computeBusinessCase(steps, PROJECT_TEXT, "manager");
  assert.equal(manager.blendedRate, 150, "manager rate from BC_ROLE_RATES");
  assert.equal(manager.results.projectValue, expectedTotal * 150);
});
