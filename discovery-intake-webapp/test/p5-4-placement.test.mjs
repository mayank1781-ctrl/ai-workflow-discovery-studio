// P5-4 — Solution Placement Explainer.
// Tests verify:
//   • buildPlacementExplainer returns null for null/no-id step
//   • decision/human_held/judgment → shape "human-in-loop" (class-inferred)
//   • assembly + read entitlement → shape "prompt"
//   • approve entitlement → shape "human-in-loop"
//   • write + sensitive data → shape "human-in-loop"
//   • write + non-sensitive → shape "deterministic-tool"
//   • workActions with human owner → shape "human-in-loop", shapeSource "computed"
//   • workActions all ai-online → derivedShape from engine fallback
//   • user-stated sidecar shape → shapeSource "stated"
//   • missing evidence fields reported in missingEvidence
//   • blockers for class/entitlement/dataTier conflicts
//   • compoundWarning = null (P5-4A hook present)
//   • human_in_loop normalised to human-in-loop
//   • placementExplainerHtml renders all surface content
//   • evidence detail only on workbench / technical surfaces
//   • wbStepBodyHtml calls buildPlacementExplainer (typeof-guarded)
//   • rail-clean: no headcount / FTE / reduction / eliminate
//   • Phase 6 guard: no workIntent / stepFunction / policyUpload / unitEconomics

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Shared mock helpers ────────────────────────────────────────────────────────

const NO_CELLS = {};  // all gridCellValue calls return ""

function makeStep(overrides = {}) {
  return Object.assign({ id: "s1", step: "Test step", cls: "assembly" }, overrides);
}

function makeSandbox(opts = {}) {
  const {
    cells = NO_CELLS,         // { systemsTools: "...", humanCheckpoint: "..." }
    engineStepClassFn = (s) => (s && s.cls) || "assembly",
    engineDataTierFn  = (s) => (s && s.data) || undefined,
    solutionShapeOfFn = () => null,
    studioEngineFn    = () => null
  } = opts;

  return buildSandbox(source, {
    consts: ["PLACEMENT_SHAPE_LABELS"],
    functions: ["inferStepPlacementShape", "buildPlacementExplainer", "placementExplainerHtml"],
    globals: {
      gridCellValue:   (step, k) => cells[k] || "",
      engineStepClass: engineStepClassFn,
      engineDataTier:  engineDataTierFn,
      solutionShapeOf: solutionShapeOfFn,
      studioEngine:    studioEngineFn,
      escapeHtml:      (s) => String(s == null ? "" : s)
    }
  });
}

// ── Null / no-id guard ─────────────────────────────────────────────────────────

test("P5-4: buildPlacementExplainer returns null for null step", () => {
  const { buildPlacementExplainer } = makeSandbox();
  assert.equal(buildPlacementExplainer(null), null);
});

test("P5-4: buildPlacementExplainer returns null for step without id", () => {
  const { buildPlacementExplainer } = makeSandbox();
  assert.equal(buildPlacementExplainer({ step: "No id" }), null);
});

// ── Class-driven inferred shapes ───────────────────────────────────────────────

test("P5-4: decision step → human-in-loop, shapeSource inferred", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "decision"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "decision" }));
  assert.equal(r.shape, "human-in-loop");
  assert.equal(r.shapeSource, "inferred");
  assert.equal(r.cls, "decision");
});

test("P5-4: human_held step → human-in-loop, inferReason mentions class", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "human_held"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "human_held" }));
  assert.equal(r.shape, "human-in-loop");
  assert.ok(r.inferReason && r.inferReason.includes("class"), `inferReason: "${r.inferReason}"`);
});

test("P5-4: judgment step → human-in-loop (AI supports, human decides)", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "judgment"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "judgment" }));
  assert.equal(r.shape, "human-in-loop");
  assert.ok(r.inferReason && r.inferReason.toLowerCase().includes("judgment"), `inferReason: "${r.inferReason}"`);
});

