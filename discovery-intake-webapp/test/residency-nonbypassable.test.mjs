// P5 / M2 — PII/MNPI residency is NON-BYPASSABLE without a formal policy exception.
//
// Audit major: modelTier("assembly","PII","routed", true) downgraded PII from restricted to
// small — a bare boolean flag bypassed the residency rule the brief says is absolute. The fix:
// the 4th argument is now a FORMAL exception object (approver, jurisdiction, dataClass, expiry).
// A bare boolean / partial / expired / wrong-class object is NOT an exception; the data stays
// restricted.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";

const VALID = { approver: "Chief Data Officer", jurisdiction: "EU", dataClass: "PII", expiry: "2099-01-01", asOf: "2026-06-21" };

test("M2 — the exact audit probe: a bare `true` cannot reach a non-restricted tier", () => {
  assert.equal(engine.modelTier("assembly", "PII", "routed", true), "restricted", "PII + bare true stays restricted");
  assert.equal(engine.modelTier("assembly", "MNPI", "routed", true), "restricted", "MNPI + bare true stays restricted");
  assert.equal(engine.modelTier("judgment", "PII", "mid", true), "restricted", "judgment + PII + bare true stays restricted");
  // Truthy non-objects are not exceptions either.
  assert.equal(engine.modelTier("assembly", "PII", "routed", 1), "restricted");
  assert.equal(engine.modelTier("assembly", "PII", "routed", "yes"), "restricted");
});

test("M2 — the default (no exception) forces PII/MNPI to restricted", () => {
  assert.equal(engine.modelTier("assembly", "PII", "routed"), "restricted");
  assert.equal(engine.modelTier("assembly", "MNPI", "routed"), "restricted");
});

test("M2 — a partial / malformed exception does NOT lift residency", () => {
  assert.equal(engine.modelTier("assembly", "PII", "routed", {}), "restricted", "empty object");
  assert.equal(engine.modelTier("assembly", "PII", "routed", { approver: "X" }), "restricted", "missing jurisdiction/dataClass/expiry");
  assert.equal(engine.modelTier("assembly", "PII", "routed", { approver: "X", jurisdiction: "EU", dataClass: "PII" }), "restricted", "missing expiry");
  assert.equal(engine.modelTier("assembly", "PII", "routed", { approver: "", jurisdiction: "EU", dataClass: "PII", expiry: "2099-01-01" }), "restricted", "blank approver");
});

test("M2 — an EXPIRED exception does NOT lift residency", () => {
  assert.equal(engine.modelTier("assembly", "PII", "routed", { ...VALID, expiry: "2020-01-01" }), "restricted", "expired");
  // Evaluated as-of a date AFTER expiry.
  assert.equal(engine.modelTier("assembly", "PII", "routed", { ...VALID, expiry: "2026-01-01", asOf: "2026-06-21" }), "restricted", "expired vs asOf");
});

test("M2 — an exception for the WRONG data class does NOT lift residency", () => {
  // A PII exception cannot license MNPI processing, and vice versa.
  assert.equal(engine.modelTier("assembly", "MNPI", "routed", VALID), "restricted", "PII exception does not cover MNPI");
  assert.equal(engine.modelTier("assembly", "PII", "routed", { ...VALID, dataClass: "MNPI" }), "restricted", "MNPI exception does not cover PII");
});

test("M2 — a VALID, complete, unexpired exception DOES lift residency (the legitimate path)", () => {
  assert.equal(engine.modelTier("assembly", "PII", "routed", VALID), "small", "valid PII exception routes normally");
  assert.equal(engine.modelTier("assembly", "MNPI", "routed", { ...VALID, dataClass: "MNPI" }), "small", "valid MNPI exception routes normally");
  // validPolicyException is exposed and agrees.
  assert.equal(engine.validPolicyException(VALID, "PII"), true);
  assert.equal(engine.validPolicyException(true, "PII"), false);
  assert.equal(engine.validPolicyException(VALID, "MNPI"), false);
});

test("M2 — confidential routes normally and is never forced to restricted", () => {
  assert.equal(engine.modelTier("assembly", "confidential", "routed"), "small", "confidential is not residency-forced");
  assert.equal(engine.modelTier("assembly", "internal", "routed"), "small");
});

test("M2 — a decision never gets a tier regardless of exception (stays human)", () => {
  assert.equal(engine.modelTier("decision", "PII", "routed", VALID), "human");
});
