# V3-14 — Portfolio dimensions & capacity (spec of record)

> **Status:** forward backlog — **not built.** Written in the V3-x kickoff structure so it
> can double as the Claude Code kickoff when scheduled. Posture when built: **push-only +
> plan-then-stop**, deterministic gate **strictly above the standing floor (272 at `c309225`)**,
> 0 fail, no live model. Inherits every binding guardrail in `CLAUDE.md`.
>
> Builds directly on V3-6 (portfolio intelligence + business-case scenarios). Read the
> `aiwfds-v36-map` notes and this doc together before planning.

## Goal

Extend the cross-workflow portfolio (V3-6) from a value × readiness map into a **capacity
view**: group mapped workflows by **department** and **persona/role**, express effort in
**FTE-equivalent**, and keep **recurring run-rate** separate from **one-off project savings**.
It answers "where does AI assistance free up the most capacity, by team and role" — using
**only** values the user explicitly computed, with persona-band economics (never individual
pay), and clear "not computed" states instead of fabricated numbers.

This is an executive lens on data the app already holds. It does not change extraction,
scoring, the IR, or any artifact.

## Locked decisions — HARD REQUIREMENTS (do not re-litigate)

1. **Value is explicit-compute only — NEVER telemetry.** The dollar/hours value of any
   workflow comes only from a business-case snapshot the user ran (`businessCaseSnapshot`,
   and named `businessCaseScenarios`). Telemetry stores no dollar figure (`value_num` is the
   readiness score 0–100). A workflow with `valueComputed:false` contributes **nothing** to
   any capacity total — it is shown as "value not computed," **never as $0**.
2. **Persona/role-band rates, NEVER individual salaries.** All economics use role/persona
   bands (extends `BC_CONFIG.roleRates`), never a named person's pay (PII). A blank rate for a
   persona ⇒ that persona's cost is **"not computed"** and is excluded from cost totals —
   never fabricated or defaulted silently.
3. **Show fully-loaded cost AND bill rate side by side**, each explicitly labelled. The two
   are different lenses (internal cost-to-serve vs. external/recovered value) and are never
   merged into one number.
4. **Capacity inputs are explicitly user-supplied.** A rate/assumptions table (extending
   `BC_CONFIG` shape) plus a **cadence** field (how often the recurring work runs) are entered
   by the user. Nothing is auto-derived or inferred. With the table empty, the capacity view
   shows "inputs needed," not estimates.
5. **Estimated, not "real."** Every figure is labelled an estimate. **Recurring run-rate is
   kept strictly separate from one-off project savings** (never blended into a single total).
   Shared people/steps across workflows are **de-duplicated** so the same capacity is not
   counted twice.
6. **Provenance + confidence on every department/persona tag.** A tag carries its source
   (`user-stated`/`user-edited`/`doc-extracted`/`ai-inferred`) and confidence, shown via the
   existing provenance indicator. **An inferred tag never hardens into asserted** — it stays
   inferred until a user confirms it (the V3-2/`patchField` precedence discipline).
7. **Derived/additive only.** No grid writes (no `patchField` from this feature), no server
   scoring endpoint, byte-identical output when the feature is unused. Standard rails: no firm
   names, banned phrase absent, USD/en-US, raw Node server.

## What exists to reuse (real names — confirm at build)

- **Portfolio core (V3-6):** `buildPortfolioModel(items, currentSessionId)` and
  `portfolioItemFromSession(entry, currentId)` — value from stored `businessCaseSnapshot`
  only; `isCurrent`/`isSample` exclusion pattern; `portfolioRankScore`; `buildPortfolioClusters`
  (the de-dup-by-shared-token analog); `portfolioIntelligenceHtml` mount in the Opportunities
  tab. Capacity grouping is a new aggregation layer **over the same items** — reuse, don't fork.
- **Business-case economics:** `BC_CONFIG` (`workingWeeks: 48`, `defaultRate: 100`,
  `roleRates: { analyst 75, consultant 100, manager 150, principal 200 }`, `formulaVersion`) +
  `computeBusinessCase(steps, conversationText, userRole, options)` in `server.mjs` — the single
  source of the formula. V3-6 already added an additive `options.scenarioRate`/`pinRole` that
  pins a rate above the Settings override; the capacity rate/assumptions table follows the same
  additive, user-supplied pattern (and `businessCaseScenarios` shows a range).
