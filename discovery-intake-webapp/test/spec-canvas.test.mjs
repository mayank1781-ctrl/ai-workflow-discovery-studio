// Change 1 — Spec-canvas output schema on the Recipe surface. Executed, deterministic
// tests (NO live LLM) over the per-unit `spec` builders, their provenance triples, the
// rails on generated text, and the compact six-field render. Each unit a recipeUnitSource
// emits carries a well-formed spec; missing fields render as inferred/empty with a confirm
// affordance (never a blocked state); generation/library behavior is byte-identical when
// the spec builder is absent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// The economics family that is banned from every emitted value (the same family the other
// recipe tests guard). "leverage" is NOT banned — it is the feature framing.
const FORBIDDEN = /headcount|\bFTE\b|full-time equivalent|automat|\bROI\b|hours? saved|time saved|\bopportunity\b/i;
const FIRM_NAMES = /\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i;
const BANNED_PHRASE = /work with your development team/i;
const HUMAN_PINK = /#FF4FD8|#ff4fc8|#ffc4ea/i;

// ---- validity helpers --------------------------------------------------------
function isTriple(t) {
  return Boolean(t) && typeof t === "object"
    && typeof t.value === "string"
    && (t.source === "user-stated" || t.source === "ai-inferred")
    && (t.confidence === null || typeof t.confidence === "number");
}
function assertWellFormed(spec, label = "spec") {
  for (const k of ["goal", "context", "constraints", "acceptanceCriteria", "escalation"]) {
    assert.ok(isTriple(spec[k]), `${label}.${k} is a valid provenance triple`);
  }
  assert.ok(Array.isArray(spec.decomposition) && spec.decomposition.every(isTriple),
    `${label}.decomposition is an array of provenance triples`);
  assert.ok(Array.isArray(spec.evalCases), `${label}.evalCases is an array`);
  assert.ok(spec.evalCases.every((c) => c && typeof c.input === "string"
    && typeof c.expectedOutput === "string" && typeof c.notes === "string"),
    `${label}.evalCases entries are {input, expectedOutput, notes}`);
  assert.ok(["now", "gated", "future"].includes(spec.readiness), `${label}.readiness is a valid label`);
}

// ---- step-path sandbox (derives a spec from the canonical Agent Recipe IR) ----
// Mirrors policy-ingestion.test's compiler sandbox (proven to extract buildAgentRecipeIr +
// its whole dependency tree), plus the new spec builders and recipeUnitSource. A stub
// analysisGridSteps returns the steps we build, so buildStepRecipeSpec can resolve them.
function stepSandbox() {
  const state = { questionHistory: [], evidenceArtifacts: [], recipeCache: {}, __steps: [] };
  const fns = buildSandbox(source, {
    consts: [
      "ARTIFACT_TARGET_SURFACES", "ARTIFACT_SCOPE_OPTIONS", "NO_INTEGRATION_MVP_NOTE",
      "FUTURE_INTEGRATION_NOTE", "ARTIFACT_CRITICAL_CELLS", "ARTIFACT_CAUTION_AREAS",
      "TRANSITION_SIGNAL_RULES", "CELL_PLAIN_NAMES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK",
      "GRID_CELL_LAYER", "POLICY_AREA_CUES", "RECIPE_SPEC_READINESS"
    ],
    functions: [
      "artifactSurfaceLabel", "normalizeArtifactTargetSurface", "normalizeRecipeScope",
      "gridCellValue", "compilerCellText", "compilerCellSnapshot", "compilerEvidenceSummary",
      "inferRecipeDataSensitivity", "inferRecipeReuseFrequency", "inferWorkflowStability",
      "detectTransitionStep", "isDeveloperOrientedStep", "recommendArtifactTargetSurface",
      "artifactRecommendationReason", "buildRecipeDeploymentProfile", "scoreRecipeReadiness",
      "policyClip", "extractPolicyClauses", "matchPolicyClause", "policyReviewLine",
      "buildAgentRecipeIr", "getField", "patchField", "deriveLegacyCellSource",
      "newGridCell", "newGridStep", "newAiPatternEntry", "makeId",
      // under test:
      "recipeSpecTriple", "defaultRecipeSpec", "buildStepRecipeSpec",
      "buildConnectionRecipeSpec", "buildRecipeSpec", "recipeUnitSource"
    ],
    globals: {
      state,
      console: { info: () => {}, warn: () => {}, error: () => {} },
      currentGridStep: () => null,
      analysisGridSteps: () => state.__steps,
      // buildConnectionRecipeSpec is extracted but never called on the step path; stub its
      // seam helpers anyway so it can never throw.
      recipeConnectionSeams: () => [],
      handoffId: (a, b) => `h:${a}>${b}`,
      connectionToolTokens: () => []
    }
  });
  const makeStep = (cells = {}) => {
    const step = fns.newGridStep();
    for (const [key, spec] of Object.entries(cells)) {
      const [value, src = "user-stated", conf = 0.95] = Array.isArray(spec) ? spec : [spec];
      fns.patchField(step, null, key, value, src, conf);
    }
    state.__steps = [step];
    return step;
  };
  return { ...fns, state, makeStep };
}

