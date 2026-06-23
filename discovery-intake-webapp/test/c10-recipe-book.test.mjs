// C-10 — Recipe Book Phase 4: TCO summary, gate register, audit export.
// All tests are source-level or sandbox-executed (no DOM, no live engine).
// Separation invariants: no scorer, no grid write, no server endpoint.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

const FORBIDDEN = /headcount|\bFTE\b|full-time equivalent|automation|automatable|\bROI\b|hours saved|time saved|\bopportunity\b/i;
const HUMAN_PINK = /#ff4fc8|#ffc4ea/i;

function rb10Sandbox(stepsOverride = []) {
  return buildSandbox(source, {
    consts: ["RB10_SHAPE_WEIGHT"],
    functions: [
      "rb10ShapeWeight", "rb10BuildWeightHtml", "rb10ShapePillHtml",
      "rb10TcoHtml", "rb10GateRegisterHtml", "rb10AuditPackData", "rb10AuditExportHtml",
      "escapeHtml"
    ],
    globals: {
      state: {},
      recipeGateCheck: (step) => ({ gaps: step?._gaps || [], p9Unconfirmed: Boolean(step?._p9) }),
      analysisGridSteps: () => stepsOverride,
      analysisWorkflowName: () => "Reconciliation workflow",
      recipeUnitSource: (id) => ({ text: `recipe-${id}`, origin: "step" }),
      toast: () => {},
      document: { getElementById: () => null }
    }
  });
}

function makeStep(id, opts = {}) {
  return {
    id,
    name: opts.name || id,
    cls: opts.cls || "gather",
    solutionShape: opts.solutionShape || null,
    derivedShape: opts.derivedShape || null,
    workbenchConfirmed: opts.confirmed || false,
    _gaps: opts.gaps || [],
    _p9: opts.p9 || false
  };
}

// ── rb10ShapeWeight ───────────────────────────────────────────────────────────

test("rb10ShapeWeight: prompt → 1", () => {
  const { rb10ShapeWeight } = rb10Sandbox();
  assert.equal(rb10ShapeWeight("prompt"), 1);
});

test("rb10ShapeWeight: rag → 2", () => {
  const { rb10ShapeWeight } = rb10Sandbox();
  assert.equal(rb10ShapeWeight("rag"), 2);
});

test("rb10ShapeWeight: tool and deterministic-tool → 3", () => {
  const { rb10ShapeWeight } = rb10Sandbox();
  assert.equal(rb10ShapeWeight("tool"), 3);
  assert.equal(rb10ShapeWeight("deterministic-tool"), 3);
});

test("rb10ShapeWeight: agentic → 4", () => {
  const { rb10ShapeWeight } = rb10Sandbox();
  assert.equal(rb10ShapeWeight("agentic"), 4);
});

test("rb10ShapeWeight: human-in-loop → 0", () => {
  const { rb10ShapeWeight } = rb10Sandbox();
  assert.equal(rb10ShapeWeight("human-in-loop"), 0);
  assert.equal(rb10ShapeWeight("human"), 0);
});

test("rb10ShapeWeight: unknown shape → 1 (default)", () => {
  const { rb10ShapeWeight } = rb10Sandbox();
  assert.equal(rb10ShapeWeight(""), 1);
  assert.equal(rb10ShapeWeight(null), 1);
  assert.equal(rb10ShapeWeight("wizardry"), 1);
});

// ── rb10BuildWeightHtml ───────────────────────────────────────────────────────

test("rb10BuildWeightHtml: human-in-loop returns no-build span", () => {
  const { rb10BuildWeightHtml } = rb10Sandbox();
  const out = rb10BuildWeightHtml("human-in-loop");
  assert.ok(out.includes("no build"), "shows 'no build'");
  assert.ok(!out.includes("<i "), "no dot elements for no-build");
});

test("rb10BuildWeightHtml: prompt (weight 1) returns 1 active dot and 'light' label", () => {
  const { rb10BuildWeightHtml } = rb10Sandbox();
  const out = rb10BuildWeightHtml("prompt");
  assert.ok(out.includes("light"), "label 'light' present");
  assert.ok((out.match(/<i /g) || []).length === 4, "always 4 dot elements");
});

test("rb10BuildWeightHtml: agentic (weight 4) returns 'agentic' label", () => {
  const { rb10BuildWeightHtml } = rb10Sandbox();
  const out = rb10BuildWeightHtml("agentic");
  assert.ok(out.includes("agentic"), "label 'agentic' present");
});

test("rb10BuildWeightHtml: no gradient anywhere in output", () => {
  const { rb10BuildWeightHtml } = rb10Sandbox();
  for (const shape of ["prompt", "rag", "tool", "agentic", "human-in-loop"]) {
    assert.ok(!/gradient/i.test(rb10BuildWeightHtml(shape)), `no gradient in ${shape} output`);
  }
});

// ── rb10TcoHtml ───────────────────────────────────────────────────────────────

test("rb10TcoHtml: empty steps → empty string", () => {
  const { rb10TcoHtml } = rb10Sandbox([]);
  assert.equal(rb10TcoHtml([]), "");
});

