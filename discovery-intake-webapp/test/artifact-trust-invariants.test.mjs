// Phase 1 verification — lock-down tests for the v2 artifact-compiler trust
// invariants that were CONFIRMED to hold. These guard against regressions in:
//   * the "low-confidence inferred value never becomes a hard rule" invariant,
//     across every renderer (not just the single path already covered);
//   * renderer distinctness (each surface emits its own section set);
//   * regeneration preserving the prior snapshot + embedded provenance for BOTH
//     the recommended artifact and the full bundle;
//   * exports (engineering doc + business case) serializing saved snapshots and
//     never recomputing.
//
// NOTE (deliberately not tested here): the Hybrid "force visible caution into
// the MAIN artifact" rule from CLAUDE.md is NOT honored for the business-user
// surfaces (chatgpt/customGPT/m365/copilotStudio) — inferred data-handling,
// regulatory, decision, approval and exception values render as if confirmed,
// with only a generic always-on review line. That is a real gap, reported for
// Phase 2. A test asserting the *absence* of caution would lock in the bug, so
// the acceptance test for it is left for the Phase 2 fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// Same construction as artifact-compiler.test.mjs, kept local so the two files
// stay independent.
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
  const fill = (key, value, sourceName = "user-stated", confidence = 0.95, options = {}) =>
    fns.patchField(step, null, key, value, sourceName, confidence, options);
  return { ...fns, state: sandboxState, step, fill };
}

const ALL_SURFACES = [
  "chatgptPrompt", "customGPT", "microsoft365Copilot", "copilotStudio",
  "githubCopilot", "genericEnterpriseCopilot", "wholeWorkflowOrchestrator", "transitionArtifact"
];