test("P5-4: assembly + read entitlement → shape prompt", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "read" }));
  assert.equal(r.shape, "prompt");
  assert.equal(r.shapeSource, "inferred");
});

test("P5-4: gather step (no explicit entitlement) → shape prompt (default read)", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "gather"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "gather" }));
  assert.equal(r.shape, "prompt");
});

// ── Entitlement-driven shapes ──────────────────────────────────────────────────

test("P5-4: approve entitlement → human-in-loop regardless of class", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "approve" }));
  assert.equal(r.shape, "human-in-loop");
  assert.ok(r.inferReason && r.inferReason.includes("approve"), `inferReason: "${r.inferReason}"`);
});

test("P5-4: write entitlement + PII data → human-in-loop", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    engineDataTierFn:  () => "PII"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "write", data: "PII" }));
  assert.equal(r.shape, "human-in-loop");
  assert.ok(r.inferReason && r.inferReason.includes("write"), `inferReason: "${r.inferReason}"`);
});

test("P5-4: write entitlement + MNPI data → human-in-loop", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    engineDataTierFn:  () => "MNPI"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "write", data: "MNPI" }));
  assert.equal(r.shape, "human-in-loop");
});

test("P5-4: write entitlement + internal (non-sensitive) data → deterministic-tool", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    engineDataTierFn:  () => "internal"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "write", data: "internal" }));
  assert.equal(r.shape, "deterministic-tool");
});

// ── workActions-driven shapes (computed) ───────────────────────────────────────

test("P5-4: workActions with human owner → shape human-in-loop, shapeSource computed", () => {
  const step = makeStep({
    cls: "assembly",
    workActions: [
      { owner: "human", channel: "online", addressability: 0 },
      { owner: "ai",    channel: "online", addressability: 80 }
    ]
  });
  const { buildPlacementExplainer } = makeSandbox({ engineStepClassFn: () => "assembly" });
  const r = buildPlacementExplainer(step);
  assert.equal(r.shape, "human-in-loop");
  assert.equal(r.shapeSource, "computed");
  assert.equal(r.inferReason, "derived from captured actions");
});

test("P5-4: workActions with offline channel → shape human-in-loop", () => {
  const step = makeStep({
    cls: "assembly",
    workActions: [{ owner: "ai", channel: "offline", addressability: 0 }]
  });
  const { buildPlacementExplainer } = makeSandbox({ engineStepClassFn: () => "assembly" });
  const r = buildPlacementExplainer(step);
  assert.equal(r.shape, "human-in-loop");
  assert.equal(r.shapeSource, "computed");
});

test("P5-4: workActions all ai-online, studioEngine provides derivedShape → uses engine result", () => {
  const step = makeStep({
    cls: "assembly",
    solutionShape: "agentic",
    workActions: [{ owner: "ai", channel: "online", addressability: 85 }]
  });
  const mockEngine = {
    deriveStepSolutionShape: (s) => s.solutionShape || null,
    composeStepAddressability: () => 85
  };
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    studioEngineFn: () => mockEngine
  });
  const r = buildPlacementExplainer(step);
  assert.equal(r.shape, "agentic");
  assert.equal(r.shapeSource, "computed");
});

test("P5-4: action decomposition appears in evidence when workActions present", () => {
  const step = makeStep({
    cls: "assembly",
    workActions: [{ owner: "ai", channel: "online", addressability: 70 }]
  });
  const { buildPlacementExplainer } = makeSandbox({ engineStepClassFn: () => "assembly" });
  const r = buildPlacementExplainer(step);
  const decompEv = r.evidence.find((e) => e.field === "action decomposition");
  assert.ok(decompEv, "action decomposition evidence present");
  assert.equal(decompEv.source, "computed");
  assert.ok(decompEv.value.includes("AI-carriable"), `value: "${decompEv.value}"`);
});

// ── User-stated sidecar shape ──────────────────────────────────────────────────

