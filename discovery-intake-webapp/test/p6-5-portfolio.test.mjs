// P6-5 — Portfolio Preview, Roadmap & Multi-Layer Surfacing. Executed,
// deterministic tests over the real shipped code. Proves the ten P6-5 guarantees:
//   1. Views render even with low completeness (never a dead end).
//   2. 66%+ functional drafts appear in portfolio discussion surfaces.
//   3. Below-66% early drafts still render with clear caution.
//   4. Official counted totals still require the strict confirmation/engine gate.
//   5. Draft/potential items are visually + structurally separate from official.
//   6. Criticality is independent from technical fit, policy fit, economics, confidence.
//   7. Heatmap/roadmap inputs combine more than two dimensions.
//   8. Sensitive-system items are not automatically blocked.
//   9. Rail-clean language is preserved.
//  10. Existing Phase 4/5/6 behavior remains intact (scorers/gate untouched).
// Plus the NEW criticality sidecar (manual + AI-suggest, multi-value, descriptive).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();
const serverSource = readServerSource();

const CONSTS = [
  // P6-0 work-graph contract (the real primitives P6-5 delegates to)
  "WORK_ITEM_LEVELS", "WORK_ITEM_LEVEL_ALIASES", "WORK_ITEM_RELATIONSHIPS",
  "WORK_ITEM_CONFIRM_STATES", "WORK_ITEM_ORIGINS", "WORK_ITEM_COMPLETENESS_BANDS",
  "WORK_ITEM_FUNCTIONAL_DRAFT_PCT", "WORK_ITEM_RELIED_FIELDS",
  "WORK_ITEM_MANDATORY_FIELDS", "WORK_ITEM_OPTIONAL_FIELDS", "WORK_ITEM_FIELD_META",
  // P6-5
  "CRITICALITY_KINDS", "CRITICALITY_LABELS", "CRITICALITY_MAX", "CRITICALITY_HUE",
  "PORTFOLIO_TRUST_TIERS", "PORTFOLIO_ROADMAP_BUCKETS", "PORTFOLIO_CLUSTER_AXES", "PORTFOLIO_VIEWS"
];
const FUNCTIONS = [
  // P6-0
  "normalizeWorkItemLevel", "workItemLevelRank", "workItemField", "workItemFieldPresent",
  "workItemProvenanceRollup", "makeWorkItem", "workItemCompleteness", "rollupCountableItems",
  // P6-5 criticality sidecar
  "ensureCriticalityTags", "isCriticalityKind", "sanitizeCriticalityValues", "criticalityOf",
  "setCriticalityValues", "toggleCriticality", "applyCriticalitySuggestion",
  "confirmCriticality", "rejectCriticality", "criticalityChipsHtml",
  // P6-5 model
  "portfolioSafe", "portfolioCompletenessTier", "portfolioRoadmapBucketMeta", "portfolioRoadmapAction",
  "portfolioItemView", "buildPortfolioSurface", "buildPortfolioHeatmap", "buildPortfolioClustersByAxis",
  // P6-5 render — the REAL builders for all 7 views (none stubbed, so a regression
  // that made a view throw or render blank fails the suite)
  "portfolioActiveView", "portfolioTierBadgeHtml", "portfolioAxisChipsHtml", "portfolioItemRowHtml",
  "portfolioEmptyFrameHtml", "portfolioAllWorkHtml", "portfolioPreviewHtml", "portfolioRoadmapHtml",
  "portfolioDepartmentHtml", "portfolioRoleHtml", "portfolioHeatmapHtml", "portfolioConstellationHtml",
  "portfolioViewBodyHtml", "portfolioViewSwitcherHtml",
  // P6-5 integration glue (current workflow → enriched entries → surface)
  "portfolioStepDepartment", "portfolioEntryFromStep", "portfolioEntries", "portfolioSurfaceForCurrent"
];

function S(state, overrides = {}) {
  const rank = { inferred: 0, computed: 1, stated: 2 };
  const globals = Object.assign({
    state: state || { criticalityTags: {}, portfolioView: "all-work", portfolioClusterAxis: "system" },
    escapeHtml: (s) => String(s == null ? "" : s),
    provenanceBadgeHtml: (src) => `[${src}]`,
    heatmapSourceDot: (st) => (st ? `<dot:${st}>` : ""),
    heatmapLegendHtml: () => "<legend>",
    provenanceToState: (src) => src === "ai-inferred" ? "inferred" : (src === "user-stated" || src === "user-edited" ? "stated" : "computed"),
    leastAssertedState: (arr) => (Array.isArray(arr) && arr.length) ? arr.reduce((a, b) => rank[b] < rank[a] ? b : a) : null,
    // Only the EXTERNAL cross-workflow builders the two views reuse are stubbed;
    // the portfolio Department/Role builders themselves run for real (extracted).
    departmentHeatmapHtml: () => "",
    roleFootprintHtml: () => ""
  }, overrides);
  const code = [
    ...CONSTS.map((n) => extractConst(source, n)),
    ...FUNCTIONS.map((n) => extractFunction(source, n))
  ].join("\n\n");
  const names = [...CONSTS, ...FUNCTIONS];
  const factory = new Function(...Object.keys(globals), `${code}\nreturn { ${names.join(", ")} };`);
  return factory(...Object.values(globals));
}

