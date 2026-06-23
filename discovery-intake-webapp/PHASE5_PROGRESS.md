# Phase 5 Progress

## P5-2 · Real Confirmed Engine Data Bridge

**Status:** COMPLETE  
**Gate:** 1207/0 (+29 tests over Phase 4 seal gate of 1178/0)  
**Eval:** 0/24 dangerous-wrong (unchanged)

---

### What was built

A production bridge that maps real captured session/interview state to the 15 required
fields the engine's `isConfirmed` gate checks — so a normal fully-captured session can
produce an engine-confirmed record without synthetic injection and without loosening the
confirmation gate.

### Changed files

| File | Change |
|---|---|
| `app.js` | Bridge block + modified `appWorkflowToIntake` + dashboard empty-state missing-field report |
| `test/p5-2-bridge.test.mjs` | 29 new tests (new file) |

### Bridge functions added (all in `app.js`, before `appWorkflowToIntake`)

| Function / Const | Purpose |
|---|---|
| `buildBridgeHeader()` | persona ← `sessionMeta.userRole` / `fields.intervieweeRole`; dept ← `sessionMeta.departmentTag.value`; anchor ← `analysisWorkflowName()` / `sessionMeta.name` |
| `buildBridgeTrigger()` | trigger ← `fields.triggerSource`; cadence ← `fields.triggerFrequency`; volume ← `fields.runsPerPeriod` |
| `buildBridgeJudgmentBlock(steps)` | needs ← `fields.humanJudgmentArea` or humanCheckpoint on judgment/decision/human_held steps; hard ← rulesDecisionLogic; cues ← exceptionBranching; human ← names of human-led steps |
| `buildBridgeConfirmBlock(steps)` | acceptance ← `fields.acceptanceCriteria` or humanCheckpoint on any step; escalation ← exceptionBranching on any step; dataTier ← highest dataSensitivity across all steps |
| `BRIDGE_REQUIRED_META` | Labels + hints for the 15 required fields (parallel to `engine.REQUIRED`) |
| `BRIDGE_REQUIRED_CHECKS` | 15 deterministic validators mirroring `engine.REQUIRED` exactly — no engine round-trip needed |
| `bridgeMissingFields(record)` | Returns `[{field, label, hint}]` for each REQUIRED field absent in the record; empty array = gate-ready |

### `appWorkflowToIntake` change

Before: `header.persona`, `header.dept`, `trigger.*`, `judgment`, and `confirm` were always empty
unless explicitly passed via `opts`.

After: bridge functions are called as fallbacks when opts doesn't supply them. Existing callers
that explicitly pass these fields are unaffected (opts wins over bridge).

### Dashboard empty state

`dashEmptyHtml(lv, missingFields?)` now accepts an optional array. When `lv.confirmedCount === 0`
and the engine is loaded, `renderAnalysisTabDashboard` calls `bridgeMissingFields(appWorkflowToIntake())`
and passes the result to the empty state — so the user sees exactly which fields still need to be
captured rather than a generic "go to Workbench" prompt.

### Rules observed

- **Gate unchanged:** `engine.isConfirmed` and `engine.REQUIRED` in `studio_engine.mjs` are unmodified.
- **No faking:** every bridge field reads from real captured state or is left empty.
- **Provenance intact:** bridge derivation never auto-hardens; inferred values from grid cells remain inferred.
- **Fails closed:** thin/empty sessions still produce confirmedCount = 0; all 15 missing fields are reported.
- **Seams:** friction/latency/crit come from `buildWorkflowLeverage` via `recipeConnectionSeams` as before (unchanged); structural sidecars (frictionTags, handoffTags, decisionTags) must be populated for seams to carry 3-dim values.
- **Official rollups:** Executive / Workforce / Portfolio still count only `isConfirmed` records.

### Evidence

```
engine.isConfirmed(BRIDGE_FULL) === true   # test "P5-2: engine.isConfirmed returns true for a fully bridge-spec record"
engine.isConfirmed({})          === false  # test "P5-2: engine.isConfirmed still returns false for an empty record"
bridgeMissingFields(FULL)       = []       # test "P5-2: bridgeMissingFields returns [] for a fully populated record"
bridgeMissingFields(null)       = 15 items # test "P5-2: bridgeMissingFields returns all 15 missing for null record"
```

