// C3 (Phase 2) — the Leadership dashboard. AI/Hybrid/Human mix, the two gap tiles + remedies, cross-
// group sequencing, the collective heatmap (n + confidence, graceful under low n), the realization
// uplift headline, role redefinition, honest-under-pressure, and two real exports (capacity pack +
// Land→Expand→Retain roadmap). Engine-computed; app delegates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
const FPA = engine.FPA_INTAKE;
const tech = { ...RECON, header: { ...RECON.header, dept: "Technology", anchor: "tech-wf" }, steps: RECON.steps.map((s) => ({ ...s, data: "internal" })), confirm: { ...RECON.confirm, dataTier: "internal" } };
const credit = { ...RECON, header: { ...RECON.header, dept: "Credit Risk", anchor: "credit-wf" } };
const SET = [tech, credit];

test("C3 — AI/Hybrid/Human mix shows where the line sits", () => {
  const mix = engine.buildAiHybridHumanMix(SET);
  assert.ok(mix.ai + mix.hybrid + mix.human >= 99);
  assert.match(mix.whereTheLineSits, /AI carries/);
});

test("C3 — a policy-blocked + weak-economics workflow shows the policy gap tile RED regardless of economics", () => {
  // MNPI on every step → high policy gap AND weak economics; the policy tile must still be red
  const weak = { ...FPA, steps: FPA.steps.map((s) => ({ ...s, data: "MNPI" })) };
  const tiles = engine.buildGapTiles([weak]);
  assert.equal(tiles.policy.status, "red");
  assert.ok(tiles.policy.remedy && /governance/.test(tiles.policy.remedy));
});

test("C3 — cross-group sequencing builds low-gap now, runs governance high-gap in parallel (computed)", () => {
  const seq = engine.buildCrossGroupSequencing(SET);
  assert.equal(seq.sequence.length, 2);
  assert.match(seq.sequence[0].move, /build now/);
  assert.match(seq.note, /governance track/);
});

test("C3 — the collective heatmap marks a cell with <3 discoveries directional/low-confidence", () => {
  const pool = engine.buildPooledLibrary([RECON, RECON]); // de-identified, each role n behind it
  const heat = engine.buildCollectiveHeatmap(pool);
  assert.ok(heat.rows.length >= 1);
  for (const r of heat.rows) {
    if (r.n < 3) { assert.equal(r.confidence, "directional"); assert.equal(r.lowConfidence, true); }
  }
});

test("C3 — the realization uplift is computed from the rung (a higher rung gives a bigger uplift)", () => {
  const base = engine.realizationUplift(SET);
  const higher = engine.realizationUplift(SET, { targetRealizationFactor: 0.95 });
  assert.ok(base.upliftDollars > 0);
  assert.ok(higher.upliftDollars > base.upliftDollars, "a higher rung → more uplift (computed, not constant)");
});

test("C3 — role redefinition spans individual → team → department; honest-under-pressure discloses", () => {
  const rr = engine.buildRoleRedefinition(SET);
  assert.ok(rr.individual.length >= 1 && /coverage/.test(rr.team) && /capability/.test(rr.department));
  const honest = engine.buildHonestUnderPressure(SET);
  assert.ok(honest.excludedDecisionSteps > 0 && honest.disclosures.length >= 4 && honest.tcoPayback);
});

test("C3 — both exports produce real files (capacity pack + roadmap)", () => {
  const pack = engine.buildCapacityPack(SET);
  assert.equal(pack.filename, "capacity-pack.md");
  assert.ok(pack.content.length > 0 && /capacity/i.test(pack.content));
  const roadmap = engine.buildRoadmapExport(SET);
  assert.equal(roadmap.filename, "land-expand-retain-roadmap.md");
  assert.match(roadmap.content, /Land -> Expand -> Retain/);
  assert.match(roadmap.content, /build now|governance track/);
});

// ---- app: the render + the real downloads ----
function sandbox(downloads) {
  return buildSandbox(source, {
    functions: ["studioEngine", "engineLeadership", "engineRailGuardCollective", "engineCapacityPack", "engineRoadmapExport", "enginePooledLibrary", "leadershipSectionsHtml", "dashboardCurrentRecords", "downloadCapacityPack", "downloadRoadmap", "escapeHtml"],
    globals: {
      window: { StudioEngine: engine },
      DASH: { faint: "#888", panel: "#111", line: "#222", ink: "#eee", dim: "#aaa" },
      dashboardModel: () => ({ records: SET }),
      downloadTextFile: (filename, content, mime) => { if (downloads) downloads.push({ filename, content, mime }); },
      toast: () => {},
    },
  });
}

test("C3 — the leadership sections render the mix, gap tiles, sequencing, heatmap; exports download real files", () => {
  const downloads = [];
  const sb = sandbox(downloads);
  const html = sb.leadershipSectionsHtml(SET, {});
  assert.match(html, /where the line sits/);
  assert.match(html, /gap/);
  assert.match(html, /Sequencing/);
  assert.match(html, /capacity pack/i);
  // real downloads
  assert.equal(sb.downloadCapacityPack(), true);
  assert.equal(sb.downloadRoadmap(), true);
  assert.equal(downloads.length, 2);
  assert.deepEqual(downloads.map((d) => d.filename).sort(), ["capacity-pack.md", "land-expand-retain-roadmap.md"]);
});
