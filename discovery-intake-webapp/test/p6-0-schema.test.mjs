// Phase 6 · P6-0 — Flexible Work Graph data contract (schema design).
//
// These tests are written against the real shipped code in app.js (extracted +
// sandboxed, the convention scoring.test.mjs established). They prove the
// contract supports a flexible graph (not a rigid hierarchy), that suggested /
// modelled children stay draft-only, that the 66% functional-draft threshold
// never bypasses a missing mandatory safety field, that official rollups stay
// confirmed-only and never double-count, that the projector is read-only, and
// that P6-0 did NOT bleed into any Phase 5 function.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

const CONSTS = [
  "WORK_ITEM_LEVELS",
  "WORK_ITEM_LEVEL_ALIASES",
  "WORK_ITEM_RELATIONSHIPS",
  "WORK_ITEM_CONFIRM_STATES",
  "WORK_ITEM_ORIGINS",
  "WORK_ITEM_COMPLETENESS_BANDS",
  "WORK_ITEM_FUNCTIONAL_DRAFT_PCT",
  "WORK_ITEM_RELIED_FIELDS",
  "WORK_ITEM_MANDATORY_FIELDS",
  "WORK_ITEM_OPTIONAL_FIELDS",
  "WORK_ITEM_FIELD_META"
];

const FUNCTIONS = [
  "normalizeWorkItemLevel",
  "workItemLevelRank",
  "workItemField",
  "workItemFieldPresent",
  "workItemProvenanceRollup",
  "makeWorkItem",
  "markSuggestedWorkAction",
  "makeWorkRelation",
  "validateWorkItem",
  "validateWorkGraph",
  "workItemCompleteness",
  "workItemFunctionalDraftReady",
  "reconcileSuggestedChildren",
  "rollupCountableItems",
  "workGraphFromSteps"
];

// buildSandbox returns only functions; the contract tests also need the const
// values, so evaluate consts + functions together and return BOTH.
function S() {
  const code = [
    ...CONSTS.map((n) => extractConst(source, n)),
    ...FUNCTIONS.map((n) => extractFunction(source, n))
  ].join("\n\n");
  const names = [...CONSTS, ...FUNCTIONS];
  const factory = new Function(`${code}\nreturn { ${names.join(", ")} };`);
  return factory();
}

// A mandatory-complete set of relied-on field inputs (all 6 mandatory groups).
function mandatorySet(overrides = {}) {
  return Object.assign({
    dataTier: "confidential",
    entitlement: "read",
    actionVerb: "read",
    systems: "case platform (api)",
    control: "four-eyes",
    decisionOwnership: "human-in-loop"
  }, overrides);
}

// ── Levels, aliases, ranks ──────────────────────────────────────────────────

test("P6-0: WORK_ITEM_LEVELS is the ordered flexible-graph ladder", () => {
  const { WORK_ITEM_LEVELS } = S();
  assert.deepEqual(WORK_ITEM_LEVELS, ["workflow", "activity", "step", "substep", "workAction"]);
});

test("P6-0: normalizeWorkItemLevel folds stage -> activity and rejects unknowns", () => {
  const { normalizeWorkItemLevel } = S();
  assert.equal(normalizeWorkItemLevel("stage"), "activity");
  assert.equal(normalizeWorkItemLevel("activity"), "activity");
  assert.equal(normalizeWorkItemLevel("workAction"), "workAction");
  assert.equal(normalizeWorkItemLevel("bogus"), null);
  assert.equal(normalizeWorkItemLevel(null), null);
});

test("P6-0: workItemLevelRank deepens down the ladder; stage ties activity", () => {
  const { workItemLevelRank } = S();
  assert.ok(workItemLevelRank("workflow") < workItemLevelRank("step"));
  assert.ok(workItemLevelRank("step") < workItemLevelRank("workAction"));
  assert.equal(workItemLevelRank("stage"), workItemLevelRank("activity"));
  assert.equal(workItemLevelRank("nope"), -1);
});

