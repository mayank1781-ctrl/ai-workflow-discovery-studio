// V3-5 — Spec -> importable/deployable config outputs. Executed, deterministic
// tests (NO live LLM) over the per-surface importable config builders, the
// structured copyBlocks, no-fake-integration guarantees, snapshot-backing, and
// the V3-4 export fold-in. Each maps to a V3-5 acceptance criterion. Fixtures are
// neutral — no firm names.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();
const FIRM_NAMES = /\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i;
const BANNED_PHRASE = /work with your development team/i;
// A FAKE integration marker: an endpoint URL, an HTTP-verb API path, or an action
// schema reference. Deliberately excludes the negating "no writeback / no API
// actions" disclaimers the configs legitimately carry.
const FAKE_INTEGRATION = /(https?:\/\/)|(\b(?:POST|GET|PUT|PATCH|DELETE)\s+\/)|openapi|swagger/i;

function compilerSandbox() {
  const sandboxState = { questionHistory: [], evidenceArtifacts: [] };
  const fns = buildSandbox(source, {
    consts: [
      "ARTIFACT_TARGET_SURFACES", "ARTIFACT_SCOPE_OPTIONS", "NO_INTEGRATION_MVP_NOTE",
      "FUTURE_INTEGRATION_NOTE", "ARTIFACT_CRITICAL_CELLS", "ARTIFACT_CAUTION_AREAS",
      "TRANSITION_SIGNAL_RULES", "CELL_PLAIN_NAMES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK",
      "GRID_CELL_LAYER"
    ],
    functions: [
      "artifactSurfaceLabel", "normalizeArtifactTargetSurface", "normalizeRecipeScope",
      "gridCellValue", "compilerCellText", "compilerCellSnapshot", "compilerEvidenceSummary",
      "inferRecipeDataSensitivity", "inferRecipeReuseFrequency", "inferWorkflowStability",
      "detectTransitionStep", "isDeveloperOrientedStep", "recommendArtifactTargetSurface",
      "artifactRecommendationReason", "buildRecipeDeploymentProfile", "scoreRecipeReadiness",
      "buildAgentRecipeIr", "artifactBullets", "artifactCautionSection",
      "configProvenanceFooter", "customGptInstructionsText", "customGptConfigText",
      "m365AgentInstructionsText", "m365AgentManifest", "buildArtifactCopyBlocks",
      "renderChatGptPrompt", "renderCustomGptConfig", "renderMicrosoftCopilotConfig",
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
  const fill = (key, value, sourceName = "user-stated", confidence = 0.95) =>
    fns.patchField(step, null, key, value, sourceName, confidence);
  return { ...fns, step, fill };
}

// --- (a) Custom GPT copy-paste config block ----------------------------------

test("the Custom GPT renderer emits a valid copy-paste configuration block", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Summarise client portfolio changes");
  fill("description", "Produce a written summary of portfolio changes.");
  fill("output", "Portfolio summary document");
  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "customGPT" });
  const block = pkg.recommendedArtifact.copyBlocks.find((b) => b.id === "customgpt-config");
  assert.ok(block, "customgpt-config copy block present");
  for (const field of ["Name:", "Description:", "Instructions:", "Conversation starters:", "Knowledge:", "Capabilities:", "Actions: None"]) {
    assert.ok(block.text.includes(field), `config block has the "${field}" field`);
  }
  assert.ok(pkg.recommendedArtifact.content.includes("## Importable Configuration (copy-paste)"),
    "the importable block is embedded in the rendered content (so exports carry it)");
});

// --- (b) M365 / Copilot Studio importable JSON manifest ----------------------

