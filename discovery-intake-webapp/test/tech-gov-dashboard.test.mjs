// C4 (Phase 2) — the Tech & Governance dashboard. Build view (shape / model tier / eval plan / owner
// per recipe), control evidence (four-eyes / authority / halts + the Phase-1 gate-matrix status), the
// six AI-policy KPIs, and the builder ladder (Use → Shape → Evaluate). One real export: the audit-ready
// evidence pack. Engine-computed; app delegates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
const withExc = { ...RECON, policyExceptions: [{ approver: "CRO", jurisdiction: "US", dataClass: "confidential", expiry: "2099-01-01" }] };

test("C4 — the build view carries shape / model tier / eval plan / owner per recipe", () => {
  const view = engine.buildTechGovView([RECON]);
  assert.ok(view.builds.length >= 1);
  const b = view.builds[0];
  assert.ok(b.owner && Array.isArray(b.evalPlan) && b.tiers.length >= 1 && typeof b.shapes === "object");
});

test("C4 — control evidence carries the gate-matrix status + the controls", () => {
  const b = engine.buildTechGovView([RECON]).builds[0];
  assert.equal(typeof b.controlEvidence.ok, "boolean");
  assert.ok(b.controlEvidence.controls.length >= 1, "RECON has controls (four-eyes / halt-on-flag)");
});

test("C4 — the six AI-policy KPIs render", () => {
  const kpis = engine.buildTechGovKpis([RECON]).kpis;
  assert.equal(kpis.length, 6);
  assert.deepEqual(kpis.map((k) => k.id), [
    "ai_steps_human_owner", "hardened_from_confirmed", "residency_exceptions_open",
    "eval_coverage_by_shape", "control_evidence_completeness", "model_tier_mix",
  ]);
});

test("C4 — the residency-exceptions-open KPI reflects actual exception objects", () => {
  assert.equal(engine.buildTechGovKpis([withExc]).kpis.find((k) => k.id === "residency_exceptions_open").value, 1);
  assert.equal(engine.buildTechGovKpis([RECON]).kpis.find((k) => k.id === "residency_exceptions_open").value, 0);
  // an expired exception is NOT open
  const expired = { ...RECON, policyExceptions: [{ approver: "CRO", jurisdiction: "US", dataClass: "confidential", expiry: "2000-01-01" }] };
  assert.equal(engine.buildTechGovKpis([expired]).kpis.find((k) => k.id === "residency_exceptions_open").value, 0);
});

test("C4 — the builder ladder is Use → Shape → Evaluate (the enablement track)", () => {
  assert.deepEqual(engine.BUILDER_LADDER.map((r) => r.name), ["Use", "Shape", "Evaluate"]);
  assert.ok(engine.BUILDER_LADDER.every((r) => r.realization > 0 && r.realization <= 1));
});

test("C4 — the evidence pack produces a real file with control evidence + the open exception", () => {
  const ep = engine.buildEvidencePack([withExc]);
  assert.equal(ep.filename, "evidence-pack.md");
  assert.ok(ep.content.length > 0);
  assert.match(ep.content, /Control evidence/);
  assert.match(ep.content, /CRO/); // the open residency exception is in the pack
});

// ---- app: the render + the evidence-pack download ----
function sandbox(downloads) {
  return buildSandbox(source, {
    functions: ["studioEngine", "engineTechGovView", "engineEvidencePack", "techGovViewHtml", "downloadEvidencePack", "dashboardCurrentRecords", "exportOpts", "exportProvenanceHtml", "escapeHtml"],
    globals: {
      state: { realConfirmedSeed: false },
      window: { StudioEngine: engine },
      dashboardModel: () => ({ records: [withExc] }),
      downloadTextFile: (filename, content, mime) => { if (downloads) downloads.push({ filename, content, mime }); },
      toast: () => {},
    },
  });
}

test("C4 — the app renders the build view + KPIs + ladder, and downloads a real evidence pack", () => {
  const downloads = [];
  const sb = sandbox(downloads);
  const html = sb.techGovViewHtml([withExc], {});
  assert.match(html, /AI-policy KPIs/);
  assert.match(html, /Build view/);
  assert.match(html, /builder ladder/i);
  assert.match(html, /evidence pack/i);
  assert.equal(sb.downloadEvidencePack(), true);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, "evidence-pack.md");
});
