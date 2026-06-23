# Phase 4 Progress

Branch: `phase-4` off `phase-3-sealed` (2fda91f)
Baseline gate: npm 823/0 · engine 335/0 · eval 0/20 dangerous-wrong · adjacency groups=8

---

## Track A — Engine

### A-1 · cls 3→5 migration  [B] ✓ SEALED
**Tag:** `phase-4-engine-cls`  **SHA:** 50492b1  
**Gate:** npm 823/0 · engine 335/0 · eval 0/20 dangerous-wrong  

Five-rung taxonomy (`gather | build | judgment | decision | human_held`) replaces the
legacy three-rung (`assembly | judgment | decision`).  `"assembly"` kept as CLASSES alias
so inline test fixtures round-trip unchanged.  GATHER_RE verb heuristic in reconcileIntake
routes `assembly` → `gather` (read/pull/collect/retrieve) or `build` (all other verbs).
Golden fixtures FPA_INTAKE (5 steps) + RECON_INTAKE (2 steps) migrated.  All engine
production guards, rubric, and self-tests updated.

Files changed: `studio_engine.mjs`, `test/eval-set.test.mjs`, `test/fixtures/eval-set.json`,
`test/pooled-library.test.mjs`, `test/recipe-proof.test.mjs`, `test/step-rule.test.mjs`,
`test/tco.test.mjs`, `test/discovery-capture.test.mjs`, `test/dashboard-slice.test.mjs`,
`test/adjacency-strict.test.mjs`

---

### A-2 · step.workActions[] multi-action composition  [B] ✓ SEALED
**Tag:** `phase-4-workactions`  **SHA:** 23390c7  
**Gate:** npm 843/0 · engine 348/0

composeStepAddressability, deriveStepSolutionShape, class-split invariant (owner="ai"
forbidden on decision/human_held); normalizeIntake populates composedAddr+derivedShape;
stepPermitted + roleCapacity.theoPct use composedAddr??theo; cappedSolutionShape,
buildShapeProfile, buildTco, costToServe use derivedShape??solutionShape. FPA_INTAKE
"Collect & consolidate" gains workActions (addr=85=theo → golden numbers unchanged).
test/work-actions.test.mjs: 20 tests.

### A-3 · waitSegments + wait sub-types  [A] ✓
**SHA:** 7b4f5f8  **Gate:** npm 878/0 · engine 369/0

WAIT_SEGMENT_KINDS; cycleTime uses segment-level reduction (deliberation→lRed, others→wRed)
when present, falls back to waitKind when absent; validateIntake checks kind enum + minutes
bounds; seeds unchanged → zero number change. test/wait-segments.test.mjs: 11 tests.

### A-4 · artifacts[] + convening channel  [A] ✓
**SHA:** 7b4f5f8  **Gate:** npm 878/0

ARTIFACT_TYPES/DIRECTIONS + stepArtifacts(); validateIntake checks type+direction enum;
convening = workActions channel="synchronous_human" (A-2). test/artifacts.test.mjs: 11 tests.

### A-5 · Value tiers + augmentation floor config  [A] ✓
**SHA:** 7b4f5f8  **Gate:** npm 878/0

VALUE_TIERS + AUGMENTATION_FLOOR_DEFAULT=50 + buildValueProfile(record,cap) advisory export;
validateIntake checks valueTier enum + augmentationFloor 0..100. test/value-tiers.test.mjs: 12 tests.

---

## Track B — Intake capture (Discovery surface)

### B-6 · Five-rung intake capture (UI)  [B] ✓ SEALED
**Tag:** `phase-4-b6-intake`  **SHA:** fbeb78b  
**Gate:** npm 911/0 · engine 369/0 · eval 0/20 (+31 tests)

