// Executed tests for PR 36 Slice B1 — the pure ledger core. No wiring exists
// yet (patchField still mutates cells directly until Slice B2); these pins
// hold the projection to patchField's exact contract BEFORE the rewire, so
// B2's job reduces to "append + project + hooks-on-projection-change".
// The four rules from the accepted ledger findings are each exercised
// directly, plus the compaction policy's hard invariants.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";

const source = readAppSource();

function ledgerSandbox() {
  return buildSandbox(source, {
    consts: ["GRID_SOURCE_RANK"],
    functions: ["newLedgerEntry", "projectCellLedgerDetailed", "projectCellLedger", "compactCellLedger"]
  });
}

const cap = (value, source, confidence, extra = {}) =>
  ({ at: "2026-06-12T00:00:00.000Z", kind: "capture", value, source, confidence, refresh: false, ...extra });
const clear = (source = "user-edited") =>
  ({ at: "2026-06-12T00:00:00.000Z", kind: "clear", value: "", source, confidence: 0, refresh: false });
const unknown = (source = "ai-inferred") =>
  ({ at: "2026-06-12T00:00:00.000Z", kind: "unknown", value: "", source, confidence: 0, refresh: false });

test("rule 1: rank precedence — a later doc@0.99 stays shadowed behind a user entry (P9 permanence at ledger level)", () => {
  const { projectCellLedger } = ledgerSandbox();
  const entries = [
    cap("inferred guess", "ai-inferred", 0.4),
    cap("from the SOP doc", "doc-extracted", 0.8),
    cap("Client-confidential", "user-edited", 1, { refresh: true }),
    cap("Public per the doc", "doc-extracted", 0.99)
  ];
  const cell = projectCellLedger(entries);
  assert.equal(cell.value, "Client-confidential", "user entry projects");
  assert.equal(cell.source, "user-edited");
  assert.equal(cell.state, "confirmed");
});

test("rule 1: within a rank, latest wins only via higher confidence or refresh", () => {
  const { projectCellLedger } = ledgerSandbox();
  // Same provenance, lower confidence, no refresh → shadowed.
  assert.equal(projectCellLedger([
    cap("first doc value", "doc-extracted", 0.8),
    cap("second doc value", "doc-extracted", 0.6)
  ]).value, "first doc value");
  // Higher confidence improves.
  assert.equal(projectCellLedger([
    cap("first doc value", "doc-extracted", 0.6),
    cap("second doc value", "doc-extracted", 0.8)
  ]).value, "second doc value");
  // refresh replaces regardless (re-extraction / explicit edit semantics).
  assert.equal(projectCellLedger([
    cap("first user value", "user-edited", 1, { refresh: true }),
    cap("second user value", "user-edited", 1, { refresh: true })
  ]).value, "second user value");
});

test("rule 2: a clear resets precedence — extraction refills a user-cleared cell (the #134 pin, ledger level)", () => {
  const { projectCellLedger } = ledgerSandbox();
  const cell = projectCellLedger([
    cap("Murex + Excel", "user-edited", 1, { refresh: true }),
    cap("Aladdin", "doc-extracted", 0.99), // shadowed: user holds the cell
    clear(),
    cap("Aladdin", "doc-extracted", 0.8)   // lands: precedence reset
  ]);
  assert.equal(cell.value, "Aladdin");
  assert.equal(cell.source, "doc-extracted");
  assert.equal(cell.state, "inferred");
  // And the projection of clear-then-nothing is the empty cell itself.
  const cleared = projectCellLedger([cap("x", "user-edited", 1), clear()]);
  assert.equal(cleared.state, "empty");
  assert.equal(cleared.value, "");
});

