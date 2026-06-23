// P5-1 — Legacy / Thin-Step Modeled Fallback.
// Tests verify:
//   • buildModeledWorkActions(null/no-id) → null
//   • step WITH workActions → null (explicit wins, no override)
//   • step too thin (assembly default + no evidence) → null
//   • decision class → models human approve/decide action
//   • human_held class → models human-led action
//   • judgment class → models AI analysis + human judgment pair
//   • gather class → models AI retrieve
//   • gather + systemsTools → tool reference in label
//   • gather + checkpoint → adds human review action
//   • assembly + human verb (approve/review) → models AI prepare + human confirm
//   • assembly + AI verb (draft/generate) → models AI action
//   • assembly + tools → tool reference in modeled label
//   • assembly + checkpoint → adds human review
//   • assembly + rules → adds AI rule-apply action
//   • confidence: "moderate" when ≥2 distinct evidence signals
//   • confidence: "low" when only 1 signal
//   • evidenceUsed includes cls and verb when present
//   • missingEvidence always includes "Explicit action decomposition"
//   • modeledWorkActionsHtml(null) → ""
//   • HTML contains wb-modeled-acts class
//   • HTML contains "Modeled — not captured"
//   • HTML contains confidence text
//   • HTML renders AI/Human owner labels
//   • wbStepBodyHtml: P5-1 typeof-guarded injection present in source
//   • wbStepBodyHtml: calls buildModeledWorkActions
//   • Compound thin step: both modeled guidance and (via P5-4A) compound warning available
//   • Official rollup: buildModeledWorkActions never writes to step.workActions
//   • Phase 6 guard: no workIntent/stepFunction/policyUpload/unitEconomics
//   • Rail guard: no headcount/FTE/eliminat/automat in buildModeledWorkActions source

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Sandbox helpers ────────────────────────────────────────────────────────────

function makeSandbox(opts = {}) {
  const {
    clsFn  = (s) => (s && s.cls) || "assembly",
    cells  = {}
  } = opts;
  return buildSandbox(source, {
    functions: ["buildModeledWorkActions", "modeledWorkActionsHtml"],
    globals: {
      engineStepClass: clsFn,
      gridCellValue:   (step, k) => cells[k] || "",
      escapeHtml:      (s) => String(s == null ? "" : s)
    }
  });
}

function makeStep(overrides = {}) {
  return Object.assign({ id: "s1", step: "Test step", cls: "assembly" }, overrides);
}

// ── Null / guard ───────────────────────────────────────────────────────────────

test("P5-1: buildModeledWorkActions returns null for null input", () => {
  const { buildModeledWorkActions } = makeSandbox();
  assert.equal(buildModeledWorkActions(null), null);
});

test("P5-1: buildModeledWorkActions returns null for step with no id", () => {
  const { buildModeledWorkActions } = makeSandbox();
  assert.equal(buildModeledWorkActions({ step: "No id" }), null);
});

test("P5-1: buildModeledWorkActions returns null when explicit workActions present", () => {
  const { buildModeledWorkActions } = makeSandbox();
  const step = makeStep({ workActions: [{ label: "Do it", owner: "ai", channel: "online" }] });
  assert.equal(buildModeledWorkActions(step), null);
});

test("P5-1: buildModeledWorkActions returns null for too-thin step (assembly default + no evidence)", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "assembly" });
  const step = { id: "s1", step: "", cls: "assembly" };
  assert.equal(buildModeledWorkActions(step), null);
});

// ── Explicit workActions authority ────────────────────────────────────────────

test("P5-1: explicit workActions are authoritative — empty array is still treated as no-acts", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "gather" });
  const step = makeStep({ step: "Gather documents", workActions: [] });
  const r = buildModeledWorkActions(step);
  assert.ok(r !== null, "empty array = no explicit acts, should model");
});

test("P5-1: non-empty workActions prevent modeled fallback (array with 1+ items)", () => {
  const { buildModeledWorkActions } = makeSandbox();
  const step = makeStep({ workActions: [{ label: "x", owner: "human", channel: "offline" }] });
  assert.equal(buildModeledWorkActions(step), null);
});

