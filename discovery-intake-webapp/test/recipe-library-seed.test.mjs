// Step L — trusted recipe library seed + the library/generation source flip. Executed,
// deterministic tests (NO model call — the boundary matches captured SHAPE against a loaded
// seed and CONSUMES the Leverage Map's per-seam signal; it does not re-detect or score).
// Covers: the pure matcher ranks fitting library recipes by leverage, respects unit-kind
// (a span entry fits a connection unit) and the human-hold gate; recipeUnitSource flips a
// matched unit to origin:"library" carrying the seed's confirmed bit (never auto-hardens);
// an unmatched unit OR an unloaded library falls through to the UNCHANGED generation path
// (never a dead end); the human-hold is INHERITED on a LIBRARY recipe (assist+approve, the
// reserved Human Pink, never "eliminate"); the boundary stays the single swap point and
// recipeForStep is NOT rerouted; and the SHIPPED seed file is reconciled to the detector's
// REAL signal vocabulary (motivators / HANDOFF_KINDS / structural enums), ships entirely
// confirmed:false, reads assist-not-replace, and carries no banned economics token.
// Real shipped source extracted/evaluated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = JSON.parse(readFileSync(path.join(__dirname, "..", "recipe-library-seed.json"), "utf8"));

// Permits "leverage" (the signal this view consumes); bans the economics family.
const FORBIDDEN = /headcount|\bFTE\b|full-time equivalent|automat|\bROI\b|hours? saved|time saved|\bopportunity\b/i;
const HUMAN_PINK = /#FF4FD8/i;

// The detector's REAL vocabulary (the seed's match signatures must reconcile to THIS).
const REAL = {
  STEP_TYPE_OPTIONS: ["decision", "handoff", "data-op", "judgment", "review"],
  DECISION_KINDS: ["approval", "routing", "prioritization", "exception-handling", "judgment-call"],
  FRICTION_KINDS: ["manual-entry", "system-switching", "rework", "waiting", "error-prone"],
  ROLE_VALUES: ["operations", "analysis", "review-approval", "client-facing", "project-management", "specialist", "support"],
  HANDOFF_KINDS: ["role-to-role", "human-to-system", "system-to-human", "system-to-system"],
  MOTIVATORS: ["shared-tool", "manual-channel", "system-switching", "transition"]
};

const tag = (value, src) => ({ value, source: src });
// A shaped grid step (cells carry {value}); the connection view reads tool + handoff.
const GS = (id, opts = {}) => ({ id, name: opts.name || id, cells: { systemsTools: { value: opts.tool || "" }, handoff: { value: opts.channel || "" }, humanCheckpoint: { value: opts.checkpoint || "" } } });

function sandbox({ recipeCache = {}, library = [], steps = [], stepTypes = {}, frictionTags = {}, roleTags = {}, handoffTags = {}, decisionTags = {} } = {}) {
  const state = { recipeCache, recipeBookView: "connection", stepTypes, frictionTags, roleTags, handoffTags, decisionTags };
  return buildSandbox(source, {
    consts: [
      "STEP_TYPE_OPTIONS", "FRICTION_KINDS", "ROLE_VALUES", "DECISION_KINDS", "HANDOFF_KINDS",
      "LEVERAGE_HUE", "LEVERAGE_LEVELS", "LEVERAGE_SHADE", "HUMAN_HOLD_HUE", "HEATMAP_STATE_DOTS",
      "RECIPE_STATUS_RAIL", "RECIPE_STATUS_META", "LIBRARY_LEVERAGE_RANK"
    ],
    functions: [
      "recipeUnitSource", "recipeUnitShape", "matchLibraryRecipes", "connectionToolTokens",
      "recipeUnitConfidence", "recipeConnectionSeams", "recipeForConnection", "recipeBookByConnection",
      "recipeBookConnectionCardHtml",
      "buildWorkflowLeverage", "leverageSeamMotivators", "seamMotivatorPhrase", "leverageToolTokens",
      "leverageManualChannel", "leverageLevelFor", "leverageStepHumanHeld", "leverageTileHtml",
      "structuralTagOf", "isInAllowedSet", "leastAssertedState", "provenanceToState", "handoffId",
      "heatmapSourceDot", "escapeHtml", "recipeStatusChipHtml", "recipeProvChipHtml"
    ],
    globals: {
      state,
      recipeLibrarySeed: library, // the loaded library is injected the way the boundary reads it
      analysisGridSteps: () => steps,
      gridCellValue: (step, key) => ((step && step.cells && step.cells[key] && step.cells[key].value) || ""),
      stepDisplayName: (step, i) => (step && step.name) || `Step ${i + 1}`
    }
  });
}

