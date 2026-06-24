// P6-4 — AI unit economics (separate economic-fit layer). Executed, deterministic
// tests over the real shipped code. Proves: run cost / TCO / value are kept SEPARATE;
// missing captured inputs produce questions, never fabricated numbers; confirmed
// permission/control overhead is added only when controls are required (sensitive
// data alone does not raise cost); draft economics never feeds scoring / gates /
// counted; only a confirmed assumption set is read by later rollups; rail-clean.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

const CONSTS = ["ECON_RUN_DRIVERS", "ECON_TCO_DRIVERS", "ECON_VALUE_DRIVERS", "ECON_DEFAULT_ASSUMPTIONS"];
const FUNCTIONS = [
  "econDefaultAssumption", "ensureEconomicsAssumptions", "econAssumptionKey",
  "economicAssumption", "setEconomicAssumption", "confirmEconomicAssumption",
  "rejectEconomicAssumption", "resetEconomicAssumption", "econAssumeValue",
  "economicInputs", "econDriver", "buildUnitEconomics", "confirmedUnitEconomics",
  "unitEconomicsPanelHtml"
];

function S(state, overrides = {}) {
  const globals = Object.assign({
    state: state || { economicsAssumptions: {} },
    gridCellValue: (s, k) => (s && s.cells && typeof s.cells[k] === "string" ? s.cells[k] : ""),
    workIntentOf: () => null,
    escapeHtml: (s) => String(s == null ? "" : s),
    provenanceBadgeHtml: (src) => `[${src}]`
  }, overrides);
  const code = [
    ...CONSTS.map((n) => extractConst(source, n)),
    ...FUNCTIONS.map((n) => extractFunction(source, n))
  ].join("\n\n");
  const names = [...CONSTS, ...FUNCTIONS];
  const factory = new Function(...Object.keys(globals), `${code}\nreturn { ${names.join(", ")} };`);
  return factory(...Object.values(globals));
}

const VOL_STEP = { id: "s1", cells: { frequencyVolume: "20/week", timeTaken: "15 min" } };

// ── Separation: run cost vs TCO vs value ────────────────────────────────────

test("P6-4: run cost, TCO, and value are returned as SEPARATE lenses", () => {
  const sb = S({ economicsAssumptions: {} });
  const econ = sb.buildUnitEconomics(VOL_STEP, {});
  assert.equal(econ.runCost.lens, "run");
  assert.equal(econ.tco.lens, "tco");
  assert.equal(econ.value.lens, "value");
  assert.ok(Array.isArray(econ.runCost.drivers) && Array.isArray(econ.tco.drivers) && Array.isArray(econ.value.drivers));
  // TCO is assumption-driven build effort (defaults present) → computable; run cost
  // needs captured volume. They are distinct totals, never the same lens.
  assert.equal(typeof econ.tco.total, "number");
  assert.ok(econ.tco.drivers.some((d) => d.key === "setup") && econ.tco.drivers.some((d) => d.key === "maintenance"));
});

// ── No fabrication on missing inputs ─────────────────────────────────────────

test("P6-4: missing captured inputs produce QUESTIONS and null totals — never a fabricated number", () => {
  const sb = S({ economicsAssumptions: {} });
  const econ = sb.buildUnitEconomics({ id: "s1", cells: {} }, {});
  assert.equal(econ.runCost.total, null, "no volume → run cost not computed (not $0)");
  assert.equal(econ.value.total, null, "no inputs → value not computed (not $0)");
  assert.ok(econ.questions.length > 0, "missing inputs surface as questions");
  // every run/value driver with a missing input is null, never invented
  assert.ok(econ.runCost.drivers.every((d) => d.value === null));
  assert.equal(econ.economicFit, "needs-economics-info", "no hard verdict without inputs");
});

test("P6-4: a blank labor rate stays 'not computed' (the value side is a question, never invented)", () => {
  const sb = S({ economicsAssumptions: {} });
  // laborPerHour defaults to null (department-specific) → value & review drivers stay null
  const econ = sb.buildUnitEconomics(VOL_STEP, { requiredControls: ["review"] });
  const review = econ.runCost.drivers.find((d) => d.key === "perCaseReview");
  assert.equal(review.value, null, "review cost needs a labor rate — left as a question");
  assert.equal(econ.value.total, null, "value needs labor rate + AI-carry share — not invented");
});

