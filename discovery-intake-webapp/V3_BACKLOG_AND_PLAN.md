# AI Workflow Discovery Studio — V3 Backlog & Project Plan

> V3 is a refinement-and-extension release on top of the now-complete v2 compiler. The
> theme is: **make the existing depth legible, surface the trust model as a visible product
> value, and add the enterprise pieces a finance firm needs to treat this as a system of
> record** — measured against real usage data, not instinct. A late addition (V3-10) extends
> this to **durability over time**: an artifact's acceptance criteria only stay meaningful if
> they remain re-checkable as the underlying model changes (see "Strategic context" below).
>
> Every item inherits the binding guardrails in `CLAUDE.md` (trust model, provenance,
> explicit-action generation, snapshot exports, vanilla JS SPA / raw Node, deterministic
> tests with no live LLM, no firm names, banned phrase absent). Those are not repeated in
> each item's criteria — they are the universal definition of done below.

## ✅ Shipped status (updated 2026-06-14) — V3 BUILD COMPLETE

All of **V3-1 → V3-10 are shipped and merged to `main`** (`main` @ `c309225`, gate **272 tests
/ 0 fail**). The P0 foundation (V3-1, V3-2), the P1 enterprise tier (V3-3, V3-4, V3-5, V3-10),
and the **entire P2 tier (V3-6, V3-7, V3-8, V3-9)** are done. Gate-count lineage:
`130 → 149 → 170 → 185 → 199 → 210 → 221 → 237 → 250 → 262 → 272`. The per-item sections below
are the as-built specs of record.

| ID | Item | Priority | Status |
|----|------|----------|--------|
| V3-1 | Product instrumentation / telemetry | P0 | ✅ shipped |
| V3-2 | Trust-legibility UX pass | P0 | ✅ shipped |
| V3-3 | AI-policy ingestion | P1 | ✅ shipped |
| V3-4 | Review/sign-off + cross-session audit trail | P1 | ✅ shipped |
| V3-5 | Spec → importable/deployable configs | P1 | ✅ shipped |
| V3-10 | Living eval suite (track, don't execute) | P1 | ✅ shipped |
| V3-6 | Portfolio intelligence + business-case scenarios | P2 | ✅ shipped (`1c9592c`) |
| V3-7 | Shared, versioned knowledge library | P2 | ✅ shipped (`fa47ddb`) |
| V3-8 | IR-level version diff | P2 | ✅ shipped (`2f8078c`) |
| V3-9 | Guided first-run / sample workflow | P2 | ✅ shipped (`c309225`) — **P2 tier complete** |

## ▶ Forward backlog (post-V3 — specs of record, build only when scheduled)

The next items are written as standalone kickoff specs under `docs/roadmap/` (not built unless
noted). They organize around two complementary axes over the workflow model: the **economic
axis** (how much the work is worth) and the **structural axis** (the shape of the work — where
and why AI helps).

**Forward order (by decision):**

```
V3-14 portfolio capacity  (SHIPPED — merged 3f2c87f)        ← economic axis
   → V3-15 … V3-19 structural axis                          ← shape of the work
   → V3-11 / V3-12 / V3-13 design track                     ← display-only refresh
   → workforce-reimagination                                ← near-future capstone
```

- **V3-14 — Portfolio dimensions & capacity** → [`docs/roadmap/V3-14-portfolio-capacity.md`](docs/roadmap/V3-14-portfolio-capacity.md).
  **SHIPPED — merged at `3f2c87f`** (gate 286). The **economic axis**: departments · personas ·
  FTE-equivalent · project-vs-recurring on V3-6. Value explicit-compute only (never telemetry);
  persona-band rates (never PII); fully-loaded cost **and** bill rate side by side; run-rate kept
  separate from project savings; provenance + confidence on every tag; additive/byte-identical-unused.
- **V3 structural axis (V3-15 → V3-19)** → [`docs/roadmap/V3-structural-axis.md`](docs/roadmap/V3-structural-axis.md).
  The **structural axis** — the spine for understanding WHERE and WHY AI helps, and the substrate
  for workforce-reimagination. V3-15 step typology · V3-16 handoffs + decisions as first-class
  objects (highest-yield) · V3-17 friction lens (annotate-only, user-sourced, separate from
  opportunity) · V3-18 role-centric pivot · V3-19 department heatmap. Two binding cautions: the
  heatmap must wear its uncertainty (computed/stated/inferred always distinguished); role framing
  is leverage / friction-removed, **never** an automatable-% or headcount figure.
- **V3 design track (V3-11 / V3-12 / V3-13)** → [`docs/roadmap/V3-design-track.md`](docs/roadmap/V3-design-track.md).
  Display-only refresh — analysis-tab consolidation, design-language refresh, gradient brand layer —
  bound by the design-integrity rule (gradient = chrome/actions only; meaning-bearing UI flat
  single-hue; signal strength = a shade ramp within ONE hue; category accents teal=experience/grid,
  purple=logic/recipe, pink=data/governance, amber=business-case). **Sequenced to FOLLOW the V3-1
  telemetry, not precede it.**
- **Workforce-reimagination** (near-future capstone) → [`docs/roadmap/V3-workforce-reimagination.md`](docs/roadmap/V3-workforce-reimagination.md).
  Future-state role/workforce design ON TOP of the structural axis. **Hard dependency: requires
  V3-15 → V3-19**, which is why it is near-future, not current scope. Tool generates defensible
  inputs; humans do the judgment-heavy reimagining. Framing: capacity created / leverage gained /
  friction removed — **never** headcount reduction.

**Sequencing note (by decision):** the **structural axis is sequenced BEFORE the design track**
— function before polish. A deliberate consequence: the **V3-19 heatmap ships in the current
design language first** and is design-polished **later by V3-12**. The design track stays gated on
reading the V3-1 telemetry first.

All inherit the universal definition of done below and the push-only + plan-then-stop posture.

## Strategic context (added 2026-06-13)

An external synthesis on the AI-augmented workforce (two talks; see
`STRATEGIC_INPUT_workforce-AI.md` for the full analysis and source caveats) reinforced this
app's core thesis — the durable skill is **precise specification of intent** (context,
explicit acceptance criteria, articulated constraints, decomposition, evals), and the Studio
*is* a spec-compiler for people who can't yet write that spec. The synthesis surfaced exactly
one genuine capability gap against the current roadmap: **evals as a living, recurring layer,
not a one-time artifact** — because models change underneath you and silently regress. That
gap is now captured as **V3-10**. The synthesis is positioning/validation for everything else
and changes no other item's scope; it does add a deck/brief framing recommendation and a
`CLAUDE.md` rule ("track, don't execute"), both recorded as follow-ups, not built here.