// Build a P6-0 work item with the chosen mandatory/optional groups present, so we
// control its completeness percentage exactly. den = 6*2 + 5*1 = 17.
const MAND_FIELDS = { dataTier: "PII", entitlement: "read", actionVerb: "reconcile", systems: "GL", control: "four-eyes", decisionOwnership: "human-in-loop" };
const OPT_FIELDS = { label: "Step", class: "judgment", handoff: "to ops", solutionPlacement: "prompt", economics: "draft" };
function mkItem(sb, id, mandCount, optCount, confirmationState = "captured") {
  const input = { id, level: "step", origin: "captured", confirmationState };
  Object.keys(MAND_FIELDS).slice(0, mandCount).forEach((k) => { input[k] = MAND_FIELDS[k]; });
  Object.keys(OPT_FIELDS).slice(0, optCount).forEach((k) => { if (k === "label") input.label = OPT_FIELDS[k]; else input[k] = OPT_FIELDS[k]; });
  return sb.makeWorkItem(input);
}
function entry(sb, id, mandCount, optCount, opts = {}) {
  return Object.assign({ id, label: opts.label || id, item: mkItem(sb, id, mandCount, optCount), confirmed: opts.confirmed === true }, opts.axes || {});
}

// ── 1. Views render even with low completeness ──────────────────────────────

test("P6-5 (1): every view renders something useful even at low completeness — never a dead end", () => {
  const st = { criticalityTags: {}, portfolioView: "all-work", portfolioClusterAxis: "system" };
  const sb = S(st);
  const low = sb.buildPortfolioSurface([entry(sb, "s1", 1, 0)], {}); // ~12% early draft
  // ALL SEVEN views (real builders, none stubbed) render real content at low completeness.
  assert.equal(sb.PORTFOLIO_VIEWS.length, 7, "seven portfolio views");
  for (const def of sb.PORTFOLIO_VIEWS) {
    st.portfolioView = def.id;
    const html = sb.portfolioViewBodyHtml(low);
    assert.ok(typeof html === "string" && html.length > 0, `${def.id} renders non-empty at low completeness`);
    assert.ok(!/blocked/i.test(html), `${def.id} never blocks`);
  }
  // An empty workflow still paints a frame with real GUIDANCE copy (not a blank shell).
  const empty = sb.buildPortfolioSurface([], {});
  const emptyHtml = sb.portfolioAllWorkHtml(empty);
  assert.match(emptyHtml, /capture|Discovery|early draft/i, "empty state carries guidance copy, not a blank div");
  assert.ok(!/blocked/i.test(emptyHtml), "empty state guides, never blocks");
});

// ── 2. 66%+ functional drafts appear in discussion surfaces ─────────────────

test("P6-5 (2): a 66%+ functional draft appears in the portfolio discussion surfaces", () => {
  const sb = S();
  const fn = entry(sb, "fn1", 6, 0); // 6 mandatory + 0 optional = 71% → functional-draft
  const view = sb.portfolioItemView(fn);
  assert.equal(view.completenessTier, "functional-draft");
  assert.ok(view.pct >= 66 && view.pct <= 79, `functional band pct ${view.pct}`);
  const surface = sb.buildPortfolioSurface([fn], {});
  assert.equal(surface.potential.byTier["functional-draft"].length, 1, "in the functional-draft potential band");
  const html = sb.portfolioPreviewHtml(surface);
  assert.match(html, /Discussion-ready potential/);
  assert.match(html, /fn1/);
});

// ── 3. Below-66% early drafts still render with caution ─────────────────────

test("P6-5 (3): a below-66% early draft still renders, clearly cautioned and labelled early", () => {
  const sb = S();
  const early = entry(sb, "e1", 2, 0); // ~24% → directional → early-draft tier
  const view = sb.portfolioItemView(early);
  assert.equal(view.completenessTier, "early-draft");
  assert.ok(view.pct < 66);
  const surface = sb.buildPortfolioSurface([early], {});
  const all = sb.portfolioAllWorkHtml(surface);
  assert.match(all, /e1/, "early draft is shown, not hidden");
  const preview = sb.portfolioPreviewHtml(surface);
  assert.match(preview, /Early drafts \(visible, cautious\)/);
  assert.match(preview, /early draft/i);
});