---

## P5-3 · Confirmation Ladder

**Status:** COMPLETE  
**Gate:** 1236/0 (+29 tests over P5-2 gate of 1207/0)  
**Eval:** 0/24 dangerous-wrong (unchanged)

---

### What was built

A five-rung confirmation-status model that surfaces exactly where each workflow/session
stands — why it appears in Workbench but may not count in Executive/Workforce/Portfolio
rollups — without loosening any gate or touching official rollup logic.

### Changed files

| File | Change |
|---|---|
| `app.js` | `LADDER_LEVELS` const + `buildConfirmationLadder()` + `confirmationLadderHtml()` + `dashEmptyHtml` third param + Workbench ladder injection |
| `test/p5-3-ladder.test.mjs` | 29 new tests (new file) |

### Ladder rungs

| Rung | levelId | Condition |
|---|---|---|
| 0 | (none) | No steps captured yet — "Not started" |
| 1 | `captured` | Steps recorded but no step has class + data sensitivity |
| 2 | `classified` | At least one step is classified; not all steps Workbench-confirmed |
| 3 | `workbench-confirmed` | All steps Workbench-confirmed; bridge fields still missing |
| 4 | `engine-complete` | All 15 bridge fields present; engine not loaded or gate returning false |
| 5 | `portfolio-counted` | `engine.isConfirmed(record) === true`; `complete: true` |

### Functions added (all in `app.js`)

| Function / Const | Purpose |
|---|---|
| `LADDER_LEVELS` | 5-entry array of `{id, label, hint}` — canonical level definitions |
| `buildConfirmationLadder()` | Pure data function — reads real state, returns `{level, levelId, label, complete, nextHint, missingFields, levels}` |
| `confirmationLadderHtml(ladder)` | Renderer — progress rungs + current-level bold + nextHint + missing-field list; returns `""` for null |

### Surface changes

- **Workbench tab:** `renderAnalysisTabWorkbench` now injects `confirmationLadderHtml(buildConfirmationLadder())` between `progressHtml` and the step cards (typeof-guarded).
- **Dashboard empty state:** `dashEmptyHtml(lv, missingFields, ladderStatus?)` gains an optional third param; `renderAnalysisTabDashboard` computes `ladderStatus = buildConfirmationLadder().label` and passes it to the empty state so the user sees "Confirmation status: Classified" (or whatever level) rather than a generic prompt.

### Rules observed

- **Gate unchanged:** `engine.isConfirmed` and `engine.REQUIRED` unmodified.
- **No partial records in rollups:** Official Executive/Workforce/Portfolio rollups still count only `isConfirmed` records. The ladder is a read-only diagnostic; it never promotes a record.
- **Language client-safe:** no headcount, FTE, reduction, or eliminate framing in any ladder function.
- **P5-2 bridge unchanged:** `bridgeMissingFields` and `appWorkflowToIntake` byte-identical; ladder reuses them as read-only callers.
- **Phase 6 untouched:** no `workIntent`, `stepFunction`, `policyUpload`, or `unitEconomics` references.

### Evidence for each ladder level

```
level 0 — steps: []                          → label "Not started", complete false
level 1 — unclassified step                  → label "Captured",    nextHint mentions "data sensitivity"
level 2 — classified, unconfirmed.length > 0 → label "Classified",  nextHint names unconfirmed count
level 3 — all confirmed, bridge incomplete   → label "Workbench confirmed", missingFields present
level 4 — bridge complete, engine not loaded → label "Engine complete",     missingFields []
level 5 — engine.isConfirmed = true          → label "Portfolio counted",   complete true, nextHint null
```

### Evidence rollups count only portfolio-counted records

