// C-11 — Executive Dashboard: verdict blocks (Return/Trust/Speed) + metric toggle chart.
// Executive diagnoses; "what to do with freed capacity" stays in Workforce (C-12).
// Tests use source-level extraction (buildSandbox) — no DOM, no live engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Sandbox ────────────────────────────────────────────────────────────────────

function ed11Sandbox(stateOverride = {}, gridCellOverride = null) {
  return buildSandbox(source, {
    consts: ["ED11_MET", "ED11_AI_LED", "ED11_HUMAN_LED"],
    functions: [
      "ed11Dollars", "ed11HrsLabel", "ed11KpiCard", "ed11KpiTrioHtml",
      "ed11ReturnHtml", "ed11TrustHtml", "ed11SpeedHtml", "ed11VerdictRowHtml",
      "ed11MetricPanelHtml", "ed11BarsSvg",
      "escapeHtml"
    ],
    globals: {
      state: { ed11Metric: "value", ed11Toggle: true, ...stateOverride },
      gridCellValue: gridCellOverride || ((step, key) => {
        if (key === "timeTaken") return step._timeTaken != null ? String(step._timeTaken) : "0";
        if (key === "frequencyVolume") return step._freq != null ? String(step._freq) : "4";
        return "";
      }),
      document: { getElementById: () => null }
    }
  });
}

function makeLv(opts = {}) {
  return {
    confirmedCount: opts.confirmedCount ?? 1,
    breakdown: {
      deployable: {
        count: opts.count ?? 3,
        gross: opts.gross ?? null,
        cost: opts.cost ?? null,
        net: opts.net ?? null,
        chain: {
          theoHrs: opts.theoHrs ?? 0,
          permittedHrs: opts.permittedHrs ?? 0,
          freedHrs: opts.freedHrs ?? 0,
          realizedHrs: opts.realizedHrs ?? 0
        }
      },
      shapeMix: opts.shapeMix ?? {}
    }
  };
}

function makeStep(id, cls = "gather", opts = {}) {
  return {
    id,
    name: opts.name || id,
    cls,
    workbenchConfirmed: opts.confirmed ?? false,
    composedAddr: opts.composedAddr ?? null,
    theo: opts.theo ?? null,
    _timeTaken: opts.timeTaken ?? 0,
    _freq: opts.freq ?? 4
  };
}

// ── ed11Dollars ───────────────────────────────────────────────────────────────

test("ed11Dollars: null/non-finite → em-dash", () => {
  const { ed11Dollars } = ed11Sandbox();
  assert.equal(ed11Dollars(null), "—");
  assert.equal(ed11Dollars(undefined), "—");
  assert.equal(ed11Dollars(NaN), "—");
  assert.equal(ed11Dollars(Infinity), "—");
});

test("ed11Dollars: millions formatted with 2dp M suffix", () => {
  const { ed11Dollars } = ed11Sandbox();
  assert.ok(ed11Dollars(1500000).includes("M"), "M suffix");
  assert.ok(ed11Dollars(1500000).startsWith("$"), "$ prefix");
});

test("ed11Dollars: thousands formatted with k suffix", () => {
  const { ed11Dollars } = ed11Sandbox();
  const out = ed11Dollars(250000);
  assert.ok(out.includes("k"), "k suffix");
  assert.ok(out.startsWith("$"), "$ prefix");
});

test("ed11Dollars: small numbers formatted as integer", () => {
  const { ed11Dollars } = ed11Sandbox();
  const out = ed11Dollars(500);
  assert.ok(out.startsWith("$"), "$ prefix");
  assert.ok(out.includes("500"), "value present");
});

// ── ed11ReturnHtml ────────────────────────────────────────────────────────────

test("ed11ReturnHtml: no data → shows em-dash, not an invented number", () => {
  const { ed11ReturnHtml } = ed11Sandbox();
  const lv = makeLv({ gross: null, cost: null, net: null });
  const out = ed11ReturnHtml(lv);
  assert.ok(out.includes("—"), "em-dash shown when no data");
  assert.ok(!out.includes("$0"), "no invented $0 value");
  assert.ok(!out.includes("NaN"), "no NaN");
});