## Universal definition of done (applies to every item)

- The test gate stays green and the pass count never drops (currently 162; it should grow).
- New tests are deterministic and require no live LLM or external API.
- No relied-on value is silently invented, dropped, changed, recomputed, or overwritten;
  provenance is preserved; generation happens only on explicit user action; prior versions
  are kept; exports read saved snapshots only.
- Architecture/content guardrails intact (raw Node server not Express, `getField`/`patchField`,
  `toast()` not `showToast()`, no hard-disabled buttons, no invented server scoring endpoint,
  USD/en-US, no firm names anywhere, banned phrase "work with your development team" absent).
- Each item ships as its own pushed branch for review/merge. (Operational note: V3-2 ran
  autonomous git-level merge under the autonomy contract; from V3-3 onward the posture is
  **push-only** — Claude Code pushes the branch, a human reviews and merges. See the handoff.)

## Effort & time scale

Effort: **S** small, **M** medium, **L** large.
Time is *Claude Code active build time* (Opus 4.8, Max, running autonomously in accept-edits
mode), not human-dev time. These are directional estimates only — actual time depends on the
real code shape, test-suite runtime, and how much iteration each item needs. Wall-clock is
longer because of the review/merge checkpoint between sprints.

| ID | Item | Priority | Effort | Active build time | Depends on |
|----|------|----------|--------|-------------------|------------|
| V3-1 | Product instrumentation / telemetry layer | P0 | M | ~3–5h | — |
| V3-2 | Trust-legibility UX pass | P0 | M | ~5–8h | V3-1 (for measuring impact) |
| V3-3 | AI-policy ingestion | P1 | M–H | ~8–14h | — |
| V3-4 | Review/sign-off + cross-session audit trail | P1 | M | ~6–10h | — |
| V3-5 | Spec → importable/deployable config outputs | P1 | M | ~5–9h | — |
| V3-10 | Living eval suite (versioned tests + regression tracking) | P1 | M | ~6–10h | persisted sessions, V3-1, existing test-case generation |
| V3-6 | Portfolio intelligence + business-case scenarios | P2 | M | ~6–10h | persisted sessions |
| V3-7 | Shared, versioned knowledge library | P2 | M | ~5–8h | — |
| V3-8 | IR-level version diff | P2 | S–M | ~3–5h | — |
| V3-9 | Guided first-run / sample workflow | P2 | S–M | ~2–4h | V3-1 |