// A neutral, firm-name-free captured step.
const NEUTRAL_CELLS = {
  name: "Summarize the weekly portfolio changes",
  description: "Produce a written summary of portfolio changes for the relationship manager.",
  systemsTools: "Excel, Outlook",
  output: "Portfolio change summary document",
  trigger: "The weekly close completes",
  dataProcessing: "Account holdings and recent transactions"
};

// ---- connection-path sandbox (derives a spec from a Leverage Map seam) --------
function connectionSandbox(seam) {
  return buildSandbox(source, {
    consts: ["RECIPE_SPEC_READINESS"],
    functions: ["recipeSpecTriple", "defaultRecipeSpec", "buildConnectionRecipeSpec", "buildRecipeSpec"],
    globals: {
      recipeConnectionSeams: () => (seam ? [seam] : []),
      handoffId: (a, b) => `h:${a}>${b}`,
      connectionToolTokens: () => ["excel", "outlook"]
    }
  });
}

// ---- render sandbox (pure: a hand-built spec -> canvas HTML) ------------------
function renderSandbox() {
  return buildSandbox(source, {
    consts: ["RECIPE_SPEC_READINESS"],
    functions: ["recipeSpecTriple", "recipeProvChipHtml", "recipeSpecCanvasHtml"],
    globals: { escapeHtml: (s) => String(s == null ? "" : s) }
  });
}

// =============================================================================

test("a STEP unit carries a well-formed spec derived from the IR (six fields + 3-5 eval cases + readiness 'future')", () => {
  const sb = stepSandbox();
  const step = sb.makeStep(NEUTRAL_CELLS);
  const spec = sb.buildRecipeSpec(step.id);
  assertWellFormed(spec, "step spec");
  assert.ok(spec.goal.value.includes("Portfolio change summary"), "goal reflects the captured output");
  assert.ok(spec.evalCases.length >= 3 && spec.evalCases.length <= 5, "3-5 eval cases (reused from the IR)");
  assert.equal(spec.readiness, "future", "readiness defaults to 'future' (Change 2 computes it)");
  assert.ok(spec.decomposition.length >= 1, "decomposition lists the sub-steps");
});

test("provenance: an evidence-backed field reads stated (teal); an unconfirmed/derived field reads inferred (grey)", () => {
  const sb = stepSandbox();
  // 'output' is user-stated => goal inherits teal. systemsTools omitted => context inferred.
  const step = sb.makeStep({ name: "Draft note", description: "Write a note.", output: ["A drafted note", "user-stated", 0.95] });
  const spec = sb.buildRecipeSpec(step.id);
  assert.equal(spec.goal.source, "user-stated", "goal rests on the user-stated output cell");
  assert.equal(spec.context.source, "ai-inferred", "context with no captured systems reads inferred");
  // constraints + escalation are intentionally inferred in Change 1 (Change 2 populates them)
  assert.equal(spec.constraints.source, "ai-inferred");
  assert.equal(spec.escalation.source, "ai-inferred");
});

test("an AI-inferred output does NOT harden the goal: it stays grey until a human confirms", () => {
  const sb = stepSandbox();
  const step = sb.makeStep({ name: "Triage", description: "Triage the item.", output: ["An inferred output", "ai-inferred", 0.4] });
  const spec = sb.buildRecipeSpec(step.id);
  assert.equal(spec.goal.source, "ai-inferred", "an ai-inferred cell never auto-promotes to stated");
});

test("recipeUnitSource EMITS the spec on the unit, additively (generation origin preserved)", () => {
  const sb = stepSandbox();
  const step = sb.makeStep(NEUTRAL_CELLS);
  sb.state.recipeCache[step.id] = "AI drafts the summary for review.";
  const unit = sb.recipeUnitSource(step.id);
  assert.equal(unit.origin, "generation", "the existing generation origin is unchanged");
  assert.equal(unit.text, "AI drafts the summary for review.");
  assert.equal(unit.confirmed, false);
  assert.ok(unit.spec && typeof unit.spec === "object", "the emitted unit carries a spec");
  assertWellFormed(unit.spec, "emitted unit spec");
});