// ── 4. Official counted requires the strict confirmation/engine gate ────────

test("P6-5 (4): official counted requires confirmation — a 100% UNCONFIRMED item is never counted", () => {
  const sb = S();
  const full = entry(sb, "f1", 6, 5, { confirmed: false }); // 100% but unconfirmed
  const v = sb.portfolioItemView(full);
  assert.equal(v.pct, 100, "fully captured");
  assert.equal(v.officialCounted, false, "a high percentage NEVER bypasses the confirmation gate");
  const surfaceUnconfirmed = sb.buildPortfolioSurface([full], {});
  assert.equal(surfaceUnconfirmed.official.count, 0, "unconfirmed → not in official count");
  // Confirming (the gate verdict) flips it to officially counted.
  const confirmed = entry(sb, "f1", 6, 5, { confirmed: true });
  const v2 = sb.portfolioItemView(confirmed);
  assert.equal(v2.officialCounted, true, "confirmed + safety-gated → officially counted");
  const surfaceConfirmed = sb.buildPortfolioSurface([confirmed], {});
  assert.equal(surfaceConfirmed.official.count, 1, "confirmed → counted");
});

test("P6-5 (4b): a confirmed item missing a mandatory safety field is still NOT counted", () => {
  const sb = S();
  // confirmed but only 5 of 6 mandatory safety groups present → mandatory gate fails
  const unsafe = entry(sb, "u1", 5, 5, { confirmed: true });
  const v = sb.portfolioItemView(unsafe);
  assert.equal(v.officialCounted, false, "missing safety field is never bypassed by confirmation");
});

// ── 5. Potential and official are structurally separate ─────────────────────

test("P6-5 (5): Portfolio Potential and Official Counted are structurally separate", () => {
  const sb = S();
  const draftHi = entry(sb, "d1", 6, 2, { confirmed: false }); // 82% high-confidence draft, not counted
  const official = entry(sb, "o1", 6, 5, { confirmed: true }); // 100% confirmed, counted
  const surface = sb.buildPortfolioSurface([draftHi, official], {});
  assert.equal(surface.potential.total, 2, "potential holds draft + confirmed");
  assert.equal(surface.official.count, 1, "official holds only the confirmed/gate-passed one");
  const officialIds = surface.official.views.map((x) => x.id);
  assert.ok(officialIds.includes("o1") && !officialIds.includes("d1"), "the draft is never in official");
  // the high-confidence draft is previewEligible (provisional) but NOT counted (official)
  const dv = surface.views.find((x) => x.id === "d1");
  assert.equal(dv.previewEligible, true);
  assert.equal(dv.officialCounted, false, "previewEligible (provisional) is weaker than counted (official)");
});

// ── 6. Criticality is independent from fit / policy / economics / confidence ─

test("P6-5 (6): no scorer / gate / economics / policy / completeness fn references the criticality axis", () => {
  const isolatedFrom = [
    "getStepOpportunityMeta", "scoreRecipeReadiness", "stepTrustSignals",
    "recipeGateCheck", "isUnitConfirmed", "confirmedView", "rollupCountableItems",
    "buildUnitEconomics", "confirmedUnitEconomics", "policyEntitlementFitForStep", "workItemCompleteness"
  ];
  const tokens = ["criticalityTags", "criticalityOf", "setCriticalityValues", "applyCriticalitySuggestion", "CRITICALITY_KINDS", "toggleCriticality"];
  for (const fn of isolatedFrom) {
    const body = extractFunction(source, fn);
    for (const tok of tokens) assert.ok(!body.includes(tok), `${fn} must not reference ${tok}`);
  }
});

test("P6-5 (6b): the criticality sidecar references no scorer / gate / economics fn (orthogonal both ways)", () => {
  const critFns = ["criticalityOf", "setCriticalityValues", "toggleCriticality", "applyCriticalitySuggestion", "confirmCriticality", "rejectCriticality", "criticalitySuggestionInput", "criticalityTagHtml", "criticalityPickerHtml"];
  const forbidden = ["getStepOpportunityMeta", "scoreRecipeReadiness", "recipeGateCheck", "isUnitConfirmed", "buildUnitEconomics", "policyEntitlementFitForStep", "patchField"];
  for (const fn of critFns) {
    const body = extractFunction(source, fn);
    for (const tok of forbidden) assert.ok(!body.includes(tok), `${fn} must not reference ${tok}`);
  }
});

