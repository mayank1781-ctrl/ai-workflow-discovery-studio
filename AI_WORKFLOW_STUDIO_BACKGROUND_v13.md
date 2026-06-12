# AI WORKFLOW DISCOVERY STUDIO — BACKGROUND v13
_Last updated: 2026-06-12 · main `410f7fb` · test gate **99/99** · companion to NEW_CHAT_HANDOFF_v13.md_

> v13 note: v12 of this doc was not in the repo; v13 is authored fresh from the PR 31 session.
> Diff against your local v12 before trusting omissions.

## What the app is

A discovery-intake webapp (`discovery-intake-webapp/`) for mapping business workflows and
identifying AI automation opportunities: voice/text discovery interview, document extraction,
a 17-cell-per-step workflow grid, 10-principle opportunity scoring, gated recipe (prompt)
generation, business-case engine, session portfolio with bulk classification review.

## Architecture

- **`app.js`** — browser classic script (touches `document`/`window` at load; cannot be
  imported in Node). All UI + most logic. State in a single `state` object; localStorage +
  server persistence.
- **`server.mjs`** — Node server, `node:sqlite` (`DatabaseSync`), sessions table
  (`id, user_id, data, created_at, updated_at`). Session API, AI proxy endpoints,
  business-case endpoint, startup schema migrations. Optional Azure AD auth gate
  (`/health` bypasses; everything else 401s when armed).
- **Tests** (`test/`, `node --test`, currently **99/99**): the extraction harness
  (`test/helpers/extract.mjs`) brace-extracts real shipped functions/consts from app.js or
  server.mjs and evaluates them with stubbed globals; HTTP tests boot the real server with a
  temp `DATA_DIR` and AI keys explicitly blanked. Structural "pin" tests assert wiring
  invariants (e.g. generation never consults the P9 lock; panels mount on hosts that exist
  in `index.html`).

## Core systems (as of PR 31)

### Grid accessor layer (PR 30)
`getField`/`patchField` are the ONLY cell read/write points (guard test enforces).
Provenance precedence: `user-edited`/`user-stated` > `doc-extracted` > `ai-inferred`;
lower provenance never silently overwrites higher. `patchField` `options.clear` (PR 31) is
the only way to empty a cell — user provenance only.

### Question memory / intent machinery (PR 30, extended PR 31)
`state.questionHistory` keyed by INTENT (sorted cell keys), never wording. Asking dedupes
onto the intent; capture via `patchField` retires (user writes immediately; doc-extracted
above 0.7; ai-inferred only deprioritizes). **PR 31 retirement exception:** emptying a field
reopens its intent now; a material edit keeps it retired but `reaskEligible` (next ask
reopens); trivial edits (normalized-equal or within the bounded typo allowance) do nothing.
Model-generated doc questions map onto cell intents via `modelQuestionIntent` (deterministic
keyword rules; unmapped → stable `model:…` intent that dedupes but can never retire).

### Question surfaces (deliberate funnel — two, not three)
Discovery **KEY QUESTIONS** (≤3: true gaps minus retired, then the ai-inferred confirm lane)
and the **recipe gate panel** (≤3 askable). PR 31-4a: a doc `followUpQuestion` whose mapped
cells intersect a slot's cells supplies that slot's WORDING (canonical intent kept; claim set
ensures one doc question fills at most one slot per surface). The per-artifact evidence-card
question list was removed — its hosts don't exist in `index.html` (see dead-code list).

### Scoring (client-side ONLY — settled)
`getStepOpportunityMeta(step)` → `{label, tier, priority, principleScores}`; 10 principles
scored 1–3 by keyword evidence; total 10–30 → tier (≥24 quick-win, ≥16 strategic, else
speculative); overrides: P9=1 forces compliance, P7=1 caps quick-win to strategic.
`tierSensitivity` finds knife-edge flips / low-data warnings and (PR 31) recomputes LIVE on
every what-if repaint via `composeWhatIfMeta` (an override reads as an assessment, never
"insufficient data"). `explainTierChange` names the decisive principle behind a flip in the
breakdown's own evidence language (compliance flips always pinned to P9; P7 cap to P7;
numeric flips name the largest mover). Banner on the grid tab; toast elsewhere.

