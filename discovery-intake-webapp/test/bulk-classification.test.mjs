// Executed tests for PR 33 Slice 3 — Portfolio bulk classification review.
// The verified labeled set (for PR 35) is built by promoting patterns to USER
// provenance through patchField — never by editing stored JSON. These tests
// exercise the real write path (applyPatternEdit + patchField) the bulk handlers
// reuse, plus the verified-state reader, and pin steer 3 structurally: every
// cross-session write goes through load -> patchField -> save. Real shipped
// source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readAppSource();
const indexHtml = readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function bulkSandbox() {
  const state = { questionHistory: [], workflowGrid: { workflowFamily: "", steps: [] } };
  const fns = buildSandbox(source, {
    consts: ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"],
    functions: [
      "bulkReviewVerifiedPattern",
      "applyPatternEdit",
      "stepPrimaryPattern",
      "stepPatternList",
      "patchField",
      "ensureCellLog",
      "newLedgerEntry",
      "projectCellLedgerDetailed",
      "projectCellLedger",
      "getField",
      "deriveLegacyCellSource",
      "newGridStep",
      "newGridCell",
      "makeId"
    ],
    globals: { state, console: { info: () => {}, warn: () => {}, error: () => {} }, currentGridStep: () => null }
  });
  return { ...fns, state };
}

test("bulkReviewVerifiedPattern: only user provenance counts as verified", () => {
  const { bulkReviewVerifiedPattern } = bulkSandbox();
  const withSource = (source) => ({ cells: { aiPattern: { value: [{ pattern: "Extract", confidence: 1 }], source } } });
  assert.equal(bulkReviewVerifiedPattern(withSource("user-edited")), true);
  assert.equal(bulkReviewVerifiedPattern(withSource("user-stated")), true);
  assert.equal(bulkReviewVerifiedPattern(withSource("ai-inferred")), false);
  assert.equal(bulkReviewVerifiedPattern(withSource("doc-extracted")), false);
  assert.equal(bulkReviewVerifiedPattern({ cells: {} }), false, "no pattern cell is unverified");
  assert.equal(bulkReviewVerifiedPattern(null), false);
});

test("confirm promotes an ai-inferred pattern to verified without changing the label", () => {
  const { applyPatternEdit, bulkReviewVerifiedPattern, stepPrimaryPattern, patchField, getField, newGridStep } = bulkSandbox();
  const step = newGridStep();
  // Seed an AI-inferred pattern, as extraction would.
  patchField(step, "meta", "aiPattern", [{ pattern: "Extract", confidence: 0.6 }], "ai-inferred", 0.6);
  assert.equal(bulkReviewVerifiedPattern(step), false, "ai-inferred is unverified");

  // Confirm = re-apply the SAME primary pattern at user-edited provenance.
  const pattern = stepPrimaryPattern(step);
  assert.equal(pattern, "Extract");
  assert.equal(applyPatternEdit(step, pattern), true, "confirm upgrades provenance");
  const cell = getField(step, "meta", "aiPattern");
  assert.equal(cell.value[0].pattern, "Extract", "label is unchanged by confirm");
  assert.equal(cell.source, "user-edited");
  assert.equal(bulkReviewVerifiedPattern(step), true, "now verified");
});

test("correcting a pattern across sessions writes user-edited and never downgrades", () => {
  const { applyPatternEdit, bulkReviewVerifiedPattern, patchField, getField, newGridStep } = bulkSandbox();
  const step = newGridStep();
  patchField(step, "meta", "aiPattern", [{ pattern: "Generate", confidence: 0.5 }], "ai-inferred", 0.5);
  // Correct it to a different pattern — this is the applyBulkPatternEdit write.
  assert.equal(applyPatternEdit(step, "Classify"), true);
  assert.equal(getField(step, "meta", "aiPattern").value[0].pattern, "Classify");
  assert.equal(bulkReviewVerifiedPattern(step), true);
  // A later AI re-extraction must NOT clobber the user's verified correction.
  assert.equal(patchField(step, "meta", "aiPattern", [{ pattern: "Generate", confidence: 0.9 }], "ai-inferred", 0.9), false,
    "lower provenance refused over a verified label");
  assert.equal(getField(step, "meta", "aiPattern").value[0].pattern, "Classify", "verified label survives");
});

