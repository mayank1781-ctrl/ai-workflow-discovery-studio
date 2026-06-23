# Phase 6 Progress

Phase 6 turns the app from "classified workflow steps" into "policy-aware AI
placement and economics at the right grain." Build order: **P6-0** data
contract → P6-1 work intent → P6-2 substep decomposition → P6-3 policy upload →
P6-4 unit economics → P6-5 dashboards → P6-6 eval & rails.

---

## P6-0 · Flexible Work Graph Data Contract (schema design)

**Status:** COMPLETE
**Gate:** 1424/0 (+37 tests over the Phase 5 seal gate of 1387/0)
**Eval:** unchanged (no eval-set or engine changes in P6-0)
**Review:** adversarially reviewed (3 lenses, each finding skeptic-verified); 2
confirmed findings fixed before commit — see "Adversarial review hardening".

---

### What was built

A **pure, additive schema layer** that defines the common *work item* contract
and a *flexible work graph* so the later Phase 6 items (work intent, substep
decomposition, policy guardrails, unit economics, dashboards) have a single,
provenance-aware shape to build on. Nothing is mounted into the UI yet — this is
schema design with tests, by design.

The contract supports a flexible graph rather than a rigid hierarchy. All four
paths validate, and intermediate levels may be skipped or collapsed:

```
workflow -> activity/stage -> step -> substep/workAction
workflow -> step -> workAction              (activity skipped)
workflow -> activity/stage -> workAction    (step skipped)
workflow -> workAction                      (both skipped)
```

A child must sit **deeper** than its parent (gaps allowed, inversion refused);
`stage` folds to the canonical `activity` level so the two never diverge.

### Trust rules encoded (the dominant product principle)

- Every relied-on field carries a `{value, source, confidence}` provenance triple.
- **Suggested/modelled children are draft-only.** A modelled item can never be
  born confirmed (coerced to `suggested`), never overwrites an explicit child
  (`reconcileSuggestedChildren` refuses any id- *or* label-collision), and never
  counts in official rollups.
- **Official rollups stay confirmed-only.** The count gate *delegates* the
  confirmed-ness check to the existing Phase 5 confirmation gate (passed in as a
  function) — never re-implemented — **and** additionally requires every
  mandatory safety field to be present, so a confirmed unit still missing a
  safety field is not counted. The rollup counts only the **lowest** confirmed
  level on a branch, so substeps never double-count against their step.
- **66% functional-draft threshold** makes compound work usable for *planning*,
  but the six mandatory safety fields still gate official use. A high percentage
  never bypasses a missing safety field (proven by explicit trust-invariant
  tests: 88% with a missing decision-owner is **not** functional-draft-ready;
  and a *confirmed* item missing a safety field is **not** counted).

### Changed files

| File | Change |
|---|---|
| `app.js` | the P6-0 contract block, appended after the V3-1 telemetry block. No existing line changed. |
| `test/p6-0-schema.test.mjs` | 37 focused tests (new file) |
| `PHASE6_PROGRESS.md` | this doc (new file) |

### Contract surface (all top-level, pure, in `app.js`)

| Symbol | Purpose |
|---|---|
| `WORK_ITEM_LEVELS` | ordered ladder `workflow, activity, step, substep, workAction` (index = depth rank) |
| `WORK_ITEM_LEVEL_ALIASES` | `stage` → `activity` |
| `WORK_ITEM_RELATIONSHIPS` | edge kinds: parent-child, sequence, handoff, same-system, same-capability, evidence-dependency, policy-dependency |
| `WORK_ITEM_CONFIRM_STATES` | `suggested` / `captured` / `confirmed` (posture; distinct from the engine gate) |
| `WORK_ITEM_ORIGINS` | `captured` / `modelled` |
| `WORK_ITEM_COMPLETENESS_BANDS` | captured-only / directional / functional-draft / high-confidence-draft / portfolio-counted |
| `WORK_ITEM_FUNCTIONAL_DRAFT_PCT` | `66` |
| `WORK_ITEM_RELIED_FIELDS` | the 12 provenance-carrying fields |
| `WORK_ITEM_MANDATORY_FIELDS` | the 6 safety groups (control OR policyCap satisfies one) |
| `WORK_ITEM_OPTIONAL_FIELDS` | the 5 enrichment groups |
| `WORK_ITEM_FIELD_META` | plain-language next-action hints per field |
| `normalizeWorkItemLevel` / `workItemLevelRank` | level canonicalization + depth rank |
| `workItemField` / `workItemFieldPresent` | provenance triple constructor + presence test |
| `workItemProvenanceRollup` | least-asserted provenance + min confidence across present fields |
| `makeWorkItem` | normalized work-item constructor (modelled → suggested coercion) |
| `markSuggestedWorkAction` | forces a draft child (level workAction, origin modelled, suggested) |
| `makeWorkRelation` | validated relationship edge |
| `validateWorkItem` / `validateWorkGraph` | structural integrity (levels, ordering, cycles, relations) |
| `workItemCompleteness` | `{pct, label, bandId, missingRequired, missingOptional, mandatoryGatePassed, counted}` |
| `workItemFunctionalDraftReady` | `pct >= 66 && mandatoryGatePassed` |
| `reconcileSuggestedChildren` | explicit wins; suggestions never overwrite |
| `rollupCountableItems` | confirmed-only, no double-count; gate delegated |
| `workGraphFromSteps` | read-only projector from the existing flat step list |

