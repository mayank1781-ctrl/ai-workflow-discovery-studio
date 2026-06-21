// Edition 3 — F8: Dashboard org-tier (the operating-model view). An org/role KPI tier ABOVE the existing
// nine (E5), bound to F4 + the F8 numbers: freed capacity per role (+ the assembly->judgment shift),
// capability reuse / build-once, adjacency clusters (enabled | control-blocked + reason), cross-role
// hand-off reduction, the risk/SLA dividend (paired with its guardrail). Confirmed-only, provenance dots,
// labeled telemetry placeholders. Adjacency reads as RESHAPE — never headcount. Firewall + the leader rail.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
const PAYMENTS = {
  ...RECON,
  header: { ...RECON.header, anchor: "Payment investigations (SOP-0117)" },
  steps: [
    { step: "Allocate payment case", cls: "assembly", data: "internal", time: 12, theo: 80, participants: [{ actorId: "teamLead", part: "doer" }] },
    { step: "Classify case type", cls: "assembly", data: "confidential", time: 20, theo: 70, output: "case type", participants: [{ actorId: "maker", part: "doer" }] },
    { step: "Investigate payment", cls: "judgment", data: "confidential", time: 22, theo: 35, participants: [{ actorId: "maker", part: "doer" }] },
    { step: "Approve payment fix", cls: "decision", data: "confidential", time: 12, theo: 10, participants: [{ actorId: "maker", part: "doer" }, { actorId: "checker", part: "approver" }], control: { type: "four-eyes", distinct: ["doer", "approver"], authorityRef: "authorityMatrix:writeOff" } },
    { step: "Post correction", cls: "assembly", data: "confidential", time: 14, theo: 75, participants: [{ actorId: "maker", part: "doer" }] },
  ],
};
const PAY_MNPI = { ...PAYMENTS, header: { ...PAYMENTS.header, anchor: "MNPI block recon (SOP-0210)" }, steps: PAYMENTS.steps.map((s) => ({ ...s, data: s.data === "confidential" ? "MNPI" : s.data })) };
const DEPT = [RECON, PAYMENTS];

function sandbox() {
  return buildSandbox(source, {
    consts: ["DASH"],
    functions: [
      "studioEngine", "engineRoleView", "engineCapabilityMap", "engineAdjacency", "engineHandoffReduction", "engineSlaDividend",
      "dashProvDot", "dashPlaceholder", "dashOrgTierHtml",
    ],
    globals: {
      window: { StudioEngine: engine },
      escapeHtml: (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
    },
  });
}

test("each org-tier KPI equals its engine function for a multi-actor department", () => {
  const sb = sandbox();
  const html = sb.dashOrgTierHtml(DEPT, {});
  const rv = engine.buildRoleView(DEPT), cm = engine.buildCapabilityMap(DEPT), hr = engine.buildHandoffReduction(DEPT), sla = engine.buildSlaDividend(DEPT);
  // freed capacity per role (rendered as role-weeks = freedFTE rounded to 2dp, never the banned "FTE" word)
  assert.match(html, /Ops Analyst/);
  const roleWeeks = Math.round((rv.roles[0].freedFTE || 0) * 100) / 100;
  assert.ok(html.includes(`${roleWeeks} role-weeks of freed capacity`), "role tile == buildRoleView freed (as role-weeks)");
  assert.match(html, /assembly .*→ judgment/, "the assembly->judgment shift");
  // capability reuse / build-once
  const reused = cm.capabilities.find((c) => c.buildOnce);
  assert.ok(html.includes(`reuse across ${reused.reuseCount}`), "capability tile == buildCapabilityMap reuseCount");
  // hand-off reduction
  assert.ok(html.includes(`${hr.baseline} today → ${hr.remaining} with AI`), "hand-off tile == buildHandoffReduction");
  // SLA dividend
  assert.ok(html.includes(`${sla.freedRoleWeeks} role-weeks of backlog headroom`), "SLA tile == buildSlaDividend");
});

test("adjacency clusters render enabled / control-blocked WITH the reason", () => {
  const sb = sandbox();
  const enabledHtml = sb.dashOrgTierHtml([RECON, PAYMENTS], {});
  assert.match(enabledHtml, /✓ enabled/);
  // a data-tier boundary combine is control-blocked, with its reason on the tile
  const blockedHtml = sb.dashOrgTierHtml([RECON, PAY_MNPI], {});
  assert.match(blockedHtml, /control-blocked/);
  assert.match(blockedHtml, /data boundary|raise the ceiling/);
});

test("the org view passes the leader rail (dashboard) and FAILS on a worker surface", () => {
  const sb = sandbox();
  const html = sb.dashOrgTierHtml(DEPT, {});
  assert.equal(engine.railCheck(html, "dashboard").ok, true, JSON.stringify(engine.railCheck(html, "dashboard").violations));
  assert.equal(engine.railCheck(html, "workbench").ok, false, "capacity language is dashboard-only — blocked on a worker surface");
  assert.equal(engine.railCheck(html, "capture").ok, false);
});

test("headcount / cut vocabulary is rejected everywhere — the org view reads as RESHAPE, never headcount", () => {
  const sb = sandbox();
  const html = sb.dashOrgTierHtml(DEPT, {});
  assert.ok(!/headcount|\bFTE\b|cut staff|lay ?off|layoff|eliminate role|downsize|reduce headcount/i.test(html), "no headcount/cut vocabulary");
  // reshape framing is present
  assert.match(html, /build once|reuse|reshape|less fragmented|role-weeks/i);
  assert.match(html, /hypothesis for leaders|human-confirmed|never a reorg/i, "adjacency is a suggestion, not a reorg");
});

test("provenance dots + labeled telemetry placeholders (never fabricated)", () => {
  const sb = sandbox();
  const html = sb.dashOrgTierHtml(DEPT, {});
  assert.match(html, /class="prov (inferred|ai)"|prov ai/, "provenance dots present");
  assert.match(html, /awaiting telemetry/, "aged-items / SLA breach count is a labeled placeholder");
});

test("never-a-dead-end: an empty org tier renders the engine note + a Workbench link", () => {
  const sb = sandbox();
  const html = sb.dashOrgTierHtml([{ ...RECON, recap: { confirmed: false } }], {});
  assert.match(html, /confirm units on the Workbench/i);
  assert.match(html, /data-dashboard-to-workbench/);
});

test("ADDITIVE: a single-persona department still renders an org tier with one role (no multi-actor noise)", () => {
  const sb = sandbox();
  const html = sb.dashOrgTierHtml([engine.FPA_INTAKE], {});
  assert.match(html, /FP&amp;A analyst|FP&A analyst/);
  assert.equal(engine.railCheck(html, "dashboard").ok, true);
});
