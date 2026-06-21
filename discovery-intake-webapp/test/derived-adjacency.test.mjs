// Edition 3 — F4: the derived leader layer. Three PURE functions over CONFIRMED multi-actor workflows
// (no new schema): buildRoleView (freed capacity per role/FTE + the assembly->judgment shift), buildCapabilityMap
// (recurring assembly grouped into capabilities, ranked by leverage, build-once reuse factor), buildAdjacency
// (clusters by shared role/capability/data/hand-off, tagged enabled | control-blocked with the reason).
// Confirmed-only; capacity/operating-model language; NEVER headcount. The app calls the engine (no fork).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const near = (a, b, t) => Math.abs(a - b) <= t;
const RECON = engine.RECON_INTAKE;

// A second confirmed multi-actor workflow that SHARES the Ops Analyst role + the route/post assembly
// capabilities with the recon SOP (so they are adjacent), at the same confidential tier.
const PAYMENTS = {
  ...RECON,
  header: { ...RECON.header, anchor: "Payment investigations (SOP-0117)", persona: "Ops Analyst" },
  steps: [
    { step: "Allocate payment case", cls: "assembly", data: "internal", time: 12, theo: 80, participants: [{ actorId: "teamLead", part: "doer" }] },
    { step: "Classify case type", cls: "assembly", data: "confidential", time: 20, theo: 70, output: "case type", participants: [{ actorId: "maker", part: "doer" }] },
    { step: "Investigate payment", cls: "judgment", data: "confidential", time: 22, theo: 35, participants: [{ actorId: "maker", part: "doer" }] },
    { step: "Approve payment fix", cls: "decision", data: "confidential", time: 12, theo: 10, participants: [{ actorId: "maker", part: "doer" }, { actorId: "checker", part: "approver" }], control: { type: "four-eyes", distinct: ["doer", "approver"], authorityRef: "authorityMatrix:writeOff" } },
    { step: "Post correction", cls: "assembly", data: "confidential", time: 14, theo: 75, participants: [{ actorId: "maker", part: "doer" }] },
  ],
};
const unconfirmed = { ...RECON, recap: { confirmed: false } };

function adapterSandbox() {
  return buildSandbox(source, {
    functions: ["studioEngine", "engineRoleView", "engineCapabilityMap", "engineAdjacency"],
    globals: {
      window: { StudioEngine: engine },
      gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [],
      recipeConnectionSeams: () => [], analysisWorkflowName: () => "",
    },
  });
}

// ---------- role view ----------
test("buildRoleView is confirmed-only and sums freed capacity per role across all the role's workflows", () => {
  const rv = engine.buildRoleView([RECON, PAYMENTS, unconfirmed]);
  assert.equal(rv.confirmedCount, 2);
  assert.equal(rv.skippedUnconfirmed, 1);
  const analyst = rv.roles.find((r) => r.role === "Ops Analyst");
  const reconOnly = engine.roleCapacityByActor(RECON).roles.find((r) => r.role === "Ops Analyst").freedHrs;
  const payOnly = engine.roleCapacityByActor(PAYMENTS).roles.find((r) => r.role === "Ops Analyst").freedHrs;
  assert.ok(near(analyst.freedHrs, reconOnly + payOnly, 0.01), "freed sums across both workflows");
  assert.equal(analyst.workflowCount, 2);
});

test("buildRoleView reports freedFTE + the assembly->judgment shift, and carries no headcount vocabulary", () => {
  const rv = engine.buildRoleView([RECON, PAYMENTS]);
  const analyst = rv.roles.find((r) => r.role === "Ops Analyst");
  assert.ok(analyst.freedFTE > 0 && near(analyst.freedFTE, analyst.freedHrs / engine.CONFIG.weeklyHours, 0.005), "freedFTE = freedHrs / weeklyHours (within independent 3-dp rounding)");
  assert.match(analyst.shift, /assembly .*→ judgment/);
  // the rail governs RENDERED prose, not data field names (freedFTE is a numeric field; F8 renders it as a role-week)
  const prose = [...rv.roles.map((r) => r.shift), rv.note].filter(Boolean).join(" | ");
  assert.ok(!/headcount|cut staff|lay ?off|eliminate role|reduce role/i.test(prose), "reshape language, never headcount");
  assert.ok(!/\bFTE\b/.test(prose), "rendered prose never says the literal 'FTE' (the field is numeric data)");
});

