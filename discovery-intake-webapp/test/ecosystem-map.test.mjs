// B2 — the ecosystem & convergence map, derived from the AGGREGATE: workflows linked by shared data
//   source / system class / entitlement profile; the high-degree (bottleneck) systems are the
//   integrate-once leverage. Honest at n=1 (directional, never asserted). Two audience projections:
//   Leadership = integrate-once economics; Tech & Governance = dependency / SPOF / risk concentration.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const RECON = engine.RECON_INTAKE;
const glSys = { id: "gl", name: "Oracle GL", class: "ledger/GL", reachability: "screen-only", dataSource: "GL feed" };
const wf = (anchor, dept) => ({ ...RECON, header: { ...RECON.header, anchor, dept }, systems: [glSys], steps: RECON.steps.map((s, i) => (i === 1 ? { ...s, systems: ["gl"] } : s)) });
const portfolio = [wf("recon-A", "CIB Operations"), wf("recon-B", "CIB Operations"), wf("recon-C", "Finance")];

test("B2 — a system shared by several workflows surfaces as a convergence/bottleneck with its count", () => {
  const eco = engine.buildEcosystemMap(portfolio);
  const gl = eco.bottlenecks.find((s) => s.systemClass === "ledger/GL");
  assert.ok(gl, "the GL feed is a bottleneck");
  assert.equal(gl.workflowCount, 3);
  assert.equal(gl.departmentCount, 2);
});

test("B2 — a single-n cell is labelled directional, never asserted as a bottleneck", () => {
  const eco = engine.buildEcosystemMap([wf("solo", "Finance")]);
  assert.equal(eco.directional, true);
  assert.equal(eco.systems[0].directional, true);
  assert.equal(eco.bottlenecks.length, 0, "n=1 is not a convergence");
});

test("B2 — Leadership projection: integrate-once economics (N workflows / M departments -> unlock N)", () => {
  const lead = engine.buildEcosystemLeadership(portfolio);
  assert.ok(lead.integrateOnce.length >= 1);
  assert.match(lead.integrateOnce[0].headline, /3 workflows across 2 departments/);
  assert.match(lead.integrateOnce[0].headline, /integrate once, unlock 3/);
});

test("B2 — Tech & Governance projection: dependency / SPOF / risk concentration", () => {
  const tg = engine.buildEcosystemTechGov(portfolio);
  assert.equal(tg.dependencies[0].singlePointOfFailure, true);
  assert.match(tg.dependencies[0].risk, /single point of failure|risk concentration/);
  assert.match(tg.dependencies[0].risk, /screen-only/, "a screen-only dependency raises integration/continuity risk");
});

test("B2 — honest at n=1: both projections are directional, never asserted", () => {
  assert.equal(engine.buildEcosystemLeadership([wf("solo", "Finance")]).directional, true);
  assert.equal(engine.buildEcosystemTechGov([wf("solo", "Finance")]).directional, true);
});

test("B2 — additive: a workflow with no systems registry yields an empty ecosystem map", () => {
  assert.equal(engine.buildEcosystemMap([RECON]).systems.length, 0);
});

test("B2 — the two surfaces render the map per audience", () => {
  const source = readAppSource();
  const sb = buildSandbox(source, {
    consts: ["DASH"],
    functions: ["studioEngine", "engineEcosystemLeadership", "engineEcosystemTechGov", "ecosystemLeadershipHtml", "ecosystemTechGovHtml", "escapeHtml"],
    globals: { window: { StudioEngine: engine } },
  });
  const lead = sb.ecosystemLeadershipHtml(portfolio, {});
  assert.match(lead, /integrate once, unlock 3/);
  const tg = sb.ecosystemTechGovHtml(portfolio, {});
  assert.match(tg, /single point of failure/);
  // empty when there's no convergence to render
  assert.equal(sb.ecosystemLeadershipHtml([RECON], {}), "");
});
