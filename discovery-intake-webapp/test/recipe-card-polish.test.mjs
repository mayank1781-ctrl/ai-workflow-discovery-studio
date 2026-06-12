// Executed tests for the UX polish PR, Slice 2 — Analysis Studio headers +
// Recipe Book card fixes.
//   item 1 — session-name fallback in BOTH headers (grid tab + Recipe Book);
//   item 4 — the pattern-cell confidence % is labeled as such, not as a
//            recipe-wide "Confidence";
//   item 5 — regenerate-while-gated acknowledges the click with a toast that
//            promises nothing the gate intercepts;
//   item 6 — bare "Key:" section labels (e.g. "Pipeline:") count as metadata
//            in the WHAT-AI-DOES blurb skip, same as "Key: value" lines.
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

test("sessionNameForHeader: real session names pass, the derived placeholder doesn't", () => {
  const state = { sessionMeta: { name: "TEST B — Confirmed Gate Session" } };
  const { sessionNameForHeader } = buildSandbox(source, {
    functions: ["sessionNameForHeader"],
    globals: { state }
  });
  assert.equal(sessionNameForHeader(), "TEST B — Confirmed Gate Session");
  state.sessionMeta.name = "Untitled discovery";
  assert.equal(sessionNameForHeader(), "", "placeholder name is not a header fallback");
  state.sessionMeta.name = "   ";
  assert.equal(sessionNameForHeader(), "");
  state.sessionMeta = null;
  assert.equal(sessionNameForHeader(), "");
});

test("both Analysis Studio headers fall back to the session name before 'Untitled'", () => {
  const gridHeader = extractFunction(source, "renderAnalysisTabGrid");
  assert.ok(gridHeader.includes('grid.workflowName || sessionNameForHeader() || "Untitled Workflow"'),
    "grid-tab header: workflow name → session name → placeholder");
  const recipeHeader = extractFunction(source, "recipeWorkflowHeaderHtml");
  assert.ok(recipeHeader.includes('name || sessionNameForHeader() || when || "Untitled workflow"'),
    "Recipe Book header: workflow name → session name → timestamp → placeholder");
});

test("recipe card labels the pattern-cell confidence honestly", () => {
  const cardBuilder = extractFunction(source, "renderAnalysisTabRecipe");
  const honest = (cardBuilder.match(/Pattern confidence:/g) || []).length;
  assert.equal(honest, 2, "meta row + footer both relabeled");
  // No bare "Confidence:" label survives on the card (the value still comes
  // from recipeConfidencePct — rename, not rewire).
  assert.ok(!/[^n] [Cc]onfidence:/.test(cardBuilder.replace(/Pattern confidence:/g, "")),
    "no unqualified Confidence: label remains");
  assert.ok(cardBuilder.includes("recipeConfidencePct(step)"), "value source unchanged");
});

test("regenerate with the gate panel already up acknowledges the click", () => {
  const fn = extractFunction(source, "generateRecipePrompt");
  assert.ok(fn.includes("data-gate-generate-anyway"), "detects the panel already showing");
  const toastAt = fn.indexOf("Still gated");
  const renderAt = fn.indexOf("renderRecipeGatePanel(stepId, gate)");
  assert.ok(renderAt > -1 && toastAt > renderAt, "panel re-renders, then the toast acknowledges");
  // Settled toast rule: the copy never promises generation the gate may stop.
  const toastLine = fn.slice(toastAt, fn.indexOf("\n", toastAt));
  assert.ok(!/generat(ing|ed)/i.test(toastLine), "toast does not promise generation");
  // First-time gating stays silent (toast only fires when alreadyShowing).
  assert.ok(fn.includes("if (alreadyShowing)"), "toast is conditional on the panel being up already");
});

test("recipePromptBlurbLine: bare section labels are metadata, prose is the blurb", () => {
  const { recipePromptBlurbLine } = buildSandbox(source, { functions: ["recipePromptBlurbLine"] });
  // The reported bug: a bare "Pipeline:" line rendered as the whole blurb.
  assert.equal(
    recipePromptBlurbLine("Tier: Compliance\nPipeline:\nExtract fee breaks from the custodian file."),
    "Extract fee breaks from the custodian file.");
  // "Key: value" metadata still skips (pre-existing behavior preserved).
  assert.equal(recipePromptBlurbLine("Tier: Strategic\nSummarise the daily breaks report."),
    "Summarise the daily breaks report.");
  // A colon deeper in the sentence (prefix longer than a metadata key) is NOT
  // mistaken for metadata. (Known pre-existing trade-off, unchanged here: a
  // SHORT "Word: ..." prose opener like "Remember: ..." still skips — the
  // heuristic can't tell it from "Platform: ...".)
  assert.equal(recipePromptBlurbLine("Reconcile the custodian file against the ledger: flag breaks."),
    "Reconcile the custodian file against the ledger: flag breaks.");
  // All-metadata prompt yields "" so recipeWhatAiDoes falls through to the
  // derived blurb.
  assert.equal(recipePromptBlurbLine("Tier: Compliance\nPipeline:\nPlatform: ChatGPT"), "");
  assert.equal(recipePromptBlurbLine(""), "");
  // And the card path actually uses the helper.
  assert.ok(extractFunction(source, "recipeWhatAiDoes").includes("recipePromptBlurbLine(prompt)"),
    "recipeWhatAiDoes routes through the shared helper");
});
