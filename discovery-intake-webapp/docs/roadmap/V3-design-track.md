# V3 design track (post-telemetry) — V3-11 / V3-12 / V3-13

> **Status:** forward backlog — **not built, and intentionally sequenced to FOLLOW the V3-1
> telemetry, not precede it.** The refresh should follow where users actually stall, not a
> guess. Display-only: nothing here changes the IR, scoring, provenance, snapshots, or any
> artifact's output contract. Posture when built: **push-only + plan-then-stop**, gate
> **strictly above the standing floor (272 at `c309225`)**, 0 fail, no live model. Inherits
> every binding guardrail in `CLAUDE.md`.

## Sequencing gate (do this first)

Before scheduling any item here, **read the V3-1 telemetry** (intake step viewed/skipped,
time-to-first-artifact, artifact generated/abandoned, renderer used, export/bundle). Let the
data pick the order and the emphasis. The three items are written so they can be scheduled
independently and push-only.

## The design-integrity rule (BINDING for this whole track)

- **Gradient = chrome / action only.** The brand gradient (teal → blue → purple → pink →
  amber) appears **only** on: the brand-signature hairline, the recipe-header signature, the
  primary **Generate artifact** button, the **active** segmented tab, and the readiness-**progress
  fill** bar (0–100). Secondary actions (e.g. **Copy config**) stay flat.
- **Meaning-bearing UI stays flat, single-hue.** Anything a reviewer reads as a *signal* — the
  readiness **badge** ("Usable with caveats"), a category accent, an event-type dot, a
  signal-strength indicator — is a flat single color. A gradient there muddies the signal.
- **Signal STRENGTH is a shade ramp within ONE hue — never a gradient.** Hue = the signal
  *type*; shade = the *level* (high ≈ 600–800, medium ≈ 200–400, low ≈ 50–100), same hue
  throughout. A flat fill chosen from the stored value — explicitly not a gradient.
- **Category accents (architecture-page family), applied flat:** **teal = experience/grid**,
  **purple = logic/recipe**, **pink = data/governance**, **amber = business-case**.
- **Single source-of-truth gradient token** reused everywhere it legitimately appears — no
  ad-hoc per-component gradients drifting out of sync.

## V3-11 — Analysis-tab consolidation (read-only activity feed + consolidated recipe view)

- **What:** a two-pane restyle of the analysis tab — a left-rail **read-only activity feed**
  rendering already-stored audit/telemetry events (review / export / generate / recompute /
  policy-citation / ingest), and a right-side **consolidated recipe output view** restyling the
  existing artifact card/overview. Mounts in `renderAnalysisTabRecipe`; **augments**, never
  replaces, the intake flow.
- **Hard rules:** pure view — reads stored events via the existing accessor, **recomputes
  nothing, writes nothing, triggers no generation**; each row uses a flat single-hue event-type
  dot (reviewed = teal · exported = blue · generated = purple · policy = pink · recomputed =
  amber); the right pane keeps the same fields/readiness label/chips; absent event or field ⇒
  explicit "none recorded" empty state, never fabricated. Lowest-risk of the three.

## V3-12 — Brighter design-language refresh (readiness badges · four-signal vocabulary · category accents)

- **What:** a display-only refresh of the readiness badges, the four-signal indicators, and the
  per-domain category accents — applying the design-integrity rule consistently across the render
  surface.
- **Hard rules:** readiness **badges** (Ready / Usable with caveats / Draft until confirmed /
  Not enough information) are flat single-color chips, one fixed color per label, read from the
  existing value — never a gradient, never recomputed; each of the four signals (extraction
  confidence / opportunity / readiness / provenance) gets a fixed hue with **strength = a shade
  ramp in that one hue** (flat fill from the stored value, not a gradient); category accents flat
  per the family above; the four signals stay visually distinct (never collapsed into one combined
  color/score); readiness label text and thresholds unchanged. **Largest surface area / most
  cautious** — it touches many render functions guarded by the "seven distinct renderers" and
  trust-invariant tests, so a styling change must not alter any renderer's output contract.

## V3-13 — Gradient palette as a brand-and-action layer

- **What:** introduce the brand gradient as a thin chrome/action layer over the flat signal
  colors — the brand-signature hairline, the recipe-header signature, the primary **Generate
  artifact** button, the active segmented tab, and the readiness-**progress fill**.
- **Hard rules:** the gradient appears **only** on those chrome/action surfaces; **no
  meaning-bearing element** (readiness badge, category accent, event-type dot, signal-strength
  indicator) ever receives it; presentation only — encodes nothing, reads no value, changes no
  logic; the readiness-progress *fill width* still derives from the stored score (e.g. 72/100),
  only its color treatment is the gradient; one source-of-truth gradient token. Pairs naturally
  with V3-12 but smaller and lower-risk (confined to chrome).

## Universal test posture for this track

Display-only, so the decisive guards are: each readiness label maps to its fixed flat color; the
strength→shade mapping picks the correct stop per band from a stored value and is asserted to be a
**single-hue flat fill, not a gradient**; the four signals remain distinguishable; the gradient
token is present on the designated chrome/action surfaces and **absent on every meaning-bearing
surface**; **no recompute/generation path is touched** by any badge/indicator/feed render; absent
events/fields render explicit empty states. Deterministic, no live LLM. Gate strictly above the
standing floor, 0 fail.
