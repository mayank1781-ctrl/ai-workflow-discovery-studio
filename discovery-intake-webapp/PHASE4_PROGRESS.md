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

### B-6 · Five-rung intake capture (UI)  pending

---

## Track C — UI surfaces

### C-7 through C-13  pending

---

## Track D — Eval gate

### D-14 · Eval gate extension N=20→24  pending