// "## " section headers from a rendered artifact body.
function sectionHeaders(content) {
  return (content.match(/^## .*/gm) || []).map((line) => line.slice(3).trim());
}

// The text of the block under a given "## Heading", up to the next "## " header.
function sectionBody(content, heading) {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

test("Q6: an AI-inferred decision rule is surfaced as an assumption, never as a hard rule, in any renderer", () => {
  const { step, fill, buildAgentRecipeIr, renderPlatformArtifact } = compilerSandbox();
  // Non-transition wording (no approval/review/wait/handoff/route/escalate/decision/exception words).
  fill("name", "Categorise incoming transactions");
  fill("description", "Sort transactions into ledger buckets for the analyst.");
  fill("systemsTools", "Excel");
  fill("output", "Categorised ledger");
  const INFERRED_RULE = "Auto-categorise transactions over $500 as priority";
  fill("rulesDecisionLogic", INFERRED_RULE, "ai-inferred", 0.5);

  const ir = buildAgentRecipeIr(step);
  // The inferred value is kept out of the hard-rule set and surfaced as a tentative assumption.
  assert.ok(!ir.rules.some((r) => r.includes(INFERRED_RULE)), "inferred rule must not enter ir.rules");
  assert.ok(ir.assumptions.some((a) => a.includes(INFERRED_RULE)), "inferred rule must be surfaced as an assumption");

  // No renderer may present the inferred value under a "## Rules" heading.
  for (const surface of ALL_SURFACES) {
    const { content } = renderPlatformArtifact(ir, surface);
    const rulesBlock = sectionBody(content, "Rules");
    if (rulesBlock !== null) {
      assert.ok(!rulesBlock.includes(INFERRED_RULE),
        `${surface}: inferred value must not appear under "## Rules"`);
    }
  }

  // The ChatGPT prompt's Rules section falls back to the draft caveat rather than the inferred rule.
  const chatgpt = renderPlatformArtifact(ir, "chatgptPrompt").content;
  assert.match(sectionBody(chatgpt, "Rules"), /draft until confirmed/i);

  // The enterprise spec keeps the inferred value visible (as an assumption/gap), not dropped.
  const enterprise = renderPlatformArtifact(ir, "genericEnterpriseCopilot").content;
  assert.ok(sectionBody(enterprise, "Assumptions And Known Gaps").includes(INFERRED_RULE));
});

test("Q6 positive control: an evidence-backed rule DOES become a hard rule", () => {
  const { step, fill, buildAgentRecipeIr, renderPlatformArtifact } = compilerSandbox();
  fill("name", "Categorise incoming transactions");
  fill("description", "Sort transactions into ledger buckets for the analyst.");
  fill("output", "Categorised ledger");
  const CONFIRMED_RULE = "Bucket each transaction by its general-ledger code";
  fill("rulesDecisionLogic", CONFIRMED_RULE, "user-stated", 1);

  const ir = buildAgentRecipeIr(step);
  assert.ok(ir.rules.some((r) => r.includes(CONFIRMED_RULE)), "confirmed rule enters ir.rules");
  const chatgpt = renderPlatformArtifact(ir, "chatgptPrompt").content;
  assert.ok(sectionBody(chatgpt, "Rules").includes(CONFIRMED_RULE),
    "confirmed rule appears under the ChatGPT prompt's Rules section");
});

test("the seven distinct renderers emit mutually distinct section sets", () => {
  const { step, fill, buildAgentRecipeIr, renderPlatformArtifact } = compilerSandbox();
  fill("name", "Draft customer reply");
  fill("description", "Draft a reply from the case notes.");
  fill("output", "Draft reply");
  const ir = buildAgentRecipeIr(step);

  const distinctSurfaces = [
    "chatgptPrompt", "customGPT", "microsoft365Copilot", "githubCopilot",
    "genericEnterpriseCopilot", "wholeWorkflowOrchestrator", "transitionArtifact"
  ];
  const signatures = distinctSurfaces.map((s) => sectionHeaders(renderPlatformArtifact(ir, s).content).join("|"));
  // Every surface must have a non-empty, unique section signature.
  signatures.forEach((sig, i) => assert.ok(sig.length > 0, `${distinctSurfaces[i]} has sections`));
  assert.equal(new Set(signatures).size, distinctSurfaces.length, "all seven section signatures are unique");
});

test("Q4: regeneration preserves the prior snapshot (with provenance) for BOTH recommended and bundle", () => {
  // rotateArtifactSnapshot is exercised against the real implementation with a
  // minimal injected compiler-state container and id generator.
  const state = { artifactCompiler: { compiled: {}, compiledPrior: {}, bundles: {}, bundlePrior: {} } };
  let n = 0;
  const { rotateArtifactSnapshot } = buildSandbox(source, {
    functions: ["rotateArtifactSnapshot"],
    globals: {
      state,
      ensureArtifactCompilerState: () => state.artifactCompiler,
      makeId: (prefix) => `${prefix}_${n++}`
    }
  });

  // A package payload carries provenance the way the real builders do.
  const pkgA = { ir: { evidenceBackedFacts: [{ field: "output", source: "user-stated", confidence: 1 }], provenanceSummary: { evidenceBackedCells: 1 } }, tag: "A" };
  const pkgB = { ir: { evidenceBackedFacts: [{ field: "output", source: "user-edited", confidence: 1 }], provenanceSummary: { evidenceBackedCells: 2 } }, tag: "B" };

  for (const kind of ["compiled", "bundle"]) {
    const currentKey = kind === "bundle" ? "bundles" : "compiled";
    const priorKey = kind === "bundle" ? "bundlePrior" : "compiledPrior";

    const hadPriorFirst = rotateArtifactSnapshot("step1", pkgA, kind);
    assert.equal(hadPriorFirst, false, `${kind}: first compile has no prior`);
    assert.equal(state.artifactCompiler[currentKey].step1.package.tag, "A");
    assert.equal(state.artifactCompiler[priorKey].step1, undefined, `${kind}: no prior yet`);

    const hadPriorSecond = rotateArtifactSnapshot("step1", pkgB, kind);
    assert.equal(hadPriorSecond, true, `${kind}: second compile reports a preserved prior`);
    assert.equal(state.artifactCompiler[currentKey].step1.package.tag, "B", `${kind}: current is the new package`);
    const prior = state.artifactCompiler[priorKey].step1;
    assert.equal(prior.package.tag, "A", `${kind}: prior is the previous package`);
    assert.ok(prior.preservedAt, `${kind}: prior carries a preservedAt timestamp`);
    // Provenance is embedded in the preserved snapshot, not recomputed.
    assert.ok(Array.isArray(prior.package.ir.evidenceBackedFacts), `${kind}: prior embeds provenance facts`);
    assert.ok(prior.package.ir.provenanceSummary, `${kind}: prior embeds the provenance summary`);
  }
});

test("Q5: engineering-doc and business-case exports serialize saved snapshots and never recompute", () => {
  const engineering = extractFunction(source, "handleEngineeringExport");
  assert.ok(engineering.includes("artifactSnapshot"), "engineering export reads the saved recommended snapshot");
  assert.ok(engineering.includes("fullBundleSnapshot"), "engineering export reads the saved bundle snapshot");
  assert.ok(!engineering.includes("buildRecommendedArtifactPackage("),
    "engineering export must not recompute the recommended artifact");
  assert.ok(!engineering.includes("buildFullArtifactBundle("),
    "engineering export must not recompute the full bundle");

  const businessCase = extractFunction(source, "exportWorkflowWord");
  assert.ok(businessCase.includes("businessCaseSnapshot"), "the Word export embeds the computed business-case snapshot");
  assert.ok(!businessCase.includes("/api/business-case"),
    "the Word export must not trigger a fresh business-case computation");
  assert.ok(!businessCase.includes("computeBusinessCaseNow"),
    "the Word export must not call the business-case compute path");
});

test("Q2: the recommended MAIN artifact forces a visible caution when data-handling and regulatory info are AI-inferred", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  // Non-transition, knowledge-backed M365 step; data handling + regulatory are inferred (uncertain).
  fill("name", "Summarise client portfolio changes");
  fill("description", "Produce a written summary of portfolio changes for the relationship manager.");
  fill("systemsTools", "Excel, Outlook");
  fill("output", "Portfolio summary document");
  fill("dataProcessing", "Client account holdings and personal data", "ai-inferred", 0.5);
  fill("regulatoryContext", "Possibly MNPI / regulated", "ai-inferred", 0.5);

  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "recommend" });
  const content = pkg.recommendedArtifact.content;
  const caution = sectionBody(content, "Caution - Confirm Before Use");
  assert.ok(caution !== null, "main artifact must contain a visible caution section");
  assert.match(caution, /data handling/, "caution names the uncertain data-handling area");
  assert.match(caution, /regulatory or compliance risk/, "caution names the uncertain regulatory area");
  assert.match(caution, /AI-inferred at 50% confidence/, "caution states the inferred confidence");
});

