// C-13 — Process Map: ordered step nodes, five-rung coloring, Flow/Wait toggle,
// wait segments (reducible / coordination / deliberation · protected), the line.
// Tests use source-level extraction (buildSandbox) — no DOM, no live engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Sandbox ────────────────────────────────────────────────────────────────────

function pm13Sandbox() {
  return buildSandbox(source, {
    consts: ["PM_RUNG", "PM_HUMAN_STRUCTURAL"],
    functions: [
      "pm13OwnerLabel", "pm13WaitInfo", "pm13WaitBarHtml",
      "pm13NodeHtml", "pm13ConnHtml", "pm13LegendHtml",
      "pm13CumTimelineHtml", "pm13DetailHtml", "pm13HeroHtml",
      "escapeHtml"
    ],
    globals: {
      analysisGridSteps: () => [],
      recipeConnectionSeams: () => [],
      stepDisplayName: (s, i) => s.name || `Step ${i + 1}`,
      gridCellValue: () => "",
      document: { getElementById: () => null },
      console: { warn() {}, error() {}, info() {} }
    }
  });
}

function makeStep(opts = {}) {
  return {
    id: opts.id || "s1",
    cls: opts.cls || "gather",
    name: opts.name || "Pull data",
    workActions: opts.workActions || [],
    waitSegments: opts.waitSegments || [],
    workbenchConfirmed: opts.workbenchConfirmed || false,
    cells: {}
  };
}

// ── pm13OwnerLabel ─────────────────────────────────────────────────────────────

test("pm13OwnerLabel: gather + no actions → AI carries", () => {
  const { pm13OwnerLabel } = pm13Sandbox();
  assert.equal(pm13OwnerLabel("gather", []), "AI carries");
  assert.equal(pm13OwnerLabel("build", []), "AI carries");
});

test("pm13OwnerLabel: judgment/decision/human_held → human-held regardless of actions", () => {
  const { pm13OwnerLabel } = pm13Sandbox();
  assert.equal(pm13OwnerLabel("judgment", []), "human-held");
  assert.equal(pm13OwnerLabel("decision", [{ owner: "ai" }]), "human-held");
  assert.equal(pm13OwnerLabel("human_held", []), "human-held");
});

test("pm13OwnerLabel: AI-led cls + human action → hybrid · AI assists", () => {
  const { pm13OwnerLabel } = pm13Sandbox();
  const acts = [{ owner: "ai", channel: "online" }, { owner: "human", channel: "offline" }];
  assert.equal(pm13OwnerLabel("gather", acts), "hybrid · AI assists");
  assert.equal(pm13OwnerLabel("build", acts), "hybrid · AI assists");
});

// ── pm13WaitInfo ───────────────────────────────────────────────────────────────

test("pm13WaitInfo: no segments → hasMaterial=false, all zeros", () => {
  const { pm13WaitInfo } = pm13Sandbox();
  const wi = pm13WaitInfo(makeStep());
  assert.equal(wi.hasMaterial, false);
  assert.equal(wi.totalMins, 0);
  assert.equal(wi.reducMins, 0);
  assert.equal(wi.coordMins, 0);
  assert.equal(wi.protMins, 0);
});

test("pm13WaitInfo: reducible segment → reducMins and totalMins set", () => {
  const { pm13WaitInfo } = pm13Sandbox();
  const step = makeStep({ waitSegments: [{ kind: "reducible", minutes: 30 }] });
  const wi = pm13WaitInfo(step);
  assert.equal(wi.hasMaterial, true);
  assert.equal(wi.reducMins, 30);
  assert.equal(wi.totalMins, 30);
  assert.equal(wi.protMins, 0);
});

test("pm13WaitInfo: deliberation-protected segment → protMins set", () => {
  const { pm13WaitInfo } = pm13Sandbox();
  const step = makeStep({ waitSegments: [{ kind: "deliberation-protected", minutes: 60 }] });
  const wi = pm13WaitInfo(step);
  assert.equal(wi.hasMaterial, true);
  assert.equal(wi.protMins, 60);
  assert.equal(wi.reducMins, 0);
});

test("pm13WaitInfo: coordination segment → coordMins set", () => {
  const { pm13WaitInfo } = pm13Sandbox();
  const step = makeStep({ waitSegments: [{ kind: "coordination", minutes: 15 }] });
  const wi = pm13WaitInfo(step);
  assert.equal(wi.coordMins, 15);
  assert.equal(wi.hasMaterial, true);
});