test("the M365 / Copilot Studio renderer emits an importable JSON manifest with core fields", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Summarise client portfolio changes");
  fill("description", "Produce a written summary of portfolio changes.");
  fill("systemsTools", "Excel, Outlook");
  fill("output", "Portfolio summary document");
  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "microsoft365Copilot" });
  const block = pkg.recommendedArtifact.copyBlocks.find((b) => b.id === "m365-agent-json");
  assert.ok(block && block.language === "json", "m365-agent-json copy block present");
  const manifest = JSON.parse(block.text); // must be valid JSON
  for (const key of ["name", "description", "instructions", "conversation_starters"]) {
    assert.ok(key in manifest, `manifest declares "${key}"`);
  }
  assert.ok(Array.isArray(manifest.conversation_starters) && manifest.conversation_starters.length > 0);
  assert.ok(pkg.recommendedArtifact.content.includes("## Importable Agent Configuration (JSON)"));
});

test("the M365 manifest declares no actions / plugins / connectors / api / $schema (integration-free)", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Reconcile invoices");
  fill("description", "Reconcile invoices against the ledger.");
  fill("systemsTools", "Excel");
  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "copilotStudio" });
  const manifest = JSON.parse(pkg.recommendedArtifact.copyBlocks.find((b) => b.id === "m365-agent-json").text);
  for (const forbidden of ["actions", "plugins", "connectors", "api", "$schema", "version"]) {
    assert.ok(!(forbidden in manifest), `manifest must not declare "${forbidden}"`);
  }
});

// --- (c) ChatGPT one-click copy block + every surface copyable ---------------

test("the ChatGPT prompt exposes a one-click copy block (text === content)", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Draft a reply");
  fill("description", "Draft a reply from the case notes.");
  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "chatgptPrompt" });
  const block = pkg.recommendedArtifact.copyBlocks.find((b) => b.id === "chatgpt-prompt");
  assert.ok(block && block.text.length > 0, "chatgpt-prompt copy block present and non-empty");
  assert.equal(block.text, pkg.recommendedArtifact.content, "the copy block is the full prompt");
});

test("every surface yields at least one well-formed copy block", () => {
  const { step, fill, buildAgentRecipeIr, renderPlatformArtifact } = compilerSandbox();
  fill("name", "Summarise notes");
  fill("description", "Summarise the meeting notes into a short brief.");
  fill("output", "Short brief");
  const ir = buildAgentRecipeIr(step);
  const surfaces = ["chatgptPrompt", "customGPT", "microsoft365Copilot", "copilotStudio",
    "githubCopilot", "genericEnterpriseCopilot", "wholeWorkflowOrchestrator", "transitionArtifact"];
  for (const surface of surfaces) {
    const art = renderPlatformArtifact(ir, surface);
    assert.ok(Array.isArray(art.copyBlocks) && art.copyBlocks.length >= 1, `${surface} has >=1 copy block`);
    assert.ok(art.copyBlocks.every((b) => b.id && b.label && typeof b.text === "string" && b.text.length > 0),
      `${surface} copy blocks are well-formed`);
  }
});

// --- no-integration assumption + no fake claims ------------------------------

test("each importable config states the no-integration assumption and labels integration as future candidate", () => {
  for (const surface of ["customGPT", "microsoft365Copilot", "chatgptPrompt"]) {
    const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
    fill("name", "Summarise notes");
    fill("description", "Summarise the meeting notes.");
    fill("systemsTools", "Excel");
    const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: surface });
    const text = `${pkg.recommendedArtifact.content}\n${pkg.recommendedArtifact.copyBlocks.map((b) => b.text).join("\n")}`;
    assert.ok(/no live system integrations/i.test(text), `${surface}: states the no-integration assumption`);
  }
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Summarise notes");
  fill("description", "Summarise the meeting notes.");
  const cg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "customGPT" });
  assert.ok(/future integration candidate/i.test(cg.recommendedArtifact.copyBlocks[0].text),
    "the Custom GPT config labels integrations as a future candidate");
});

test("no config asserts a fake integration (endpoint / HTTP path / openapi)", () => {
  const { step, fill, buildFullArtifactBundle } = compilerSandbox();
  fill("name", "Summarise client portfolio changes");
  fill("description", "Produce a written summary of portfolio changes.");
  fill("systemsTools", "Excel, Outlook, SharePoint");
  fill("output", "Portfolio summary document");
  const bundle = buildFullArtifactBundle(step, {}, { targetSurface: "recommend" });
  for (const [surface, art] of Object.entries(bundle.artifacts)) {
    assert.ok(!FAKE_INTEGRATION.test(art.content), `${surface}: content has no fake integration`);
    for (const b of art.copyBlocks) {
      assert.ok(!FAKE_INTEGRATION.test(b.text), `${surface}: copy block has no fake integration`);
    }
  }
});

