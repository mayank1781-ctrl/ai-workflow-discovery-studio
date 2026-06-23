// C-12 — Workforce Transformation: freed capacity → redesigned roles / redeployment / reskilling.
// C12a seniority lens: Analyst / Manager / Senior bands from role title.
// Tests use source-level extraction (buildSandbox) — no DOM, no live engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Sandbox ────────────────────────────────────────────────────────────────────

function wfSandbox() {
  return buildSandbox(source, {
    consts: ["WF_BAND"],
    functions: [
      "wfSeniorityBand", "wfHrsLabel", "wfRoleCardHtml",
      "wfSeniorityLensHtml", "wfRedeployTracksHtml", "wfMixBarHtml", "wfEmptyHtml",
      "escapeHtml"
    ],
    globals: {
      document: { getElementById: () => null },
      console: { warn() {}, error() {}, info() {} }
    }
  });
}

function makeRole(role, opts = {}) {
  return {
    role,
    freedHrs: opts.freedHrs ?? 4.5,
    assemblyShare: opts.assemblyShare ?? 0.55,
    humanHeldShare: opts.humanHeldShare ?? 0.30,
    shift: opts.shift ?? `assembly ${Math.round((opts.assemblyShare ?? 0.55) * 100)}% → judgment ${Math.round((opts.humanHeldShare ?? 0.30) * 100)}%`
  };
}

function makeLv(opts = {}) {
  return {
    confirmedCount: opts.confirmedCount ?? 1,
    breakdown: {
      deployable: {
        chain: { freedHrs: opts.freedHrs ?? 8.5 }
      }
    }
  };
}

// ── wfSeniorityBand ───────────────────────────────────────────────────────────

test("wfSeniorityBand: analyst/associate/coordinator → analyst band", () => {
  const { wfSeniorityBand } = wfSandbox();
  assert.equal(wfSeniorityBand("Operations analyst"), "analyst");
  assert.equal(wfSeniorityBand("Finance Associate"), "analyst");
  assert.equal(wfSeniorityBand("Reconciliation Coordinator"), "analyst");
  assert.equal(wfSeniorityBand("Junior Specialist"), "analyst");
});

test("wfSeniorityBand: manager/lead/supervisor → manager band", () => {
  const { wfSeniorityBand } = wfSandbox();
  assert.equal(wfSeniorityBand("Operations Manager"), "manager");
  assert.equal(wfSeniorityBand("Team Lead"), "manager");
  assert.equal(wfSeniorityBand("Reconciliation Supervisor"), "manager");
});

test("wfSeniorityBand: senior analyst → manager band (expertise, not exec tier)", () => {
  const { wfSeniorityBand } = wfSandbox();
  assert.equal(wfSeniorityBand("Senior Analyst"), "manager");
  assert.equal(wfSeniorityBand("Senior Operations Analyst"), "manager");
  assert.equal(wfSeniorityBand("Senior Associate"), "manager");
});

test("wfSeniorityBand: director/VP/head/chief/partner → senior band", () => {
  const { wfSeniorityBand } = wfSandbox();
  assert.equal(wfSeniorityBand("Finance Director"), "senior");
  assert.equal(wfSeniorityBand("VP Operations"), "senior");
  assert.equal(wfSeniorityBand("Head of Finance Ops"), "senior");
  assert.equal(wfSeniorityBand("Chief Operating Officer"), "senior");
  assert.equal(wfSeniorityBand("Managing Director"), "senior");
});

test("wfSeniorityBand: unknown / empty → analyst (safe default)", () => {
  const { wfSeniorityBand } = wfSandbox();
  assert.equal(wfSeniorityBand(""), "analyst");
  assert.equal(wfSeniorityBand(null), "analyst");
  assert.equal(wfSeniorityBand("Unknown Role"), "analyst");
});

// ── wfHrsLabel ────────────────────────────────────────────────────────────────

test("wfHrsLabel: null/NaN/undefined → em-dash", () => {
  const { wfHrsLabel } = wfSandbox();
  assert.equal(wfHrsLabel(null), "—");
  assert.equal(wfHrsLabel(undefined), "—");
  assert.equal(wfHrsLabel(NaN), "—");
});

test("wfHrsLabel: hours formatted with hr/wk suffix", () => {
  const { wfHrsLabel } = wfSandbox();
  const out = wfHrsLabel(4.5);
  assert.ok(out.includes("hr/wk"), "hr/wk suffix present");
  assert.ok(out.includes("4.5"), "value present");
});

test("wfHrsLabel: large values use k hr/wk suffix", () => {
  const { wfHrsLabel } = wfSandbox();
  const out = wfHrsLabel(2080);
  assert.ok(out.includes("k hr/wk"), "k suffix for large values");
});

// ── wfRoleCardHtml ────────────────────────────────────────────────────────────

