// V3-10 — Living eval suite (track, don't execute). Executed, deterministic tests
// (NO live LLM) over the eval-suite core: promote/versioning, known-good + anti-goal
// cases, the append-only results log (REUSING the V3-4 audit primitive), the
// read-only regression diff, the "not yet evaluated" state, and the defining
// integrity proof — NO eval-flow function calls a live model. Fixtures neutral.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();
const FIRM_NAMES = /\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i;
const BANNED_PHRASE = /work with your development team/i;

function evalSandbox() {
  return buildSandbox(source, {
    functions: [
      "auditChainHash", "deepFreeze", "recordAuditEvent", "verifyAuditTrail",
      "defaultAntiGoalFor", "normalizeEvalResult", "buildEvalCasesFromIr",
      "buildEvalSuiteVersion", "promoteEvalSuiteInState", "appendEvalRun",
      "evalRegressionDiff", "evalSuiteStatus", "ensureEvalSuites"
    ],
    globals: { state: {} }
  });
}

// A minimal IR fixture shaped like buildAgentRecipeIr's output (neutral).
function makeIr(over = {}) {
  return {
    baseName: "Summarise notes",
    artifactName: "Summarise notes - ChatGPT prompt",
    provenanceSummary: { evidenceBackedCells: 3, inferredCells: 1 },
    doNotAutomateNotes: [
      "Do not perform live API actions, writeback, automated approval, or hidden tool use.",
      "Do not treat low-confidence inferred values as hard rules."
    ],
    testCases: [
      { name: "Happy path", given: "User-provided input", expected: "Draft output", reviewer: "Human confirms." },
      { name: "Missing or ambiguous input", given: "One required input is absent.", expected: "Artifact asks a follow-up or marks the output as draft.", reviewer: "Human confirms before use." },
      { name: "Exception path", given: "An exception appears.", expected: "Artifact surfaces the exception and routes to human review.", reviewer: "Human owner decides." }
    ],
    ...over
  };
}

const allResults = (suite, result) => suite.current.cases.map((c) => ({ caseId: c.id, result }));

// --- promote: named, versioned, snapshot-backed, provenance-tagged -----------

test("promote builds a named, versioned, snapshot-backed suite from IR test cases", () => {
  const { promoteEvalSuiteInState } = evalSandbox();
  const suites = {};
  const suite = promoteEvalSuiteInState(suites, "s1", makeIr(), "art-1", "My suite", "2026-06-13T00:00:00.000Z");
  assert.equal(suite.name, "My suite");
  assert.equal(suite.current.suiteVersion, 1);
  assert.equal(suite.current.artifactSnapshotId, "art-1");
  assert.equal(suite.current.provenance.source, "generated-test-cases");
  assert.equal(suite.current.provenance.evidenceBackedCells, 3);
  assert.equal(suite.current.provenance.inferredCells, 1);
  assert.ok(suite.current.cases.length >= 4, "promoted cases incl. the dedicated anti-goal");
  assert.equal(suite.prior, null);
  assert.ok(Array.isArray(suite.results) && suite.results.length === 0);
  assert.ok(Object.isFrozen(suite.current.cases), "cases are frozen (snapshot value)");
  assert.equal(suites.s1, suite);
});

test("regeneration preserves the prior suite version; results are never reset", () => {
  const { promoteEvalSuiteInState, appendEvalRun } = evalSandbox();
  const suites = {};
  const v1 = promoteEvalSuiteInState(suites, "s1", makeIr(), "art-1", "Suite", "t1");
  appendEvalRun(v1, { actor: { name: "R" }, modelLabel: "m1", caseResults: allResults(v1, "pass"), ts: "tr1" });
  const v2 = promoteEvalSuiteInState(suites, "s1", makeIr({ provenanceSummary: { evidenceBackedCells: 5, inferredCells: 0 } }), "art-2", "Suite", "t2");
  assert.equal(v2.current.suiteVersion, 2);
  assert.equal(v2.current.artifactSnapshotId, "art-2");
  assert.equal(v2.prior.suiteVersion, 1, "prior version preserved");
  assert.equal(v2.prior.artifactSnapshotId, "art-1");
  assert.equal(v2.results.length, 1, "the append-only results log is carried forward, not reset");
});

// --- known-good + anti-goal --------------------------------------------------

