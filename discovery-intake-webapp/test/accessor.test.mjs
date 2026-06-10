// Executed tests for the PR 30 grid-cell accessor layer: getField/patchField
// (the single read/write chokepoint), provenance precedence, legacy-source
// derivation, the no-direct-mutation guard, and the coverage helper behind the
// stale-question fix. Real shipped source is extracted and evaluated (see
// test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function accessorSandbox(globals = {}) {
  const logs = [];
  const recordingConsole = {
    info: (...args) => logs.push(args.map(String).join(" ")),
    warn: (...args) => logs.push(args.map(String).join(" ")),
    error: (...args) => logs.push(args.map(String).join(" "))
  };
  const fns = buildSandbox(source, {
    consts: ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER", "LIVE_GRID_LAYERS"],
    functions: [
      "getField",
      "patchField",
      "deriveLegacyCellSource",
      "gridCoverageComplete",
      "normalizeGridCell",
      "newGridCell",
      "newGridStep",
      "makeId"
    ],
    globals: { console: recordingConsole, currentGridStep: () => null, ...globals }
  });
  return { ...fns, logs };
}

test("accessor round-trip: patchField writes value/state/confidence/source, getField reads it back", () => {
  const { patchField, getField, newGridStep } = accessorSandbox();
  const step = newGridStep();
  const changed = patchField(step, "layer2", "personaActors", "Ops analyst", "user-stated", 0.9);
  assert.equal(changed, true);
  const cell = getField(step, "layer2", "personaActors");
  assert.deepEqual(cell, { value: "Ops analyst", state: "confirmed", confidence: 0.9, source: "user-stated" });
  // Layer mismatch warns but never blocks the read.
  const sandbox2 = accessorSandbox();
  const step2 = sandbox2.newGridStep();
  sandbox2.patchField(step2, "layer1", "personaActors", "x", "user-stated", 0.9);
  assert.ok(sandbox2.logs.some((line) => line.includes("layer mismatch")), "mismatched layer must warn");
  assert.equal(sandbox2.getField(step2, null, "personaActors").value, "x", "write still applies");
});

test("provenance precedence: lower-provenance write over user-stated is refused and logged", () => {
  const { patchField, getField, newGridStep, logs } = accessorSandbox();
  const step = newGridStep();
  patchField(step, null, "systemsTools", "Excel, SAP", "user-stated", 0.8);
  const refused = patchField(step, null, "systemsTools", "Maybe Outlook?", "ai-inferred", 0.99);
  assert.equal(refused, false, "ai-inferred must not overwrite user-stated, even at higher confidence");
  assert.equal(getField(step, null, "systemsTools").value, "Excel, SAP");
  assert.ok(logs.some((line) => line.includes("kept user-stated systemsTools")), "the refusal must be logged, never silent");
  // doc-extracted is also outranked by user-stated.
  assert.equal(patchField(step, null, "systemsTools", "From the doc", "doc-extracted", 0.95), false);
});

test("provenance precedence: upgrades apply — user-stated replaces doc-extracted regardless of confidence", () => {
  const { patchField, getField, newGridStep } = accessorSandbox();
  const step = newGridStep();
  patchField(step, null, "painFriction", "Doc says rework is common", "doc-extracted", 0.9);
  const upgraded = patchField(step, null, "painFriction", "Manual rework every week", "user-stated", 0.5);
  assert.equal(upgraded, true, "higher provenance wins even at lower confidence");
  const cell = getField(step, null, "painFriction");
  assert.equal(cell.value, "Manual rework every week");
  assert.equal(cell.source, "user-stated");
  assert.equal(cell.state, "confirmed", "user-stated provenance confirms the cell");
});

test("equal provenance: only higher confidence improves, unless refresh replaces", () => {
  const { patchField, getField, newGridStep } = accessorSandbox();
  const step = newGridStep();
  patchField(step, null, "dataProcessing", "First pass", "ai-inferred", 0.6);
  assert.equal(patchField(step, null, "dataProcessing", "Worse pass", "ai-inferred", 0.5), false, "lower confidence refused");
  assert.equal(patchField(step, null, "dataProcessing", "Same pass", "ai-inferred", 0.6), false, "equal confidence refused");
  assert.equal(patchField(step, null, "dataProcessing", "Better pass", "ai-inferred", 0.8), true, "higher confidence improves");
  // refresh: a re-extraction replaces same-provenance values regardless of confidence.
  patchField(step, null, "output", "Old extract", "doc-extracted", 0.9);
  assert.equal(patchField(step, null, "output", "New extract", "doc-extracted", 0.6, { refresh: true }), true);
  assert.equal(getField(step, null, "output").value, "New extract");
});

