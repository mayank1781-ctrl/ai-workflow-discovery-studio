// A3 (M8) — stricter adjacency. A shared role/capability alone no longer clusters two workflows;
// they must ALSO be compatible on data tier, controls, cadence, and tooling/solution-shape. The
// loose rule produced thousands of phantom clusters (~4,916 on the stress set); the strict rule
// collapses the ENABLED set to a handful and surfaces every incompatible pair as why-blocked
// (never silently dropped). Pins the collapse, the conservation (nothing dropped), and each new
// blocking dimension.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

const RECON = E.RECON_INTAKE;
const FPA = E.FPA_INTAKE;

// 100 confirmed clones, all sharing the same roles + capabilities (every pair is a loose candidate),
// but only 8 "twin" pairs share a (unique) cadence and so are fully compatible.
function stressSet(n = 100) {
  return Array.from({ length: n }, (_, i) => {
    const bucket = i < 16 ? Math.floor(i / 2) : 1000 + i; // 8 twin-pairs (indices 0..15), rest unique
    return { ...RECON, header: { ...RECON.header, anchor: `STRESS-${i}` }, trigger: { ...RECON.trigger, cadence: `cad-${bucket}` } };
  });
}

test("A3 — the loose ~4,916-scale candidate count collapses to a handful of enabled clusters", () => {
  const adj = E.buildAdjacency(stressSet(100));
  // every pair shares role + capability under the OLD rule
  assert.ok(adj.candidateCount > 4000, `loose candidate count should be thousands, got ${adj.candidateCount}`);
  // the new rule enables only the compatible twins — a small set (low double digits or fewer)
  assert.ok(adj.enabledCount > 0 && adj.enabledCount <= 25, `enabled should be a handful, got ${adj.enabledCount}`);
  assert.equal(adj.enabledCount, 8, "exactly the 8 compatible twin-pairs enable");
});

test("A3 — incompatible pairs are surfaced as why-blocked, never silently dropped", () => {
  const adj = E.buildAdjacency(stressSet(100));
  assert.equal(adj.enabledCount + adj.blockedCount, adj.candidateCount, "enabled + blocked = all candidates");
  assert.ok(adj.whyBlocked.length > 4000, "the rest are surfaced, not dropped");
  assert.ok(adj.whyBlocked.every(c => c.blockedDimension && c.reason), "each why-blocked names a dimension + reason");
  assert.match(adj.note, /actionable cluster|why-blocked|not dropped/i);
});

test("A3 — sharing a role but differing on DATA TIER does not cluster (why-blocked on data)", () => {
  const roleOnlyInternal = { ...FPA, header: { ...FPA.header, persona: "Analyst", anchor: "X-internal" }, steps: FPA.steps.map(s => ({ ...s, data: "internal" })), confirm: { ...FPA.confirm, dataTier: "internal" } };
  const roleOnlyMnpi = { ...FPA, header: { ...FPA.header, persona: "Analyst", anchor: "Y-mnpi" }, steps: FPA.steps.map(s => ({ ...s, data: "MNPI" })) };
  const adj = E.buildAdjacency([roleOnlyInternal, roleOnlyMnpi]);
  assert.equal(adj.enabledCount, 0, "internal vs MNPI must not enable");
  assert.ok(adj.whyBlocked.some(c => c.blockedDimension === "data"), "blocked on the data dimension");
  assert.match(adj.whyBlocked[0].reason, /data boundary|raise the ceiling/);
});

test("A3 — sharing role + capability but differing on CADENCE does not cluster (why-blocked on cadence)", () => {
  const daily = { ...RECON, header: { ...RECON.header, anchor: "daily-ops" }, trigger: { ...RECON.trigger, cadence: "daily" } };
  const monthly = { ...RECON, header: { ...RECON.header, anchor: "monthly-close" }, trigger: { ...RECON.trigger, cadence: "monthly" } };
  const adj = E.buildAdjacency([daily, monthly]);
  assert.equal(adj.enabledCount, 0);
  assert.ok(adj.whyBlocked.some(c => c.blockedDimension === "cadence"));
});

test("A3 — sharing role + capability and compatible on every dimension still ENABLES (no over-block)", () => {
  const recon2 = { ...RECON, header: { ...RECON.header, anchor: "Payment investigations (SOP-0117)" } };
  const adj = E.buildAdjacency([RECON, recon2]);
  assert.equal(adj.enabledCount, 1, "two genuinely-compatible workflows still cluster");
  assert.equal(adj.enabledClusters[0].status, "enabled");
  assert.match(adj.enabledClusters[0].reason, /build the capability once|less fragmented/);
});

test("A3 — solution-shape incompatibility blocks a combine (the same capability built two ways)", () => {
  const asPrompt = { ...RECON, header: { ...RECON.header, anchor: "recon-prompt" }, steps: RECON.steps.map(s => s.cls === "assembly" ? { ...s, solutionShape: "prompt" } : s) };
  const asAgentic = { ...RECON, header: { ...RECON.header, anchor: "recon-agentic" }, steps: RECON.steps.map(s => s.cls === "assembly" ? { ...s, solutionShape: "agentic" } : s) };
  const adj = E.buildAdjacency([asPrompt, asAgentic]);
  assert.equal(adj.enabledCount, 0);
  assert.ok(adj.whyBlocked.some(c => c.blockedDimension === "shape"));
});
