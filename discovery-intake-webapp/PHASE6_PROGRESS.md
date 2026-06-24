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

---

## P6-2 · Substep / work-action decomposition (suggestion only)

**Status:** COMPLETE
**Gate:** 1465/0 (+15 tests over P6-1's 1450/0)
**Scope:** decomposition suggestion only — no policy upload (P6-3), no unit
economics (P6-4), no dashboard / portfolio-preview surfacing (P6-5), and no
remote assumptions (deterministic, no server endpoint).

Turn a broad/compound parent step into a small set of **suggested** child work
actions, built on the P6-0 flexible work graph, the P6-1 work-intent axis, and the
P5-4A compound-step detector.

### What was built

- **Detection reuses P5-4A** — suggestions appear only for steps `detectCompoundStep`
  flags as compound.
- **`buildSuggestedSubsteps(step)`** — a **deterministic**, grounded suggester
  (`SUBSTEP_TEMPLATES`): each candidate child is emitted only when its triggering
  captured signal (systems, data processing, rules, exceptions, handoff, human
  checkpoint, output) is present, so nothing is fabricated for a step with no
  evidence. Each child is created via **`markSuggestedWorkAction`** (origin
  `modelled`, confirmationState `suggested`) and carries the P6-0/P6-1 contract:
  id, parentId, level, label, workIntent, actionVerb, class, systems, dataTier,
  entitlement, control + policyCap placeholders, decisionOwnership — every relied
  field an `ai-inferred`, low-confidence provenance triple.
- **`decomposeStep(step)`** — assembles parent + explicit children (from captured
  `workActions`) + non-dismissed suggestions, runs **`reconcileSuggestedChildren`**
  (explicit always wins; any id/label collision is dropped), then
  **`validateWorkGraph`**; an invalid graph (duplicate id / dangling parent /
  cycle) drops the suggestions rather than show something unsafe.
- **Dismissal sidecar** `state.dismissedSubsteps` (keyed by `step.id` → dismissed
  work-intent keys) — the user can dismiss/restore a suggestion; suggestions
  themselves are recomputed, never stored as records. Backfilled `{}` on load.
- **Workbench panel** `decompositionPanelHtml` injected into `wbStepBodyHtml`
  (typeof-guarded — byte-identical when the function is absent): each suggested
  child shown with its contract fields + an `ai-inferred` badge, marked
  "suggested — not captured", with a dismiss affordance and a "never count in
  official totals" note. Wired through the existing delegated workbench listener.

### Safety / trust rules encoded

- Suggested children are **never written to `step.workActions`** (read-only) and
  **never counted** in official rollups (`rollupCountableItems` excludes them by
  origin/confirmationState — proven even against an over-eager "confirm-all" gate).
- They can **never be born confirmed** (`markSuggestedWorkAction` coerces to
  `suggested`/`modelled`).
- **Explicit user-entered workActions stay authoritative** — collisions are
  dropped, never merged or overwritten.
- **No fabrication** — a non-compound step or a compound step with no captured
  signals yields zero suggestions.

### Changed files

| File | Change |
|---|---|
| `app.js` | `state.dismissedSubsteps` in `defaultState` + normalize backfill; the P6-2 block (templates, suggester, dismissal sidecar, `decomposeStep`, panel, action handlers); a typeof-guarded `p62DecompHtml` injection in `wbStepBodyHtml`; two delegated handlers in `wireWorkbench` |
| `test/p6-2-decomposition.test.mjs` | 15 focused tests (new) |

### Adversarial review

Reviewed across two lenses (trust + correctness/additivity), each finding
skeptic-verified. One actionable item — no explicit test for the
`validateWorkGraph` safety valve in `decomposeStep` — was addressed by adding a
regression test (duplicate explicit-child ids invalidate the graph; the
otherwise-present suggestions are dropped while explicit children are preserved).
No other findings.

### What was intentionally NOT touched

- No policy upload (P6-3), unit economics (P6-4), or dashboard / portfolio-preview
  surfacing (P6-5). No server endpoint and no remote assumptions.
- No change to `index.html`, `server.mjs`, `studio_engine.mjs`, the scorers, the
  confirmation/engine gate, the P6-0/P6-0A contract, or the P6-1 work-intent axis.
- Suggested substeps are not promoted into the official graph — wiring confirmed
  substeps into rollups is a later concern, deliberately out of P6-2 scope.

### Verification (P6-2)

```bash
node --check app.js      # OK (exit 0)
node --check server.mjs  # OK (exit 0)
npm test                 # tests 1465 / pass 1465 / fail 0 (exit 0)
```

---

## P6-3 · Permission & entitlement policy guardrails (draft, reviewable)

**Status:** COMPLETE
**Gate:** 1479/0 (+14 tests over P6-2's 1465/0)
**Scope:** policy → draft reviewable **permission/entitlement** guardrails only —
no unit economics (P6-4), no dashboard / portfolio-preview surfacing (P6-5), no
corp integration, and no change to official counted rollups.

Per the formal clarification, P6-3 is **Permission & Entitlement** guardrails, **not
generic data-restriction logic**. Sensitive data, sensitive systems, login language,
and "download from system" language are **never** treated as automatic blockers.
Turn the already-uploaded AI policy (`state.aiPolicy` clauses from the existing
`extractPolicyClauses` / `/api/extract-policy`) into structured, individually-
reviewable permission guardrails — leaving the upload/extraction path, the
clause-citation IR, and the `normalizePolicyConstraints` / `buildRecipeSpec`
machinery untouched.

### Five separated dimensions

- **data sensitivity** — what data/system is involved (context, never a block)
- **entitlement** — what the actor is allowed to do
- **action** — read / retrieve, write, export, approve, administer
- **control** — review, approval, logging, four-eyes, human checkpoint
- **decision owner** — who can approve / rely on the action

### Assumption rule

If the capture describes work a person personally does in a system, assume they may
have **ordinary access** to perform that work — **unless** the capture explicitly
says access is missing / unauthorized / blocked / unknown (`ENTITLEMENT_ABSENCE_RE`).
An unknown entitlement raises a **question**, never an automatic block.

### What was built

- **`buildPolicyGuardrails(policy)`** — deterministic, grounded in each clause's own
  action verb + permission/prohibition modality. Emits permission guardrails such as
  *role may read system*, *role may export with logging/review*, *approval requires a
  named authority*, and *AI may assist with retrieval/extraction but not approve*.
  A clause that is only about data sensitivity (no action/entitlement) yields nothing
  — sensitivity is never a blocker.
- **Tiered actions** (`ENTITLEMENT_ACTIONS`): read (tier 1, no control floor) <
  export / write (tier 2, logging / review) < approve (tier 3, named authority). The
  `detectActionTier` picks the highest-consequence action present, and
  higher-consequence actions carry **stronger required controls** than read/retrieve.
- **Review states** (suggested / confirmed / rejected) in
  `state.policyGuardrailReviews` (backfilled `{}`). A guardrail is **draft until a
  human confirms it**; only the decisions persist, the guardrails re-derive.
- **`activePolicyGuardrails(policy)`** — confirmed-only read API; a policy never
  silently activates.
- **Entitlement read APIs (read-only)** — `stepEntitlementStatus` (assumption rule),
  `policyEntitlementQuestionsForStep` (unknown → a missing-permission question), and
  `policyEntitlementFitForStep` (returns `permitted` / `permitted-with-controls` /
  `requires-authority` / `needs-permission-info` with required controls + decision
  owner, never a hard block) for later placement / economics. None write the step.
- **Review panel** `policyGuardrailsPanelHtml` appended into `renderPolicyPanelHtml`
  (`""` when no grounded guardrails → byte-identical when unused): each guardrail
  shows the actor, action, required controls, decision owner, source clause, and
  review state, with confirm / reject / reset affordances and a "sensitive data is
  never blocked outright; an unknown entitlement raises a question; confirming never
  changes scoring or counted totals" caveat. Wired in `wirePolicyPanel`.

### Tests (the six required guarantees + safety)

1. Sensitive system + described login/read access → **not auto-blocked** (`permitted`).
2. Sensitive system + confirmed read/export entitlement → **policy-fit with controls**.
3. Unknown entitlement → a **missing-permission question**, not a block.
4. Write / export / approve require **stronger controls** than read / retrieve.
5. Draft (or confirmed) guardrails **never change** the opportunity score (functional +
   source-level).
6. Confirmed guardrails are **readable** downstream; rejected are **ignored**.
   Plus: no fabrication from sensitivity-only / cue-less / empty policy; read-only (no
   grid write, no step mutation); panel byte-identical when unused; rail-clean; no
   Phase 5 / gate function references P6-3 symbols.

### Changed files

| File | Change |
|---|---|
| `app.js` | `state.policyGuardrailReviews` in `defaultState` + normalize backfill; the P6-3 permission/entitlement core block; `policyGuardrailsPanelHtml` + one-line append in `renderPolicyPanelHtml`; confirm/reject/reset handlers in `wirePolicyPanel` |
| `test/p6-3-policy-guardrails.test.mjs` | 14 focused tests (new) |

### Adversarial review

Reviewed across two lenses (entitlement-semantics + trust/correctness), each
finding skeptic-verified. Four findings positively confirmed the rework (assumption
rule, sensitivity-as-context, unknown→question, control escalation, isolation). Two
real bugs were fixed before commit, each with a regression test:

1. **Negated controls** — a control named after "without" / "unless" (e.g. "may
   approve *without* a named authority") was read as a *required* control, inverting
   the clause. Fixed: `detectEntitlementControls` now reads only the granted portion
   (`entitlementGrantedText`).
2. **Spelling bias** — `ENTITLEMENT_ABSENCE_RE` and `detectEntitlementModality` only
   matched British "authoris**ed**", missing American "authori**zed**" (and the
   approve action verb "authorize" collided with the modal "authorized to"). Fixed:
   `authori[sz]` spellings, and "authorize/authorise" removed from the approve action
   verbs (the modal is handled by `detectEntitlementModality`).

### What was intentionally NOT touched

- No change to the existing upload/extraction path (`extractPolicyClauses`,
  `/api/extract-policy`, `setAiPolicy`), the clause-citation IR, or the
  `normalizePolicyConstraints` / `buildRecipeSpec` constraint machinery.
- No unit economics (P6-4), dashboard / portfolio-preview surfacing (P6-5), or corp
  integration. No `server.mjs`, `index.html`, `studio_engine.mjs`, scorer, gate, or
  P6-0/P6-1/P6-2 change.

### Verification (P6-3)

```bash
node --check app.js      # OK (exit 0)
node --check server.mjs  # OK (exit 0)
npm test                 # tests 1479 / pass 1479 / fail 0 (exit 0)
```

---

## P6-4 · AI unit economics (separate economic-fit layer, reviewable)

**Status:** COMPLETE
**Gate:** 1490/0 (+11 tests over P6-3's 1479/0)
**Scope:** the per-unit economic-fit layer only — no dashboard / portfolio-preview
surfacing (P6-5), no corp integration, no change to official counted rollups or the
confirmation gate, and the existing business case (`computeBusinessCaseNow` /
`businessCaseSnapshot`) is left untouched.

A per-unit economic-fit lens that keeps **run cost**, **TCO / build cost**, and
**value** SEPARATE, with reviewable assumptions (`{value, source, confidence}`),
built additively over the engine cost model and the P6-1/P6-3 confirmed signals.

### Carry-forward from P6-3 (permission/entitlement-first)

- Sensitive data / a sensitive system does **not** raise cost on its own. Review /
  logging / control **overhead** is added **only** when the confirmed permission /
  control model requires those controls (the mount derives `requiredControls` from
  `policyEntitlementFitForStep`, which reads confirmed-only guardrails).
- User-described work in a system implies ordinary access; unknown access stays a
  question — economics never invents a cost from a sensitivity flag.

### What was built

- **Three separated lenses** (`ECON_RUN_DRIVERS` / `ECON_TCO_DRIVERS` /
  `ECON_VALUE_DRIVERS`): run cost (model/tool usage, per-case review, exception/
  rework, logging/control overhead — the last two control-gated); TCO (setup,
  integration, governance/review, maintenance, training/change); value (time
  returned, cycle-time improvement, rework avoided / quality lift, throughput).
- **`buildUnitEconomics(step, opts)`** — deterministic. A driver computes a number
  only from present inputs × assumptions; a missing captured input (volume/time) or
  a blank rate yields a **question + null total**, never a fabricated number or $0
  (mirrors the business case's `valueComputed:false` discipline). `economicFit`
  (justified / marginal / not-justified / needs-economics-info) is advisory only —
  never a hard block — and is set only when value *and* cost are both known.
- **Reviewable assumptions** (`ECON_DEFAULT_ASSUMPTIONS`, ai-inferred drafts;
  department-specific rates like labor `$/hr` and AI-carry share default to *null* —
  configurable, not invented). `economicAssumption` / `setEconomicAssumption`
  (edit) / `confirmEconomicAssumption` / `rejectEconomicAssumption` (→ dependent
  driver becomes a question) / `resetEconomicAssumption`, persisted in
  `state.economicsAssumptions` (backfilled `{}`).
- **`confirmedUnitEconomics(step, opts)`** — the read API for later portfolio /
  roadmap (P6-5): returns the economics **only** when every assumption is confirmed
  and a value + cost both exist; a draft is never read as official.
- **Workbench panel** `unitEconomicsPanelHtml` injected into `wbStepBodyHtml`
  (typeof-guarded — byte-identical when absent): run cost, TCO, and value shown
  **separately**, each driver value or a "capture inputs" question; assumptions
  reviewable (confirm / edit / reject / reset); a "draft — never changes the
  opportunity score, the confirmation gate, or counted totals" caveat. Wired in
  `wireWorkbench`.

### Safety / trust rules encoded

- **Separate from technical fit and policy fit** — nothing here feeds the
  opportunity score, scorers, the confirmation/engine gate, or counted rollups
  (proven functionally and source-level); no grid cell or step is written.
- **No fabrication** — missing inputs and blank rates stay questions / "not
  computed", never $0 or invented payback.
- **Run cost and TCO are distinct lenses** with their own drivers and totals.
- **Rail-clean** — no headcount / FTE / reduction / eliminate / automate / workforce
  language (the value driver was renamed away from "reduction" to "Rework avoided /
  quality lift").

### Changed files

| File | Change |
|---|---|
| `app.js` | `state.economicsAssumptions` in `defaultState` + normalize backfill; the P6-4 core block (driver consts, assumption sidecar, `buildUnitEconomics`, `confirmedUnitEconomics`); `unitEconomicsPanelHtml` + a typeof-guarded mount in `wbStepBodyHtml`; econ handlers in `wireWorkbench` |
| `test/p6-4-unit-economics.test.mjs` | 11 focused tests (new) |

### Adversarial review

Reviewed across two lenses (no-fabrication/separation + control-gating/rails/
correctness), each finding skeptic-verified. One real finding fixed before commit:
a **rejected** assumption still displayed its default number in the UI (the
calculation path was already correct). Fixed so a rejected assumption reads blank
(`—`), consistent with "rejected → blank, never a fabricated number"; regression
test added.

### What was intentionally NOT touched

- The existing business case (`computeBusinessCaseNow`, `businessCaseSnapshot`,
  scenarios), the engine cost model (`costToServe` / `buildTco` / `roleCapacity`),
  the scorers, the confirmation/engine gate, and counted rollups.
- No dashboard / portfolio-preview surfacing (P6-5), no corp integration. No
  `server.mjs`, `index.html`, `studio_engine.mjs`, or P6-0/P6-1/P6-2/P6-3 change.

### Verification (P6-4)

```bash
node --check app.js      # OK (exit 0)
node --check server.mjs  # OK (exit 0)
npm test                 # tests 1490 / pass 1490 / fail 0 (exit 0)
```

---

## P6-5 · Portfolio Preview, Roadmap & Multi-Layer Surfacing

**Status:** COMPLETE
**Gate:** 1513/0 (+23 tests over P6-4's 1490/0)
**Scope:** a **surfacing layer only** — it renders the existing P6-0A / P6-1..P6-4
signals and adds ONE new descriptive axis (criticality). No new scoring engine, no
change to the opportunity score, the confirmation/engine gate, or official counted
rollups. No corp integration, no push/PR.

P6-5 fills the gap the P6-0A contract left open: `workItemCompleteness` already
computed `previewEligible` / `counted`, but **nothing rendered them** (the comment
at the work-graph block named "Portfolio Preview surfaces (heatmap / constellation
/ roadmap)" as the intended target). P6-5 is that render layer. The product rule it
honours: *access is broad, trust is explicit* — a workflow is never hidden because
it is incomplete; completeness changes labels, styling, and filters, not access.

### Completeness posture (folded from the 5 P6-0A bands → 4 trust tiers)

| Completeness | Trust tier | Behaviour |
|---:|---|---|
| 0–65% | Early draft / needs capture | Visible, clearly cautioned |
| 66–79% | Functional draft | Discussion-ready |
| 80–94% | High-confidence draft | Strong preview candidate (`previewEligible`) |
| 95–100% | Portfolio-ready draft | — |

**Official Counted is a SEPARATE, gate-driven signal**, not a percentage tier: an
item is officially counted only when `workItemCompleteness(item,{confirmed}).counted`
is true — i.e. the confirmation gate (`isUnitConfirmed`) **and** every mandatory
safety field. A 100%-complete but *unconfirmed* item is in **Portfolio Potential**,
never in **Official Counted**. The two are kept structurally separate.

### What was built

- **Criticality / importance axis** (NEW descriptive sidecar, `state.criticalityTags`):
  a per-step **multi-value** `{value:[kinds], source, confidence}` over a 10-value
  controlled vocabulary (revenue-linked, client-impacting, control-critical,
  operational-bottleneck, cross-functional-junction, decision-point,
  expertise-dependent, high-volume, exception-heavy, downstream-dependency). Manual
  toggles + AI-suggest, mirroring the established provenance discipline:
  `criticalityOf` / `setCriticalityValues` / `toggleCriticality` /
  `applyCriticalitySuggestion` / `confirmCriticality` / `rejectCriticality`, a
  descriptive `/api/suggest-criticality` endpoint (mirrors `handleSuggestRole`),
  render + `wireCriticality`, mounted in the per-step composite trust badge. It is
  **STRICTLY SEPARATE** from technical fit (opportunity), policy fit, economics,
  completeness and confidence — it only groups / filters / explains.
- **Pure portfolio model** (testable): `portfolioCompletenessTier`,
  `portfolioRoadmapAction` (7 next-action buckets), `portfolioItemView`,
  `buildPortfolioSurface` (Portfolio Potential vs Official Counted, with the
  official de-dup **delegated** to `rollupCountableItems` + `isUnitConfirmed`),
  `buildPortfolioHeatmap` (multi-dimensional rows), `buildPortfolioClustersByAxis`.
- **Integration glue** (`portfolioEntryFromStep` / `portfolioEntries` /
  `portfolioSurfaceForCurrent`): projects the captured grid honestly into work
  items, reading each axis from its own sidecar / confirmed-only API
  (`workIntentOf`, `roleTagOf`, `criticalityOf`, `policyEntitlementFitForStep`,
  `confirmedUnitEconomics`). Every cross-fn call is `typeof`-guarded + wrapped.
- **New "Portfolio Studio" Analysis tab** (`renderAnalysisTabPortfolio` + the
  rail button / panel in `index.html` + `ANALYSIS_TABS` + dispatch) hosting an
  internal switcher over **7 views**: All Work, Portfolio Preview, Roadmap (by next
  best action), Department, Role Influence, Multi-Layer Heatmap, Constellation.
  Department/Role reuse the existing `departmentHeatmapHtml` / `roleFootprintHtml`.
  Every view renders a real, cautious state even at zero completeness (never a dead
  end, never "blocked").

### Safety / trust rules encoded

- **Official counted unchanged** — delegated to `isUnitConfirmed` /
  `rollupCountableItems` / `counted`; never widened. A high percentage never
  bypasses the gate or a missing mandatory safety field (proven: a 100% unconfirmed
  item, and a confirmed item missing a safety field, are both *not* counted).
- **Criticality orthogonal** — no scorer / gate / economics / policy / completeness
  function references the criticality tokens, and vice-versa (proven both ways +
  functionally: setting criticality moves neither completeness/counted nor the
  roadmap bucket).
- **Sensitive ≠ blocked** — there is no "blocked" outcome; an unknown permission
  routes to *needs entitlement / permission confirmation* (a question), not a wall.
- **Drafts stay drafts** — suggested/inferred values surface with labels, never as
  official fact; ai-inferred criticality never auto-hardens (load passes it through
  unchanged); read-only (no `patchField`, no model call in the surfacing path).
- **Rail-clean** — leverage / time-returned / consequence framing only; no
  headcount / FTE / automation-% / reduction / eliminate language; locked palette
  only (criticality uses Caution Amber `#FFB454`; Human Pink stays reserved); no
  gradient on any data surface.

### Changed files

| File | Change |
|---|---|
| `app.js` | `criticalityTags` / `portfolioView` / `portfolioClusterAxis` in `defaultState` + normalize backfill; the criticality sidecar (vocab, mutators, render, `wireCriticality`) mounted in the step trust badge + wire batch; the P6-5 portfolio model + 7 view builders + `renderAnalysisTabPortfolio` / `wirePortfolio`; `ANALYSIS_TABS` + `renderAnalysisStudio` dispatch |
| `index.html` | "Portfolio Studio" rail button (Portfolio group) + `analysis-tab-portfolio` panel |
| `server.mjs` | `handleSuggestCriticality` + `/api/suggest-criticality` route (descriptive classifier, allowed-set validated, rail-clean prompt) |
| `test/p6-5-portfolio.test.mjs` | 23 focused tests (new) |
| `test/trust-legibility.test.mjs` | one `stepCriticalityHtml: () => ""` badge stub (same pattern as every prior axis) |

### Adversarial review

Reviewed across five lenses (official-counted-gate, criticality-orthogonality,
rails/color, integration-runtime, test-rigor), 12 raw findings each
skeptic-verified. **No production defect** was confirmed — all four "rejected"
findings were false positives, and every confirmed finding was a **test-strength
gap**, not a code bug. Fixed before commit: (1) the Department/Role views were
stubbed, not executed — now extracted and run for real across all 7 views; (2)
added a table-driven roadmap test pinning all 7 buckets and the permission-before-
control priority order; (3) strengthened the criticality-independence proof through
the consuming surface, the heatmap layer-independence proof, and the empty-state
guidance assertions; (4) added an end-to-end integration smoke test that executes
the real grid→entry→surface glue. (One copy reword — "auto-blocked" → "a hard stop"
— came directly from the strengthened rail test catching the substring.)

### What was intentionally NOT touched

- The opportunity scorer (`getStepOpportunityMeta`), recipe readiness, the
  confirmation/engine gate (`isUnitConfirmed` / `recipeGateCheck` /
  `rollupCountableItems` / engine `isConfirmed`), counted rollups, the business
  case, the engine cost model, and the P6-1..P6-4 sidecars — all read-only.
- `studio_engine.mjs`. No corp integration. No push / PR.

### Verification (P6-5)

```bash
node --check app.js      # OK (exit 0)
node --check server.mjs  # OK (exit 0)
npm test                 # tests 1513 / pass 1513 / fail 0 (exit 0)
```
