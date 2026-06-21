// P1 / B1 — FAIL CLOSED when the Studio engine can't load.
//
// The audit blocker: the engine is the single source of truth for the figures AND the
// surface-aware safety rails, but the browser failed to import it (.mjs MIME bug). The app's
// railCheck then returned `{ ok: true, engineMissing: true }` — a silent fake-OK that let
// un-verified vocabulary through and left the dashboard "loading" with no error. These tests
// pin the rule that a missing engine is an ERROR STATE, never a pass.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readAppSource();

// Build the rail in a sandbox with NO window.StudioEngine — simulates the engine failing to load.
function noEngineSandbox() {
  return buildSandbox(source, {
    functions: ["studioEngine", "studioEngineReady", "railCheck"],
    globals: { window: {}, globalThis: {} },
  });
}

test("B1 — with the engine unloaded, railCheck FAILS CLOSED (never a silent ok)", () => {
  const sb = noEngineSandbox();
  assert.equal(sb.studioEngineReady(), false, "engine reads as not-loaded");

  for (const [text, surface] of [
    ["capacity freed this quarter", "dashboard"],
    ["a perfectly innocuous worker line", "capture"],
    ["cost-to-serve is a band", "recipe"],
    ["", "workbench"],
  ]) {
    const r = sb.railCheck(text, surface);
    assert.equal(r.ok, false, `rail must NOT report ok with no engine (${surface})`);
    assert.equal(r.engineMissing, true, "the reason is surfaced, not hidden");
    assert.ok(Array.isArray(r.violations) && r.violations.length >= 1, "a violation is recorded");
    assert.equal(r.violations[0].rule, "engine-unavailable", "the violation names the engine being down");
  }
});

test("B1 — with the engine loaded, railCheck delegates and can return ok (no over-block)", () => {
  // A minimal stand-in engine: proves the wrapper only fails closed when the engine is ABSENT.
  const fakeEngine = { railCheck: (t, s) => ({ ok: true, violations: [], surface: s }) };
  const sb = buildSandbox(source, {
    functions: ["studioEngine", "studioEngineReady", "railCheck"],
    globals: { window: { StudioEngine: fakeEngine }, globalThis: {} },
  });
  assert.equal(sb.studioEngineReady(), true);
  assert.equal(sb.railCheck("anything", "dashboard").ok, true, "delegates to the loaded engine");
});

test("B1 — the engineMissing branch no longer hard-codes ok:true (source guard)", () => {
  // Belt-and-suspenders: the regression cannot silently return if someone re-edits the wrapper.
  const m = source.match(/function railCheck\(text, surface\) \{[\s\S]*?\n\}/);
  assert.notEqual(m, null, "railCheck wrapper found");
  assert.doesNotMatch(m[0], /ok:\s*true,\s*violations:\s*\[\],\s*engineMissing:\s*true/, "the fake-OK engineMissing pass is gone");
  assert.match(m[0], /ok:\s*false/, "the engineMissing branch fails closed");
});

test("B1 — index.html surfaces a visible error state on engine-load failure (no silent catch)", () => {
  const html = readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  // The module-import catch must invoke the visible error handler, not just console.warn.
  assert.match(html, /onStudioEngineError/, "the import catch raises a visible error handler");
  assert.doesNotMatch(html, /console\.warn\("Studio engine failed to load; engine-backed figures are unavailable\./, "the old silent warn-only catch is gone");
  // app.js renders a non-dismissable alert banner from that handler.
  assert.match(source, /onStudioEngineError\s*=\s*function/, "app.js defines the visible error handler");
  assert.match(source, /engine-load-error/, "a visible error banner element is mounted");
  assert.match(source, /role.\s*,\s*.alert./, "the error banner is announced to assistive tech");
});
