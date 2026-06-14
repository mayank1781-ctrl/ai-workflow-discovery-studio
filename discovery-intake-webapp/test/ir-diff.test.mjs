// V3-8 — IR-level version diff. Executed, deterministic tests (NO live LLM) over
// the pure structural diff of two stored Agent Recipe IR snapshots: identical →
// no changes, scalar/array/object field changes, canonical field ordering,
// determinism, byte-stability (no mutation), the no-model/no-re-derivation source
// guard, and the byte-identical-when-no-prior guarantee on artifactSnapshotHtml.
// Real shipped source extracted and evaluated (see helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function diffSandbox() {
  return buildSandbox(source, {
    consts: ["IR_DIFF_FIELDS"],
    functions: ["diffIrVersions", "canonicalJson"]
  });
}

function renderSandbox() {
  return buildSandbox(source, {
    consts: ["IR_DIFF_FIELDS"],
    functions: ["irDiffHtml", "diffIrVersions", "canonicalJson", "irDiffItemLabel", "irDiffScalar"],
    globals: { escapeHtml: (s) => String(s == null ? "" : s) }
  });
}

// A representative IR (the buildAgentRecipeIr return shape). `over` replaces field
// values without changing key order.
function ir(over = {}) {
  return {
    recipeScope: "step", targetSurface: "chatgptPrompt", deploymentLevel: "promptOnly", integrationMode: "none",
    baseName: "Summarise portfolio", artifactName: "Summarise portfolio - ChatGPT prompt",
    purpose: "Summarise", trigger: "User starts",
    inputs: ["a", "b"], outputs: ["o"], systemsMentioned: [], knowledgeSources: ["SharePoint"],
    rules: ["r1"], exceptions: [], humanReview: ["review"],
    dataSensitivity: "low", regulatoryContext: "",
    evidenceBackedFacts: [], designChoices: [], assumptions: [], knownGaps: [], blockedClaims: ["b"],
    testCases: [], doNotAutomateNotes: [], cautionFlags: [],
    policyCitations: [], appliedKnowledge: [], futureIntegrationCandidates: [],
    provenanceSummary: { evidenceBackedCells: 3, inferredCells: 1 },
    readinessScore: { score: 72, label: "Usable with caveats" },
    transition: { isTransition: false }, recommendationReason: "best fit",
    ...over
  };
}

const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach((k) => deepFreeze(o[k])); }
  return o;
};

test("identical IR versions diff to no changes", () => {
  const { diffIrVersions } = diffSandbox();
  const d = diffIrVersions(ir(), ir());
  assert.equal(d.changed, false);
  assert.deepEqual(d.fields, []);
});

test("a scalar field change is reported as changed with before/after", () => {
  const { diffIrVersions } = diffSandbox();
  const d = diffIrVersions(ir(), ir({ targetSurface: "customGPT", purpose: "Summarise v2" }));
  assert.equal(d.changed, true);
  const byField = Object.fromEntries(d.fields.map((f) => [f.field, f]));
  assert.equal(byField.targetSurface.kind, "changed");
  assert.equal(byField.targetSurface.before, "chatgptPrompt");
  assert.equal(byField.targetSurface.after, "customGPT");
  assert.equal(byField.purpose.kind, "changed");
});

test("string-array changes report sorted added/removed raw items", () => {
  const { diffIrVersions } = diffSandbox();
  const d = diffIrVersions(ir({ rules: ["r1", "r2"] }), ir({ rules: ["r2", "r3"] }));
  const f = d.fields.find((x) => x.field === "rules");
  assert.equal(f.kind, "changed");
  assert.deepEqual(f.addedItems, ["r3"]);
  assert.deepEqual(f.removedItems, ["r1"]);
  // Multiple additions come back sorted (order-stable).
  const d2 = diffIrVersions(ir({ inputs: ["a"] }), ir({ inputs: ["a", "z", "m"] }));
  assert.deepEqual(d2.fields.find((x) => x.field === "inputs").addedItems, ["m", "z"]);
});

test("a field added (empty→items) is 'added'; emptied (items→empty) is 'removed'", () => {
  const { diffIrVersions } = diffSandbox();
  const added = diffIrVersions(ir({ appliedKnowledge: [] }), ir({ appliedKnowledge: [{ name: "Credit framework", version: 1 }] }));
  const fa = added.fields.find((x) => x.field === "appliedKnowledge");
  assert.equal(fa.kind, "added");
  assert.equal(fa.addedItems.length, 1);
  assert.equal(fa.addedItems[0].name, "Credit framework", "raw object item is surfaced");

  const removed = diffIrVersions(ir({ knowledgeSources: ["SharePoint"] }), ir({ knowledgeSources: [] }));
  const fr = removed.fields.find((x) => x.field === "knowledgeSources");
  assert.equal(fr.kind, "removed");
  assert.deepEqual(fr.removedItems, ["SharePoint"]);
});