// ── Decision / human_held class ───────────────────────────────────────────────

test("P5-1: decision class models human approve/decide action", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "decision" });
  const r = buildModeledWorkActions(makeStep({ step: "Approve loan request", cls: "decision" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.modeledActs.some((a) => a.owner === "human"), "has human action");
  assert.ok(r.modeledActs.some((a) => a.label.toLowerCase().includes("approve") || a.label.toLowerCase().includes("decide")), `label: ${r.modeledActs.map((a) => a.label).join(", ")}`);
});

test("P5-1: human_held class models human-led action", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "human_held" });
  const r = buildModeledWorkActions(makeStep({ step: "Senior review", cls: "human_held" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.modeledActs.some((a) => a.owner === "human"), "has human action");
  assert.ok(r.modeledActs.every((a) => a.owner === "human"), "all actions human for human_held");
});

// ── Judgment class ────────────────────────────────────────────────────────────

test("P5-1: judgment class models AI analysis + human judgment pair", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "judgment" });
  const r = buildModeledWorkActions(makeStep({ step: "Assess credit risk", cls: "judgment" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.modeledActs.some((a) => a.owner === "ai"),    "has AI action");
  assert.ok(r.modeledActs.some((a) => a.owner === "human"), "has human action");
  assert.ok(r.modeledActs.length >= 2, "judgment has at least 2 actions");
});

test("P5-1: judgment AI action is online channel", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "judgment" });
  const r = buildModeledWorkActions(makeStep({ step: "Assess credit risk", cls: "judgment" }));
  const aiAct = r.modeledActs.find((a) => a.owner === "ai");
  assert.ok(aiAct, "AI action present");
  assert.equal(aiAct.channel, "online");
});

test("P5-1: judgment human action is offline channel", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "judgment" });
  const r = buildModeledWorkActions(makeStep({ step: "Assess credit risk", cls: "judgment" }));
  const humAct = r.modeledActs.find((a) => a.owner === "human");
  assert.ok(humAct, "human action present");
  assert.equal(humAct.channel, "offline");
});

// ── Gather class ──────────────────────────────────────────────────────────────

test("P5-1: gather class models AI retrieve action (online)", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "gather" });
  const r = buildModeledWorkActions(makeStep({ step: "Gather source documents", cls: "gather" }));
  assert.ok(r, "should return modeled");
  const aiAct = r.modeledActs.find((a) => a.owner === "ai");
  assert.ok(aiAct, "AI action present");
  assert.ok(aiAct.label.toLowerCase().includes("retriev"), `label: ${aiAct.label}`);
});

test("P5-1: gather + systemsTools includes tool reference in label", () => {
  const { buildModeledWorkActions } = makeSandbox({
    clsFn: () => "gather",
    cells: { systemsTools: "SharePoint" }
  });
  const r = buildModeledWorkActions(makeStep({ step: "Gather source documents", cls: "gather" }));
  assert.ok(r, "should return modeled");
  const aiAct = r.modeledActs.find((a) => a.owner === "ai");
  assert.ok(aiAct.label.includes("SharePoint"), `label: ${aiAct.label}`);
});

test("P5-1: gather + humanCheckpoint adds human review action", () => {
  const { buildModeledWorkActions } = makeSandbox({
    clsFn: () => "gather",
    cells: { humanCheckpoint: "QA reviews before submission" }
  });
  const r = buildModeledWorkActions(makeStep({ step: "Gather source documents", cls: "gather" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.modeledActs.some((a) => a.owner === "human"), "human review action added");
});

// ── Assembly / build class ────────────────────────────────────────────────────

test("P5-1: assembly + human verb (approve) → models AI prepare + human confirm pair", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "assembly" });
  const r = buildModeledWorkActions(makeStep({ step: "Approve client deliverable", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.modeledActs.some((a) => a.owner === "ai"),    "has AI prepare action");
  assert.ok(r.modeledActs.some((a) => a.owner === "human"), "has human confirm action");
});

test("P5-1: assembly + human verb (review) → models AI prepare + human review pair", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "assembly" });
  const r = buildModeledWorkActions(makeStep({ step: "Review output document", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.modeledActs.some((a) => a.owner === "human"), "human action present");
});

