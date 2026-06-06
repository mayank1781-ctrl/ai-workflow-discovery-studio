# Intelligent Interview Grid Spec

This spec describes the data model and build plan behind the "intelligent
interview" — a Discovery conversation that fills a structured workflow grid.

It captures decisions confirmed in design review ahead of the Stage 1 build.

## Overview

The grid is a structured representation of a single workflow:

- **Columns** are the ordered workflow **steps**.
- **Rows** are a fixed **schema** of fields about each step.

Each step is captured against the same schema, so every column has the same
rows. The conversation (and, where available, an uploaded document) fills the
cells. There are two ways a session can start — by uploading a document or by
talking — and both converge at the same completed grid (see
[Document Ingestion](#document-ingestion--a-first-class-entry-point)).

A workflow also carries one workflow-level field — an overall Data Sensitivity
baseline — that is not per-step.

## The Schema — 17 Input Fields + 1 Generated Output

There are **17 input fields** per step (things the system asks about or
extracts) and **1 generated output** per step (the AI Pattern, produced by the
system — never asked).

### Input fields

| #  | Field | Notes |
|----|-------|-------|
| 1  | Workflow Step (name) | Short name for the step. |
| 2  | Description | What happens in this step. |
| 3  | Persona/Actors | Who performs or is involved in the step. |
| 4  | Systems/Tools | Systems and tools used in the step. |
| 5  | Data Processing | What is done to the data in this step. |
| 6  | Rules/Decision logic | The rules or decision logic applied. |
| 7  | Output | What the step produces. Conceptually links to the next step's Trigger. |
| 8  | Trigger | What starts the step. Conceptually fed by the previous step's Output. |
| 9  | Handoff | Who/what the step hands off to. |
| 10 | Human checkpoint | Where a human must review, approve, or intervene. |
| 11 | Time Taken | How long the step takes. |
| 12 | Frequency/Volume | How often the step runs and at what volume. |
| 13 | Pain/Friction | Where the step hurts. **Conversation-only — no document source** (see below). |
| 14 | Data Sensitivity (step-level) | Sensitivity of the data handled in this step. |
| 15 | AI Pattern *(legacy cell slot — see reconciliation note)* | **No longer an input.** Now a generated output; retained as cell #15 only until Stage 1c. See [Generated Output](#generated-output-ai-pattern) and [Stage 0 reconciliation](#known-divergence-stage-0-vs-this-spec). |
| 16 | Exception Branching | What happens when the step fails, errors, or hits edge cases — the branches off the happy path. Examples: feed-failure escalation, AML trigger referral, match-rate-drop investigation. |
| 17 | Regulatory/Compliance Context | Specific regulations, frameworks, or compliance controls that govern the step. Examples: segregation of duties (maker ≠ checker), AML referral obligation, audit-trail retention, 1LoD/2LoD oversight. |

> Field numbering note: fields 16 and 17 are the two fields added in this
> revision. Field 15 (AI Pattern) is being reclassified from an input to a
> generated output; the schema is therefore **17 input fields + 1 generated
> output**, even though "AI Pattern" still occupies cell slot #15 in the
> Stage 0 code today (see the reconciliation note).

#### Pain/Friction is conversation-only

Pain/Friction (field 13) **cannot be sourced from a document.** SOPs and
process documents describe how things are *supposed* to work, not where they
actually hurt. This field **always requires a real human to surface it**, and
it is a deliberate focus of the interview even in the document-first path.

### Generated Output: AI Pattern

AI Pattern is **not an input field and is never asked as a question.** It is
**produced by the system after holistically analyzing all 17 input fields**
across the step. It represents a calibrated spectrum from "do this by hand in
ChatGPT today" through to "autonomous multi-agent system":

| Level | Pattern | Meaning |
|-------|---------|---------|
| 1 | Single prompt | Paste into ChatGPT today. |
| 2 | Prompt template | Reusable prompt with variables. |
| 3 | Prompt chain | Sequential prompts, human in the loop. |
| 4 | Automation | Triggered workflow, minimal human input. |
| 5 | Agent | Autonomous reasoning across systems. |
| 6 | Multi-agent | Coordinated specialists with handoffs. |

The level is **calibrated by**:

- **Pain/Friction severity** — how badly the step hurts.
- **Volume/Frequency** — how often it runs and at what scale.
- **Degree of rules-based vs judgment-heavy work** — rules-based work moves up
  the spectrum more readily than judgment-heavy work.
- **Data Sensitivity** — higher sensitivity tempers the level.
- **Human checkpoint requirements** — mandatory human review tempers the level.

Because it is generated, AI Pattern can hold multiple candidate values, each
with its own confidence rating.

### Cell shape

Every input cell carries not just a value but a **state** and a **confidence**
signal (these later drive color-coding and escalation), as established in
Stage 0:

```text
cell = {
  value,                                   // the captured content
  state,        // "empty" | "harvested" | "inferred" | "confirmed"
  confidence    // "" | "Low" | "Medium" | "High"
}
```

Document ingestion (below) adds a `source` signal to the cell so the product
can tell a document-derived inference apart from a conversation-derived one.
That is a planned extension of the Stage 0 cell, not built yet.

## Universal Confidence Framework

Every captured value carries a **confidence** signal, expressed as a **raw
number from 0 to 1**. This is the canonical representation across the whole app
(human-readable labels, if shown, are derived from the number — never the
reverse). It supersedes the earlier `"Low" | "Medium" | "High"` placeholder in
the cell shape above.

The same scale applies to **all input types without exception** — document
extraction, live conversation, voice, typed notes, and future attachment types:

| Confidence | Meaning |
|------------|---------|
| **0.9+** | Explicitly stated ("we use SAP", "it takes 2 hours"). |
| **0.7** | Clearly implied by context. |
| **0.5** | Reasonably inferred. |
| **< 0.5** | Do not capture — leave the value as an empty string. |

### Special rules (constant regardless of input source)

- **Pain/Friction** is only captured when a real person expresses actual
  frustration or difficulty. It is **never inferred** and **never extracted from
  documents** — SOPs describe how things should work, not where they hurt. "This
  is really slow" → 0.9; a guess → do not capture.
- **AI Pattern** is **never harvested** from any input. It is always generated
  later by the system from the completed grid.

### Cell state after capture

- **`confirmed`** — the user stated it directly.
- **`inferred`** — implied or harvested from context.
- **`empty`** — nothing captured yet (anything below 0.5 stays empty).

This framework governs document extraction (Stage 1a), conversation harvesting
(Stage 1b), and any future capture source.

## Document Ingestion — a First-Class Entry Point

Document upload is a **first-class session entry point, equal to
conversation.** A session can begin either way.

### Path A — Document-first

1. The user uploads a document (e.g. an SOP or process document).
2. The system extracts a **draft grid** from it.
3. Extracted cells are populated with `state = "inferred"` and
   `source = "document"`.
4. The interview then **confirms the inferences and fills the gaps**, with
   **special focus on Pain/Friction**, which documents cannot provide.

A well-structured SOP or process document can realistically **pre-fill ~65% of
the 17 input fields.** In Path A the interview's job therefore shifts **from
discovery to confirmation and gap-filling.**

### Path B — Conversation-only

1. No document is uploaded.
2. The interview **builds the grid from scratch**, using the existing
   capture-first and confidence-driven logic.

### Convergence

Both paths **converge at the same completed grid state.** Nothing downstream of
the grid needs to know which path produced it.

## Data Handling — Uploaded Documents

This section covers how uploaded documents are processed and what the product
must disclose to users. It complements `SECURITY_AND_DATA_HANDLING.md`, which
remains the canonical statement of the app's overall data boundary and OpenAI
API usage; the two must not drift.

### Processing

- Uploaded documents are processed **server-side** and sent to the **OpenAI
  API** for extraction.
- They are **not persisted to disk beyond the session.**

### Required disclosure (Stage 1 UI requirement)

- Users **must see a clear disclosure at the moment of upload — before the file
  is sent anywhere** — stating that the document will be processed by OpenAI's
  API.
- The disclosure must advise the user to **check their organisation's AI
  acceptable use policy before uploading any RESTRICTED or CONFIDENTIAL
  material.**
- This disclosure is a **UI requirement for Stage 1, not optional.**

### Future consideration

- Support for **org-specific OpenAI Enterprise keys with zero data retention
  (ZDR)** for regulated-industry clients.

## Staged Build Plan

### Stage 0 — Data model (done)

The parallel `workflowGrid` data model behind the grid: a `schemaVersion`, a
workflow-level `dataSensitivityBaseline` cell, and an ordered array of steps,
each with a stable `id`, a `nextStepId` chain link (this step's Output → the
next step's Trigger), and the schema cells. This runs **parallel to** the
existing `state.steps` array and changes nothing the user sees.

### Stage 1 — Document ingestion + grid population

Stage 1 now includes **document ingestion alongside grid population**, split
into three sub-stages:

- **Stage 1a — Document upload + extraction:** document upload UI (including the
  mandatory upload-time disclosure above) plus server-side extraction →
  grid pre-fill. Sets cells to `state = "inferred"`, `source = "document"`.
- **Stage 1b — Conversation harvest:** conversation logic that harvests from the
  transcript → fills the remaining cells. This is the existing planned
  capture-first, confidence-driven logic.
- **Stage 1c — AI Pattern generation:** generate the AI Pattern from the
  completed grid (the calibrated spectrum above). See the reconciliation note —
  this is where AI Pattern moves out of `cells`.

### Stage 2 — Visual grid display (unchanged)

The visual grid display: the live grid filling in as you talk.

### Known divergence: Stage 0 vs this spec

This is a **deliberate, planned divergence** — not a defect to fix today:

- **Stage 0 (as built):** `GRID_CELL_KEYS` contains 15 keys, and `aiPattern` is
  cell #15 inside each step's `cells`. **This stays untouched for now.** No
  Stage 0 code changes are made as part of this spec revision.
- **Stage 1c (planned):** `aiPattern` moves **out of `cells`** and into a
  separate `generatedOutput` field on the step object, and `GRID_CELL_KEYS`
  grows to reflect the 17 input fields (adding Exception Branching and
  Regulatory/Compliance Context). At that point the code matches this spec:
  17 input cells + 1 generated output per step.

Until Stage 1c lands, treat "AI Pattern as cell #15" as legacy scaffolding that
the spec already supersedes on paper.
