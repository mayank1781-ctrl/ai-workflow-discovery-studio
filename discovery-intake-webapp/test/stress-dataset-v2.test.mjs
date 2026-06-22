// D1 (Phase 3) — STRESS DATASET v2. The 100-workflow stress set carries the Phase-3 capture model
// against the engine's REAL field names (no drift): a systems[] registry with class + reachability +
// dataSource, per-step system refs, an action verb, an entitlement, a solution shape, and a cross-system
// handoff seam. The dataset must load with ZERO field-name remaps, validate cleanly, and its coverage
// must span every action verb, entitlement level, reachability type, and solution shape. The
// adjacency-control property (a known set of genuinely-adjacent clusters) is preserved.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";
import { buildStressDatasetV2, STRESS_V2_EXPECTED, STRESS_V2_COVERAGE_TARGETS } from "./fixtures/stress-dataset-v2.mjs";

test("D1 — the v2 stress set is 100 confirmed workflows that validate with ZERO field-name remaps", () => {
  const set = buildStressDatasetV2(100);
  assert.equal(set.length, 100);
  for (const rec of set) {
    // zero field-name remaps: the record already uses canonical names, so reconcile is a no-op (same ref)
    assert.equal(engine.reconcileIntake(rec), rec, "no drift — reconcileIntake must be a no-op (canonical field names)");
    const v = engine.validateIntake(rec);
    assert.equal(v.ok, true, `record must validate: ${JSON.stringify(v.errors)}`);
    assert.equal(v.coverage.pct, 100, `record must have full coverage: gaps ${JSON.stringify(v.coverage.gaps)}`);
    assert.equal(engine.isConfirmed(rec), true, "the v2 records are confirmed (cloned from the confirmed seed)");
  }
});

test("D1 — the new fields use the engine's real field names + resolve to the controlled vocab", () => {
  const set = buildStressDatasetV2(100);
  for (const rec of set) {
    assert.ok(Array.isArray(rec.systems) && rec.systems.length >= 1, "a top-level systems[] registry");
    for (const sys of rec.systems) {
      assert.ok(engine.SYSTEM_CLASSES.includes(sys.class), `system class ${sys.class}`);
      assert.ok(engine.REACHABILITY.includes(sys.reachability), `reachability ${sys.reachability}`);
      assert.ok(typeof sys.dataSource === "string" && sys.dataSource.length > 0, "a data source");
    }
    for (const s of rec.steps) {
      if (s.action != null) assert.ok(engine.ACTION_VERBS.includes(s.action), `action ${s.action}`);
      if (s.entitlement != null) assert.ok(engine.ENTITLEMENTS.includes(s.entitlement), `entitlement ${s.entitlement}`);
      if (s.solutionShape != null) assert.ok(engine.SOLUTION_SHAPES.includes(s.solutionShape), `shape ${s.solutionShape}`);
      // every per-step system ref resolves to the registry
      (s.systems || []).forEach((ref) => assert.ok(engine.resolveSystem(ref, rec).id != null, `ref ${ref} resolves`));
    }
  }
});

test("D1 — coverage spans ALL action verbs, entitlement levels, reachability types, and solution shapes", () => {
  const set = buildStressDatasetV2(100);
  const actions = new Set(), ents = new Set(), reach = new Set(), shapes = new Set();
  for (const rec of set) {
    rec.systems.forEach((sys) => reach.add(sys.reachability));
    rec.steps.forEach((s) => {
      if (s.action) actions.add(s.action);
      if (s.entitlement) ents.add(s.entitlement);
      if (s.solutionShape) shapes.add(s.solutionShape);
    });
  }
  const covers = (got, want) => want.every((x) => got.has(x));
  assert.ok(covers(actions, STRESS_V2_COVERAGE_TARGETS.actions), `actions covered: have ${[...actions].sort().join(",")}`);
  assert.ok(covers(ents, STRESS_V2_COVERAGE_TARGETS.entitlements), `entitlements covered: have ${[...ents].sort().join(",")}`);
  assert.ok(covers(reach, STRESS_V2_COVERAGE_TARGETS.reachability), `reachability covered: have ${[...reach].sort().join(",")}`);
  assert.ok(covers(shapes, STRESS_V2_COVERAGE_TARGETS.solutionShapes), `shapes covered: have ${[...shapes].sort().join(",")}`);
});

test("D1 — the adjacency-control property holds: exactly 8 enabled twin-pairs -> 8 grouped clusters", () => {
  const adj = engine.buildAdjacency(buildStressDatasetV2(100));
  assert.equal(adj.enabledCount, STRESS_V2_EXPECTED.enabledPairs, "exactly the 8 compatible twin-pairs enable");
  assert.equal(adj.enabledGroups.length, STRESS_V2_EXPECTED.enabledGroups, "the enabled pairs group into a handful of clusters");
  assert.equal(adj.groupCount, STRESS_V2_EXPECTED.enabledGroups);
  // the rest are candidates blocked on a real reason (never silently dropped, never a false combine)
  assert.ok(adj.blockedCount > 0 && adj.enabledCount + adj.blockedCount === adj.candidateCount);
});