// ── Provenance triples ──────────────────────────────────────────────────────

test("P6-0: workItemField builds a {value,source,confidence} triple with defaults", () => {
  const { workItemField } = S();
  assert.deepEqual(workItemField("x", "user-stated", 1), { value: "x", source: "user-stated", confidence: 1 });
  assert.deepEqual(workItemField(), { value: "", source: "", confidence: "" });
  assert.deepEqual(workItemField("y"), { value: "y", source: "", confidence: "" });
});

test("P6-0: workItemFieldPresent detects strings, arrays, numbers; empty is absent", () => {
  const { workItemField, workItemFieldPresent } = S();
  assert.equal(workItemFieldPresent(workItemField("x")), true);
  assert.equal(workItemFieldPresent(workItemField("   ")), false);
  assert.equal(workItemFieldPresent(workItemField("")), false);
  assert.equal(workItemFieldPresent(workItemField(["a"])), true);
  assert.equal(workItemFieldPresent(workItemField([])), false);
  assert.equal(workItemFieldPresent(workItemField(0)), true);
  assert.equal(workItemFieldPresent(workItemField(NaN)), false); // NaN is not a meaningful value
  assert.equal(workItemFieldPresent(null), false);
});

test("P6-0: provenance rollup reads inferred if any field is ai-inferred", () => {
  const { makeWorkItem, workItemProvenanceRollup } = S();
  const item = makeWorkItem({
    label: { value: "Reconcile", source: "user-stated", confidence: 1 },
    dataTier: { value: "PII", source: "ai-inferred", confidence: 0.6 }
  });
  const roll = workItemProvenanceRollup(item);
  assert.equal(roll.provenance, "inferred");
  assert.equal(roll.confidence, 0.6); // minimum across present fields
});

test("P6-0: provenance rollup is stated when all present fields are user-* ; unknown when none", () => {
  const { makeWorkItem, workItemProvenanceRollup } = S();
  const stated = makeWorkItem({
    label: { value: "A", source: "user-stated", confidence: 1 },
    dataTier: { value: "internal", source: "user-edited", confidence: 1 }
  });
  assert.equal(workItemProvenanceRollup(stated).provenance, "stated");
  const empty = makeWorkItem({ level: "step" });
  assert.equal(workItemProvenanceRollup(empty).provenance, "unknown");
  assert.equal(workItemProvenanceRollup(empty).confidence, "");
});

// ── makeWorkItem ────────────────────────────────────────────────────────────

test("P6-0: makeWorkItem defaults level=step, origin=captured, state=captured", () => {
  const { makeWorkItem } = S();
  const it = makeWorkItem({ id: "s1" });
  assert.equal(it.id, "s1");
  assert.equal(it.level, "step");
  assert.equal(it.origin, "captured");
  assert.equal(it.confirmationState, "captured");
  assert.equal(it.parentId, null);
});

test("P6-0: makeWorkItem fills every relied-on field as a triple and attaches the rollup", () => {
  const { makeWorkItem, WORK_ITEM_RELIED_FIELDS } = S();
  const it = makeWorkItem({ id: "s1", label: "Do work" });
  WORK_ITEM_RELIED_FIELDS.forEach((f) => {
    assert.ok(it[f] && typeof it[f] === "object" && "value" in it[f], `${f} is a triple`);
  });
  assert.equal(it.label.value, "Do work");
  assert.ok("provenance" in it && "confidence" in it);
});

test("P6-0: makeWorkItem accepts a bare scalar OR a triple for a relied-on field", () => {
  const { makeWorkItem } = S();
  const a = makeWorkItem({ id: "s1", dataTier: "PII" });
  assert.deepEqual(a.dataTier, { value: "PII", source: "", confidence: "" });
  const b = makeWorkItem({ id: "s2", dataTier: { value: "MNPI", source: "user-stated", confidence: 1 } });
  assert.deepEqual(b.dataTier, { value: "MNPI", source: "user-stated", confidence: 1 });
});