test("P5-4: user-stated sidecar shape → shapeSource stated", () => {
  const step = makeStep({ cls: "assembly" });
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    solutionShapeOfFn: () => ({ value: "rag", source: "user-stated", confidence: 1 })
  });
  const r = buildPlacementExplainer(step);
  assert.equal(r.shape, "rag");
  assert.equal(r.shapeSource, "stated");
  assert.equal(r.inferReason, null);
});

test("P5-4: AI-inferred sidecar shape → shapeSource inferred (not stated)", () => {
  const step = makeStep({ cls: "assembly" });
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    solutionShapeOfFn: () => ({ value: "agentic", source: "ai-inferred", confidence: 0.7 })
  });
  const r = buildPlacementExplainer(step);
  assert.equal(r.shape, "agentic");
  assert.equal(r.shapeSource, "inferred");
  assert.ok(r.inferReason && r.inferReason.includes("AI-suggested"), `inferReason: "${r.inferReason}"`);
});

// ── human_in_loop alias normalisation ─────────────────────────────────────────

test("P5-4: human_in_loop from engine is normalised to human-in-loop", () => {
  const step = makeStep({
    cls: "assembly",
    workActions: [{ owner: "human", channel: "online", addressability: 0 }]
  });
  const mockEngine = {
    deriveStepSolutionShape: () => "human_in_loop",   // engine returns underscore form
    composeStepAddressability: () => 0
  };
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    studioEngineFn: () => mockEngine
  });
  const r = buildPlacementExplainer(step);
  assert.equal(r.shape, "human-in-loop", "human_in_loop normalised to hyphenated form");
  assert.equal(r.note, "Human-in-loop", "note also uses canonical label");
});

// ── Missing evidence ───────────────────────────────────────────────────────────

test("P5-4: step with no data tier → missingEvidence includes data sensitivity", () => {
  const { buildPlacementExplainer } = makeSandbox({ engineDataTierFn: () => undefined });
  const r = buildPlacementExplainer(makeStep());
  assert.ok(r.missingEvidence.some((m) => m.toLowerCase().includes("data sensitivity")),
    `missingEvidence: ${JSON.stringify(r.missingEvidence)}`);
});

test("P5-4: step with no systemsTools → missingEvidence includes systems / tools", () => {
  const { buildPlacementExplainer } = makeSandbox({ cells: {} });
  const r = buildPlacementExplainer(makeStep());
  assert.ok(r.missingEvidence.some((m) => m.toLowerCase().includes("systems")),
    `missingEvidence: ${JSON.stringify(r.missingEvidence)}`);
});

test("P5-4: step without workActions → missingEvidence includes action decomposition", () => {
  const { buildPlacementExplainer } = makeSandbox();
  const r = buildPlacementExplainer(makeStep());
  assert.ok(r.missingEvidence.some((m) => m.toLowerCase().includes("action decomposition")),
    `missingEvidence: ${JSON.stringify(r.missingEvidence)}`);
});

test("P5-4: step with systemsTools populated → NOT in missingEvidence", () => {
  const { buildPlacementExplainer } = makeSandbox({ cells: { systemsTools: "CRM, email" } });
  const r = buildPlacementExplainer(makeStep());
  assert.ok(!r.missingEvidence.some((m) => m.toLowerCase().includes("systems")),
    "systems not missing when captured");
});

// ── Blockers ───────────────────────────────────────────────────────────────────

test("P5-4: decision step + non-human-in-loop stated shape → blocker fires", () => {
  const step = makeStep({ cls: "decision", solutionShape: "agentic" });
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "decision",
    solutionShapeOfFn: () => ({ value: "agentic", source: "user-stated", confidence: 1 })
  });
  const r = buildPlacementExplainer(step);
  // Shape is user-stated "agentic" but cls is decision — blocker should fire.
  assert.ok(r.blockers.some((b) => b.includes("decision")), `blockers: ${JSON.stringify(r.blockers)}`);
});

