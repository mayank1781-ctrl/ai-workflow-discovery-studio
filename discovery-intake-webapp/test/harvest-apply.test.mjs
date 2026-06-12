// Executed tests for the client-side harvest-apply pipeline in app.js — the
// logic behind the PR 29b-fix regressions: harvested stepUpdates must create
// and populate workflowGrid steps, the step-list lock must not strangle an
// empty grid, and every drop path must be logged, never silent. Real shipped
// source is extracted and evaluated with a stubbed `state` and a recording
// `console` (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();

function harvestSandbox() {
  const state = { workflowGrid: { schemaVersion: 1, stepListLocked: false, steps: [] } };
  const logs = [];
  const recordingConsole = {
    info: (...args) => logs.push(args.map(String).join(" ")),
    warn: (...args) => logs.push(args.map(String).join(" ")),
    error: (...args) => logs.push(args.map(String).join(" "))
  };
  const fns = buildSandbox(source, {
    // PR 30: harvest writes route through the accessor layer, so its functions
    // and consts join the extraction closure.
    consts: ["GRID_CELL_KEYS", "EXTRACTION_CELL_KEY_MAP", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"],
    functions: [
      "applyHarvestUpdates",
      "findGridStepForUpdate",
      "applyFieldUpdatesToStep",
      "createGridStepFromHarvest",
      "normalizeGridFieldKey",
      "patchField",
      "ensureCellLog",
      "newLedgerEntry",
      "projectCellLedgerDetailed",
      "projectCellLedger",
      "getField",
      "deriveLegacyCellSource",
      "newGridStep",
      "newGridCell",
      "newAiPatternEntry",
      "makeId"
    ],
    globals: { state, console: recordingConsole, currentGridStep: () => null }
  });
  return { ...fns, state, logs };
}

test("harvest mapping: stepId 'new' + canonical fieldKeys creates and populates steps (PR 29b-fix regression)", () => {
  const { applyHarvestUpdates, state } = harvestSandbox();
  const changed = applyHarvestUpdates({
    stepUpdates: [
      {
        stepId: "new",
        stepName: "Weekly Sales Data Collection",
        fieldUpdates: {
          personaActors: { value: "Sales team", confidence: 0.9, state: "confirmed" },
          systemsTools: { value: "Outlook, Excel", confidence: 0.9, state: "confirmed" },
          frequencyVolume: { value: "50 emails a week", confidence: 0.7, state: "inferred" }
        }
      }
    ],
    newSteps: []
  });
  assert.equal(changed, true, "harvest must report a change");
  assert.equal(state.workflowGrid.steps.length, 1, "step created from unmatched stepId 'new'");
  const cells = state.workflowGrid.steps[0].cells;
  assert.equal(cells.name.value, "Weekly Sales Data Collection");
  assert.equal(cells.personaActors.value, "Sales team");
  assert.equal(cells.personaActors.state, "confirmed");
  assert.equal(cells.systemsTools.value, "Outlook, Excel");
  assert.equal(cells.frequencyVolume.value, "50 emails a week");
  assert.equal(cells.frequencyVolume.state, "inferred");
});

test("lock semantics: empty list never blocks creation; locked non-empty list holds the count and logs", () => {
  const { applyHarvestUpdates, state, logs } = harvestSandbox();

  // Locked but EMPTY: the lock protects a confirmed skeleton; an empty grid has
  // none, so harvest must still seed it (the PR 29b-fix root cause #2).
  state.workflowGrid.stepListLocked = true;
  const seeded = applyHarvestUpdates({
    stepUpdates: [{ stepId: "new", stepName: "Seed step", fieldUpdates: {} }],
    newSteps: []
  });
  assert.equal(seeded, true);
  assert.equal(state.workflowGrid.steps.length, 1, "lock on an empty list must not block step creation");

  // Locked and NON-empty: unmatched new steps are discarded — and logged.
  const before = state.workflowGrid.steps.length;
  const blocked = applyHarvestUpdates({
    stepUpdates: [{ stepId: "new", stepName: "Sneaky extra step", fieldUpdates: {} }],
    newSteps: [{ stepName: "Another extra", fieldUpdates: {} }]
  });
  assert.equal(blocked, false);
  assert.equal(state.workflowGrid.steps.length, before, "locked non-empty list keeps the step count stable");
  assert.ok(
    logs.some((line) => line.includes("discarded stepUpdate") && line.includes("Sneaky extra step")),
    "discarded stepUpdate must be logged"
  );
  assert.ok(logs.some((line) => line.includes("discarded newSteps")), "discarded newSteps must be logged");

  // Enrichment of an existing step still works under the lock.
  const enriched = applyHarvestUpdates({
    stepUpdates: [
      { stepId: "new", stepName: "Seed step", fieldUpdates: { personaActors: { value: "Ops analyst", confidence: 0.9, state: "confirmed" } } }
    ],
    newSteps: []
  });
  assert.equal(enriched, true, "matched-by-name update must enrich under the lock");
  assert.equal(state.workflowGrid.steps[0].cells.personaActors.value, "Ops analyst");
});

test("dropped-key path: non-canonical key is dropped AND logged, never silent", () => {
  const { applyHarvestUpdates, normalizeGridFieldKey, state, logs } = harvestSandbox();
  const changed = applyHarvestUpdates({
    stepUpdates: [
      {
        stepId: "new",
        stepName: "Initial Discussion",
        fieldUpdates: {
          idea: { value: "workflow involving a data assessment project", confidence: 0.9, state: "confirmed" },
          personaActors: { value: "Sales team", confidence: 0.9, state: "confirmed" }
        }
      }
    ],
    newSteps: []
  });
  assert.equal(changed, true);
  const cells = state.workflowGrid.steps[0].cells;
  assert.equal(cells.personaActors.value, "Sales team", "canonical sibling key still maps");
  assert.ok(!("idea" in cells), "non-canonical key must not create a cell");
  assert.ok(
    logs.some((line) => line.includes("dropped unrecognized field key") && line.includes("idea")),
    "the drop must be logged"
  );
  // The mapper itself: canonical key passes, alias maps, junk returns null.
  assert.equal(normalizeGridFieldKey("personaActors"), "personaActors");
  assert.equal(normalizeGridFieldKey("workflowStep"), "name", "document-extraction alias maps to canonical key");
  assert.equal(normalizeGridFieldKey("idea"), null);
});

test("canonical name fallback: empty sessionMeta.workflowName resolves to the grid name", () => {
  const fns = buildSandbox(source, {
    functions: ["sessionSummaryMeta", "ensureSessionMeta", "deriveSessionName", "truncateUi", "makeId"],
    globals: {
      state: {},
      defaultState: {
        sessionMeta: {
          id: "", name: "", owner: "", source: "", dataClassification: "",
          status: "", workflowName: "", engagementContext: "", lastPackagePath: "",
          createdAt: "", updatedAt: ""
        }
      }
    }
  });
  const summary = fns.sessionSummaryMeta({
    sessionMeta: { id: "sess-x", workflowName: "" },
    fields: {},
    workflowGrid: {
      workflowName: "Reconciliation Exception Matching",
      steps: [{ cells: {} }, { cells: {} }]
    }
  });
  assert.equal(summary.workflowName, "Reconciliation Exception Matching", "grid name must resolve when sessionMeta name is empty");
  assert.equal(summary.stepCount, 2, "step count must come from the grid");
  // And an explicit sessionMeta name still wins over the grid.
  const named = fns.sessionSummaryMeta({
    sessionMeta: { id: "sess-y", workflowName: "Named Explicitly" },
    fields: {},
    workflowGrid: { workflowName: "Grid Name", steps: [] }
  });
  assert.equal(named.workflowName, "Named Explicitly");
});
