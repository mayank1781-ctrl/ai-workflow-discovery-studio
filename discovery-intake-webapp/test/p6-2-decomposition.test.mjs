// P6-2 — Substep / work-action decomposition (suggestion only). Deterministic,
// executed tests (NO live model). Proves: suggestions appear only for compound
// steps and only when grounded in captured signals (no fabrication); every
// suggested child is a draft/modelled work item carrying the P6-0/P6-1 contract;
// explicit user workActions stay authoritative and collisions are refused; the
// assembled graph is valid (no dup id / dangling / cycle); suggested children are
// NEVER written to step.workActions and NEVER counted in official rollups; dismiss
// / restore work; and P6-2 did not bleed into any Phase 5 / gate function.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

const CONSTS = [
  "WORK_ITEM_LEVELS", "WORK_ITEM_LEVEL_ALIASES", "WORK_ITEM_RELATIONSHIPS",
  "WORK_ITEM_CONFIRM_STATES", "WORK_ITEM_ORIGINS", "WORK_ITEM_RELIED_FIELDS",
  "SUBSTEP_TEMPLATES"
];
const FUNCTIONS = [
  // P6-0 primitives (real shipped code)
  "normalizeWorkItemLevel", "workItemLevelRank", "workItemField", "workItemFieldPresent",
  "workItemProvenanceRollup", "makeWorkItem", "markSuggestedWorkAction",
  "validateWorkItem", "validateWorkGraph", "reconcileSuggestedChildren", "rollupCountableItems",
  // P6-2
  "substepKey", "buildSuggestedSubsteps", "explicitSubstepItems",
  "ensureDismissedSubsteps", "dismissedSubstepKeys", "dismissSuggestedSubstep",
  "restoreSuggestedSubstep", "clearDismissedSubsteps", "decomposeStep", "decompositionPanelHtml"
];