test("P6-0: a modelled item can NEVER be born confirmed — coerced to suggested", () => {
  const { makeWorkItem } = S();
  const it = makeWorkItem({ id: "m1", origin: "modelled", confirmationState: "confirmed" });
  assert.equal(it.origin, "modelled");
  assert.equal(it.confirmationState, "suggested");
});

test("P6-0: markSuggestedWorkAction forces level=workAction, origin=modelled, suggested", () => {
  const { markSuggestedWorkAction } = S();
  const it = markSuggestedWorkAction({ id: "w1", level: "step", confirmationState: "confirmed", label: "retrieve profile" });
  assert.equal(it.level, "workAction");
  assert.equal(it.origin, "modelled");
  assert.equal(it.confirmationState, "suggested");
  assert.equal(it.label.value, "retrieve profile");
});

// ── validateWorkItem ────────────────────────────────────────────────────────

test("P6-0: validateWorkItem passes a well-formed item and flags structural problems", () => {
  const { makeWorkItem, validateWorkItem } = S();
  assert.equal(validateWorkItem(makeWorkItem({ id: "s1" })).ok, true);

  const noId = validateWorkItem({ id: "", level: "step", confirmationState: "captured" });
  assert.equal(noId.ok, false);
  assert.ok(noId.errors.includes("id-missing"));

  const badLevel = validateWorkItem({ id: "x", level: "phase", confirmationState: "captured" });
  assert.ok(badLevel.errors.some((e) => e.startsWith("level-invalid")));

  const badState = validateWorkItem({ id: "x", level: "step", confirmationState: "done" });
  assert.ok(badState.errors.some((e) => e.startsWith("confirmationState-invalid")));

  const modelledConfirmed = validateWorkItem({ id: "x", level: "workAction", origin: "modelled", confirmationState: "confirmed" });
  assert.ok(modelledConfirmed.errors.includes("modelled-cannot-confirm"));

  const badField = validateWorkItem({ id: "x", level: "step", confirmationState: "captured", dataTier: "not-a-triple" });
  assert.ok(badField.errors.some((e) => e.startsWith("field-shape")));
});

// ── validateWorkGraph — the four supported paths + collapse ─────────────────

test("P6-0: graph path workflow -> activity -> step -> substep -> workAction validates", () => {
  const { makeWorkItem, validateWorkGraph } = S();
  const items = [
    makeWorkItem({ id: "wf", level: "workflow" }),
    makeWorkItem({ id: "a1", parentId: "wf", level: "activity" }),
    makeWorkItem({ id: "s1", parentId: "a1", level: "step" }),
    makeWorkItem({ id: "ss1", parentId: "s1", level: "substep" }),
    makeWorkItem({ id: "wa1", parentId: "ss1", level: "workAction" })
  ];
  assert.equal(validateWorkGraph(items).ok, true);
});

test("P6-0: shorter paths validate — activity/step levels may be skipped", () => {
  const { makeWorkItem, validateWorkGraph } = S();
  // workflow -> step -> workAction (activity skipped)
  const p2 = [
    makeWorkItem({ id: "wf", level: "workflow" }),
    makeWorkItem({ id: "s1", parentId: "wf", level: "step" }),
    makeWorkItem({ id: "wa1", parentId: "s1", level: "workAction" })
  ];
  assert.equal(validateWorkGraph(p2).ok, true, "workflow->step->workAction");

  // workflow -> activity -> workAction (step skipped)
  const p3 = [
    makeWorkItem({ id: "wf", level: "workflow" }),
    makeWorkItem({ id: "a1", parentId: "wf", level: "activity" }),
    makeWorkItem({ id: "wa1", parentId: "a1", level: "workAction" })
  ];
  assert.equal(validateWorkGraph(p3).ok, true, "workflow->activity->workAction");

  // workflow -> workAction (both skipped)
  const p4 = [
    makeWorkItem({ id: "wf", level: "workflow" }),
    makeWorkItem({ id: "wa1", parentId: "wf", level: "workAction" })
  ];
  assert.equal(validateWorkGraph(p4).ok, true, "workflow->workAction");
});