// A free seam with a shared tool (motivators ["shared-tool"], not human-held).
const FREE_SHARED = [GS("s1", { name: "Pull", tool: "Excel" }), GS("s2", { name: "Post", tool: "Excel" })];

test("matchLibraryRecipes is PURE and ranks fitting recipes by leverage (hi > md > lo); a span entry fits a connection unit", () => {
  const sb = sandbox();
  const lib = [
    { id: "a-lo", unit_kind: "connection", leverage: "lo", human_held: false, match: { motivators: ["manual-channel"] }, recipe: "lo", confirmed: false },
    { id: "b-hi", unit_kind: "connection", leverage: "hi", human_held: false, match: { motivators: ["manual-channel"] }, recipe: "hi", confirmed: false },
    { id: "c-md", unit_kind: "span", leverage: "md", human_held: false, match: { motivators: ["manual-channel"] }, recipe: "md", confirmed: false }
  ];
  const shape = { kind: "connection", motivators: ["manual-channel", "system-switching"], handoffKind: null, humanHeld: false, toolTokens: [] };
  assert.deepEqual(sb.matchLibraryRecipes(shape, lib).map((r) => r.id), ["b-hi", "c-md", "a-lo"], "ranked hi>md>lo; the span entry fits the connection unit");

  // a step entry never fits a connection unit; an empty/absent library yields nothing
  assert.deepEqual(sb.matchLibraryRecipes(shape, [{ id: "s", unit_kind: "step", leverage: "hi", match: { step_type: "data-op" }, recipe: "x", confirmed: false }]), []);
  assert.deepEqual(sb.matchLibraryRecipes(shape, []), []);
  assert.deepEqual(sb.matchLibraryRecipes(null, lib), []);
});

test("matchLibraryRecipes requires every DECLARED signal and never matches on unit-kind alone", () => {
  const sb = sandbox();
  const shape = { kind: "connection", motivators: ["shared-tool"], handoffKind: "role-to-role", humanHeld: true, toolTokens: [] };
  // all declared signals present => fit
  assert.equal(sb.matchLibraryRecipes(shape, [{ id: "ok", unit_kind: "connection", leverage: "md", human_held: true, match: { motivators: ["shared-tool"], handoff_kind: "role-to-role" }, recipe: "r", confirmed: false }]).length, 1);
  // a declared motivator that is absent => no fit
  assert.equal(sb.matchLibraryRecipes(shape, [{ id: "no", unit_kind: "connection", leverage: "hi", human_held: true, match: { motivators: ["transition"] }, recipe: "r", confirmed: false }]).length, 0);
  // a declared handoff_kind that differs => no fit
  assert.equal(sb.matchLibraryRecipes(shape, [{ id: "no2", unit_kind: "connection", leverage: "hi", human_held: true, match: { motivators: ["shared-tool"], handoff_kind: "system-to-system" }, recipe: "r", confirmed: false }]).length, 0);
  // an entry that declares nothing matchable never matches on unit-kind alone
  assert.equal(sb.matchLibraryRecipes(shape, [{ id: "bare", unit_kind: "connection", leverage: "hi", match: {}, recipe: "r", confirmed: false }]).length, 0);
});