test("P5-1: assembly + AI verb (draft) → models primary AI action", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "assembly" });
  const r = buildModeledWorkActions(makeStep({ step: "Draft proposal section", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  const aiAct = r.modeledActs.find((a) => a.owner === "ai");
  assert.ok(aiAct, "AI action present");
  assert.ok(aiAct.label.toLowerCase().includes("draft"), `label: ${aiAct.label}`);
});

test("P5-1: assembly + generate verb → models AI generate action", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "assembly" });
  const r = buildModeledWorkActions(makeStep({ step: "Generate summary", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.modeledActs.some((a) => a.owner === "ai"), "AI action present");
});

test("P5-1: assembly + systemsTools → tool reference in AI action label", () => {
  const { buildModeledWorkActions } = makeSandbox({
    clsFn: () => "assembly",
    cells: { systemsTools: "Salesforce CRM" }
  });
  const r = buildModeledWorkActions(makeStep({ step: "Send confirmation", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  const aiAct = r.modeledActs.find((a) => a.owner === "ai");
  assert.ok(aiAct && aiAct.label.includes("Salesforce"), `label: ${aiAct ? aiAct.label : "none"}`);
});

test("P5-1: assembly + humanCheckpoint → adds human review action", () => {
  const { buildModeledWorkActions } = makeSandbox({
    clsFn: () => "assembly",
    cells: { humanCheckpoint: "Manager must sign off" }
  });
  const r = buildModeledWorkActions(makeStep({ step: "Send notification", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.modeledActs.some((a) => a.owner === "human"), "human review action added");
});

test("P5-1: assembly + rulesDecisionLogic → adds AI rule-apply action", () => {
  const { buildModeledWorkActions } = makeSandbox({
    clsFn: () => "assembly",
    cells: { rulesDecisionLogic: "Apply rate table per tier" }
  });
  const r = buildModeledWorkActions(makeStep({ step: "Generate output", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  const ruleAct = r.modeledActs.find((a) => a.basis === "rulesDecisionLogic");
  assert.ok(ruleAct, "rule-apply action present");
  assert.equal(ruleAct.owner, "ai");
});

// ── Confidence ────────────────────────────────────────────────────────────────

test("P5-1: confidence is 'moderate' when ≥2 distinct evidence signals (non-assembly cls + verb)", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "gather" });
  const r = buildModeledWorkActions(makeStep({ step: "Gather documents", cls: "gather" }));
  assert.ok(r, "should return modeled");
  assert.equal(r.confidence, "moderate");
});

test("P5-1: confidence is 'low' when only 1 evidence signal (assembly + verb only)", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "assembly" });
  const r = buildModeledWorkActions(makeStep({ step: "Draft the proposal", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  assert.equal(r.confidence, "low");
});

test("P5-1: confidence 'moderate' with assembly cls + verb + one cell", () => {
  const { buildModeledWorkActions } = makeSandbox({
    clsFn: () => "assembly",
    cells: { systemsTools: "Word" }
  });
  const r = buildModeledWorkActions(makeStep({ step: "Draft the proposal", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  assert.equal(r.confidence, "moderate");
});

// ── evidenceUsed / missingEvidence ────────────────────────────────────────────

test("P5-1: evidenceUsed includes cls when cls is present", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "gather" });
  const r = buildModeledWorkActions(makeStep({ step: "Gather docs", cls: "gather" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.evidenceUsed.some((e) => e.startsWith("class:")), `evidenceUsed: ${r.evidenceUsed}`);
});

test("P5-1: evidenceUsed includes verb when extracted from step name", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "assembly" });
  const r = buildModeledWorkActions(makeStep({ step: "Draft report section", cls: "assembly" }));
  assert.ok(r, "should return modeled");
  assert.ok(r.evidenceUsed.some((e) => e.includes("verb")), `evidenceUsed: ${r.evidenceUsed}`);
});

test("P5-1: missingEvidence always includes 'Explicit action decomposition'", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "judgment" });
  const r = buildModeledWorkActions(makeStep({ step: "Judge risk level", cls: "judgment" }));
  assert.ok(r, "should return modeled");
  assert.ok(
    r.missingEvidence.some((m) => m.includes("action decomposition")),
    `missingEvidence: ${r.missingEvidence}`
  );
});

test("P5-1: missingEvidence includes systems when systemsTools empty", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "gather" });
  const r = buildModeledWorkActions(makeStep({ step: "Gather data", cls: "gather" }));
  assert.ok(r, "should return modeled");
  assert.ok(
    r.missingEvidence.some((m) => m.toLowerCase().includes("systems")),
    `missingEvidence: ${r.missingEvidence}`
  );
});