test("wfRoleCardHtml: renders role name and freed capacity", () => {
  const { wfRoleCardHtml } = wfSandbox();
  const out = wfRoleCardHtml(makeRole("Operations analyst", { freedHrs: 6.2 }));
  assert.ok(out.includes("Operations analyst"), "role name present");
  assert.ok(out.includes("6.2"), "freed hours present");
  assert.ok(out.includes("freed capacity"), "freed capacity label present");
});

test("wfRoleCardHtml: renders seniority band label", () => {
  const { wfRoleCardHtml } = wfSandbox();
  const out = wfRoleCardHtml(makeRole("Operations Manager"));
  assert.ok(out.includes("Manager / Lead"), "manager band label present");
});

test("wfRoleCardHtml: renders assembly and judgment bars", () => {
  const { wfRoleCardHtml } = wfSandbox();
  const out = wfRoleCardHtml(makeRole("Analyst", { assemblyShare: 0.55, humanHeldShare: 0.30 }));
  assert.ok(out.includes("Assembly — AI carries"), "assembly bar label");
  assert.ok(out.includes("Judgment / Decision — stays yours"), "judgment bar label");
  assert.ok(out.includes("55%"), "assembly pct shown");
  assert.ok(out.includes("30%"), "judgment pct shown");
});

test("wfRoleCardHtml: no headcount/reduction vocabulary", () => {
  const { wfRoleCardHtml } = wfSandbox();
  const out = wfRoleCardHtml(makeRole("Finance Analyst")).toLowerCase();
  assert.ok(!out.includes("headcount"), "no headcount");
  assert.ok(!out.includes("reduction"), "no reduction");
  assert.ok(!out.includes("eliminate"), "no eliminate");
  assert.ok(!out.includes("layoff"), "no layoff");
  assert.ok(!out.includes("cut "), "no 'cut' usage");
});

// ── wfSeniorityLensHtml ───────────────────────────────────────────────────────

test("wfSeniorityLensHtml: renders all three band cards", () => {
  const { wfSeniorityLensHtml } = wfSandbox();
  const roles = [
    makeRole("Operations analyst"),
    makeRole("Finance Manager"),
    makeRole("Finance Director")
  ];
  const out = wfSeniorityLensHtml(roles);
  assert.ok(out.includes("Analyst / Associate"), "analyst band card present");
  assert.ok(out.includes("Manager / Lead"), "manager band card present");
  assert.ok(out.includes("Director / Senior"), "senior band card present");
});

test("wfSeniorityLensHtml: shows 'Seniority lens' heading", () => {
  const { wfSeniorityLensHtml } = wfSandbox();
  const out = wfSeniorityLensHtml([makeRole("Analyst")]);
  assert.ok(out.toLowerCase().includes("seniority lens"), "seniority lens heading present");
});

test("wfSeniorityLensHtml: empty-band state shows 'No roles in this band yet'", () => {
  const { wfSeniorityLensHtml } = wfSandbox();
  const out = wfSeniorityLensHtml([makeRole("Operations analyst")]);
  assert.ok(out.includes("No roles in this band yet"), "empty band state shown");
});

// ── wfRedeployTracksHtml ──────────────────────────────────────────────────────

test("wfRedeployTracksHtml: contains all three tracks", () => {
  const { wfRedeployTracksHtml } = wfSandbox();
  const out = wfRedeployTracksHtml(makeLv());
  assert.ok(out.includes("Track 1"), "Track 1 present");
  assert.ok(out.includes("Track 2"), "Track 2 present");
  assert.ok(out.includes("Track 3"), "Track 3 present");
  assert.ok(out.includes("Redeploy"), "Redeploy track present");
  assert.ok(out.includes("Reskill"), "Reskill track present");
  assert.ok(out.includes("Redesign"), "Redesign track present");
});

test("wfRedeployTracksHtml: builder ladder text present", () => {
  const { wfRedeployTracksHtml } = wfSandbox();
  const out = wfRedeployTracksHtml(makeLv());
  assert.ok(out.includes("Use → Shape → Evaluate"), "builder ladder progression present");
});

test("wfRedeployTracksHtml: freed hours shown when available", () => {
  const { wfRedeployTracksHtml } = wfSandbox();
  const out = wfRedeployTracksHtml(makeLv({ freedHrs: 8.5 }));
  assert.ok(out.includes("8.5"), "freed hours value shown");
  assert.ok(out.includes("hr/wk"), "unit present");
});

test("wfRedeployTracksHtml: no headcount/reduction vocabulary", () => {
  const { wfRedeployTracksHtml } = wfSandbox();
  const out = wfRedeployTracksHtml(makeLv()).toLowerCase();
  assert.ok(!out.includes("headcount"), "no headcount");
  assert.ok(!out.includes("reduction"), "no reduction");
  assert.ok(!out.includes("eliminate"), "no eliminate");
  assert.ok(!out.includes("layoff"), "no layoff");
});

