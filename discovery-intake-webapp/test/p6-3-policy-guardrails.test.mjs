// P6-3 — Permission & entitlement policy guardrails (draft, reviewable). Executed,
// deterministic tests over the real shipped code. Proves the PERMISSION/ENTITLEMENT
// framing: sensitive data/systems and described login/access are NEVER auto-blocked;
// the assumption rule (described work ⇒ assumed ordinary access); unknown entitlement
// raises a QUESTION not a block; write/export/approve require stronger controls than
// read; draft guardrails never change official scoring/counting; confirmed guardrails
// are readable by later placement/economics logic; rejected guardrails are ignored.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

const CONSTS = ["ENTITLEMENT_ACTIONS", "ENTITLEMENT_CONTROLS", "ENTITLEMENT_ABSENCE_RE", "POLICY_GUARDRAIL_STATES"];
const FUNCTIONS = [
  "extractPolicyClauses", "policyClip", "entitlementUniq",
  "detectActionTier", "detectEntitlementControls", "detectEntitlementModality",
  "entitlementGrantedText", "entitlementSubject", "entitlementSystem", "buildPolicyGuardrails",
  "ensurePolicyGuardrailReviews", "policyGuardrailState", "confirmPolicyGuardrail",
  "rejectPolicyGuardrail", "resetPolicyGuardrail", "policyGuardrails", "activePolicyGuardrails",
  "stepEntitlementText", "stepEntitlementStatus", "policyEntitlementQuestionsForStep",
  "policyGuardrailsForStep", "policyEntitlementFitForStep", "policyGuardrailsPanelHtml"
];

function S(state, overrides = {}) {
  const globals = Object.assign({
    state: state || { policyGuardrailReviews: {} },
    gridCellValue: (s, k) => (s && s.cells && typeof s.cells[k] === "string" ? s.cells[k] : ""),
    escapeHtml: (s) => String(s == null ? "" : s),
    provenanceBadgeHtml: (src) => `[${src}]`,
    currentAiPolicy: () => null
  }, overrides);
  const code = [
    ...CONSTS.map((n) => extractConst(source, n)),
    ...FUNCTIONS.map((n) => extractFunction(source, n))
  ].join("\n\n");
  const names = [...CONSTS, ...FUNCTIONS];
  const factory = new Function(...Object.keys(globals), `${code}\nreturn { ${names.join(", ")} };`);
  return factory(...Object.values(globals));
}

const POLICY_TEXT = [
  "1. Analysts may read and retrieve client records in the case management system.",
  "2. Operations staff may download and export reports from the ledger with audit logging and reviewer review.",
  "3. No one may approve a payment without the named approval authority.",
  "4. AI tools may assist with retrieval and drafting, but must not approve or release anything."
].join("\n");

function samplePolicy(sb, text = POLICY_TEXT) {
  return { fileName: "AI policy", clauses: sb.extractPolicyClauses(text) };
}

// ── Extraction: permission/entitlement, grounded, no fabrication ─────────────

test("P6-3: a policy yields permission/entitlement guardrails (read, export-with-controls, approval-authority, AI-assist)", () => {
  const sb = S({ policyGuardrailReviews: {} });
  const guardrails = sb.policyGuardrails(samplePolicy(sb));
  const byAction = (a) => guardrails.find((g) => g.action === a);

  const read = byAction("read");
  assert.equal(read.kind, "permission");
  assert.deepEqual(read.controls, []);
  assert.equal(read.fit, "permitted");
  assert.equal(read.state, "suggested");
  assert.equal(read.source, "ai-inferred");

  const exp = byAction("export");
  assert.equal(exp.kind, "permission-with-controls");
  assert.ok(exp.controls.includes("logging"));
  assert.equal(exp.fit, "permitted-with-controls");

  const approve = byAction("approve");
  assert.equal(approve.kind, "approval-authority");
  assert.ok(approve.controls.includes("named-authority"));
  assert.equal(approve.decisionOwner, "named approval authority");
  assert.equal(approve.fit, "requires-authority");

  const ai = guardrails.find((g) => g.kind === "ai-assist-boundary");
  assert.ok(ai, "AI may assist with retrieval/extraction but not approve");
  assert.equal(ai.fit, "ai-assist-only");
});