test("an object field change (readinessScore) is reported with before/after", () => {
  const { diffIrVersions } = diffSandbox();
  const d = diffIrVersions(ir(), ir({ readinessScore: { score: 80, label: "Ready for controlled use" } }));
  const f = d.fields.find((x) => x.field === "readinessScore");
  assert.equal(f.kind, "changed");
  assert.equal(f.before.score, 72);
  assert.equal(f.after.score, 80);
});

test("diff fields are emitted in canonical IR_DIFF_FIELDS order (order-stable)", () => {
  const { diffIrVersions } = diffSandbox();
  // Change three fields whose canonical order is targetSurface < rules < recommendationReason.
  const d = diffIrVersions(ir(), ir({ recommendationReason: "new reason", targetSurface: "customGPT", rules: ["r1", "rX"] }));
  assert.deepEqual(d.fields.map((f) => f.field), ["targetSurface", "rules", "recommendationReason"]);
});

test("the diff is deterministic — the same two versions always produce the same diff", () => {
  const { diffIrVersions } = diffSandbox();
  const a = ir({ inputs: ["a"] });
  const b = ir({ inputs: ["a", "b"], targetSurface: "customGPT", readinessScore: { score: 90, label: "Ready for controlled use" } });
  assert.deepEqual(diffIrVersions(a, b), diffIrVersions(a, b));
});

test("byte-stable: diffing mutates neither input IR", () => {
  const { diffIrVersions } = diffSandbox();
  const a = deepFreeze(ir());
  const b = deepFreeze(ir({ rules: ["r1", "r2"], targetSurface: "customGPT" }));
  const before = `${JSON.stringify(a)}|${JSON.stringify(b)}`;
  diffIrVersions(a, b); // deep-frozen inputs → any in-place mutation would throw
  assert.equal(`${JSON.stringify(a)}|${JSON.stringify(b)}`, before, "inputs unchanged");
});

test("comparison is key-order-insensitive (canonical) — reordered keys are not a change", () => {
  const { diffIrVersions } = diffSandbox();
  // Nested object field with keys in a different order.
  const d = diffIrVersions(
    ir({ provenanceSummary: { evidenceBackedCells: 3, inferredCells: 1 } }),
    ir({ provenanceSummary: { inferredCells: 1, evidenceBackedCells: 3 } })
  );
  assert.equal(d.changed, false, "nested key reorder is not a change");
  // Whole-IR top-level key scramble, same content → still no change.
  const base = ir();
  const scrambled = {};
  Object.keys(base).reverse().forEach((k) => { scrambled[k] = base[k]; });
  assert.equal(diffIrVersions(base, scrambled).changed, false, "top-level key order is irrelevant");
});

test("the diff path calls no model, never re-derives an IR, and writes nothing", () => {
  for (const name of ["diffIrVersions", "canonicalJson", "irDiffHtml", "irDiffItemLabel", "irDiffScalar"]) {
    const body = extractFunction(source, name);
    assert.ok(!/buildAgentRecipeIr/.test(body), `${name} must not re-derive an IR`);
    assert.ok(!/requestJson|\bfetch\s*\(|\/api\//.test(body), `${name} must not call the server/model`);
    assert.ok(!/patchField|rotateArtifactSnapshot|persistState|compileArtifactForStep/.test(body), `${name} must not write or recompute`);
  }
});

test("irDiffHtml renders 'No IR changes' for identical versions and the field name when changed", () => {
  const { irDiffHtml } = renderSandbox();
  assert.ok(irDiffHtml(ir(), ir()).includes("No IR changes"));
  const html = irDiffHtml(ir(), ir({ targetSurface: "customGPT" }));
  assert.ok(html.includes("targetSurface"));
  assert.ok(/added|removed|changed/.test(html));
});

test("byte-identical-when-no-prior: artifactSnapshotHtml emits no diff/prior section without a prior", () => {
  const sandbox = buildSandbox(source, {
    consts: ["IR_DIFF_FIELDS"],
    functions: ["artifactSnapshotHtml", "irDiffHtml", "diffIrVersions", "canonicalJson", "irDiffItemLabel", "irDiffScalar"],
    globals: {
      escapeHtml: (s) => String(s == null ? "" : s),
      artifactSnapshotMeta: () => ({ artifactLabel: "L", readinessLabel: "Ready for controlled use", readinessScore: 80, when: "", content: "preview" }),
      artifactReadinessBadgeClass: () => "ds-badge-teal",
      shortArtifactPreview: (c) => String(c == null ? "" : c),
      state: { artifactCompiler: { reviewed: {} } }
    }
  });
  const snap = { id: "s1", package: { ir: ir() } };
  const priorSnap = { id: "s0", package: { ir: ir({ targetSurface: "customGPT" }) } };
  const noPrior = sandbox.artifactSnapshotHtml(snap, null, "empty");
  const withPrior = sandbox.artifactSnapshotHtml(snap, priorSnap, "empty");
  assert.ok(!noPrior.includes("IR changes vs previous version"), "no IR-diff section without a prior");
  assert.ok(!noPrior.includes("Previous artifact preserved"), "no prior section without a prior");
  assert.ok(withPrior.includes("IR changes vs previous version"), "IR-diff section appears once a prior IR exists");
});