test("recipeUnitSource FLIPS a matched connection to origin:'library' and carries the seed's confirmed bit (never auto-hardens)", () => {
  const library = [{ id: "lib-shared", unit_kind: "connection", leverage: "hi", human_held: false, match: { motivators: ["shared-tool"] }, recipe: "AI carries the shared-tool work.", confirmed: false }];
  const src = sandbox({ steps: FREE_SHARED, library }).recipeUnitSource("h:s1>s2");
  assert.equal(src.origin, "library", "a fitting library recipe flips the origin to library");
  assert.equal(src.text, "AI carries the shared-tool work.");
  assert.equal(src.confirmed, false, "an unconfirmed seed stays confirmed:false (never auto-hardens)");

  // a confirm-passed seed flows confirmed:true THROUGH the boundary (the mechanism carries it)
  const confirmedLib = [{ ...library[0], confirmed: true }];
  assert.equal(sandbox({ steps: FREE_SHARED, library: confirmedLib }).recipeUnitSource("h:s1>s2").confirmed, true);
});

test("generation fallback is UNCHANGED: no library, OR a loaded library with no fit, leaves the generated recipe in place — and is never a dead end", () => {
  // (a) no library loaded => the existing generation cache path, origin:"generation"
  const g = sandbox({ steps: FREE_SHARED, recipeCache: { "h:s1>s2": "generated recipe" } }).recipeUnitSource("h:s1>s2");
  assert.equal(g.origin, "generation");
  assert.equal(g.text, "generated recipe");
  assert.equal(g.confirmed, false);

  // (b) a library is loaded but nothing fits this shape => still the generated recipe
  const noFit = [{ id: "x", unit_kind: "connection", leverage: "hi", human_held: false, match: { motivators: ["transition"] }, recipe: "nope", confirmed: false }];
  const g2 = sandbox({ steps: FREE_SHARED, library: noFit, recipeCache: { "h:s1>s2": "generated recipe" } }).recipeUnitSource("h:s1>s2");
  assert.equal(g2.origin, "generation", "a non-fitting library never overrides the generated recipe");

  // (c) no fit AND no cached generation => null (the card renders the add state — never a dead end)
  assert.equal(sandbox({ steps: FREE_SHARED, library: noFit }).recipeUnitSource("h:s1>s2"), null);
  assert.equal(sandbox({ steps: FREE_SHARED }).recipeUnitSource("h:s1>s2"), null, "byte-identical to the pre-library behavior when unused");
});

test("HUMAN-HOLD is INHERITED on a LIBRARY recipe (end-to-end through the real detector + the SHIPPED seed): assist+approve, reserved Human Pink, never 'eliminate'", () => {
  // s1 -> s2 with a role-to-role handoff tag (=> a 'transition' motivator) and an `approval`
  // decision on s2 (=> the seam is human-held). The real buildWorkflowLeverage marks the
  // seam; the boundary matches a HELD library recipe; recipeForConnection inherits the hold.
  const sb = sandbox({
    steps: [GS("s1", { name: "Prepare", tool: "Excel" }), GS("s2", { name: "Approve", tool: "Excel" })],
    handoffTags: { "h:s1>s2": tag("role-to-role", "user-stated") },
    decisionTags: { s2: tag("approval", "user-stated") },
    library: SEED.entries
  });
  const rows = sb.recipeBookByConnection();
  assert.equal(rows.length, 1, "the role-to-role handoff earns the seam");
  const r = rows[0].recipe;
  assert.equal(r.origin, "library", "the held approval seam matched a trusted-library recipe");
  assert.equal(r.humanHeld, true, "the approval decision on the adjacent step => human-held");
  assert.match(r.assist, /AI packages, drafts, and routes the handoff; the person approves/, "assist+verify framing");
  assert.ok(!/eliminate/i.test(r.assist), "the assist line never says 'eliminate'");
  assert.ok(!/eliminate/i.test(r.value), "the matched library recipe text never says 'eliminate'");
  assert.match(r.value, /the person approves|Never removes the sign-off|the person decides|the person makes/, "the held library recipe is assist-not-replace");
  assert.equal(r.status, "proposed", "an unconfirmed library recipe reads proposed (AI grey)");
  assert.equal(r.source, "ai-inferred", "never auto-hardens to user-stated");

  // the card wears the reserved Human Pink and the human-hold badge
  const card = sb.recipeBookConnectionCardHtml(rows[0]);
  assert.match(card, HUMAN_PINK, "a human-held connection wears the reserved Human Pink");
  assert.match(card, /human-hold/);
});

