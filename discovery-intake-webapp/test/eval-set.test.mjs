// Edition 3 — F5: the interpretation rubric, ENFORCED IN CI (gating). eval_set.json is the adversarial
// case set — what an SME actually says, the trap, the correct tags, and the DANGEROUS wrong answer. Each
// case runs through the engine's classifyUtterance (the rubric, executable). A dangerous_wrong outcome —
// a decision/judgment step labeled `assembly`, an un-split combined step carried as assembly, a high-
// criticality seam scored low, an auto-resolvable halt — is a HARD FAILURE that blocks the gate.
// Target: 0 dangerous-wrong. (The eval pass-rate is logged for the build report.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as engine from "../studio_engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVAL = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "eval-set.json"), "utf8"));
const TIER_RANK = { public: 0, internal: 1, confidential: 2, PII: 3, MNPI: 4 };

// Does the rubric's read of this utterance MATCH the case's dangerous wrong answer? (true => the gate must fail.)
function producesDangerousWrong(c, r) {
  const dw = c.dangerous_wrong || {};
  // (1) a decision/judgment step labeled assembly — the unrecoverable error
  if (dw.cls === "assembly") return r.cls === "assembly";
  // over-tagging the other direction (case guards both ways)
  if (dw.cls === "judgment") return r.cls === "judgment";
  // (2) a high-criticality seam scored low
  if (dw.seam && dw.seam.criticality === "low") return r.seamCriticality === "low";
  // aspirational theo of 100 on an assembly step
  if (dw.theo === 100) return r.theoRange[1] >= 100;
  // under-read data tier
  if (dw.data === "internal") return (TIER_RANK[r.dataTier] ?? 0) < TIER_RANK.confidential;
  // all wait treated as reducible (the protected human-decision wait erased)
  if (dw.all === "reducible") return !r.waits.some((w) => w.waitKind === "protected");
  // an inferred value recorded as stated
  if (dw.source === "stated") return r.acceptanceSource === "stated";
  // --- Phase 3 (v3) — the four new dangerous errors, against the engine's real rubric reads ---
  // (1) a write-in-place / approve action under-read as a read (same system, opposite automatability)
  if (dw.action === "read") return r.action === "read";
  // (2) a screen-only system called agentic (an un-buildable plan that looks cheap on paper)
  if (dw.shape === "agentic") return r.realisticShape === "agentic";
  // (3) elevated write/approve on sensitive data scored low-value (the access wasn't captured)
  if (dw.value === "low") return r.highValue !== true;
  // (4) a shared system name treated as evidence two workflows combine (absent shared action+data+access)
  if (dw.combine === true) return r.combinable === true;
  // unsafe behavior: AI fills the answer / AI approves or merges
  if (dw.behavior) {
    if (/fill/i.test(dw.behavior)) return r.aiMustNotPrefill !== true;          // template must flag "AI must not pre-fill"
    if (/approv|merg|deploy|page/i.test(dw.behavior)) return !(r.split && r.steps.some((s) => s.cls === "decision")); // the commit must be split out + human
    return false;
  }
  return false;
}

// A "meaningful split" carves an assembly act away from a judgment/decision act (so AI can't carry the call).
function expectsMeaningfulSplit(c) {
  const steps = (c.expected && c.expected.steps) || [];
  return c.expected && c.expected.split === true && steps.some((s) => s.cls === "assembly") && steps.some((s) => s.cls !== "assembly");
}

// ---- the gate: zero dangerous-wrong across the whole eval set ----
test("GATING — the rubric produces ZERO dangerous-wrong outcomes across all eval cases", () => {
  const failures = [];
  for (const c of EVAL.cases) {
    const r = engine.classifyUtterance(c.sme_says);
    if (producesDangerousWrong(c, r)) failures.push({ id: c.id, clause: c.clause, dangerous: c.dangerous_wrong, got: { cls: r.cls, split: r.split, seamCriticality: r.seamCriticality, dataTier: r.dataTier, theoRange: r.theoRange, acceptanceSource: r.acceptanceSource, aiMustNotPrefill: r.aiMustNotPrefill, action: r.action, entitlement: r.entitlement, reachability: r.reachability, realisticShape: r.realisticShape, highValue: r.highValue, combinable: r.combinable } });
  }
  const total = EVAL.cases.length, passed = total - failures.length;
  // build-log line: the eval pass-rate (target 0 dangerous-wrong)
  console.log(`[eval] dangerous-wrong=${failures.length}/${total}  pass-rate=${Math.round(passed / total * 100)}%`);
  assert.equal(failures.length, 0, `dangerous-wrong outcomes (must be 0):\n${JSON.stringify(failures, null, 2)}`);
});

// ---- per-case positive assertions (the rubric gets the CORRECT answer, not merely "not the wrong one") ----
test("no decision/judgment utterance is ever classified as assembly (the false-assembly guard)", () => {
  for (const c of EVAL.cases) {
    if (!c.dangerous_wrong || c.dangerous_wrong.cls !== "assembly") continue;
    const r = engine.classifyUtterance(c.sme_says);
    assert.notEqual(r.cls, "assembly", `${c.id}: "${c.sme_says}" was labeled assembly`);
  }
});

