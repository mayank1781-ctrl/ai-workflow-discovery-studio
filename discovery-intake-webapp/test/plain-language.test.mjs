// C1 (Phase 3) — the PLAIN-LANGUAGE self-explaining layer. Every figure explains itself in ITS OWN
// audience's words: a worker explainer never borrows the leader's capacity/cost vocabulary (it would
// fail the worker rail), and a leadership figure explains its computation in the leader's terms.
// First-encounter explainers cover the five richer ideas (solution shape · TCO · adjacency/grouping ·
// entitlement × sensitivity · the ecosystem map). Honesty markers read in plain terms, not jargon.
// Additive: the layer is static copy + pure lookups (no numeric output changes); the surface mounts are
// guarded, so an un-explained surface is byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();

// ---- the engine: the plain-language layer is the single source of truth ----

test("C1 — the worker 'time given back' explainer exists, in worker words, with what-this-means + how-computed", () => {
  const e = engine.explainFigure("time_given_back", "worker");
  assert.ok(e, "the worker freed-capacity figure has an explainer");
  assert.equal(e.audience, "worker");
  assert.equal(e.surface, "worker");
  assert.ok(e.whatThisMeans.length > 0 && e.howComputed.length > 0);
  assert.match(`${e.label} ${e.whatThisMeans}`, /time given back/i);
});

test("C1 — the worker freed-capacity explainer is rail-clean on the worker surface (no cost / capacity / headcount / FTE)", () => {
  const e = engine.explainFigure("time_given_back", "worker");
  const text = `${e.label}. ${e.whatThisMeans} ${e.howComputed}`;
  assert.equal(engine.railCheck(text, "worker").ok, true, JSON.stringify(engine.railCheck(text, "worker").violations));
  // the rail-respecting rule, stated directly: no leader vocabulary leaks into a worker explainer
  assert.ok(!/\bcapacity\b|\bcost\b|head[\s-]*count|\bFTE\b|hours[\s-]*saved/i.test(text), `worker copy borrowed leader vocab: ${text}`);
});

test("C1 — NO worker figure explainer borrows leader vocabulary", () => {
  const dirty = engine.buildExplainers("worker").filter((e) =>
    /\bcapacity\b|\bcost\b|head[\s-]*count|\bFTE\b/i.test(`${e.label} ${e.whatThisMeans} ${e.howComputed}`));
  assert.deepEqual(dirty.map((e) => e.figureId), [], "worker explainers must stay in worker words");
});

test("C1 — a leadership figure explains its computation in the leader's terms (capacity / cost / net)", () => {
  const e = engine.explainFigure("net_capacity", "leader");
  assert.ok(e, "the leader net-capacity figure has an explainer");
  assert.equal(e.surface, "dashboard");
  assert.match(e.howComputed, /capacity|cost|net/i, "the leader explainer computes in the leader's terms");
  // and the leader surface legitimately uses capacity/cost — it passes the dashboard rail, not the worker rail
  assert.equal(engine.railCheck(`${e.whatThisMeans} ${e.howComputed}`, "dashboard").ok, true);
  assert.equal(engine.railCheck(`${e.whatThisMeans} ${e.howComputed}`, "worker").ok, false, "leader capacity/cost vocab is correctly NOT worker-safe");
});

test("C1 — every figure explainer is rail-clean for its own audience's surface (the enforced invariant)", () => {
  assert.equal(engine.explainersRailClean(), true, "the whole plain-language layer must be rail-clean per audience");
  // and per-figure, explicitly, across all three audiences
  for (const audience of engine.EXPLAINER_AUDIENCES) {
    const surface = engine.audienceSurface(audience);
    for (const e of engine.buildExplainers(audience)) {
      const text = `${e.label}. ${e.whatThisMeans} ${e.howComputed}`;
      assert.equal(engine.railCheck(text, surface).ok, true, `${audience}/${e.figureId} failed the ${surface} rail: ${text}`);
    }
  }
});