// ---------- capability map ----------
test("buildCapabilityMap groups a shared assembly capability across >=2 workflows, ranked by leverage, build-once", () => {
  const cm = engine.buildCapabilityMap([RECON, PAYMENTS]);
  const reused = cm.capabilities.filter((c) => c.reuseCount >= 2);
  assert.ok(reused.length >= 1, "at least one capability is shared across both workflows");
  assert.ok(reused.every((c) => c.buildOnce === true), "shared => buildOnce");
  // ranked by combined leverage, descending
  for (let i = 1; i < cm.capabilities.length; i++) assert.ok(cm.capabilities[i - 1].combinedLeverage >= cm.capabilities[i].combinedLeverage);
  // the 'route' (allocate) capability appears in both
  const route = cm.capabilities.find((c) => c.capability === "route");
  assert.ok(route && route.reuseCount === 2);
});

// ---------- adjacency ----------
test("a single workflow yields NO adjacency clusters (no false adjacency)", () => {
  const adj = engine.buildAdjacency([RECON]);
  assert.equal(adj.clusters.length, 0);
  assert.match(adj.note, /needs ≥2 confirmed/);
});

test("two workflows sharing role + capability cluster as ENABLED (build once, reuse)", () => {
  const adj = engine.buildAdjacency([RECON, PAYMENTS]);
  const cluster = adj.clusters.find((c) => c.status === "enabled");
  assert.ok(cluster, "an enabled cluster exists");
  assert.ok(cluster.sharedCapabilities.length > 0 || cluster.sharedRoles.length > 0);
  assert.match(cluster.reason, /build the capability once|less fragmented/);
});

test("a combine that crosses a data-tier boundary is CONTROL-BLOCKED with its reason", () => {
  const PAY_MNPI = { ...PAYMENTS, steps: PAYMENTS.steps.map((s) => ({ ...s, data: s.data === "confidential" ? "MNPI" : s.data })) };
  const adj = engine.buildAdjacency([RECON, PAY_MNPI]);
  const blocked = adj.clusters.find((c) => c.status === "control-blocked");
  assert.ok(blocked, "the combine is blocked");
  assert.match(blocked.reason, /data boundary|raise the ceiling/);
});

test("a combine that would break four-eyes/SoD is CONTROL-BLOCKED with its reason", () => {
  // a workflow where the Senior Analyst is a four-eyes DOER (in recon they are the approver) — merging
  // would let the same role be both maker and checker. They share the Ops Analyst role + 'route' capability.
  const SOD = { ...RECON, header: { ...RECON.header, anchor: "QA second review (SOP-9)" }, steps: [
    { step: "Allocate QA case", cls: "assembly", data: "internal", time: 20, theo: 80, participants: [{ actorId: "maker", part: "doer" }] },
    { step: "QA approve", cls: "decision", data: "confidential", time: 10, theo: 10, participants: [{ actorId: "checker", part: "doer" }, { actorId: "opsManager", part: "approver" }], control: { type: "four-eyes", distinct: ["doer", "approver"] } },
  ] };
  const blocked = engine.buildAdjacency([RECON, SOD]).clusters.find((c) => c.status === "control-blocked");
  assert.ok(blocked, "the combine is blocked");
  assert.match(blocked.reason, /four-eyes|separation of duties/);
});

test("thin-data adjacency returns a labeled placeholder, never a fabricated cluster", () => {
  assert.equal(engine.buildAdjacency([]).clusters.length, 0);
  assert.match(engine.buildAdjacency([RECON]).note, /thin at this breadth|needs ≥2/);
});

// ---------- adapter: the app delegates to the engine (no fork) ----------
test("engineRoleView / engineCapabilityMap / engineAdjacency delegate to the engine", () => {
  const sb = adapterSandbox();
  assert.deepEqual(sb.engineRoleView([RECON, PAYMENTS]).roles.map((r) => r.role).sort(), engine.buildRoleView([RECON, PAYMENTS]).roles.map((r) => r.role).sort());
  assert.equal(sb.engineCapabilityMap([RECON, PAYMENTS]).capabilities.length, engine.buildCapabilityMap([RECON, PAYMENTS]).capabilities.length);
  assert.deepEqual(sb.engineAdjacency([RECON, PAYMENTS]).clusters.map((c) => c.status), engine.buildAdjacency([RECON, PAYMENTS]).clusters.map((c) => c.status));
});