test("rb10TcoHtml: counts buildable vs protected (judgment/decision/human_held are protected)", () => {
  const { rb10TcoHtml } = rb10Sandbox();
  const steps = [
    makeStep("s1", { cls: "gather" }),
    makeStep("s2", { cls: "judgment" }),
    makeStep("s3", { cls: "decision" }),
    makeStep("s4", { cls: "human_held" }),
    makeStep("s5", { cls: "build" })
  ];
  const out = rb10TcoHtml(steps);
  assert.ok(out.includes("2"), "2 buildable steps (gather + build)");
  assert.ok(out.includes("3"), "3 protected steps (judgment + decision + human_held)");
});

test("rb10TcoHtml: confirmed count reflects workbenchConfirmed", () => {
  const { rb10TcoHtml } = rb10Sandbox();
  const steps = [
    makeStep("s1", { confirmed: true }),
    makeStep("s2", { confirmed: false }),
    makeStep("s3", { confirmed: true })
  ];
  const out = rb10TcoHtml(steps);
  assert.ok(out.includes("2"), "2 confirmed steps");
});

test("rb10TcoHtml: no banned language in output", () => {
  const { rb10TcoHtml } = rb10Sandbox();
  const steps = [makeStep("s1"), makeStep("s2", { cls: "judgment" })];
  const out = rb10TcoHtml(steps);
  assert.ok(!FORBIDDEN.test(out), `no banned language: ${out.match(FORBIDDEN)?.[0]}`);
});

test("rb10TcoHtml: no gradient and no Human Pink in output", () => {
  const { rb10TcoHtml } = rb10Sandbox();
  const steps = [makeStep("s1"), makeStep("s2", { cls: "decision" })];
  const out = rb10TcoHtml(steps);
  assert.ok(!/gradient/i.test(out), "no gradient");
  assert.ok(!HUMAN_PINK.test(out), "no Human Pink");
});

// ── rb10GateRegisterHtml ──────────────────────────────────────────────────────

test("rb10GateRegisterHtml: empty steps → empty string", () => {
  const { rb10GateRegisterHtml } = rb10Sandbox([]);
  assert.equal(rb10GateRegisterHtml([]), "");
});

test("rb10GateRegisterHtml: shows 'Gate register' heading", () => {
  const { rb10GateRegisterHtml } = rb10Sandbox();
  const out = rb10GateRegisterHtml([makeStep("s1")]);
  assert.ok(out.includes("Gate register"), "heading present");
});

test("rb10GateRegisterHtml: clean step (no gaps, no p9) shows 'trusted'", () => {
  const { rb10GateRegisterHtml } = rb10Sandbox();
  const steps = [makeStep("s1", { name: "Reconcile", gaps: [], p9: false })];
  const out = rb10GateRegisterHtml(steps);
  assert.ok(out.includes("trusted"), "trusted label shown");
  assert.ok(!out.includes("proposed"), "proposed not shown for clean step");
});

test("rb10GateRegisterHtml: step with gaps shows 'proposed'", () => {
  const { rb10GateRegisterHtml } = rb10Sandbox();
  const steps = [makeStep("s1", { name: "Review", gaps: ["sensitivity", "volume"], p9: false })];
  const out = rb10GateRegisterHtml(steps);
  assert.ok(out.includes("proposed"), "proposed label shown");
  assert.ok(out.includes("2 open gaps"), "gap count shown");
});

test("rb10GateRegisterHtml: p9 step shows 'proposed' and sensitivity warning", () => {
  const { rb10GateRegisterHtml } = rb10Sandbox();
  const steps = [makeStep("s1", { gaps: [], p9: true })];
  const out = rb10GateRegisterHtml(steps);
  assert.ok(out.includes("proposed"), "p9 step is proposed");
  assert.ok(out.toLowerCase().includes("sensitivity"), "sensitivity warning shown");
});

test("rb10GateRegisterHtml: shows step name", () => {
  const { rb10GateRegisterHtml } = rb10Sandbox();
  const steps = [makeStep("s1", { name: "Settlement Recon" })];
  const out = rb10GateRegisterHtml(steps);
  assert.ok(out.includes("Settlement Recon"), "step name in output");
});

test("rb10GateRegisterHtml: no banned language", () => {
  const { rb10GateRegisterHtml } = rb10Sandbox();
  const steps = [makeStep("s1", { gaps: ["systemsTools"], p9: true })];
  const out = rb10GateRegisterHtml(steps);
  assert.ok(!FORBIDDEN.test(out), "no banned language");
  assert.ok(!HUMAN_PINK.test(out), "no Human Pink");
  assert.ok(!/gradient/i.test(out), "no gradient");
});

// ── rb10AuditPackData ────────────────────────────────────────────────────────

test("rb10AuditPackData: returns object with workflowName and steps[]", () => {
  const { rb10AuditPackData } = rb10Sandbox();
  const steps = [makeStep("s1", { name: "Step one" })];
  const data = rb10AuditPackData(steps);
  assert.equal(data.workflowName, "Reconciliation workflow");
  assert.equal(data.steps.length, 1);
  assert.equal(data.steps[0].name, "Step one");
  assert.equal(data.steps[0].index, 1);
  assert.equal(data.steps[0].id, "s1");
});

