// D4 (Phase 3) — the REAL-SEED INGESTION PATH. The illustrative marker drops ONLY when a genuine
// confirmed pilot discovery is supplied (validates · confirmed · hardens · not self-declared
// calibrated). Until then realConfirmedSeed stays false and every export keeps the marker — the path
// exists and is validated, but it never fabricates a real seed. Additive: the flag drives the marker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
const FPA = engine.FPA_INTAKE;

// ---- the engine: the ingestion gate ----

test("D4 — a genuine confirmed seed is ACCEPTED: realConfirmedSeed flips true, marker null", () => {
  const r = engine.ingestRealSeed(RECON);
  assert.equal(r.accepted, true, `should accept a confirmed/hardenable seed; got ${JSON.stringify(r.reasons)}`);
  assert.equal(r.realConfirmedSeed, true);
  assert.equal(r.marker, null);
});

test("D4 — a candidate marked illustrative/calibrated is REJECTED (never fake a real seed)", () => {
  const r = engine.ingestRealSeed({ ...RECON, calibrated: true });
  assert.equal(r.accepted, false);
  assert.equal(r.realConfirmedSeed, false);
  assert.equal(r.marker, engine.CALIBRATED_SEED_MARKER);
  assert.ok(r.reasons.some((x) => /illustrative|calibrated/i.test(x)));
});

test("D4 — an unconfirmed / unhardenable / empty candidate is REJECTED with a reason (no throw)", () => {
  assert.equal(engine.ingestRealSeed({ ...RECON, recap: { confirmed: false } }).realConfirmedSeed, false);
  // strip every stated time -> rests on inferred values -> cannot harden -> rejected
  const inferred = { ...RECON, steps: RECON.steps.map((s) => { const c = { ...s }; delete c.time; return c; }) };
  assert.equal(engine.ingestRealSeed(inferred).accepted, false);
  const empty = engine.ingestRealSeed(null);
  assert.equal(empty.accepted, false);
  assert.ok(empty.reasons.length > 0);
});

test("D4 — the marker is driven by the flag across EVERY export (default keeps it; accepted ingestion drops it)", () => {
  const set = [RECON, FPA];
  const flag = engine.ingestRealSeed(RECON).realConfirmedSeed; // true
  for (const fn of [engine.buildCapacityPack, engine.buildRoadmapExport, engine.buildEvidencePack]) {
    const def = fn(set), real = fn(set, { realConfirmedSeed: flag });
    assert.equal(def.illustrative, true, "default export is illustrative");
    assert.ok(def.content.includes(engine.CALIBRATED_SEED_MARKER), "default export carries the marker");
    assert.equal(real.illustrative, false, "an accepted real seed drops the illustrative flag");
    assert.ok(!real.content.includes(engine.CALIBRATED_SEED_MARKER), "an accepted real seed drops the marker");
  }
});

test("D4 — the SHIPPED default stays illustrative (no opts means the marker is present; never faked real)", () => {
  assert.equal(engine.illustrativeMarker({}), engine.CALIBRATED_SEED_MARKER);
  assert.equal(engine.illustrativeMarker(undefined), engine.CALIBRATED_SEED_MARKER);
  assert.equal(engine.illustrativeMarker({ realConfirmedSeed: true }), null);
});

// ---- the app: the ingestion path flips the flag and the marker affordance follows ----

function sandbox(state) {
  return buildSandbox(source, {
    functions: ["studioEngine", "engineIngestRealSeed", "applyRealSeed", "exportOpts", "exportProvenanceHtml", "escapeHtml"],
    globals: { window: { StudioEngine: engine }, state: state || {}, toast: () => {}, persistState: () => {} },
  });
}

test("D4 — the app starts illustrative: exportOpts flag false, the provenance marker is shown", () => {
  const sb = sandbox({ realConfirmedSeed: false });
  assert.equal(sb.exportOpts().realConfirmedSeed, false);
  assert.match(sb.exportProvenanceHtml(), /Illustrative — calibrated seed/);
});

test("D4 — applyRealSeed(real pilot) flips the flag; applyRealSeed(calibrated) does not", () => {
  const state = { realConfirmedSeed: false };
  const sb = sandbox(state);
  // a genuine confirmed pilot is accepted -> the flag flips and the marker affordance disappears
  const accepted = sb.applyRealSeed(RECON);
  assert.equal(accepted.accepted, true);
  assert.equal(state.realConfirmedSeed, true);
  assert.equal(sb.exportOpts().realConfirmedSeed, true);
  assert.equal(sb.exportProvenanceHtml(), "");
  // a calibrated candidate is rejected -> the flag goes back to false and the marker returns
  const rejected = sb.applyRealSeed({ ...RECON, calibrated: true });
  assert.equal(rejected.accepted, false);
  assert.equal(state.realConfirmedSeed, false);
  assert.match(sb.exportProvenanceHtml(), /Illustrative — calibrated seed/);
});