// ── Confirmed controls add overhead; sensitivity alone does not ─────────────

test("P6-4: confirmed permission CONTROLS add review/control overhead; sensitive data alone does NOT", () => {
  const sb = S({ economicsAssumptions: {} });
  // a sensitive step with NO required controls → no review/logging overhead drivers
  const sensitiveNoControls = sb.buildUnitEconomics({ id: "s1", cells: { frequencyVolume: "20", dataSensitivity: "MNPI" } }, { requiredControls: [] });
  const keysNo = sensitiveNoControls.runCost.drivers.map((d) => d.key);
  assert.ok(!keysNo.includes("perCaseReview"), "sensitivity alone adds no review cost");
  assert.ok(!keysNo.includes("loggingControlOverhead"), "sensitivity alone adds no logging cost");
  // the SAME work with confirmed controls → the overhead drivers appear
  const withControls = sb.buildUnitEconomics({ id: "s1", cells: { frequencyVolume: "20" } }, { requiredControls: ["review", "logging"] });
  const keysYes = withControls.runCost.drivers.map((d) => d.key);
  assert.ok(keysYes.includes("perCaseReview"), "a required review control adds review cost");
  assert.ok(keysYes.includes("loggingControlOverhead"), "a required logging control adds logging cost");
});

// ── Reviewable assumptions ───────────────────────────────────────────────────

test("P6-4: assumptions are ai-inferred drafts; edit/confirm/reject/reset behave", () => {
  const state = { economicsAssumptions: {} };
  const sb = S(state);
  // default: ai-inferred draft
  const def = sb.economicAssumption("s1", "modelCostPerRun");
  assert.equal(def.source, "ai-inferred");
  assert.equal(def.state, "suggested");
  // edit → user-edited, confirmed, value applied
  assert.equal(sb.setEconomicAssumption("s1", "modelCostPerRun", 0.2), true);
  const edited = sb.economicAssumption("s1", "modelCostPerRun");
  assert.equal(edited.value, 0.2);
  assert.equal(edited.state, "confirmed");
  assert.equal(edited.source, "user-edited");
  // confirm a default value (preserved) → user-stated
  sb.confirmEconomicAssumption("s1", "exceptionRate");
  assert.equal(sb.economicAssumption("s1", "exceptionRate").state, "confirmed");
  // reject → dependent value becomes null (a question), never fabricated
  sb.rejectEconomicAssumption("s1", "modelCostPerRun");
  assert.equal(sb.econAssumeValue("s1", "modelCostPerRun"), null);
  // a rejected assumption must also READ blank — never fall back to the default number
  const rejected = sb.economicAssumption("s1", "modelCostPerRun");
  assert.equal(rejected.state, "rejected");
  assert.equal(rejected.value, null, "rejected assumption displays blank, not the default");
  // reset → back to draft default
  sb.resetEconomicAssumption("s1", "modelCostPerRun");
  assert.equal(sb.economicAssumption("s1", "modelCostPerRun").state, "suggested");
});

// ── Confirmed-only read API ──────────────────────────────────────────────────

test("P6-4: confirmedUnitEconomics returns null for a draft; reads only a fully confirmed set", () => {
  const state = { economicsAssumptions: {} };
  const sb = S(state);
  assert.equal(sb.confirmedUnitEconomics(VOL_STEP, {}), null, "draft economics is never read as official");
  // confirm every assumption + supply the department rates
  for (const a of sb.ECON_DEFAULT_ASSUMPTIONS) sb.confirmEconomicAssumption("s1", a.key);
  sb.setEconomicAssumption("s1", "laborPerHour", 85);
  sb.setEconomicAssumption("s1", "aiCarryFraction", 0.6);
  const econ = sb.confirmedUnitEconomics(VOL_STEP, { requiredControls: [] });
  assert.ok(econ, "a fully confirmed set with value + cost is readable");
  assert.equal(econ.draft, false);
  assert.equal(typeof econ.value.total, "number");
});

