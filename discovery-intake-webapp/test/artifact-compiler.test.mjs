// Executed tests for the v2 artifact compiler: deployment profile, Agent
// Recipe IR, readiness, renderers, transition handling, and snapshot wiring.
// The compiler is deterministic browser code extracted from app.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();
const NO_INTEGRATION_CONTRACT = "This artifact assumes no live system integrations, no API actions, no writeback, and no automated external tool use.";

function compilerSandbox() {
  const sandboxState = { questionHistory: [], evidenceArtifacts: [] };
  const fns = buildSandbox(source, {
    consts: [
      "ARTIFACT_TARGET_SURFACES",
      "ARTIFACT_SCOPE_OPTIONS",
      "NO_INTEGRATION_MVP_NOTE",
      "FUTURE_INTEGRATION_NOTE",
      "ARTIFACT_CRITICAL_CELLS",
      "ARTIFACT_CAUTION_AREAS",
      "TRANSITION_SIGNAL_RULES",
      "CELL_PLAIN_NAMES",
      "GRID_CELL_KEYS",
      "GRID_SOURCE_RANK",
      "GRID_CELL_LAYER",
      "KEY_QUESTION_FIELDS",
      "MODEL_QUESTION_INTENT_RULES"
    ],
    functions: [
      "artifactSurfaceLabel",
      "normalizeArtifactTargetSurface",
      "normalizeRecipeScope",
      "gridCellValue",
      "compilerCellText",
      "compilerCellSnapshot",
      "compilerEvidenceSummary",
      "inferRecipeDataSensitivity",
      "inferRecipeReuseFrequency",
      "inferWorkflowStability",
      "detectTransitionStep",
      "isDeveloperOrientedStep",
      "recommendArtifactTargetSurface",
      "artifactRecommendationReason",
      "buildRecipeDeploymentProfile",
      "scoreRecipeReadiness",
      "buildAgentRecipeIr",
      "artifactBullets",
      "artifactCautionSection",
      "renderChatGptPrompt",
      "renderCustomGptConfig",
      "renderMicrosoftCopilotConfig",
      "renderGithubCopilotDeveloperPack",
      "renderGenericEnterpriseCopilotSpec",
      "renderWholeWorkflowOrchestrator",
      "renderTransitionArtifact",
      "renderPlatformArtifact",
      "buildRecommendedArtifactPackage",
      "buildFullArtifactBundle",
      "artifactActionFromGap",
      "artifactActionItems",
      "artifactTestCasesByPath",
      "workflowGapFields",
      "questionIntentId",
      "questionStatusForIntent",
      "fieldEditNormalize",
      "modelQuestionIntent",
      "modelQuestionForCells",
      "aiInferredConfirmFields",
      "discoveryActionMetaForCell",
      "discoveryActionQueueItems",
      "isCapturedValue",
      "getField",
      "patchField",
      "deriveLegacyCellSource",
      "newGridCell",
      "newGridStep",
      "newAiPatternEntry",
      "makeId"
    ],
    globals: {
      state: sandboxState,
      console: { info: () => {}, warn: () => {}, error: () => {} },
      currentGridStep: () => null
    }
  });
  const step = fns.newGridStep();
  const fill = (key, value, sourceName = "user-stated", confidence = 0.9, options = {}) =>
    fns.patchField(step, null, key, value, sourceName, confidence, options);
  return { ...fns, state: sandboxState, step, fill };
}

test("profile builder defaults to hybrid confidence, no integrations, and recommends M365 surfaces", () => {
  const { step, fill, buildRecipeDeploymentProfile } = compilerSandbox();
  fill("name", "Prepare weekly status pack");
  fill("description", "Summarise Teams notes and Excel tracker changes into a weekly pack.");
  fill("systemsTools", "Teams, SharePoint, Excel");
  fill("frequencyVolume", "weekly");
  fill("humanCheckpoint", "Manager reviews before sending");

  const recommended = buildRecipeDeploymentProfile(step, {}, { targetSurface: "recommend" });
  assert.equal(recommended.confidenceMode, "hybrid");
  assert.equal(recommended.integrationMode, "none");
  assert.equal(recommended.defaultOutputMode, "recommendedArtifactPlusOptionalBundle");
  assert.equal(recommended.targetSurface, "copilotStudio");
  assert.equal(recommended.deploymentLevel, "knowledgeBasedAssistant");
  assert.equal(recommended.needsHumanApproval, true);

  const selected = buildRecipeDeploymentProfile(step, {}, { targetSurface: "chatgptPrompt" });
  assert.equal(selected.targetSurface, "chatgptPrompt", "explicit target surface overrides recommendation");
});