test("the human-hold GATE holds both ways: a held recipe never attaches to a free seam, and a free recipe never attaches to a held seam", () => {
  // free seam, library has ONLY a held entry that would otherwise match on motivators => no fit
  // (the human-hold is a hard gate inside `match`, mirroring the shipped seed's structure).
  const heldOnly = [{ id: "h", unit_kind: "connection", leverage: "hi", match: { motivators: ["shared-tool"], human_held: true }, recipe: "held", confirmed: false }];
  assert.equal(sandbox({ steps: FREE_SHARED, library: heldOnly }).recipeUnitSource("h:s1>s2"), null, "a held recipe never lands on a free seam");

  // held seam, library has ONLY a free entry that would otherwise match on motivators => no fit
  const freeOnly = [{ id: "f", unit_kind: "connection", leverage: "hi", match: { motivators: ["shared-tool"], human_held: false }, recipe: "free", confirmed: false }];
  const heldSeam = sandbox({
    steps: [GS("s1", { tool: "Excel" }), GS("s2", { name: "Approve", tool: "Excel" })],
    decisionTags: { s2: tag("approval", "user-stated") },
    library: freeOnly
  });
  assert.equal(heldSeam.recipeUnitSource("h:s1>s2"), null, "a free recipe never lands on a held seam (the approval gate is preserved)");
});

test("the boundary stays the SINGLE swap point: recipeUnitSource keeps the generation path; recipeForConnection routes through it; recipeForStep is NOT rerouted", () => {
  const boundary = extractFunction(source, "recipeUnitSource");
  assert.ok(/state\.recipeCache/.test(boundary), "the generation fallback still reads the cache");
  assert.ok(/origin: "generation"/.test(boundary), "the generation origin is preserved");
  assert.ok(/origin: "library"/.test(boundary), "the new library tier is added (not a replacement)");

  const forConn = extractFunction(source, "recipeForConnection");
  assert.ok(/recipeUnitSource\(connId\)/.test(forConn), "recipeForConnection still resolves THROUGH the boundary, unchanged");
  assert.ok(!/recipeCache/.test(forConn), "recipeForConnection never reads the cache or the library directly");

  const forStep = extractFunction(source, "recipeForStep");
  assert.ok(/state\.recipeCache/.test(forStep), "recipeForStep keeps its own generation path (not rerouted)");
  assert.ok(!/recipeUnitSource/.test(forStep), "recipeForStep does not route through the connection boundary");
});

