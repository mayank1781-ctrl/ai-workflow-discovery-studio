// B1 — GROUPED adjacency clusters for the leader view. buildAdjacency emits enabledGroups = connected
//   components over the enabled pairs (a handful of clusters, not hundreds of pairs). Shared system
//   class + shared entitlement profile are now compatibility legs: two workflows combine only if also
//   compatible there, with why-blocked reasons. Nothing is dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

const RECON = E.RECON_INTAKE;
const FPA = E.FPA_INTAKE;

// the same stress generator the strict-adjacency suite uses: 8 compatible twin-pairs + uniques.
function stressSet(n = 100) {
  return Array.from({ length: n }, (_, i) => {
    const bucket = i < 16 ? Math.floor(i / 2) : 1000 + i;
    return { ...RECON, header: { ...RECON.header, anchor: `STRESS-${i}` }, trigger: { ...RECON.trigger, cadence: `cad-${bucket}` } };
  });
}

test("B1 — the enabled pairs group into a handful of connected-component clusters", () => {
  const adj = E.buildAdjacency(stressSet(100));
  assert.ok(adj.groupCount > 0 && adj.groupCount <= 25, `groups should be low double digits, got ${adj.groupCount}`);
  assert.equal(adj.groupCount, adj.enabledGroups.length);
  assert.equal(adj.groupCount, 8, "the 8 twin-pairs form 8 clusters");
  assert.ok(adj.enabledGroups.every((g) => g.size === 2 && Array.isArray(g.workflows)));
  // grouping never loses the conservation property
  assert.equal(adj.enabledCount + adj.blockedCount, adj.candidateCount);
});

test("B1 — a fully-compatible pair forms ONE group of two with combined freed hours", () => {
  const a = E.buildAdjacency([RECON, { ...RECON, header: { ...RECON.header, anchor: "recon-2" } }]);
  assert.equal(a.groupCount, 1);
  assert.equal(a.enabledGroups[0].size, 2);
  assert.ok(a.enabledGroups[0].combinedFreedHrs > 0);
  assert.match(a.enabledGroups[0].reason, /build the capability once|reuse|less fragmented/);
});

test("B1 — shared role but a different SYSTEM CLASS does not combine (why-blocked on system-class)", () => {
  const sysGL = { ...RECON, header: { ...RECON.header, anchor: "recon-GL" }, systems: [{ id: "gl", class: "ledger/GL", reachability: "batch" }] };
  const sysCRM = { ...RECON, header: { ...RECON.header, anchor: "recon-CRM" }, systems: [{ id: "crm", class: "CRM", reachability: "api" }] };
  const adj = E.buildAdjacency([sysGL, sysCRM]);
  assert.equal(adj.enabledCount, 0);
  assert.ok(adj.whyBlocked.some((c) => c.blockedDimension === "system-class"));
});

test("B1 — shared role but a different ENTITLEMENT profile does not combine (why-blocked on entitlement)", () => {
  const entBase = (anchor, ent) => ({ ...FPA, header: { ...FPA.header, persona: "Analyst", anchor }, steps: FPA.steps.map((s) => ({ ...s, entitlement: ent })) });
  const adj = E.buildAdjacency([entBase("ent-read", "read"), entBase("ent-approve", "approve")]);
  assert.equal(adj.enabledCount, 0);
  assert.ok(adj.whyBlocked.some((c) => c.blockedDimension === "entitlement"));
});

test("B1 — the new legs never drop a candidate (enabled + blocked = candidates)", () => {
  const adj = E.buildAdjacency(stressSet(40));
  assert.equal(adj.enabledCount + adj.blockedCount, adj.candidateCount);
  assert.ok(adj.whyBlocked.every((c) => c.blockedDimension && c.reason));
});

test("B1 — additive: an existing compatible pair still enables (no over-block from the new legs)", () => {
  const a = E.buildAdjacency([RECON, { ...RECON, header: { ...RECON.header, anchor: "Payment investigations (SOP-0117)" } }]);
  assert.equal(a.enabledCount, 1);
  assert.equal(a.groupCount, 1);
});
