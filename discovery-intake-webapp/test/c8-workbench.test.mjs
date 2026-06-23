// C-8 — Workbench cockpit: multi-action confirm, adversarial two-tier guard.
// Tests use source-level extraction (buildSandbox) — no DOM, no live engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function wbSandbox(extra = []) {
  return buildSandbox(source, {
    consts: ["WB_RUNG_COLOR"],
    functions: ["wbRungColor", "wbGuardsHtml", "wbActionRowHtml", "wbComposed",
                "wbStepBodyHtml", "wbStepCardHtml",
                "wbToggleOwner", "wbToggleChannel", "wbConfirmStep", "wbSplitStep",
                "wireWorkbench", "renderAnalysisTabWorkbench",
                "escapeHtml", ...extra],
    globals: {
      studioEngine: () => null,
      analysisGridSteps: () => [],
      persistState: () => {},
      toast: () => {},
      analysisWorkflowName: () => "Test workflow",
      document: {
        getElementById: () => null,
        querySelectorAll: () => []
      },
      console: { warn() {}, error() {}, info() {} }
    }
  });
}

// ── rung colour ────────────────────────────────────────────────────────────

test("wbRungColor: maps all five rungs to --gm-* CSS vars", () => {
  const { wbRungColor } = wbSandbox();
  assert.equal(wbRungColor("gather"),   "var(--gm-gather)");
  assert.equal(wbRungColor("build"),    "var(--gm-build)");
  assert.equal(wbRungColor("judgment"), "var(--gm-judgment)");
  assert.equal(wbRungColor("decision"), "var(--gm-decision)");
  assert.equal(wbRungColor("human_held"), "var(--gm-held)");
});

test("wbRungColor: legacy assembly maps to build family colour", () => {
  const { wbRungColor } = wbSandbox();
  assert.equal(wbRungColor("assembly"), "var(--gm-build)");
});

test("wbRungColor: unknown cls falls back to faint text", () => {
  const { wbRungColor } = wbSandbox();
  assert.equal(wbRungColor("unknown"), "var(--txt-faint)");
  assert.equal(wbRungColor(""), "var(--txt-faint)");
  assert.equal(wbRungColor(null), "var(--txt-faint)");
});

// ── guard logic ────────────────────────────────────────────────────────────

test("wbGuardsHtml: no guards when step has no actions", () => {
  const { wbGuardsHtml } = wbSandbox();
  const out = wbGuardsHtml({ cls: "judgment", workActions: [] });
  assert.equal(out, "");
});

test("wbGuardsHtml: pink guard fires when human-led cls has AI action", () => {
  const { wbGuardsHtml } = wbSandbox();
  const step = {
    cls: "judgment",
    workActions: [{ owner: "ai", channel: "online" }]
  };
  const out = wbGuardsHtml(step);
  assert.ok(out.includes("wb-guard-pink"), "pink guard emitted");
  assert.ok(out.includes("class trap"), "explains the class trap");
});

test("wbGuardsHtml: pink guard fires for decision cls with AI action", () => {
  const { wbGuardsHtml } = wbSandbox();
  const step = {
    cls: "decision",
    workActions: [{ owner: "ai", channel: "online" }]
  };
  assert.ok(wbGuardsHtml(step).includes("wb-guard-pink"));
});

test("wbGuardsHtml: pink guard fires for human_held cls with AI action", () => {
  const { wbGuardsHtml } = wbSandbox();
  const step = {
    cls: "human_held",
    workActions: [{ owner: "ai", channel: "online" }]
  };
  assert.ok(wbGuardsHtml(step).includes("wb-guard-pink"));
});

test("wbGuardsHtml: pink guard does NOT fire for ai-led cls with AI action", () => {
  const { wbGuardsHtml } = wbSandbox();
  const step = {
    cls: "build",
    workActions: [{ owner: "ai", channel: "online" }]
  };
  assert.ok(!wbGuardsHtml(step).includes("wb-guard-pink"), "build cls is ai-led — no trap");
});

test("wbGuardsHtml: amber guard fires when all actions are AI+online", () => {
  const { wbGuardsHtml } = wbSandbox();
  const step = {
    cls: "gather",
    workActions: [
      { owner: "ai", channel: "online" },
      { owner: "ai", channel: "online" }
    ]
  };
  const out = wbGuardsHtml(step);
  assert.ok(out.includes("wb-guard-amber"), "amber guard emitted");
  assert.ok(!out.includes("wb-guard-pink"), "pink not shown for gather cls");
});

