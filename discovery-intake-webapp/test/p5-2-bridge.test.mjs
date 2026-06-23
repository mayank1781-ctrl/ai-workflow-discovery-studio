// P5-2 — Real Confirmed Engine Data Bridge.
// Tests prove:
//   • bridge functions read from real captured session state (no synthetic injection)
//   • fully populated state → all 15 required fields present → bridgeMissingFields empty
//   • missing fields fail closed with a clear labelled report
//   • partial / thin sessions still fail closed
//   • engine isConfirmed gate is unchanged (same 15 checks)
//   • recap.confirmed=false surfaces as a missing field
//   • P5-1 / Phase 6 items remain untouched

import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

// ── Mock steps ─────────────────────────────────────────────────────────────────

// Gather step (not human-led — must not contribute to judgment block).
const GATHER_STEP = {
  id: "s1", cls: "gather", step: "Collect financial statements",
  _cells: {
    name: "Collect financial statements",
    dataSensitivity: "confidential",
    humanCheckpoint: "",
    rulesDecisionLogic: "",
    exceptionBranching: "Escalate if statements incomplete"
  }
};

// Judgment step (human-led — must drive hard/cues/human in judgment block).
const JUDGMENT_STEP = {
  id: "s2", cls: "judgment", step: "Assess credit risk",
  _cells: {
    name: "Assess credit risk",
    dataSensitivity: "confidential",
    humanCheckpoint: "Senior analyst reviews before proceeding",
    rulesDecisionLogic: "DSCR >= 1.25x; leverage <= 4x",
    exceptionBranching: "Escalate to committee if borderline"
  }
};

// ── Mock states ────────────────────────────────────────────────────────────────

const FULL_STATE = {
  sessionMeta: {
    userRole: "Credit Risk Analyst",
    departmentTag: { value: "Credit Risk", source: "user-stated", confidence: 1 },
    name: "Credit underwriting workflow"
  },
  fields: {
    intervieweeRole: "Credit Risk Analyst",
    triggerSource: "New deal arrives for underwriting",
    triggerFrequency: "weekly",
    runsPerPeriod: "20/wk",
    humanJudgmentArea: "Assess whether the deal meets credit policy",
    acceptanceCriteria: "Memo approved; deal within policy bounds",
    dataSensitivity: ""
  }
};

const PARTIAL_STATE = {
  sessionMeta: {
    userRole: "Operations Analyst",
    departmentTag: { value: "Operations" },
    name: "Ops workflow"
  },
  fields: {
    intervieweeRole: "Operations Analyst",
    triggerSource: "Weekly batch",
    triggerFrequency: "weekly",
    runsPerPeriod: "",
    humanJudgmentArea: "",
    acceptanceCriteria: "",
    dataSensitivity: ""
  }
};

const EMPTY_STATE = {
  sessionMeta: { userRole: "", departmentTag: null, name: "" },
  fields: {
    intervieweeRole: "", triggerSource: "", triggerFrequency: "", runsPerPeriod: "",
    humanJudgmentArea: "", acceptanceCriteria: "", dataSensitivity: ""
  }
};

// ── Sandbox factory ────────────────────────────────────────────────────────────

function makeSandbox(stateOverride, steps) {
  const allSteps = steps || [];
  return buildSandbox(source, {
    consts: ["BRIDGE_REQUIRED_META", "BRIDGE_REQUIRED_CHECKS"],
    functions: [
      "buildBridgeHeader", "buildBridgeTrigger",
      "buildBridgeJudgmentBlock", "buildBridgeConfirmBlock",
      "bridgeMissingFields"
    ],
    globals: {
      state: stateOverride,
      analysisWorkflowName: () => (stateOverride.sessionMeta && stateOverride.sessionMeta.name) || "",
      analysisGridSteps: () => allSteps,
      engineStepClass: (s) => (s && s.cls) || "assembly",
      engineDataTier: (s) => (s && s._cells && s._cells.dataSensitivity) || undefined,
      gridCellValue: (s, k) => (s && s._cells && s._cells[k]) || "",
      stepDisplayName: (s) => (s && s._cells && s._cells.name) || (s && s.step) || "Step",
      console: { warn() {}, error() {} }
    }
  });
}

// ── buildBridgeHeader ─────────────────────────────────────────────────────────

