// Recipe Book — organized stock of recipes for the active workflow, by step / by
// status. Executed, deterministic tests (NO model call — the book reads existing
// recipe data and renders). Covers: a recipe is derived from existing data (a cached
// prompt) and attaches to one step; status comes from the EXISTING gate
// (proposed -> trusted), not a new field; grouping by step and by status; the empty
// state is never a dead end; provenance is worn with the merged .prov classes; status
// chips are flat (no gradient); and no banned (headcount / FTE / automation /
// ROI / hours-saved / opportunity) language ships in the rendered output. The heavy
// dependencies (recipeGateCheck, stepPrimaryPattern, analysisGridSteps) are stubbed as
// globals. Real shipped source extracted/evaluated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();
const serverSource = readServerSource();

const FORBIDDEN = /headcount|\bFTE\b|full-time equivalent|automation|automatable|\bROI\b|hours saved|time saved|\bopportunity\b/i;
const HUMAN_PINK = /#ff4fc8|#ffc4ea/i;

function bookSandbox(recipeCache = {}, recipeBookView = "byStep", steps = []) {
  const state = { recipeCache, recipeBookView };
  return buildSandbox(source, {
    consts: ["RECIPE_STATUS_RAIL", "RECIPE_STATUS_META"],
    functions: [
      "recipeForStep", "recipeBookByStep", "recipeBookByStatus", "recipeBookHasAnyRecipe",
      "recipeStatusChipHtml", "recipeProvChipHtml", "recipeBookCardHtml", "recipeBookStatusGroupHtml",
      "recipeBookEmptyNoteHtml", "recipeBookHtml", "escapeHtml"
    ],
    globals: {
      state,
      analysisGridSteps: () => steps,
      recipeGateCheck: (step) => ({ gaps: step?._gaps || [], p9Unconfirmed: Boolean(step?._p9) }),
      stepPrimaryPattern: (step) => step?._pattern || "",
      stepDisplayName: (step, i) => step?.name || `Step ${i + 1}`
    }
  });
}

const trustedStep = (id, name, pattern = "Summarize") => ({ id, name, _pattern: pattern, _gaps: [], _p9: false });
const proposedStep = (id, name, pattern = "Extract") => ({ id, name, _pattern: pattern, _gaps: [{ field: "sensitivity" }], _p9: true });
const noRecipeStep = (id, name) => ({ id, name });

test("a recipe is derived from existing data (a cached prompt) and attaches to one step; none yet → null", () => {
  const sb = bookSandbox({ s1: "Summarize the daily breaks report." });
  assert.equal(sb.recipeForStep(noRecipeStep("s9", "No recipe")), null, "no cached prompt → no recipe");
  const r = sb.recipeForStep(trustedStep("s1", "Reconcile"));
  assert.equal(r.stepId, "s1", "attached to exactly one step");
  assert.equal(r.pattern, "Summarize");
});