test("every case carries a known-good AND an anti-goal; >=1 dedicated anti-goal case", () => {
  const { buildEvalCasesFromIr } = evalSandbox();
  const cases = buildEvalCasesFromIr(makeIr());
  for (const c of cases) {
    assert.ok(typeof c.knownGood === "string" && c.knownGood.length > 0, `${c.name}: known-good`);
    assert.ok(typeof c.antiGoal === "string" && c.antiGoal.length > 0, `${c.name}: anti-goal`);
  }
  const antiGoalCases = cases.filter((c) => c.kind === "anti-goal");
  assert.ok(antiGoalCases.length >= 1, "at least one dedicated anti-goal case");
  assert.match(antiGoalCases[0].antiGoal, /live API action|writeback|automated approval|hidden tool/i,
    "the dedicated anti-goal is derived from do-not-automate guidance");
});

// --- results log: append-only, reuses the V3-4 primitive ---------------------

test("appendEvalRun appends a hash-chained run via the V3-4 primitive (records, never executes)", () => {
  const { promoteEvalSuiteInState, appendEvalRun, verifyAuditTrail } = evalSandbox();
  const suite = promoteEvalSuiteInState({}, "s1", makeIr(), "art-1", "S", "t1");
  const cr = allResults(suite, "pass");
  const r1 = appendEvalRun(suite, { actor: { name: "R" }, modelLabel: "gpt-4o / 2026-05", caseResults: cr, ts: "tr1" });
  assert.equal(r1.ok, true);
  assert.equal(suite.results.length, 1);
  assert.equal(suite.results[0].action, "eval_run_recorded");
  assert.equal(suite.results[0].seq, 1);
  assert.equal(suite.results[0].prevHash, "");
  assert.match(suite.results[0].entryHash, /^[0-9a-f]{16}$/);
  appendEvalRun(suite, { actor: { name: "R" }, modelLabel: "gpt-4o / 2026-06", caseResults: cr, ts: "tr2" });
  assert.equal(suite.results[1].prevHash, suite.results[0].entryHash, "chain links");
  assert.deepEqual(verifyAuditTrail(suite.results), { ok: true, brokenAt: -1, reason: "" });
  // a model/version label is required (toast-guard in the UI mirrors this)
  assert.equal(appendEvalRun(suite, { actor: {}, modelLabel: "", caseResults: cr, ts: "t" }).ok, false);
  assert.equal(appendEvalRun(null, { modelLabel: "x" }).ok, false);
});