### Field-level correction (PR 31)
Every grid-matrix cell is an Edit affordance; merged columns open the floating editor on
their UNDERLYING real cells (provenance badges per row). `applyFieldEdit` →
`patchField('user-edited', 1, refresh)`. Editor placement is viewport-contained
(`computeFieldEditorPosition`, DOM-free + unit-tested). Recipe-card Frequency/Sensitivity
meta values open the same editor.

### P9 confirm-to-lock / unlock (PR 31 S3)
On the scoring breakdown's P9 row. Lock = re-write captured basis cells (`dataSensitivity`,
`regulatoryContext`) at `user-edited` — permanence comes from patchField precedence (no new
flag); re-extraction cannot silently change a locked P9. No basis → "Set sensitivity" routes
to the editor. Unlock = "Reclassify" opens the editor on the basis cells (the tier moves only
by correcting what drove it). **Scoring permanence only — generation never gated; pinned
structurally** (gate/generator/panel never reference the lock; "Generate anyway" present).

### Recipes (PR 30b/33)
Generation routes through the confidence gate ("Generate anyway" always available, nothing
hard-disabled). Prior recipe rotates into `recipeCachePrior` (timestamped, with the labels it
was generated under) ONLY when a new prompt actually lands — exactly one rotation call site.

### Business case (PR 32)
Formula lives in server.mjs only (`computeBusinessCase`, `BC_CONFIG`: 48 working weeks,
role rates analyst 75 / consultant 100 / manager 150 / principal 200, default 100,
formulaVersion 1). Client renders from `state.businessCaseSnapshot` only; explicit recompute
via `/api/business-case` (endpoint stamps `computedAt`); prior snapshot preserved. Portfolio
reads stored snapshots — never recomputes.

### Schema migrations (PR 33)
`SESSION_MIGRATIONS` sequential steps in server.mjs; v1→v2 registered (business case becomes
snapshot-only). Startup batch copies a timestamped `.bak` BEFORE touching anything, migrates
in one transaction, and on failure refuses to start naming the failing row id, the step, the
`.bak` path, and the restore command. Client `migrateSessionState` stays for localStorage —
a lockstep test runs both against the same fixture and fails on drift.

### Bulk classification review (PR 33)
"Classification review" panel in the Open popup (collapsed; zero-step sessions hidden; per-
session collapsed blocks). Confirm/correct pattern + family across sessions; all cross-
session writes go **load → patchField → save** (never raw JSON). A label is **verified**
once its cell carries user provenance — this builds the PR 35 training set (pattern/family
only; sensitivity cells are not labels).

## PR ledger (recent)

- **PR 30 / 30a / 30b** (#128/#129) — accessor layer + provenance badges; question memory;
  gated recipes; evidence tracing. (#129 carries the spec note: unify MODEL-GENERATED
  questions into the intent machinery — deterministic handoff buckets explicitly excluded.)
- **PR 32** (#130) — server business-case engine; snapshot-only client; schemaVersion 2.
- **PR 33** (#131) — migration framework + classification correction + bulk review.
  In-flight fixes: ghost-host re-mount (`#sessionLibraryList` → Open popup) + mount test;
  containment (collapse per session, hide empties). Gate ended 77/77.
- **PR 31** (#132, merged after 33 by design) — field-level correction UX.
  Slices: 1 editor + retirement exception · 1a containment · 2 live re-score +
  tier-change explanation + live warning recompute · 3 P9 lock/unlock ·
  4 model-question unification + Answering Esc · 4a wording substitution into the two
  existing surfaces + dead evidence affordance removed + single-consumption fix.
  Gate ended **99/99**.

## Roadmap

UX/UI polish pass (small PR, list in HANDOFF v13) → **PR 34** (standing roadmap) →
**PR 35** (train on the verified pattern/family label set) → **PR 36** (dead-code sweep:
`renderSessionLibrary`/`#sessionLibraryList`; evidence ghost-hosts `renderEvidenceWorkbench`,
`renderEvidenceReviewPanel`, `evidenceWorkbenchFull`/`Metrics`/`NoteInput` ids + dead
full-card path). Fable 5 window to Jun 22.

## Fixtures

- **TEST A** — happy-path fixture.
- **TEST B** — silent-gate fixture; step 01 "Reconcile client fees". Sensitivity basis
  intentionally EMPTY/gating (preserved expected state). 4 steps observed vs 5 in older doc
  text — reconcile. Unchanged for PR 35 labels (pattern/family untouched).
- Fixtures live in the user's runtime DB / browser localStorage, NOT the repo — the cloud
  container can never read them; verification is the user's browser pass.