Total active build time: **~49–83h** (was ~43–73h; +~6–10h for V3-10). See the phased plan
at the end for wall-clock. To keep total scope roughly flat, consider deferring one P2 polish
item (V3-7 or V3-8) in exchange for V3-10, since V3-10 is higher-value for a finance context.

---

## P0 — Foundation (do these first; everything downstream is prioritized better with them)

### V3-1 — Product instrumentation / telemetry layer

**Why:** You cannot refine UX or prioritize features blind. Today the app measures the
*workflow* but not *itself*. This is the prerequisite for evidence-based refinement.

**What:** A lightweight, server-side event layer that records how the product is used, plus a
small internal aggregates view (not exposed to end clients).

Acceptance criteria:
- Emits events for: intake step viewed, intake question skipped, time-to-first-artifact,
  artifact generated, artifact abandoned (generated but never exported/reviewed), renderer/
  target-surface used, export performed, bundle generated.
- Events stored server-side using the existing storage path; an internal aggregates view
  reads them. No client-side third-party analytics.
- A payload scrubber guarantees no firm names and no raw sensitive workflow content enter
  event logs — only structural/metadata signals (counts, types, durations, ids).
- A single config flag disables all emission; when off, zero events are written.
- Tests: each emit fires on the correct user action; the scrubber strips disallowed content;
  the disable flag suppresses every emit; aggregates compute correctly on fixtures.

> Status: SHIPPED + reconciled to this canonical 8-event spec, verified at `main` `b41ba30`,
> gate 162. The business-case dollar figure is NOT telemetered (`value_num` carries only the
> readiness score 0–100). See the handoff for the verified receipts.

### V3-2 — Trust-legibility UX pass

**Why:** Your trust model and four-concept rigor (extraction confidence / opportunity /
readiness / provenance) are your best asset and are currently mostly invisible. This converts
hidden rigor into perceived value without touching the underlying logic.

**What:** Display-only changes that make depth legible and elevate the next action.

Acceptance criteria:
- Every relied-on grid value shows an inline source + confidence indicator *without a click*;
  the indicator reads from existing provenance/confidence via `getField` and never recomputes.
- A plain-language "Why you can trust this" panel states, in non-technical terms: nothing is
  recomputed silently, sources are tracked, outputs change only on your action, prior versions
  are kept.
- The intake screen elevates the single next-best action above the other cockpit metrics
  (progressive disclosure — the other metrics remain available on expand).
- Each step shows a composite state badge; the four dimensions are revealed on hover/expand.
- The artifact card opens on an Overview that surfaces recommended surface, readiness, and top
  blockers; the remaining tabs are secondary.
- Tests: indicators render from stored provenance/confidence sources (assert no recompute path
  is invoked); the trust panel renders; Overview surfaces the three key fields.

> Status: IN FLIGHT on branch `feat/v3-2-trust-legibility` (telemetry YES — adds a single
> `why_panel_opened` event through the existing sanitizer; canonical set 8 → 9). Awaiting
> build report; verify gate + SHA on landing.

---

## P1 — Enterprise value (the items that move this toward a system of record)

### V3-3 — AI-policy ingestion

**Why:** Your own docs name this as future. For a finance firm it is the highest-value
enterprise capability: it turns generic advisory caution into caution grounded in *your* actual
policy, which is what makes the output defensible internally.

**What:** Upload an AI policy document; extract its clauses with provenance; let generated
artifacts ground their caution/review language in those clauses.

> Framing note (added 2026-06-13): the workforce synthesis frames "context" more broadly than
> a policy document — decision frameworks, escalation rules, institutional standards. Keep V3-3
> tight (policy-doc ingestion only); the broader organizational-context capability is real but
> lives closer to V3-7's territory, not here.