// ── wfMixBarHtml ─────────────────────────────────────────────────────────────

test("wfMixBarHtml: renders AI/hybrid/human percentages", () => {
  const { wfMixBarHtml } = wfSandbox();
  const out = wfMixBarHtml({ ai: 55, hybrid: 20, human: 25 });
  assert.ok(out.includes("55%"), "AI% present");
  assert.ok(out.includes("20%"), "hybrid% present");
  assert.ok(out.includes("25%"), "human% present");
});

test("wfMixBarHtml: renders three colored segments", () => {
  const { wfMixBarHtml } = wfSandbox();
  const out = wfMixBarHtml({ ai: 50, hybrid: 25, human: 25 });
  assert.ok(out.includes("#4D8BFF"), "AI blue segment");
  assert.ok(out.includes("#9D7BF0"), "hybrid violet segment");
  assert.ok(out.includes("#EC4DA6"), "human-held pink segment");
});

// ── wfEmptyHtml ───────────────────────────────────────────────────────────────

test("wfEmptyHtml: shows default message when no note given", () => {
  const { wfEmptyHtml } = wfSandbox();
  const out = wfEmptyHtml();
  assert.ok(out.includes("Workforce Transformation"), "title present");
  assert.ok(out.includes("Workbench"), "workbench pointer present");
  assert.ok(out.includes("data-workforce-to-workbench"), "CTA button attribute present");
});

test("wfEmptyHtml: custom note rendered", () => {
  const { wfEmptyHtml } = wfSandbox();
  const out = wfEmptyHtml("Engine loading…");
  assert.ok(out.includes("Engine loading"), "custom note rendered");
});

// ── separation invariants (source-level) ─────────────────────────────────────

test("separation: wf* render functions do not call patchField or scorer", () => {
  const fns = [
    "wfRoleCardHtml", "wfSeniorityLensHtml", "wfRedeployTracksHtml",
    "wfMixBarHtml", "wfEmptyHtml", "wireWorkforce"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("patchField"), `${fn}: no patchField`);
    assert.ok(!src.includes("getStepOpportunityMeta"), `${fn}: no scorer`);
  }
});

test("separation: renderAnalysisTabWorkforce does not call patchField or invented endpoint", () => {
  const src = extractFunction(source, "renderAnalysisTabWorkforce");
  assert.ok(!src.includes("patchField"), "no patchField in renderAnalysisTabWorkforce");
  assert.ok(!src.includes("fetch("), "no fetch in renderAnalysisTabWorkforce");
  assert.ok(!src.includes("/api/workforce"), "no invented endpoint");
});

test("separation: renderAnalysisTabWorkforce uses dashboardModel for confirmed records", () => {
  const src = extractFunction(source, "renderAnalysisTabWorkforce");
  assert.ok(src.includes("dashboardModel("), "uses dashboardModel");
  assert.ok(src.includes("engineRoleView("), "calls engineRoleView");
});

// ── rail-clean (source-level) ─────────────────────────────────────────────────

test("rail-clean: wf* functions contain no headcount/reduction vocabulary", () => {
  const fns = [
    "wfRoleCardHtml", "wfSeniorityLensHtml", "wfRedeployTracksHtml",
    "wfMixBarHtml", "renderAnalysisTabWorkforce"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("headcount"), `${fn}: no headcount`);
    assert.ok(!src.includes("layoff"), `${fn}: no layoff`);
    assert.ok(!src.includes("redundanc"), `${fn}: no redundancy`);
  }
});

test("rail-clean: wf* functions do not use 'eliminate' in workforce context", () => {
  const fns = ["wfRoleCardHtml", "wfSeniorityLensHtml", "wfRedeployTracksHtml"];
  for (const fn of fns) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("eliminat"), `${fn}: no eliminate`);
  }
});

test("rail-clean: wf* functions contain no banned output phrase", () => {
  const fns = [
    "wfRoleCardHtml", "wfSeniorityLensHtml", "wfRedeployTracksHtml",
    "wfMixBarHtml", "renderAnalysisTabWorkforce"
  ];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("work with your development team"), `${fn}: banned phrase absent`);
  }
});

test("rail-clean: wf* functions contain no firm names", () => {
  const FIRM = /\b(McKinsey|Deloitte|Accenture|KPMG|PwC|EY)\b/;
  const fns = ["wfRoleCardHtml", "wfSeniorityLensHtml", "wfRedeployTracksHtml", "renderAnalysisTabWorkforce"];
  for (const fn of fns) {
    assert.ok(!FIRM.test(extractFunction(source, fn)), `${fn}: no firm names`);
  }
});