test("ADDITIVE: with no spec builder loaded, recipeUnitSource is byte-identical (no throw, no spec field)", () => {
  // A minimal sandbox that does NOT include buildRecipeSpec — the typeof guard must skip.
  const { recipeUnitSource } = buildSandbox(source, {
    functions: ["recipeUnitSource"],
    globals: { state: { recipeCache: { s1: "generated recipe" } } }
  });
  const unit = recipeUnitSource("s1");
  assert.deepEqual(unit, { text: "generated recipe", origin: "generation", confirmed: false },
    "without the builder the unit is exactly the pre-Change-1 shape (spec is simply absent)");
  assert.equal(recipeUnitSource(""), null, "the null/no-unit path is unchanged");
});

test("a CONNECTION unit carries a well-formed spec; a human-held seam keeps the person approving and never says 'eliminate'", () => {
  const heldSeam = { fromId: "s1", toId: "s2", fromName: "Pull", toName: "Approve", level: "md", humanHeld: true, state: "stated" };
  const sb = connectionSandbox(heldSeam);
  const spec = sb.buildRecipeSpec("h:s1>s2");
  assertWellFormed(spec, "connection spec");
  assert.match(spec.escalation.value, /approv|decides/i, "a held seam keeps the person in the loop");
  assert.ok(!/\beliminate\b/i.test(JSON.stringify(spec)), "assist-not-replace: never 'eliminate'");

  const freeSeam = { fromId: "s1", toId: "s2", fromName: "Export", toName: "Reconcile", level: "hi", humanHeld: false, state: "computed" };
  const free = connectionSandbox(freeSeam).buildRecipeSpec("h:s1>s2");
  assertWellFormed(free, "free connection spec");
  assert.ok(free.goal.value.includes("Export") && free.goal.value.includes("Reconcile"), "names the connection it spans");
});

test("defaultRecipeSpec is the well-formed never-a-dead-end fallback (empty inferred fields, readiness 'future')", () => {
  const sb = connectionSandbox(null); // no seam => buildRecipeSpec('h:..') falls back
  const spec = sb.buildRecipeSpec("h:x>y");
  assertWellFormed(spec, "fallback spec");
  assert.equal(spec.goal.value, "", "an unresolved unit has empty (not fabricated) fields");
  assert.equal(spec.goal.source, "ai-inferred", "empty fields read inferred/grey, not stated");
});

test("RAILS: a generated spec carries no banned economics token, no firm name, no banned phrase (step + connection)", () => {
  const sb = stepSandbox();
  const step = sb.makeStep(NEUTRAL_CELLS);
  const stepBlob = JSON.stringify(sb.buildRecipeSpec(step.id));
  assert.ok(!FORBIDDEN.test(stepBlob), "no economics token in the step spec");
  assert.ok(!FIRM_NAMES.test(stepBlob), "no firm names in the step spec");
  assert.ok(!BANNED_PHRASE.test(stepBlob), "no banned phrase in the step spec");

  const connBlob = JSON.stringify(connectionSandbox({ fromId: "s1", toId: "s2", fromName: "A", toName: "B", humanHeld: true }).buildRecipeSpec("h:s1>s2"));
  assert.ok(!FORBIDDEN.test(connBlob) && !FIRM_NAMES.test(connBlob) && !BANNED_PHRASE.test(connBlob), "the connection spec is clean too");
});

test("RENDER: the canvas shows the six labeled fields + an eval-cases list and reuses the merged .prov classes", () => {
  const { recipeSpecCanvasHtml } = renderSandbox();
  const spec = {
    goal: { value: "Produce the summary", source: "user-stated", confidence: 0.9 },
    context: { value: "Excel, Outlook", source: "ai-inferred", confidence: null },
    constraints: { value: "Data sensitivity: high.", source: "ai-inferred", confidence: null },
    acceptanceCriteria: { value: "Judged complete and correctly grouped", source: "ai-inferred", confidence: null },
    decomposition: [{ value: "Gather inputs", source: "ai-inferred", confidence: null }],
    escalation: { value: "A person reviews before use", source: "ai-inferred", confidence: null },
    evalCases: [{ input: "weekly close done", expectedOutput: "a drafted summary", notes: "Happy path" }],
    readiness: "future"
  };
  const html = recipeSpecCanvasHtml(spec, "s1");
  for (const label of ["Goal", "Context", "Constraints", "Acceptance criteria", "Decomposition", "Escalation", "Eval cases"]) {
    assert.ok(html.includes(label), `the canvas labels "${label}"`);
  }
  assert.match(html, /data-spec-canvas="s1"/, "the canvas is keyed to its unit");
  assert.match(html, /class="prov user"/, "a stated field reuses .prov.user (teal)");
  assert.match(html, /class="prov ai"/, "an inferred field reuses .prov.ai (grey)");
  assert.match(html, /Readiness · future/, "the readiness label renders");
  assert.match(html, /weekly close done/, "an eval case renders its input");
});

