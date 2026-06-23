// P5-4A — Compound-Step Granularity Guard.
// Tests verify:
//   • detectCompoundStep returns null for null/exempt step
//   • decision and human_held classes are exempt (return null)
//   • Signal A: engine flagCombinedStep → reasons include class-change
//   • Signal B: broad aggregate verb → reasons include verb name
//   • Signal C: bundle/scope noun → reasons include noun name
//   • Signal D: 3+ systems named → reasons include three-or-more signal
//   • Signal E: mixed AI/human workActions → reasons include mixed-action signal
//   • "Check entity details" → flags (broad verb)
//   • "Review onboarding package" → flags (verb + noun)
//   • "Validate account setup" → flags (verb + noun)
//   • "Process exception" → flags (verb + noun)
//   • "Download account statement" → does NOT flag
//   • "Read report" → does NOT flag
//   • "Send confirmation email" → does NOT flag
//   • "Approve onboarding" with decision class → does NOT flag (exempt)
//   • warning/detail copy verbatim
//   • buildPlacementExplainer: compoundGuard null when no signal
//   • buildPlacementExplainer: compoundGuard non-null when compound detected
//   • compoundWarning = cg.warning when compound detected, else null
//   • placementExplainerHtml: srcLabel unchanged when no compound
//   • placementExplainerHtml: srcLabel gains " · provisional" when compound
//   • placementExplainerHtml: warning + detail rendered when compound present
//   • placementExplainerHtml: no compound text when compoundGuard null
//   • rail-clean: no headcount / FTE / reduction / eliminate / automate in source
//   • Phase 6 guard: no workIntent / stepFunction / policyUpload / unitEconomics

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Sandbox helpers ────────────────────────────────────────────────────────────

function makeDetectSandbox(opts = {}) {
  const {
    clsFn    = (s) => (s && s.cls) || "assembly",
    cells    = {},
    engineFn = () => null
  } = opts;
  return buildSandbox(source, {
    functions: ["detectCompoundStep"],
    globals: {
      engineStepClass: clsFn,
      gridCellValue:   (step, k) => cells[k] || "",
      studioEngine:    engineFn
    }
  });
}

function makeFullSandbox(opts = {}) {
  const {
    clsFn    = (s) => (s && s.cls) || "assembly",
    tierFn   = () => undefined,
    shapeFn  = () => null,
    engineFn = () => null,
    cells    = {}
  } = opts;
  return buildSandbox(source, {
    consts:    ["PLACEMENT_SHAPE_LABELS"],
    functions: ["detectCompoundStep", "inferStepPlacementShape", "buildPlacementExplainer", "placementExplainerHtml"],
    globals: {
      gridCellValue:   (step, k) => cells[k] || "",
      engineStepClass: clsFn,
      engineDataTier:  tierFn,
      solutionShapeOf: shapeFn,
      studioEngine:    engineFn,
      escapeHtml:      (s) => String(s == null ? "" : s)
    }
  });
}

function makeStep(overrides = {}) {
  return Object.assign({ id: "s1", step: "Test step", cls: "assembly" }, overrides);
}

// ── Null / exempt guard ────────────────────────────────────────────────────────

test("P5-4A: detectCompoundStep returns null for null input", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  assert.equal(detectCompoundStep(null), null);
});

test("P5-4A: detectCompoundStep returns null for undefined", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  assert.equal(detectCompoundStep(undefined), null);
});

test("P5-4A: decision class is exempt — returns null", () => {
  const { detectCompoundStep } = makeDetectSandbox({ clsFn: () => "decision" });
  const r = detectCompoundStep(makeStep({ step: "Approve onboarding", cls: "decision" }));
  assert.equal(r, null);
});

test("P5-4A: human_held class is exempt — returns null", () => {
  const { detectCompoundStep } = makeDetectSandbox({ clsFn: () => "human_held" });
  const r = detectCompoundStep(makeStep({ step: "Review with senior", cls: "human_held" }));
  assert.equal(r, null);
});

// ── Signal A: engine class-change ─────────────────────────────────────────────