function S(state, overrides = {}) {
  const globals = Object.assign({
    state: state || {},
    // a step is compound when it carries _compound: true (the real detector is
    // covered by test/p5-4a-compound.test.mjs — stubbed here to isolate P6-2).
    detectCompoundStep: (s) => (s && s._compound)
      ? { warning: "Compound step likely", detail: "…", reasons: ["broad aggregate verb"] }
      : null,
    gridCellValue: (s, k) => (s && s.cells && typeof s.cells[k] === "string" ? s.cells[k] : ""),
    engineDataTier: (s) => (s && s.data) || "",
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

function compoundStep(cells = {}, extra = {}) {
  return Object.assign({ id: "s1", step: "Check entity details", cls: "judgment", data: "PII", _compound: true, cells }, extra);
}

// ── Detection gate ────────────────────────────────────────────────────────────

test("P6-2: a NON-compound step yields no suggestions (never fabricate sub-work)", () => {
  const sb = S({ dismissedSubsteps: {} });
  const simple = { id: "s1", step: "Send the email", cells: { systemsTools: "Email" }, _compound: false };
  assert.deepEqual(sb.buildSuggestedSubsteps(simple), []);
});

test("P6-2: a compound step with NO captured signals yields nothing (grounded, not invented)", () => {
  const sb = S({ dismissedSubsteps: {} });
  assert.deepEqual(sb.buildSuggestedSubsteps(compoundStep({})), []);
});

// ── Grounded suggestions ──────────────────────────────────────────────────────

test("P6-2: each suggested child is a draft/modelled work item carrying the contract", () => {
  const sb = S({ dismissedSubsteps: {} });
  const step = compoundStep({ systemsTools: "Case platform", humanCheckpoint: "Reviewer signs off" });
  const subs = sb.buildSuggestedSubsteps(step);
  assert.equal(subs.length, 2, "retrieve + approve (only the two captured signals)");
  for (const c of subs) {
    assert.equal(c.level, "workAction");
    assert.equal(c.parentId, "s1");
    assert.equal(c.origin, "modelled", "never captured");
    assert.equal(c.confirmationState, "suggested", "never born confirmed");
    // contract fields present as provenance triples, all ai-inferred
    for (const f of ["label", "workIntent", "actionVerb", "class", "systems", "dataTier", "entitlement", "decisionOwnership"]) {
      assert.ok(c[f] && typeof c[f] === "object" && "value" in c[f], `${f} is a triple`);
    }
    assert.equal(c.workIntent.source, "ai-inferred");
    assert.ok(c.workIntent.confidence > 0 && c.workIntent.confidence < 1, "low-confidence draft");
    // control / policy cap placeholders present (empty triples)
    assert.equal(c.control.value, "");
    assert.equal(c.policyCap.value, "");
  }
  const intents = subs.map((c) => c.workIntent.value);
  assert.deepEqual(intents, ["retrieve", "approve"]);
  assert.equal(subs[0].dataTier.value, "PII", "inherits the parent data tier");
  assert.match(subs[0].label.value, /Retrieve inputs from Case platform/);
});

test("P6-2: suggestions are grounded — only templates whose signal is captured are emitted", () => {
  const sb = S({ dismissedSubsteps: {} });
  // full onboarding-style decomposition
  const full = compoundStep({
    systemsTools: "Case platform", dataProcessing: "copy fields", rulesDecisionLogic: "KYC rules",
    exceptionBranching: "mismatch path", handoff: "to reviewer", humanCheckpoint: "approve onboarding"
  });
  assert.deepEqual(sb.buildSuggestedSubsteps(full).map((c) => c.workIntent.value),
    ["retrieve", "extract", "reconcile", "validate", "route", "approve"]);
  // output-only step → a single produce substep
  assert.deepEqual(sb.buildSuggestedSubsteps(compoundStep({ output: "a report" })).map((c) => c.workIntent.value), ["draft"]);
  // produce-output is suppressed once another substep is emitted (no redundancy)
  assert.deepEqual(sb.buildSuggestedSubsteps(compoundStep({ systemsTools: "X", output: "a report" })).map((c) => c.workIntent.value), ["retrieve"]);
});

test("P6-2: building suggestions never mutates the step or its workActions (read-only)", () => {
  const sb = S({ dismissedSubsteps: {} });
  const step = compoundStep({ systemsTools: "X", rulesDecisionLogic: "rules" }, { workActions: [{ owner: "ai", channel: "online", label: "do it" }] });
  const before = JSON.stringify(step);
  sb.buildSuggestedSubsteps(step);
  sb.decomposeStep(step);
  assert.equal(JSON.stringify(step), before, "the step is untouched");
});

// ── decomposeStep: explicit authoritative, graph valid ──────────────────────

test("P6-2: decomposeStep keeps explicit children authoritative and produces a VALID graph", () => {
  const sb = S({ dismissedSubsteps: {} });
  const step = compoundStep({ systemsTools: "X", humanCheckpoint: "approve" }, {
    workActions: [{ id: "wa-keep", owner: "ai", channel: "online", label: "Pull the file" }]
  });
  const d = sb.decomposeStep(step);
  assert.equal(d.valid, true, "no dup id / dangling parent / cycle");
  assert.equal(d.explicit.length, 1);
  assert.equal(d.explicit[0].id, "wa-keep");
  assert.equal(d.explicit[0].origin, "captured");
  assert.ok(d.suggested.length >= 1);
  // ids are unique across the whole graph
  const ids = [d.parent.id, ...d.explicit.map((c) => c.id), ...d.suggested.map((c) => c.id)];
  assert.equal(new Set(ids).size, ids.length, "unique ids");
});

test("P6-2: an INVALID assembled graph drops the suggestions (safety valve) but keeps explicit", () => {
  const sb = S({ dismissedSubsteps: {} });
  // two explicit workActions share an id → validateWorkGraph fails (duplicate-id),
  // so the (otherwise non-empty) suggestions must be dropped, never shown unsafe.
  const step = compoundStep({ systemsTools: "X", humanCheckpoint: "approve" }, {
    workActions: [{ id: "dup", label: "a" }, { id: "dup", label: "b" }]
  });
  // suggestions WOULD exist for this compound step
  assert.ok(sb.buildSuggestedSubsteps(step).length >= 1);
  const d = sb.decomposeStep(step);
  assert.equal(d.valid, false, "duplicate explicit ids invalidate the graph");
  assert.deepEqual(d.suggested, [], "an unsafe graph shows NO suggestions");
  assert.equal(d.explicit.length, 2, "explicit captured children are still preserved");
});

test("P6-2: a suggestion that collides with an explicit child is refused (explicit wins)", () => {
  const sb = S({ dismissedSubsteps: {} });
  // the explicit child shares the approve template's label → the approve suggestion is dropped
  const step = compoundStep({ systemsTools: "X", humanCheckpoint: "approve" }, {
    workActions: [{ id: "wa1", label: "Review and approve" }]
  });
  const d = sb.decomposeStep(step);
  assert.ok(!d.suggested.some((c) => c.label.value === "Review and approve"), "no suggestion overwrites the explicit child");
  assert.ok(d.dropped.some((c) => c.label.value.toLowerCase() === "review and approve"), "the collision is dropped, not merged");
  assert.equal(d.explicit[0].label.value, "Review and approve", "explicit child untouched");
});

// ── Never confirmed / never counted ──────────────────────────────────────────

test("P6-2: suggested children NEVER count in official rollups, even when the gate says confirmed", () => {
  const sb = S({ dismissedSubsteps: {} });
  const step = compoundStep({ systemsTools: "X", rulesDecisionLogic: "rules", humanCheckpoint: "approve" });
  const d = sb.decomposeStep(step);
  const items = [d.parent, ...d.explicit, ...d.suggested];
  // an over-eager gate that "confirms" everything still must not count the drafts
  const counted = sb.rollupCountableItems(items, () => true);
  const countedIds = new Set(counted.map((c) => c.id));
  for (const c of d.suggested) {
    assert.ok(!countedIds.has(c.id), `suggested ${c.id} is never counted`);
  }
});

test("P6-2: confirmationState/origin make a suggested child un-confirmable by construction", () => {
  const sb = S({ dismissedSubsteps: {} });
  const subs = sb.buildSuggestedSubsteps(compoundStep({ systemsTools: "X" }));
  // even if a caller passed confirmationState:"confirmed", markSuggestedWorkAction coerces it
  assert.equal(subs[0].confirmationState, "suggested");
  assert.equal(subs[0].origin, "modelled");
});

// ── Dismiss / restore ─────────────────────────────────────────────────────────

test("P6-2: dismiss hides a suggestion (persisted); restore brings it back", () => {
  const state = { dismissedSubsteps: {} };
  const sb = S(state);
  const step = compoundStep({ systemsTools: "X", humanCheckpoint: "approve" });
  assert.equal(sb.decomposeStep(step).suggested.length, 2);

  assert.equal(sb.dismissSuggestedSubstep("s1", "approve"), true);
  assert.deepEqual(state.dismissedSubsteps.s1, ["approve"], "dismissal persists in the sidecar");
  const after = sb.decomposeStep(step);
  assert.equal(after.suggested.length, 1);
  assert.ok(!after.suggested.some((c) => c.workIntent.value === "approve"));
  assert.equal(after.dismissedCount, 1);

  assert.equal(sb.restoreSuggestedSubstep("s1", "approve"), true);
  assert.equal(sb.decomposeStep(step).suggested.length, 2, "restore re-shows it");
  assert.equal(state.dismissedSubsteps.s1, undefined, "empty dismissal list is cleaned up");

  sb.dismissSuggestedSubstep("s1", "retrieve");
  assert.equal(sb.clearDismissedSubsteps("s1"), true);
  assert.equal(sb.decomposeStep(step).suggested.length, 2, "clear re-shows all");
});

// ── Render ─────────────────────────────────────────────────────────────────────

test("P6-2: the decomposition panel is empty for a non-compound step (byte-identical-when-unused)", () => {
  const sb = S({ dismissedSubsteps: {} });
  assert.equal(sb.decompositionPanelHtml({ id: "s1", cells: {}, _compound: false }), "");
});

test("P6-2: the panel renders suggested children as drafts, clearly not counted, with dismiss affordances", () => {
  const sb = S({ dismissedSubsteps: {} });
  const html = sb.decompositionPanelHtml(compoundStep({ systemsTools: "Case platform", humanCheckpoint: "approve" }));
  assert.match(html, /Suggested decomposition/);
  assert.match(html, /draft, not counted/);
  assert.match(html, /suggested — not captured/);
  assert.match(html, /never count in official totals/);
  assert.match(html, /\[ai-inferred\]/, "ai-inferred provenance badge");
  assert.match(html, /data-wb-decompose-dismiss="s1::retrieve"/);
  assert.match(html, /data-wb-decompose-dismiss="s1::approve"/);
  assert.ok(!/gradient/i.test(html), "no gradient on the meaning-bearing draft");
});

// ── Source-level safety / isolation guards ──────────────────────────────────

test("P6-2: the decomposition code makes no grid write, no scoring call, and is rail-clean", () => {
  const fns = ["buildSuggestedSubsteps", "explicitSubstepItems", "decomposeStep", "decompositionPanelHtml", "dismissSuggestedSubstep", "restoreSuggestedSubstep"];
  const rail = ["headcount", "fte", "eliminat", "automat", "reduce", "cut staff"];
  for (const fn of fns) {
    const body = extractFunction(source, fn);
    assert.ok(!/patchField/.test(body), `${fn}: no grid write`);
    assert.ok(!/getStepOpportunityMeta|scoreRecipeReadiness|buildAgentRecipeIr|computeBusinessCase/.test(body), `${fn}: never touches scorers`);
    const low = body.toLowerCase();
    for (const w of rail) assert.ok(!low.includes(w), `${fn}: rail token "${w}"`);
  }
  // suggestions live in their own items — never assigned back onto step.workActions
  for (const fn of fns) {
    assert.ok(!/step\.workActions\s*=/.test(extractFunction(source, fn)), `${fn}: never writes step.workActions`);
  }
});

test("P6-2: no Phase 5 / gate function references P6-2 symbols", () => {
  const phase5Fns = [
    "buildModeledWorkActions", "modeledWorkActionsHtml",
    "recipeGateCheck", "isUnitConfirmed", "confirmedView", "hardenedRecipeSpec", "confirmUnit",
    "buildConfirmationLadder", "buildPlacementExplainer",
    "getStepOpportunityMeta", "scoreRecipeReadiness"
  ];
  const tokens = ["buildSuggestedSubsteps", "decomposeStep", "SUBSTEP_TEMPLATES", "decompositionPanelHtml", "dismissedSubsteps"];
  for (const fn of phase5Fns) {
    const body = extractFunction(source, fn);
    for (const tok of tokens) {
      assert.ok(!body.includes(tok), `${fn} must not reference P6-2 token ${tok}`);
    }
  }
});
