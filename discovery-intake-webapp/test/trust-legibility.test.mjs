// V3-2 — Trust-legibility UX pass. Display-only; these tests prove the new
// indicators/badges/overview/panel render from EXISTING stored data and that the
// indicator path invokes NO recompute/write. One test per acceptance criterion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

const GRID_CONSTS = ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"];
const GRID_BUILD_FNS = ["getField", "patchField", "deriveLegacyCellSource", "newGridCell", "newGridStep", "newAiPatternEntry", "makeId"];

// Build a sandbox with the grid-building primitives plus the requested helpers.
// scoring/readiness are injected as overridable globals so a test can stub them
// (or make them throw to prove they are never called).
function gridSandbox(fns, globals = {}) {
  const sandbox = buildSandbox(source, {
    consts: GRID_CONSTS,
    functions: [...GRID_BUILD_FNS, ...fns],
    globals: { state: { questionHistory: [], evidenceArtifacts: [] }, console: { info() {}, warn() {}, error() {} }, currentGridStep: () => null, ...globals }
  });
  const step = sandbox.newGridStep();
  const fill = (key, value, src = "user-stated", conf = 0.95) => sandbox.patchField(step, null, key, value, src, conf);
  return { ...sandbox, step, fill };
}

test("a/REQUIRED: the grid cell indicator renders from stored provenance/confidence and invokes no recompute", () => {
  // scoring/readiness throw if touched — proving the indicator never recomputes.
  const boom = () => { throw new Error("recompute path invoked"); };
  const { step, fill, gridCellTrustIndicator } = gridSandbox(
    ["gridCellTrustIndicator", "engProvenance", "escapeHtml"],
    { scoreRecipeReadiness: boom, getStepOpportunityMeta: boom }
  );
  fill("name", "Reconcile balances", "user-stated", 0.95);          // confirmed
  fill("dataProcessing", "Client holdings", "ai-inferred", 0.5);     // inferred, low-confidence

  let confirmed;
  let inferred;
  assert.doesNotThrow(() => { confirmed = gridCellTrustIndicator(step, ["name"]); }, "indicator must not invoke a recompute path");
  assert.doesNotThrow(() => { inferred = gridCellTrustIndicator(step, ["dataProcessing"]); });

  // Confirmed (user-stated) → teal dot + 95% + "confirmed" in the hover title.
  assert.match(confirmed, /#00d4b4/);
  assert.match(confirmed, /95%/);
  assert.match(confirmed, /confirmed/);
  // Inferred low-confidence → purple dot + 50% + "inferred".
  assert.match(inferred, /#a855f7/);
  assert.match(inferred, /50%/);
  assert.match(inferred, /inferred/);
  // Empty column → no indicator at all.
  assert.equal(gridCellTrustIndicator(step, ["regulatoryContext"]), "");

  // Source-level proof: the indicator reads getField only, never scores or writes.
  const src = extractFunction(source, "gridCellTrustIndicator");
  assert.ok(src.includes("getField("), "indicator reads via getField");
  for (const forbidden of ["scoreRecipeReadiness", "getStepOpportunityMeta", "patchField", "buildRecommendedArtifactPackage"]) {
    assert.ok(!src.includes(forbidden), `indicator must not call ${forbidden}`);
  }
});

test("a: a merged column shows the MOST CAUTIOUS state across its underlying cells", () => {
  const { step, fill, gridCellTrustIndicator } = gridSandbox(["gridCellTrustIndicator", "engProvenance", "escapeHtml"]);
  fill("dataSensitivity", "Confidential", "user-stated", 0.95);     // confirmed
  fill("regulatoryContext", "Maybe MNPI", "ai-inferred", 0.4);       // inferred → most cautious
  const out = gridCellTrustIndicator(step, ["dataSensitivity", "regulatoryContext"]);
  assert.match(out, /#a855f7/, "most cautious (inferred) state wins");
  assert.match(out, /40%/, "minimum confidence across the column");
});

test("d: per-step composite badge surfaces the four dimensions and never writes", () => {
  const { step, fill, stepCompositeBadgeHtml } = gridSandbox(
    ["stepCompositeBadgeHtml", "stepTrustSignals", "escapeHtml"],
    {
      getStepOpportunityMeta: () => ({ label: "Quick Win", tier: "quick-win" }),
      scoreRecipeReadiness: () => ({ label: "Usable with caveats", score: 67 }),
      // V3-15: the badge now renders the (additive) typology controls; this V3-2
      // test is not about typology, so stub it to "" (keeps the four-dim assertions
      // exact). The real stepTypologyHtml is covered by test/step-typology.test.mjs.
      stepTypologyHtml: () => "",
      // V3-16: same for the handoff/decision controls — stubbed here; the real
      // stepStructuralHtml is covered by test/handoffs-decisions.test.mjs.
      stepStructuralHtml: () => "",
      // V3-17: same for the friction-lens controls — stubbed here; the real
      // stepFrictionHtml is covered by test/friction-lens.test.mjs.
      stepFrictionHtml: () => "",
      // V3-18: same for the role controls — stubbed here; the real stepRoleHtml is
      // covered by test/role-model.test.mjs.
      stepRoleHtml: () => ""
    }
  );
  fill("name", "Reconcile balances", "user-stated", 0.9);
  fill("dataProcessing", "Client holdings", "ai-inferred", 0.5);
  const out = stepCompositeBadgeHtml(step);
  assert.match(out, /Extraction confidence:/);
  assert.match(out, /Opportunity: Quick Win/);
  assert.match(out, /Readiness: Usable with caveats \(67\/100\)/);
  assert.match(out, /Provenance:/);
  assert.match(out, /ds-badge-(teal|purple|amber)/, "a composite posture badge is shown");

  // No writes / no snapshot or business-case recompute from the badge path.
  for (const fn of ["stepTrustSignals", "stepCompositeBadgeHtml"]) {
    const src = extractFunction(source, fn);
    for (const forbidden of ["patchField", "rotateArtifactSnapshot", "computeBusinessCase", "persistState"]) {
      assert.ok(!src.includes(forbidden), `${fn} must not call ${forbidden}`);
    }
  }
});

test("b: the trust panel renders the four plain-language guarantees", () => {
  const { trustPanelHtml } = buildSandbox(source, { functions: ["trustPanelHtml", "escapeHtml"] });
  const out = trustPanelHtml();
  assert.match(out, /Why you can trust this/);
  assert.match(out, /recomputed silently/);
  assert.match(out, /tracks its source/);
  assert.match(out, /explicit action/);
  assert.match(out, /Prior versions are always kept/);
});

test("e: the artifact Overview surfaces recommended surface, readiness, and top blockers", () => {
  const { artifactOverviewHtml } = buildSandbox(source, {
    consts: ["ARTIFACT_TARGET_SURFACES"],
    functions: ["artifactOverviewHtml", "artifactReadinessBadgeClass", "artifactSurfaceLabel", "artifactList", "escapeHtml"]
  });
  const pkg = {
    recommendedArtifact: { label: "Custom GPT configuration" },
    profile: { targetSurface: "customGPT" },
    readiness: { label: "Usable with caveats", score: 67, blockers: ["Missing Human Checkpoint", "Data Processing is inferred or low-confidence"] }
  };
  const out = artifactOverviewHtml(pkg);
  assert.match(out, /Custom GPT configuration/, "recommended surface");
  assert.match(out, /Usable with caveats/, "readiness label");
  assert.match(out, /67/, "readiness score");
  assert.match(out, /Missing Human Checkpoint/, "top blocker");
});

test("c: the cockpit elevates the next-best action above the metrics (progressive disclosure)", () => {
  const src = extractFunction(source, "specStackCockpitHtml");
  const actionIdx = src.indexOf("Next best step");
  const detailsIdx = src.indexOf("<details");
  const metricsIdx = src.indexOf("ds-progress-fill");
  assert.ok(actionIdx !== -1 && detailsIdx !== -1 && metricsIdx !== -1, "all markers present");
  assert.ok(actionIdx < detailsIdx, "next-best action comes before the disclosure");
  assert.ok(detailsIdx < metricsIdx, "the metrics live inside the disclosure");
  assert.ok(src.includes("Show all signals"), "metrics are available on expand");
});

test("b/telemetry: the methodology panel emits why_panel_opened when opened", () => {
  // C-7: trust banner removed; the telemetry event is now fired by wireMethodologyLink
  // (the rail-footer button), not by renderTrustPanel (which is now a no-op shell).
  const src = extractFunction(source, "wireMethodologyLink");
  assert.ok(src.includes('recordTelemetryClient("why_panel_opened"'), "methodology link wires the telemetry event");
});