test("P5-4: PII data tier → blocker mentions PII", () => {
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    engineDataTierFn:  () => "PII"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", data: "PII" }));
  assert.ok(r.blockers.some((b) => b.includes("PII")), `blockers: ${JSON.stringify(r.blockers)}`);
});

test("P5-4: approve entitlement + agentic shape → blocker warns about approve+agentic", () => {
  const step = makeStep({ cls: "assembly", entitlement: "approve", solutionShape: "agentic" });
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    solutionShapeOfFn: () => ({ value: "agentic", source: "user-stated", confidence: 1 })
  });
  const r = buildPlacementExplainer(step);
  assert.ok(r.blockers.some((b) => b.toLowerCase().includes("approve")),
    `blockers: ${JSON.stringify(r.blockers)}`);
});

// ── AI carries / human holds content ──────────────────────────────────────────

test("P5-4: prompt step → aiCarries explains it can carry without checkpoint", () => {
  const { buildPlacementExplainer } = makeSandbox({ engineStepClassFn: () => "assembly" });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "read" }));
  assert.equal(r.shape, "prompt");
  assert.ok(r.aiCarries.length > 0, "aiCarries non-empty for prompt step");
  assert.ok(r.aiCarries.some((s) => s.toLowerCase().includes("summaris") || s.toLowerCase().includes("drafts") || s.toLowerCase().includes("reads")),
    `aiCarries: ${JSON.stringify(r.aiCarries)}`);
});

test("P5-4: decision step → humanHeld says 'Human makes the final call'", () => {
  const { buildPlacementExplainer } = makeSandbox({ engineStepClassFn: () => "decision" });
  const r = buildPlacementExplainer(makeStep({ cls: "decision" }));
  assert.ok(r.humanHeld.some((s) => s.toLowerCase().includes("human makes the final call")),
    `humanHeld: ${JSON.stringify(r.humanHeld)}`);
});

test("P5-4: agentic step with approve entitlement → humanHeld has approval hold", () => {
  const step = makeStep({ cls: "assembly", entitlement: "approve", solutionShape: "agentic" });
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    solutionShapeOfFn: () => ({ value: "agentic", source: "user-stated", confidence: 1 })
  });
  const r = buildPlacementExplainer(step);
  assert.ok(r.humanHeld.some((s) => s.toLowerCase().includes("approval")),
    `humanHeld: ${JSON.stringify(r.humanHeld)}`);
});