test("Q2: a fully evidence-backed step yields no caution section (stays polished)", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Summarise client portfolio changes");
  fill("description", "Produce a written summary of portfolio changes for the relationship manager.");
  fill("systemsTools", "Excel, Outlook");
  fill("output", "Portfolio summary document");
  // All six caution-relevant areas captured as user-stated evidence (no transition wording).
  fill("dataProcessing", "Only the changed holdings table");
  fill("dataSensitivity", "Internal only");
  fill("rulesDecisionLogic", "Summarise only holdings that changed since last week");
  fill("humanCheckpoint", "Relationship manager confirms the summary before sending");
  fill("exceptionBranching", "If a holding is missing data, mark that line as draft");
  fill("regulatoryContext", "No specific regulation; internal reference only");

  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "recommend" });
  assert.equal(pkg.ir.cautionFlags.length, 0, "no caution flags when every relevant area is evidence-backed");
  assert.equal(sectionBody(pkg.recommendedArtifact.content, "Caution - Confirm Before Use"), null,
    "polished artifact has no caution section when nothing is uncertain");
});

test("Q2: the caution is forced across every business-user surface", () => {
  const { step, fill, buildAgentRecipeIr, renderPlatformArtifact } = compilerSandbox();
  fill("name", "Summarise client portfolio changes");
  fill("description", "Produce a written summary of portfolio changes for the relationship manager.");
  fill("output", "Portfolio summary document");
  fill("dataProcessing", "Client account holdings and personal data", "ai-inferred", 0.5);
  const ir = buildAgentRecipeIr(step);
  for (const surface of ["chatgptPrompt", "customGPT", "microsoft365Copilot", "copilotStudio"]) {
    const content = renderPlatformArtifact(ir, surface).content;
    assert.ok(sectionBody(content, "Caution - Confirm Before Use") !== null,
      `${surface}: business-user surface must force the caution when info is uncertain`);
  }
});

