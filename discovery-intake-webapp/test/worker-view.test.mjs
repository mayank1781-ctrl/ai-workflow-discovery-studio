// C2 (Phase 2) — the Worker dashboard. Leverage framing ONLY ("what AI carries vs what stays mine",
// "time given back, and to what"). No cost or headcount language, ever — every rendered string passes
// railCheck(_, "worker"). A real leverage-summary export downloads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;

test("C2 — the worker view frames AI-carries vs stays-mine + time given back", () => {
  const wv = engine.buildWorkerView([RECON]);
  assert.ok(wv.roles.length >= 1);
  assert.ok(wv.roles.every((r) => /AI carries/.test(r.aiCarries) && /stay yours/.test(r.staysMine) && /time back/.test(r.givenBackTo)));
  assert.equal(wv.surface, "worker");
});

test("C2 — every worker-view string is rail-clean (no cost / capacity / headcount / FTE)", () => {
  const wv = engine.buildWorkerView([RECON]);
  const strings = [wv.headline, ...wv.roles.flatMap((r) => [r.aiCarries, r.staysMine, r.givenBackTo, r.shift])];
  const dirty = strings.filter((s) => !engine.railCheck(s, "worker").ok);
  assert.deepEqual(dirty, [], `worker strings must pass the worker rail; failed: ${dirty.join(" | ")}`);
});

test("C2 — a cost / headcount string cannot render on the worker surface", () => {
  assert.equal(engine.railCheck("cost-to-serve is $161/yr", "worker").ok, false);
  assert.equal(engine.railCheck("reduce headcount by 2", "worker").ok, false);
  assert.equal(engine.railCheck("0.6 FTE freed", "worker").ok, false);
  assert.equal(engine.railCheck("freed capacity this quarter", "worker").ok, false);
  // leverage framing IS allowed on the worker surface
  assert.equal(engine.railCheck("the leverage is on the assembly work", "worker").ok, true);
});

test("C2 — the leverage summary is a real, rail-clean export with a filename", () => {
  const ls = engine.buildLeverageSummary([RECON]);
  assert.equal(ls.filename, "leverage-summary.md");
  assert.ok(ls.content.length > 0 && ls.roleCount >= 1);
  assert.equal(engine.railCheck(ls.content, "worker").ok, true, "the whole export passes the worker rail");
});

// ---- app: the worker view + the leverage-summary download ----
function sandbox(state, downloads) {
  return buildSandbox(source, {
    consts: ["DASHBOARD_AUDIENCES"],
    functions: ["studioEngine", "ensureDashboardAudience", "setDashboardAudience", "engineWorkerView", "engineLeverageSummary", "workerViewHtml", "downloadLeverageSummary", "escapeHtml"],
    globals: {
      state: state || {}, window: { StudioEngine: engine },
      dashboardRecords: () => [RECON],
      downloadTextFile: (filename, content, mime) => { if (downloads) downloads.push({ filename, content, mime }); },
      toast: () => {},
    },
  });
}

test("C2 — the app worker view renders leverage framing and is rail-clean", () => {
  const sb = sandbox({});
  const html = sb.workerViewHtml([RECON]);
  assert.match(html, /AI carries/);
  assert.match(html, /Time given back/);
  assert.match(html, /leverage summary/);
  // the worker HTML chrome carries no cost/headcount/capacity vocabulary
  assert.ok(!/cost-to-serve|headcount|capacity|\bFTE\b|hours saved/i.test(html), "worker HTML must be rail-clean");
});

test("C2 — the audience toggle switches to worker; the leverage summary downloads a real file", () => {
  const state = {};
  const downloads = [];
  const sb = sandbox(state, downloads);
  assert.equal(sb.setDashboardAudience("worker"), "worker");
  assert.equal(state.dashboardAudience, "worker");
  assert.equal(sb.downloadLeverageSummary([RECON]), true);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, "leverage-summary.md");
  assert.ok(downloads[0].content.includes("leverage summary"));
});
