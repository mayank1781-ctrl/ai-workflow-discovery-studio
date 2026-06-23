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