test("P6-5 (6c): setting criticality changes neither completeness/counted nor the roadmap bucket", () => {
  const st = { criticalityTags: {} };
  const sb = S(st);
  const item = mkItem(sb, "s1", 6, 2, "captured");
  const before = sb.workItemCompleteness(item, { confirmed: true });
  sb.setCriticalityValues("s1", ["revenue-linked", "control-critical"]);
  const after = sb.workItemCompleteness(item, { confirmed: true });
  assert.deepEqual(after, before, "criticality is not a relied field — completeness/counted unmoved");
  // roadmap bucket is independent of criticality
  const noCrit = sb.portfolioItemView({ id: "s1", label: "s1", item, confirmed: false, policyFit: { fit: "permitted" }, economics: { value: { total: 5 } }, previewEligible: true });
  const withCrit = sb.portfolioItemView({ id: "s1", label: "s1", item, confirmed: false, policyFit: { fit: "permitted" }, economics: { value: { total: 5 } }, criticality: { value: ["control-critical"], source: "user-stated" } });
  assert.equal(noCrit.roadmapAction, withCrit.roadmapAction, "criticality never routes the roadmap");
  // Independence through the CONSUMING surface: the same confirmed item with and
  // without criticality yields identical pct / previewEligible / officialCounted /
  // official count — criticality moves nothing official.
  const base = { id: "s9", label: "s9", item: mkItem(sb, "s9", 6, 5), confirmed: true };
  const sBare = sb.buildPortfolioSurface([base], {});
  const sCrit = sb.buildPortfolioSurface([Object.assign({}, base, { criticality: { value: ["revenue-linked", "control-critical"], source: "user-stated" } })], {});
  assert.equal(sBare.official.count, sCrit.official.count, "criticality never changes the official count");
  const vBare = sBare.views[0], vCrit = sCrit.views[0];
  assert.equal(vBare.pct, vCrit.pct);
  assert.equal(vBare.previewEligible, vCrit.previewEligible);
  assert.equal(vBare.officialCounted, vCrit.officialCounted);
});

// ── 7. Heatmap combines more than two dimensions ────────────────────────────

test("P6-5 (7): the multi-layer heatmap combines >2 independent dimensions", () => {
  const sb = S();
  const e = entry(sb, "s1", 6, 2, {
    confirmed: false,
    axes: {
      workIntent: { value: "reconcile", source: "user-stated" },
      role: { value: "analysis", source: "ai-inferred" },
      criticality: { value: ["revenue-linked"], source: "user-stated" },
      policyFit: { fit: "permitted-with-controls" },
      economics: null, economicsDraft: true,
      systems: ["GL"]
    }
  });
  const surface = sb.buildPortfolioSurface([e], {});
  const hm = sb.buildPortfolioHeatmap(surface);
  assert.ok(hm.dimensions.length >= 3, "heatmap layers >2 dimensions");
  const row = hm.rows[0];
  assert.ok("completenessTier" in row && "criticality" in row && "economicsState" in row && "policyState" in row && "workIntent" in row, "row exposes multiple independent layers");
  assert.equal(row.economicsState, "draft");
  assert.equal(row.policyState, "permitted-with-controls");
  assert.deepEqual(row.criticality, ["revenue-linked"]);
  // Layers are INDEPENDENTLY sourced: two items identical except for criticality
  // produce heatmap rows that differ ONLY in the criticality field (not collapsed
  // into one score).
  const same = { item: mkItem(sb, "x", 6, 2), confirmed: false, workIntent: { value: "reconcile", source: "user-stated" }, policyFit: { fit: "permitted" }, economicsDraft: true, systems: ["GL"] };
  const a = sb.buildPortfolioHeatmap(sb.buildPortfolioSurface([Object.assign({ id: "a", label: "a" }, same, { item: mkItem(sb, "a", 6, 2) })], {})).rows[0];
  const b = sb.buildPortfolioHeatmap(sb.buildPortfolioSurface([Object.assign({ id: "b", label: "b" }, same, { item: mkItem(sb, "b", 6, 2), criticality: { value: ["client-impacting"], source: "user-stated" } })], {})).rows[0];
  assert.equal(a.completenessTier, b.completenessTier);
  assert.equal(a.economicsState, b.economicsState);
  assert.equal(a.policyState, b.policyState);
  assert.equal(a.workIntent, b.workIntent);
  assert.deepEqual(a.criticality, []);
  assert.deepEqual(b.criticality, ["client-impacting"], "only the criticality layer moved");
});

// ── 8. Sensitive-system items are not automatically blocked ─────────────────

