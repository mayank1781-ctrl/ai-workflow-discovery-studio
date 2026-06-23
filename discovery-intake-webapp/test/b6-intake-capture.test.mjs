// P4 B-6 — Five-rung intake capture for the Discovery surface.
// Covers: engineStepClass recognising gather/build/human_held; three new pure inference
// functions (inferWorkActionsFromNote / inferWaitSegmentsFromNote / inferArtifactsFromNote);
// appStepToEngineStep passthrough of workActions/waitSegments/artifacts; drilldownClusters
// additions (work_composition + wait_artifacts); stepFieldMeta new optional keys.
// All changes are additive — existing behaviour is byte-identical when new fields are absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as E from "../studio_engine.mjs";

const source = readAppSource();

// ---- engineStepClass: five-rung recognition ----

function classSandbox() {
  return buildSandbox(source, {
    functions: ["engineStepClass"],
    globals: {
      stepTypeOf: () => null,
      gridCellValue: () => "",
    },
  });
}

test("P4 B6 — engineStepClass: gather and build are first-class rungs", () => {
  const sb = classSandbox();
  assert.equal(sb.engineStepClass({ cls: "gather" }), "gather");
  assert.equal(sb.engineStepClass({ cls: "build" }), "build");
});

test("P4 B6 — engineStepClass: human_held is a first-class rung", () => {
  const sb = classSandbox();
  assert.equal(sb.engineStepClass({ cls: "human_held" }), "human_held");
});

test("P4 B6 — engineStepClass: legacy assembly/judgment/decision unchanged", () => {
  const sb = classSandbox();
  assert.equal(sb.engineStepClass({ cls: "assembly" }), "assembly");
  assert.equal(sb.engineStepClass({ cls: "judgment" }), "judgment");
  assert.equal(sb.engineStepClass({ cls: "decision" }), "decision");
});

test("P4 B6 — engineStepClass: cue-fallback still returns assembly when no cls and no cues", () => {
  const sb = classSandbox();
  assert.equal(sb.engineStepClass({}), "assembly");
});

// ---- inferWorkActionsFromNote ----

function inferenceSandbox() {
  return buildSandbox(source, {
    functions: ["inferWorkActionsFromNote", "inferWaitSegmentsFromNote", "inferArtifactsFromNote"],
    globals: {},
  });
}

test("P4 B6 — inferWorkActionsFromNote: AI-online action detected from 'AI pulls data'", () => {
  const sb = inferenceSandbox();
  const acts = sb.inferWorkActionsFromNote("AI pulls the GL extract from the ERP online");
  assert.ok(Array.isArray(acts) && acts.length > 0, "at least one action inferred");
  const aiAct = acts.find((a) => a.owner === "ai");
  assert.ok(aiAct, "AI owner detected");
  assert.equal(aiAct.channel, "online");
  assert.ok(typeof aiAct.addressability === "number", "addressability is a number");
});

test("P4 B6 — inferWorkActionsFromNote: synchronous human activity detected from 'committee meeting'", () => {
  const sb = inferenceSandbox();
  const acts = sb.inferWorkActionsFromNote("The committee meets synchronously to review and approve");
  const human = acts.find((a) => a.channel === "synchronous_human");
  assert.ok(human, "synchronous_human channel detected");
  assert.equal(human.owner, "human");
});

test("P4 B6 — inferWorkActionsFromNote: offline human task detected", () => {
  const sb = inferenceSandbox();
  const acts = sb.inferWorkActionsFromNote("a manual check done offline against a paper record");
  const off = acts.find((a) => a.channel === "offline");
  assert.ok(off, "offline channel detected");
  assert.equal(off.owner, "human");
});

test("P4 B6 — inferWorkActionsFromNote: returns [] for empty note", () => {
  const sb = inferenceSandbox();
  assert.deepEqual(sb.inferWorkActionsFromNote(""), []);
});