### Completeness math

Mandatory groups weight 2×, optional 1×. Denominator = 6·2 + 5·1 = 17. All six
mandatory present, zero optional → 12/17 → **71% (functional draft, gate
passed)** — matching the Phase 6 plan's worked example. Fully populated → 100%
(portfolio-counted band).

### Rules observed

- **Pure + additive:** no existing line changed; the block is not referenced
  anywhere else in `app.js`. With no caller the app is byte-identical to the
  Phase 5 seal.
- **No engine fork:** domain vocab (class/tier/verb/shape/reachability) stays
  owned by `studio_engine.mjs`; P6-0 carries those values with provenance and
  does not re-validate them.
- **Phase 5 untouched:** the confirmation gate (`recipeGateCheck`,
  `isUnitConfirmed`, `confirmedView`, `hardenedRecipeSpec`, `confirmUnit`), the
  P5-3 ladder, the P5-4 placement explainer, and the P5-1 modeled fallback are
  unchanged. A test asserts no Phase 5 / gate function references any P6-0 symbol.
- **Rail-clean:** every contract function body is free of headcount / FTE /
  eliminate / automate / workforce-reduction framing (source-level test).

### Adversarial review hardening

A 3-lens adversarial review (trust model / correctness / additivity-rails), with
every finding independently skeptic-verified, confirmed two genuine defects that
were fixed before commit:

1. **`counted` could ignore the mandatory safety gate** — a confirmed item
   missing a mandatory safety field could read `counted=true`, contradicting the
   trust principle. Fixed: `counted` now also requires `mandatoryGatePassed`.
   Regression test added.
2. **`NaN` counted as a present field** — `typeof NaN === "number"` let a
   NaN-valued mandatory field pass the gate. Fixed:
   `workItemFieldPresent` returns `!Number.isNaN(v)` for numbers. Test added.

### What was intentionally NOT touched

- No UI mount, no Workbench/Process Map/Dashboard wiring (that is P6-1+).
- No changes to `server.mjs`, `studio_engine.mjs`, `index.html`, or any sidecar
  in `defaultState` / `normalizeLoadedState` (the contract carries no persisted
  runtime state in P6-0).
- No policy upload (P6-3) and no unit economics (P6-4) — deferred until P6-0 is
  sealed, per the handoff.

### Verification

```bash
node --check app.js      # OK (exit 0)
node --check server.mjs  # OK (exit 0)
npm test                 # tests 1424 / pass 1424 / fail 0 (exit 0)
```

---

## P6-0A · Schema alignment patch (workIntent + previewEligible)