// ── modeledWorkActionsHtml renderer ───────────────────────────────────────────

test("P5-1: modeledWorkActionsHtml returns '' for null", () => {
  const { modeledWorkActionsHtml } = makeSandbox();
  assert.equal(modeledWorkActionsHtml(null), "");
});

test("P5-1: modeledWorkActionsHtml returns '' for modeled with empty acts", () => {
  const { modeledWorkActionsHtml } = makeSandbox();
  assert.equal(modeledWorkActionsHtml({ modeledActs: [], evidenceUsed: [], missingEvidence: [], confidence: "low" }), "");
});

test("P5-1: HTML contains wb-modeled-acts class", () => {
  const { buildModeledWorkActions, modeledWorkActionsHtml } = makeSandbox({ clsFn: () => "gather" });
  const html = modeledWorkActionsHtml(buildModeledWorkActions(makeStep({ step: "Gather docs", cls: "gather" })));
  assert.ok(html.includes("wb-modeled-acts"), "wb-modeled-acts class present");
});

test("P5-1: HTML contains 'Modeled — not captured'", () => {
  const { buildModeledWorkActions, modeledWorkActionsHtml } = makeSandbox({ clsFn: () => "gather" });
  const html = modeledWorkActionsHtml(buildModeledWorkActions(makeStep({ step: "Gather docs", cls: "gather" })));
  assert.ok(html.includes("Modeled — not captured"), "modeled label present");
});

test("P5-1: HTML contains 'moderate evidence' for moderate confidence", () => {
  const { buildModeledWorkActions, modeledWorkActionsHtml } = makeSandbox({ clsFn: () => "judgment" });
  // "assess" in VERB_RE gives a second signal → judgment class + verb → moderate
  const html = modeledWorkActionsHtml(buildModeledWorkActions(makeStep({ step: "Assess risk level", cls: "judgment" })));
  assert.ok(html.includes("moderate evidence"), `html missing confidence text`);
});

test("P5-1: HTML contains 'limited evidence' for low confidence", () => {
  const { buildModeledWorkActions, modeledWorkActionsHtml } = makeSandbox({ clsFn: () => "assembly" });
  const html = modeledWorkActionsHtml(buildModeledWorkActions(makeStep({ step: "Draft output", cls: "assembly" })));
  assert.ok(html.includes("limited evidence"), `html missing confidence text`);
});

test("P5-1: HTML renders AI owner label", () => {
  const { buildModeledWorkActions, modeledWorkActionsHtml } = makeSandbox({ clsFn: () => "gather" });
  const html = modeledWorkActionsHtml(buildModeledWorkActions(makeStep({ step: "Gather docs", cls: "gather" })));
  assert.ok(html.includes(">AI<"), "AI owner label present");
});

test("P5-1: HTML renders Human owner label for human-led actions", () => {
  const { buildModeledWorkActions, modeledWorkActionsHtml } = makeSandbox({ clsFn: () => "decision" });
  const html = modeledWorkActionsHtml(buildModeledWorkActions(makeStep({ step: "Approve request", cls: "decision" })));
  assert.ok(html.includes(">Human<"), "Human owner label present");
});

// ── Compound + thin-step coexistence ──────────────────────────────────────────