test("unknown semantics: records only while empty, never twice, never over data; a capture overwrites it", () => {
  const { projectCellLedger } = ledgerSandbox();
  assert.equal(projectCellLedger([unknown()]).state, "unknown");
  // Second unknown is a no-op (mirrors patchField's refusal).
  const twice = projectCellLedger([unknown("ai-inferred"), unknown("doc-extracted")]);
  assert.equal(twice.source, "ai-inferred", "first unknown stands");
  // Unknown never clobbers a captured value.
  assert.equal(projectCellLedger([cap("8am daily", "doc-extracted", 0.8), unknown()]).value, "8am daily");
  // A later real answer overwrites the unknown; after a clear, unknown applies again.
  assert.equal(projectCellLedger([unknown(), cap("8am daily", "ai-inferred", 0.5)]).value, "8am daily");
  assert.equal(projectCellLedger([cap("x", "user-edited", 1), clear(), unknown()]).state, "unknown");
});

test("rules 3+4: shadowed/invalid entries never project; projection is pure, deterministic, non-mutating", () => {
  const { projectCellLedger, projectCellLedgerDetailed, newLedgerEntry } = ledgerSandbox();
  const entries = [
    cap("kept", "user-stated", 1),
    cap("shadowed", "ai-inferred", 0.9),
    { at: "x", kind: "capture", value: "bad source", source: "model-guess", confidence: 1 },
    null,
    cap("   ", "doc-extracted", 0.9) // whitespace-only value never projects
  ];
  const frozen = JSON.stringify(entries);
  const first = projectCellLedgerDetailed(entries);
  const second = projectCellLedgerDetailed(entries);
  assert.deepEqual(first, second, "deterministic: same ledger, same projection");
  assert.equal(first.cell.value, "kept");
  assert.equal(first.projectedIndex, 0, "every later entry is shadowed/invalid");
  assert.equal(JSON.stringify(entries), frozen, "projection never mutates the ledger");
  assert.equal(projectCellLedger([]), null, "empty ledger projects nothing (caller keeps its default)");
  // Constructor shape: kind is normalized, originArtifactId only when given.
  const entry = newLedgerEntry("capture", { value: "v", source: "doc-extracted", confidence: 0.8, originArtifactId: "ev-1" });
  assert.equal(entry.originArtifactId, "ev-1");
  assert.ok(!("originArtifactId" in newLedgerEntry("clear", { source: "user-edited" })));
  assert.equal(newLedgerEntry("bogus", { source: "ai-inferred" }).kind, "capture");
});

test("compaction: projection-preserving, never drops user entries or clears, caps shadowed extraction history", () => {
  const { projectCellLedgerDetailed, compactCellLedger } = ledgerSandbox();
  const entries = [
    cap("ai guess 1", "ai-inferred", 0.3),
    cap("ai guess 2", "ai-inferred", 0.4),
    cap("doc v1", "doc-extracted", 0.6),
    cap("user truth", "user-edited", 1, { refresh: true }),
    cap("doc v2 shadowed", "doc-extracted", 0.9),
    clear(),
    cap("doc v3 projects", "doc-extracted", 0.7),
    cap("doc v4 shadowed", "doc-extracted", 0.5),
    cap("ai shadowed late", "ai-inferred", 0.2)
  ];
  const before = projectCellLedgerDetailed(entries).cell;
  const compacted = compactCellLedger(entries, 3);
  const after = projectCellLedgerDetailed(compacted).cell;
  assert.deepEqual(after, before, "THE invariant: compaction never changes the projection");
  // Every user entry and every clear survives.
  assert.ok(compacted.some((e) => e.value === "user truth"), "user entry kept");
  assert.ok(compacted.some((e) => e.kind === "clear"), "clear kept");
  assert.ok(compacted.some((e) => e.value === "doc v3 projects"), "projecting entry kept");
  // Shadowed extraction history capped at the 3 most recent.
  const shadowedKept = compacted.filter((e) => e.kind === "capture" && (e.source !== "user-edited") && e.value !== "doc v3 projects");
  assert.equal(shadowedKept.length, 3, "exactly the 3 most recent shadowed extraction entries survive");
  assert.ok(!compacted.some((e) => e.value === "ai guess 1"), "oldest shadowed entry compacted away");
  // Order is preserved.
  const values = compacted.map((e) => e.kind === "clear" ? "<clear>" : e.value);
  assert.deepEqual(values, ["user truth", "doc v2 shadowed", "<clear>", "doc v3 projects", "doc v4 shadowed", "ai shadowed late"]);
});
