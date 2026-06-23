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
**SHA:** pending  **Gate:** npm 930/0 · engine 369/0

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

### C-8 through C-13 + A3 + A4  pending

---

## Track D — Eval gate

### D-14 · Eval gate extension N=20→24  pending