test("P5-2: buildBridgeHeader reads persona from sessionMeta.userRole", () => {
  const { buildBridgeHeader } = makeSandbox(FULL_STATE);
  const h = buildBridgeHeader();
  assert.equal(h.persona, "Credit Risk Analyst");
});

test("P5-2: buildBridgeHeader falls back to fields.intervieweeRole when userRole absent", () => {
  const st = { ...FULL_STATE, sessionMeta: { ...FULL_STATE.sessionMeta, userRole: "" } };
  const { buildBridgeHeader } = makeSandbox(st);
  const h = buildBridgeHeader();
  assert.equal(h.persona, "Credit Risk Analyst"); // from fields.intervieweeRole
});

test("P5-2: buildBridgeHeader reads dept from sessionMeta.departmentTag.value", () => {
  const { buildBridgeHeader } = makeSandbox(FULL_STATE);
  const h = buildBridgeHeader();
  assert.equal(h.dept, "Credit Risk");
});

test("P5-2: buildBridgeHeader reads anchor from analysisWorkflowName (sessionMeta.name)", () => {
  const { buildBridgeHeader } = makeSandbox(FULL_STATE);
  const h = buildBridgeHeader();
  assert.equal(h.anchor, "Credit underwriting workflow");
});

test("P5-2: buildBridgeHeader returns empty strings for an empty state (no faking)", () => {
  const { buildBridgeHeader } = makeSandbox(EMPTY_STATE);
  const h = buildBridgeHeader();
  assert.equal(h.persona, "");
  assert.equal(h.dept, "");
  assert.equal(h.anchor, "");
});

// ── buildBridgeTrigger ────────────────────────────────────────────────────────

test("P5-2: buildBridgeTrigger reads trigger / cadence / volume from state.fields", () => {
  const { buildBridgeTrigger } = makeSandbox(FULL_STATE);
  const t = buildBridgeTrigger();
  assert.equal(t.trigger, "New deal arrives for underwriting");
  assert.equal(t.cadence, "weekly");
  assert.equal(t.volume, "20/wk");
});

test("P5-2: buildBridgeTrigger returns empty strings for an empty state (no faking)", () => {
  const { buildBridgeTrigger } = makeSandbox(EMPTY_STATE);
  const t = buildBridgeTrigger();
  assert.equal(t.trigger, "");
  assert.equal(t.cadence, "");
  assert.equal(t.volume, "");
});

// ── buildBridgeJudgmentBlock ──────────────────────────────────────────────────

test("P5-2: buildBridgeJudgmentBlock.needs reads from state.fields.humanJudgmentArea (primary)", () => {
  const { buildBridgeJudgmentBlock } = makeSandbox(FULL_STATE, [GATHER_STEP, JUDGMENT_STEP]);
  const j = buildBridgeJudgmentBlock();
  assert.equal(j.needs, "Assess whether the deal meets credit policy");
});

test("P5-2: buildBridgeJudgmentBlock.needs falls back to humanCheckpoint on judgment steps when field empty", () => {
  const st = { ...FULL_STATE, fields: { ...FULL_STATE.fields, humanJudgmentArea: "" } };
  const { buildBridgeJudgmentBlock } = makeSandbox(st, [GATHER_STEP, JUDGMENT_STEP]);
  const j = buildBridgeJudgmentBlock();
  assert.ok(j.needs.includes("Senior analyst reviews"), `needs was: "${j.needs}"`);
});

test("P5-2: buildBridgeJudgmentBlock.hard reads rulesDecisionLogic from human-led steps only", () => {
  const { buildBridgeJudgmentBlock } = makeSandbox(FULL_STATE, [GATHER_STEP, JUDGMENT_STEP]);
  const j = buildBridgeJudgmentBlock();
  assert.ok(j.hard.includes("DSCR >= 1.25x"), `hard was: "${j.hard}"`);
});

test("P5-2: buildBridgeJudgmentBlock.cues reads exceptionBranching from human-led steps only", () => {
  const { buildBridgeJudgmentBlock } = makeSandbox(FULL_STATE, [GATHER_STEP, JUDGMENT_STEP]);
  const j = buildBridgeJudgmentBlock();
  assert.ok(j.cues.includes("Escalate to committee if borderline"), `cues was: "${j.cues}"`);
});