test("P5-4: step with humanCheckpoint cell → checkpoint text in humanHeld or aiCarries", () => {
  const CHECKPOINT = "Manager must sign off before proceeding";
  const { buildPlacementExplainer } = makeSandbox({
    engineStepClassFn: () => "assembly",
    cells: { humanCheckpoint: CHECKPOINT }
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly" }));
  const allText = [...r.aiCarries, ...r.humanHeld].join(" ");
  assert.ok(allText.includes(CHECKPOINT.slice(0, 40)),
    `checkpoint text should appear in carries/held: "${allText.slice(0, 100)}"`);
});

// ── P5-4A hook ─────────────────────────────────────────────────────────────────

test("P5-4: compoundWarning is null (P5-4A hook present but not yet implemented)", () => {
  const { buildPlacementExplainer } = makeSandbox();
  const r = buildPlacementExplainer(makeStep());
  assert.ok("compoundWarning" in r, "compoundWarning key exists on explainer");
  assert.equal(r.compoundWarning, null, "compoundWarning is null (P5-4A pending)");
});

// ── Evidence tracking ──────────────────────────────────────────────────────────

test("P5-4: evidence always includes step class", () => {
  const { buildPlacementExplainer } = makeSandbox({ engineStepClassFn: () => "assembly" });
  const r = buildPlacementExplainer(makeStep());
  assert.ok(r.evidence.some((e) => e.field === "step class"), "step class in evidence");
});

test("P5-4: evidence includes entitlement with correct source tag", () => {
  const { buildPlacementExplainer } = makeSandbox();
  const step = makeStep({ entitlement: "write" });
  const r = buildPlacementExplainer(step);
  const ev = r.evidence.find((e) => e.field === "entitlement");
  assert.ok(ev, "entitlement in evidence");
  assert.equal(ev.value, "write");
  assert.equal(ev.source, "stated");
});

test("P5-4: entitlement is tagged inferred when not on step", () => {
  const { buildPlacementExplainer } = makeSandbox();
  const step = makeStep(); // no entitlement property
  const r = buildPlacementExplainer(step);
  const ev = r.evidence.find((e) => e.field === "entitlement");
  assert.ok(ev, "entitlement in evidence");
  assert.equal(ev.source, "inferred");
});

test("P5-4: systemsTools cell value appears in evidence", () => {
  const { buildPlacementExplainer } = makeSandbox({ cells: { systemsTools: "Salesforce CRM" } });
  const r = buildPlacementExplainer(makeStep());
  const ev = r.evidence.find((e) => e.field === "systems / tools");
  assert.ok(ev, "systems/tools in evidence");
  assert.ok(ev.value.includes("Salesforce"), `evidence value: "${ev.value}"`);
});

test("P5-4: control field appears in evidence when step.control is set", () => {
  const step = makeStep({ control: { type: "four-eyes" } });
  const { buildPlacementExplainer } = makeSandbox();
  const r = buildPlacementExplainer(step);
  const ev = r.evidence.find((e) => e.field === "control");
  assert.ok(ev, "control in evidence");
  assert.equal(ev.value, "four-eyes");
  assert.equal(ev.source, "stated");
});

// ── placementExplainerHtml ─────────────────────────────────────────────────────

test("P5-4: placementExplainerHtml returns empty string for null", () => {
  const { placementExplainerHtml } = makeSandbox();
  assert.equal(placementExplainerHtml(null), "");
  assert.equal(placementExplainerHtml(undefined), "");
});

test("P5-4: placementExplainerHtml contains p54-placement class", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(makeStep());
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("p54-placement"), "p54-placement class present");
});

test("P5-4: placementExplainerHtml shows shape label in output", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly",
    engineDataTierFn:  () => "internal"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "write", data: "internal" }));
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("Tool-call"), `shape label not found; got: ${html.slice(0, 200)}`);
});

test("P5-4: human-in-loop step → HTML contains 'HUMAN HOLDS'", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "decision"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "decision" }));
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("HUMAN HOLDS"), "HUMAN HOLDS section present");
});

test("P5-4: prompt step → HTML contains 'AI CARRIES'", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "read" }));
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("AI CARRIES"), "AI CARRIES section present");
});

test("P5-4: blockers render with ⚠ marker", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly",
    engineDataTierFn:  () => "PII"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", data: "PII" }));
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("⚠"), "blocker ⚠ marker present");
  assert.ok(html.includes("PII"), "blocker references PII");
});

test("P5-4: missing evidence renders with '? Missing' marker", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineDataTierFn: () => undefined,
    cells: {}
  });
  const r = buildPlacementExplainer(makeStep());
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("? Missing"), "missing evidence marker present");
});

test("P5-4: evidence detail present on workbench surface (Evidence summary visible)", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(makeStep());
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("Evidence"), "Evidence section present on workbench");
});

test("P5-4: evidence detail present on technical surface", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(makeStep());
  const html = placementExplainerHtml(r, "technical");
  assert.ok(html.includes("Evidence"), "Evidence section present on technical surface");
});

test("P5-4: evidence detail absent on worker surface (same placement, no raw evidence list)", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(makeStep());
  const html = placementExplainerHtml(r, "worker");
  // placement label is present
  assert.ok(html.includes("p54-placement"), "p54-placement present on worker surface");
  // but the raw evidence <details> element is not
  assert.ok(!html.includes("Evidence ("), "Evidence list not shown on worker surface");
});