test("P5-1: compound step with no workActions gets modeled guidance (compound guard handled by P5-4A separately)", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "assembly" });
  // "Check entity details" would also be flagged compound by P5-4A; here we just verify P5-1 still provides modeled guidance
  const r = buildModeledWorkActions(makeStep({ step: "Check entity details", cls: "assembly" }));
  assert.ok(r, "should return modeled even for compound-flagged steps");
});

test("P5-1: buildModeledWorkActions does NOT write to step.workActions", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "gather" });
  const step = makeStep({ step: "Gather docs", cls: "gather" });
  buildModeledWorkActions(step);
  assert.ok(!Array.isArray(step.workActions) || step.workActions.length === 0, "workActions not mutated");
});

// ── Official rollup guard (modeled values must not enter rollups) ──────────────

test("P5-1: modeled result has no workActions field (not injected into step)", () => {
  const { buildModeledWorkActions } = makeSandbox({ clsFn: () => "judgment" });
  const r = buildModeledWorkActions(makeStep({ step: "Assess suitability", cls: "judgment" }));
  assert.ok(r, "should return modeled");
  assert.ok(!("workActions" in r), "result has no workActions field");
});

test("P5-1: wbStepBodyHtml source calls buildModeledWorkActions (typeof-guarded)", () => {
  const fn = extractFunction(source, "wbStepBodyHtml");
  assert.ok(fn.includes("buildModeledWorkActions"), "wbStepBodyHtml calls buildModeledWorkActions");
  assert.ok(fn.includes("typeof buildModeledWorkActions"), "typeof-guarded");
});

test("P5-1: wbStepBodyHtml source calls modeledWorkActionsHtml (typeof-guarded)", () => {
  const fn = extractFunction(source, "wbStepBodyHtml");
  assert.ok(fn.includes("modeledWorkActionsHtml"), "wbStepBodyHtml calls modeledWorkActionsHtml");
  assert.ok(fn.includes("typeof modeledWorkActionsHtml"), "typeof-guarded");
});

test("P5-1: wbStepBodyHtml fallback: original 'no actions' message preserved for zero-evidence steps", () => {
  const fn = extractFunction(source, "wbStepBodyHtml");
  assert.ok(fn.includes("No actions captured"), "fallback message preserved");
});

// ── Source-level rail / Phase 6 guards ────────────────────────────────────────

test("P5-1: buildModeledWorkActions source — no headcount/FTE/eliminat/automat framing", () => {
  const fn = extractFunction(source, "buildModeledWorkActions");
  const rail = ["headcount", "fte", "eliminat", "automat"];
  const violations = rail.filter((w) => fn.toLowerCase().includes(w));
  assert.deepEqual(violations, [], `Rail violations: ${violations}`);
});

test("P5-1: buildModeledWorkActions source — no Phase 6 items", () => {
  const fn = extractFunction(source, "buildModeledWorkActions");
  const p6 = ["workIntent", "stepFunction", "policyUpload", "unitEconomics"];
  const violations = p6.filter((w) => fn.includes(w));
  assert.deepEqual(violations, [], `Phase 6 violations: ${violations}`);
});

test("P5-1: buildModeledWorkActions source — no auto-split or substep creation behavior", () => {
  const fn = extractFunction(source, "buildModeledWorkActions");
  assert.ok(!fn.includes("autoSplit"), "no autoSplit");
  assert.ok(!fn.includes("substep") && !fn.includes("subStep"), "no substep");
  // "decomposition" may appear in the missingEvidence message (what to capture), not as behavior
  assert.ok(!fn.includes("autoDecompose"), "no auto-decompose behavior");
});

test("P5-1: modeledWorkActionsHtml source — no Phase 6 items", () => {
  const fn = extractFunction(source, "modeledWorkActionsHtml");
  const p6 = ["workIntent", "stepFunction", "policyUpload", "unitEconomics"];
  const violations = p6.filter((w) => fn.includes(w));
  assert.deepEqual(violations, [], `Phase 6 violations: ${violations}`);
});
