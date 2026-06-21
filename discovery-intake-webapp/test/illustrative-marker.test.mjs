// D3 (Phase 2) — illustrative-data provenance on exports. Until a real confirmed seed replaces the
// calibrated/illustrative one, every export pack (capacity, evidence, roadmap) carries a visible
// "illustrative — calibrated seed, not a confirmed pilot" marker. A real-confirmed-seed flag drops it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const SET = [engine.FPA_INTAKE];
const EXPORTS = [engine.buildCapacityPack, engine.buildRoadmapExport, engine.buildEvidencePack];

test("D3 — under the calibrated seed, every export shows the marker", () => {
  for (const fn of EXPORTS) {
    const out = fn(SET);
    assert.ok(out.content.includes(engine.CALIBRATED_SEED_MARKER), `${out.filename} must show the marker`);
    assert.equal(out.illustrative, true);
  }
});

test("D3 — under a real-confirmed-seed flag, every export drops the marker", () => {
  for (const fn of EXPORTS) {
    const out = fn(SET, { realConfirmedSeed: true });
    assert.ok(!out.content.includes(engine.CALIBRATED_SEED_MARKER), `${out.filename} must NOT show the marker`);
    assert.equal(out.illustrative, false);
  }
});

test("D3 — the marker is a single shared source of truth", () => {
  assert.equal(engine.illustrativeMarker({}), engine.CALIBRATED_SEED_MARKER);
  assert.equal(engine.illustrativeMarker({ realConfirmedSeed: true }), null);
  assert.match(engine.CALIBRATED_SEED_MARKER, /Illustrative|calibrated seed/);
});

// ---- app: the flag threads from state into the exports + the visible marker ----
function sandbox(realConfirmedSeed, downloads) {
  return buildSandbox(source, {
    functions: ["studioEngine", "engineCapacityPack", "engineRoadmapExport", "engineEvidencePack", "engineLeadership", "dashboardCurrentRecords", "exportOpts", "exportProvenanceHtml", "downloadCapacityPack", "downloadRoadmap", "downloadEvidencePack", "escapeHtml"],
    globals: {
      state: { realConfirmedSeed },
      window: { StudioEngine: engine },
      dashboardModel: () => ({ records: SET }),
      downloadTextFile: (filename, content, mime) => { if (downloads) downloads.push({ filename, content }); },
      toast: () => {},
    },
  });
}

test("D3 — the app shows the provenance marker under the calibrated seed and hides it under a real seed", () => {
  assert.match(sandbox(false).exportProvenanceHtml(), /calibrated seed/);
  assert.equal(sandbox(true).exportProvenanceHtml(), "", "no marker once a real confirmed seed is loaded");
});

test("D3 — the app exports carry the marker by default and drop it when the flag is set", () => {
  const calDownloads = [];
  const cal = sandbox(false, calDownloads);
  cal.downloadCapacityPack(); cal.downloadRoadmap(); cal.downloadEvidencePack();
  assert.equal(calDownloads.length, 3);
  assert.ok(calDownloads.every((d) => d.content.includes(engine.CALIBRATED_SEED_MARKER)), "all three carry the marker");

  const realDownloads = [];
  const real = sandbox(true, realDownloads);
  real.downloadCapacityPack(); real.downloadRoadmap(); real.downloadEvidencePack();
  assert.equal(realDownloads.length, 3);
  assert.ok(realDownloads.every((d) => !d.content.includes(engine.CALIBRATED_SEED_MARKER)), "none carry the marker under a real seed");
});