**Status:** COMPLETE
**Gate:** 1433/0 (+9 tests over P6-0's 1424/0)
**Scope:** schema-contract alignment only — no UI, no policy upload, no unit
economics, no dashboard surfacing.

A small alignment of the P6-0 contract to the updated product rule.

### Changed

- **`workIntent` added to the work-item contract** as a separate relied-on,
  provenance-carrying axis — kept distinct from `class` (who owns), the V3-15
  typology / `stepType` (broad structural shape), and `actionVerb` (concrete
  operation). It is descriptive enrichment, intentionally **not** a mandatory
  safety field and **not** in the completeness gate groups, so the completeness
  denominator (and the 71% / 88% / 100% examples) is unchanged. The projector
  reads `step.workIntent` forward-compatibly (empty until P6-1 populates it).
- **`previewEligible` added to `workItemCompleteness`** — expresses the surfacing
  tiers without conflating them:
  - 66–79% functional draft → draft planning views only (**not** preview-eligible).
  - 80–94% high-confidence draft → provisional on Portfolio Preview / heatmap /
    constellation / roadmap (**preview-eligible**, still not official).
  - 95–100% + engine gate → Portfolio Counted / official / export-ready.
  `previewEligible = pct >= 80 && mandatoryGatePassed && not modelled/suggested`,
  independent of confirmed-ness, so it can be true while `counted` is false.
- **`counted` unchanged and still strict** — confirmed gate + mandatory safety
  fields + not modelled/suggested. No draft / modelled / suggested / inferred
  value reaches official counted totals.

### Tests added (9, in `test/p6-0-schema.test.mjs`)

`previewEligible` present in the return; an 80–94% draft is preview-eligible
while not counted; `previewEligible` true while `counted` false; 66–79% is not
preview-eligible; a missing mandatory safety field blocks both preview and
counting; modelled/suggested drafts are never preview-eligible; official counted
still requires confirmed + gate + mandatory; `workIntent` is separate from
`class`, `actionVerb`, and the typology sidecar.

### What was intentionally NOT touched (P6-0A)

- No UI mount, no Portfolio Preview / heatmap / constellation / roadmap wiring
  (P6-5). `previewEligible` is a pure signal only.
- No change to the completeness percentage math, bands, the confirmation gate,
  `server.mjs`, `studio_engine.mjs`, `index.html`, or any Phase 5 function.

### Verification (P6-0A)

```bash
node --check app.js      # OK (exit 0)
node --check server.mjs  # OK (exit 0)
npm test                 # tests 1433 / pass 1433 / fail 0 (exit 0)
```

---

## P6-1 · Work Intent / Step Function tags

**Status:** COMPLETE
**Gate:** 1450/0 (+17 tests over P6-0A's 1433/0)
**Scope:** the work-intent capture axis only — no substep decomposition (P6-2),
no policy upload (P6-3), no unit economics (P6-4), no portfolio preview / dashboard
surfacing (P6-5).

A new reviewable **work-intent** axis — *what the work is doing* — built by
mirroring the existing V3-15 step-typology machinery exactly.

### What was built

- **Controlled 17-value vocabulary** (`WORK_INTENT_OPTIONS`): retrieve, extract,
  validate, reconcile, calculate, draft, summarize, classify, route, monitor,
  notify, escalate, approve, release, attest, advise, negotiate.
- **Reviewable sidecar** `state.workIntents` keyed by `step.id` →
  `{ value, source, confidence }` (same shape as `stepTypes`). Manual pick →
  `user-stated`; AI suggest → `ai-inferred`; `confirmWorkIntent` promotes
  inferred → user-stated; `rejectWorkIntent` clears. An ai-inferred tag **never
  auto-hardens** (`normalizeLoadedState` backfills `{}` and passes the sidecar
  through unchanged — never rewrites to user-stated). Persist/load safe.
- **Workbench surface** in the per-step composite badge (beside the typology
  controls): current value, inferred-vs-confirmed state, confidence/provenance
  badge, a manual `<select>`, a *Suggest (AI)* button, and confirm/reject
  affordances that appear **only** for ai-inferred suggestions.
- **AI-suggest endpoint** `/api/suggest-work-intent` (`handleSuggestWorkIntent`)
  — a narrow descriptive classifier: key-gated (400 offline), taxonomy-validated
  server-side, graceful on every failure (`{ value: null }`), and **no scoring /
  opportunity / ROI**. A compound step returns `{ value: null, multiIntent: true }`.

### Safety / trust rules encoded

- **Off-taxonomy / empty / malformed suggestion writes nothing** — validated both
  server-side and in `applyWorkIntentSuggestion` before any key is written.
- **No multi-intent parent tagging** — if a step looks like it performs several
  intents, the app surfaces *"likely needs decomposition before tagging"* and
  writes nothing. P6-2 (decomposition) is **not** implemented here.
- **Kept distinct from** `class` (who owns), the V3-15 typology / `stepType`
  (broad structural shape), and the action verb (concrete operation) — a separate
  sidecar, separate functions, separate render label.
- **Never feeds official logic yet** — work intent does not touch the opportunity
  score, the scorers, the confirmation/engine gate, or any counted rollup
  (proven functionally and at the source level).

### Changed files

| File | Change |
|---|---|
| `app.js` | `state.workIntents` in `defaultState` + backfill in `normalizeLoadedState`; the P6-1 lifecycle/render/wiring block (mirrors V3-15); one mount in `stepCompositeBadgeHtml`; one `wireWorkIntent` call beside `wireStepTypology` |
| `server.mjs` | `handleSuggestWorkIntent` + `WORK_INTENT_VALUES` + `WORK_INTENT_SYSTEM_PROMPT` + the `/api/suggest-work-intent` route |
| `test/p6-1-work-intent.test.mjs` | 17 focused tests (new) |
| `test/trust-legibility.test.mjs` | one added stub (`stepWorkIntentHtml: () => ""`) — the badge sandbox now stubs the new dimension, same as the other four |

### Adversarial review

Reviewed across two lenses (trust/rails + correctness/additivity), each finding
skeptic-verified. One actionable item — a missing explicit test for a
single-element-array suggestion (`{ value: ["retrieve"] }`), which the code
already rejects — was added as a regression guard. Two further findings were
verified `isReal=false` (the `workGraphFromSteps` projector reading
`step.workIntent` is a harmless prospective P6-0 note with no production caller;
`workIntent`'s placement in the P6-0 contract is correct intentional design).

### What was intentionally NOT touched

- No substep decomposition (P6-2), policy upload (P6-3), unit economics (P6-4),
  or portfolio preview / dashboard surfacing (P6-5).
- No change to `index.html`, `studio_engine.mjs`, the scorers
  (`getStepOpportunityMeta` / `scoreRecipeReadiness` / `stepTrustSignals`), the
  confirmation/engine gate, or the P6-0/P6-0A work-graph contract.

### Verification (P6-1)

```bash
node --check app.js      # OK (exit 0)
node --check server.mjs  # OK (exit 0)
npm test                 # tests 1450 / pass 1450 / fail 0 (exit 0)
```
