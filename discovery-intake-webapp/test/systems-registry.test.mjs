// A2 — systems[] registry + reachability (two-level) + the finance archetype taxonomy.
//   A workflow carries systems[] (like actors[]); steps reference them by id. Reachability is the hard
//   constraint on solution shape: a screen-only system caps the realistic shape at human-in-loop and
//   adds a large integration line to TCO. The pooled (de-identified) tier keeps only class/traits —
//   never the vendor name.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

const reconScreen = {
  ...E.RECON_INTAKE,
  systems: [
    { id: "caseMgr", name: "CIB Case Manager", class: "recon-engine", reachability: "screen-only", dataSource: "exception queue" },
    { id: "erp", name: "Oracle GL", class: "ledger/GL", reachability: "batch", dataSource: "GL extract" },
  ],
  steps: E.RECON_INTAKE.steps.map((s, i) => (i === 1 ? { ...s, systems: ["caseMgr", "erp"] } : s)),
};

test("A2 — the controlled vocabularies and the finance archetype taxonomy exist", () => {
  assert.ok(E.SYSTEM_CLASSES.includes("ledger/GL") && E.SYSTEM_CLASSES.includes("recon-engine"));
  assert.deepEqual(E.REACHABILITY, ["api", "batch", "screen-only"]);
  for (const c of E.SYSTEM_CLASSES) {
    const a = E.SYSTEM_ARCHETYPES[c];
    assert.ok(a && a.typicalDataTier && a.controlProfile && a.integrationDifficulty, `archetype for ${c}`);
  }
});

test("A2 — steps resolve their system refs against the registry", () => {
  const sys = E.stepSystemRecords(reconScreen.steps[1], reconScreen);
  assert.equal(sys.length, 2);
  assert.ok(sys.some((s) => s.class === "recon-engine" && s.reachability === "screen-only"));
  assert.ok(sys.some((s) => s.class === "ledger/GL"));
});

test("A2 — a screen-only system caps the realistic solution shape at human-in-loop", () => {
  const cap = E.cappedSolutionShape({ solutionShape: "agentic", systems: ["caseMgr"] }, reconScreen);
  assert.equal(cap.realistic, "human-in-loop");
  assert.equal(cap.capped, true);
  assert.match(cap.reason, /screen-only|un-buildable|no API/);
  // a batch system imposes no cap
  const noCap = E.cappedSolutionShape({ solutionShape: "agentic", systems: ["erp"] }, reconScreen);
  assert.equal(noCap.capped, false);
  assert.equal(noCap.realistic, "agentic");
});

test("A2 — a screen-only system adds an integration line to TCO and raises one-time build", () => {
  const tScreen = E.buildTco(reconScreen);
  const tBase = E.buildTco(E.RECON_INTAKE);
  assert.ok(tScreen.tco.components.screenOnlyIntegration > 0, "screen-only integration line present");
  assert.ok(tScreen.tco.buildOneTime.point > tBase.tco.buildOneTime.point, "one-time build is higher");
  // additive: an un-systemed workflow has no screen-only line at all (byte-identical shape)
  assert.equal(tBase.tco.components.screenOnlyIntegration, undefined);
});

test("A2 — the pooled (de-identified) record keeps only class/traits, never the vendor name", () => {
  const pooled = E.deIdentify(reconScreen);
  const json = JSON.stringify(pooled);
  assert.ok(!json.includes("CIB Case Manager"), "no vendor name");
  assert.ok(!json.includes("Oracle GL"), "no vendor name");
  assert.ok(pooled.systems.every((s) => E.SYSTEM_CLASSES.includes(s.class) && E.REACHABILITY.includes(s.reachability) && !("name" in s)));
  assert.ok(pooled.steps[1].systemClasses.includes("recon-engine"), "pooled step references the system class");
});

test("A2 — enum integrity is surfaced at intake; a clean registry validates", () => {
  assert.equal(E.validateIntake({ ...E.RECON_INTAKE, systems: [{ id: "x", class: "made-up", reachability: "api" }] }).ok, false);
  assert.equal(E.validateIntake({ ...E.RECON_INTAKE, systems: [{ id: "x", class: "CRM", reachability: "telepathy" }] }).ok, false);
  const badRef = { ...E.RECON_INTAKE, systems: [{ id: "erp", class: "ledger/GL", reachability: "batch" }], steps: E.RECON_INTAKE.steps.map((s, i) => (i === 0 ? { ...s, systems: ["ghost"] } : s)) };
  assert.equal(E.validateIntake(badRef).ok, false);
  assert.equal(E.validateIntake(reconScreen).ok, true);
});

test("A2 — additive: absent a systems registry, intake + TCO are unchanged", () => {
  assert.equal(E.validateIntake(E.RECON_INTAKE).ok, true);
  assert.equal(E.validateIntake(E.FPA_INTAKE).ok, true);
  // no systems => no screen-only line, identical TCO components keys as before A2
  const keys = Object.keys(E.buildTco(E.FPA_INTAKE).tco.components).sort();
  assert.deepEqual(keys, ["build", "eval", "integration", "maintenance", "rework"]);
});