test("P6-0: activity/stage and step may collapse — a step can be the top grouping (root)", () => {
  const { makeWorkItem, validateWorkGraph } = S();
  const items = [
    makeWorkItem({ id: "s1", level: "step", parentId: null }),
    makeWorkItem({ id: "wa1", parentId: "s1", level: "workAction" })
  ];
  assert.equal(validateWorkGraph(items).ok, true);
});

test("P6-0: inverted nesting (child not deeper than parent) is refused", () => {
  const { makeWorkItem, validateWorkGraph } = S();
  const items = [
    makeWorkItem({ id: "a", level: "step", parentId: null }),
    makeWorkItem({ id: "b", level: "workflow", parentId: "a" }) // workflow under a step
  ];
  const r = validateWorkGraph(items);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith("level-order")));
});

test("P6-0: validateWorkGraph catches missing parents, duplicate ids, and cycles", () => {
  const { makeWorkItem, validateWorkGraph } = S();

  const missing = validateWorkGraph([makeWorkItem({ id: "s1", parentId: "ghost", level: "step" })]);
  assert.ok(missing.errors.some((e) => e.startsWith("parent-missing")));

  const dup = validateWorkGraph([makeWorkItem({ id: "x", level: "step" }), makeWorkItem({ id: "x", level: "substep" })]);
  assert.ok(dup.errors.some((e) => e.startsWith("duplicate-id")));

  const cycle = validateWorkGraph([
    makeWorkItem({ id: "a", level: "step", parentId: "b" }),
    makeWorkItem({ id: "b", level: "step", parentId: "a" })
  ]);
  assert.equal(cycle.ok, false);
  assert.ok(cycle.errors.some((e) => e.startsWith("cycle")));
});

test("P6-0: makeWorkRelation validates kind + endpoints; validateWorkGraph checks relations", () => {
  const { makeWorkItem, makeWorkRelation, validateWorkGraph } = S();
  assert.equal(makeWorkRelation("a", "b", "bogus"), null);
  assert.equal(makeWorkRelation("", "b", "handoff"), null);
  assert.deepEqual(makeWorkRelation("a", "b", "handoff"), { from: "a", to: "b", kind: "handoff" });

  const items = [makeWorkItem({ id: "a", level: "step" }), makeWorkItem({ id: "b", level: "step" })];
  assert.equal(validateWorkGraph(items, [makeWorkRelation("a", "b", "same-system")]).ok, true);

  const bad = validateWorkGraph(items, [{ from: "a", to: "ghost", kind: "handoff" }]);
  assert.ok(bad.errors.some((e) => e.startsWith("relation-to")));
});

// ── Completeness scorer (Track 1B) ──────────────────────────────────────────

test("P6-0: all six mandatory fields present, no optional -> 71% functional draft, gate passed", () => {
  const { makeWorkItem, workItemCompleteness } = S();
  const it = makeWorkItem(Object.assign({ id: "s1" }, mandatorySet()));
  const c = workItemCompleteness(it);
  assert.equal(c.pct, 71);
  assert.equal(c.bandId, "functional-draft");
  assert.equal(c.mandatoryGatePassed, true);
  assert.deepEqual(c.missingRequired, []);
  assert.equal(c.counted, false); // not confirmed
});

test("P6-0: control OR policy cap satisfies the control/policy-cap mandatory group", () => {
  const { makeWorkItem, workItemCompleteness } = S();
  const withPolicyCap = makeWorkItem(Object.assign({ id: "s1" }, mandatorySet({ control: "", policyCap: "external-LLM-blocked" })));
  const c = workItemCompleteness(withPolicyCap);
  assert.equal(c.mandatoryGatePassed, true);
  assert.ok(!c.missingRequired.some((m) => m.field === "controlOrPolicyCap"));
});