test("P5-2: buildBridgeJudgmentBlock.human names only the human-led steps", () => {
  const { buildBridgeJudgmentBlock } = makeSandbox(FULL_STATE, [GATHER_STEP, JUDGMENT_STEP]);
  const j = buildBridgeJudgmentBlock();
  // judgment step must appear
  assert.ok(j.human.includes("Assess credit risk"), `human was: "${j.human}"`);
  // gather step must NOT appear
  assert.ok(!j.human.includes("Collect financial statements"), `gather leaked into human: "${j.human}"`);
});

test("P5-2: buildBridgeJudgmentBlock returns empty strings for empty state / no steps (no faking)", () => {
  const { buildBridgeJudgmentBlock } = makeSandbox(EMPTY_STATE, []);
  const j = buildBridgeJudgmentBlock();
  assert.equal(j.needs, "");
  assert.equal(j.hard, "");
  assert.equal(j.cues, "");
  assert.equal(j.human, "");
});

// ── buildBridgeConfirmBlock ───────────────────────────────────────────────────

test("P5-2: buildBridgeConfirmBlock.acceptance reads from state.fields.acceptanceCriteria (primary)", () => {
  const { buildBridgeConfirmBlock } = makeSandbox(FULL_STATE, [GATHER_STEP, JUDGMENT_STEP]);
  const c = buildBridgeConfirmBlock();
  assert.equal(c.acceptance, "Memo approved; deal within policy bounds");
});

test("P5-2: buildBridgeConfirmBlock.dataTier is highest sensitivity across all steps", () => {
  const LOW = { ...GATHER_STEP, _cells: { ...GATHER_STEP._cells, dataSensitivity: "internal" } };
  const HIGH = { ...JUDGMENT_STEP, _cells: { ...JUDGMENT_STEP._cells, dataSensitivity: "confidential" } };
  const { buildBridgeConfirmBlock } = makeSandbox(FULL_STATE, [LOW, HIGH]);
  const c = buildBridgeConfirmBlock();
  assert.equal(c.dataTier, "confidential");
});

test("P5-2: buildBridgeConfirmBlock.escalation derived from exceptionBranching across all steps", () => {
  const { buildBridgeConfirmBlock } = makeSandbox(FULL_STATE, [GATHER_STEP, JUDGMENT_STEP]);
  const c = buildBridgeConfirmBlock();
  // both steps have exceptionBranching; both must appear
  assert.ok(c.escalation.includes("Escalate if statements incomplete"), `escalation: "${c.escalation}"`);
  assert.ok(c.escalation.includes("Escalate to committee if borderline"), `escalation: "${c.escalation}"`);
});

// ── bridgeMissingFields ───────────────────────────────────────────────────────

test("P5-2: bridgeMissingFields returns [] for a fully populated record (15/15 present)", () => {
  const { bridgeMissingFields } = makeSandbox(FULL_STATE);
  const FULL_RECORD = {
    header:   { persona: "Analyst", dept: "Operations", anchor: "My workflow", lifecycle: "session" },
    trigger:  { trigger: "Weekly batch", cadence: "weekly", volume: "20/wk" },
    steps:    [{ step: "Do work", cls: "judgment", data: "confidential" }],
    seams:    [{ from: "A", to: "B", friction: "low", latency: "low", crit: "high" }],
    judgment: { needs: "Expert judgment", hard: "Policy threshold", cues: "Flag if borderline", human: "Do work" },
    confirm:  { acceptance: "Done when approved", escalation: "Escalate to manager", dataTier: "confidential" },
    recap:    { confirmed: true }
  };
  const missing = bridgeMissingFields(FULL_RECORD);
  assert.equal(missing.length, 0, `unexpected missing: ${JSON.stringify(missing.map(f => f.field))}`);
});

test("P5-2: bridgeMissingFields returns all 15 missing for null record (fails closed)", () => {
  const { bridgeMissingFields } = makeSandbox(FULL_STATE);
  const missing = bridgeMissingFields(null);
  assert.equal(missing.length, 15);
});

