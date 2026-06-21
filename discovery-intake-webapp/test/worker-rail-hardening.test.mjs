// P7 / M7 — the worker-safe rail catches Unicode/obfuscation tricks and synonyms, fails closed.
//
// Audit major: the rail blocked "headcount" and "hours saved" but missed "head count", zero-width
// characters, non-breaking hyphens, homoglyphs, and synonyms ("workforce reduction", "role
// elimination"). The fix normalizes Unicode (strip zero-width, fold dash/space/homoglyph), matches
// word-bounded banned + synonym patterns, and fails closed if the rail itself cannot run.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";

const BLOCKED = [
  // spacing / hyphenation variants of headcount
  "plan a head count review", "a head-count exercise", "headcount target",
  // zero-width space, soft hyphen, non-breaking hyphen embedded
  "head​count plan", "head­count plan", "hours‑saved this quarter",
  // homoglyphs (Cyrillic e / o)
  "hеadcount", "lay​off list",
  // synonyms / risk phrases
  "workforce reduction", "workforce optimization", "role elimination", "eliminate roles",
  "job cuts", "downsize the team", "right-size the org", "reduction in force",
  "reduce the workforce", "staff reduction", "redundancies planned",
  // the literal FTE family (word-bounded)
  "0.6 FTE freed", "cut F.T.E", "reduce FTEs",
  // the original tokens still blocked
  "reduce headcount", "lay off", "hours saved",
];

test("M7 — every obfuscation / synonym variant is BLOCKED (on a worker surface)", () => {
  for (const txt of BLOCKED) {
    const r = engine.railCheck(txt, "recipe");
    assert.equal(r.ok, false, `should be blocked: ${JSON.stringify(txt)} (normalized: ${JSON.stringify(engine.normalizeRailText(txt))})`);
  }
});

test("M7 — the banned family is blocked on EVERY surface, including the dashboard", () => {
  for (const surface of ["capture", "workbench", "recipe", "dashboard"]) {
    assert.equal(engine.railCheck("head count", surface).ok, false, `head count blocked on ${surface}`);
    assert.equal(engine.railCheck("workforce reduction", surface).ok, false, `workforce reduction blocked on ${surface}`);
  }
});

test("M7 — NO over-block: innocent words are not flagged (the old 'fte' substring bug is gone)", () => {
  for (const txt of ["a softer tone", "the drafter notes", "we lifted the value", "after the review", "ahead counting the steps", "the team gathers and drafts"]) {
    assert.equal(engine.railCheck(txt, "capture").ok, true, `should pass: ${JSON.stringify(txt)}`);
  }
});

test("M7 — normalizeRailText folds the tricks to a comparable Latin form", () => {
  assert.equal(engine.normalizeRailText("head​count"), "headcount");
  assert.equal(engine.normalizeRailText("hours‑saved"), "hours-saved");
  assert.equal(engine.normalizeRailText("hеadcount"), "headcount"); // Cyrillic e -> e
  assert.equal(engine.normalizeRailText("HEAD  COUNT"), "head count");   // case + whitespace collapse
});

test("M7 — the rail FAILS CLOSED when it cannot run (never reports ok on an internal error)", () => {
  const real = engine.RAIL.bannedPatterns;
  try {
    engine.RAIL.bannedPatterns = { forEach() { throw new Error("simulated rail failure"); } };
    const r = engine.railCheck("anything at all", "capture");
    assert.equal(r.ok, false, "a broken rail must not report ok");
    assert.equal(r.railError, true, "the failure is surfaced");
  } finally {
    engine.RAIL.bannedPatterns = real;
  }
});

test("M7 — surface families are unchanged (no regression)", () => {
  assert.equal(engine.railCheck("capacity freed this quarter", "dashboard").ok, true, "capacity ok on dashboard");
  assert.equal(engine.railCheck("capacity freed this quarter", "workbench").ok, false, "capacity off worker surfaces");
  assert.equal(engine.railCheck("cost-to-serve is a band", "recipe").ok, true, "cost ok on recipe");
  assert.equal(engine.railCheck("cost-to-serve is a band", "capture").ok, false, "cost off capture");
  assert.equal(engine.railCheck("leverage", "workbench").ok, true, "leverage ok on workbench");
  assert.equal(engine.railCheck("leverage", "capture").ok, false, "leverage off capture");
});
