// A4 — two-tier discovery store + de-identified pooled cross-discovery library.
//   • per-engagement store: full fidelity (the raw record).
//   • pooled library: written through deIdentify, keeping only roles, capabilities, data-tier CLASS,
//     step-classes, and metrics — stripping names, PII/MNPI content, and proprietary free-text.
// Pins: a discovery with PII free-text produces a pooled record with ZERO PII/MNPI/name/proprietary
// content; the pool never holds a literal PII/MNPI value; the derived layer aggregates over the pool.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "../studio_engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// a discovery dense with names, PII, MNPI, and proprietary free-text in every free-text field
const DIRTY = {
  ...E.FPA_INTAKE,
  header: { ...E.FPA_INTAKE.header, anchor: "Acme Corp Q3 close — PROJECT-NIGHTHAWK", dept: "Finance" },
  trigger: { ...E.FPA_INTAKE.trigger, trigger: "month-end for Acme Corp accounts" },
  steps: E.FPA_INTAKE.steps.map((s, i) => i === 0
    ? { ...s, data: "PII", inputs: "John Smith, SSN 123-45-6789", output: "account 9988 balance", tool: "AcmeSecretLedger", note: "borrower Jane Roe waiver" }
    : (i === 1 ? { ...s, data: "MNPI", inputs: "unannounced M&A target CodeName BLUE" } : s)),
  judgment: { ...E.FPA_INTAKE.judgment, human: "approve the waiver for client ACME", hard: "PROPRIETARY-MODEL detail" },
  confirm: { ...E.FPA_INTAKE.confirm, acceptance: "ties to Acme SECRETSAUCE worksheet", escalation: "call CFO Jane Roe", dataTier: "MNPI" },
};
const SECRETS = ["Acme", "PROJECT-NIGHTHAWK", "John Smith", "123-45-6789", "9988", "AcmeSecretLedger", "Jane Roe", "CodeName BLUE", "PROPRIETARY-MODEL", "SECRETSAUCE", "CFO"];

test("A4 — the pooled record contains ZERO PII/MNPI/name/proprietary free-text", () => {
  const json = JSON.stringify(E.deIdentify(DIRTY));
  const leaks = SECRETS.filter(s => json.includes(s));
  assert.deepEqual(leaks, [], `pooled record must leak nothing; leaked: ${leaks.join(", ")}`);
});

test("A4 — the pooled record never holds a literal PII or MNPI tier value (generalized to restricted)", () => {
  const json = JSON.stringify(E.deIdentify(DIRTY));
  assert.ok(!/"(PII|MNPI)"/.test(json), "no literal PII/MNPI tier value survives");
  const pooled = E.deIdentify(DIRTY);
  assert.equal(pooled.steps[0].data, "restricted", "the PII step is generalized to restricted");
  assert.equal(pooled.confirm.dataTier, "restricted");
});

test("A4 — the pooled record keeps ONLY the de-identified shape (class/tier/capability/metrics/roles)", () => {
  const p = E.deIdentify(DIRTY);
  const s0 = p.steps[0];
  assert.equal(s0.cls, "assembly");                       // step-class kept
  assert.ok(["restricted", "confidential", "internal", "public"].includes(s0.data)); // tier class kept
  assert.ok(typeof s0.capability === "string" && s0.capability.length); // capability kept
  assert.equal(s0.time, 18);                              // metric kept
  assert.ok(!("inputs" in s0) && !("output" in s0) && !("tool" in s0) && !("note" in s0)); // free-text dropped
  assert.match(s0.step, /de-identified/);                 // description is a placeholder, not the real text
  // roles (categories) are retained for the collective view (persona role; actors[] when present)
  assert.ok(p.header.persona);
  assert.ok(!p.actors || p.actors.every(a => a.role));
  // a multi-actor discovery retains its role registry (categories), never person names
  const reconPooled = E.deIdentify(E.RECON_INTAKE);
  assert.ok(reconPooled.actors.length > 0 && reconPooled.actors.every(a => a.role));
});

test("A4 — splitDiscoveryTiers writes BOTH tiers: full engagement + de-identified pooled", () => {
  const { engagement, pooled } = E.splitDiscoveryTiers(DIRTY);
  assert.equal(engagement, DIRTY, "engagement tier is the full record (untouched)");
  assert.equal(pooled.deIdentified, true);
  assert.ok(JSON.stringify(engagement).includes("John Smith"), "the engagement tier RETAINS full fidelity");
  assert.ok(!JSON.stringify(pooled).includes("John Smith"), "the pooled tier does NOT");
});

test("A4 — the derived layer aggregates across the POOLED library", () => {
  const pool = E.buildPooledLibrary([DIRTY, E.RECON_INTAKE]);
  assert.equal(pool.length, 2);
  assert.equal(E.buildRoleView(pool).confirmedCount, 2);
  assert.equal(E.buildCapabilityMap(pool).confirmedCount, 2);
  assert.equal(E.buildLeaderView(pool).confirmedCount, 2);
  assert.ok(E.buildRoleView(pool).roles.length > 0, "roles roll up across the pool");
  // the whole pool carries no literal PII/MNPI value
  assert.ok(!/"(PII|MNPI)"/.test(JSON.stringify(pool)));
});

test("A4 — buildPooledLibrary is confirmed-only (an unconfirmed discovery is not pooled)", () => {
  const pool = E.buildPooledLibrary([DIRTY, { ...E.RECON_INTAKE, recap: { confirmed: false } }]);
  assert.equal(pool.length, 1);
});

test("A4 — the persisted pooled-library.json is the de-identified moat (no PII/MNPI/name)", () => {
  const lib = JSON.parse(readFileSync(path.join(__dirname, "..", "pooled-library.json"), "utf8"));
  assert.ok(Array.isArray(lib.records) && lib.records.length >= 2);
  const json = JSON.stringify(lib);
  assert.ok(!/"(PII|MNPI)"/.test(json), "the pooled library file holds no literal PII/MNPI value");
  // every pooled record is de-identified, confirmed, and drives the derived layer
  assert.ok(lib.records.every(r => r.deIdentified === true && E.isConfirmed(r)));
  assert.equal(E.buildLeaderView(lib.records).confirmedCount, lib.records.length);
});