`engineStepClass` now returns gather/build/human_held as first-class rungs (legacy
assembly/judgment/decision unchanged). `appStepToEngineStep` passes through
`workActions`/`waitSegments`/`artifacts` when present (empty arrays omitted →
byte-identical for existing steps). Three new pure inference functions derive
structured arrays from free-text notes captured in the interview. Two new optional
drilldown clusters: `work_composition` (key: `workCompositionNotes`) asks "one
action or several?; owner/channel"; `wait_artifacts` (keys: `waitBreakdownNotes`,
`artifactNotes`) asks "context vs person vs coordination" and artifact presence.
`stepFieldMeta` + `newRecord("steps")` extended with the three optional string keys.

Files changed: `app.js`, `test/b6-intake-capture.test.mjs`

**Track B complete.** Awaiting design addendum (Phase_4_Design_Addendum.md) before Track C.

---

## Track A (Addendum) — A1 ownershipFamily + A2 Glass McKinsey foundation

### A1 Addendum · ownershipFamily rollup  [A] ✓
**SHA:** aebe1be  **Gate:** npm 930/0 · engine 369/0

Two-family overlay over cls: `ownershipFamily(cls) → "ai_led" | "human_led" | null`.
`AI_LED_CLASSES=[gather,build]`, `HUMAN_LED_CLASSES=[judgment,decision,human_held]`,
legacy `assembly` → `ai_led`. `workflowOwnershipSplit(steps)` returns `{aiLed, humanLed, unknown}`
(time-weighted %, 1dp) for portfolio rollup. Pure functions; zero change to any engine
seed numeric output.

Files changed: `studio_engine.mjs`, `test/ownership-family.test.mjs` (+19 tests)

### A2 Addendum · Glass McKinsey v2 visual language — foundation  [A] ✓
**SHA:** aebe1be  **Gate:** npm 930/0 (no tests; CSS/font-only)

