// Executed tests for the UX polish PR, Slice 1 — Saved Sessions popup.
// Pins three behaviors:
//   item 2 — stray containment: the list-visibility rule for zero-step
//            "Untitled discovery" sessions, AND the persistState guard that
//            stops auto-saving contentless sessions (the localStorage
//            current-state write must stay unconditional);
//   item 3 — the dim overlay's CSS targets an id that really exists in
//            index.html (the ghost-host lesson, applied to a selector);
//   item 8 — the review panel's search + unverified-only filter logic, and
//            that filters hide blocks without unmounting the panel controls.
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readAppSource();
const indexHtml = readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const futureCss = readFileSync(path.join(__dirname, "..", "future.css"), "utf8");

test("savedSessionVisibleInList: zero-step strays hide, named or stepped sessions stay", () => {
  const { savedSessionVisibleInList } = buildSandbox(source, { functions: ["savedSessionVisibleInList"] });
  // The stray shape: zero steps, derived placeholder name.
  assert.equal(savedSessionVisibleInList({ stepCount: 0, name: "Untitled discovery" }), false);
  assert.equal(savedSessionVisibleInList({ name: "Untitled discovery" }), false, "missing stepCount counts as zero");
  assert.equal(savedSessionVisibleInList({ stepCount: 0, name: "" }), false);
  assert.equal(savedSessionVisibleInList(null), false);
  // Any captured step keeps a session visible regardless of name.
  assert.equal(savedSessionVisibleInList({ stepCount: 4, name: "Untitled discovery" }), true);
  // A deliberately saved empty session with a real name stays loadable.
  assert.equal(savedSessionVisibleInList({ stepCount: 0, name: "Fee recon — to flesh out" }), true);
  assert.equal(savedSessionVisibleInList({ stepCount: 0, workflowName: "Client fee reconciliation" }), true);
});

test("the Open-popup list and its count badge run through the visibility rule", () => {
  const panelFn = extractFunction(source, "renderSavedSessionsPanel");
  assert.ok(panelFn.includes(".filter(savedSessionVisibleInList)"), "session list filters through the rule");
  assert.ok(panelFn.includes("hiddenCount"), "hidden strays are counted, not silently dropped");
  // The badge reads the FILTERED list length (sessions), not the raw library.
  const badgeWrite = panelFn.match(/countBadge\.textContent = String\((\w+)\.length\)/);
  assert.ok(badgeWrite, "count badge writes a list length");
  assert.equal(badgeWrite[1], "sessions", "badge counts visible sessions");
});

test("persistState: contentless sessions never auto-save to library/server; current-state write is unconditional", () => {
  const fn = extractFunction(source, "persistState");
  const localWrite = fn.indexOf("localStorage.setItem(CURRENT_STATE_KEY");
  const guard = fn.indexOf("sessionHasContent()");
  const libSave = fn.indexOf("saveSessionToLibrary(");
  const serverSync = fn.indexOf("scheduleServerSessionSave(");
  assert.ok(localWrite > -1 && guard > -1 && libSave > -1 && serverSync > -1, "all four statements present");
  assert.ok(localWrite < guard, "refresh-recovery localStorage write happens BEFORE the guard");
  assert.ok(guard < libSave && guard < serverSync, "library + server sync sit behind the content guard");
  assert.match(fn, /if \(!sessionHasContent\(\)\) return;/, "guard is an early return on no content");
});

test("dim overlay CSS targets the real Open-menu id and lifts the topbar above the dim", () => {
  // The selector's anchor id must exist in shipped HTML — a renamed/removed id
  // would silently kill the overlay (the ghost-host lesson, CSS edition).
  assert.ok(indexHtml.includes('id="openSessionsMenu"'), "#openSessionsMenu exists in index.html");
  assert.ok(/body:has\(#openSessionsMenu\[open\]\)::before/.test(futureCss), "overlay rule present");
  assert.ok(/body:has\(#openSessionsMenu\[open\]\) \.session-topbar/.test(futureCss), "topbar lift rule present");
  assert.ok(/class="[^"]*\bsession-topbar\b[^"]*"/.test(indexHtml), "the lifted topbar class exists in index.html");
});

test("bulkReviewSessionVisible: search matches names, unverified-only hides fully-verified sessions", () => {
  const { bulkReviewSessionVisible } = buildSandbox(source, {
    functions: ["bulkReviewSessionVisible", "bulkReviewNameMatches"]
  });
  // Search: case-insensitive substring; empty term matches everything.
  assert.equal(bulkReviewSessionVisible("Client fee reconciliation", 0, 3, false, "FEE"), true);
  assert.equal(bulkReviewSessionVisible("Client fee reconciliation", 0, 3, false, "payroll"), false);
  assert.equal(bulkReviewSessionVisible("Client fee reconciliation", 0, 3, false, "   "), true);
  // Unverified-only: fully verified hides, partially verified stays.
  assert.equal(bulkReviewSessionVisible("A", 3, 3, true, ""), false, "all verified → hidden");
  assert.equal(bulkReviewSessionVisible("A", 2, 3, true, ""), true, "work remaining → visible");
  // No captured patterns yet still needs classification — stays visible.
  assert.equal(bulkReviewSessionVisible("A", 0, 0, true, ""), true);
  // Both filters compose.
  assert.equal(bulkReviewSessionVisible("Client fees", 1, 3, true, "fees"), true);
  assert.equal(bulkReviewSessionVisible("Client fees", 3, 3, true, "fees"), false);
});

test("review panel: filters hide blocks but never unmount the controls; totals stay library-wide", () => {
  const builder = extractFunction(source, "bulkClassificationReviewHtml");
  // The empty-panel early return keys on classifiable sessions (pre-filter),
  // so an over-narrow search can't make the search box itself disappear.
  assert.ok(builder.includes("if (!classifiableCount) return"), "early return is pre-filter");
  assert.ok(builder.includes("No sessions match the current filter."), "filtered-empty message renders instead");
  assert.ok(builder.includes("bulkReviewSearchInput") && builder.includes("bulkReviewUnverifiedToggle"), "both controls render");
  // Totals accumulate before the filter drops a block (the summary line keeps
  // describing the whole library): the loaded-session filter call sits after
  // the verifiedBadge computation in source order.
  const badgeAt = builder.indexOf("const verifiedBadge");
  const filterAt = builder.indexOf("bulkReviewSessionVisible(name, sessionVerified");
  assert.ok(badgeAt > -1 && filterAt > badgeAt, "filter applies after totals accumulate");
  // And the wiring re-renders through the same panel function.
  const wiring = extractFunction(source, "wireBulkClassificationReview");
  assert.ok(wiring.includes("bulkReviewSearchTerm = searchInput.value"), "search writes module state");
  assert.ok(wiring.includes("bulkReviewUnverifiedOnly = Boolean(unverifiedToggle.checked)"), "toggle writes module state");
});