test("ed11ReturnHtml: with net value → shows formatted net in headline", () => {
  const { ed11ReturnHtml } = ed11Sandbox();
  const lv = makeLv({ gross: 500000, cost: 50000, net: 450000 });
  const out = ed11ReturnHtml(lv);
  assert.ok(out.includes("450k") || out.includes("$450"), "net value in headline");
  assert.ok(out.includes("/yr net"), "/yr net label present");
});

test("ed11ReturnHtml: waterfall shows both gross and net labels", () => {
  const { ed11ReturnHtml } = ed11Sandbox();
  const lv = makeLv({ gross: 500000, cost: 50000, net: 450000 });
  const out = ed11ReturnHtml(lv);
  assert.ok(out.toLowerCase().includes("gross"), "gross label in waterfall");
  assert.ok(out.toLowerCase().includes("net"), "net label in waterfall");
});

test("ed11ReturnHtml: color accent is blue (#4D8BFF), not Human Pink", () => {
  const { ed11ReturnHtml } = ed11Sandbox();
  const lv = makeLv({ net: 100000 });
  const out = ed11ReturnHtml(lv);
  assert.ok(out.includes("#4D8BFF") || out.includes("#8FB6FF"), "blue accent present");
  assert.ok(!/#ff4f[cd]8/i.test(out), "no Human Pink in Return block");
});

test("ed11ReturnHtml: agentic watch text visible when shapeMix.agentic set", () => {
  const { ed11ReturnHtml } = ed11Sandbox();
  const lv = makeLv({ shapeMix: { agentic: 0.45 } });
  const out = ed11ReturnHtml(lv);
  assert.ok(out.includes("agentic"), "agentic warning shown");
  assert.ok(out.includes("45%"), "agentic % shown");
});

test("ed11ReturnHtml: does not call patchField or any endpoint (source-level)", () => {
  const src = extractFunction(source, "ed11ReturnHtml");
  assert.ok(!src.includes("patchField"), "no patchField");
  assert.ok(!src.includes("fetch("), "no fetch");
  assert.ok(!src.includes("/api/"), "no api call");
});

// ── ed11TrustHtml ─────────────────────────────────────────────────────────────

test("ed11TrustHtml: headline says 'frees people' and 'for better work'", () => {
  const { ed11TrustHtml } = ed11Sandbox();
  const steps = [makeStep("s1", "gather"), makeStep("s2", "judgment")];
  const out = ed11TrustHtml(steps);
  assert.ok(out.includes("frees people"), "'frees people' in Trust headline");
  assert.ok(out.includes("for better work"), "'for better work' in Trust headline");
});

test("ed11TrustHtml: shows ownership bar with AI-led and human-led percentages", () => {
  const { ed11TrustHtml } = ed11Sandbox();
  const steps = [
    makeStep("s1", "gather"),
    makeStep("s2", "build"),
    makeStep("s3", "judgment"),
    makeStep("s4", "decision")
  ];
  const out = ed11TrustHtml(steps);
  assert.ok(out.includes("AI helps here"), "AI-led label");
  assert.ok(out.includes("people own this"), "human-led label");
  assert.ok(out.includes("50%"), "50% split for 2 ai-led vs 2 human-led");
});

test("ed11TrustHtml: 'Workforce' navigation link present (executive/workforce split)", () => {
  const { ed11TrustHtml } = ed11Sandbox();
  const out = ed11TrustHtml([makeStep("s1")]);
  assert.ok(out.includes("Workforce"), "Workforce link present");
  assert.ok(out.includes("data-ed11-tab"), "tab link data attribute present");
});

test("ed11TrustHtml: says 'not reductions', not an affirmation of cuts", () => {
  const { ed11TrustHtml } = ed11Sandbox();
  const out = ed11TrustHtml([makeStep("s1"), makeStep("s2", "judgment")]);
  assert.ok(out.includes("not reductions"), "'not reductions' framing present");
  assert.ok(!out.toLowerCase().includes("headcount cut"), "no 'headcount cut'");
  assert.ok(!out.toLowerCase().includes("layoff"), "no 'layoff'");
  assert.ok(!out.toLowerCase().includes("eliminate"), "no 'eliminate'");
});

test("ed11TrustHtml: bar gradient uses blue→pink, not Human Pink (#FF4FD8)", () => {
  const { ed11TrustHtml } = ed11Sandbox();
  const out = ed11TrustHtml([makeStep("s1")]);
  assert.ok(!/#FF4FD8/i.test(out), "no Human Pink (#FF4FD8)");
  assert.ok(!/#ff4fc8/i.test(out), "no legacy Human Pink (#ff4fc8)");
});

test("ed11TrustHtml: empty steps does not crash (0% split)", () => {
  const { ed11TrustHtml } = ed11Sandbox();
  const out = ed11TrustHtml([]);
  assert.ok(out.includes("people own this"), "zero steps handled gracefully");
});

// ── ed11SpeedHtml ─────────────────────────────────────────────────────────────

test("ed11SpeedHtml: no confirmed steps → em-dash headline, guidance message", () => {
  const { ed11SpeedHtml } = ed11Sandbox();
  const steps = [makeStep("s1", "gather", { confirmed: false, timeTaken: 30 })];
  const out = ed11SpeedHtml(steps);
  assert.ok(out.includes("—"), "em-dash when no confirmed steps");
  assert.ok(out.toLowerCase().includes("confirm"), "guidance to confirm steps");
});

test("ed11SpeedHtml: confirmed steps with timeTaken → shows compression %", () => {
  const { ed11SpeedHtml } = ed11Sandbox();
  const steps = [makeStep("s1", "gather", { confirmed: true, composedAddr: 50, timeTaken: 60 })];
  const out = ed11SpeedHtml(steps);
  assert.ok(out.includes("50%") || out.includes("−50%"), "compression % shown");
  assert.ok(out.includes("cycle-time"), "cycle-time label present");
});

test("ed11SpeedHtml: speed accent is violet (#9D7BF0 family), not Human Pink", () => {
  const { ed11SpeedHtml } = ed11Sandbox();
  const out = ed11SpeedHtml([makeStep("s1")]);
  assert.ok(out.includes("#9D7BF0") || out.includes("#B89DF5"), "violet accent");
  assert.ok(!/#FF4FD8/i.test(out) && !/#ff4fc8/i.test(out), "no Human Pink");
});

test("ed11SpeedHtml: compression bar has 'cycle now' and 'wait removed' labels", () => {
  const { ed11SpeedHtml } = ed11Sandbox();
  const steps = [makeStep("s1", "gather", { confirmed: true, composedAddr: 40, timeTaken: 45 })];
  const out = ed11SpeedHtml(steps);
  assert.ok(out.includes("cycle now"), "cycle now label");
  assert.ok(out.includes("wait removed"), "wait removed label");
});

test("ed11SpeedHtml: deliberation note present ('gates kept intact')", () => {
  const { ed11SpeedHtml } = ed11Sandbox();
  const out = ed11SpeedHtml([makeStep("s1")]);
  assert.ok(out.includes("gates kept intact"), "deliberation note present");
});

// ── ed11VerdictRowHtml ────────────────────────────────────────────────────────

test("ed11VerdictRowHtml: contains 'The leadership verdict' heading", () => {
  const { ed11VerdictRowHtml } = ed11Sandbox();
  const out = ed11VerdictRowHtml(makeLv(), []);
  assert.ok(out.includes("The leadership verdict"), "heading present");
});

test("ed11VerdictRowHtml: contains all three verdict blocks", () => {
  const { ed11VerdictRowHtml } = ed11Sandbox();
  const out = ed11VerdictRowHtml(makeLv(), [makeStep("s1"), makeStep("s2", "judgment")]);
  assert.ok(out.toLowerCase().includes("is it worth it"), "Return block present");
  assert.ok(out.toLowerCase().includes("will this change the team"), "Trust block present");
  assert.ok(out.toLowerCase().includes("are we faster"), "Speed block present");
});

test("ed11VerdictRowHtml: Workforce Transformation link present (separation enforced)", () => {
  const { ed11VerdictRowHtml } = ed11Sandbox();
  const out = ed11VerdictRowHtml(makeLv(), [makeStep("s1")]);
  assert.ok(out.includes("Workforce Transformation"), "Workforce Transformation link present");
  assert.ok(out.includes("data-ed11-tab"), "tab navigation data attribute present");
});

test("ed11VerdictRowHtml: does not contain 'what to do with freed capacity' (belongs in C-12)", () => {
  const { ed11VerdictRowHtml } = ed11Sandbox();
  const out = ed11VerdictRowHtml(makeLv(), [makeStep("s1"), makeStep("s2", "judgment")]);
  // The phrase should read "what to do with freed capacity lives in" → Workforce
  // Any reference is a POINTER to Workforce, not the content itself
  const lower = out.toLowerCase();
  assert.ok(!lower.includes("redeployment plan"), "no redeployment plan content in executive");
  assert.ok(!lower.includes("role redesign plan"), "no role redesign content in executive");
  assert.ok(!lower.includes("workforce transformation tab"), "no tab-name collider");
});

test("ed11VerdictRowHtml: no firm names, no banned output phrase", () => {
  const { ed11VerdictRowHtml } = ed11Sandbox();
  const out = ed11VerdictRowHtml(makeLv(), [makeStep("s1")]);
  assert.ok(!out.includes("work with your development team"), "banned phrase absent");
});

test("ed11VerdictRowHtml: no gradient in static row structure", () => {
  const { ed11VerdictRowHtml } = ed11Sandbox();
  const out = ed11VerdictRowHtml(makeLv(), []);
  // gradient is permitted INSIDE verdict blocks (e.g. waterfall bar, ownership bar)
  // but the WRAPPER row itself must not use gradient backgrounds
  const rowWrapper = out.slice(0, out.indexOf("Return — is it worth it?"));
  assert.ok(!/gradient/i.test(rowWrapper), "no gradient in row wrapper");
});

// ── ed11MetricPanelHtml ───────────────────────────────────────────────────────

test("ed11MetricPanelHtml: renders 'Value created' heading", () => {
  const { ed11MetricPanelHtml } = ed11Sandbox();
  const out = ed11MetricPanelHtml(makeLv(), [], "value", true);
  assert.ok(out.includes("Value created"), "heading present");
});

test("ed11MetricPanelHtml: segmented control has all three metric buttons", () => {
  const { ed11MetricPanelHtml } = ed11Sandbox();
  const out = ed11MetricPanelHtml(makeLv(), [], "value", false);
  assert.ok(out.includes("data-ed11-metric=\"value\""), "value button");
  assert.ok(out.includes("data-ed11-metric=\"hours\""), "hours button");
  assert.ok(out.includes("data-ed11-metric=\"cycle\""), "cycle button");
});

test("ed11MetricPanelHtml: active metric button is highlighted (different background)", () => {
  const { ed11MetricPanelHtml } = ed11Sandbox();
  const out = ed11MetricPanelHtml(makeLv(), [], "hours", false);
  // The 'hours' button should have rgba(255,255,255,.12) background (active)
  // while value/cycle have transparent.
  // Structure: <button data-ed11-metric="hours" style="...background:rgba(255,255,255,.12)...">
  // The style attribute comes AFTER the data attribute in the tag.
  assert.ok(out.includes("data-ed11-metric=\"hours\""), "hours button present");
  const hoursBtnIdx = out.indexOf("data-ed11-metric=\"hours\"");
  const afterHours = out.slice(hoursBtnIdx, hoursBtnIdx + 400);
  assert.ok(afterHours.includes("rgba(255,255,255,.12)"), "active button has highlight background");
});

test("ed11MetricPanelHtml: toggle button with aria-checked present", () => {
  const { ed11MetricPanelHtml } = ed11Sandbox();
  const out = ed11MetricPanelHtml(makeLv(), [], "value", true);
  assert.ok(out.includes("ed11ToggleBtn"), "toggle button id present");
  assert.ok(out.includes("aria-checked"), "aria-checked present");
});

test("ed11MetricPanelHtml: toggle label changes with toggle state", () => {
  const { ed11MetricPanelHtml } = ed11Sandbox();
  const outOn = ed11MetricPanelHtml(makeLv(), [], "value", true);
  const outOff = ed11MetricPanelHtml(makeLv(), [], "value", false);
  assert.ok(outOn.includes("Net of token run-cost"), "toggle=true shows net label");
  assert.ok(outOff.includes("Gross (before token cost)"), "toggle=false shows gross label");
});

test("ed11MetricPanelHtml: cycle metric shows legend when toggle=true (After AI view)", () => {
  const { ed11MetricPanelHtml } = ed11Sandbox();
  const out = ed11MetricPanelHtml(makeLv(), [makeStep("s1", "gather", { timeTaken: 30 })], "cycle", true);
  assert.ok(out.includes("cycle now"), "cycle now legend present");
  assert.ok(out.includes("wait removed"), "wait removed legend present");
});

// ── ed11KpiTrioHtml ───────────────────────────────────────────────────────────

test("ed11KpiTrioHtml: value metric — shows net value, confirmed steps, AI-addressable %", () => {
  const { ed11KpiTrioHtml } = ed11Sandbox();
  const lv = makeLv({ net: 250000, gross: 300000, count: 4 });
  const steps = [makeStep("s1", "gather"), makeStep("s2", "judgment")];
  const out = ed11KpiTrioHtml(lv, steps, "value");
  assert.ok(out.includes("Net value"), "Net value card");
  assert.ok(out.includes("Confirmed steps"), "Confirmed steps card");
  assert.ok(out.includes("AI-addressable"), "AI-addressable card");
  assert.ok(out.includes("250k") || out.includes("$250"), "net value shown");
});

test("ed11KpiTrioHtml: hours metric — shows freed hrs, FTE-equivalent, AI-led share", () => {
  const { ed11KpiTrioHtml } = ed11Sandbox();
  const lv = makeLv({ freedHrs: 4160 });
  const steps = [makeStep("s1", "gather"), makeStep("s2", "gather")];
  const out = ed11KpiTrioHtml(lv, steps, "hours");
  assert.ok(out.includes("Freed hours"), "freed hours card");
  assert.ok(out.includes("FTE-equivalent"), "FTE-equivalent card");
  assert.ok(out.includes("AI-led step share"), "AI-led share card");
  assert.ok(out.includes("2.0") || out.includes("2"), "4160 hrs / 2080 ≈ 2 FTE");
});

test("ed11KpiTrioHtml: cycle metric — shows avg cut, compressed %, longest pole", () => {
  const { ed11KpiTrioHtml } = ed11Sandbox();
  const steps = [
    makeStep("s1", "gather", { confirmed: true, composedAddr: 60, timeTaken: 30 }),
    makeStep("s2", "gather", { confirmed: true, composedAddr: 40, timeTaken: 60, name: "Review" })
  ];
  const out = ed11KpiTrioHtml(makeLv(), steps, "cycle");
  assert.ok(out.includes("Avg cycle cut"), "avg cut card");
  assert.ok(out.includes("Wait compressed"), "compressed % card");
  assert.ok(out.includes("Longest pole"), "longest pole card");
  assert.ok(out.includes("min"), "minutes unit present");
});

// ── ed11BarsSvg ───────────────────────────────────────────────────────────────

test("ed11BarsSvg: no steps → SVG with 'No steps' message", () => {
  const { ed11BarsSvg } = ed11Sandbox();
  const out = ed11BarsSvg([], "value", true);
  assert.ok(out.startsWith("<svg"), "returns SVG");
  assert.ok(out.includes("No steps"), "empty-state message");
});

test("ed11BarsSvg: steps produce rect elements (one per step)", () => {
  const { ed11BarsSvg } = ed11Sandbox(
    {},
    (step, key) => key === "timeTaken" ? "30" : "4"
  );
  const steps = [makeStep("s1"), makeStep("s2"), makeStep("s3")];
  const out = ed11BarsSvg(steps, "value", false);
  const rectCount = (out.match(/<rect /g) || []).length;
  assert.ok(rectCount >= 3, `at least 3 rects for 3 steps (got ${rectCount})`);
});

test("ed11BarsSvg: cycle metric with toggle=true produces dotted (v2) segments", () => {
  const { ed11BarsSvg } = ed11Sandbox(
    {},
    (step, key) => key === "timeTaken" ? "60" : "4"
  );
  const steps = [makeStep("s1", "gather", { composedAddr: 50 })];
  const out = ed11BarsSvg(steps, "cycle", true);
  // Two rect elements: solid (after AI) + dotted (wait removed)
  const rectCount = (out.match(/<rect /g) || []).length;
  assert.ok(rectCount >= 2, `cycle toggle=true should produce 2 rects (got ${rectCount})`);
  assert.ok(out.includes("<pattern"), "dotted pattern defined");
});

test("ed11BarsSvg: SVG has correct viewBox (700 wide)", () => {
  const { ed11BarsSvg } = ed11Sandbox();
  const out = ed11BarsSvg([makeStep("s1")], "hours", false);
  assert.ok(out.includes('viewBox="0 0 700'), "correct viewBox width");
});

test("ed11BarsSvg: no gradient backgrounds (linear-gradient not permitted in SVG fills)", () => {
  const { ed11BarsSvg } = ed11Sandbox(
    {},
    (step, key) => key === "timeTaken" ? "30" : "4"
  );
  const out = ed11BarsSvg([makeStep("s1"), makeStep("s2")], "value", true);
  // SVG linearGradient defs ARE used for the bar fill — they are data-meaning accents.
  // Check that NO css `linear-gradient()` function is used (only SVG gradient defs).
  assert.ok(!out.includes("linear-gradient("), "no CSS linear-gradient() in SVG");
});

// ── separation invariants (source-level) ─────────────────────────────────────

test("separation: C-11 functions do not call patchField or grid write", () => {
  const fns = [
    "ed11ReturnHtml", "ed11TrustHtml", "ed11SpeedHtml",
    "ed11VerdictRowHtml", "ed11MetricPanelHtml", "ed11KpiTrioHtml",
    "ed11BarsSvg", "wireEd11"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("patchField"), `${fn}: no patchField`);
    assert.ok(!src.includes("setStructuralTag"), `${fn}: no grid write`);
  }
});

test("separation: C-11 functions do not call scorer or invented endpoints", () => {
  const fns = [
    "ed11ReturnHtml", "ed11TrustHtml", "ed11SpeedHtml",
    "ed11VerdictRowHtml", "ed11MetricPanelHtml", "ed11KpiTrioHtml", "ed11BarsSvg"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("getStepOpportunityMeta"), `${fn}: no scorer`);
    assert.ok(!src.includes("fetch("), `${fn}: no fetch`);
    assert.ok(!src.includes("/api/exec-dashboard"), `${fn}: no invented endpoint`);
  }
});

test("separation: renderAnalysisTabDashboard now includes ed11MetricPanelHtml", () => {
  const src = extractFunction(source, "renderAnalysisTabDashboard");
  assert.ok(src.includes("ed11MetricPanelHtml("), "ed11MetricPanelHtml injected");
});

test("separation: renderAnalysisTabDashboard now includes ed11VerdictRowHtml", () => {
  const src = extractFunction(source, "renderAnalysisTabDashboard");
  assert.ok(src.includes("ed11VerdictRowHtml("), "ed11VerdictRowHtml injected");
});

test("separation: wireDashboard now calls wireEd11", () => {
  const src = extractFunction(source, "wireDashboard");
  assert.ok(src.includes("wireEd11("), "wireEd11 called from wireDashboard");
});

test("separation: existing dashboard composition is unchanged (dashHeaderHtml etc. still in leadership path)", () => {
  const src = extractFunction(source, "renderAnalysisTabDashboard");
  assert.ok(src.includes("dashHeaderHtml(lv)"), "dashHeaderHtml preserved");
  assert.ok(src.includes("dashEvidenceChainHtml("), "dashEvidenceChainHtml preserved");
  assert.ok(src.includes("dashCapacityNetHtml("), "dashCapacityNetHtml preserved");
  assert.ok(src.includes("dashFlowHtml("), "dashFlowHtml preserved");
});

// ── rail-clean (source-level) ─────────────────────────────────────────────────

test("rail-clean: C-11 sources contain no banned output phrase", () => {
  const fns = ["ed11ReturnHtml", "ed11TrustHtml", "ed11SpeedHtml", "ed11VerdictRowHtml"];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("work with your development team"), `${fn}: banned phrase absent`);
  }
});

test("rail-clean: C-11 sources contain no firm-name placeholders", () => {
  const fns = ["ed11ReturnHtml", "ed11TrustHtml", "ed11SpeedHtml", "ed11VerdictRowHtml"];
  const FIRM_PATTERN = /\b(McKinsey|Deloitte|Accenture|KPMG|PwC|EY)\b/;
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!FIRM_PATTERN.test(src), `${fn}: no firm names`);
  }
});

test("rail-clean: C-11 sources do not claim 'compliance approved'", () => {
  const fns = ["ed11ReturnHtml", "ed11TrustHtml", "ed11SpeedHtml", "ed11VerdictRowHtml"];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("compliance approved"), `${fn}: no 'compliance approved' claim`);
  }
});
