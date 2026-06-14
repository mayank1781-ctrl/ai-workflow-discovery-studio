# V3-18 — Role model (DEFINITION DOC — contract of record)

> **Status:** pre-build **definition only.** This doc *defines* the role-model
> contract that the V3-18 build sprint will build against; it does **not**
> implement it. No data model, no schema, no migration, no UI, no tests here. A
> later V3-18 build sprint reads this doc and **must not re-open** the decisions
> below. Inherits every binding guardrail in `CLAUDE.md`.
>
> **Where it sits:** the structural axis (see `docs/roadmap/V3-structural-axis.md`),
> after V3-15 typology · V3-16 handoffs + decisions · V3-17 friction lens. V3-18 is
> the **bridge primitive to workforce-reimagination**
> (`docs/roadmap/V3-workforce-reimagination.md`): it inverts persona-per-step into
> **role-across-workflows**.

## Purpose

Lock the **role** contract so the build can't drift: what a role *is*, where it
attaches, how many per step, and the single framing it is allowed to express.
Everything in "The contract" is **decided** — the build implements it as written.

## The contract (decided — do not re-open)

### 1. Role is a firm-defined controlled vocabulary, explicitly assigned — never derived from a title

Role is its **own allowed-set** — the same discipline as the typology vocabulary
(V3-15) and the friction vocabulary (V3-17): a small, firm-defined, pinned set of
role values. Role sits **above job title**. It is **captured/assigned per step by a
person** and is **NEVER auto-derived from a title string.**

**Rationale (binding to the design):** a title like *"Finance Operations
Specialist"* can belong to a role like *"Project Management."* Deriving role from
the title would mislead. Frame role as roughly **title-category × workflow-context**
— the *kind* of work the person is doing in *this* step, not the label on their HR
record. Because that mapping is not recoverable from the title alone, role must be
**explicitly assigned**, never inferred from the title string.

### 2. Role attaches at the STEP level; a role's footprint is its steps across all workflows

A **workflow** is a large unit of work containing **multiple steps and multiple
people.** The **step** is the taggable unit, and a step is **owned by exactly one
role at a given time.**

A **role's footprint** = the set of steps tagged with that role, **across all
workflows.** That cross-workflow set is the **"role across workflows"** view and the
**bridge to workforce** reasoning. The role lens reads the same persisted steps the
rest of the structural axis already annotates; it does not introduce a new unit of
work below the step.

### 3. Exactly ONE primary role per step (a single value, not a list)

A step carries **one** primary role — a **single value, never a list.**
Multi-person involvement across a stretch of work is modeled as **handoffs between
steps** (first-class since V3-16), **never** as two roles co-owning one step.

**Rejected alternative (recorded):** *co-ownership / role-as-list* — letting a
single step hold multiple roles. Excluded because it would force role to be a
**per-step list**, which complicates **every per-role tally** (footprint, leverage,
the role-across-workflows join) and double-counts steps. **Handoffs already express
multi-person work**, so the single-value rule loses no fidelity while keeping
per-role aggregation clean.

### 4. Leverage framing ONLY — BINDING

The role model and **every label derived from it** express **leverage /
friction-removed per role.**

There is **NO headcount field, NO FTE count, and NO automatable-% field anywhere in
the contract**, and **no label may imply one.** This is a **binding caution the
V3-18 build must enforce — at the data-model and label level — and assert in tests**
(not merely a positioning note). It restates the structural-axis binding caution:
*role framing is leverage / friction-removed per role, never an
automatable-percentage or headcount figure.* The honesty of the inputs depends on
it: the moment the model looks like a headcount-cut calculator, people stop feeding
it honest data.

## Note — handoffs connect role-tagged steps; a target may be a ROLE or a SYSTEM (recorded, not a change)

Handoffs (first-class since V3-16) **connect role-tagged steps.** A handoff target
may be:

- a **ROLE** — person-to-person; the next step is owned by a different role; or
- a **SYSTEM** — a step hands off to a system for verification / augmentation
  **before a human makes the decision on it** (the human stays the decision-maker).

V3-18 **must not assume every handoff is person-to-person.** This doc does **not**
change the handoff schema — V3-16 stands as-is; it only **records the constraint**
so the build honors it.

## Out of scope for this doc

**No data model / schema, no migration, no UI** here — those land in the **V3-18
build sprint** under the standing engineering-discipline rails: **additive / derived
only**, a **sidecar keyed by the stable step id**, **no `patchField` / no grid
write**, **no scoring endpoint**, **byte-identical output when the feature is
unused**, **deterministic offline tests / no live model**, and **banned phrase
absent**. Like typology and friction, role is **descriptive structural metadata and
never feeds the opportunity score** — the four-signal separation (extraction
confidence · opportunity · readiness · provenance) holds.