- **Persisted sessions:** `getCombinedSessionLibrary()` (the portfolio's data source);
  current-session-vs-portfolio separation already enforced. Departments/personas are read from
  each session's grid (`personaActors` cell) + a new explicit tag; **never** from telemetry.
- **Provenance:** `getField`/`patchField`, `GRID_SOURCE_RANK`
  (`user-edited`/`user-stated`/`doc-extracted`/`ai-inferred`), `provenanceBadgeHtml(source,
  confidence)` (add a capacity-relevant display source if needed — display only, like V3-7's
  `knowledge-library`; never into `GRID_SOURCE_RANK`).
- **Additive persistence (if a capacity table needs storage):** the V3-7 additive SQLite table
  pattern (`knowledge` table mirrors `sessions`; per-user; empty ⇒ no effect). A capacity
  rate/assumptions table would mirror it, OR ride the session blob like `businessCaseScenarios`
  — decide in the plan (see below).
- **Honesty discipline:** the "Synthetic / sample" + `isSample` exclusion (V3-9) and the
  "Illustrative" labelling discipline from the product brief.

## Decisions to surface in the plan (do not pick silently)

- **Capacity-table storage:** additive SQLite table (shared across workflows, like V3-7
  `knowledge`) vs. on the session blob (per-engagement, like `businessCaseScenarios`). Capacity
  bands are arguably engagement-wide → lean shared table, but confirm. Byte-identical-when-unused
  either way.
- **Department/persona tagging:** reuse the existing `personaActors` grid cell + a new explicit
  `department` tag, vs. a separate capacity-only tag layer. Either way: provenance + confidence,
  inferred-never-hardens.
- **FTE-equivalent definition:** annual hours ÷ a user-supplied hours-per-FTE-year (default
  surfaced from `BC_CONFIG.workingWeeks`, explicitly editable) — confirm the denominator and that
  it is user-supplied, not inferred.
- **De-dup rule for shared people/steps:** by normalized persona+step token (the
  `portfolioSessionTokens` analog) vs. an explicit user "shared across N workflows" marker.
- **Run-rate vs project split presentation:** two separate totals/columns (recommended) vs. a
  single toggle — must never blend.

## Data flow (intended)

```
getCombinedSessionLibrary()  →  portfolioItemFromSession (+ department/persona tags w/ provenance)
        ↓  (exclude isCurrent + isSample; value from stored business-case only)
buildPortfolioCapacityModel(items, capacityTable)   [PURE · read-only · deterministic]
   group by department → persona band
   cost  = explicit hours × persona band rate (fully-loaded)   — blank band ⇒ "not computed"
   bill  = explicit hours × persona band bill-rate              — shown beside cost, labelled
   FTE   = recurring annual hours ÷ user-supplied hours-per-FTE
   de-dup shared persona/steps; keep run-rate and project totals SEPARATE
        ↓
renderPortfolioCapacity(model)  — estimate labels, "not computed" states, provenance badges
```
No model call, no grid write, no scoring endpoint, no recompute of any stored value.

## Trust-invariant story

- Value strictly from explicit business-case snapshots; `valueComputed:false` ⇒ excluded,
  never $0. Telemetry never feeds a dollar/hours figure.
- Persona bands only (no PII); blank band ⇒ "not computed," never fabricated.
- Fully-loaded cost and bill rate are distinct, both labelled; run-rate vs project never blended;
  shared capacity de-duplicated.
- Department/persona tags carry provenance + confidence; inferred never hardens to asserted.
- Additive + derived: byte-identical output when the capacity table is empty/unused; no grid
  writes; no server scoring endpoint; raw Node; USD/en-US; no firm names; banned phrase absent.

## Test plan (deterministic, no live LLM)

- `buildPortfolioCapacityModel` aggregates correctly on fixtures: department/persona grouping,
  FTE math, de-dup of shared persona/steps.
- A `valueComputed:false` workflow contributes nothing (not $0) to any capacity total.
- A blank persona-band rate ⇒ that persona's cost is "not computed," excluded from totals.
- Fully-loaded cost and bill rate are computed and surfaced **separately**; run-rate and project
  totals never combine.
- Capacity inputs are read from the user-supplied table only — assert no auto-derivation/inference
  path; with the table empty, the model is the empty/"inputs needed" state.
- Department/persona tag provenance + confidence preserved; an inferred tag is never emitted as
  asserted.
- Source-level: the capacity path makes no model call, no `patchField`/grid write, no scoring
  endpoint; **byte-identical output when the feature is unused.**
- Standard-rails guards: no firm names, banned phrase absent.

## Expected gate delta

Additive feature ≈ **+12–18 tests**, ending well above the standing floor (272). Exact count set
at plan time; the rule is unchanged: end **strictly above** the current main count, 0 fail.