test("P6-3: sensitive-data / cue-less / missing policy fabricates no rules", () => {
  const sb = S({ policyGuardrailReviews: {} });
  assert.deepEqual(sb.buildPolicyGuardrails(null), []);
  assert.deepEqual(sb.buildPolicyGuardrails({ clauses: [] }), []);
  // a clause that ONLY describes data sensitivity is never a guardrail / blocker
  const sensOnly = { clauses: sb.extractPolicyClauses("1. Client data is highly sensitive and classified as MNPI.") };
  assert.deepEqual(sb.buildPolicyGuardrails(sensOnly), [], "sensitivity alone never blocks");
  // an action verb without a permission/prohibition word is ambiguous → nothing
  const vague = { clauses: sb.extractPolicyClauses("1. Reports are reviewed quarterly by the team.") };
  assert.deepEqual(sb.buildPolicyGuardrails(vague), []);
});

test("P6-3: a control named after \"without\" is NOT read as a required control (no inverted guardrail)", () => {
  const sb = S({ policyGuardrailReviews: {} });
  // A permission that explicitly WAIVES a control must not become a "requires X" rule.
  const policy = { clauses: sb.extractPolicyClauses("1. Senior managers may approve refunds without a named authority review.") };
  const guardrails = sb.buildPolicyGuardrails(policy);
  // it is a permission to approve, NOT an "approval-authority (requires named authority)" rule
  assert.ok(!guardrails.some((g) => g.kind === "approval-authority"), "no inverted 'requires authority' guardrail");
  // and detectEntitlementControls ignores the negated control
  assert.deepEqual(sb.detectEntitlementControls("approve without a named authority review"), [], "negated control ignored");
  assert.deepEqual(sb.detectEntitlementControls("export with audit logging"), ["logging"], "granted control still detected");
});

test("P6-3: American and British spellings of authorize/authorise are both handled", () => {
  const sb = S({ policyGuardrailReviews: {} });
  // absence: both spellings flag unknown entitlement
  for (const txt of ["I'm not authorized to approve", "I'm not authorised to approve"]) {
    assert.equal(sb.stepEntitlementStatus({ id: "x", cells: { description: txt + " in the ledger" } }), "unknown", txt);
  }
  // permission modality: both spellings count as a grant
  assert.equal(sb.detectEntitlementModality("staff are authorized to download reports"), "permit");
  assert.equal(sb.detectEntitlementModality("staff are authorised to download reports"), "permit");
  const policy = { clauses: sb.extractPolicyClauses("1. Operations staff are authorized to download reports from the ledger with logging.") };
  assert.ok(sb.buildPolicyGuardrails(policy).some((g) => g.action === "export"), "American-spelled grant still produces a guardrail");
});

// ── (1) sensitive system + described access is NOT auto-blocked ──────────────

test("P6-3: a sensitive system with described user login/read access is NOT auto-blocked", () => {
  const sb = S({ policyGuardrailReviews: {} });
  const policy = samplePolicy(sb);
  const step = { id: "s1", cells: {
    systemsTools: "General Ledger (MNPI)",
    description: "I log into the GL and read the account balances",
    dataSensitivity: "MNPI"
  } };
  assert.equal(sb.stepEntitlementStatus(step), "assumed-permitted", "described work → assume ordinary access");
  const fit = sb.policyEntitlementFitForStep(step, policy);
  assert.equal(fit.fit, "permitted", "read on a sensitive system is permitted, not blocked");
  assert.deepEqual(fit.questions, []);
});

// ── (2) sensitive system + confirmed read/download entitlement → fit WITH controls ──