test("recommended artifact plus full bundle include no-integration posture and all core surfaces", () => {
  const { step, fill, buildRecommendedArtifactPackage, buildFullArtifactBundle } = compilerSandbox();
  fill("name", "Summarise issue list");
  fill("description", "Classify notes and prepare an analyst summary.");
  fill("systemsTools", "Excel, Outlook");
  fill("dataProcessing", "Tracker rows and email notes");
  fill("output", "Issue summary");
  fill("humanCheckpoint", "Analyst checks output quality before use");

  const recommended = buildRecommendedArtifactPackage(step, {}, { targetSurface: "recommend" });
  assert.ok(recommended.recommendedArtifact.content.includes(NO_INTEGRATION_CONTRACT));
  assert.ok(recommended.recommendationReason);
  assert.equal(recommended.profile.integrationMode, "none");

  const bundle = buildFullArtifactBundle(step, {}, { targetSurface: "recommend" });
  for (const surface of ["chatgptPrompt", "customGPT", "microsoft365Copilot", "genericEnterpriseCopilot", "githubCopilot"]) {
    assert.ok(bundle.artifacts[surface], `${surface} renderer exists in the full bundle`);
  }
  assert.ok(bundle.testCasePack.length >= 3);
  assert.ok(bundle.humanReviewChecklist.length >= 1);
  assert.ok(bundle.readinessAndProvenanceNotes.some((note) => note.includes("evidence-backed")));
});

test("IR separates facts, assumptions, gaps, and does not promote AI-inferred rules", () => {
  const { step, fill, buildAgentRecipeIr } = compilerSandbox();
  fill("name", "Approve payment exception");
  fill("output", "Approved exception packet", "doc-extracted", 0.85);
  fill("rulesDecisionLogic", "Automatically approve exceptions under $500", "ai-inferred", 0.95);
  fill("systemsTools", "Exception tracker", "doc-extracted", 0.8);

  const ir = buildAgentRecipeIr(step);
  assert.ok(ir.evidenceBackedFacts.some((fact) => fact.field === "output"));
  assert.ok(ir.assumptions.some((item) => item.includes("Automatically approve exceptions")));
  assert.ok(!ir.rules.some((item) => item.includes("Automatically approve exceptions")),
    "AI-inferred rules must not become hard rules");
  assert.ok(ir.knownGaps.some((item) => item.includes("Data Sensitivity")));
  assert.ok(ir.doNotAutomateNotes.some((item) => /low-confidence inferred values/i.test(item)));
});

test("readiness is deterministic and separate from opportunity scoring", () => {
  const { step, fill, scoreRecipeReadiness, buildRecipeDeploymentProfile } = compilerSandbox();
  fill("name", "Summarise account notes");
  fill("description", "Create a clean account summary from approved notes.");
  fill("systemsTools", "Word, Teams");
  fill("output", "Account summary");
  fill("dataSensitivity", "Internal");

  const readiness = scoreRecipeReadiness(step, buildRecipeDeploymentProfile(step));
  assert.equal(typeof readiness.score, "number");
  assert.ok(readiness.label);
  assert.ok(!extractFunction(source, "scoreRecipeReadiness").includes("getStepOpportunityMeta"),
    "readiness must not call the opportunity scorer");
});

test("transition detector creates transition artifacts instead of fake agents", () => {
  const { step, fill, detectTransitionStep, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Wait for sign-off");
  fill("description", "Package findings and wait for business owner approval.");
  fill("handoff", "Send to business owner for sign-off");
  fill("humanCheckpoint", "Business owner approves or escalates");

  const transition = detectTransitionStep(step);
  assert.equal(transition.isTransition, true);
  assert.ok(transition.labels.includes("Approval"));

  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "recommend" });
  assert.equal(pkg.profile.recipeScope, "transition");
  assert.equal(pkg.profile.targetSurface, "transitionArtifact");
  assert.ok(pkg.recommendedArtifact.content.includes("What AI Must Not Decide"));
  assert.ok(pkg.recommendedArtifact.content.includes("Do not automate the decision"));
});

test("renderer output avoids banned output phrase and real firm names", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Draft daily reconciliation note");
  fill("description", "Summarise breaks and open questions for review.");
  fill("output", "Daily note");
  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "chatgptPrompt" });
  const content = pkg.recommendedArtifact.content;
  assert.ok(!/work with your development team/i.test(content));
  assert.ok(!/\b(Accenture|Capco|Nagarro|Huntington)\b/i.test(content));
});

test("Recipe and Engineering surfaces wire artifact studio and snapshot exports", () => {
  const recipeSource = extractFunction(source, "renderAnalysisTabRecipe");
  assert.ok(recipeSource.includes("artifactStudioHeaderHtml(steps)"));
  assert.ok(recipeSource.includes("data-artifact-compile"));
  assert.ok(recipeSource.includes("data-artifact-bundle"));

  const engineeringSource = extractFunction(source, "renderAnalysisTabEngineering");
  assert.ok(engineeringSource.includes("engineeringCommandCenterHtml(steps)"));

  const exportSource = extractFunction(source, "handleRecipeExport");
  assert.ok(exportSource.includes("artifactSnapshot"));
  assert.ok(!exportSource.includes("buildRecommendedArtifactPackage"),
    "export serializes saved snapshots; it must not recompute artifacts");
});