test("wbGuardsHtml: amber guard does NOT fire when any action is offline", () => {
  const { wbGuardsHtml } = wbSandbox();
  const step = {
    cls: "gather",
    workActions: [
      { owner: "ai", channel: "online" },
      { owner: "ai", channel: "offline" }
    ]
  };
  assert.ok(!wbGuardsHtml(step).includes("wb-guard-amber"));
});

test("wbGuardsHtml: amber guard does NOT fire when any action has human owner", () => {
  const { wbGuardsHtml } = wbSandbox();
  const step = {
    cls: "gather",
    workActions: [
      { owner: "ai", channel: "online" },
      { owner: "human", channel: "online" }
    ]
  };
  assert.ok(!wbGuardsHtml(step).includes("wb-guard-amber"));
});

// ── action row HTML ────────────────────────────────────────────────────────

test("wbActionRowHtml: renders AI owner toggle chip", () => {
  const { wbActionRowHtml } = wbSandbox();
  const out = wbActionRowHtml({ label: "Pull data", owner: "ai", channel: "online", addressability: 85 }, 0, "step-1");
  assert.ok(out.includes("wb-toggle-ai"), "AI toggle class present");
  assert.ok(out.includes("Pull data"), "label present");
  assert.ok(out.includes("85%"), "addressability rendered");
  assert.ok(out.includes("Online"), "channel label rendered");
});

test("wbActionRowHtml: renders human owner toggle chip", () => {
  const { wbActionRowHtml } = wbSandbox();
  const out = wbActionRowHtml({ label: "Review", owner: "human", channel: "offline", addressability: 0 }, 1, "step-2");
  assert.ok(out.includes("wb-toggle-human"), "human toggle class present");
  assert.ok(out.includes("Offline"), "offline channel rendered");
  assert.ok(out.includes("0%"), "zero addressability rendered");
});

test("wbActionRowHtml: synchronous_human channel shows Sync label", () => {
  const { wbActionRowHtml } = wbSandbox();
  const out = wbActionRowHtml({ label: "Sign off", owner: "human", channel: "synchronous_human" }, 0, "s1");
  assert.ok(out.includes("Sync"), "Sync label for synchronous_human");
});

// ── step card HTML ─────────────────────────────────────────────────────────

test("wbStepCardHtml: renders unconfirmed card with confirm button", () => {
  const { wbStepCardHtml } = wbSandbox();
  const step = { id: "s1", cls: "gather", name: "Pull data", workActions: [] };
  const out = wbStepCardHtml(step, 0);
  assert.ok(out.includes("01"), "step number formatted");
  assert.ok(out.includes("Pull data"), "step name present");
  assert.ok(out.includes("gather"), "cls rung badge present");
  assert.ok(out.includes("needs confirm"), "unconfirmed status label");
  assert.ok(out.includes("wb-confirm-btn"), "confirm button present");
});

test("wbStepCardHtml: confirmed card shows badge not button", () => {
  const { wbStepCardHtml } = wbSandbox();
  const step = { id: "s1", cls: "build", name: "Build report", workbenchConfirmed: true, workActions: [] };
  const out = wbStepCardHtml(step, 1);
  assert.ok(out.includes("confirmed"), "confirmed badge present");
  assert.ok(out.includes("wb-step-confirmed"), "confirmed CSS class on card");
  assert.ok(!out.includes("wb-confirm-btn"), "no confirm button when already confirmed");
});

test("wbStepCardHtml: pink guard blocks confirm button with wb-confirm-blocked class", () => {
  const { wbStepCardHtml } = wbSandbox();
  const step = {
    id: "s1", cls: "judgment", name: "Review findings",
    workActions: [{ owner: "ai", channel: "online", label: "Summarise" }]
  };
  const out = wbStepCardHtml(step, 2);
  assert.ok(out.includes("wb-confirm-blocked"), "confirm button blocked when pink guard active");
  assert.ok(out.includes("wb-guard-pink"), "pink guard shown in body");
});

// ── separation: C-8 never touches scorer or grid writer ───────────────────