test("P5-4: evidence detail absent on leadership surface", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(makeStep());
  const html = placementExplainerHtml(r, "leadership");
  assert.ok(!html.includes("Evidence ("), "Evidence list not shown on leadership surface");
});

test("P5-4: shapeSource 'stated' → srcLabel shows 'user-confirmed'", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly",
    solutionShapeOfFn: () => ({ value: "rag", source: "user-stated", confidence: 1 })
  });
  const r = buildPlacementExplainer(makeStep());
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("user-confirmed"), `srcLabel not found; html snippet: ${html.slice(0, 300)}`);
});

test("P5-4: shapeSource 'computed' → srcLabel shows 'derived from actions'", () => {
  const step = makeStep({
    cls: "assembly",
    workActions: [{ owner: "human", channel: "online", addressability: 0 }]
  });
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(step);
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("derived from actions"),
    `srcLabel not found; html snippet: ${html.slice(0, 300)}`);
});

test("P5-4: compoundWarning null → no ⚠ compound-warning line in HTML", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly"
  });
  const r = buildPlacementExplainer(makeStep());
  assert.equal(r.compoundWarning, null);
  const html = placementExplainerHtml(r, "workbench");
  // compoundWarning null → the cwHtml is ""
  // The only ⚠ markers should be from blockers or missing evidence, not from compoundWarning.
  // Since this step has no blockers with ⚠, verify no compoundWarning text appears.
  // (We can't assert zero ⚠ because missingEvidence uses '? Missing' not '⚠', so any ⚠ is a blocker.)
  // Instead just verify compoundWarning=null is honoured (no extra line injected).
  assert.ok(!html.includes("compound"), "no compound-warning text when compoundWarning=null");
});

// ── wbStepBodyHtml wiring ──────────────────────────────────────────────────────

test("P5-4: wbStepBodyHtml calls buildPlacementExplainer with typeof-guard", () => {
  const src = extractFunction(source, "wbStepBodyHtml");
  assert.ok(src.includes("buildPlacementExplainer"), "calls buildPlacementExplainer");
  assert.ok(src.includes("placementExplainerHtml"), "calls placementExplainerHtml");
  assert.ok(src.includes("typeof buildPlacementExplainer"), "typeof-guarded");
  assert.ok(src.includes("p54PlacementHtml"), "p54PlacementHtml variable used");
});

test("P5-4: wbStepBodyHtml injects p54PlacementHtml into the return string", () => {
  const src = extractFunction(source, "wbStepBodyHtml");
  assert.ok(src.includes("${p54PlacementHtml}"), "p54PlacementHtml interpolated in return string");
});

// ── Acceptance scenario: prompt / read-only step ──────────────────────────────

test("P5-4 acceptance: prompt step explains why prompt may be enough", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly",
    engineDataTierFn:  () => "internal"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "read" }));
  const html = placementExplainerHtml(r, "workbench");
  // Prompt shape badge visible
  assert.ok(html.includes("Prompt-based"), "Prompt-based label present");
  // AI carries section explains it
  assert.ok(html.includes("AI CARRIES"), "AI CARRIES section present");
  // No blocking HUMAN HOLDS claim
  assert.ok(!html.includes("Human makes the final call"), "no human-final-call claim on prompt step");
});

// ── Acceptance scenario: decision / approval step ─────────────────────────────

test("P5-4 acceptance: decision step clearly states human-held", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "decision"
  });
  const r = buildPlacementExplainer(makeStep({ cls: "decision" }));
  const html = placementExplainerHtml(r, "workbench");
  assert.ok(html.includes("Human-in-loop"), "Human-in-loop label present");
  assert.ok(html.includes("HUMAN HOLDS"), "HUMAN HOLDS section present");
  assert.ok(html.includes("Human makes the final call"), "explicit human-call text present");
  assert.ok(html.includes("AI must not decide"), "AI-must-not-decide text present");
});

// ── Acceptance scenario: agentic step with controls ───────────────────────────

