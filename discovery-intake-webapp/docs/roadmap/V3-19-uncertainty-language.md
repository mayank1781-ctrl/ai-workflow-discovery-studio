# V3-19 — Uncertainty language (DEFINITION DOC — contract of record)

> **Status:** pre-build **definition only.** This doc *defines* the visual contract
> the V3-19 department heatmap will obey; it does **not** implement anything. The
> V3-19 build sprint reads this doc and **must not re-open** the decisions below.
> Inherits every binding guardrail in `CLAUDE.md`.
>
> **Why it exists:** this is one of the two **binding cautions** for the structural
> axis — *"the heatmap must wear its uncertainty"* (see
> `docs/roadmap/V3-structural-axis.md`). It is sketched now in **today's locked
> Signal Glass language** and will be **refined later by the V3-12 design track** —
> shipping the capability before the polish is intended, not an oversight.
>
> **Design alignment:** this contract is consistent with the already-locked **Signal
> Glass** system — the **source-dot provenance** treatment, **flat hue for meaning**,
> **shade for strength**, **gradient as chrome only**, and **inferred never rendered
> as asserted**. It **mints no new color and no new gradient**; it references Signal
> Glass tokens **by role** and reuses the provenance treatment already shipped in the
> source-dot / badge system (V3-15 → V3-18).

## Purpose

Lock exactly how a heatmap value shows **where it came from** — computed vs stated
vs inferred — so a colored cell can never quietly present a guess as a fact. Written
as the contract; the build implements it as-is.

## 1. The three provenance states (always distinguishable)

Every heatmap value carries exactly one of three states:

- **COMPUTED** — derived by the tool from other data (e.g., an aggregate over a
  role's steps). Not asserted by a person; produced by deterministic rollup.
- **STATED** — asserted by the user (a confirmed value the user owns).
- **INFERRED** — suggested by AI and **not yet confirmed** by a person.

**Rule:** on **every tile / value**, which of the three it is must **always be
visually legible**. The three states are **never collapsed into one look** — not on
hover-only, not "on the busy ones." If a value mixes sources, it shows the **least
asserted** state present (inferred < computed < stated), never the most flattering.

## 2. Visual treatment per state (Signal Glass)

Each tile already carries the locked Signal Glass basics: **hue = work type**,
**shade = strength within that one hue**, plus a **text label** (see §4). To that,
every tile adds a **source-dot** marking its provenance state:

| State | Source-dot token (by role) | Reads as | Realization (already shipped) |
|---|---|---|---|
| **STATED** | **Cyan Trace** | an asserted, user-owned value | the "User" provenance treatment in `provenanceBadgeHtml` |
| **COMPUTED** | **Electric Blue** | a tool-derived rollup | the computed/derived dot — distinct from stated and inferred |
| **INFERRED** | **Signal Gray** | a **suggestion**, un-asserted | the **AI-grey** "AI" provenance treatment already used for ai-inferred |

**Inferred is rendered as a suggestion / un-asserted** — the Signal Gray (AI-grey)
treatment — and is **visually distinct from a stated value**. An inferred value is
**never** styled with the stated (Cyan Trace) treatment and **never reads as an
asserted user value**. This is the same suggest-vs-confirmed distinction the
structural lenses already make; the heatmap inherits it, it does not re-invent it.

## 3. Human-hold treatment

A cell that is **judgment-held** — a human owns the decision/judgment — uses the
reserved **Human Pink** token. Human-hold marks **"a person holds this,"** and it
**never implies the cell or its role is automatable** (it is the opposite signal).
Human Pink is **reserved for human-hold** and is not one of the three provenance
source-dots, so the two readings never collide.

## 4. The binding rule (restated — enforced, not advisory)

- **Inferred is NEVER rendered as asserted.** A guessed value never wears a
  user-owned look.
- **Computed / stated / inferred are ALWAYS distinguished** on every tile (via the
  source-dot), with a **visible legend** (see §5).
- **Shade carries strength within ONE hue — never a gradient.** Strength is a darker
  or lighter shade of the work-type hue; **gradient stays chrome / actions only.**
- **Every tile carries a TEXT label — never color-only.** Meaning is never conveyed
  by color alone (legibility, color-vision safety, and honesty).

Net: **the heatmap wears its uncertainty.** A colored cell sourced from a guessed
value but rendered as asserted is a **trust violation dressed as a visualization** —
the richer the surface, the more it must show its seams.

## 5. Legend spec

The heatmap **must render a visible legend** whenever it is shown, mapping:

- the **three source-dots** — **Cyan Trace = stated**, **Electric Blue = computed**,
  **Signal Gray = inferred (suggestion)** — and
- the **Human Pink = human-hold** treatment.

The legend makes the computed/stated/inferred distinction legible **without prior
knowledge**; the heatmap is never shown without it.

## Note — what the heatmap aggregates (record, not build)

The V3-19 heatmap **aggregates the structural axis already shipped** — typology
(V3-15), handoffs (V3-16), friction (V3-17), and role (V3-18) — and presents it
**by role / department**. It **does NOT recompute or alter opportunity** and
introduces **no new scorer**. This doc only **records that constraint** for the
build; it changes no schema.

## Out of scope for this doc

**No data model / schema, no migration, no UI code** here. The V3-19 build lands
those under the standing engineering-discipline rails: **additive / derived only**, a
**sidecar keyed by the stable id**, **no `patchField` / no grid write**, **no scoring
endpoint**, **byte-identical output when unused**, **deterministic offline tests / no
live model**, **banned phrase absent**, **leverage-not-headcount** (no headcount /
FTE / automatable-% anywhere or in any label), and the **role / heatmap never feed
the opportunity score** — the four-signal separation (extraction confidence ·
opportunity · readiness · provenance) holds.