test("the SHIPPED seed is reconciled to the detector's REAL vocabulary, ships confirmed:false, and reads assist-not-replace with no banned tokens", () => {
  // the real vocab is pinned against the live source, so the seed cannot silently drift
  for (const [name, vals] of Object.entries({ STEP_TYPE_OPTIONS: REAL.STEP_TYPE_OPTIONS, FRICTION_KINDS: REAL.FRICTION_KINDS, ROLE_VALUES: REAL.ROLE_VALUES, DECISION_KINDS: REAL.DECISION_KINDS, HANDOFF_KINDS: REAL.HANDOFF_KINDS })) {
    const c = extractConst(source, name);
    for (const v of vals) assert.ok(c.includes(`"${v}"`), `${name} pins ${v}`);
  }

  assert.ok(Array.isArray(SEED.entries) && SEED.entries.length >= 1, "the seed ships entries");
  for (const e of SEED.entries) {
    assert.equal(e.confirmed, false, `${e.id} ships confirmed:false (authored, not confirm-passed)`);
    assert.equal(e.source, "example", `${e.id} provenance is honest (example until a real confirm-pass)`);
    assert.ok(["step", "connection", "span"].includes(e.unit_kind), `${e.id} has a valid unit_kind`);
    assert.ok(["lo", "md", "hi"].includes(e.leverage), `${e.id} leverage is lo/md/hi (never a percent)`);
    assert.ok(typeof e.recipe === "string" && e.recipe.length > 0, `${e.id} has recipe text`);
    assert.ok(!FORBIDDEN.test(e.recipe), `${e.id} recipe carries no banned economics token`);

    const m = e.match;
    assert.ok(m && typeof m === "object", `${e.id} has a match signature`);
    // the descriptive EXAMPLE keys must be gone — reconciled to real shape inputs
    for (const stale of ["signals", "transition_kind", "adjacent_step_types", "decision_tag", "role_any"]) {
      assert.ok(!(stale in m), `${e.id} reconciled: the descriptive '${stale}' key is gone`);
    }
    if (Array.isArray(m.motivators)) for (const k of m.motivators) assert.ok(REAL.MOTIVATORS.includes(k), `${e.id} motivator '${k}' is a real detector signal`);
    if (typeof m.handoff_kind === "string") assert.ok(REAL.HANDOFF_KINDS.includes(m.handoff_kind), `${e.id} handoff_kind is a real HANDOFF_KIND`);
    if (typeof m.step_type === "string") assert.ok(REAL.STEP_TYPE_OPTIONS.includes(m.step_type), `${e.id} step_type is a real STEP_TYPE_OPTION`);
    if (typeof m.friction === "string") assert.ok(REAL.FRICTION_KINDS.includes(m.friction), `${e.id} friction is a real FRICTION_KIND`);
    if (typeof m.role === "string") assert.ok(REAL.ROLE_VALUES.includes(m.role), `${e.id} role is a real ROLE_VALUE`);
    if (typeof m.decision === "string") assert.ok(REAL.DECISION_KINDS.includes(m.decision), `${e.id} decision is a real DECISION_KIND`);

    if (e.human_held) {
      assert.ok(!/eliminate/i.test(e.recipe), `${e.id} held recipe never says 'eliminate'`);
      assert.ok(/approv|decid|assess|the person/i.test(e.recipe), `${e.id} held recipe keeps the person in the loop`);
    }
  }
});

test("rails: the boundary + matcher functions carry no banned economics token, reuse the reserved Human Pink (no new hex), and permit 'leverage'", () => {
  for (const fn of ["recipeUnitSource", "recipeUnitShape", "matchLibraryRecipes", "connectionToolTokens", "loadRecipeLibrarySeed"]) {
    assert.ok(!FORBIDDEN.test(extractFunction(source, fn)), `${fn} carries no banned economics token`);
  }
  assert.ok(extractConst(source, "HUMAN_HOLD_HUE").includes("#FF4FD8"), "the human-hold hue is the reserved Human Pink (no new hex minted)");
  assert.ok(/leverage/i.test(extractFunction(source, "matchLibraryRecipes")), "'leverage' framing is permitted and used");
});

test("the seed is loaded from a SEPARATE data file (not inlined) and the boundary never persists it to state", () => {
  // the loader fetches the separate file and validates entries; the array is module-level
  const loader = extractFunction(source, "loadRecipeLibrarySeed");
  assert.ok(/fetch\("\.\/recipe-library-seed\.json"/.test(loader), "the seed is fetched from a separate data file");
  assert.ok(/recipeLibrarySeed = entries\.filter/.test(loader), "loaded entries are validated, not trusted blindly");
  // the library is NOT a field on `state`, so persistState (JSON.stringify(state)) can't embed it
  const boundary = extractFunction(source, "recipeUnitSource");
  assert.ok(/typeof recipeLibrarySeed/.test(boundary), "the boundary reads the module-level library slot, not state");
  assert.ok(!/state\.recipeLibrary/.test(source), "the seed library is never stored on state (kept out of the session blob)");
});