test("UI hierarchy mounts compact package summary, accordions, and implementation package", () => {
  const summarySource = extractFunction(source, "workflowIntelligenceSummaryHtml");
  assert.ok(summarySource.includes("Workflow package summary"));
  assert.ok(summarySource.includes("Compile the recommended package"));
  assert.ok(summarySource.includes("hideZero"));
  assert.ok(!summarySource.includes("Generated assets"));

  const headerSource = extractFunction(source, "artifactStudioHeaderHtml");
  assert.ok(headerSource.includes("Implementation Package Builder"));
  assert.ok(headerSource.includes("Use this in"));
  assert.ok(headerSource.includes("Build for"));
  assert.ok(headerSource.includes("generated > 0"));
  assert.ok(headerSource.includes("bundleCount > 0"));
  assert.ok(headerSource.includes("transitions > 0"));
  assert.ok(!headerSource.includes("Avg readiness"));

  const cardSource = extractFunction(source, "artifactCompilerCardHtml");
  assert.ok(cardSource.includes("artifact-package-card"));
  assert.ok(cardSource.includes("What to confirm next"));
  assert.ok(cardSource.includes("Happy path / Missing input / Exception path"));
  assert.ok(cardSource.includes("Evidence and safeguards"));
  assert.ok(cardSource.includes("Saved package snapshots"));
  assert.ok(cardSource.includes("Compile recommended package"));

  const testPackSource = extractFunction(source, "artifactTestCasesByPath");
  assert.ok(testPackSource.includes("Happy path"));
  assert.ok(testPackSource.includes("Missing input"));
  assert.ok(testPackSource.includes("Exception path"));

  const engineeringSource = extractFunction(source, "engineeringCommandCenterHtml");
  assert.ok(engineeringSource.includes("Engineering implementation package"));
  assert.ok(engineeringSource.includes("implementation-package-section"));
  assert.ok(engineeringSource.includes("Implementation Package"));
  assert.ok(engineeringSource.includes("engineeringImplementationTestPlanHtml(packages)"));

  const discoveryQueueSource = extractFunction(source, "renderInlineKeyQuestions");
  assert.ok(discoveryQueueSource.includes("discoveryActionQueueItems"));
  assert.ok(discoveryQueueSource.includes("Next-best confirmations"));
  assert.ok(discoveryQueueSource.includes("Why this matters"));
  assert.ok(discoveryQueueSource.includes("data-action-lane"));
});

test("UI gap helper dedupes known gaps and turns them into actions", () => {
  const { artifactActionItems, artifactTestCasesByPath } = compilerSandbox();
  const actions = artifactActionItems({
    readiness: {
      blockers: [
        "Missing Output",
        "Output is inferred or low-confidence",
        "Missing Output"
      ]
    }
  }, {
    knownGaps: ["Data Sensitivity is not captured."],
    assumptions: ["Rules: tentative."]
  });

  assert.deepEqual(actions.slice(0, 3), [
    "Confirm output before using this package.",
    "Review output and mark it user-confirmed if correct.",
    "Confirm data sensitivity before using this package."
  ]);
  assert.equal(new Set(actions).size, actions.length);

  const grouped = artifactTestCasesByPath([
    { name: "Missing or ambiguous input" },
    { name: "Exception path" },
    { name: "Happy path" }
  ]);
  assert.deepEqual(grouped.map((item) => item.label), ["Happy path", "Missing input", "Exception path"]);
});

test("Discovery action queue explains next-best confirmations with provenance posture", () => {
  const { step, fill, state, discoveryActionQueueItems } = compilerSandbox();
  fill("name", "Review exception packet");
  fill("dataSensitivity", "Client confidential", "ai-inferred", 0.64);
  fill("systemsTools", "Excel, Outlook", "user-stated", 1);
  state.evidenceArtifacts = [{
    followUpQuestions: ["Does any regulatory rule govern this workflow?"]
  }];

  const queue = discoveryActionQueueItems([step], { limit: 20 });
  const regulatory = queue.find((item) => item.key === "regulatoryContext");
  assert.ok(regulatory);
  assert.equal(regulatory.question, "Does any regulatory rule govern this workflow?");
  assert.equal(regulatory.lane, "Critical for safe recipe");
  assert.match(regulatory.why, /human review rules/i);
  assert.match(regulatory.improves, /Readiness and human review/i);

  const confirm = queue.find((item) => item.key === "dataSensitivity");
  assert.ok(confirm);
  assert.equal(confirm.lane, "Confirm inferred evidence");
  assert.equal(confirm.treatment, "Confirm inferred");
  assert.equal(confirm.source, "AI-inferred value");
  assert.match(confirm.why, /user-trusted evidence/i);
});
