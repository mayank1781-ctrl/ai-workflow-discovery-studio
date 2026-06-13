# AI Workflow Discovery Studio — V3 Backlog & Project Plan

> V3 is a refinement-and-extension release on top of the now-complete v2 compiler. The
> theme is: **make the existing depth legible, surface the trust model as a visible product
> value, and add the enterprise pieces a finance firm needs to treat this as a system of
> record** — measured against real usage data, not instinct.
>
> Every item inherits the binding guardrails in `CLAUDE.md` (trust model, provenance,
> explicit-action generation, snapshot exports, vanilla JS SPA / raw Node, deterministic
> tests with no live LLM, no firm names, banned phrase absent). Those are not repeated in
> each item's criteria — they are the universal definition of done below.

## Universal definition of done (applies to every item)

- The test gate stays green and the pass count never drops (currently 130; it should grow).
- New tests are deterministic and require no live LLM or external API.
- No relied-on value is silently invented, dropped, changed, recomputed, or overwritten;
  provenance is preserved; generation happens only on explicit user action; prior versions
  are kept; exports read saved snapshots only.
- Architecture/content guardrails intact (raw Node server not Express, `getField`/`patchField`,
  `toast()` not `showToast()`, no hard-disabled buttons, no invented server scoring endpoint,
  USD/en-US, no firm names anywhere, banned phrase "work with your development team" absent).
- Each item ships as its own pushed branch + PR for manual review/merge in the GitHub web UI.

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
| V3-6 | Portfolio intelligence + business-case scenarios | P2 | M | ~6–10h | persisted sessions |
| V3-7 | Shared, versioned knowledge library | P2 | M | ~5–8h | — |
| V3-8 | IR-level version diff | P2 | S–M | ~3–5h | — |
| V3-9 | Guided first-run / sample workflow | P2 | S–M | ~2–4h | V3-1 |

Total active build time: **~43–73h**. See the phased plan at the end for wall-clock.

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

---

## P1 — Enterprise value (the items that move this toward a system of record)

### V3-3 — AI-policy ingestion

**Why:** Your own docs name this as future. For a finance firm it is the highest-value
enterprise capability: it turns generic advisory caution into caution grounded in *your* actual
policy, which is what makes the output defensible internally.

**What:** Upload an AI policy document; extract its clauses with provenance; let generated
artifacts ground their caution/review language in those clauses.

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

## Phased project plan

Run one sprint per autonomous Claude Code session. Because merges happen manually in the GitHub
web UI, each sprint already has a natural review checkpoint — review the PR, merge, start the
next sprint. Sprints are ordered by leverage and dependency.

| Sprint | Items | Active build time | Notes |
|--------|-------|-------------------|-------|
| 0 — Measure | V3-1 | ~3–5h | Do first. Instrument before refining. |
| 1 — Make trust visible | V3-2 | ~5–8h | Display-only; low risk; high perceived value. |
| 2 — Policy grounding | V3-3 | ~8–14h | Largest single item; review the PR carefully. |
| 3 — Governance | V3-4 | ~6–10h | Touches snapshots/audit — review before merge. |
| 4 — Deployable outputs | V3-5 | ~5–9h | Review config shapes against target surfaces. |
| 5 — Executive view | V3-6 | ~6–10h | Needs persisted sessions; verify in Sprint 0/1. |
| 6 — Polish | V3-7, V3-8, V3-9 | ~10–17h | Can be one combined session or three small PRs. |

**Total active build time: ~43–73h.**

Wall-clock depends almost entirely on how fast you review and merge each PR. If you turn PRs
around same-day, V3 compresses to roughly **2–3 weeks** of light-touch involvement. If reviews
are spread out, it stretches to **4–6 weeks**. The build time itself is not the bottleneck — the
trust-critical sprints (2, 3, 4) are where I'd spend real review attention, and the rest can run
nearly hands-off.

A note on autonomy: Sprints 0, 1, and 6 are safe to run fully autonomous and skim afterward.
Sprints 2–5 touch policy grounding, audit, snapshots, and exports — your trust-critical surface —
so even running autonomously, read those PRs before merging. A green gate at a higher test count
is your primary safety signal; if any sprint's test count drops or leaves the gate red, do not
merge.