test("P6-3: a confirmed read/export entitlement on a sensitive system is policy-fit WITH controls", () => {
  const state = { policyGuardrailReviews: {} };
  const sb = S(state);
  const policy = samplePolicy(sb);
  const step = { id: "s2", cells: {
    systemsTools: "Ledger (confidential)",
    description: "I download and export the monthly report from the ledger"
  } };
  const exp = sb.policyGuardrails(policy).find((g) => g.action === "export");
  sb.confirmPolicyGuardrail(exp.key);
  const fit = sb.policyEntitlementFitForStep(step, policy);
  assert.equal(fit.action, "export");
  assert.equal(fit.fit, "permitted-with-controls", "permitted with controls — not blocked");
  assert.ok(fit.requiredControls.includes("logging"));
});

// ── (3) unknown entitlement → a question, not a block ───────────────────────

test("P6-3: unknown entitlement creates a missing-permission QUESTION, never an automatic block", () => {
  const sb = S({ policyGuardrailReviews: {} });
  const policy = samplePolicy(sb);
  const step = { id: "s3", cells: {
    systemsTools: "Ledger",
    personaActors: "Junior analyst",
    description: "I would approve the payment but I'm not sure I'm authorized to do that yet"
  } };
  assert.equal(sb.stepEntitlementStatus(step), "unknown");
  const qs = sb.policyEntitlementQuestionsForStep(step);
  assert.equal(qs.length, 1);
  assert.match(qs[0].question, /entitlement/i);
  const fit = sb.policyEntitlementFitForStep(step, policy);
  assert.equal(fit.fit, "needs-permission-info", "a question path, not a block");
  assert.equal(fit.questions.length, 1);
});

// ── (4) write/export/approve require stronger controls than read/retrieve ────

test("P6-3: write / export / approve require stronger controls than read / retrieve", () => {
  const sb = S({ policyGuardrailReviews: {} });
  assert.equal(sb.detectActionTier("read the records").tier, 1);
  assert.deepEqual(sb.detectActionTier("read the records").controlFloor, []);
  assert.deepEqual(sb.detectActionTier("export the report").controlFloor, ["logging"]);
  assert.deepEqual(sb.detectActionTier("update the record").controlFloor, ["review"]);
  assert.equal(sb.detectActionTier("approve the payment").tier, 3);
  assert.deepEqual(sb.detectActionTier("approve the payment").controlFloor, ["named-authority"]);
  // highest-consequence action wins when several appear
  assert.equal(sb.detectActionTier("read and then approve the file").action, "approve");

  const policy = samplePolicy(sb);
  const readFit = sb.policyEntitlementFitForStep({ id: "r", cells: { description: "I read balances in the ledger" } }, policy);
  const approveFit = sb.policyEntitlementFitForStep({ id: "a", cells: { description: "I approve the payment in the ledger" } }, policy);
  assert.deepEqual(readFit.requiredControls, [], "read needs no extra control");
  assert.ok(approveFit.requiredControls.includes("named-authority"), "approve needs a named authority");
  assert.equal(approveFit.fit, "requires-authority");
});

// ── (5) draft guardrails do not change official scoring / counting ──────────

test("P6-3: a draft or confirmed guardrail never changes the opportunity score", () => {
  const state = { policyGuardrailReviews: {} };
  const sb = S(state);
  const policy = samplePolicy(sb);
  const getStepOpportunityMeta = eval(`(${extractFunction(source, "getStepOpportunityMeta")})`);
  const step = { id: "s5", cells: { name: { value: "Reconcile balances", state: "confirmed", confidence: 0.9 }, dataSensitivity: { value: "PII", state: "confirmed", confidence: 0.9 }, frequencyVolume: { value: "daily", state: "confirmed", confidence: 0.9 } } };
  const before = getStepOpportunityMeta(step);
  sb.confirmPolicyGuardrail(sb.policyGuardrails(policy)[0].key);
  const after = getStepOpportunityMeta(step);
  assert.deepEqual(after, before);
});