test("P5-4A: Signal A — engine.flagCombinedStep combined=true adds class-change reason", () => {
  const mockEngine = () => ({
    flagCombinedStep: (_n) => ({ combined: true, suggestion: "assembly bundled with decision" })
  });
  const { detectCompoundStep } = makeDetectSandbox({ engineFn: mockEngine });
  const r = detectCompoundStep(makeStep({ step: "Extract and approve data" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.startsWith("class-change")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal A — engine.flagCombinedStep combined=false does not add class-change reason", () => {
  const mockEngine = () => ({
    flagCombinedStep: (_n) => ({ combined: false })
  });
  const { detectCompoundStep } = makeDetectSandbox({ engineFn: mockEngine });
  const r = detectCompoundStep(makeStep({ step: "Download statement" }));
  assert.equal(r, null);
});

test("P5-4A: Signal A — studioEngine null is handled safely", () => {
  const { detectCompoundStep } = makeDetectSandbox({ engineFn: () => null });
  const r = detectCompoundStep(makeStep({ step: "Download statement" }));
  assert.equal(r, null);
});

// ── Signal B: broad aggregate verb ────────────────────────────────────────────

test("P5-4A: Signal B — 'check' is a broad aggregate verb", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Check entity details" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("broad aggregate verb") && rs.includes("check")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal B — 'review' is a broad aggregate verb", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Review the document" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("broad aggregate verb") && rs.includes("review")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal B — 'validate' matches broad aggregate verb regex", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Validate account setup" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("broad aggregate verb")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal B — 'process' is a broad aggregate verb", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Process exception" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("broad aggregate verb")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal B — 'handle' is a broad aggregate verb", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Handle the request" }));
  assert.ok(r, "should flag");
});

// ── Signal C: bundle/scope noun ───────────────────────────────────────────────

test("P5-4A: Signal C — 'package' is a bundle noun", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Prepare onboarding package" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("bundle noun")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal C — 'setup' is a bundle noun", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Configure setup" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("bundle noun") && rs.includes("setup")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal C — 'exception' is a bundle noun", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Log the exception" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("bundle noun") && rs.includes("exception")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal C — 'onboarding' is a bundle noun", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Start onboarding" }));
  assert.ok(r, "should flag");
});

// ── Signal D: 3+ systems ──────────────────────────────────────────────────────

test("P5-4A: Signal D — three systems named triggers compound flag", () => {
  const { detectCompoundStep } = makeDetectSandbox({
    cells: { systemsTools: "Salesforce, SAP, ServiceNow" }
  });
  const r = detectCompoundStep(makeStep({ step: "Upload file" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("three or more systems")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal D — two systems do not trigger the three-system signal", () => {
  const { detectCompoundStep } = makeDetectSandbox({
    cells: { systemsTools: "Salesforce, SAP" }
  });
  const r = detectCompoundStep(makeStep({ step: "Upload file" }));
  assert.equal(r, null);
});

test("P5-4A: Signal D — semicolon-separated systems also counted", () => {
  const { detectCompoundStep } = makeDetectSandbox({
    cells: { systemsTools: "CRM; ERP; ITSM" }
  });
  const r = detectCompoundStep(makeStep({ step: "Upload file" }));
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("three or more systems")), `reasons: ${r.reasons}`);
});

// ── Signal E: mixed workActions ───────────────────────────────────────────────

test("P5-4A: Signal E — mixed AI/human workActions flags compound", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const step = makeStep({
    step: "Submit form",
    workActions: [
      { owner: "ai",    channel: "online" },
      { owner: "human", channel: "offline" }
    ]
  });
  const r = detectCompoundStep(step);
  assert.ok(r, "should flag");
  assert.ok(r.reasons.some((rs) => rs.includes("mixed AI/human")), `reasons: ${r.reasons}`);
});

test("P5-4A: Signal E — all AI workActions does not trigger mixed signal", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const step = makeStep({
    step: "Submit form",
    workActions: [
      { owner: "ai", channel: "online" },
      { owner: "ai", channel: "online" }
    ]
  });
  const r = detectCompoundStep(step);
  assert.equal(r, null);
});

