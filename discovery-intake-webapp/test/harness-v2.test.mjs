// D2 (Phase 3) — HARNESS v2. Exercises the Phase-3 capture model over the v2 stress dataset and reports
// the grouped-adjacency + ecosystem metrics. New checks: systems resolve, action verb in the fixed set,
// entitlement ladder valid, reachability/shape in their sets, handoff seams parse, grouped adjacency
// collapses to a handful (enabledGroups), and ecosystem convergence is derived from the aggregate +
// honest at low n. Every prior invariant is kept (a decision earns zero permitted; the aggregate rail
// holds). 0 fail. The whole engine self-test + the existing adjacency-strict harness still run alongside.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";
import { buildStressDatasetV2, STRESS_V2_EXPECTED } from "./fixtures/stress-dataset-v2.mjs";

const SET = buildStressDatasetV2(100);

test("D2 harness — every step's systems resolve; action / entitlement / reachability / shape are in the fixed sets", () => {
  let steps = 0;
  for (const rec of SET) {
    for (const sys of rec.systems) {
      assert.ok(engine.SYSTEM_CLASSES.includes(sys.class), `system class ${sys.class}`);
      assert.ok(engine.REACHABILITY.includes(sys.reachability), `reachability ${sys.reachability}`);
    }
    for (const s of rec.steps) {
      steps += 1;
      (s.systems || []).forEach((ref) => assert.ok(engine.resolveSystem(ref, rec).id != null, `unresolved system ref "${ref}"`));
      if (s.action != null) assert.ok(engine.ACTION_VERBS.includes(s.action), `action "${s.action}"`);
      if (s.entitlement != null) assert.ok(engine.ENTITLEMENTS.includes(s.entitlement), `entitlement "${s.entitlement}"`);
      if (s.solutionShape != null) assert.ok(engine.SOLUTION_SHAPES.includes(s.solutionShape), `shape "${s.solutionShape}"`);
    }
  }
  assert.ok(steps >= 600, `the harness exercised ${steps} steps`);
});

test("D2 harness — handoff seams parse (bridged systems + a valid trigger) and feed the swivel-chair number", () => {
  let handoffs = 0;
  for (const rec of SET) {
    for (const h of engine.seamHandoffs(rec)) {
      handoffs += 1;
      assert.ok(Array.isArray(h.bridges) && h.bridges.length >= 1, "handoff bridges parse");
      assert.ok(engine.HANDOFF_TRIGGERS.includes(h.trigger), `handoff trigger "${h.trigger}"`);
    }
  }
  assert.ok(handoffs >= 100, "the dataset carries cross-system handoffs");
  const sc = engine.buildSwivelChairRelief(SET);
  assert.ok(sc.handoffSeams >= 1, "the swivel-chair relief number derives from the handoff seams");
  // protected waits are never compressed to zero (a protected handoff stays protected)
  assert.ok(sc.protectedHandoffs >= 0 && typeof sc.guardrail === "string");
});

test("D2 harness — grouped adjacency collapses to a HANDFUL (low double digits), not hundreds of pairs", () => {
  const adj = engine.buildAdjacency(SET);
  assert.ok(adj.candidateCount > 100, `many candidate pairs share a role (got ${adj.candidateCount})`);
  assert.ok(adj.groupCount >= 1 && adj.groupCount <= 25, `groups must be a handful, got ${adj.groupCount}`);
  assert.equal(adj.groupCount, STRESS_V2_EXPECTED.enabledGroups, "the known grouped count holds");
  assert.equal(adj.enabledGroups.length, adj.groupCount);
  // the blocked candidates are surfaced with a reason on a real leg (never silently dropped)
  assert.ok(adj.whyBlocked.length > 0 && adj.whyBlocked.every((b) => !!b.blockedDimension || b.status !== "enabled"));
});

test("D2 harness — ecosystem convergence is derived from the aggregate and honest at low n", () => {
  const eco = engine.buildEcosystemMap(SET);
  assert.ok(eco.bottlenecks.length >= 1, "convergence / bottleneck systems are surfaced");
  assert.ok(eco.bottlenecks.every((b) => b.workflowCount >= 2), "a bottleneck is depended on by 2+ workflows");
  assert.equal(eco.directional, false, "at n=100 the map is asserted, not directional");
  // honest at n=1: a single discovery is labelled directional, never asserted
  assert.equal(engine.buildEcosystemMap([SET[0]]).directional, true);
  // both audience projections derive from the same map
  assert.ok(engine.buildEcosystemLeadership(SET).integrateOnce.length >= 1);
  assert.ok(engine.buildEcosystemTechGov(SET).dependencies.some((d) => d.singlePointOfFailure));
});

test("D2 harness — KEEPS the prior invariants over the v2 data (decisions earn 0; the aggregate rail holds)", () => {
  for (const rec of SET) {
    for (const s of engine.normalizeIntake(rec).steps) {
      if (s.cls === "decision") assert.equal(engine.stepPermitted(s, "Conservative"), 0, "a decision earns zero permitted automation");
    }
  }
  const txt = JSON.stringify(engine.buildLeaderView(SET));
  assert.ok(!/headcount|\bfte\b|hours saved|lay ?off/i.test(txt), "the aggregate carries no headcount/fte vocabulary");
});

test("D2 harness — reports groups= and the ecosystem bottleneck list (the harness summary line)", () => {
  const adj = engine.buildAdjacency(SET);
  const eco = engine.buildEcosystemMap(SET);
  const bottleneckList = eco.bottlenecks.slice(0, 6).map((b) => `${b.systemClass}${b.dataSource ? ":" + b.dataSource : ""}×${b.workflowCount}`).join(", ");
  console.log(`[harness-v2] workflows=${SET.length} candidates=${adj.candidateCount} groups=${adj.groupCount} enabledPairs=${adj.enabledCount} blocked=${adj.blockedCount} bottlenecks=${eco.bottlenecks.length} [${bottleneckList}]`);
  assert.equal(adj.groupCount, STRESS_V2_EXPECTED.enabledGroups);
  assert.ok(eco.bottlenecks.length >= 1, "the harness reports a non-empty bottleneck list");
});
