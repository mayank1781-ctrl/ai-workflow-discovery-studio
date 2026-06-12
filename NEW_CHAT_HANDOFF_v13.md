# NEW CHAT HANDOFF — v13
_Last updated: 2026-06-12 · after PR 31 (#132) merged · main at `410f7fb` · test gate **99/99**_

> v13 note: v12 of this doc was not in the repo; v13 is authored fresh from the PR 31 session.
> Diff against your local v12 before trusting omissions.

## Current state

- **main:** `410f7fb` — "Merge pull request #132" (PR 31, field-level correction UX). Working tree clean.
- **Test gate:** `npm test` un-piped = **99/99**; `node --check` clean on `app.js` + `server.mjs`.
- **Model window:** Fable 5 available to **Jun 22**.

## Next action

1. **UX/UI polish pass** — its own small PR (see Polish list below).
2. Then **PR 34 → PR 35 → PR 36** in order (35 trains on the verified pattern/family label set built by PR 33's bulk review; 36 is the dead-code sweep; 34 per the standing roadmap).

## Working agreement (unchanged ritual)

- Branch-per-PR off latest main (`prNN-<slug>`). Propose the approach BEFORE writing code; wait for go.
- **Slice protocol:** report and STOP after each slice; push after each. Gates per slice: `node --check` both files + `npm test` un-piped at full count + new executed tests.
- User browser-verifies between slices (fixtures below). Assistant opens the PR after the final slice + go; **user merges — assistant never merges**.
- **Container resets are routine** (3+ this session): on resume, post branch-state proof (`git branch -vv && git log --oneline -3 && git ls-remote origin <branch>`), recover via `git fetch origin <branch>` + re-checkout. Push-after-every-slice exists because of this.
- House rules: `toast()` not showToast · never hard-disable buttons · inline hex only · no firm names · USD/en-US only · **all grid access via `getField`/`patchField`** (guard test enforces).

## PR history (recent)

| PR | # | Result |
|---|---|---|
| PR 30 / 30a/b | #128/#129 | Accessor layer + provenance, question memory (intent dedupe + retirement), gated recipe generation ("Generate anyway" never disabled), evidence tracing |
| PR 32 | #130 | Server-only business-case formula; snapshot-only client (explicit recompute, prior preserved); schemaVersion 2 |
| PR 33 | #131 | Schema migration framework (startup batch, timestamped `.bak`, refuse-to-start naming row+step+restore cmd; 147 sessions migrated cleanly) + classification correction (pattern/family chips, recipe prior rotation-only-on-landing, Portfolio bulk review building the PR 35 verified label set). Gate 77/77 |
| **PR 31** | **#132** | **MERGED** — field-level correction UX: 4 slices + 1a containment + 4a wording-substitution. Gate now **99/99** |

PR 31 slices: (1) grid-matrix field editor + retirement exception; (1a) editor viewport containment; (2) live re-score + tier-change explanation banner + live tierSensitivity recompute; (3) P9 confirm-to-lock/unlock + recipe-card meta affordances; (4) model questions → intent machinery + Answering-banner Esc; (4a) doc-question wording substitution into the two existing ≤3 surfaces, dead evidence-card affordance removed, single-consumption claim-set fix.

## Settled decisions (do not relitigate)

- **Scoring is client-side only** — `getStepOpportunityMeta` is the single source; NO server scoring endpoint. Live re-score = synchronous client recompute.
- **Tier-change banner is grid-tab-only**; other surfaces toast the explanation instead.
- **P9 lock = provenance promotion** (basis cells re-written at `user-edited`); permanence comes from patchField precedence, no new flag; **generation untouched — structurally pinned** ("Generate anyway" present, nothing hard-disabled).
- **Handoff question buckets are deterministic templates, NOT model questions** — the #129 spec note covers model-generated questions only. Do not restructure the buckets.
- **Wording-substitution funnel:** doc-extraction `followUpQuestions` upgrade canonical phrasing in the two existing ≤3 surfaces (Discovery KEY QUESTIONS + recipe gate panel), **single consumption per surface** (claim set), **NO third surface by design — do not rebuild the evidence-card list**. Intents/slots/dedupe/retirement unchanged.
- **Field-editor materiality rule:** normalized-equal (case/whitespace/punctuation) or within the typo allowance (bounded edit distance ≤ max(2, 20% of longer)) = trivial — no question-memory effect. **Emptying reopens the intent now; a material change keeps it retired but re-ask eligible.** Clears are user-only (`patchField` `options.clear`).
- Earlier settled (carried): provenance precedence user-edited/user-stated > doc-extracted > ai-inferred, never silently downgraded · recipe prior rotates ONLY when a new prompt lands · business case is snapshot-only, computed on explicit request, server formula · migrations: `.bak` before touching anything, refuse-to-start names row + step + restore command · bulk cross-session writes go load → patchField → save, never raw JSON · "verified" label = user provenance on the cell · mount panels only on hosts that exist in `index.html` (ghost-host lesson, twice).

## Carry-items

- **PR 31 carry-items: ALL DONE** (retirement exception · live warning recompute · model-question unification · Answering-banner escape).
- **PR 36 dead-code list:**
  - `renderSessionLibrary` / `#sessionLibraryList` + its no-op callers (from PR 33).
  - **Evidence ghost-hosts (new):** `renderEvidenceWorkbench`, `renderEvidenceReviewPanel`, and the `evidenceWorkbench`, `evidenceWorkbenchFull`, `evidenceWorkbenchMetrics`, `evidenceNoteInput`, `evidenceReviewPanel` ids + the dead full-card render path (`evidenceArtifactCard` "full") — hosts absent from `index.html`; render fns early-return every call.
- **Polish list (next PR):**
  - Loaded session shows "Untitled Workflow" instead of the session name.
  - Stray "Untitled discovery" sessions inflating the Open count (49→50 observed).
  - From PR 33: classification panel UX (filter/search, popup dim, white-bar question) · step meta-row "Confidence:" reads the aiPattern cell (0%→100% on edit; misleading) · toast copy polish · family chip discoverability.

## Watch items

- **TEST B shows 4 steps but docs say 5** — reconcile the fixture description.
- **3+ container resets this session** — ritual unchanged (branch-state proof + fetch/re-checkout), keep pushing per slice.
- **TEST B unchanged for PR 35 labels** — sensitivity cells were exercised during verification but restored; pattern/family labels untouched.

## Fixtures

- **TEST A** — primary happy-path fixture.
- **TEST B** — the silent-gate fixture. **Step 01 ("Reconcile client fees") sensitivity basis (`dataSensitivity`/`regulatoryContext`) remains EMPTY and gating — this is the expected, deliberately preserved state** (cleared during PR 31 checks; P9 shows "Set sensitivity"). 4 steps observed (see watch item). Lives in the user's runtime DB/localStorage, not the repo.
