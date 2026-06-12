// Executed tests for PR 36 — ledger + hybrid. This file accumulates the PR's
// structural pins, slice by slice.
//
// Slice A — dead-code sweep. Everything removed here was a ghost: render
// functions no-oping against hosts that exist nowhere in index.html, server
// routes with zero client callers, and helpers whose only call sites were
// inside those ghosts. Pinned ABSENT so none of it quietly returns. The
// deliberately-KEPT remainder is also pinned: the evidence-draft machinery
// (els.evidenceNoteInput + state.evidenceWorkbench) stays until its own
// findings pass — it interlocks with Discovery dictation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, readServerSource } from "./helpers/extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readAppSource();
const serverSource = readServerSource();
const indexHtml = readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("Slice A: the dead surfaces are gone from app.js, server.mjs, and the render pipeline", () => {
  // Client: ghost render functions + their transitively-orphaned helpers.
  for (const fn of [
    "renderAiMirror", "handleAiMirrorRefresh",
    "renderSessionLibrary", "renderSessionControls", "sessionLibraryCard",
    "duplicateSavedSession", "deleteSessionFromLibrary",
    "renderEvidenceWorkbench", "renderEvidenceReviewPanel",
    "evidenceWorkbenchMetricsHtml", "evidenceArtifactCard"
  ]) {
    assert.ok(!new RegExp(`function ${fn}\\b`).test(source), `${fn} removed`);
    assert.ok(!new RegExp(`\\b${fn}\\(`).test(source), `no surviving call sites for ${fn}`);
  }
  // Ghost host lookups and the dead workbench-tab routing value.
  assert.ok(!source.includes("sessionLibraryList"), "ghost #sessionLibraryList lookup gone");
  for (const id of ["evidenceWorkbenchFull", "evidenceWorkbenchMetrics", "evidenceReviewPanel"]) {
    assert.ok(!source.includes(`getElementById("${id}")`), `ghost #${id} lookup gone`);
    assert.ok(!indexHtml.includes(`id="${id}"`), `#${id} confirmed absent from index.html`);
  }
  assert.ok(!/activeWorkbenchTab = "library"/.test(source), 'no assignment routes to the dead "library" tab');

  // Server: dead routes and their handlers.
  assert.ok(!serverSource.includes("/api/ai-mirror"), "/api/ai-mirror route gone");
  assert.ok(!serverSource.includes("/api/pattern-handoff"), "/api/pattern-handoff route gone");
  assert.ok(!/function handleAiMirror\b|function handlePatternHandoff\b/.test(serverSource), "handlers gone");

  // The deliberately-kept remainder (scope line for the follow-up findings
  // pass): draft machinery still present, still null-guarded.
  assert.ok(source.includes("state.evidenceWorkbench"), "evidence-draft state kept (own findings pass later)");
});