test("P6-3: no scorer / gate / counted function references the policy-guardrail / entitlement layer", () => {
  const scorersAndGate = [
    "getStepOpportunityMeta", "scoreRecipeReadiness", "stepTrustSignals",
    "recipeGateCheck", "isUnitConfirmed", "confirmedView", "hardenedRecipeSpec", "confirmUnit",
    "rollupCountableItems"
  ];
  const tokens = ["policyGuardrail", "activePolicyGuardrails", "policyEntitlementFitForStep", "ENTITLEMENT_ACTIONS"];
  for (const fn of scorersAndGate) {
    const body = extractFunction(source, fn);
    for (const tok of tokens) assert.ok(!body.includes(tok), `${fn} must not reference ${tok}`);
  }
});

// ── (6) confirmed guardrails are readable; rejected are ignored ─────────────

test("P6-3: confirm makes a guardrail readable downstream; reject ignores it; reset → draft", () => {
  const state = { policyGuardrailReviews: {} };
  const sb = S(state);
  const policy = samplePolicy(sb);
  const exp = sb.policyGuardrails(policy).find((g) => g.action === "export");

  assert.equal(sb.activePolicyGuardrails(policy).length, 0, "nothing active until confirmed");
  sb.confirmPolicyGuardrail(exp.key);
  assert.equal(state.policyGuardrailReviews[exp.key], "confirmed", "decision persists");
  assert.ok(sb.activePolicyGuardrails(policy).some((g) => g.key === exp.key));

  sb.rejectPolicyGuardrail(exp.key);
  assert.equal(sb.policyGuardrailState(exp.key), "rejected");
  assert.equal(sb.activePolicyGuardrails(policy).some((g) => g.key === exp.key), false, "rejected is ignored");

  sb.resetPolicyGuardrail(exp.key);
  assert.equal(sb.policyGuardrailState(exp.key), "suggested");
});

// ── Read-only + render + isolation ──────────────────────────────────────────

test("P6-3: the entitlement read APIs never mutate the step and make no grid write", () => {
  const sb = S({ policyGuardrailReviews: {} });
  const policy = samplePolicy(sb);
  const step = { id: "s7", cells: { description: "I export the report from the ledger" } };
  const before = JSON.stringify(step);
  sb.policyEntitlementFitForStep(step, policy);
  sb.policyGuardrailsForStep(step, policy);
  sb.policyEntitlementQuestionsForStep(step);
  assert.equal(JSON.stringify(step), before, "read-only");
  for (const fn of ["buildPolicyGuardrails", "policyEntitlementFitForStep", "confirmPolicyGuardrail", "policyGuardrailsForStep"]) {
    assert.ok(!/patchField/.test(extractFunction(source, fn)), `${fn}: no grid write`);
  }
});

test("P6-3: the panel is empty with no guardrails, and otherwise frames permission (never a block)", () => {
  const sb = S({ policyGuardrailReviews: {} });
  assert.equal(sb.policyGuardrailsPanelHtml(null), "");
  assert.equal(sb.policyGuardrailsPanelHtml({ clauses: [] }), "");
  const html = sb.policyGuardrailsPanelHtml(samplePolicy(sb));
  assert.match(html, /Permission &amp; entitlement guardrails/);
  assert.match(html, /never blocked outright/);
  assert.match(html, /unknown entitlement raises a question/);
  assert.match(html, /data-policy-guardrail-confirm=/);
  assert.match(html, /\[ai-inferred\]/);
  assert.ok(!/gradient/i.test(html));
});

test("P6-3: no Phase 5 / gate function references P6-3 symbols", () => {
  const phase5Fns = [
    "buildModeledWorkActions", "recipeGateCheck", "isUnitConfirmed", "confirmedView",
    "hardenedRecipeSpec", "confirmUnit", "buildConfirmationLadder", "buildPlacementExplainer"
  ];
  const tokens = ["buildPolicyGuardrails", "policyEntitlementFitForStep", "ENTITLEMENT_ACTIONS", "policyGuardrailReviews"];
  for (const fn of phase5Fns) {
    const body = extractFunction(source, fn);
    for (const tok of tokens) assert.ok(!body.includes(tok), `${fn} must not reference P6-3 token ${tok}`);
  }
});