`signal-glass.css`: new `--gm-*` token block in `:root` — ownership ramp (5 rung
colours: gather #6FB6FF · build #4D8BFF · judgment #9D7BF0 · decision #EC4DA6 ·
held #C2528F), per-metric colours (value=blue, hours=teal, cycle-time=violet), surface
ground `--gm-base`, glass card tokens, data-only glow tokens, `--gm-display` (Space
Grotesk) + `--gm-mono` (JetBrains Mono) font stacks.
`index.html`: Space Grotesk + JetBrains Mono loaded from Google Fonts (additive; Inter
unchanged). No surface hardcodes a rung colour; all reads go through `--gm-*`.

Files changed: `signal-glass.css`, `index.html`

---

## Track C — UI surfaces

### C-7 · Studio shell: left rail + altitude-grouped 5-tab nav  [A] ✓
**SHA:** 11cc3db  **Gate:** npm 930/0 · engine 369/0

Horizontal `.analysis-tab-bar` (6 tabs) → vertical `.studio-rail` (5 tabs, altitude-grouped).
Two groups: "This workflow" (Workbench · Your Workflow · Recipe Book) and "Portfolio"
(Executive Dashboard · Workforce). `ANALYSIS_TABS` updated to the 5 new keys; saved states
with old keys (grid/leverage/etc.) normalise to "workbench" gracefully. "Why you can trust
this" banner removed; `renderTrustPanel()` → no-op; telemetry moved to `wireMethodologyLink`
(rail footer button shows trust content in a lightweight overlay). Three stubs added:
`renderAnalysisTabWorkbench` / `renderAnalysisTabWorkflow` / `renderAnalysisTabWorkforce`
(C-8/C-9/C-12 will replace them). Legacy panel IDs (grid/leverage/opportunities/engineering)
kept hidden in the DOM for compatibility during the C-8→C-13 build sequence.
Rail CSS added to signal-glass.css; layout uses `display:flex;flex-direction:row` on
`.analysis-studio`; intelligence summary host is now a static div in `.studio-content-area`.

Files changed: `app.js`, `index.html`, `signal-glass.css`, `test/trust-legibility.test.mjs`

### C-8 · Workbench cockpit — multi-action confirm + adversarial two-tier guard  [A] ✓
**SHA:** e2e70db  **Gate:** npm 953/0

Full `renderAnalysisTabWorkbench()` replaces the C-7 stub. Step cards render
`workActions[]` composition (owner/channel toggleable inline chips), assembled
and wired via `wireWorkbench()` (event-delegated, once-wired guard).
Two-tier adversarial guards: **pink guard** (class trap — human-led cls
`judgment|decision|human_held` + any AI-owner action); **amber guard** (all
AI+online double-check). `wbConfirmStep()` hardens `ai-inferred`→`user-stated`
provenance on all actions; blocks via toast when pink guard is active.
`wbToggleOwner` / `wbToggleChannel` cycle owner/channel inline and re-render.
`wbSplitStep` is a toast stub. `WB_RUNG_COLOR` maps five rungs to `--gm-*` tokens
(A2). Workbench CSS block added to `signal-glass.css`. 23 new tests in
`test/c8-workbench.test.mjs`. C-8 does not touch `getStepOpportunityMeta`,
`patchField`, or any server endpoint.

Files changed: `app.js`, `signal-glass.css`, `test/c8-workbench.test.mjs`

### C-9 · Your Workflow — leverage-framed plain language surface  [A] ✓
**SHA:** 02cafde  **Gate:** npm 981/0

Replaces stub `renderAnalysisTabWorkflow` with `ywBuildModel` + full render
pipeline. `ywBuildModel` consumes `buildWorkflowLeverage` (no re-computation)
and classifies every step/seam into three buckets:
- **Ready now**: leverage signal present + `workbenchConfirmed = true` (steps);
  or non-human-held seams (structural, no confirmation needed).
- **Needs setup**: leverage signal but not yet confirmed; or uncaptured
  non-structural steps (note: "Capture step shape in Workbench to see where AI helps").
- **Stays yours**: `humanHeld = true` (from leverage model); structural-human
  cls (`judgment|decision|human_held`) with no leverage signal; human-held seams.

`timeBackMinutes` uses `step.composedAddr` (A-2) else `step.theo` else 70%
fallback; only for non-human-held leverage steps with a `timeTaken` cell.
Hero shows workflow name + time-back badge (hidden at 0). Three buckets (✓ / ○ / ✦)
+ reinvestment menu (Go deeper / Help the team / Learn something / Build something;
Now / Next / Durable badges) + dark promise panel.

**Rail-clean:** no cost, no headcount as a metric, no FTE, no dollar signs,
no savings language in any render function. (Promise panel explicitly names
"costs or headcount" as things it *excludes* — permitted as prohibition framing.)
**Separation:** no scorer, no `patchField`, no `fetch`, no invented endpoint.

Files changed: `app.js`, `test/c9-your-workflow.test.mjs` (+28 tests)

### C-10 · Recipe Book Phase 4 — TCO summary, gate register, audit export  [A] ✓
**Tag:** `phase-4-c10`  **SHA:** c99d2db  
**Gate:** npm 1015/0 (+34 tests in `test/c10-recipe-book.test.mjs`)

Additive additions to the Recipe tab. Three new sections rendered above the
existing recipe cards, wired but never hard-disabled:

- **TCO summary** (`rb10TcoHtml`): 4-column header bar — buildable steps
  (total minus `judgment|decision|human_held`), confirmed (through Workbench),
  build effort (~days from shape × weight), heaviest shape pill + dot meter.
  Uses `step.cls` / `solutionShape` / `derivedShape` from engine; no re-computation.
- **Gate register** (`rb10GateRegisterHtml`): per-step trusted/proposed row list
  derived from the existing `recipeGateCheck` gate (no new field). Shows open
  gap count and sensitivity warning (`p9Unconfirmed`) in-line.
- **Audit export** (`rb10AuditExportHtml` + `wireRb10`): JSON pack button — gate
  status, open gaps, recipe text, provenance — toast-guarded, never hard-disabled.
  `rb10AuditPackData` assembles the pack; source is `recipeUnitSource` (the
  existing one-point recipe boundary).

`RB10_SHAPE_WEIGHT` const maps shapes (`prompt/rag/tool/deterministic-tool/
agentic/human-in-loop`) to build-weight 0–4.

**Rail-clean:** no scorer, no `patchField`, no server endpoint, no banned metric
language. Existing `recipeBookHtml() +` composition and `Pattern confidence:`
count (2) unchanged — the existing recipe-book test passes without modification.

Files changed: `app.js`, `test/c10-recipe-book.test.mjs`

---

### C-11 · Executive Dashboard — verdict blocks + metric toggle chart  [A] ✓
**Tag:** `phase-4-c11`  **SHA:** 67ea883  
**Gate:** npm 1065/0 (+50 tests in `test/c11-exec-dashboard.test.mjs`)

Three verdict blocks + per-metric toggle chart prepended to the leadership
dashboard (before the existing `dashHeaderHtml` chain; tech path unchanged).

**Verdict blocks (3-column grid):**
- **Return** (blue, #4D8BFF) — net/gross waterfall mini-visual, token-cost watch.
  Headline: formatted net /yr or "—" when no business case computed; never invents numbers.
- **Trust** (blue→pink gradient bar) — ownership bar (AI-led% vs human-led%); headline
  "No — it frees people for better work"; framing: "not reductions"; Workforce → link.
- **Speed** (violet, #9D7BF0) — cycle compression %; solid+dotted bar; deliberation note.

**Metric panel (`ed11MetricPanelHtml`):**
- Segmented control (Value | Hours | Cycle) → `state.ed11Metric`
- Toggle (Gross↔Net / Freed hrs↔FTE / Cycle today↔After AI) → `state.ed11Toggle`
- KPI trio changes per metric; SVG bar chart (`ed11BarsSvg`, 700×200 viewBox)
  with per-step bars derived from `composedAddr` × `timeTaken` (no re-computation of
  domain totals — totals come from `lv` engine aggregate only).

**Executive/Workforce split:** verdict blocks are "executive diagnoses."
"What to do with freed capacity" is Workforce Transformation (C-12), surfaced
only as a navigation pointer (`Workforce Transformation →`).

**New constants:** `ED11_AI_LED`, `ED11_HUMAN_LED`, `ED11_MET`  
**New state keys:** `state.ed11Metric` (default "value"), `state.ed11Toggle` (default true)  
**Modified:** `renderAnalysisTabDashboard` (injects metric panel + verdict row before
leadership sections), `wireDashboard` (calls `wireEd11`)

Files changed: `app.js`, `test/c11-exec-dashboard.test.mjs`

---

### Bugfix · Workbench step name render (namefix)  [standalone] ✓
**Tag:** `phase-4-c-namefix`  **SHA:** b4df5d3  
**Gate:** npm 1066/0 (+1 regression test in `test/c8-workbench.test.mjs`)

`wbStepCardHtml` (app.js ~6421) was reading `step.name` (top-level legacy
field, left blank for all HARVEST-captured sessions) instead of the
canonical cell path used by every other surface.

Fix: `step.name || ...` → `stepDisplayName(step, idx)` → `gridCellValue(step, "name")`
→ `step.cells["name"].value`. Guard: `typeof stepDisplayName === "function"` keeps
old fallback in isolated sandbox contexts.

**cls left alone:** `step.cls` is correctly the canonical source (no grid cell
backs it); it is set during B-6 intake and defaults to `"assembly"` for
pre-five-rung sessions (data state, not a render bug).

**The "assembly / Step N / no actions" session** (Exception Matching Process)
is confirmed as a pre-B-6 thin-capture state. Step names will now render
correctly after this fix; cls and workActions require re-running Discovery.

Files changed: `app.js` (1 line), `test/c8-workbench.test.mjs` (+33 lines)

---

### C-12 through C-13 + A3 + A4  pending

---

## Track D — Eval gate

### D-14 · Eval gate extension N=20→24  pending