test("single-class cases get the exact expected class (assembly/judgment/decision)", () => {
  for (const c of EVAL.cases) {
    if (!c.expected || !c.expected.cls || c.expected.split) continue;
    const r = engine.classifyUtterance(c.sme_says);
    assert.equal(r.cls, c.expected.cls, `${c.id}: expected ${c.expected.cls}, got ${r.cls}`);
  }
});

test("combined steps that bundle assembly with a judgment/decision are SPLIT", () => {
  for (const c of EVAL.cases) {
    if (!expectsMeaningfulSplit(c)) continue;
    const r = engine.classifyUtterance(c.sme_says);
    assert.equal(r.split, true, `${c.id}: "${c.sme_says}" should split`);
    assert.ok(r.steps.some((s) => s.cls === "decision" || s.cls === "judgment"), `${c.id}: the split keeps a human-held step`);
  }
});

test("a low-friction, high-criticality seam scores criticality HIGH (orthogonal to ease)", () => {
  const c = EVAL.cases.find((x) => x.id === "low-friction-high-crit-seam");
  const r = engine.classifyUtterance(c.sme_says);
  assert.equal(r.seamFriction, "low", "one click => low friction");
  assert.equal(r.seamCriticality, "high", "criticality from consequence, never from ease");
});

test("theo is honest, never 100 for assembly (~65–80% headroom)", () => {
  const c = EVAL.cases.find((x) => x.id === "aspirational-theo");
  const r = engine.classifyUtterance(c.sme_says);
  assert.ok(r.theoRange[1] < 100 && r.theoRange[0] >= 60, `theo range ${JSON.stringify(r.theoRange)}`);
});

test("data tier rounds UP — borrower financials/tax returns are at least confidential, never internal", () => {
  const c = EVAL.cases.find((x) => x.id === "data-tier-underread");
  const r = engine.classifyUtterance(c.sme_says);
  assert.ok(TIER_RANK[r.dataTier] >= TIER_RANK.confidential, `tier ${r.dataTier}`);
});

test("the wait around a human decision is protected; routine queue is reducible (not all reducible)", () => {
  const c = EVAL.cases.find((x) => x.id === "wait-kinds");
  const r = engine.classifyUtterance(c.sme_says);
  assert.ok(r.waits.some((w) => w.waitKind === "protected"), "committee wait protected");
  assert.ok(r.waits.some((w) => w.waitKind === "reducible"), "queue wait reducible");
});

test("an unstated acceptance bar is recorded as inferred, never stated", () => {
  const c = EVAL.cases.find((x) => x.id === "unstated-acceptance");
  const r = engine.classifyUtterance(c.sme_says);
  assert.equal(r.acceptanceSource, "inferred");
});

test("a facilitation/template step flags that AI must NOT pre-fill the answer", () => {
  const c = EVAL.cases.find((x) => x.id === "template-not-answer");
  const r = engine.classifyUtterance(c.sme_says);
  assert.equal(r.cls, "assembly");
  assert.equal(r.aiMustNotPrefill, true);
});

test("an auto-resolvable halt is a hard rail violation (the eval's halt trap)", () => {
  const RECON = engine.RECON_INTAKE;
  const autoHalt = { ...RECON, steps: [{ ...RECON.steps[1], autoResolve: true }] };
  assert.equal(engine.controlRail(autoHalt).ok, false);
});

// ---- Phase 3 (v3) — the four new cases get the CORRECT read, not merely "not the wrong one" ----
test("v3 — a write-in-place is read as write-in-place / write, never under-read as a read", () => {
  const c = EVAL.cases.find((x) => x.id === "write-in-place-as-read");
  const r = engine.classifyUtterance(c.sme_says);
  assert.equal(r.action, "write-in-place");
  assert.equal(r.entitlement, "write");
});

test("v3 — a screen-only system's realistic shape is human-in-loop, never agentic", () => {
  const c = EVAL.cases.find((x) => x.id === "screen-only-as-agentic");
  const r = engine.classifyUtterance(c.sme_says);
  assert.equal(r.reachability, "screen-only");
  assert.equal(r.realisticShape, "human-in-loop");
});

test("v3 — elevated approve on sensitive (client) data reads high-value, never low", () => {
  const c = EVAL.cases.find((x) => x.id === "low-value-elevated-access");
  const r = engine.classifyUtterance(c.sme_says);
  assert.equal(r.entitlement, "approve");
  assert.ok(TIER_RANK[r.dataTier] >= TIER_RANK.confidential, `tier ${r.dataTier}`);
  assert.equal(r.highValue, true);
});

test("v3 — a shared system name alone is NOT combinable (needs shared action + data + access)", () => {
  const c = EVAL.cases.find((x) => x.id === "shared-system-false-combine");
  const r = engine.classifyUtterance(c.sme_says);
  assert.equal(r.combinable, false);
});