test("P6-5 (8): a sensitive item with described access is NOT blocked; unknown access becomes a question", () => {
  const sb = S();
  // there is no 'blocked' roadmap bucket at all
  assert.ok(!sb.PORTFOLIO_ROADMAP_BUCKETS.some((b) => /block/i.test(b.id) || /block/i.test(b.label)), "no blocked bucket exists");
  // a sensitive (PII) step with described/permitted access routes to a normal bucket, never blocked
  const sensitive = entry(sb, "s1", 6, 0, { axes: { policyFit: { fit: "permitted", status: "assumed-permitted" }, economics: { value: { total: 10 } }, previewEligible: false } });
  const v = sb.portfolioItemView(sensitive);
  assert.notEqual(v.roadmapAction, "needs-entitlement-confirmation", "described access is not treated as unknown");
  assert.ok(PORTFOLIO_BUCKET_IDS(sb).includes(v.roadmapAction), "lands in a real, non-blocking bucket");
  // unknown access → a confirmation question, not a wall
  const unknown = entry(sb, "s2", 6, 0, { axes: { policyFit: { fit: "needs-permission-info", status: "unknown" } } });
  const v2 = sb.portfolioItemView(unknown);
  assert.equal(v2.roadmapAction, "needs-entitlement-confirmation", "unknown permission → a question, never a block");
});
function PORTFOLIO_BUCKET_IDS(sb) { return sb.PORTFOLIO_ROADMAP_BUCKETS.map((b) => b.id); }

test("P6-5 (8b): every roadmap branch routes to its exact bucket, and permission precedes control-heavy (priority locked)", () => {
  const sb = S();
  const cases = [
    [{ officialCounted: true }, "ready-for-pilot"],
    [{ compound: true }, "needs-decomposition"],
    [{ policyFit: { status: "unknown" } }, "needs-entitlement-confirmation"],
    [{ policyFit: { fit: "needs-permission-info" } }, "needs-entitlement-confirmation"],
    [{ policyFit: { fit: "requires-authority" } }, "needs-policy-review"],
    [{ policyFit: { fit: "restricted" } }, "needs-policy-review"],
    [{ controlHeavy: true }, "control-heavy"],
    [{ policyFit: { fit: "permitted-with-controls" } }, "needs-policy-review"],
    [{ economics: { value: { total: 5 } }, previewEligible: true }, "ready-for-pilot"],
    [{ economics: { value: { total: 5 } } }, "needs-economics-estimate"],
    [{ economicsDraft: true }, "economics-promising-uncertain"],
    [{ previewEligible: true }, "ready-for-pilot"],
    [{}, "needs-economics-estimate"]
  ];
  for (const [view, want] of cases) assert.equal(sb.portfolioRoadmapAction(view), want, JSON.stringify(view));
  // priority: an item that is restricted AND control-heavy stays a policy-review (permission wins),
  // never silently downgraded — locks the branch ordering.
  assert.equal(sb.portfolioRoadmapAction({ policyFit: { fit: "restricted" }, controlHeavy: true }), "needs-policy-review");
  // every bucket id a roadmap action can emit is a real, declared bucket
  const ids = new Set(PORTFOLIO_BUCKET_IDS(sb));
  for (const [view] of cases) assert.ok(ids.has(sb.portfolioRoadmapAction(view)));
});

// ── 9. Rail-clean language preserved ────────────────────────────────────────

