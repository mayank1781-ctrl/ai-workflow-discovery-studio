// D2 (Phase 2) — the rail extends to the collective / aggregate surfaces and FAILS CLOSED. The
// collective heatmap + leadership aggregate text is the highest-risk place for "leverage" to drift into
// "headcount reduction"; the Phase-1 hardened rail (Unicode-folded, synonym-aware) runs over every
// aggregate string and refuses to render if any carries banned vocab — or if the rail itself can't run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;

test("D2 — headcount / cut / workforce-reduction vocab is BLOCKED on the collective surface", () => {
  assert.equal(engine.railGuardCollective(["reduce headcount across the team"], "dashboard").ok, false);
  assert.equal(engine.railGuardCollective(["workforce reduction plan"], "dashboard").ok, false);
  assert.equal(engine.railGuardCollective(["role elimination"], "dashboard").ok, false);
  assert.equal(engine.railGuardCollective(["cut 3 FTE this quarter"], "dashboard").ok, false);
  assert.equal(engine.railGuardCollective(["hours saved"], "dashboard").ok, false);
});

test("D2 — Unicode-obfuscated and spaced/hyphenated variants are still blocked", () => {
  assert.equal(engine.railGuardCollective(["rеduce hеadcount"], "dashboard").ok, false); // Cyrillic е
  assert.equal(engine.railGuardCollective(["head-count reduction"], "dashboard").ok, false);
  assert.equal(engine.railGuardCollective(["work force optimisation"], "dashboard").ok, false);
});

test("D2 — clean reshape framing passes", () => {
  assert.equal(engine.railGuardCollective(["AI carries the assembly; the team reshapes toward judgment"], "dashboard").ok, true);
  assert.equal(engine.railGuardCollective(["the same team takes on more without growing"], "dashboard").ok, true);
});

test("D2 — the guard FAILS CLOSED when the rail itself cannot run", () => {
  const boom = { toString() { throw new Error("boom"); } };
  assert.equal(engine.railGuardCollective([boom], "dashboard").ok, false);
});

test("D2 — the actual collective + leadership aggregate text is rail-clean", () => {
  const set = [RECON, { ...RECON, header: { ...RECON.header, dept: "Tech", anchor: "t" } }];
  const heat = engine.buildCollectiveHeatmap(engine.buildPooledLibrary([RECON, RECON]));
  const rr = engine.buildRoleRedefinition(set);
  const texts = [
    engine.buildAiHybridHumanMix(set).whereTheLineSits,
    engine.buildCrossGroupSequencing(set).note,
    engine.realizationUplift(set).headline,
    engine.governanceUnlock(set).note,
    rr.team, rr.department,
    ...heat.rows.map((r) => `${r.role} ${r.confidence} ${r.coverage}`),
  ];
  assert.equal(engine.railGuardCollective(texts, "dashboard").ok, true, "all aggregate text must pass the collective rail");
});

// ---- app: the leadership render runs the guard + fails closed ----
function sandbox(eng) {
  return buildSandbox(source, {
    functions: ["studioEngine", "engineLeadership", "engineRailGuardCollective", "enginePooledLibrary", "leadershipSectionsHtml", "escapeHtml"],
    globals: { window: { StudioEngine: eng }, DASH: { faint: "#888", panel: "#111", line: "#222", ink: "#eee", dim: "#aaa" } },
  });
}

test("D2 — the app delegates the collective rail to the engine and renders clean aggregate text", () => {
  const sb = sandbox(engine);
  const html = sb.leadershipSectionsHtml([RECON], {});
  assert.ok(!/blocked by the worker-safe rail/.test(html), "clean engine text renders normally");
  assert.match(html, /where the line sits/);
});

test("D2 — the app FAILS CLOSED (renders the block message) if the collective rail flags banned vocab", () => {
  // a stub engine whose aggregate text carries banned vocab → the guard must block the render
  const dirtyEngine = {
    ...engine,
    buildAiHybridHumanMix: () => ({ ai: 50, hybrid: 30, human: 20, whereTheLineSits: "reduce headcount by 20%" }),
  };
  const sb = sandbox(dirtyEngine);
  const html = sb.leadershipSectionsHtml([RECON], {});
  assert.match(html, /blocked by the worker-safe rail/);
  assert.match(html, /never headcount reduction/);
});