// ── pm13WaitBarHtml ────────────────────────────────────────────────────────────

test("pm13WaitBarHtml: no wait segments → empty string", () => {
  const { pm13WaitBarHtml } = pm13Sandbox();
  assert.equal(pm13WaitBarHtml(makeStep()), "");
});

test("pm13WaitBarHtml: reducible segment → pm-wseg-red class present", () => {
  const { pm13WaitBarHtml } = pm13Sandbox();
  const step = makeStep({ waitSegments: [{ kind: "reducible", minutes: 45 }] });
  const out = pm13WaitBarHtml(step);
  assert.ok(out.includes("pm-wseg-red"), "reducible wait class present");
  assert.ok(out.includes("pm-waitbar"), "waitbar wrapper present");
  assert.ok(out.includes("45"), "wait time shown");
});

test("pm13WaitBarHtml: deliberation-protected segment → pm-wseg-prot class present", () => {
  const { pm13WaitBarHtml } = pm13Sandbox();
  const step = makeStep({ waitSegments: [{ kind: "deliberation-protected", minutes: 120 }] });
  const out = pm13WaitBarHtml(step);
  assert.ok(out.includes("pm-wseg-prot"), "protected wait class present");
});

// ── pm13NodeHtml ───────────────────────────────────────────────────────────────

test("pm13NodeHtml: renders step name and number", () => {
  const { pm13NodeHtml } = pm13Sandbox();
  const out = pm13NodeHtml(makeStep({ name: "Receive exceptions report" }), 2, "Receive exceptions report");
  assert.ok(out.includes("Receive exceptions report"), "step name present");
  assert.ok(out.includes("03"), "step number formatted as 03");
  assert.ok(out.includes("data-pm-idx=\"2\""), "data-pm-idx set");
});

test("pm13NodeHtml: gather cls → #6FB6FF color in node top bar", () => {
  const { pm13NodeHtml } = pm13Sandbox();
  const out = pm13NodeHtml(makeStep({ cls: "gather" }), 0, "Gather data");
  assert.ok(out.includes("#6FB6FF"), "gather color in node");
  assert.ok(out.includes("Gather"), "gather rung label in badge");
});

test("pm13NodeHtml: judgment cls → #9D7BF0 color", () => {
  const { pm13NodeHtml } = pm13Sandbox();
  const out = pm13NodeHtml(makeStep({ cls: "judgment" }), 1, "Assess findings");
  assert.ok(out.includes("#9D7BF0"), "judgment color in node");
  assert.ok(out.includes("Judgment"), "judgment rung label");
});

test("pm13NodeHtml: idx=0 → pm-sel class on first node", () => {
  const { pm13NodeHtml } = pm13Sandbox();
  const out = pm13NodeHtml(makeStep(), 0, "First step");
  assert.ok(out.includes("pm-sel"), "pm-sel on first node");
  const out2 = pm13NodeHtml(makeStep(), 1, "Second step");
  assert.ok(!out2.includes("pm-sel"), "no pm-sel on non-first node");
});

// ── pm13ConnHtml ───────────────────────────────────────────────────────────────

test("pm13ConnHtml: isLineCross=true → 'the line' marker rendered", () => {
  const { pm13ConnHtml } = pm13Sandbox();
  const out = pm13ConnHtml("build", "", true);
  assert.ok(out.includes("the line"), "the-line label present");
  assert.ok(out.includes("pm-the-line"), "pm-the-line class present");
});

test("pm13ConnHtml: AI-led fromCls → pm-conn-ai class", () => {
  const { pm13ConnHtml } = pm13Sandbox();
  assert.ok(pm13ConnHtml("gather", "", false).includes("pm-conn-ai"), "gather → pm-conn-ai");
  assert.ok(pm13ConnHtml("build", "", false).includes("pm-conn-ai"), "build → pm-conn-ai");
  assert.ok(pm13ConnHtml("assembly", "", false).includes("pm-conn-ai"), "assembly → pm-conn-ai");
});