test("P6-0: fully populated item reaches 100% / portfolio-counted band", () => {
  const { makeWorkItem, workItemCompleteness } = S();
  const it = makeWorkItem(Object.assign({ id: "s1" }, mandatorySet({
    label: "Reconcile entity details",
    class: "build",
    handoff: "email to reviewer",
    solutionPlacement: "human-in-loop",
    economics: "low run cost"
  })));
  const c = workItemCompleteness(it);
  assert.equal(c.pct, 100);
  assert.equal(c.bandId, "portfolio-counted");
});

test("P6-0: empty item -> 0% captured-only, all six mandatory reported missing", () => {
  const { makeWorkItem, workItemCompleteness } = S();
  const c = workItemCompleteness(makeWorkItem({ id: "s1" }));
  assert.equal(c.pct, 0);
  assert.equal(c.bandId, "captured-only");
  assert.equal(c.mandatoryGatePassed, false);
  assert.equal(c.missingRequired.length, 6);
  assert.ok(c.missingRequired.every((m) => typeof m.label === "string" && typeof m.hint === "string"));
});

test("P6-0 TRUST INVARIANT: a high percentage NEVER bypasses a missing mandatory safety field", () => {
  const { makeWorkItem, workItemCompleteness, workItemFunctionalDraftReady } = S();
  // 5 mandatory + all 5 optional present, but decisionOwnership is MISSING.
  const it = makeWorkItem(Object.assign({ id: "s1" }, mandatorySet({
    decisionOwnership: "",
    label: "x", class: "build", handoff: "y", solutionPlacement: "prompt", economics: "z"
  })));
  const c = workItemCompleteness(it);
  assert.equal(c.pct, 88);                       // high percentage
  assert.equal(c.mandatoryGatePassed, false);    // but the safety gate is NOT passed
  assert.ok(c.missingRequired.some((m) => m.field === "decisionOwnership"));
  assert.equal(workItemFunctionalDraftReady(it), false); // 66%+ alone is not enough
  assert.equal(c.counted, false);
});

test("P6-0: functionalDraftReady requires BOTH >=66% AND the mandatory gate", () => {
  const { makeWorkItem, workItemFunctionalDraftReady } = S();
  const draft = makeWorkItem(Object.assign({ id: "s1" }, mandatorySet()));
  assert.equal(workItemFunctionalDraftReady(draft), true); // 71% + gate
  const thin = makeWorkItem({ id: "s2", dataTier: "PII", entitlement: "read" });
  assert.equal(workItemFunctionalDraftReady(thin), false); // below threshold + gate fails
});

// ── counted is delegated to the existing confirmation gate ──────────────────

test("P6-0: counted requires confirmed=true AND a non-suggested, non-modelled item", () => {
  const { makeWorkItem, workItemCompleteness } = S();
  const confirmedItem = makeWorkItem(Object.assign({ id: "s1", confirmationState: "confirmed" }, mandatorySet()));
  assert.equal(workItemCompleteness(confirmedItem, { confirmed: true }).counted, true);
  assert.equal(workItemCompleteness(confirmedItem, { confirmed: false }).counted, false);

  const modelled = makeWorkItem(Object.assign({ id: "m1", origin: "modelled" }, mandatorySet()));
  assert.equal(workItemCompleteness(modelled, { confirmed: true }).counted, false, "modelled never counts");

  const captured = makeWorkItem(Object.assign({ id: "c1" }, mandatorySet()));
  assert.equal(workItemCompleteness(captured, { confirmed: false }).counted, false);
});

test("P6-0 TRUST INVARIANT: a confirmed item missing a mandatory safety field is NEVER counted", () => {
  const { makeWorkItem, workItemCompleteness } = S();
  // The unit gate confirms it (confirmed:true) but the decision owner is absent.
  const it = makeWorkItem(Object.assign({ id: "s1", confirmationState: "confirmed" },
    mandatorySet({ decisionOwnership: "" })));
  const c = workItemCompleteness(it, { confirmed: true });
  assert.equal(c.mandatoryGatePassed, false);
  assert.equal(c.counted, false); // confirmed alone never bypasses a missing safety field
});