test("RENDER never-a-dead-end: a missing field shows a confirm affordance, not a blocked state", () => {
  const { recipeSpecCanvasHtml } = renderSandbox();
  const empty = recipeSpecCanvasHtml({
    goal: { value: "", source: "ai-inferred", confidence: null },
    context: { value: "", source: "ai-inferred", confidence: null },
    constraints: { value: "", source: "ai-inferred", confidence: null },
    acceptanceCriteria: { value: "", source: "ai-inferred", confidence: null },
    decomposition: [],
    escalation: { value: "", source: "ai-inferred", confidence: null },
    evalCases: [],
    readiness: "future"
  }, "s9");
  assert.match(empty, /data-spec-confirm="s9"/, "a missing field offers a confirm affordance");
  assert.match(empty, /Not captured yet/, "the empty state is honest, not fabricated");
  assert.ok(!/blocked/i.test(empty), "never a blocked state");
});

test("RENDER RAILS: the canvas has no banned token, no gradient on the data surface, and reserves Human Pink", () => {
  const { recipeSpecCanvasHtml } = renderSandbox();
  const html = recipeSpecCanvasHtml({
    goal: { value: "Produce the summary", source: "user-stated", confidence: 0.9 },
    context: { value: "", source: "ai-inferred", confidence: null },
    constraints: { value: "", source: "ai-inferred", confidence: null },
    acceptanceCriteria: { value: "", source: "ai-inferred", confidence: null },
    decomposition: [{ value: "Gather", source: "ai-inferred", confidence: null }],
    escalation: { value: "Hand back to a human", source: "ai-inferred", confidence: null },
    evalCases: [{ input: "in", expectedOutput: "out", notes: "Happy path" }],
    readiness: "future"
  }, "s1");
  assert.ok(!FORBIDDEN.test(html), "no banned economics language");
  assert.ok(!/gradient/i.test(html), "no gradient on the data surface (flat hue + label)");
  assert.ok(!HUMAN_PINK.test(html), "Human Pink stays reserved");
});

test("ISOLATION & ADDITIVE (source): the boundary guards the spec attach with typeof, keeps both origin literals, and the spec code never calls the scorer", () => {
  const boundary = extractFunction(source, "recipeUnitSource");
  assert.ok(/typeof buildRecipeSpec/.test(boundary), "the spec attach is typeof-guarded (byte-identical when absent)");
  assert.ok(/origin: "library"/.test(boundary) && /origin: "generation"/.test(boundary), "both existing origins preserved");
  assert.ok(/typeof recipeLibrarySeed/.test(boundary), "the existing library-slot guard is untouched");

  const blob = ["buildRecipeSpec", "buildStepRecipeSpec", "buildConnectionRecipeSpec", "defaultRecipeSpec", "recipeSpecTriple", "recipeSpecCanvasHtml", "recipeSpecCanvasFor", "wireRecipeSpecCanvas"]
    .map((fn) => extractFunction(source, fn)).join("\n");
  assert.ok(!/getStepOpportunityMeta/.test(blob), "scorer isolation: the spec code never calls getStepOpportunityMeta");
  assert.ok(!/patchField|persistState/.test(blob), "no grid write / no auto-harden from the spec builders");
  assert.ok(!FORBIDDEN.test(blob), "no banned economics token in the spec code");
  assert.ok(!FIRM_NAMES.test(blob) && !BANNED_PHRASE.test(blob) && !/\beliminate\b/i.test(blob), "no firm names / banned phrase / 'eliminate'");
  assert.ok(!HUMAN_PINK.test(blob), "no Human Pink minted in the spec code");
  assert.ok(!/gradient/i.test(extractFunction(source, "recipeSpecCanvasHtml")), "the canvas renderer adds no gradient");
  // the legacy scorer still exists and is left untouched (not referenced by the new code)
  assert.ok(extractFunction(source, "getStepOpportunityMeta").length > 0, "getStepOpportunityMeta remains present");
});