Acceptance criteria:
- A policy document can be uploaded through the existing upload mechanism.
- Policy clauses are extracted with provenance using the existing harvest/provenance model.
- Artifact caution and human-review language can cite an uploaded policy clause as its source
  instead of generic advisory text — but never asserts "compliance approved."
- Uploaded policy content is itself a relied-on value: provenance shown, not silently changed,
  preserved across regeneration.
- With no policy uploaded, the app falls back to the existing generic advisory caution.
- Test fixtures use neutral sample policy text; no firm names persisted anywhere.
- Tests: policy parse → clause extraction; caution text references the correct clause; absent
  policy → generic fallback; no "approved" claim is ever emitted.

### V3-4 — Review/sign-off + cross-session audit trail

**Why:** Regulated use needs a defensible bridge from "Draft" to "controlled use" with a record
of who/when — without the app pretending to grant compliance approval. Fits cleanly on top of
your snapshot model.

**What:** A reviewer can mark an artifact reviewed (locking that snapshot), plus an append-only
audit log across the engagement.

Acceptance criteria:
- A reviewer can mark an artifact "Reviewed for controlled use," capturing reviewer identity
  (from the existing Azure AD auth context), timestamp, and the exact snapshot reviewed.
- Marking reviewed locks that snapshot; later regeneration creates a new version and never
  alters the reviewed one.
- No label ever says "compliance approved."
- An append-only audit trail records who generated/changed/exported/reviewed what and when,
  queryable per engagement and snapshot-backed.
- Audit entries cannot be silently edited or deleted; exporting the audit reads stored entries
  only.
- Tests: review locks the snapshot; regeneration preserves the reviewed version; audit log is
  append-only (no edit/delete path exists); no "approved" phrasing appears.

### V3-5 — Spec → importable/deployable config outputs

**Why:** Artifacts are called "configuration-ready" but stop at prose. Making them actually
importable is the line between "a nice document" and "a thing I deployed in ten minutes" —
and it stays inside your no-integration rule because you produce a config, not a live call.

**What:** Upgrade the renderers so their outputs are directly usable.

Acceptance criteria:
- The Custom GPT renderer emits a valid, copy-paste configuration block.
- The M365 Copilot / Copilot Studio renderer emits an importable, documented structure.
- The ChatGPT prompt has a one-click copy block.
- Every generated config states the no-integration assumption and labels any integration as a
  future candidate; no fake API endpoints, schemas, or writeback claims appear.
- Configs are snapshot-backed and provenance-tagged like any artifact; regeneration preserves
  the prior version.
- Tests: config validity (shape/schema assertions per surface); no-integration clause present;
  no fake-integration claims; copy block present; prior version preserved on regeneration.

### V3-10 — Living eval suite (versioned tests + regression tracking)

**Why:** The app already *generates* test cases, but they're a one-time deliverable in the
bundle. The external workforce synthesis (and, more concretely, finance-firm model risk) makes
the operational point: an artifact's acceptance criteria only stay meaningful if they remain
**re-checkable over time**, because the vendor can swap the underlying model and behavior drifts
silently. "We generated test cases" must become "we can show this artifact still meets its
acceptance criteria across versions and model changes" — which is what makes the output
defensible to a risk committee. This reuses substrate you already have (generated test cases +
versioned snapshots + V3-1 telemetry) rather than inventing new machinery.

**What:** Promote an artifact's generated test cases into a **named, versioned eval suite**, plus
a surface to **record and track** pass/fail results over time and across artifact/model versions.
**Track, do not execute** — the app never calls a live model to run an eval; it structures the
suite and records outcomes a user (or an external process) supplies. This preserves the
no-integration boundary and the "deterministic tests, no live LLM" rule exactly.

Acceptance criteria:
- An artifact's generated test cases can be saved as a named, versioned eval suite,
  snapshot-backed and provenance-tagged like any artifact; regeneration preserves the prior
  suite version.
- Each eval case supports a known-good expectation **and** at least one negative / anti-goal case
  (the "plausible but wrong" failure the spec must guard against — the lesson of the 2.3M-
  conversation cautionary tale in the synthesis).
- A results log records pass / fail / not-applicable per case per run, with the artifact version,
  a user-supplied model/version label, and a timestamp; the log is append-only and
  snapshot-backed (no silent edit or delete path).