test("separation: C-8 render functions do not call getStepOpportunityMeta", () => {
  for (const fn of ["renderAnalysisTabWorkbench", "wbStepCardHtml", "wbStepBodyHtml", "wbGuardsHtml"]) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("getStepOpportunityMeta"), `${fn} must not call getStepOpportunityMeta`);
  }
});

test("separation: C-8 render functions do not call patchField", () => {
  for (const fn of ["renderAnalysisTabWorkbench", "wbStepCardHtml", "wbStepBodyHtml", "wireWorkbench"]) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("patchField"), `${fn} must not call patchField`);
  }
});

test("separation: C-8 contains no invented server endpoint", () => {
  const src = extractFunction(source, "renderAnalysisTabWorkbench") +
              extractFunction(source, "wireWorkbench");
  assert.ok(!src.includes("/api/workbench"), "no invented /api/workbench endpoint");
  assert.ok(!src.includes("fetch("), "no fetch calls in the render/wire path");
});

// ── wbConfirmStep hardens action sources ─────────────────────────────────

test("wbConfirmStep: marks step confirmed and hardens ai-inferred actions to user-stated", () => {
  const steps = [{
    id: "sx",
    cls: "gather",
    name: "Collect data",
    workActions: [
      { owner: "ai", channel: "online", source: "ai-inferred", label: "Pull" },
      { owner: "human", channel: "offline", source: "user-stated", label: "Review" }
    ]
  }];
  const sb = buildSandbox(source, {
    functions: ["wbConfirmStep", "wbRungColor", "wbGuardsHtml", "wbComposed",
                "wbStepBodyHtml", "wbStepCardHtml", "wbActionRowHtml",
                "renderAnalysisTabWorkbench", "wireWorkbench", "escapeHtml"],
    consts: ["WB_RUNG_COLOR"],
    globals: {
      studioEngine: () => null,
      analysisGridSteps: () => steps,
      persistState: () => {},
      toast: () => {},
      analysisWorkflowName: () => "Test",
      document: { getElementById: () => null, querySelectorAll: () => [] },
      console: { warn() {}, error() {}, info() {} }
    }
  });
  sb.wbConfirmStep("sx");
  assert.equal(steps[0].workbenchConfirmed, true, "step marked confirmed");
  assert.equal(steps[0].workActions[0].source, "user-stated", "ai-inferred action hardened");
  assert.equal(steps[0].workActions[1].source, "user-stated", "already user-stated unchanged");
});

test("wbConfirmStep: toast-guards when judgment cls has all-AI actions (pink guard active)", () => {
  const steps = [{
    id: "sy", cls: "judgment", name: "Review",
    workActions: [{ owner: "ai", channel: "online" }]
  }];
  const toastCalls = [];
  const sb = buildSandbox(source, {
    functions: ["wbConfirmStep", "wbRungColor", "wbGuardsHtml", "wbComposed",
                "wbStepBodyHtml", "wbStepCardHtml", "wbActionRowHtml",
                "renderAnalysisTabWorkbench", "wireWorkbench", "escapeHtml"],
    consts: ["WB_RUNG_COLOR"],
    globals: {
      studioEngine: () => null,
      analysisGridSteps: () => steps,
      persistState: () => {},
      toast: (msg) => toastCalls.push(msg),
      analysisWorkflowName: () => "Test",
      document: { getElementById: () => null, querySelectorAll: () => [] },
      console: { warn() {}, error() {}, info() {} }
    }
  });
  sb.wbConfirmStep("sy");
  assert.equal(steps[0].workbenchConfirmed, undefined, "guard prevents confirmation");
  assert.ok(toastCalls.length > 0, "toast fired instead");
  assert.ok(toastCalls[0].toLowerCase().includes("guard"), "toast mentions guard");
});

// ── wbSplitStep is a stub that toasts ─────────────────────────────────────

test("wbSplitStep: toasts 'coming in a later sprint'", () => {
  const toastCalls = [];
  const sb = buildSandbox(source, {
    functions: ["wbSplitStep"],
    globals: { toast: (m) => toastCalls.push(m), console: { warn() {}, error() {}, info() {} } }
  });
  sb.wbSplitStep("s1");
  assert.ok(toastCalls.length > 0, "toast fired");
  assert.ok(toastCalls[0].includes("later sprint"), "explains it's a stub");
});
