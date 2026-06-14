// V3-3 — AI-policy ingestion. Executed, deterministic tests (NO live LLM) over
// the policy clause segmenter, clause matching, and the policy-grounded caution /
// human-review language in the Agent Recipe IR. Each test maps to a V3-3
// acceptance criterion; fixtures use NEUTRAL sample policy text with no firm
// names. The decisive invariant — with no policy the IR is byte-identical to the
// pre-V3-3 output — is asserted directly (test "byte-identical").

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();

// Neutral, numbered AI policy. Clause 1 → data handling, 2 → sensitivity,
// 3 → human review, 4 → regulatory. No firm names anywhere.
const NEUTRAL_POLICY = `AI Use Policy

1. Data Handling. All client data processed by AI tools must be stored only in approved systems and must not be transmitted to external services without review.
2. Data Sensitivity. Confidential and restricted information, including personal data, must be classified before any AI assistant is used on it.
3. Human Review. A qualified person must review and approve AI output before it is relied upon; human oversight is required for any decision.
4. Regulatory Records. The team must retain an audit record of AI use to satisfy applicable regulatory and compliance obligations.`;

// Heading/paragraph policy with no numeric markers (exercises the fallback).
const PARAGRAPH_POLICY = `Data Handling

Client data must be stored in approved systems only.

Human Review

A person must review AI output before it is used.`;

const BANNED_PHRASE = /work with your development team/i;
const FIRM_NAMES = /\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i;
// An AFFIRMATIVE approval claim — distinct from the allowed NEGATING phrasing
// ("not ... compliance approval", "avoids claims of approved handling").
const APPROVED_CLAIM = /\b(compliance[- ]approved|approved for (use|production|deployment|controlled use)|is (compliance[- ])?approved|certified compliant)\b/i;