- The app **never** calls a live model to run the eval — results are recorded, not executed; the
  no-integration assumption is stated on the suite, and no fake "auto-run" or live endpoint
  appears.
- A regression view shows, for a suite, how results changed across runs/versions (read-only diff
  over stored results; identical runs produce an empty diff).
- With no results recorded, the suite shows "not yet evaluated" and never fabricates a pass.
- Tests (deterministic, no live LLM): suite save + version preserved on regeneration; negative-
  case structure present; results log is append-only (assert no edit/delete path exists);
  regression diff computed from stored results only and read-only; absent-results renders
  "not yet evaluated" and never a fabricated pass; no live-model-call path exists anywhere in the
  eval flow.

> Build note: when this ships, add the **"track, don't execute — the app never calls a live model
> to run an eval"** rule to `CLAUDE.md` as a binding guardrail. Posture: push-only (trust-critical;
> touches append-only records, same family as V3-4).

---

## P2 — Executive view & polish

### V3-6 — Portfolio intelligence + business-case scenarios

**Why:** The cross-workflow view is what gets budget, and scenario comparison makes the business
case boardroom-grade. Both build directly on existing data and your explicit-compute posture.

**What:** A firm-wide value×readiness map across mapped workflows, and side-by-side business-case
scenarios.

Acceptance criteria:
- A cross-workflow view ranks mapped workflows by value × readiness and clusters them by shared
  knowledge sources/systems; reads persisted session data; current-session vs portfolio metrics
  stay separated.
- The business case supports named scenarios the user computes explicitly, sees as a range, and
  compares side by side; every scenario is snapshot-backed and never silently recomputed.
- Tests: portfolio aggregation is correct on fixtures; scenario compute is explicit and
  snapshotted; a saved scenario is never recomputed in the background.

### V3-7 — Shared, versioned knowledge library

**Why:** Knowledge is per-artifact today; a shared library cuts rework and improves consistency
across an engagement.

**What:** Reusable, versioned knowledge items referenced by recipes.

Acceptance criteria:
- Knowledge items live in a shared, versioned library and can be referenced by multiple recipes.
- A reference carries provenance back to the library item.
- Editing a library item creates a new version and never silently changes recipes already using a
  prior version.
- Tests: reuse links provenance; edit creates a version; existing recipe references stay stable.

### V3-8 — IR-level version diff

**Why:** The Agent Recipe IR is your crown jewel and is probably underused. A version-to-version
IR diff turns "trust me, prior versions are preserved" into something the user can *see*.

**What:** For any multi-version artifact, show what changed at the IR level and why.

Acceptance criteria:
- For an artifact with multiple versions, the app shows an IR-level diff (which fields changed,
  with the design-choice/assumption context) computed from two stored IR snapshots.
- The diff is read-only and never recomputes either IR; identical IRs produce an empty diff.
- Tests: diff is computed from two stored IRs; identical IRs → empty diff; the diff path is
  read-only.

### V3-9 — Guided first-run / sample workflow

**Why:** The app is conceptually dense; letting a new user *see* a finished recipe before building
one sharply improves adoption.

**What:** A first-run experience with a pre-loaded neutral sample.

Acceptance criteria:
- A first session offers a pre-loaded, clearly labeled sample workflow that walks intake →
  recommended artifact.
- The sample uses no firm names and is excluded from portfolio aggregates by default unless the
  user explicitly keeps it.
- Tests: the sample loads; it is flagged and excluded from portfolio metrics by default.

---

## Design refresh (post-telemetry) — design track (added 2026-06-13)

> A future **design track**, sequenced **after V3 completes and the V3-1 telemetry is read**, so the refresh follows where users actually stall rather than guessing. **Not part of current V3 scope** — these are write-ups for later (V3-11+ territory); nothing here is built and none of it touches `app.js` until scheduled. Deliberately kept out of the effort table and the phased plan above until then. Each entry inherits the Universal definition of done plus the design-integrity rule below.