test("status comes from the EXISTING gate: gaps / unconfirmed sensitivity → proposed; clean → trusted", () => {
  const sb = bookSandbox({ s1: "p", s2: "p" });
  assert.equal(sb.recipeForStep(proposedStep("s1", "A")).status, "proposed");
  assert.equal(sb.recipeForStep(trustedStep("s2", "B")).status, "trusted");
  // The rail is the existing two-state lifecycle, not an invented set.
  assert.deepEqual(JSON.parse(extractConst(source, "RECIPE_STATUS_RAIL").replace(/^const RECIPE_STATUS_RAIL\s*=\s*/, "").replace(/;$/, "").replace(/'/g, '"')), ["proposed", "trusted"]);
});

test("provenance is worn the usual way: proposed rests on AI-inferred inputs, trusted on user-stated", () => {
  const sb = bookSandbox({ s1: "p", s2: "p" });
  assert.equal(sb.recipeForStep(proposedStep("s1", "A")).source, "ai-inferred");
  assert.equal(sb.recipeForStep(trustedStep("s2", "B")).source, "user-stated");
});

test("by-step view lists steps in order, each with its recipe or null", () => {
  const steps = [trustedStep("s1", "One"), noRecipeStep("s2", "Two"), proposedStep("s3", "Three")];
  const sb = bookSandbox({ s1: "p", s3: "p" }, "byStep", steps);
  const rows = sb.recipeBookByStep(steps);
  assert.deepEqual(rows.map((r) => r.name), ["One", "Two", "Three"], "step order preserved");
  assert.equal(rows[0].recipe.status, "trusted");
  assert.equal(rows[1].recipe, null, "a step with no recipe is null (shown as an add entry point)");
  assert.equal(rows[2].recipe.status, "proposed");
});

test("status view groups recipes by the rail (proposed before trusted); only steps with a recipe; empty groups omitted", () => {
  const steps = [trustedStep("s1", "One"), noRecipeStep("s2", "Two"), proposedStep("s3", "Three"), trustedStep("s4", "Four")];
  const sb = bookSandbox({ s1: "p", s3: "p", s4: "p" }, "status", steps);
  const groups = sb.recipeBookByStatus(steps);
  assert.deepEqual(groups.map((g) => g.status), ["proposed", "trusted"], "proposed group first");
  assert.equal(groups[0].rows.length, 1, "one proposed (s3)");
  assert.equal(groups[1].rows.length, 2, "two trusted (s1, s4)");
  // A status with no recipes is omitted entirely.
  const onlyTrusted = bookSandbox({ s1: "p" }, "status", [trustedStep("s1", "One")]).recipeBookByStatus([trustedStep("s1", "One")]);
  assert.deepEqual(onlyTrusted.map((g) => g.status), ["trusted"], "empty proposed group omitted");
});

test("status chip is FLAT (no gradient) with a text label; provenance reuses the merged .prov classes", () => {
  const sb = bookSandbox();
  const proposed = sb.recipeStatusChipHtml("proposed");
  const trusted = sb.recipeStatusChipHtml("trusted");
  assert.match(proposed, /Proposed/);
  assert.match(trusted, /Trusted/);
  assert.ok(!/gradient/i.test(proposed) && !/gradient/i.test(trusted), "status hue is flat, never a gradient");
  assert.ok(!HUMAN_PINK.test(proposed) && !HUMAN_PINK.test(trusted), "Human Pink is reserved — not used for status");
  // Provenance reuses .prov.user / .prov.ai (not re-implemented), AI reads grey/inferred.
  const ai = sb.recipeProvChipHtml("ai-inferred");
  const user = sb.recipeProvChipHtml("user-stated");
  assert.match(ai, /class="prov ai"/);
  assert.match(ai, /AI · inferred/);
  assert.match(user, /class="prov user"/);
  assert.match(user, /User · stated/);
});

test("a step with no recipe shows a clean inline state + an add entry point — never a dead end", () => {
  const sb = bookSandbox({});
  const card = sb.recipeBookCardHtml({ step: noRecipeStep("s5", "Lonely step"), index: 4, name: "Lonely step", recipe: null });
  assert.match(card, /No recipe yet/);
  assert.match(card, /data-recipe-book-add="s5"/, "add-a-recipe entry point present");
  assert.match(card, /Add a recipe/);
});

test("a recipe card shows the step it's attached to, what the recipe is, its status, and its provenance", () => {
  const sb = bookSandbox({ s1: "p" });
  const card = sb.recipeBookCardHtml({ step: trustedStep("s1", "Reconcile"), index: 0, name: "Reconcile", recipe: sb.recipeForStep(trustedStep("s1", "Reconcile")) });
  assert.match(card, /Reconcile/, "the step it's attached to");
  assert.match(card, /Summarize assist/, "what the recipe is");
  assert.match(card, /Trusted/, "its status");
  assert.match(card, /class="prov user"/, "its provenance");
});

test("empty state: no recipes anywhere → an empty note plus an add entry point for every step (never a dead end)", () => {
  const steps = [noRecipeStep("s1", "One"), noRecipeStep("s2", "Two")];
  const sb = bookSandbox({}, "byStep", steps);
  assert.equal(sb.recipeBookHasAnyRecipe(steps), false);
  const html = sb.recipeBookHtml();
  assert.match(html, /No recipes in the book yet/, "empty note shown");
  assert.match(html, /data-recipe-book-add="s1"/);
  assert.match(html, /data-recipe-book-add="s2"/, "every step can still get a recipe");
  assert.equal(bookSandbox({}, "byStep", []).recipeBookHtml(), "", "no steps → the book defers to the tab's own no-steps state");
});

test("recipeBookHtml: header, a By step / By status toggle, and grouped output in status view", () => {
  const steps = [trustedStep("s1", "One"), proposedStep("s2", "Two")];
  const sb = bookSandbox({ s1: "p", s2: "p" }, "status", steps);
  const html = sb.recipeBookHtml();
  assert.match(html, /Recipes in this package/);
  assert.match(html, /data-recipe-book-view="byStep"/);
  assert.match(html, /data-recipe-book-view="status"/);
  assert.match(html, /Proposed · 1/, "status group header with count");
  assert.match(html, /Trusted · 1/);
});

test("RAIL: no banned (headcount / FTE / automation / ROI / hours-saved / opportunity) language, and no gradient, in the rendered Recipe Book", () => {
  const steps = [trustedStep("s1", "One"), noRecipeStep("s2", "Two"), proposedStep("s3", "Three")];
  for (const view of ["byStep", "status"]) {
    const html = bookSandbox({ s1: "p", s3: "p" }, view, steps).recipeBookHtml();
    assert.ok(!FORBIDDEN.test(html), `no banned language in ${view} view`);
    assert.ok(!/gradient/i.test(html), `no gradient on the data surface in ${view} view`);
    assert.ok(!HUMAN_PINK.test(html), `Human Pink reserved — not used in ${view} view`);
  }
});

test("RAIL (source): the Recipe Book writes nothing, calls no scorer/endpoint, and reuses the existing add path", () => {
  for (const fn of ["recipeForStep", "recipeBookByStep", "recipeBookByStatus", "recipeBookHasAnyRecipe", "recipeStatusChipHtml", "recipeProvChipHtml", "recipeBookCardHtml", "recipeBookHtml", "wireRecipeBook"]) {
    const body = extractFunction(source, fn);
    assert.ok(!/patchField|setStructuralTag|applyStructuralSuggestion|confirmStructuralTag|setRoleTag|setFrictionTag|recordTelemetry/.test(body), `${fn}: no grid write / no provenance auto-harden / no telemetry`);
    assert.ok(!/getStepOpportunityMeta|scoreRecipeReadiness|buildAgentRecipeIr|\/api\/suggest/.test(body), `${fn}: no scorer / no suggestion endpoint`);
  }
  // Reads existing recipe data; add path reuses the existing generate flow.
  assert.ok(/state\.recipeCache/.test(extractFunction(source, "recipeForStep")), "reads existing recipe data");
  assert.ok(/recipeGateCheck\(step\)/.test(extractFunction(source, "recipeForStep")), "status derives from the existing gate");
  assert.ok(/generateRecipePrompt\(stepId\)/.test(extractFunction(source, "wireRecipeBook")), "add entry point reuses the existing generate path");
  // Banned language is absent from the static copy/consts too.
  const blob = [extractConst(source, "RECIPE_STATUS_META"), extractFunction(source, "recipeBookEmptyNoteHtml"), extractFunction(source, "recipeBookHtml"), extractFunction(source, "recipeBookCardHtml")].join("\n");
  assert.ok(!FORBIDDEN.test(blob), "no banned language in the Recipe Book copy/consts");
  assert.ok(!/work with your development team/i.test(blob), "banned phrase absent");
});

test("the Recipe Book is mounted into the recipe tab (render + wire) without disturbing the per-step workbench", () => {
  const tab = extractFunction(source, "renderAnalysisTabRecipe");
  assert.ok(/recipeBookHtml\(\) \+/.test(tab), "recipeBookHtml() is composed into the recipe tab");
  assert.ok(/wireRecipeBook\(container\)/.test(tab), "wireRecipeBook is invoked");
  // The relabel-honesty invariant the polish test guards still holds: the only
  // confidence label in the tab builder is "Pattern confidence:".
  assert.equal((tab.match(/Pattern confidence:/g) || []).length, 2, "Pattern confidence label count unchanged");
  assert.ok(!/[^n] [Cc]onfidence:/.test(tab.replace(/Pattern confidence:/g, "")), "no unqualified Confidence: label introduced");
});

test("RAIL: the four suggestion-endpoint contracts are unchanged (descriptive, {value,...}|{value:null}, no scorer)", () => {
  for (const route of ["/api/suggest-role", "/api/suggest-step-type", "/api/suggest-structural-type", "/api/suggest-friction"]) {
    assert.ok(serverSource.includes(route), `${route} still registered`);
  }
  for (const handler of ["handleSuggestRole", "handleSuggestStepType", "handleSuggestStructuralType", "handleSuggestFriction"]) {
    const body = extractFunction(serverSource, handler);
    assert.ok(/value:\s*null/.test(body), `${handler} still returns {value:null} on no-match`);
    assert.ok(!/opportunity|getStepOpportunity|computeBusinessCase|buildAgentRecipeIr|scoreRecipe/i.test(body), `${handler} stays descriptive`);
  }
});