test("bundle: each surface is titled with its OWN label, not the recommended surface's", () => {
  const { step, fill, buildFullArtifactBundle, artifactSurfaceLabel } = compilerSandbox();
  fill("name", "Summarise client portfolio changes");
  fill("description", "Produce a written summary of portfolio changes for the relationship manager.");
  fill("systemsTools", "Excel, Outlook"); // recommends copilotStudio
  fill("output", "Portfolio summary document");

  const bundle = buildFullArtifactBundle(step, {}, { targetSurface: "recommend" });
  const recommendedLabel = artifactSurfaceLabel(bundle.profile.targetSurface);
  for (const [surface, artifact] of Object.entries(bundle.artifacts)) {
    const ownLabel = artifactSurfaceLabel(surface);
    const h1 = artifact.content.split("\n").find(Boolean);
    assert.ok(h1.includes(ownLabel), `${surface}: H1 carries its own label "${ownLabel}"`);
    assert.ok(artifact.title.includes(ownLabel), `${surface}: title carries its own label`);
    if (ownLabel !== recommendedLabel) {
      assert.ok(!h1.includes(recommendedLabel),
        `${surface}: H1 must not be mislabeled with the recommended surface "${recommendedLabel}"`);
    }
  }
});

test("GitHub pack is developer-facing: never the recommended main artifact, but stays in the bundle", () => {
  const { step, fill, isDeveloperOrientedStep, buildRecommendedArtifactPackage, buildFullArtifactBundle } = compilerSandbox();
  // Clear developer signals, no transition wording.
  fill("name", "Implement the statement parser");
  fill("description", "Write code in the GitHub repo and add unit tests for the parser.");
  fill("systemsTools", "GitHub");
  fill("output", "Pull request");

  assert.equal(isDeveloperOrientedStep(step), true, "developer signals are detected");

  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "recommend" });
  assert.notEqual(pkg.profile.recommendedSurface, "githubCopilot",
    "the recommended (main business) surface is never the GitHub developer pack");
  assert.notEqual(pkg.recommendedArtifact.targetSurface, "githubCopilot");
  assert.equal(pkg.profile.developerOriented, true);
  assert.match(pkg.recommendationReason, /Engineering Doc/);
  assert.match(pkg.recommendationReason, /full bundle/);

  // The pack is not lost — it remains available as developer-facing context.
  const bundle = buildFullArtifactBundle(step, {}, { targetSurface: "recommend" });
  assert.ok(bundle.artifacts.githubCopilot, "the GitHub developer pack remains in the full bundle");
  assert.ok(bundle.artifacts.githubCopilot.content.includes("Developer Implementation Pack"));
});

test("an explicit GitHub Copilot selection still renders the developer pack", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Implement the statement parser");
  fill("description", "Write code and add unit tests.");
  fill("output", "Pull request");
  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "githubCopilot" });
  assert.equal(pkg.profile.targetSurface, "githubCopilot", "explicit selection is honored");
  assert.ok(pkg.recommendedArtifact.content.includes("Developer Implementation Pack"));
  assert.match(pkg.recommendationReason, /developer-facing/i);
});

test("Q5: the server embeds saved artifact snapshots and defines no compiler of its own", () => {
  const serverSource = readServerSource();
  for (const builder of [
    "function buildRecommendedArtifactPackage",
    "function buildFullArtifactBundle",
    "function buildAgentRecipeIr",
    "function scoreRecipeReadiness",
    "function buildRecipeDeploymentProfile"
  ]) {
    assert.ok(!serverSource.includes(builder), `server must not define ${builder} (no server-side recompute)`);
  }
  const meta = extractFunction(serverSource, "artifactSnapshotExportMeta");
  assert.ok(meta.includes("snapshot?.package"), "export meta reads from the saved snapshot package");
  assert.ok(meta.includes("recommendedArtifact"), "export meta serializes the saved recommended artifact content");
});