**The design-integrity rule (binding for this track):**
- **Gradients are chrome/action only** — the brand-signature hairline, the primary Generate button, the active segmented tab, the readiness-*progress* fill bar, the recipe-header signature.
- **Meaning-bearing UI stays flat, single-hue** — a reviewer must read a signal at a glance (the readiness *badge* "Usable with caveats", a category accent, an event-type dot). A gradient there muddies the signal.
- **Signal STRENGTH is a shade ramp within ONE hue — not a gradient.** Hue = the signal *type*; shade = the *level* (high ≈600–800, medium ≈200–400, low ≈50–100), same hue throughout.
- **Category accents (architecture-page family):** teal = experience/grid, purple = logic/recipe, pink = data/governance, amber = business-case.
- Reference (the design inspiration mock): gradient on the top signature bar, "Generate artifact", the active "Overview" tab, and the 72/100 readiness-progress fill; flat single colors on the category-accent cards, the event-type status dots, and the green "Usable with caveats" badge.

### V3-11 — Analysis-tab consolidation (read-only activity feed + consolidated recipe view)

**Why:** The analysis tab is where a reviewer lands to judge a recipe, but the trust signals it already stores — who reviewed, what was exported, when policy was cited, when something was generated or recomputed — are scattered and under-surfaced. One consolidated view makes the recipe's history and current output legible at a glance: the same "make stored rigor visible" goal as V3-2, extended to the recipe surface.

**What:** A two-pane restyle of the analysis tab — a left-rail **read-only activity feed** rendering already-stored audit/telemetry events, and a right-side **consolidated recipe output view** restyling the existing artifact card/overview. Mounts in `renderAnalysisTabRecipe`; **augments** the tab and does **not** replace or alter the intake flow.

Acceptance criteria:
- The left rail renders a chronological feed of events **already stored** on the session blob (review / export / generate / recompute / policy-citation / ingest). It is a **pure view**: reads stored events via the existing accessor, **recomputes nothing**, writes nothing, triggers no generation.
- Each row uses a flat, single-hue event-type dot — reviewed = teal · exported = blue · generated = purple · policy = pink · recomputed = amber — flat color encoding event *type*; no gradient on a meaning-bearing dot.
- The right pane restyles `artifactCompilerCardHtml` / `artifactOverviewHtml` only — same fields, same readiness label, same chips ("Provenance tracked", the config block, "N audit events"); the recipe-header signature hairline may carry the brand gradient (chrome), the readiness *badge* stays flat.
- Nothing is recomputed, re-fetched, or re-derived to populate either pane; an absent event or field renders an explicit empty / "none recorded" state and never a fabricated one.
- Display-only: the IR, snapshots, provenance, and event log are untouched; the seven existing renderers' output contracts are unaffected except for styling.
- Tests (deterministic, no live LLM): the feed renders from stored events only and **asserts no recompute/generation path is invoked** (the same no-recompute guarantee the rest of the app carries); absent events → explicit empty state, never a fabricated event; the right pane surfaces the same readiness/provenance fields as the current overview; no write/generate path exists in the tab's render flow.

> Sequencing: best **after the V3-1 telemetry is read** — the feed's event vocabulary and ordering should follow what reviewers actually look for. Lowest-risk of the three (additive, display-only). Push-only.

### V3-12 — Brighter design-language refresh (readiness badges · four-signal vocabulary · category accents)

**Why:** The app's rigor — the four independent signals and the readiness vocabulary — is its best asset and currently reads as flat and muted. A brighter, consistent visual language makes that rigor feel like the premium, legible product it is, without changing any underlying logic or scoring.

**What:** A display-only refresh of the readiness badges, the four-signal indicators, and the per-domain category accents, applying the design-integrity rule consistently across the render surface.

Acceptance criteria:
- Readiness **badges** (Ready / Usable with caveats / Draft until confirmed / Not enough information) render as flat, single-color chips — one fixed color per label, read from the existing readiness value; never a gradient, never recomputed.
- Each of the four signals (extraction confidence / opportunity / readiness / provenance) gets a fixed hue; **strength** within a signal is a **shade ramp in that one hue** (high ≈600–800 / medium ≈200–400 / low ≈50–100) — a flat fill chosen from the stored value, explicitly **not a gradient**.
- Category accents follow the architecture-page family (teal = experience/grid, purple = logic/recipe, pink = data/governance, amber = business-case), applied as flat accents (e.g. the category-card top borders in the mock).
- The four signals stay visually distinct and are never collapsed into one combined color or score.
- Purely presentational: no `getField` / provenance / readiness value is altered, recomputed, or re-derived; readiness label text and thresholds are unchanged.
- Tests (deterministic, no live LLM): each readiness label maps to its fixed flat color; the strength→shade mapping picks the correct stop per band from a stored value (and is asserted to be a single-hue flat fill, not a gradient); the four signals remain distinguishable; **no recompute path is touched** by any badge/indicator render.