test("unknown semantics: recorded only while empty, never clobbers data, later answers overwrite it", () => {
  const { patchField, getField, newGridStep } = accessorSandbox();
  const step = newGridStep();
  assert.equal(patchField(step, null, "regulatoryContext", "", "user-stated", 0, { state: "unknown" }), true);
  assert.equal(getField(step, null, "regulatoryContext").state, "unknown");
  // unknown never overwrites a captured value...
  patchField(step, null, "timeTaken", "30 minutes", "user-stated", 0.9);
  assert.equal(patchField(step, null, "timeTaken", "", "user-stated", 0, { state: "unknown" }), false);
  assert.equal(getField(step, null, "timeTaken").value, "30 minutes");
  // ...and a real answer overwrites unknown.
  assert.equal(patchField(step, null, "regulatoryContext", "SOX applies", "ai-inferred", 0.6), true);
  assert.equal(getField(step, null, "regulatoryContext").value, "SOX applies");
});

test("legacy cells derive provenance from state in normalizeGridCell", () => {
  const { normalizeGridCell } = accessorSandbox();
  assert.equal(normalizeGridCell({ value: "x", state: "confirmed", confidence: 0.9 }).source, "user-stated");
  assert.equal(normalizeGridCell({ value: "y", state: "inferred", confidence: 0.6 }).source, "ai-inferred");
  assert.equal(normalizeGridCell({ value: "", state: "empty" }).source, "");
  // An explicit modern source is preserved, never re-derived.
  assert.equal(normalizeGridCell({ value: "z", state: "confirmed", source: "doc-extracted" }).source, "doc-extracted");
});

test("guard: no direct step-cell mutation outside patchField", () => {
  // Strip patchField (the one sanctioned writer), then assert no cell-write
  // pattern remains anywhere in app.js.
  const stripped = source.replace(extractFunction(source, "patchField"), "");
  const forbidden = [
    [/\.cells\[[^\]]*\]\s*=[^=]/g, ".cells[key] = assignment"],
    [/\.cells\.[A-Za-z$_]+\s*=[^=]/g, ".cells.key = assignment"],
    [/\.cells\.[A-Za-z$_]+\.(value|state|confidence|source)\s*=[^=]/g, ".cells.key.prop = assignment"],
    [/\bcell\.(value|state|confidence|source)\s*=[^=]/g, "cell.prop = assignment"]
  ];
  for (const [pattern, label] of forbidden) {
    const matches = stripped.match(pattern) || [];
    assert.deepEqual(matches, [], `direct cell write found (${label}): ${matches.join(" | ")}`);
  }
});

test("gridCoverageComplete: true only when all 9 live-grid fields are captured", () => {
  const { gridCoverageComplete, newGridStep, patchField } = accessorSandbox();
  assert.equal(gridCoverageComplete({ steps: [] }), false, "no steps = not complete");
  const step = newGridStep();
  const grid = { steps: [step] };
  // Fill one cell from every live-grid field.
  const oneCellPerField = [
    "name", "description", "trigger", "frequencyVolume", "systemsTools",
    "personaActors", "painFriction", "dataProcessing", "dataSensitivity"
  ];
  oneCellPerField.slice(0, -1).forEach((key) => patchField(step, null, key, "captured", "user-stated", 0.9));
  assert.equal(gridCoverageComplete(grid), false, "one missing field = not complete");
  patchField(step, null, "dataSensitivity", "client confidential", "user-stated", 0.9);
  assert.equal(gridCoverageComplete(grid), true, "all 9 fields captured = complete");
});

test("step defaults to the current interview step when omitted", () => {
  const fallbackStep = { cells: { name: { value: "", state: "empty", confidence: "", source: "" } } };
  const { patchField, getField } = accessorSandbox({ currentGridStep: () => fallbackStep });
  assert.equal(patchField(null, "layer1", "name", "Current step name", "user-stated", 0.9), true);
  assert.equal(getField(null, "layer1", "name").value, "Current step name");
  assert.equal(fallbackStep.cells.name.value, "Current step name");
});