test("P4 B6 — inferWorkActionsFromNote: returns [] when no recognized cues present", () => {
  const sb = inferenceSandbox();
  assert.deepEqual(sb.inferWorkActionsFromNote("the step is performed in a standard way"), []);
});

// ---- inferWaitSegmentsFromNote ----

test("P4 B6 — inferWaitSegmentsFromNote: deliberation recognized → kind=deliberation", () => {
  const sb = inferenceSandbox();
  const segs = sb.inferWaitSegmentsFromNote("waiting for person deliberation by the committee");
  assert.ok(segs.length > 0, "at least one segment");
  assert.equal(segs[0].kind, "deliberation");
  assert.ok(typeof segs[0].minutes === "number" && segs[0].minutes > 0);
});

test("P4 B6 — inferWaitSegmentsFromNote: coordination recognized → kind=coordination", () => {
  const sb = inferenceSandbox();
  const segs = sb.inferWaitSegmentsFromNote("coordination wait while scheduling the approval meeting");
  assert.ok(segs.length > 0);
  assert.equal(segs[0].kind, "coordination");
});

test("P4 B6 — inferWaitSegmentsFromNote: reducible context wait recognized", () => {
  const sb = inferenceSandbox();
  const segs = sb.inferWaitSegmentsFromNote("reducible wait while the data is assembled upstream");
  assert.ok(segs.length > 0);
  assert.equal(segs[0].kind, "reducible");
});

test("P4 B6 — inferWaitSegmentsFromNote: returns [] for empty or unmatched note", () => {
  const sb = inferenceSandbox();
  assert.deepEqual(sb.inferWaitSegmentsFromNote(""), []);
  assert.deepEqual(sb.inferWaitSegmentsFromNote("no wait involved"), []);
});

// ---- inferArtifactsFromNote ----

test("P4 B6 — inferArtifactsFromNote: recording and transcript detected", () => {
  const sb = inferenceSandbox();
  const arts = sb.inferArtifactsFromNote("a recording and transcript are produced from the meeting");
  assert.ok(arts.some((a) => a.type === "recording"), "recording present");
  assert.ok(arts.some((a) => a.type === "transcript"), "transcript present");
  assert.equal(arts.find((a) => a.type === "recording").direction, "produced");
});

test("P4 B6 — inferArtifactsFromNote: decision log detected", () => {
  const sb = inferenceSandbox();
  const arts = sb.inferArtifactsFromNote("a decision log is created and stored for the audit trail");
  assert.ok(arts.some((a) => a.type === "decision_log"), "decision_log present");
  assert.equal(arts.find((a) => a.type === "decision_log").direction, "produced");
});

test("P4 B6 — inferArtifactsFromNote: email thread detected", () => {
  const sb = inferenceSandbox();
  const arts = sb.inferArtifactsFromNote("the analyst reads the email thread for context");
  assert.ok(arts.some((a) => a.type === "email_thread"), "email_thread present");
  assert.equal(arts.find((a) => a.type === "email_thread").direction, "consumed");
});

test("P4 B6 — inferArtifactsFromNote: returns [] for empty or unrecognized note", () => {
  const sb = inferenceSandbox();
  assert.deepEqual(sb.inferArtifactsFromNote(""), []);
  assert.deepEqual(sb.inferArtifactsFromNote("nothing special"), []);
});

// ---- appStepToEngineStep: passthrough of B-6 arrays ----

function adapterSandbox() {
  return buildSandbox(source, {
    functions: ["engineStepClass", "engineDataTier", "appStepToEngineStep"],
    globals: {
      gridCellValue: () => "",
      stepTypeOf: () => null,
      inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && (s.step || s.name)) || "Step",
      stepPatternList: () => [],
      solutionShapeOf: () => null,
    },
  });
}

