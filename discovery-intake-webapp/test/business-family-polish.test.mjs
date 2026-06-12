// Executed tests for the UX polish PR, Slice 3 — business case + family chip.
//   item 7  — the basis-line rate suffix mirrors the snapshot's rateSource:
//             "(Settings override)" / "(<Role>)" / "(default rate)";
//   item 9  — family chip de-emphasis: muted chip + color dot, with the
//             click-to-change wiring and popover untouched (settled: logic
//             kept, weight only);
//   item 10 — both business-case render sites (Recipe Book + Engineering Doc)
//             share businessCaseBlockForCurrentWorkflow AND both wire the
//             Compute/Recompute button (a site that renders without wiring
//             would show a dead button).
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function blockSandbox() {
  return buildSandbox(source, {
    consts: ["BC_ROLE_LABELS"],
    functions: ["businessCaseBlockHtml"],
    globals: { escapeHtml: (value) => String(value) }
  });
}

const roleSnapshot = (over = {}) => ({
  workflowMode: "role",
  rateSource: "role",
  userRole: "",
  blendedRate: 100,
  defaulted: false,
  inputs: { instances_per_week: 5, mins_per_instance: 30 },
  results: { hoursPerWeek: 2.5, annualHours: 120, annualValue: 12000 },
  ...over
});

test("rate suffix: Settings override names itself instead of claiming a role or default", () => {
  const { businessCaseBlockHtml } = blockSandbox();
  const html = businessCaseBlockHtml(roleSnapshot({ rateSource: "override", userRole: "consultant", blendedRate: 145 }));
  assert.ok(html.includes("$145/hr (Settings override)"), "override is labeled as the source");
  assert.ok(!html.includes("default"), "no 'default' copy on an overridden rate");
  assert.ok(!html.includes("(Consultant)"), "role label doesn't mask the override");
});

test("rate suffix: role label when set, '(default rate)' when nothing was", () => {
  const { businessCaseBlockHtml } = blockSandbox();
  const withRole = businessCaseBlockHtml(roleSnapshot({ userRole: "manager", blendedRate: 150 }));
  assert.ok(withRole.includes("$150/hr (Manager)"), "role rate carries its level label");
  const bare = businessCaseBlockHtml(roleSnapshot());
  assert.ok(bare.includes("$100/hr (default rate)"), "unset role is an explicit default");
});

test("project mode carries the same rateSource-aware suffix", () => {
  const { businessCaseBlockHtml } = blockSandbox();
  const html = businessCaseBlockHtml({
    workflowMode: "project",
    rateSource: "override",
    userRole: "",
    blendedRate: 130,
    defaulted: false,
    inputs: { instances_per_week: 5, mins_per_instance: 30, project_duration_weeks: 12 },
    results: { totalHours: 120, projectValue: 15600 }
  });
  assert.ok(html.includes("$130/hr (Settings override)"));
});

test("family chip: de-emphasized but logic untouched", () => {
  const header = extractFunction(source, "recipeWorkflowHeaderHtml");
  // Wiring + popover survive (settled decision: keep the logic).
  assert.ok(header.includes("data-family-chip") && header.includes("data-family-menu"), "chip + menu wiring intact");
  // Weight reduction: no more family-colored fill/border on the chip button;
  // the family color survives only as the small dot.
  assert.ok(!header.includes("background:${familyColor}22"), "colored chip fill removed");
  assert.ok(!header.includes("text-transform:uppercase;letter-spacing:0.04em;cursor:pointer;\">${escapeHtml(family"), "shouty uppercase chip removed");
  assert.ok(header.includes("border-radius:50%;background:${familyColor}"), "family color lives in the dot");
  // The recipe-card meta echo matches: muted text, dot carries the color.
  const cards = extractFunction(source, "renderAnalysisTabRecipe");
  assert.ok(!/color:\$\{WORKFLOW_FAMILY_COLOR\[[^\]]+\] \|\| "#8899aa"\};font-weight:600/.test(cards),
    "no family-colored bold text in the card meta row");
  assert.ok(cards.includes('background:${WORKFLOW_FAMILY_COLOR[state.workflowGrid.workflowFamily] || "#8899aa"}'),
    "card meta keeps the family color as a dot");
});

test("both business-case render sites share the block and wire its button", () => {
  for (const fnName of ["renderAnalysisTabRecipe", "renderAnalysisTabEngineering"]) {
    const fn = extractFunction(source, fnName);
    assert.ok(fn.includes("businessCaseBlockForCurrentWorkflow()"), `${fnName} renders the shared block`);
    assert.ok(fn.includes("wireBusinessCaseBlock("), `${fnName} wires Compute/Recompute — no dead button`);
  }
});