// --- snapshot-backed + prior preserved on regeneration -----------------------

test("copyBlocks are snapshot-backed (survive a structuredClone of the package)", () => {
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Summarise notes");
  fill("description", "Summarise the meeting notes.");
  fill("systemsTools", "Excel");
  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "customGPT" });
  const snapshot = structuredClone({ id: "art-1", generatedAt: "t", kind: "compiled", package: pkg });
  assert.deepEqual(snapshot.package.recommendedArtifact.copyBlocks, pkg.recommendedArtifact.copyBlocks,
    "copyBlocks survive the snapshot deep copy byte-identical");
  assert.ok(snapshot.package.recommendedArtifact.copyBlocks.length >= 1);
  assert.match(extractFunction(source, "rotateArtifactSnapshot"), /package:\s*packagePayload/,
    "rotateArtifactSnapshot stores the whole package, so copyBlocks ride into the snapshot");
});

test("regeneration preserves the prior config version", () => {
  const state = { artifactCompiler: { compiled: {}, compiledPrior: {}, bundles: {}, bundlePrior: {} } };
  let n = 0;
  const { rotateArtifactSnapshot } = buildSandbox(source, {
    functions: ["rotateArtifactSnapshot"],
    globals: { state, ensureArtifactCompilerState: () => state.artifactCompiler, makeId: (p) => `${p}_${n++}` }
  });
  const pkgA = { recommendedArtifact: { copyBlocks: [{ id: "customgpt-config", text: "CONFIG A" }] } };
  const pkgB = { recommendedArtifact: { copyBlocks: [{ id: "customgpt-config", text: "CONFIG B" }] } };
  assert.equal(rotateArtifactSnapshot("s1", pkgA, "compiled"), false);
  assert.equal(rotateArtifactSnapshot("s1", pkgB, "compiled"), true);
  assert.equal(state.artifactCompiler.compiled.s1.package.recommendedArtifact.copyBlocks[0].text, "CONFIG B");
  assert.equal(state.artifactCompiler.compiledPrior.s1.package.recommendedArtifact.copyBlocks[0].text, "CONFIG A",
    "the prior config version is preserved on regeneration");
});

// --- neutral fixtures + V3-4 export fold-in -----------------------------------

test("the config builders contain no firm names or banned phrase", () => {
  const v35 = extractFunction(source, "customGptConfigText")
    + extractFunction(source, "customGptInstructionsText")
    + extractFunction(source, "m365AgentManifest")
    + extractFunction(source, "m365AgentInstructionsText")
    + extractFunction(source, "buildArtifactCopyBlocks");
  assert.ok(!FIRM_NAMES.test(v35), "no firm names in the builders");
  assert.ok(!BANNED_PHRASE.test(v35), "no banned phrase in the builders");
  const { step, fill, buildRecommendedArtifactPackage } = compilerSandbox();
  fill("name", "Summarise notes");
  fill("description", "Summarise the meeting notes.");
  const pkg = buildRecommendedArtifactPackage(step, {}, { targetSurface: "customGPT" });
  assert.ok(!FIRM_NAMES.test(pkg.recommendedArtifact.copyBlocks[0].text), "built config is neutral");
});

test("V3-4 fold-in: both engineering-doc exports now record an 'exported' audit event", () => {
  assert.match(extractFunction(source, "exportWorkflowWord"), /recordExportAudit\(/,
    "exportWorkflowWord records an export");
  assert.match(extractFunction(source, "handleEngineeringExport"), /recordExportAudit\(/,
    "handleEngineeringExport records an export");
  // The audit primitive is unchanged: recordExportAudit emits the "exported" action.
  assert.match(extractFunction(source, "recordExportAudit"), /"exported"/,
    "recordExportAudit emits the exported action");
});