test("steer 3 structurally: cross-session writes go through load -> patchField -> save, never raw JSON", () => {
  const commit = extractFunction(source, "commitCrossSessionClassification");
  // Loads the saved state and saves it back through the normal save funcs.
  assert.ok(commit.includes("getSessionStateById("), "loads the saved session state");
  assert.ok(commit.includes("saveSessionToLibrary(") && commit.includes("saveSessionToServer("), "saves through the normal funcs");
  // It must NOT hand-roll a stored-JSON edit.
  assert.ok(!/JSON\.parse|\.replace\(/.test(commit), "no raw stored-JSON manipulation in the commit path");

  // The pattern correction goes through applyPatternEdit (which is patchField).
  const patternEdit = extractFunction(source, "applyBulkPatternEdit");
  assert.ok(patternEdit.includes("commitCrossSessionClassification(") && patternEdit.includes("applyPatternEdit("),
    "pattern edits route through the commit path + patchField-backed applyPatternEdit");

  // Confirm-all only promotes already-present, unverified patterns.
  const confirmAll = extractFunction(source, "confirmBulkSessionPatterns");
  assert.ok(confirmAll.includes("bulkReviewVerifiedPattern(") && confirmAll.includes("applyPatternEdit("),
    "confirm-all guards on verified state and writes via applyPatternEdit");
  assert.ok(applyPatternEditIsPatchField(source), "applyPatternEdit is a patchField user-edited write");
});

function applyPatternEditIsPatchField(source) {
  const fn = extractFunction(source, "applyPatternEdit");
  return fn.includes("patchField(") && fn.includes('"user-edited"');
}

// The re-land regression test: Slice 3 originally mounted the panel on
// #sessionLibraryList — an id that exists NOWHERE in index.html, so
// renderSessionLibrary bailed on its null-host guard and the panel rendered
// nothing. This pins the mount to a host id that actually exists in the
// shipped HTML, so a future re-mount onto a ghost host fails the suite.
test("review panel mounts on a host that exists in index.html, above the summary strip, collapsed", () => {
  const mountFn = extractFunction(source, "renderSavedSessionsPanel");

  // The mount function's host id must be present in index.html.
  const hostIds = [...mountFn.matchAll(/document\.getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(hostIds.includes("savedSessionsPanel"), "panel mounts via #savedSessionsPanel");
  for (const id of hostIds) {
    assert.ok(indexHtml.includes(`id="${id}"`), `host #${id} must exist in index.html — a missing id makes the render a silent no-op`);
  }

  // The panel is built and wired by the SAME function that owns the live host,
  // ordered above the summary strip.
  assert.ok(mountFn.includes("head + bulkClassificationReviewHtml() + summaryStrip"),
    "review panel renders between the header and the summary strip");
  assert.ok(mountFn.includes("wireBulkClassificationReview("), "handlers wired where the panel mounts");

  // Collapsed by default: the <details> ships without an open attribute (open
  // state is only restored across rerenders, never the initial render).
  const builder = extractFunction(source, "bulkClassificationReviewHtml");
  assert.ok(builder.includes("<details data-bulk-review"), "panel details is tagged for open-state restore");
  assert.ok(!/<details[^>]*\bopen\b/.test(builder), "panel is collapsed by default");

  // And the dead legacy path is GONE (PR 36 Slice A removed renderSessionLibrary
  // and its ghost #sessionLibraryList host outright — pinned absent so it can't
  // quietly return).
  assert.ok(!/function renderSessionLibrary\b/.test(source), "dead renderSessionLibrary removed");
  assert.ok(!source.includes("sessionLibraryList"), "ghost #sessionLibraryList lookup removed");
});