test("pm13ConnHtml: human-led fromCls → pm-conn-hu class", () => {
  const { pm13ConnHtml } = pm13Sandbox();
  assert.ok(pm13ConnHtml("judgment", "", false).includes("pm-conn-hu"), "judgment → pm-conn-hu");
  assert.ok(pm13ConnHtml("decision", "", false).includes("pm-conn-hu"), "decision → pm-conn-hu");
  assert.ok(pm13ConnHtml("human_held", "", false).includes("pm-conn-hu"), "human_held → pm-conn-hu");
});

// ── pm13DetailHtml ─────────────────────────────────────────────────────────────

test("pm13DetailHtml: renders step name and rung label", () => {
  const { pm13DetailHtml } = pm13Sandbox();
  const out = pm13DetailHtml(makeStep({ cls: "judgment", name: "Assess ambiguous breaks" }), "Assess ambiguous breaks");
  assert.ok(out.includes("Assess ambiguous breaks"), "step name present");
  assert.ok(out.includes("Judgment"), "rung label present");
  assert.ok(out.includes("#9D7BF0"), "judgment color present");
});

test("pm13DetailHtml: deliberation wait → protected label in detail", () => {
  const { pm13DetailHtml } = pm13Sandbox();
  const step = makeStep({ waitSegments: [{ kind: "deliberation-protected", minutes: 45 }] });
  const out = pm13DetailHtml(step, "Review step");
  assert.ok(out.includes("deliberation · protected"), "protected wait detail shown");
  assert.ok(out.includes("45"), "wait minutes shown");
});

// ── pm13LegendHtml ─────────────────────────────────────────────────────────────

test("pm13LegendHtml: contains all five rung labels and the-line marker", () => {
  const { pm13LegendHtml } = pm13Sandbox();
  const out = pm13LegendHtml();
  assert.ok(out.includes("Gather"), "Gather label present");
  assert.ok(out.includes("Build"), "Build label present");
  assert.ok(out.includes("Judgment"), "Judgment label present");
  assert.ok(out.includes("Decision"), "Decision label present");
  assert.ok(out.includes("Human-held"), "Human-held label present");
  assert.ok(out.includes("Build → Judgment"), "the-line marker present");
});

// ── separation invariants (source-level) ──────────────────────────────────────

test("separation: pm13* render functions do not call patchField or scorer", () => {
  const fns = [
    "pm13OwnerLabel", "pm13WaitInfo", "pm13WaitBarHtml", "pm13NodeHtml",
    "pm13ConnHtml", "pm13LegendHtml", "pm13DetailHtml", "pm13CumTimelineHtml",
    "pm13HeroHtml", "wireProcessMap"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("patchField"), `${fn}: no patchField`);
    assert.ok(!src.includes("getStepOpportunityMeta"), `${fn}: no scorer`);
  }
});

test("separation: pm13* functions contain no fetch or invented endpoint", () => {
  const fns = ["pm13HeroHtml", "wireProcessMap", "pm13DetailHtml"];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("fetch("), `${fn}: no fetch`);
    assert.ok(!src.includes("/api/process-map"), `${fn}: no invented endpoint`);
  }
});

test("separation: renderAnalysisTabWorkbench now calls pm13HeroHtml", () => {
  const src = extractFunction(source, "renderAnalysisTabWorkbench");
  assert.ok(src.includes("pm13HeroHtml"), "pm13HeroHtml called from renderAnalysisTabWorkbench");
  assert.ok(src.includes("wireProcessMap"), "wireProcessMap called from renderAnalysisTabWorkbench");
});

// ── rail-clean (source-level) ─────────────────────────────────────────────────

test("rail-clean: pm13* functions contain no headcount/reduction vocabulary", () => {
  const fns = [
    "pm13NodeHtml", "pm13ConnHtml", "pm13DetailHtml",
    "pm13HeroHtml", "pm13LegendHtml"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("headcount"), `${fn}: no headcount`);
    assert.ok(!src.includes("reduction"), `${fn}: no reduction`);
    assert.ok(!src.includes("eliminat"), `${fn}: no eliminate`);
    assert.ok(!src.includes("layoff"), `${fn}: no layoff`);
  }
});

test("rail-clean: pm13* functions contain no banned output phrase", () => {
  const fns = ["pm13HeroHtml", "pm13DetailHtml", "pm13NodeHtml", "pm13LegendHtml"];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("work with your development team"), `${fn}: banned phrase absent`);
  }
});