> Risk + sequencing: **largest surface area** and the most cautious of the three — it touches many render functions guarded by the "seven distinct renderers" / trust-invariant tests, so a styling change must not alter any renderer's output contract or collapse the four signals. Schedule **after V3-1 telemetry is read** and review the diff against those guard tests carefully. Push-only.

### V3-13 — Gradient palette as a brand-and-action layer

**Why:** A single, recognizable gradient identity (teal → blue → purple → pink → amber) gives the product a branded, premium feel and a consistent way to mark "this is an action / this is brand chrome" — without ever bleeding into the flat colors that carry meaning.

**What:** Introduce the brand gradient as a thin chrome/action layer over the flat signal colors: the brand-signature hairline, the primary Generate action, the active segmented tab, and the readiness-progress fill.

Acceptance criteria:
- The gradient appears **only** on chrome/action surfaces: the top brand-signature hairline, the recipe-header signature, the primary **Generate artifact** button, the active segmented tab, and the readiness-*progress* fill bar (0–100). Secondary actions (e.g. **Copy config**) and all meaning-bearing surfaces stay flat.
- No meaning-bearing element (readiness badge, category accent, event-type dot, signal-strength indicator) ever receives the gradient.
- Presentation only — it encodes nothing, reads no value, changes no logic; the readiness-progress *fill width* still comes from the stored readiness score (e.g. 72/100), only its color treatment is the gradient.
- A single source-of-truth gradient token is reused everywhere it appears (no ad-hoc per-component gradients drifting out of sync).
- Tests (deterministic, no live LLM): the gradient token is present on the designated chrome/action surfaces and **absent** on every meaning-bearing surface (badge / accent / dot / strength indicator); the readiness-progress fill width still derives from the stored score; no value/recompute path is touched by applying the gradient.

> Sequencing: pairs naturally with V3-12 (same refresh) but is smaller and lower-risk, being confined to chrome. **After V3-1 telemetry is read.** Push-only.

---

## Phased project plan

Run one sprint per autonomous Claude Code session. Each sprint has a natural review checkpoint —
review the branch, merge, start the next sprint. Sprints are ordered by leverage and dependency.

| Sprint | Items | Active build time | Notes |
|--------|-------|-------------------|-------|
| 0 — Measure | V3-1 | ~3–5h | Done. Instrument before refining. |
| 1 — Make trust visible | V3-2 | ~5–8h | Display-only; low risk; high perceived value. In flight. |
| 2 — Policy grounding | V3-3 | ~8–14h | Largest single item; review the branch carefully. Push-only. |
| 3 — Governance | V3-4 | ~6–10h | Touches snapshots/audit — review before merge. Push-only. |
| 4 — Deployable outputs | V3-5 | ~5–9h | Review config shapes against target surfaces. Push-only. |
| 5 — Living evals | V3-10 | ~6–10h | Track-don't-execute; append-only results. Push-only. Pairs with Sprint 3. |
| 6 — Executive view | V3-6 | ~6–10h | Needs persisted sessions; verify in Sprint 0/1. |
| 7 — Polish | V3-7, V3-8, V3-9 | ~10–17h | Can be one combined session or three small PRs. Consider deferring one to offset V3-10. |

**Total active build time: ~49–83h.**

Wall-clock depends almost entirely on how fast you review and merge each branch. If you turn
reviews around same-day, V3 compresses to roughly **2–3 weeks** of light-touch involvement. If
reviews are spread out, it stretches to **4–6 weeks**. The build time itself is not the
bottleneck — the trust-critical sprints (2, 3, 4, 5) are where I'd spend real review attention,
and the rest can run nearly hands-off.

A note on autonomy: Sprints 1, 6, and 7 are the lowest-risk. Sprints 2–5 touch policy grounding,
audit, snapshots, exports, and eval records — your trust-critical surface — so from V3-3 onward
the posture is **push-only**: Claude Code pushes the branch, a human reviews the diff and merges.
A green gate at a higher test count is your primary safety signal; if any sprint's test count
drops or leaves the gate red, do not merge.