test("rb10AuditPackData: trusted step has gateStatus 'trusted'", () => {
  const { rb10AuditPackData } = rb10Sandbox();
  const data = rb10AuditPackData([makeStep("s1", { gaps: [], p9: false })]);
  assert.equal(data.steps[0].gateStatus, "trusted");
});

test("rb10AuditPackData: step with gaps has gateStatus 'proposed'", () => {
  const { rb10AuditPackData } = rb10Sandbox();
  const data = rb10AuditPackData([makeStep("s1", { gaps: ["volume"], p9: false })]);
  assert.equal(data.steps[0].gateStatus, "proposed");
});

test("rb10AuditPackData: p9 step has p9Unconfirmed=true and gateStatus 'proposed'", () => {
  const { rb10AuditPackData } = rb10Sandbox();
  const data = rb10AuditPackData([makeStep("s1", { gaps: [], p9: true })]);
  assert.equal(data.steps[0].gateStatus, "proposed");
  assert.equal(data.steps[0].p9Unconfirmed, true);
});

test("rb10AuditPackData: includes recipeText from recipeUnitSource stub", () => {
  const { rb10AuditPackData } = rb10Sandbox();
  const data = rb10AuditPackData([makeStep("s1")]);
  assert.equal(data.steps[0].recipeText, "recipe-s1");
  assert.equal(data.steps[0].recipeOrigin, "step");
});

// ── rb10AuditExportHtml ──────────────────────────────────────────────────────

test("rb10AuditExportHtml: renders export button with correct id", () => {
  const { rb10AuditExportHtml } = rb10Sandbox();
  const out = rb10AuditExportHtml();
  assert.ok(out.includes('id="rb10AuditExportBtn"'), "export button id present");
  assert.ok(out.includes("Export audit pack"), "button label present");
});

test("rb10AuditExportHtml: no banned language, no gradient, no Human Pink", () => {
  const { rb10AuditExportHtml } = rb10Sandbox();
  const out = rb10AuditExportHtml();
  assert.ok(!FORBIDDEN.test(out), "no banned language");
  assert.ok(!/gradient/i.test(out), "no gradient");
  assert.ok(!HUMAN_PINK.test(out), "no Human Pink");
});

// ── separation invariants (source-level) ─────────────────────────────────────

test("separation: rb10 functions do not call patchField or grid write functions", () => {
  for (const fn of ["rb10TcoHtml", "rb10GateRegisterHtml", "rb10AuditPackData", "rb10AuditExportHtml", "wireRb10"]) {
    const src = extractFunction(source, fn);
    assert.ok(!/patchField|setStructuralTag|applyStructuralSuggestion|confirmStructuralTag|setRoleTag|setFrictionTag/.test(src), `${fn}: no grid write`);
  }
});

test("separation: rb10 functions do not call the scorer or suggestion endpoints", () => {
  for (const fn of ["rb10TcoHtml", "rb10GateRegisterHtml", "rb10AuditPackData", "rb10AuditExportHtml"]) {
    const src = extractFunction(source, fn);
    assert.ok(!/getStepOpportunityMeta|scoreRecipeReadiness|buildAgentRecipeIr|\/api\/suggest/.test(src), `${fn}: no scorer/endpoint`);
  }
});

test("separation: renderAnalysisTabRecipe still composes recipeBookHtml() + (unchanged)", () => {
  const tab = extractFunction(source, "renderAnalysisTabRecipe");
  assert.ok(/recipeBookHtml\(\) \+/.test(tab), "recipeBookHtml() + still in tab");
  assert.ok(/wireRecipeBook\(container\)/.test(tab), "wireRecipeBook still wired");
  assert.equal((tab.match(/Pattern confidence:/g) || []).length, 2, "Pattern confidence count unchanged");
});

test("separation: renderAnalysisTabRecipe now includes rb10 additions", () => {
  const tab = extractFunction(source, "renderAnalysisTabRecipe");
  assert.ok(/rb10TcoHtml\(steps\)/.test(tab), "rb10TcoHtml added to tab");
  assert.ok(/rb10GateRegisterHtml\(steps\)/.test(tab), "rb10GateRegisterHtml added to tab");
  assert.ok(/rb10AuditExportHtml\(\)/.test(tab), "rb10AuditExportHtml added to tab");
  assert.ok(/wireRb10\(container\)/.test(tab), "wireRb10 wired");
});

test("rail-clean: rb10 function sources contain no banned metric or policy strings", () => {
  const fns = ["rb10ShapeWeight", "rb10BuildWeightHtml", "rb10ShapePillHtml",
                "rb10TcoHtml", "rb10GateRegisterHtml", "rb10AuditPackData", "rb10AuditExportHtml"];
  const BANNED_LITERALS = [
    "headcount reduction", "FTE equivalent", "full-time equivalent",
    "hours saved", "time saved", "automation rate", "automatable",
    "ROI", "work with your development team"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    for (const banned of BANNED_LITERALS) {
      assert.ok(!src.includes(banned), `${fn} must not contain "${banned}"`);
    }
  }
});