```
engine.isConfirmed(FULL_RECORD)    === true   # test "P5-3: engine.isConfirmed is the gate for portfolio inclusion"
engine.isConfirmed(PARTIAL_RECORD) === false  # test "P5-3: engine.isConfirmed false for a partial record"
engine.isConfirmed({})             === false  # test "P5-3: thin/empty session is not portfolio counted"
engine.isConfirmed({ recap: { confirmed: true } }) === false  # recap alone does not count
```

---

## P5-4 · Solution Placement Explainer

**Status:** COMPLETE  
**Gate:** 1295/0 (+59 tests over P5-3 gate of 1236/0)  
**Eval:** 0/24 dangerous-wrong (unchanged)

---

### What was built

A per-step placement explainer visible in the Workbench. For every step, the app now shows:
- **Shape badge** — the current `solutionShape` (prompt / rag / deterministic-tool / agentic / human-in-loop) with its source (user-confirmed / derived from actions / class-inferred)
- **AI CARRIES** — what AI can handle at this step
- **HUMAN HOLDS** — what stays human-held and why
- **Blockers** — hard conflicts (class mismatch, elevated entitlement, sensitive data tier)
- **Missing evidence** — what fields are absent that would tighten the assessment
- **Evidence** (workbench + technical surfaces only) — provenance-tagged field list
- **What would change this placement** — collapsible upgrade path

The explainer never recomputes separate numbers for leadership/worker surfaces — it re-expresses the same placement with context for the audience.

### Changed files

| File | Change |
|---|---|
| `app.js` | `PLACEMENT_SHAPE_LABELS` const + `inferStepPlacementShape()` + `buildPlacementExplainer()` + `placementExplainerHtml()` + `wbStepBodyHtml` injection |
| `test/p5-4-placement.test.mjs` | 59 new tests (new file) |

### Functions added (all in `app.js`)

| Function / Const | Purpose |
|---|---|
| `PLACEMENT_SHAPE_LABELS` | Shape label map — `human_in_loop` included as migration alias normalised to `"Human-in-loop"` |
| `inferStepPlacementShape(cls, ent, tier)` | Pure: baseline shape inference from class + entitlement + data tier when no explicit shape or workActions present |
| `buildPlacementExplainer(step)` | Returns structured `{shape, shapeSource, inferReason, aiCarries, humanHeld, blockers, evidence, missingEvidence, confidence, whatWouldChange, compoundWarning, note}` — read-only |
| `placementExplainerHtml(explainer, surface)` | Renderer — surface "workbench"/"technical" shows evidence detail; "worker"/"leadership" shows placement + carries/holds only |

### Shape resolution precedence

1. **user-stated** sidecar (`solutionShapeOf(step.id).source === "user-stated"`) → `shapeSource: "stated"`
2. **derivedShape** from `workActions` via `E.deriveStepSolutionShape(step)` → `shapeSource: "computed"`
3. **ai-inferred** sidecar → `shapeSource: "inferred"`, inferReason "AI-suggested"
4. **class-inferred** by `inferStepPlacementShape` → `shapeSource: "inferred"`, inferReason from class/entitlement/tier logic

### `human_in_loop` canonical handling

`deriveStepSolutionShape` (engine) returns `"human_in_loop"` (underscore). The explainer normalises via `norm()` to `"human-in-loop"` throughout. `PLACEMENT_SHAPE_LABELS` carries both keys; the canonical hyphenated form is always displayed.

### P5-4A hook

`compoundWarning: null` is present on every explainer object as a named, typed hook point. P5-4A will set it to a string when compound-step decomposition is needed. No other P5-4A work is included here.

### Workbench injection

`wbStepBodyHtml` calls `buildPlacementExplainer(step)` and `placementExplainerHtml(explainer, "workbench")` with a try/catch typeof-guard, injecting `p54PlacementHtml` between `composedHtml` and `guardsHtml`.

### Rules observed

- **No recomputation on other surfaces** — `placementExplainerHtml` renders from the same explainer object regardless of surface; evidence list hidden on worker/leadership only.
- **Placement not from step label alone** — reads cls, workActions, entitlement, data tier, controls, grid cells.
- **Rail-clean** — no headcount, FTE, reduction, eliminate framing.
- **P5-1 + Phase 6 untouched** — source-level guard tests confirm no workIntent / stepFunction / policyUpload / unitEconomics.