test("P5-4A: Signal E — single action does not trigger mixed signal (need 2+)", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const step = makeStep({
    step: "Submit form",
    workActions: [{ owner: "human", channel: "offline" }]
  });
  const r = detectCompoundStep(step);
  assert.equal(r, null);
});

// ── Examples that SHOULD flag ─────────────────────────────────────────────────

test("P5-4A: 'Check entity details' flags compound", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Check entity details" }));
  assert.ok(r, "should flag");
  assert.equal(typeof r.warning, "string");
});

test("P5-4A: 'Review onboarding package' flags compound", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Review onboarding package" }));
  assert.ok(r, "should flag");
});

test("P5-4A: 'Validate account setup' flags compound", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Validate account setup" }));
  assert.ok(r, "should flag");
});

test("P5-4A: 'Process exception' flags compound", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Process exception" }));
  assert.ok(r, "should flag");
});

// ── Examples that should NOT flag ─────────────────────────────────────────────

test("P5-4A: 'Download account statement' does NOT flag", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Download account statement" }));
  assert.equal(r, null);
});

test("P5-4A: 'Read report' does NOT flag", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Read report" }));
  assert.equal(r, null);
});

test("P5-4A: 'Send confirmation email' does NOT flag", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Send confirmation email" }));
  assert.equal(r, null);
});

test("P5-4A: 'Approve onboarding' with decision class does NOT flag (exempt)", () => {
  const { detectCompoundStep } = makeDetectSandbox({ clsFn: () => "decision" });
  const r = detectCompoundStep(makeStep({ step: "Approve onboarding", cls: "decision" }));
  assert.equal(r, null);
});

// ── Warning/detail copy verbatim ──────────────────────────────────────────────

test("P5-4A: warning copy is verbatim as required", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Review onboarding package" }));
  assert.ok(r, "should flag");
  assert.equal(
    r.warning,
    "Compound step likely — this step may contain multiple actions with different AI fit. Split or confirm before treating placement as final."
  );
});

test("P5-4A: detail copy is verbatim as required", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Check entity details" }));
  assert.ok(r, "should flag");
  assert.equal(
    r.detail,
    "May include retrieval, extraction, reconciliation, exception assessment, routing, or approval."
  );
});

test("P5-4A: result has reasons array with at least one entry", () => {
  const { detectCompoundStep } = makeDetectSandbox();
  const r = detectCompoundStep(makeStep({ step: "Process exception" }));
  assert.ok(r, "should flag");
  assert.ok(Array.isArray(r.reasons) && r.reasons.length >= 1, `reasons: ${JSON.stringify(r.reasons)}`);
});

// ── buildPlacementExplainer integration ───────────────────────────────────────

test("P5-4A: buildPlacementExplainer — compoundGuard null for atomic step", () => {
  const { buildPlacementExplainer } = makeFullSandbox();
  const r = buildPlacementExplainer(makeStep({ step: "Download account statement" }));
  assert.ok(r, "explainer returned");
  assert.equal(r.compoundGuard, null);
  assert.equal(r.compoundWarning, null);
});

test("P5-4A: buildPlacementExplainer — compoundGuard non-null for compound step", () => {
  const { buildPlacementExplainer } = makeFullSandbox();
  const r = buildPlacementExplainer(makeStep({ step: "Check entity details" }));
  assert.ok(r, "explainer returned");
  assert.ok(r.compoundGuard !== null, "compoundGuard should be set");
  assert.equal(typeof r.compoundGuard.warning, "string");
  assert.equal(typeof r.compoundGuard.detail, "string");
  assert.ok(Array.isArray(r.compoundGuard.reasons));
});

test("P5-4A: buildPlacementExplainer — compoundWarning equals cg.warning when compound", () => {
  const { buildPlacementExplainer } = makeFullSandbox();
  const r = buildPlacementExplainer(makeStep({ step: "Review onboarding package" }));
  assert.ok(r, "explainer returned");
  assert.equal(r.compoundWarning, r.compoundGuard.warning);
  assert.ok(r.compoundWarning.startsWith("Compound step likely"));
});