test("P4 B6 — appStepToEngineStep passes through workActions when present", () => {
  const sb = adapterSandbox();
  const step = {
    cls: "gather", name: "Pull data",
    workActions: [{ id: "ai-1", label: "AI pull", owner: "ai", channel: "online", addressability: 85 }],
  };
  const out = sb.appStepToEngineStep(step);
  assert.ok(Array.isArray(out.workActions) && out.workActions.length === 1, "workActions passed through");
  assert.equal(out.workActions[0].owner, "ai");
  assert.equal(out.workActions[0].channel, "online");
});

test("P4 B6 — appStepToEngineStep passes through waitSegments when present", () => {
  const sb = adapterSandbox();
  const step = {
    cls: "judgment", name: "Committee review",
    waitSegments: [{ kind: "deliberation", minutes: 240 }],
  };
  const out = sb.appStepToEngineStep(step);
  assert.ok(Array.isArray(out.waitSegments) && out.waitSegments.length === 1);
  assert.equal(out.waitSegments[0].kind, "deliberation");
  assert.equal(out.waitSegments[0].minutes, 240);
});

test("P4 B6 — appStepToEngineStep passes through artifacts when present", () => {
  const sb = adapterSandbox();
  const step = {
    cls: "build", name: "Document decision",
    artifacts: [{ type: "decision_log", direction: "produced" }],
  };
  const out = sb.appStepToEngineStep(step);
  assert.ok(Array.isArray(out.artifacts) && out.artifacts.length === 1);
  assert.equal(out.artifacts[0].type, "decision_log");
});

test("P4 B6 — appStepToEngineStep omits arrays when absent (byte-identical for existing steps)", () => {
  const sb = adapterSandbox();
  const step = { cls: "assembly", name: "Do something" };
  const out = sb.appStepToEngineStep(step);
  assert.ok(!("workActions" in out), "workActions absent when not on step");
  assert.ok(!("waitSegments" in out), "waitSegments absent when not on step");
  assert.ok(!("artifacts" in out), "artifacts absent when not on step");
});

test("P4 B6 — appStepToEngineStep omits empty arrays (no noise for steps without composition)", () => {
  const sb = adapterSandbox();
  const step = { cls: "build", name: "Draft", workActions: [], waitSegments: [], artifacts: [] };
  const out = sb.appStepToEngineStep(step);
  assert.ok(!("workActions" in out), "empty workActions omitted");
  assert.ok(!("waitSegments" in out), "empty waitSegments omitted");
  assert.ok(!("artifacts" in out), "empty artifacts omitted");
});

// ---- drilldownClusters: new optional clusters ----

function clusterSandbox() {
  const step = {
    name: "Test step", actor: "", tool: "", accessMode: "", input: "", dataHandling: "",
    dataSensitivity: "", output: "", handoff: "", trigger: "", time: "", decision: "",
    pain: "", exceptions: "", workCompositionNotes: "", waitBreakdownNotes: "", artifactNotes: "",
  };
  const state = { steps: [step] };
  const sb = buildSandbox(source, {
    functions: ["drilldownClusters"],
    globals: {
      state,
      stepLabel: (s) => (s && s.name) || "Step",
      isCapturedValue: (v) => Boolean(v && String(v).trim()),
      stepFieldValue: (s, key) => (s && s[key]) || "",
    },
  });
  return { sb, step };
}

test("P4 B6 — drilldownClusters: work_composition optional cluster present with correct keys", () => {
  const { sb, step } = clusterSandbox();
  const clusters = sb.drilldownClusters(step);
  const wc = clusters.find((c) => c.id === "work_composition");
  assert.ok(wc, "work_composition cluster must be present");
  assert.equal(wc.optional, true, "must be optional");
  assert.ok(Array.isArray(wc.keys) && wc.keys.includes("workCompositionNotes"), "keys includes workCompositionNotes");
  assert.ok(typeof wc.question === "string" && wc.question.length > 20, "has a question string");
});

