// D1 (Phase 3) — STRESS DATASET v2. The 100-workflow stress set, extended with the Phase-3 capture
// model against the engine's REAL field names: a top-level systems[] registry (class · reachability ·
// dataSource), per-step `systems` refs, an `action` verb, an `entitlement`, a `solutionShape`, and a
// cross-system handoff seam. Built by cloning the canonical RECON_INTAKE (a known-valid, confirmed
// record) and layering the new fields, so every record validates and hardens exactly as the seed does.
//
// The adjacency-control property is PRESERVED so the grouped count stays inspectable: indices 0..15 are
// 8 "twin" pairs that share a (unique-per-pair) cadence AND are identical on every adjacency leg
// (role · data · controls · tooling · shape · system class · entitlement) — so each pair ENABLES and
// nothing else does. Indices 16..99 each carry a unique cadence, so they are candidates (shared role)
// but blocked on cadence — never a false combine. Result: exactly 8 enabled pairs -> 8 grouped clusters.
//
// Coverage: across the 100, the new fields span ALL of the controlled sets — every action verb, every
// entitlement level, every reachability type, and every solution shape — so the harness (D2) can
// exercise the whole model. NOT used by the canonical seed or any existing test: the seed's numeric
// outputs are untouched (additive).
import { RECON_INTAKE, ACTION_VERBS, ENTITLEMENTS, REACHABILITY, SOLUTION_SHAPES, SYSTEM_CLASSES, HANDOFF_TRIGGERS } from "../../studio_engine.mjs";

// the assembly verbs (approve is reserved for the human-held decision steps); all 6 + approve = the 7.
const ASSEMBLY_ACTIONS = ["read", "download", "transform", "write-in-place", "generate-output", "notify"];
// assembly solution shapes; human-in-loop comes from the judgment steps, so all 5 shapes appear.
const ASSEMBLY_SHAPES = ["prompt", "rag", "deterministic-tool", "agentic"];

function entitlementForAction(action) {
  return (action === "write-in-place" || action === "generate-output") ? "write" : "read";
}

// build one v2 record at "variant" v (the variant drives the new-field values; twins share a variant
// so they stay identical on every adjacency leg), with the given anchor + cadence.
function v2Record(v, anchor, cadence) {
  const base = structuredClone(RECON_INTAKE);
  const nClass = SYSTEM_CLASSES.length, nReach = REACHABILITY.length;
  base.header = { ...base.header, anchor };
  base.trigger = { ...base.trigger, cadence };
  base.systems = [
    { id: "sysA", name: `System A (v${v})`, class: SYSTEM_CLASSES[v % nClass], reachability: REACHABILITY[v % nReach], dataSource: `feed-${v % nClass}` },
    { id: "sysB", name: `System B (v${v})`, class: SYSTEM_CLASSES[(v + 4) % nClass], reachability: REACHABILITY[(v + 1) % nReach], dataSource: `feed-${(v + 4) % nClass}` },
  ];
  base.steps = base.steps.map((s, j) => {
    const step = { ...s };
    if (s.cls === "decision") {
      // a decision is the human-held commit: approve entitlement, no AI solution shape.
      step.action = "approve";
      step.entitlement = "approve";
      step.systems = ["sysA"];
    } else {
      const action = ASSEMBLY_ACTIONS[(v + j) % ASSEMBLY_ACTIONS.length];
      step.action = action;
      step.entitlement = entitlementForAction(action);
      step.systems = s.cls === "judgment" ? ["sysA", "sysB"] : ["sysA"];
      step.solutionShape = s.cls === "judgment" ? "human-in-loop" : ASSEMBLY_SHAPES[v % ASSEMBLY_SHAPES.length];
    }
    return step;
  });
  // A5 — a cross-system handoff on the first seam (covers all handoff triggers across the set).
  base.seams = base.seams.map((sm, k) => k === 0
    ? { ...sm, handoff: { systems: ["sysA", "sysB"], trigger: HANDOFF_TRIGGERS[v % HANDOFF_TRIGGERS.length] } }
    : sm);
  return base;
}

// the 100-workflow v2 stress set. Twins (indices 0..15) share a variant + a unique-per-pair cadence
// (so each of the 8 pairs enables); the rest carry a unique cadence (candidates, blocked on cadence).
export function buildStressDatasetV2(n = 100) {
  return Array.from({ length: n }, (_, i) => {
    const isTwin = i < 16;
    const variant = isTwin ? Math.floor(i / 2) : i; // twins (2k, 2k+1) -> same variant -> identical legs
    const cadence = isTwin ? `cad-${Math.floor(i / 2)}` : `cad-${1000 + i}`;
    return v2Record(variant, `STRESS-V2-${i}`, cadence);
  });
}

// the known adjacency-control facts, so the grouped count stays inspectable in the harness.
export const STRESS_V2_EXPECTED = { count: 100, enabledPairs: 8, enabledGroups: 8 };

// the controlled sets the dataset is built to cover (for the coverage assertions).
export const STRESS_V2_COVERAGE_TARGETS = {
  actions: ACTION_VERBS,
  entitlements: ENTITLEMENTS,
  reachability: REACHABILITY,
  solutionShapes: SOLUTION_SHAPES,
};