test("a recorded run is append-only: edits / deletes are detected; no edit/delete path exists", () => {
  const { promoteEvalSuiteInState, appendEvalRun, verifyAuditTrail } = evalSandbox();
  const suite = promoteEvalSuiteInState({}, "s1", makeIr(), "art-1", "S", "t1");
  const cr = allResults(suite, "pass");
  appendEvalRun(suite, { actor: { name: "R" }, modelLabel: "m1", caseResults: cr, ts: "t1" });
  appendEvalRun(suite, { actor: { name: "R" }, modelLabel: "m2", caseResults: cr, ts: "t2" });
  const edited = JSON.parse(JSON.stringify(suite.results));
  edited[0] = { ...edited[0], target: { ...edited[0].target, modelLabel: "hacked" } };
  assert.equal(verifyAuditTrail(edited).ok, false, "silent edit detected");
  const deleted = JSON.parse(JSON.stringify(suite.results));
  deleted.splice(0, 1);
  assert.equal(verifyAuditTrail(deleted).ok, false, "silent delete detected");
  // structural: nothing in the source mutates a results array in place.
  assert.ok(!/results\s*\.\s*(splice|pop|shift|unshift|reverse|sort|fill|copyWithin)\s*\(/.test(source),
    "no in-place mutator is called on a results array");
});

test("each run stamps the artifact version, the user model label, and a timestamp", () => {
  const { promoteEvalSuiteInState, appendEvalRun } = evalSandbox();
  const suite = promoteEvalSuiteInState({}, "s1", makeIr(), "art-1", "S", "t1");
  appendEvalRun(suite, { actor: { name: "R" }, modelLabel: "gpt-4o / 2026-05", caseResults: allResults(suite, "pass"), ts: "2026-06-13T01:00:00.000Z" });
  const t = suite.results[0].target;
  assert.equal(t.modelLabel, "gpt-4o / 2026-05");
  assert.equal(t.suiteVersion, 1);
  assert.equal(t.artifactSnapshotId, "art-1");
  assert.equal(suite.results[0].ts, "2026-06-13T01:00:00.000Z");
  assert.equal(t.caseResults.length, suite.current.cases.length);
});

// --- regression diff: read-only over stored results --------------------------

test("the regression diff is read-only; identical runs produce an empty diff", () => {
  const { promoteEvalSuiteInState, appendEvalRun, evalRegressionDiff } = evalSandbox();
  const suite = promoteEvalSuiteInState({}, "s1", makeIr(), "art-1", "S", "t1");
  appendEvalRun(suite, { actor: { name: "R" }, modelLabel: "m1", caseResults: allResults(suite, "pass"), ts: "t1" });
  appendEvalRun(suite, { actor: { name: "R" }, modelLabel: "m2", caseResults: allResults(suite, "pass"), ts: "t2" });
  assert.deepEqual(evalRegressionDiff(suite).changes, [], "identical runs -> empty diff");
  const oneFail = suite.current.cases.map((c, i) => ({ caseId: c.id, result: i === 0 ? "fail" : "pass" }));
  appendEvalRun(suite, { actor: { name: "R" }, modelLabel: "m3", caseResults: oneFail, ts: "t3" });
  const before = JSON.parse(JSON.stringify(suite.results));
  const d = evalRegressionDiff(suite);
  assert.equal(d.changes.length, 1);
  assert.deepEqual(d.changes[0], { caseId: "case-1", from: "pass", to: "fail" });
  assert.equal(d.regressed.length, 1);
  assert.deepEqual(suite.results, before, "computing the diff did not mutate stored results");
});

// --- "not yet evaluated" never fabricates a pass -----------------------------

test('with no results the suite is "not yet evaluated" and never fabricates a pass', () => {
  const { promoteEvalSuiteInState, appendEvalRun, evalSuiteStatus } = evalSandbox();
  const suite = promoteEvalSuiteInState({}, "s1", makeIr(), "art-1", "S", "t1");
  const status = evalSuiteStatus(suite);
  assert.equal(status.state, "not-evaluated");
  assert.equal(status.label, "Not yet evaluated");
  assert.equal(status.runs, 0);
  assert.equal(status.pass, undefined, "no pass count is fabricated before any run");
  appendEvalRun(suite, { actor: { name: "R" }, modelLabel: "m", caseResults: allResults(suite, "n-a"), ts: "t" });
  const after = evalSuiteStatus(suite);
  assert.equal(after.pass, 0, "an all-n-a run yields zero pass — never a fabricated pass");
});

// --- THE integrity proof: no live-model-call anywhere in the eval flow --------

test("no eval-flow function calls a live model (track, don't execute)", () => {
  const EVAL_FNS = [
    "defaultAntiGoalFor", "normalizeEvalResult", "buildEvalCasesFromIr", "buildEvalSuiteVersion",
    "promoteEvalSuiteInState", "appendEvalRun", "evalRegressionDiff", "evalSuiteStatus",
    "ensureEvalSuites", "promoteEvalSuite", "recordEvalRun", "renderEvalSuiteHtml"
  ];
  const MODEL_CALL = /\bfetch\s*\(|requestJson\s*\(|\/api\/|openai|anthropic|runLive|autoRun|executeEval/i;
  for (const fn of EVAL_FNS) {
    const body = extractFunction(source, fn);
    assert.ok(!MODEL_CALL.test(body), `${fn} must not call a live model or network endpoint`);
  }
});

// --- V3-4 primitive reused + unchanged ---------------------------------------

test("the deepFreeze generalization deep-freezes a nested target; flat V3-4 targets still verify", () => {
  const { recordAuditEvent, verifyAuditTrail } = evalSandbox();
  const trail = [];
  const e = recordAuditEvent(trail, {
    actor: { name: "R" }, action: "eval_run_recorded",
    target: { caseResults: [{ caseId: "case-1", result: "pass" }] }, contentHash: "h", ts: "t"
  });
  assert.ok(Object.isFrozen(e.target), "target frozen");
  assert.ok(Object.isFrozen(e.target.caseResults), "nested caseResults frozen");
  assert.ok(Object.isFrozen(e.target.caseResults[0]), "nested result object frozen");
  assert.throws(() => { e.target.caseResults[0].result = "fail"; }, TypeError);
  // A flat V3-4-shaped target still chains and verifies (behavior unchanged).
  const trail2 = [];
  recordAuditEvent(trail2, { actor: { name: "R", email: "" }, action: "reviewed", target: { stepId: "s1", snapshotId: "art-1", kind: "compiled" }, contentHash: "h", ts: "t" });
  assert.deepEqual(verifyAuditTrail(trail2), { ok: true, brokenAt: -1, reason: "" });
});

test("eval code contains no firm names or banned phrase", () => {
  const v310 = ["buildEvalCasesFromIr", "defaultAntiGoalFor", "appendEvalRun", "renderEvalSuiteHtml", "promoteEvalSuite"]
    .map((f) => extractFunction(source, f)).join("\n");
  assert.ok(!FIRM_NAMES.test(v310), "no firm names");
  assert.ok(!BANNED_PHRASE.test(v310), "no banned phrase");
  const { buildEvalCasesFromIr } = evalSandbox();
  assert.ok(!FIRM_NAMES.test(JSON.stringify(buildEvalCasesFromIr(makeIr()))), "built cases are neutral");
});