// ── Suggested-child reconciliation (never overwrite explicit) ───────────────

test("P6-0: reconcileSuggestedChildren preserves explicit children and refuses collisions", () => {
  const { makeWorkItem, reconcileSuggestedChildren } = S();
  const explicit = [
    makeWorkItem({ id: "wa-keep", parentId: "s1", level: "workAction", label: "extract fields", confirmationState: "confirmed" })
  ];
  const suggestions = [
    { id: "wa-keep", label: "extract fields" },      // collides with explicit -> dropped
    { id: "wa-new", label: "route exception" }        // unique -> kept as suggested
  ];
  const r = reconcileSuggestedChildren(explicit, suggestions);
  assert.equal(r.explicit.length, 1);
  assert.equal(r.explicit[0].confirmationState, "confirmed"); // untouched
  assert.equal(r.suggested.length, 1);
  assert.equal(r.suggested[0].id, "wa-new");
  assert.equal(r.suggested[0].origin, "modelled");
  assert.equal(r.suggested[0].confirmationState, "suggested");
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].id, "wa-keep");
});

test("P6-0: a label collision (no id) also blocks an explicit child from being overwritten", () => {
  const { makeWorkItem, reconcileSuggestedChildren } = S();
  const explicit = [makeWorkItem({ id: "wa1", level: "workAction", label: "Reconcile Two Sources" })];
  const r = reconcileSuggestedChildren(explicit, [{ label: "reconcile two sources" }]);
  assert.equal(r.suggested.length, 0);
  assert.equal(r.dropped.length, 1);
});

// ── Confirmed-only, no-double-count rollup ──────────────────────────────────

test("P6-0: rollupCountableItems counts only the lowest confirmed level (no double count)", () => {
  const { makeWorkItem, rollupCountableItems } = S();
  const items = [
    makeWorkItem({ id: "wf", level: "workflow", confirmationState: "confirmed" }),
    makeWorkItem({ id: "s1", parentId: "wf", level: "step", confirmationState: "confirmed" }),
    makeWorkItem({ id: "wa1", parentId: "s1", level: "workAction", confirmationState: "confirmed" })
  ];
  const counted = rollupCountableItems(items, () => true);
  assert.deepEqual(counted.map((i) => i.id), ["wa1"]); // parent + grandparent dropped
});

test("P6-0: rollupCountableItems excludes suggested/modelled and unconfirmed items", () => {
  const { makeWorkItem, markSuggestedWorkAction, rollupCountableItems } = S();
  const confirmedLeaf = makeWorkItem({ id: "s1", level: "step", confirmationState: "confirmed" });
  const capturedLeaf = makeWorkItem({ id: "s2", level: "step", confirmationState: "captured" });
  const suggested = markSuggestedWorkAction({ id: "w1", label: "modelled" });
  const items = [confirmedLeaf, capturedLeaf, suggested];
  // gate confirms s1 and (incorrectly) the suggested one — origin/state still exclude it.
  const counted = rollupCountableItems(items, (it) => it.id === "s1" || it.id === "w1");
  assert.deepEqual(counted.map((i) => i.id), ["s1"]);
});

// ── Read-only projector over the existing flat step list ────────────────────

