# V3 structural axis — V3-15 → V3-19 (spec of record)

> **Status:** forward backlog — **not built.** Specs of record in the V3-x kickoff style;
> each doubles as the Claude Code kickoff when scheduled. Posture when built: **push-only +
> plan-then-stop**, deterministic gate **strictly above the standing floor** (286 at the V3-14
> merge `3f2c87f`), 0 fail, no live model. Inherits every binding guardrail in `CLAUDE.md`.

## Premise — a SECOND axis over the workflow model

The Studio already has one analytical axis. V3-14 added the **economic axis**: capacity /
FTE-equivalent / cost — *how much the work is worth, and where AI frees capacity.*

This track adds the **structural axis**: the **shape of the work** — its human endpoints,
handoffs, decisioning, friction, and where AI actually helps. The structural axis is the spine
for understanding **WHERE and WHY** AI helps (not just how much it's worth), and it is the
substrate for workforce-reimagination (see `docs/roadmap/V3-workforce-reimagination.md`).

The two axes are complementary and stay distinct: economic answers "how much," structural
answers "what shape / where / why." Neither is collapsed into the other.

## Sequencing (by decision)

The structural axis runs **AFTER V3-14 (economic axis)** and **BEFORE the design track
(V3-11/12/13)**. This is a deliberate priority call — **function before polish.**

**Deliberate consequence:** the department heatmap (V3-19) ships in the **current** design
language first, then gets refreshed later by V3-12 (the design-language refresh). Shipping the
capability before the polish is intended, not an oversight.

```
V3-14 economic axis (SHIPPED) → V3-15 … V3-19 structural axis → V3-11/12/13 design track
                                                              → workforce-reimagination (capstone)
```

## Shared discipline (every item inherits the V3-14 locked decisions)

- Inputs are **user-stated or explicitly-marked-inferred** — never silently invented.
- **Provenance + confidence** on every structural value; an **inferred value never hardens into
  asserted** (the V3-2 / `patchField` precedence discipline).
- **Additive / derived only** — no grid writes from these features, no server scoring endpoint,
  **byte-identical output when the feature is unused.**
- **No live model** anywhere; deterministic tests; the gate grows **strictly** / 0 fail.
- The **four-signal separation holds**: extraction confidence · opportunity · readiness ·
  provenance stay distinct — structural signals never get collapsed into the opportunity score.
- Rails: raw Node server, USD / en-US, **no firm names**, banned phrase absent.

---

## V3-15 — Step typology

**What:** classify each step's *nature* — **decision · handoff · data-op · judgment · review**
(a small fixed vocabulary; user-confirmable, AI-suggested tags explicitly marked inferred).

**Why:** it makes the existing per-step **opportunity score legible** — a step scores high
because it is a repetitive **data-op**, or low because it is a **judgment** call. Today the score
is a number; typology explains the *kind of work* behind it. Typology is a **separate signal**
from the opportunity score — it annotates, it never recomputes the score.

**Reuse / shape:** read steps from the grid; store the type as a provenance-carrying tag
(user-stated when confirmed, ai-inferred + confidence when suggested, never auto-promoted).
Additive; byte-identical when no step is typed.

---

## V3-16 — Handoffs + decisions as first-class objects

**What:** model **role-to-role** and **human-to-system** transitions as **structural nodes** in
their own right — each carrying its own friction and AI-opportunity — rather than as a property
buried inside a step. Distinct from the existing **"honest handoff" OUTPUT** (a rendered
artifact); this is a first-class object in the model.

**Why:** **highest-yield single addition.** Handoffs are where coordination cost and error
concentrate — the seams between roles/systems are where AI assistance (routing, summarization,
checklists, status) most reliably pays off and where the most risk hides.

**Reuse / shape:** derive transition nodes from the step chain (`nextStepId`) + persona/system
changes between steps; each node carries provenance + confidence and its own opportunity read.
Additive over the existing grid; never mutates step structure.

---

## V3-17 — Friction lens (ANNOTATE-ONLY)

**What:** capture how **slow / painful / error-prone** a step is **today** — as a **user
refinement pass** on already-extracted steps at the **pre-recipe checkpoint**. The user tags the
painful step (e.g. *"the Excel work, not the upload"*) plus an optional **"what's painful here"**
note.

**Hard rules:**
- **Strictly separate from opportunity** — friction is its own signal, **never collapsed** into
  the opportunity score (the four-signal discipline). A painful step is not automatically a high-
  opportunity step, and vice-versa.
- **The user is the provenance.** Friction is **never a model-fabricated number** — it is a user
  annotation with the user as its source. No AI-guessed pain scores.
- **Annotate-only.** Tagging friction **does NOT edit step structure.** If a step is too coarse to
  tag honestly (the pain is in a sub-step), the user **splits it in the existing extraction grid**
  first, then tags the resulting finer step.

**Future enhancement (explicitly OUT OF SCOPE for V3-17):** a **"review-and-split friction pass"**
— split the painful sub-step out *while* tagging, in one flow. Documented here as a deliberate
follow-up; V3-17 ships annotate-only.

---

## V3-18 — Role-centric pivot

**What:** invert **persona-per-step** into **role-across-workflows**: for a given role, surface
**every step it touches**, plus that role's **friction / opportunity / handoff profile** across
the portfolio.

**Why:** the **bridge primitive to workforce-reimagination.** Reasoning about future-state roles
requires seeing the work from the role's vantage point, not the workflow's. This pivot is the
join that makes role-level analysis possible.

**Reuse / shape:** a derived index over persisted sessions keyed by normalized role, aggregating
typed steps (V3-15), handoffs (V3-16), and friction (V3-17). Read-only; provenance preserved per
contributing value.

---

## V3-19 — Department heatmap

**What:** combine **typology + friction + opportunity + handoffs**, **by role**, **across a
department** — the structural axis made visible.

**Reuse / shape:** aggregates V3-15…V3-18 over a department's persisted sessions; ships in the
current design language (refreshed later by V3-12).

**It must wear its uncertainty:** computed vs stated vs inferred is **always distinguished** in
the cell itself; an inferred value is **never rendered as asserted.** Provenance discipline
**scales with surface richness** — the richer the visualization, the more it must show its seams.

---

## Two BINDING cautions (apply to the whole track, enforced — not advisory)

1. **The heatmap must wear its uncertainty.** Provenance discipline scales with surface richness:
   **a colored cell sourced from a guessed value is a trust violation dressed as a
   visualization.** Every cell must distinguish computed / stated / inferred, and inferred must
   read as inferred. This is a build requirement and a test requirement, not a positioning note.

2. **Role framing is leverage / friction-removed per role — NEVER an automatable-percentage or
   headcount figure.** Enforced **at the data-model and label level**, not just in how it's
   positioned: the model does not compute or store an "% automatable" or headcount number, and no
   label expresses one. This protects the honesty of the data people feed in — the moment the tool
   looks like a headcount-cut calculator, the inputs stop being honest.

## Test posture (every item)

Deterministic, no live LLM. Each item proves: structural tags/objects carry provenance +
confidence and an inferred value never serializes as asserted; the new signal is **separate from
the opportunity score** (not collapsed); friction is user-sourced (no fabricated number); the
feature is **additive / byte-identical when unused**; no grid write, no scoring endpoint, no model
call; for V3-19, every rendered cell distinguishes computed/stated/inferred and no role label
expresses a headcount/automatable-percentage figure. Gate strictly above the standing floor, 0 fail.