test("P5-2: bridgeMissingFields surfaces only the absent fields for a partially-populated record", () => {
  const { bridgeMissingFields } = makeSandbox(FULL_STATE);
  const PARTIAL = {
    header:   { persona: "Analyst", dept: "Ops", anchor: "Workflow" },
    trigger:  { trigger: "Daily", cadence: "daily" },
    steps:    [], seams: [], judgment: {}, confirm: {}, recap: {}
  };
  const missing = bridgeMissingFields(PARTIAL);
  const fields = missing.map((f) => f.field);
  // trigger.volume not required (only trigger and cadence are) — check the confirmed-absent ones
  assert.ok(fields.includes("steps[class+data]"), "steps[class+data] missing");
  assert.ok(fields.includes("seams[3-dim]"), "seams[3-dim] missing");
  assert.ok(fields.includes("judgment.needs"), "judgment.needs missing");
  assert.ok(fields.includes("recap.confirmed"), "recap.confirmed missing");
  // present fields must NOT be missing
  assert.ok(!fields.includes("header.persona"), "header.persona should be present");
  assert.ok(!fields.includes("trigger.trigger"), "trigger.trigger should be present");
});

test("P5-2: bridgeMissingFields surfaces recap.confirmed when recap.confirmed is false", () => {
  const { bridgeMissingFields } = makeSandbox(FULL_STATE);
  const NOT_CONFIRMED = {
    header:   { persona: "Analyst", dept: "Ops", anchor: "Workflow" },
    trigger:  { trigger: "Daily", cadence: "daily" },
    steps:    [{ step: "Do work", cls: "judgment", data: "confidential" }],
    seams:    [{ from: "A", to: "B", friction: "low", latency: "low", crit: "high" }],
    judgment: { needs: "Judgment", hard: "Hard call", cues: "Cue", human: "Analyst" },
    confirm:  { acceptance: "Done", escalation: "Escalate", dataTier: "confidential" },
    recap:    { confirmed: false }   // ← not confirmed yet
  };
  const missing = bridgeMissingFields(NOT_CONFIRMED);
  const fields = missing.map((f) => f.field);
  assert.equal(missing.length, 1, `only recap.confirmed should be missing; got: ${JSON.stringify(fields)}`);
  assert.equal(fields[0], "recap.confirmed");
  assert.ok(missing[0].hint.includes("Workbench"), "hint references Workbench");
});

// ── Engine gate unchanged ─────────────────────────────────────────────────────

test("P5-2: engine.REQUIRED still covers 15 checks (gate unchanged)", () => {
  assert.equal(engine.REQUIRED.length, 15, "engine REQUIRED has 15 checks");
});

test("P5-2: engine.isConfirmed returns true for a fully bridge-spec record (no synthetic injection)", () => {
  // This record has all 15 required fields populated exactly as the bridge would derive them
  // from a fully captured and Workbench-confirmed session. No FPA_INTAKE fixture involved.
  const BRIDGE_FULL = {
    header:   { persona: "Credit Risk Analyst", dept: "Credit Risk", anchor: "Credit underwriting workflow", lifecycle: "session" },
    trigger:  { trigger: "New deal arrives for underwriting", cadence: "weekly", volume: "20/wk" },
    steps:    [
      { step: "Collect financial statements", cls: "gather",   data: "confidential" },
      { step: "Assess credit risk",           cls: "judgment", data: "confidential" }
    ],
    actors: [], sharedRules: [], routes: [],
    seams: [{ from: "Collect financial statements", to: "Assess credit risk", type: "approval", friction: "low", latency: "low", crit: "high", note: "" }],
    judgment: {
      needs: "Assess whether the deal meets credit policy",
      hard:  "DSCR >= 1.25x; leverage <= 4x",
      cues:  "Escalate to committee if borderline",
      human: "Assess credit risk"
    },
    confirm: {
      acceptance: "Memo approved; deal within policy bounds",
      escalation: "Escalate to committee if borderline",
      dataTier:   "confidential"
    },
    recap: { confirmed: true }
  };
  assert.equal(engine.isConfirmed(BRIDGE_FULL), true, "fully bridge-derived record must be engine-confirmed");
});

test("P5-2: engine.isConfirmed still returns false for an empty record (gate unchanged)", () => {
  assert.equal(engine.isConfirmed({}), false, "empty record must not be confirmed");
});