test("P5-4A: buildPlacementExplainer — placement marked provisional in note field is absent (note from PLACEMENT_SHAPE_LABELS)", () => {
  const { buildPlacementExplainer } = makeFullSandbox();
  const r = buildPlacementExplainer(makeStep({ step: "Download account statement" }));
  assert.ok(r, "explainer returned");
  assert.equal(typeof r.note, "string");
  assert.ok(r.note.length > 0, "note should be non-empty");
});

// ── placementExplainerHtml integration ───────────────────────────────────────

test("P5-4A: placementExplainerHtml — no compound text when compoundGuard is null", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeFullSandbox();
  const explainer = buildPlacementExplainer(makeStep({ step: "Download account statement" }));
  const html = placementExplainerHtml(explainer, "workbench");
  assert.ok(!html.includes("Compound step likely"), "should not contain compound warning");
  assert.ok(!html.includes("· provisional"), "srcLabel should not include provisional");
});

test("P5-4A: placementExplainerHtml — warning text rendered when compoundGuard present", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeFullSandbox();
  const explainer = buildPlacementExplainer(makeStep({ step: "Check entity details" }));
  const html = placementExplainerHtml(explainer, "workbench");
  assert.ok(html.includes("Compound step likely"), `warning not found in html`);
});

test("P5-4A: placementExplainerHtml — detail text rendered when compoundGuard present", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeFullSandbox();
  const explainer = buildPlacementExplainer(makeStep({ step: "Review onboarding package" }));
  const html = placementExplainerHtml(explainer, "workbench");
  assert.ok(html.includes("May include retrieval"), `detail not found in html`);
});

test("P5-4A: placementExplainerHtml — srcLabel gains '· provisional' when compound", () => {
  const { buildPlacementExplainer, placementExplainerHtml } = makeFullSandbox();
  const explainer = buildPlacementExplainer(makeStep({ step: "Process exception" }));
  const html = placementExplainerHtml(explainer, "workbench");
  assert.ok(html.includes("· provisional"), `provisional marker not found in html`);
});

test("P5-4A: placementExplainerHtml — null explainer returns empty string", () => {
  const { placementExplainerHtml } = makeFullSandbox();
  assert.equal(placementExplainerHtml(null, "workbench"), "");
});

// ── Source-level rail / Phase 6 guards ────────────────────────────────────────

test("P5-4A: detectCompoundStep source — no headcount/FTE/reduction/eliminate/automate framing", () => {
  const fn = extractFunction(source, "detectCompoundStep");
  const rail = ["headcount", "fte", "reduction", "eliminat", "automat"];
  const violations = rail.filter((w) => fn.toLowerCase().includes(w));
  assert.deepEqual(violations, [], `Rail violations: ${violations}`);
});

test("P5-4A: detectCompoundStep source — no Phase 6 items", () => {
  const fn = extractFunction(source, "detectCompoundStep");
  const p6 = ["workIntent", "stepFunction", "policyUpload", "unitEconomics"];
  const violations = p6.filter((w) => fn.includes(w));
  assert.deepEqual(violations, [], `Phase 6 violations: ${violations}`);
});

test("P5-4A: detectCompoundStep source — no auto-split or substep decomposition", () => {
  const fn = extractFunction(source, "detectCompoundStep");
  assert.ok(!fn.includes("autoSplit"), "no autoSplit");
  assert.ok(!fn.includes("subStep") && !fn.includes("substep"), "no substep");
});

test("P5-4A: buildPlacementExplainer source — Phase 6 items absent", () => {
  const fn = extractFunction(source, "buildPlacementExplainer");
  const p6 = ["workIntent", "stepFunction", "policyUpload", "unitEconomics"];
  const violations = p6.filter((w) => fn.includes(w));
  assert.deepEqual(violations, [], `Phase 6 violations: ${violations}`);
});