test("C1 — buildExplainers covers the real figure ids on each surface; unknown audience is empty (additive)", () => {
  assert.ok(engine.buildExplainers("worker").some((e) => e.figureId === "time_given_back"));
  assert.ok(engine.buildExplainers("leader").some((e) => e.figureId === "gross_capacity"));
  assert.ok(engine.buildExplainers("techgov").some((e) => e.figureId === "control_evidence_completeness"));
  assert.deepEqual(engine.buildExplainers("nope"), []);
});

test("C1 — first-encounter explainers exist for all five richer concepts, each rail-clean for its surface", () => {
  const ids = ["solutionShape", "tco", "adjacency", "entitlement", "ecosystem"];
  for (const id of ids) {
    const f = engine.firstEncounterExplainer(id);
    assert.ok(f, `first-encounter explainer for ${id}`);
    assert.ok(f.title && f.whatItIs && f.whyItChangesTheNumber, `${id} carries what-it-is + why-it-changes-the-number`);
    const text = `${f.title}. ${f.whatItIs} ${f.whyItChangesTheNumber}`;
    assert.equal(engine.railCheck(text, f.surface || "dashboard").ok, true, `${id} failed its rail`);
  }
  assert.equal(engine.listFirstEncounterExplainers().length, 5);
  assert.equal(engine.firstEncounterExplainer("nope"), null);
});

test("C1 — honesty markers read in plain terms (not jargon), and stay rail-clean", () => {
  const ids = ["confirmed", "inferred", "illustrative", "directional", "nDiscoveries"];
  for (const id of ids) {
    const m = engine.explainHonestyMarker(id);
    assert.ok(m, `honesty marker ${id}`);
    assert.ok(m.means.length >= 24 && /\.$/.test(m.means.trim()), `${id} is a complete plain sentence`);
    assert.ok(!/provenance|addressabilit|\btheo\b|\bn=\b|de-identif/i.test(m.means), `${id} avoids jargon`);
    assert.equal(engine.railCheck(m.means, "dashboard").ok, true, `${id} stays rail-clean`);
  }
  assert.equal(engine.plainHonestyMarkers().length, 5);
  assert.equal(engine.explainHonestyMarker("nope"), null);
});

// ---- the app: the surfaces render the engine's explainers (thin, guarded, additive) ----

function sandbox(engineImpl) {
  return buildSandbox(source, {
    consts: ["DASH"],
    functions: ["studioEngine", "escapeHtml", "engineExplainFigure", "engineFirstEncounters", "engineExplainers", "explainerNoteHtml", "plainLanguageWorkerHtml", "firstEncounterStripHtml"],
    globals: { window: { StudioEngine: engineImpl === undefined ? engine : engineImpl } },
  });
}

test("C1 — the worker view renders the plain-language note and it is rail-clean (no cost / capacity / headcount)", () => {
  const sb = sandbox();
  const html = sb.plainLanguageWorkerHtml();
  assert.match(html, /Time given back/);
  assert.match(html, /How it's computed/);
  assert.ok(!/\bcapacity\b|cost-to-serve|head[\s-]*count|\bFTE\b|hours saved/i.test(html), "worker explainer HTML must be rail-clean");
});

test("C1 — the leadership / tech-gov surfaces render all five first-encounter explainers", () => {
  const sb = sandbox();
  const html = sb.firstEncounterStripHtml();
  // escaping-safe substrings (escapeHtml turns "&" into "&amp;"): one distinctive fragment per concept
  for (const title of ["Solution shape", "Total cost of ownership", "Adjacency", "Entitlement", "Ecosystem map"]) {
    assert.ok(html.includes(title), `strip includes "${title}"`);
  }
  assert.match(html, /Why it changes the number/);
});

test("C1 — the mounts are additive: an engine without the explainer functions renders nothing", () => {
  const sb = sandbox({}); // a stub engine with none of the C1 functions
  assert.equal(sb.plainLanguageWorkerHtml(), "");
  assert.equal(sb.firstEncounterStripHtml(), "");
  assert.equal(sb.explainerNoteHtml("time_given_back", "worker"), "");
});