test("P4 B6 — drilldownClusters: wait_artifacts optional cluster present with correct keys", () => {
  const { sb, step } = clusterSandbox();
  const clusters = sb.drilldownClusters(step);
  const wa = clusters.find((c) => c.id === "wait_artifacts");
  assert.ok(wa, "wait_artifacts cluster must be present");
  assert.equal(wa.optional, true, "must be optional");
  assert.ok(wa.keys.includes("waitBreakdownNotes"), "keys includes waitBreakdownNotes");
  assert.ok(wa.keys.includes("artifactNotes"), "keys includes artifactNotes");
});

test("P4 B6 — drilldownClusters: existing five clusters still present (no regressions)", () => {
  const { sb, step } = clusterSandbox();
  const clusters = sb.drilldownClusters(step);
  const ids = clusters.map((c) => c.id);
  for (const id of ["who_where", "inputs_data", "outputs_flow", "time_judgment", "friction_variants"]) {
    assert.ok(ids.includes(id), `existing cluster "${id}" must still be present`);
  }
});

test("P4 B6 — drilldownClusters: new clusters appear after the existing five", () => {
  const { sb, step } = clusterSandbox();
  const clusters = sb.drilldownClusters(step);
  const ids = clusters.map((c) => c.id);
  const ffIdx = ids.indexOf("friction_variants");
  const wcIdx = ids.indexOf("work_composition");
  const waIdx = ids.indexOf("wait_artifacts");
  assert.ok(ffIdx >= 0 && wcIdx > ffIdx, "work_composition comes after friction_variants");
  assert.ok(waIdx > wcIdx, "wait_artifacts comes after work_composition");
});

// ---- stepFieldMeta: new optional keys ----

function metaSandbox() {
  return buildSandbox(source, {
    functions: ["stepFieldMeta"],
    globals: {},
  });
}

test("P4 B6 — stepFieldMeta: workCompositionNotes present and optional", () => {
  const sb = metaSandbox();
  const entry = sb.stepFieldMeta().find((m) => m.key === "workCompositionNotes");
  assert.ok(entry, "workCompositionNotes must be in stepFieldMeta");
  assert.equal(entry.required, false, "must be optional");
});

test("P4 B6 — stepFieldMeta: waitBreakdownNotes present and optional", () => {
  const sb = metaSandbox();
  const entry = sb.stepFieldMeta().find((m) => m.key === "waitBreakdownNotes");
  assert.ok(entry, "waitBreakdownNotes must be in stepFieldMeta");
  assert.equal(entry.required, false);
});

test("P4 B6 — stepFieldMeta: artifactNotes present and optional", () => {
  const sb = metaSandbox();
  const entry = sb.stepFieldMeta().find((m) => m.key === "artifactNotes");
  assert.ok(entry, "artifactNotes must be in stepFieldMeta");
  assert.equal(entry.required, false);
});

test("P4 B6 — stepFieldMeta: existing required keys unchanged", () => {
  const sb = metaSandbox();
  const meta = sb.stepFieldMeta();
  for (const key of ["action", "actor", "tool", "accessMode", "input", "output", "handoff", "trigger", "time", "decision", "dataSensitivity"]) {
    const entry = meta.find((m) => m.key === key);
    assert.ok(entry, `existing key "${key}" must still be present`);
    assert.equal(entry.required, true, `${key} must remain required`);
  }
});

// ---- additive guard: engine still validates arrays from B-6 ----

test("P4 B6 — engine still validates workActions/waitSegments/artifacts from B-6 intake notes", () => {
  const intake = {
    ...E.FPA_INTAKE,
    steps: [{
      ...E.FPA_INTAKE.steps[0],
      workActions: [{ id: "pull-ai", label: "AI pull", owner: "ai", channel: "online", addressability: 80 }],
      waitSegments: [{ kind: "coordination", minutes: 60 }],
      artifacts: [{ type: "transcript", direction: "produced" }],
    }],
  };
  const r = E.validateIntake(intake);
  assert.equal(r.ok, true, `B-6 arrays should pass validateIntake: ${r.errors}`);
});