test("P5-2: engine.isConfirmed returns false when recap.confirmed is false (gate unchanged)", () => {
  const rec = {
    header: { persona: "A", dept: "B", anchor: "C" }, trigger: { trigger: "T", cadence: "daily" },
    steps: [{ step: "S", cls: "gather", data: "internal" }],
    seams: [{ friction: "low", latency: "low", crit: "low" }],
    judgment: { needs: "J", hard: "H", cues: "C", human: "S" },
    confirm: { acceptance: "A", escalation: "E", dataTier: "internal" },
    recap: { confirmed: false }
  };
  assert.equal(engine.isConfirmed(rec), false, "recap.confirmed=false must fail the gate");
});

// ── Separation (source-level) ─────────────────────────────────────────────────

test("P5-2: appWorkflowToIntake calls buildBridgeHeader / buildBridgeTrigger / buildBridgeJudgmentBlock / buildBridgeConfirmBlock", () => {
  const src = extractFunction(source, "appWorkflowToIntake");
  assert.ok(src.includes("buildBridgeHeader"), "appWorkflowToIntake calls buildBridgeHeader");
  assert.ok(src.includes("buildBridgeTrigger"), "appWorkflowToIntake calls buildBridgeTrigger");
  assert.ok(src.includes("buildBridgeJudgmentBlock"), "appWorkflowToIntake calls buildBridgeJudgmentBlock");
  assert.ok(src.includes("buildBridgeConfirmBlock"), "appWorkflowToIntake calls buildBridgeConfirmBlock");
});

test("P5-2: bridge functions do not call patchField, fetch, or scoring endpoints", () => {
  const fns = ["buildBridgeHeader", "buildBridgeTrigger", "buildBridgeJudgmentBlock", "buildBridgeConfirmBlock", "bridgeMissingFields"];
  for (const fn of fns) {
    const src = extractFunction(source, fn);
    assert.ok(!src.includes("patchField"), `${fn}: no patchField`);
    assert.ok(!src.includes("fetch("), `${fn}: no fetch`);
    assert.ok(!src.includes("/api/"), `${fn}: no invented endpoint`);
  }
});

test("P5-2: bridge functions do not touch opportunity score, recipe generation, or scorers", () => {
  const fns = ["buildBridgeJudgmentBlock", "buildBridgeConfirmBlock", "bridgeMissingFields"];
  for (const fn of fns) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("opportunityscore"), `${fn}: no opportunityScore`);
    assert.ok(!src.includes("recipegatecheck"), `${fn}: no recipeGateCheck`);
    assert.ok(!src.includes("getstepopportunitymeta"), `${fn}: no getStepOpportunityMeta`);
  }
});

// ── Phase 6 guard ─────────────────────────────────────────────────────────────

test("P5-2: bridge functions contain no Phase 6 items (workIntent / stepFunction / unitEconomics)", () => {
  const fns = ["buildBridgeHeader", "buildBridgeTrigger", "buildBridgeJudgmentBlock", "buildBridgeConfirmBlock", "bridgeMissingFields"];
  for (const fn of fns) {
    const src = extractFunction(source, fn).toLowerCase();
    assert.ok(!src.includes("workintent"),    `${fn}: no workIntent (Phase 6)`);
    assert.ok(!src.includes("stepfunction"),  `${fn}: no stepFunction (Phase 6)`);
    assert.ok(!src.includes("uniteconomics"), `${fn}: no unitEconomics (Phase 6)`);
    assert.ok(!src.includes("policyupload"),  `${fn}: no policyUpload (Phase 6)`);
  }
});

// ── Thin session still fails closed ──────────────────────────────────────────

test("P5-2: a thin session (no steps, no fields) reports all bridge fields as missing", () => {
  const { bridgeMissingFields } = makeSandbox(EMPTY_STATE, []);
  // Record produced by a thin session — all bridge fields empty, recap not confirmed
  const THIN = {
    header: { persona: "", dept: "", anchor: "" },
    trigger: { trigger: "", cadence: "" },
    steps: [], seams: [], judgment: {}, confirm: {}, recap: {}
  };
  const missing = bridgeMissingFields(THIN);
  assert.equal(missing.length, 15, `thin session must have all 15 missing; got ${missing.length}`);
  // Every missing entry has a label and a hint
  for (const f of missing) {
    assert.ok(f.label, `${f.field} missing label`);
    assert.ok(f.hint, `${f.field} missing hint`);
  }
});