test("P6-5 (9): all P6-5 code is rail-clean (no headcount/FTE/automation/reduction framing), no gradient", () => {
  const p65Fns = [
    "criticalityChipsHtml", "criticalityTagHtml", "criticalityPickerHtml", "stepCriticalityHtml",
    "criticalitySuggestionInput", "portfolioRoadmapAction", "portfolioItemView", "buildPortfolioSurface",
    "buildPortfolioHeatmap", "buildPortfolioClustersByAxis", "portfolioItemRowHtml", "portfolioTierBadgeHtml",
    "portfolioAxisChipsHtml", "portfolioAllWorkHtml", "portfolioPreviewHtml", "portfolioRoadmapHtml",
    "portfolioDepartmentHtml", "portfolioRoleHtml", "portfolioHeatmapHtml", "portfolioConstellationHtml",
    "portfolioStudioBodyHtml", "renderAnalysisTabPortfolio"
  ];
  const forbidden = [
    /headcount/i, /head[\s-]?count/i, /\bfte\b/i, /full-time equivalent/i, /automat/i, /\bROI\b/,
    /hours[\s-]?saved/i, /time[\s-]?saved/i, /lay[\s-]?off/i, /downsize/i, /rightsize/i, /redundanc/i,
    /reduction in force/i, /workforce[\s-]?reduction/i, /\beliminat/i, /cut staff/i,
    /work with your development team/i, /compliance approved/i,
    /\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey|KPMG|PwC)\b/i
  ];
  const renderFns = new Set(["criticalityChipsHtml", "criticalityTagHtml", "criticalityPickerHtml", "stepCriticalityHtml", "portfolioItemRowHtml", "portfolioTierBadgeHtml", "portfolioAxisChipsHtml", "portfolioAllWorkHtml", "portfolioPreviewHtml", "portfolioRoadmapHtml", "portfolioDepartmentHtml", "portfolioRoleHtml", "portfolioHeatmapHtml", "portfolioConstellationHtml", "portfolioStudioBodyHtml"]);
  for (const fn of p65Fns) {
    const body = extractFunction(source, fn);
    for (const re of forbidden) assert.ok(!re.test(body), `${fn}: rail violation ${re}`);
    if (renderFns.has(fn)) assert.ok(!/gradient/i.test(body), `${fn}: no gradient on a data surface`);
  }
  // the rendered HTML of ALL views (incl Department/Role, with populated axes) is rail-clean too
  const sb = S();
  const surface = sb.buildPortfolioSurface([entry(sb, "s1", 6, 2, { axes: {
    department: "operations",
    role: { value: "analysis", source: "user-stated" },
    workIntent: { value: "reconcile", source: "user-stated" },
    criticality: { value: ["client-impacting", "control-critical"], source: "user-stated" }
  } })], {});
  const html = sb.portfolioAllWorkHtml(surface) + sb.portfolioPreviewHtml(surface) + sb.portfolioRoadmapHtml(surface)
    + sb.portfolioHeatmapHtml(surface) + sb.portfolioDepartmentHtml(surface) + sb.portfolioRoleHtml(surface)
    + sb.portfolioConstellationHtml(surface);
  for (const re of forbidden) assert.ok(!re.test(html), `rendered HTML rail violation ${re}`);
  assert.ok(!/gradient/i.test(html), "no gradient in rendered HTML");
});

// ── 10. Existing behavior intact (scorers/gate untouched by P6-5) ───────────