test("P6-0: workGraphFromSteps builds step + explicit-workAction children and does NOT mutate steps", () => {
  const { workGraphFromSteps, validateWorkGraph } = S();
  const steps = [
    { id: "s1", step: "Check entity details", cls: "judgment", data: "PII", action: "read",
      workActions: [{ owner: "ai", channel: "online", addressability: 70, label: "retrieve profile" }] },
    { id: "s2", step: "Approve onboarding", cls: "decision" } // leaf: no workActions
  ];
  const before = JSON.stringify(steps);
  const items = workGraphFromSteps(steps);
  assert.equal(JSON.stringify(steps), before, "input steps are untouched (read-only)");

  const ids = items.map((i) => i.id);
  assert.ok(ids.includes("s1") && ids.includes("s2"));
  const child = items.find((i) => i.parentId === "s1" && i.level === "workAction");
  assert.ok(child, "explicit workAction became a workAction child");
  assert.equal(child.label.value, "retrieve profile");
  assert.equal(child.origin, "captured");
  // s2 has no children
  assert.equal(items.filter((i) => i.parentId === "s2").length, 0);
  // and the projected graph is structurally valid
  assert.equal(validateWorkGraph(items).ok, true);
});

test("P6-0: workGraphFromSteps nests under an optional workflow root + activity grouping", () => {
  const { workGraphFromSteps, validateWorkGraph } = S();
  const steps = [{ id: "s1", step: "Retrieve", cls: "gather" }];
  const items = workGraphFromSteps(steps, {
    workflowLabel: "Client onboarding",
    workflowId: "wf",
    activities: { a1: { label: "Intake", stepIds: ["s1"] } }
  });
  const wf = items.find((i) => i.level === "workflow");
  const act = items.find((i) => i.level === "activity");
  const step = items.find((i) => i.id === "s1");
  assert.ok(wf && act && step);
  assert.equal(act.parentId, "wf");
  assert.equal(step.parentId, "a1");
  assert.equal(validateWorkGraph(items).ok, true);
});

test("P6-0: workGraphFromSteps marks steps confirmed only when the gate fn says so", () => {
  const { workGraphFromSteps } = S();
  const steps = [{ id: "s1", step: "x", cls: "gather" }, { id: "s2", step: "y", cls: "gather" }];
  const items = workGraphFromSteps(steps, { isConfirmedFn: (s) => s.id === "s1" });
  assert.equal(items.find((i) => i.id === "s1").confirmationState, "confirmed");
  assert.equal(items.find((i) => i.id === "s2").confirmationState, "captured");
});

// ── Source-level rail / Phase-isolation guards ──────────────────────────────

test("P6-0: every contract function source is rail-clean (no headcount/FTE/eliminate/automate)", () => {
  const rail = ["headcount", "fte", "eliminat", "automat", "reduce", "cut staff", "workforce-reduction"];
  FUNCTIONS.forEach((name) => {
    const src = extractFunction(source, name).toLowerCase();
    const hits = rail.filter((w) => src.includes(w));
    assert.deepEqual(hits, [], `${name} rail violations: ${hits}`);
  });
});

test("P6-0: the contract never auto-confirms or auto-splits in source", () => {
  // The schema constructs suggestions; it must not contain auto-hardening behavior.
  const make = extractFunction(source, "makeWorkItem");
  assert.ok(make.includes('confirmationState = "suggested"'), "modelled coercion present");
  ["autoSplit", "autoConfirm", "autoHarden", "autoDecompose"].forEach((bad) => {
    FUNCTIONS.forEach((name) => {
      assert.ok(!extractFunction(source, name).includes(bad), `${name} must not include ${bad}`);
    });
  });
});

test("P6-0: did NOT bleed into any Phase 5 / gate function", () => {
  const phase5Fns = [
    "buildModeledWorkActions",
    "modeledWorkActionsHtml",
    "recipeGateCheck",
    "isUnitConfirmed",
    "confirmedView",
    "hardenedRecipeSpec",
    "confirmUnit",
    "buildConfirmationLadder",
    "buildPlacementExplainer",
    "detectCompoundStep"
  ];
  const p6Tokens = ["WORK_ITEM_", "makeWorkItem", "workGraphFromSteps", "workItemCompleteness", "rollupCountableItems", "workItemField"];
  phase5Fns.forEach((fn) => {
    const src = extractFunction(source, fn);
    p6Tokens.forEach((tok) => {
      assert.ok(!src.includes(tok), `${fn} must not reference P6-0 token ${tok}`);
    });
  });
});