// ── Isolation from scoring / gate / counted ─────────────────────────────────

test("P6-4: a draft or confirmed economics never changes the opportunity score", () => {
  const state = { economicsAssumptions: {} };
  const sb = S(state);
  const getStepOpportunityMeta = eval(`(${extractFunction(source, "getStepOpportunityMeta")})`);
  const step = { id: "s1", cells: { name: { value: "Reconcile balances", state: "confirmed", confidence: 0.9 }, frequencyVolume: { value: "20", state: "confirmed", confidence: 0.9 }, dataProcessing: { value: "copy rows", state: "confirmed", confidence: 0.8 } } };
  const before = getStepOpportunityMeta(step);
  sb.setEconomicAssumption("s1", "laborPerHour", 85);
  sb.confirmEconomicAssumption("s1", "modelCostPerRun");
  const after = getStepOpportunityMeta(step);
  assert.deepEqual(after, before, "economics is a separate lens — opportunity is unmoved");
});

test("P6-4: no scorer / gate / counted function references the economics layer", () => {
  const scorersAndGate = [
    "getStepOpportunityMeta", "scoreRecipeReadiness", "stepTrustSignals",
    "recipeGateCheck", "isUnitConfirmed", "confirmedView", "hardenedRecipeSpec", "confirmUnit",
    "rollupCountableItems"
  ];
  const tokens = ["buildUnitEconomics", "unitEconomics", "economicAssumption", "ECON_RUN_DRIVERS", "economicsAssumptions"];
  for (const fn of scorersAndGate) {
    const body = extractFunction(source, fn);
    for (const tok of tokens) assert.ok(!body.includes(tok), `${fn} must not reference ${tok}`);
  }
});

test("P6-4: the economics code makes no grid write and is rail-clean", () => {
  const fns = ["buildUnitEconomics", "economicInputs", "econDriver", "setEconomicAssumption", "confirmEconomicAssumption", "rejectEconomicAssumption", "unitEconomicsPanelHtml"];
  const rail = ["headcount", "fte", "eliminat", "automat", "cut staff", "reduction", "workforce-reduction"];
  for (const fn of fns) {
    const body = extractFunction(source, fn);
    assert.ok(!/patchField/.test(body), `${fn}: no grid write`);
    const low = body.toLowerCase();
    for (const w of rail) assert.ok(!low.includes(w), `${fn}: rail token "${w}"`);
  }
});

// ── Render ─────────────────────────────────────────────────────────────────────

test("P6-4: the panel shows run cost and TCO separately, framed draft (never official)", () => {
  const sb = S({ economicsAssumptions: {} });
  assert.equal(sb.unitEconomicsPanelHtml(null), "", "byte-identical-when-unused");
  const html = sb.unitEconomicsPanelHtml(VOL_STEP, { requiredControls: ["review"] });
  assert.match(html, /Unit economics/);
  assert.match(html, /Run cost/);
  assert.match(html, /Build cost \(TCO\)/);
  assert.match(html, /Value/);
  assert.match(html, /never changes the opportunity score, the confirmation gate, or counted totals/);
  assert.match(html, /data-econ-confirm=/);
  assert.match(html, /\[ai-inferred\]/);
  assert.ok(!/gradient/i.test(html));
});

test("P6-4: no Phase 5 / gate function references P6-4 symbols", () => {
  const phase5Fns = [
    "buildModeledWorkActions", "recipeGateCheck", "isUnitConfirmed", "confirmedView",
    "hardenedRecipeSpec", "confirmUnit", "buildConfirmationLadder", "buildPlacementExplainer"
  ];
  const tokens = ["buildUnitEconomics", "ECON_DEFAULT_ASSUMPTIONS", "economicsAssumptions", "confirmedUnitEconomics"];
  for (const fn of phase5Fns) {
    const body = extractFunction(source, fn);
    for (const tok of tokens) assert.ok(!body.includes(tok), `${fn} must not reference P6-4 token ${tok}`);
  }
});
