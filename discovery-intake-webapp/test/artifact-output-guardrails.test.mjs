// Phase 4 — additive guardrail coverage over the generated-artifact output,
// including the new Hybrid caution path:
//   * content guardrails (no banned phrase, no firm names) hold across EVERY
//     full-bundle surface, not just the recommended one;
//   * the forced caution names every uncertain trust-area for a sparse step;
//   * the caution survives verbatim into the server export snapshot meta, i.e.
//     it travels through snapshot -> export without recomputation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();

function compilerSandbox() {
  const sandboxState = { questionHistory: [], evidenceArtifacts: [] };
  const fns = buildSandbox(source, {
    consts: [
      "ARTIFACT_TARGET_SURFACES", "ARTIFACT_SCOPE_OPTIONS", "NO_INTEGRATION_MVP_NOTE",
      "FUTURE_INTEGRATION_NOTE", "ARTIFACT_CRITICAL_CELLS", "ARTIFACT_CAUTION_AREAS", "TRANSITION_SIGNAL_RULES",
      "CELL_PLAIN_NAMES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"
    ],
    functions: [
      "artifactSurfaceLabel", "normalizeArtifactTargetSurface", "normalizeRecipeScope",
      "gridCellValue", "compilerCellText", "compilerCellSnapshot", "compilerEvidenceSummary",
      "inferRecipeDataSensitivity", "inferRecipeReuseFrequency", "inferWorkflowStability",
      "detectTransitionStep", "isDeveloperOrientedStep", "recommendArtifactTargetSurface", "artifactRecommendationReason",
      "buildRecipeDeploymentProfile", "scoreRecipeReadiness", "buildAgentRecipeIr",
      "artifactBullets", "artifactCautionSection", "renderChatGptPrompt", "renderCustomGptConfig", "renderMicrosoftCopilotConfig",
      "renderGithubCopilotDeveloperPack", "renderGenericEnterpriseCopilotSpec",
      "renderWholeWorkflowOrchestrator", "renderTransitionArtifact", "renderPlatformArtifact",
      "configProvenanceFooter", "customGptInstructionsText", "customGptConfigText",
      "m365AgentInstructionsText", "m365AgentManifest", "buildArtifactCopyBlocks",
      "buildRecommendedArtifactPackage", "buildFullArtifactBundle",
      "getField", "patchField", "deriveLegacyCellSource", "newGridCell", "newGridStep",
      "newAiPatternEntry", "makeId"
    ],
    globals: {
      state: sandboxState,
      console: { info: () => {}, warn: () => {}, error: () => {} },
      currentGridStep: () => null
    }
  });
  const step = fns.newGridStep();
  const fill = (key, value, sourceName = "user-stated", confidence = 0.95) =>
    fns.patchField(step, null, key, value, sourceName, confidence);
  return { ...fns, step, fill };
}

const BANNED_PHRASE = /work with your development team/i;
const FIRM_NAMES = /\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i;

test("content guardrails hold across EVERY full-bundle surface (banned phrase + firm names absent)", () => {
  const { step, fill, buildFullArtifactBundle } = compilerSandbox();
  // An uncertain step so the caution path is exercised on the business surfaces too.
  fill("name", "Summarise client portfolio changes");
  fill("description", "Produce a written summary of portfolio changes for the relationship manager.");
  fill("systemsTools", "Excel, Outlook");
  fill("output", "Portfolio summary document");
  fill("dataProcessing", "Client account holdings and personal data", "ai-inferred", 0.5);
  fill("regulatoryContext", "Possibly MNPI / regulated", "ai-inferred", 0.5);

  const bundle = buildFullArtifactBundle(step, {}, { targetSurface: "recommend" });
  for (const [surface, artifact] of Object.entries(bundle.artifacts)) {
    assert.ok(!BANNED_PHRASE.test(artifact.content), `${surface}: banned phrase must be absent`);
    assert.ok(!FIRM_NAMES.test(artifact.content), `${surface}: no firm names`);
  }
  // The recommended artifact (also snapshotted) is clean too.
  assert.ok(!BANNED_PHRASE.test(bundle.recommendedArtifact.content));
  assert.ok(!FIRM_NAMES.test(bundle.recommendedArtifact.content));
});

test("the forced caution names every uncertain trust-area for a sparse step", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  // Only a name/description; every trust-critical area is missing.
  fill("name", "Summarise notes");
  fill("description", "Summarise the meeting notes into a short brief.");

  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "recommend" });
  const content = pkg.recommendedArtifact.content;
  for (const area of [
    "data handling", "data sensitivity", "rules and decisions",
    "approvals and human review", "exception handling", "regulatory or compliance risk"
  ]) {
    assert.ok(content.includes(area), `caution must name the "${area}" area`);
  }
  // Each missing area is flagged as not captured (not silently presented as fact).
  assert.ok(/is not captured/.test(content));
});

test("the forced caution travels verbatim into the server export snapshot meta (no recompute)", () => {
  // Build a real recommended package with a caution, then run it through the
  // server-side export meta exactly as an export would.
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Summarise client portfolio changes");
  fill("description", "Produce a written summary of portfolio changes for the relationship manager.");
  fill("systemsTools", "Excel, Outlook");
  fill("output", "Portfolio summary document");
  fill("dataProcessing", "Client account holdings and personal data", "ai-inferred", 0.5);
  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "recommend" });
  assert.ok(pkg.recommendedArtifact.content.includes("## Caution - Confirm Before Use"),
    "precondition: the recommended artifact carries a caution");

  const { artifactSnapshotExportMeta } = buildSandbox(readServerSource(), {
    functions: ["artifactSnapshotExportMeta"]
  });
  // Mirror how the client stores a snapshot: { generatedAt, package }.
  const meta = artifactSnapshotExportMeta({ generatedAt: "2026-06-13T00:00:00.000Z", package: pkg });
  assert.ok(meta.content.includes("## Caution - Confirm Before Use"),
    "the export embeds the saved caution verbatim — no recomputation strips it");
  assert.equal(meta.content, pkg.recommendedArtifact.content, "content is the saved artifact, byte-for-byte");
});