test("P5-4 acceptance: agentic step explains loops, entitlement, controls", () => {
  const step = makeStep({
    cls: "assembly",
    entitlement: "read",
    solutionShape: "agentic",
    control: { type: "four-eyes" }
  });
  const { buildPlacementExplainer, placementExplainerHtml } = makeSandbox({
    engineStepClassFn: () => "assembly",
    solutionShapeOfFn: () => ({ value: "agentic", source: "user-stated", confidence: 1 }),
    cells: { systemsTools: "CRM API" }
  });
  const r = buildPlacementExplainer(step);
  const html = placementExplainerHtml(r, "workbench");
  // Agentic shape badge
  assert.ok(html.includes("Agentic"), "Agentic label present");
  // Explains multi-step loop
  assert.ok(html.includes("loops"), "loop explanation present");
  // Control evidence present
  const ctrlEv = r.evidence.find((e) => e.field === "control");
  assert.ok(ctrlEv && ctrlEv.value === "four-eyes", "four-eyes control in evidence");
});

// ── Source-level rail checks ───────────────────────────────────────────────────

test("P5-4: buildPlacementExplainer is rail-clean (no headcount / FTE / reduction)", () => {
  const src = extractFunction(source, "buildPlacementExplainer").toLowerCase();
  assert.ok(!src.includes("headcount"), "no headcount");
  assert.ok(!src.includes(" fte"),      "no FTE");
  assert.ok(!src.includes("reduction"), "no reduction");
  assert.ok(!src.includes("eliminat"),  "no eliminate");
});

test("P5-4: placementExplainerHtml is rail-clean", () => {
  const src = extractFunction(source, "placementExplainerHtml").toLowerCase();
  assert.ok(!src.includes("headcount"), "no headcount");
  assert.ok(!src.includes(" fte"),      "no FTE");
  assert.ok(!src.includes("reduction"), "no reduction");
  assert.ok(!src.includes("eliminat"),  "no eliminate");
});

test("P5-4: placement functions contain no Phase 6 items", () => {
  for (const fn of ["buildPlacementExplainer", "placementExplainerHtml", "inferStepPlacementShape"]) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("workintent"),    `${fn}: no workIntent`);
    assert.ok(!src.includes("stepfunction"),  `${fn}: no stepFunction`);
    assert.ok(!src.includes("uniteconomics"), `${fn}: no unitEconomics`);
    assert.ok(!src.includes("policyupload"),  `${fn}: no policyUpload`);
  }
});

test("P5-4: buildPlacementExplainer does not call patchField, fetch, or scoring endpoints", () => {
  const src = extractFunction(source, "buildPlacementExplainer");
  assert.ok(!src.includes("patchField"),           "no patchField");
  assert.ok(!src.includes("fetch("),               "no fetch");
  assert.ok(!src.includes("/api/"),                "no invented endpoint");
  assert.ok(!src.includes("getStepOpportunityMeta"), "no scorer");
});

// ── PLACEMENT_SHAPE_LABELS completeness ───────────────────────────────────────

test("P5-4: PLACEMENT_SHAPE_LABELS covers all canonical shapes including alias", () => {
  // buildSandbox returns only functions; check the const's source text directly.
  const src = extractConst(source, "PLACEMENT_SHAPE_LABELS");
  const expected = ["prompt", "rag", "deterministic-tool", "agentic", "human-in-loop", "human_in_loop"];
  for (const k of expected) {
    assert.ok(src.includes(`"${k}"`), `PLACEMENT_SHAPE_LABELS missing key: "${k}"`);
  }
  // Verify that note field reads from the labels by checking prompt→"Prompt-based" mapping.
  const { buildPlacementExplainer } = makeSandbox({ engineStepClassFn: () => "assembly" });
  const r = buildPlacementExplainer(makeStep({ cls: "assembly", entitlement: "read" }));
  assert.equal(r.note, "Prompt-based", "note field reads from PLACEMENT_SHAPE_LABELS");
});