function policySandbox() {
  const sandboxState = { questionHistory: [], evidenceArtifacts: [] };
  const fns = buildSandbox(source, {
    consts: [
      "ARTIFACT_TARGET_SURFACES", "ARTIFACT_SCOPE_OPTIONS", "NO_INTEGRATION_MVP_NOTE",
      "FUTURE_INTEGRATION_NOTE", "ARTIFACT_CRITICAL_CELLS", "ARTIFACT_CAUTION_AREAS",
      "TRANSITION_SIGNAL_RULES", "CELL_PLAIN_NAMES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK",
      "GRID_CELL_LAYER", "POLICY_AREA_CUES"
    ],
    functions: [
      "artifactSurfaceLabel", "normalizeArtifactTargetSurface", "normalizeRecipeScope",
      "gridCellValue", "compilerCellText", "compilerCellSnapshot", "compilerEvidenceSummary",
      "inferRecipeDataSensitivity", "inferRecipeReuseFrequency", "inferWorkflowStability",
      "detectTransitionStep", "isDeveloperOrientedStep", "recommendArtifactTargetSurface",
      "artifactRecommendationReason", "buildRecipeDeploymentProfile", "scoreRecipeReadiness",
      "policyClip", "extractPolicyClauses", "matchPolicyClause", "policyReviewLine",
      "buildAgentRecipeIr", "artifactBullets", "artifactCautionSection",
      "renderChatGptPrompt", "renderCustomGptConfig", "renderMicrosoftCopilotConfig",
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
  const makeStep = () => fns.newGridStep();
  const fill = (step, key, value, sourceName = "user-stated", confidence = 0.95) =>
    fns.patchField(step, null, key, value, sourceName, confidence);
  const policyOf = (text) => ({
    fileName: "ai-use-policy.txt",
    uploadedAt: "2026-06-13T00:00:00.000Z",
    clauses: fns.extractPolicyClauses(text)
  });
  return { ...fns, makeStep, fill, policyOf };
}

const NORMALIZED_NEUTRAL = NEUTRAL_POLICY.replace(/\r\n?/g, "\n").trim();

// --- Criterion: policy parse -> clause extraction (with provenance) ----------

test("extractPolicyClauses segments a numbered policy into verbatim clauses with provenance", () => {
  const { extractPolicyClauses } = policySandbox();
  const clauses = extractPolicyClauses(NEUTRAL_POLICY);
  assert.equal(clauses.length, 4, "four numbered clauses");
  assert.deepEqual(clauses.map((c) => c.ref), ["1", "2", "3", "4"]);
  for (const c of clauses) {
    assert.equal(c.source, "doc-extracted", "reuses the existing provenance source vocabulary");
    assert.equal(typeof c.confidence, "number");
    assert.ok(c.confidence > 0 && c.confidence <= 1);
    // The clause text is a BYTE-VERBATIM contiguous slice of the source.
    assert.ok(NORMALIZED_NEUTRAL.includes(c.text), `clause ${c.ref} is verbatim`);
    assert.ok(c.id && typeof c.id === "string");
  }
});

test("extractPolicyClauses falls back to paragraphs when there are no structural markers", () => {
  const { extractPolicyClauses } = policySandbox();
  const clauses = extractPolicyClauses(PARAGRAPH_POLICY);
  assert.ok(clauses.length >= 2, "paragraph fallback still yields clauses");
  for (const c of clauses) {
    assert.equal(c.source, "doc-extracted");
    assert.equal(c.confidence, 0.6, "paragraph clauses carry the fallback confidence");
    assert.ok(c.ref.startsWith("¶"));
  }
  assert.equal(extractPolicyClauses("").length, 0, "empty input yields no clauses");
});

// --- Criterion: caution text references the correct clause -------------------

test("matchPolicyClause maps a caution area to its governing clause, null when unmatched", () => {
  const { matchPolicyClause, policyOf } = policySandbox();
  const policy = policyOf(NEUTRAL_POLICY);
  assert.equal(matchPolicyClause(policy, "dataProcessing").ref, "1");
  assert.equal(matchPolicyClause(policy, "dataSensitivity").ref, "2");
  assert.equal(matchPolicyClause(policy, "humanCheckpoint").ref, "3");
  assert.equal(matchPolicyClause(policy, "regulatoryContext").ref, "4");
  // The neutral policy says nothing about exceptions, and unknown areas have no
  // cues — both must fall back to null (caller then uses generic text).
  assert.equal(matchPolicyClause(policy, "exceptionBranching"), null);
  assert.equal(matchPolicyClause(policy, "notAnArea"), null);
});

test("the IR carries per-area policy citations pointing at the correct clause", () => {
  const { makeStep, fill, policyOf, buildAgentRecipeIr } = policySandbox();
  const step = makeStep();
  fill(step, "name", "Summarise client portfolio changes");
  fill(step, "description", "Produce a written summary of portfolio changes.");
  const ir = buildAgentRecipeIr(step, { policy: policyOf(NEUTRAL_POLICY) }, { targetSurface: "recommend" });
  const byField = Object.fromEntries(ir.policyCitations.map((c) => [c.field, c]));
  assert.equal(byField.dataProcessing.ref, "1");
  assert.equal(byField.dataSensitivity.ref, "2");
  assert.equal(byField.humanCheckpoint.ref, "3");
  assert.equal(byField.regulatoryContext.ref, "4");
  // Each citation is provenance-tagged and its quote is verbatim policy text.
  for (const c of ir.policyCitations) {
    assert.equal(c.source, "doc-extracted");
    assert.ok(NORMALIZED_NEUTRAL.includes(c.quote), "citation quote is verbatim");
  }
});

test("cautionFlags cite the governing policy clause for an uncertain area", () => {
  const { makeStep, fill, policyOf, buildAgentRecipeIr } = policySandbox();
  const step = makeStep(); // sparse: data handling is not captured -> a flag fires
  fill(step, "name", "Summarise notes");
  fill(step, "description", "Summarise the meeting notes into a short brief.");
  const ir = buildAgentRecipeIr(step, { policy: policyOf(NEUTRAL_POLICY) }, { targetSurface: "recommend" });
  const dataFlag = ir.cautionFlags.find((f) => f.includes("(data handling)"));
  assert.ok(dataFlag, "a data-handling caution flag is present");
  assert.ok(dataFlag.includes("Per uploaded policy 1."), "it cites the governing clause");
});

test("human-review language is grounded in a policy clause when one governs the risk", () => {
  const { makeStep, fill, policyOf, buildAgentRecipeIr } = policySandbox();
  const step = makeStep();
  fill(step, "name", "Process restricted client records");
  fill(step, "description", "Prepare a summary from restricted client records.");
  fill(step, "dataSensitivity", "Restricted client data"); // -> high sensitivity
  const ir = buildAgentRecipeIr(step, { policy: policyOf(NEUTRAL_POLICY) }, { targetSurface: "recommend" });
  assert.ok(
    ir.humanReview.some((line) => line.startsWith("Per uploaded policy 1, review data handling")),
    "a human-review line cites the governing policy clause"
  );
});

// --- Criterion: absent policy -> generic fallback (byte-identical) -----------

test("with no policy, caution / review / blockedClaims use the exact generic advisory text", () => {
  const { makeStep, fill, buildAgentRecipeIr } = policySandbox();
  const step = makeStep();
  fill(step, "name", "Process restricted client records");
  fill(step, "description", "Prepare a summary from restricted client records.");
  fill(step, "dataSensitivity", "Restricted client data");
  const ir = buildAgentRecipeIr(step, {}, { targetSurface: "recommend" });
  assert.deepEqual(ir.policyCitations, [], "no citations without a policy");
  assert.ok(!ir.cautionFlags.some((f) => /Per uploaded policy/.test(f)), "no clause citations in flags");
  assert.ok(!ir.humanReview.some((l) => /Per uploaded policy/.test(l)), "no clause citations in review");
  assert.ok(
    ir.humanReview.includes("Review data handling, sensitivity, and policy guidance before controlled use."),
    "the generic human-review line is preserved verbatim"
  );
  assert.ok(
    ir.blockedClaims.includes("Policy-specific claims require uploaded policy evidence."),
    "the generic blocked-claim line is preserved verbatim"
  );
});

test("the no-policy IR is byte-identical across absent / null / empty-clauses context", () => {
  const { makeStep, fill, policyOf, buildAgentRecipeIr } = policySandbox();
  const build = () => {
    const step = makeStep();
    fill(step, "name", "Process restricted client records");
    fill(step, "description", "Prepare a summary from restricted client records.");
    fill(step, "dataSensitivity", "Restricted client data");
    fill(step, "systemsTools", "Excel, Outlook");
    return step;
  };
  const absent = buildAgentRecipeIr(build(), {}, { targetSurface: "recommend" });
  const explicitNull = buildAgentRecipeIr(build(), { policy: null }, { targetSurface: "recommend" });
  const emptyClauses = buildAgentRecipeIr(build(), { policy: { fileName: "x", clauses: [] } }, { targetSurface: "recommend" });
  assert.deepEqual(explicitNull, absent, "policy:null is identical to absent");
  assert.deepEqual(emptyClauses, absent, "empty clauses are treated as no policy");
});

// --- Criterion: no "compliance approved" claim is ever emitted ----------------

test("no rendered artifact asserts compliance approval — policy present or absent", () => {
  const { makeStep, fill, policyOf, buildRecommendedArtifactPackage, buildFullArtifactBundle } = policySandbox();
  const build = () => {
    const step = makeStep();
    fill(step, "name", "Process restricted client records");
    fill(step, "description", "Prepare a summary from restricted client records.");
    fill(step, "dataSensitivity", "Restricted client data");
    return step;
  };
  // A caution-bearing surface renders the policy basis verbatim into the artifact.
  const withPolicy = buildRecommendedArtifactPackage(build(), { policy: policyOf(NEUTRAL_POLICY) }, { targetSurface: "chatgptPrompt" });
  const withoutPolicy = buildRecommendedArtifactPackage(build(), {}, { targetSurface: "chatgptPrompt" });
  assert.ok(!APPROVED_CLAIM.test(withPolicy.recommendedArtifact.content), "policy present: no approval claim");
  assert.ok(!APPROVED_CLAIM.test(withoutPolicy.recommendedArtifact.content), "policy absent: no approval claim");
  assert.ok(withPolicy.recommendedArtifact.content.includes("Policy Basis (from uploaded policy)"), "policy basis is rendered");
  assert.ok(withPolicy.ir.blockedClaims.some((c) => /advisory and require human review/.test(c)), "blocked claim stays advisory");
  // Grounding is also carried in the surface-INDEPENDENT human-review checklist,
  // so it is present on every surface (even renderers without a caution block).
  assert.ok(withPolicy.ir.humanReview.some((l) => /Per uploaded policy/.test(l)), "human-review checklist cites the policy");
  // And no surface in the full bundle ever asserts approval.
  const bundle = buildFullArtifactBundle(build(), { policy: policyOf(NEUTRAL_POLICY) }, { targetSurface: "recommend" });
  for (const [surface, artifact] of Object.entries(bundle.artifacts)) {
    assert.ok(!APPROVED_CLAIM.test(artifact.content), `${surface}: no approval claim`);
  }
});

// --- Criterion: policy preserved (with provenance) across regeneration --------

test("the policy-grounded artifact survives snapshot -> export verbatim (no recompute)", () => {
  const { makeStep, fill, policyOf, buildRecommendedArtifactPackage } = policySandbox();
  const step = makeStep();
  fill(step, "name", "Process restricted client records");
  fill(step, "description", "Prepare a summary from restricted client records.");
  fill(step, "dataSensitivity", "Restricted client data");
  const pkg = buildRecommendedArtifactPackage(step, { policy: policyOf(NEUTRAL_POLICY) }, { targetSurface: "chatgptPrompt" });
  assert.ok(pkg.recommendedArtifact.content.includes("Policy Basis (from uploaded policy)"), "precondition: policy basis is in the artifact");
  // Run it through the server export-meta path exactly as an export would.
  const { artifactSnapshotExportMeta } = buildSandbox(readServerSource(), { functions: ["artifactSnapshotExportMeta"] });
  const meta = artifactSnapshotExportMeta({ generatedAt: "2026-06-13T00:00:00.000Z", package: pkg });
  assert.ok(meta.content.includes("Policy Basis (from uploaded policy)"), "the export embeds the saved policy basis");
  assert.equal(meta.content, pkg.recommendedArtifact.content, "export is the saved artifact byte-for-byte (no recompute)");
});

test("policy is preserved across regeneration and never mutated", () => {
  const { makeStep, fill, policyOf, buildAgentRecipeIr } = policySandbox();
  const policy = policyOf(NEUTRAL_POLICY);
  const before = JSON.parse(JSON.stringify(policy));
  const step = makeStep();
  fill(step, "name", "Summarise client portfolio changes");
  fill(step, "description", "Produce a written summary of portfolio changes.");
  const first = buildAgentRecipeIr(step, { policy }, { targetSurface: "recommend" });
  const second = buildAgentRecipeIr(step, { policy }, { targetSurface: "recommend" }); // "regenerate"
  assert.deepEqual(second.policyCitations, first.policyCitations, "citations stable across regeneration");
  assert.deepEqual(policy, before, "the uploaded policy value is not mutated by generation");
});

// --- Criterion: neutral fixtures, no firm names persisted --------------------

test("fixtures and grounded output contain no firm names or the banned phrase", () => {
  const { makeStep, fill, policyOf, buildFullArtifactBundle } = policySandbox();
  for (const text of [NEUTRAL_POLICY, PARAGRAPH_POLICY]) {
    assert.ok(!FIRM_NAMES.test(text), "fixture has no firm names");
    assert.ok(!BANNED_PHRASE.test(text), "fixture has no banned phrase");
  }
  const step = makeStep();
  fill(step, "name", "Summarise client portfolio changes");
  fill(step, "description", "Produce a written summary of portfolio changes.");
  fill(step, "dataProcessing", "Client account holdings and personal data", "ai-inferred", 0.5);
  const bundle = buildFullArtifactBundle(step, { policy: policyOf(NEUTRAL_POLICY) }, { targetSurface: "recommend" });
  for (const [surface, artifact] of Object.entries(bundle.artifacts)) {
    assert.ok(!FIRM_NAMES.test(artifact.content), `${surface}: no firm names`);
    assert.ok(!BANNED_PHRASE.test(artifact.content), `${surface}: no banned phrase`);
    assert.ok(!APPROVED_CLAIM.test(artifact.content), `${surface}: no approval claim`);
  }
});