---

---

## P5-4A · Compound-Step Granularity Guard

**Status:** COMPLETE  
**Gate:** 1341/0 (+46 tests over P5-4 gate of 1295/0)  
**Eval:** 0/24 dangerous-wrong (unchanged)

---

### What was built

A lightweight guard that detects broad/compound steps before `buildPlacementExplainer` can
overclaim confident placement. The guard is a pure detection function that fires on five
independent signals. It fills the `compoundWarning` / `compoundGuard` hook left by P5-4.

### Changed files

| File | Change |
|---|---|
| `app.js` | `detectCompoundStep()` + `buildPlacementExplainer` `compoundGuard` / `compoundWarning` return + `placementExplainerHtml` provisional marking + detail rendering |
| `test/p5-4a-compound.test.mjs` | 46 new tests (new file) |

### Detection signals (all in `detectCompoundStep`)

| Signal | Condition |
|---|---|
| A | `engine.flagCombinedStep(name).combined === true` (explicit assembly+judgment conjunction) |
| B | Broad aggregate verb regex — check / review / validate / handle / manage / process / coordinate / ensure / complete / perform / verify / oversee / administer / address / assess / evaluate / analyse / examine |
| C | Bundle/scope noun regex — setup / package / bundle / suite / onboarding / exception / casework / intake / portfolio / workload / procedure / details / information |
| D | Three or more systems named in `systemsTools` cell |
| E | Mixed AI-online and human/offline `workActions` (≥2 actions total) |

**Exempt classes:** `decision` and `human_held` — always return null regardless of signals.

### Output shape

```javascript
{
  warning: "Compound step likely — this step may contain multiple actions with different AI fit. Split or confirm before treating placement as final.",
  detail:  "May include retrieval, extraction, reconciliation, exception assessment, routing, or approval.",
  reasons: ["broad aggregate verb \"check\" — implies multiple hidden sub-operations", ...]
}
```

Returns `null` when no signal fires or class is exempt.

### Integration into `buildPlacementExplainer` / `placementExplainerHtml`

- `buildPlacementExplainer` calls `detectCompoundStep(step)` before its return object and
  sets `compoundGuard: cg` and `compoundWarning: cg ? cg.warning : null` in the returned
  explainer (replaces the P5-4 null hook).
- `placementExplainerHtml` destructures `compoundGuard` and:
  - Appends `" · provisional"` to `srcLabel` when `compoundWarning` is present
  - Renders `cwHtml` with both the warning string and `compoundGuard.detail`

### Acceptance checks

```
"Check entity details"         → flags (Signal B: "check")
"Review onboarding package"    → flags (Signal B + Signal C)
"Validate account setup"       → flags (Signal B + Signal C)
"Process exception"            → flags (Signal B + Signal C)
"Download account statement"   → NOT flagged (no signal matches)
"Read report"                  → NOT flagged (no signal matches)
"Send confirmation email"      → NOT flagged (no signal matches)
"Approve onboarding"           → NOT flagged (decision class exempt)
```

### Rules observed

- **No auto-split:** `detectCompoundStep` emits a warning only — no substep creation, no
  decomposition, no Phase 6 items (`workIntent` / `stepFunction` / `policyUpload` / `unitEconomics`).
- **No headcount/FTE/reduction/eliminate/automate** language in `detectCompoundStep` source.
- **Placement marked provisional** when compound guard fires; placement not suppressed or blocked.
- **Phase 6 untouched:** source-level tests confirm no Phase 6 symbols in either function.
- **Engine gate unchanged:** `engine.isConfirmed`, `engine.REQUIRED`, and `studio_engine.mjs`
  unmodified.

---

## Pending

| Item | Status |
|---|---|
| P5-1 · Legacy thin-step modeled composition fallback | Pending — not started |
| Phase 6 · workIntent / stepFunction / policy upload guardrails / unit economics | Pending — not started |
