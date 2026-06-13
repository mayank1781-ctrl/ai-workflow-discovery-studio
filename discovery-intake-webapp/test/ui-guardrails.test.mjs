// Phase 3 — lock down the CLAUDE.md UI guardrails that the audit confirmed:
//   * toast() is used, never showToast();
//   * the primary product-action buttons are never hard-disabled at rest — each
//     stays clickable and its handler toast-guards + returns;
//   * the DOCX/recipe export buttons re-enable at rest after their transient
//     in-flight busy state.
//
// These are source-level regression guards: they keep the established pattern
// from regressing into "dead" precondition-locked buttons. (The media start/stop
// toggles in index.html are a deliberate state-machine exception and are out of
// scope here.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// The full <button ...> opening tag that contains a given marker substring.
function buttonTagsContaining(src, marker) {
  const tags = [];
  let from = 0;
  for (;;) {
    const idx = src.indexOf(marker, from);
    if (idx === -1) break;
    const start = src.lastIndexOf("<button", idx);
    const end = src.indexOf(">", idx);
    if (start !== -1 && end !== -1) tags.push(src.slice(start, end + 1));
    from = idx + marker.length;
  }
  return tags;
}

const PRIMARY_ACTION_MARKERS = [
  "data-artifact-compile=",   // Compile recommended package
  "data-artifact-bundle=",    // Generate full bundle
  "data-recipe-generate=",    // Generate / Regenerate prompt
  "data-bc-compute"           // Compute / Recompute business case
];

test("toast() is used, never showToast()", () => {
  assert.ok(!/\bshowToast\s*\(/.test(source), "showToast() must never be used");
  assert.ok(/\btoast\s*\(/.test(source), "toast() is the notification primitive");
});

test("primary product-action buttons are never hard-disabled at rest", () => {
  for (const marker of PRIMARY_ACTION_MARKERS) {
    const tags = buttonTagsContaining(source, marker);
    assert.ok(tags.length > 0, `expected to find the ${marker} button`);
    for (const tag of tags) {
      assert.ok(!/\bdisabled\b/.test(tag), `${marker} button must not be hard-disabled at rest: ${tag}`);
    }
  }
});

test("primary action handlers toast-guard and return instead of relying on a disabled state", () => {
  const compile = extractFunction(source, "compileArtifactForStep");
  assert.ok(compile.includes("toast(") && /\breturn\b/.test(compile),
    "compileArtifactForStep toast-guards the empty case and returns");

  const businessCase = extractFunction(source, "computeBusinessCaseNow");
  assert.ok(businessCase.includes("toast(") && /\breturn\b/.test(businessCase),
    "computeBusinessCaseNow toast-guards the empty case and returns");

  const generate = extractFunction(source, "generateRecipePrompt");
  assert.ok(generate.includes("toast(") && /\breturn\b/.test(generate),
    "generateRecipePrompt acknowledges the gated click with a toast and returns");
});

test("the export buttons re-enable at rest after their in-flight busy state", () => {
  for (const fn of ["syncRecipeExportButton", "syncEngineeringExportButton"]) {
    const src = extractFunction(source, fn);
    assert.ok(/disabled\s*=\s*false/.test(src), `${fn} re-enables the button at rest`);
  }
});