test("P6-5 (10): the opportunity scorer and gate reference no portfolio/criticality token (unchanged)", () => {
  const untouched = ["getStepOpportunityMeta", "scoreRecipeReadiness", "recipeGateCheck", "isUnitConfirmed", "confirmUnit", "buildLeaderView"];
  const tokens = ["buildPortfolioSurface", "portfolioItemView", "criticalityOf", "criticalityTags", "renderAnalysisTabPortfolio"];
  for (const fn of untouched) {
    let body;
    try { body = extractFunction(source, fn); } catch { continue; } // buildLeaderView lives in the engine
    for (const tok of tokens) assert.ok(!body.includes(tok), `${fn} must not reference ${tok}`);
  }
  // P6-5 surfacing is read-only: no grid write, no model call, no recompute in the model/render path
  const readOnly = ["buildPortfolioSurface", "portfolioItemView", "buildPortfolioHeatmap", "buildPortfolioClustersByAxis", "portfolioEntries", "portfolioSurfaceForCurrent", "portfolioStudioBodyHtml", "renderAnalysisTabPortfolio", "wirePortfolio", "portfolioEntryFromStep"];
  for (const fn of readOnly) {
    const body = extractFunction(source, fn);
    assert.ok(!/patchField/.test(body), `${fn}: no grid write`);
    assert.ok(!/requestJson|fetch\(/.test(body), `${fn}: no model/server call in the surfacing path`);
  }
});

// ── Integration glue: current workflow → enriched entries → surface ─────────

test("P6-5 integration: the real grid→entry→surface glue produces an honest, gate-correct surface", () => {
  // A fully-captured, confirmed step + a sparse, unconfirmed step, run through the
  // REAL portfolioEntryFromStep mapping (cells → work item) and buildPortfolioSurface.
  const confirmedIds = new Set(["full"]);
  const steps = [
    { id: "full", cls: "judgment", cells: { name: "Reconcile balances", systemsTools: "GL", dataProcessing: "client holdings", rulesDecisionLogic: "match and approve", output: "approved file", humanCheckpoint: "reviewer signs", handoff: "to ops", regulatoryContext: "audit logging", frequencyVolume: "20/week" } },
    { id: "thin", cls: "", cells: { name: "Note something" } }
  ];
  const st = { criticalityTags: { full: { value: ["control-critical"], source: "user-stated", confidence: 1 } }, sessionMeta: { departmentTag: { value: "Finance Ops" } }, economicsAssumptions: {} };
  const stubs = {
    state: st,
    analysisGridSteps: () => steps,
    gridCellValue: (s, k) => (s && s.cells && typeof s.cells[k] === "string" ? s.cells[k] : ""),
    structuralCellText: (s, k) => (s && s.cells && typeof s.cells[k] === "string" ? s.cells[k] : ""),
    currentAiPolicy: () => null,
    engineDataTier: (s) => (s.id === "full" ? "confidential" : ""),
    stepEntitlementStatus: (s) => (s.id === "full" ? "assumed-permitted" : "unspecified"),
    detectActionTier: (t) => (t && t.trim() ? { action: "approve", tier: 3, controlFloor: ["named-authority"] } : null),
    workIntentOf: (id) => (id === "full" ? { value: "approve", source: "user-stated", confidence: 1 } : null),
    roleTagOf: () => null,
    policyEntitlementFitForStep: (s) => (s.id === "full" ? { status: "assumed-permitted", fit: "permitted", requiredControls: [] } : { status: "unspecified", fit: "permitted", requiredControls: [] }),
    confirmedUnitEconomics: () => null,
    detectCompoundStep: () => false,
    stepDisplayName: (s, i) => "Step " + i,
    isUnitConfirmed: (id) => confirmedIds.has(id)
  };
  const sb = S(st, stubs);
  const surface = sb.portfolioSurfaceForCurrent();
  assert.equal(surface.views.length, 2, "both captured steps surface (none hidden)");
  // the fully-captured + confirmed step is officially counted; the thin one is not
  const full = surface.views.find((v) => v.id === "full");
  const thin = surface.views.find((v) => v.id === "thin");
  assert.equal(full.officialCounted, true, "captured + confirmed + safety-gated → officially counted");
  assert.equal(thin.officialCounted, false, "sparse / unconfirmed → potential only, never counted");
  assert.equal(surface.official.count, 1, "official count is gate-driven, not item-count");
  // the real entry mapping carried the descriptive axes honestly
  assert.deepEqual(full.criticality.value, ["control-critical"], "criticality axis surfaced");
  assert.equal(full.department, "Finance Ops", "department surfaced from the engagement tag");
  assert.equal(full.workIntent.value, "approve");
  assert.ok(thin.pct < full.pct, "completeness reflects real capture");
});

// ── Criticality sidecar (NEW descriptive axis) ──────────────────────────────

test("P6-5 criticality: manual set is user-stated, multi-value, on-vocabulary, de-duped and capped", () => {
  const st = { criticalityTags: {} };
  const sb = S(st);
  assert.equal(sb.criticalityOf("s1"), null, "byte-identical-when-unused → null");
  sb.setCriticalityValues("s1", ["revenue-linked", "control-critical", "revenue-linked", "not-a-real-kind"]);
  const tag = sb.criticalityOf("s1");
  assert.deepEqual(tag.value, ["revenue-linked", "control-critical"], "off-vocab dropped, de-duped, canonical order");
  assert.equal(tag.source, "user-stated");
  assert.equal(tag.confidence, 1);
  // cap at CRITICALITY_MAX
  sb.setCriticalityValues("s2", sb.CRITICALITY_KINDS.concat(sb.CRITICALITY_KINDS));
  assert.equal(sb.criticalityOf("s2").value.length, sb.CRITICALITY_MAX);
});

test("P6-5 criticality: toggle adds/removes a single reason", () => {
  const st = { criticalityTags: {} };
  const sb = S(st);
  sb.toggleCriticality("s1", "client-impacting");
  assert.deepEqual(sb.criticalityOf("s1").value, ["client-impacting"]);
  sb.toggleCriticality("s1", "high-volume");
  assert.deepEqual(sb.criticalityOf("s1").value, ["client-impacting", "high-volume"]);
  sb.toggleCriticality("s1", "client-impacting");
  assert.deepEqual(sb.criticalityOf("s1").value, ["high-volume"]);
});

test("P6-5 criticality: an AI suggestion is ai-inferred and NEVER auto-hardens until confirmed", () => {
  const st = { criticalityTags: {} };
  const sb = S(st);
  // off-vocab / empty suggestion writes NO key (never fabricated)
  assert.equal(sb.applyCriticalitySuggestion("s1", { value: ["bogus"], confidence: 0.9 }), false);
  assert.equal(sb.criticalityOf("s1"), null);
  // a valid suggestion is stored ai-inferred
  assert.equal(sb.applyCriticalitySuggestion("s1", { value: ["decision-point", "expertise-dependent"], confidence: 0.7 }), true);
  const tag = sb.criticalityOf("s1");
  assert.equal(tag.source, "ai-inferred", "suggestion is a draft, never auto-hardened");
  assert.deepEqual(tag.value, ["decision-point", "expertise-dependent"]);
  // confirm promotes to user-stated (value preserved); reject deletes
  assert.equal(sb.confirmCriticality("s1"), true);
  assert.equal(sb.criticalityOf("s1").source, "user-stated");
  assert.equal(sb.rejectCriticality("s1"), true);
  assert.equal(sb.criticalityOf("s1"), null);
});

test("P6-5 criticality: confidence is clamped to [0,1]; chips render with text labels and no gradient", () => {
  const st = { criticalityTags: {} };
  const sb = S(st);
  sb.applyCriticalitySuggestion("s1", { value: ["high-volume"], confidence: 7 });
  assert.equal(sb.criticalityOf("s1").confidence, 0.5, "out-of-range confidence → default 0.5");
  assert.equal(sb.criticalityChipsHtml([]), "", "empty → no chips");
  const chips = sb.criticalityChipsHtml(["control-critical"]);
  assert.match(chips, /Control-critical/, "chip carries a text label");
  assert.ok(!/gradient/i.test(chips), "chips are flat-fill, no gradient");
});

// ── Load passthrough + tab wiring + reserved Human Pink ─────────────────────

test("P6-5: normalizeLoadedState passes criticalityTags through unchanged (never promotes on load)", () => {
  const norm = extractFunction(source, "normalizeLoadedState");
  assert.match(norm, /criticalityTags:\s*parsed\.criticalityTags/, "load backfills criticalityTags");
  assert.ok(!/criticalityTags[\s\S]{0,80}user-stated/.test(norm), "load never rewrites criticality to user-stated");
  assert.match(norm, /portfolioView:/, "portfolio view state backfilled");
});

test("P6-5: the Portfolio Studio tab is registered and routed", () => {
  const tabs = extractConst(source, "ANALYSIS_TABS");
  assert.match(tabs, /"portfolio"/, "portfolio tab id registered");
  const dispatch = extractFunction(source, "renderAnalysisStudio");
  assert.match(dispatch, /active === "portfolio".*renderAnalysisTabPortfolio/s, "dispatcher routes the portfolio tab");
});

test("P6-5: criticality reserves Caution Amber and does NOT use the reserved Human Pink hue", () => {
  const hue = extractConst(source, "CRITICALITY_HUE");
  assert.match(hue, /#FFB454/, "criticality uses locked Caution Amber");
  // Human Pink (#FF4FD8 / #ff4fc8) is reserved for human-hold/judgment, not criticality consequence
  const critRender = extractFunction(source, "criticalityChipsHtml") + extractFunction(source, "criticalityPickerHtml");
  assert.ok(!/#ff4fd8/i.test(critRender), "criticality chips never use the reserved human-hold hue");
});

// ── Server endpoint (descriptive classifier discipline) ─────────────────────

test("P6-5: the /api/suggest-criticality endpoint is registered and descriptive-only", () => {
  assert.match(serverSource, /pathname === "\/api\/suggest-criticality"/, "route registered");
  assert.match(serverSource, /handleSuggestCriticality/, "handler wired");
  const handler = extractServerFunction(serverSource, "handleSuggestCriticality");
  // validates against the allowed set server-side; never fabricates
  assert.match(handler, /CRITICALITY_KINDS_SERVER/, "server-side allowed-set validation");
  assert.match(handler, /value: null/, "off-set/empty → no suggestion (null)");
  // descriptive-only: never the scoring / business-case / recipe paths
  for (const tok of ["opportunity", "businessCase", "scoreRecipe", "buildAgentRecipeIr", "headcount", "FTE"]) {
    assert.ok(!handler.includes(tok), `handler must not reference ${tok}`);
  }
  // the system prompt carries the locked descriptive refusal clause
  const prompt = serverSource.slice(serverSource.indexOf("CRITICALITY_SUGGEST_SYSTEM_PROMPT"), serverSource.indexOf("CRITICALITY_SUGGEST_SYSTEM_PROMPT") + 1200);
  assert.match(prompt, /DESCRIPTIVE classification ONLY/);
  assert.match(prompt, /never produce a headcount, an FTE count/);
});
// server.mjs is a module — extract a top-level (async) function the same way.
function extractServerFunction(src, name) {
  const match = src.match(new RegExp(`(?:async )?function ${name}\\b`));
  assert.notEqual(match, null, `server function ${name} not found`);
  const start = match.index;
  let depth = 0; let bodyStart = src.indexOf("{", src.indexOf("(", start));
  for (let i = bodyStart; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  assert.fail(`unbalanced braces extracting ${name}`);
}
