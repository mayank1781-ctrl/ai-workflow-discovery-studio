// E6 — Recipe library flip + enriched seed. The two-tier flip (library match -> origin
// "library", else generation) already exists (Step L) and is covered by recipe-library-seed.test;
// here we cover the ENRICHED seed schema (the 7-field spec incl modelFit, the E1 3-dim seams,
// lifecycle), the reconciliation of match-signals to the new seam dims, and the honesty rail
// (no example/unconfirmed entry ever presented as confirmed).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = JSON.parse(readFileSync(path.join(__dirname, "..", "recipe-library-seed.json"), "utf8"));
const SPEC_FIELDS = ["goal", "context", "constraints", "acceptanceCriteria", "decomposition", "escalation", "modelFit"];

function matchSandbox() { return buildSandbox(source, { consts: ["LIBRARY_LEVERAGE_RANK"], functions: ["matchLibraryRecipes"] }); }
function sourceSandbox(libraryEntries, shape, recipeCache = {}) {
  return buildSandbox(source, {
    consts: ["LIBRARY_LEVERAGE_RANK"],
    functions: ["recipeUnitSource", "matchLibraryRecipes"],
    globals: { recipeLibrarySeed: libraryEntries, recipeUnitShape: () => shape, state: { recipeCache } },
  });
}

test("the shipped seed is ENRICHED: every entry carries the 7-field spec + lifecycle; connection/span carry the 3-dim seam read", () => {
  assert.ok(Array.isArray(SEED.entries) && SEED.entries.length === 12, "12 entries");
  for (const e of SEED.entries) {
    assert.ok(e.spec && typeof e.spec === "object", `${e.id} has a spec`);
    for (const f of SPEC_FIELDS) assert.ok(f in e.spec, `${e.id}.spec has ${f}`);
    assert.ok(Array.isArray(e.spec.decomposition) && e.spec.decomposition.length > 0, `${e.id}.spec.decomposition is a list`);
    assert.match(e.spec.modelFit, /tier|cost-to-serve/i, `${e.id}.spec.modelFit names model-fit / cost-to-serve`);
    assert.equal(e.lifecycle, "captured", `${e.id} lifecycle is captured (confirmed:false)`);
    if (e.unit_kind === "connection" || e.unit_kind === "span") {
      assert.ok(e.seam_dims && ["low", "medium", "high"].includes(e.seam_dims.friction) && ["low", "medium", "high"].includes(e.seam_dims.latency) && ["low", "medium", "high"].includes(e.seam_dims.criticality), `${e.id} has 3-dim seam_dims`);
    }
  }
});

test("HONESTY rail: every entry ships confirmed:false / source:example; _meta documents the example status; nothing is presented as confirmed", () => {
  for (const e of SEED.entries) { assert.equal(e.confirmed, false, `${e.id} confirmed:false`); assert.equal(e.source, "example", `${e.id} source:example`); }
  assert.match(SEED._meta.provenance_warning, /confirmed:false on purpose|never present|real confirm-pass/i);
  assert.ok(SEED._meta.edition_2_enrichment, "the _meta documents the enriched schema");
});

test("the flip ranks library matches by leverage and CARRIES the enriched fields (spec / seamDims / lifecycle) through the match", () => {
  const shape = { kind: "connection", motivators: ["manual-channel", "system-switching"], humanHeld: false, latency: "medium", criticality: "medium", toolTokens: ["erp", "ledger"] };
  const fits = matchSandbox().matchLibraryRecipes(shape, SEED.entries);
  assert.ok(fits.length >= 1, "the shape fits at least one seed entry");
  assert.equal(fits[0].id, "seam-export-reconcile", "best fit is the hi-leverage, most-specific match");
  // ranked by leverage (hi before md before lo)
  const rank = { hi: 3, md: 2, lo: 1 };
  for (let i = 1; i < fits.length; i += 1) assert.ok(rank[fits[i - 1].leverage] >= rank[fits[i].leverage], "ranked by leverage");
  // enriched fields round-trip through the matcher, inferred until confirmed
  assert.ok(fits[0].spec && SPEC_FIELDS.every((f) => f in fits[0].spec), "the 7-field spec rides through");
  assert.ok(fits[0].seamDims && fits[0].seamDims.criticality, "the 3-dim seam read rides through");
  assert.equal(fits[0].lifecycle, "captured");
  assert.equal(fits[0].confirmed, false, "never presented as confirmed");
});

test("reconciled match-signals: the E1 seam dims gate a fit (latency mismatch fails the entry)", () => {
  const sb = matchSandbox();
  const entry = SEED.entries.find((e) => e.id === "seam-export-reconcile"); // match.latency: "medium"
  const fit = { kind: "connection", motivators: ["manual-channel", "system-switching"], humanHeld: false, latency: "medium", toolTokens: ["erp"] };
  const miss = { ...fit, latency: "high" };
  assert.equal(sb.matchLibraryRecipes(fit, [entry]).length, 1, "latency medium matches");
  assert.equal(sb.matchLibraryRecipes(miss, [entry]).length, 0, "latency high fails the medium-only entry");
});

test("recipeUnitSource: a matching shape returns origin:library + the enriched seed (confirmed:false); a non-match falls to generation; no seed => unchanged", () => {
  const shape = { kind: "connection", motivators: ["manual-channel", "system-switching"], humanHeld: false, latency: "medium", criticality: "medium", toolTokens: ["erp", "ledger"] };
  const lib = sourceSandbox(SEED.entries, shape).recipeUnitSource("h:s1>s2");
  assert.equal(lib.origin, "library");
  assert.equal(lib.confirmed, false, "the shipped example never auto-hardens to confirmed");
  assert.ok(lib.seed && lib.seed.spec && lib.seed.seamDims && lib.seed.lifecycle === "captured", "the library unit surfaces the enriched seed");

  const noFitShape = { kind: "step", stepType: "review", humanHeld: false, toolTokens: [] };
  const gen = sourceSandbox(SEED.entries, noFitShape, { "h:s1>s2": "generated recipe" }).recipeUnitSource("h:s1>s2");
  assert.equal(gen.origin, "generation", "a non-match falls through to generation");

  const noSeed = sourceSandbox([], shape, { "h:s1>s2": "generated recipe" }).recipeUnitSource("h:s1>s2");
  assert.equal(noSeed.origin, "generation", "with no seed, behavior is the generation path (byte-identical to today)");
});
