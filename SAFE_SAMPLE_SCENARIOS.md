# Safe Sample Scenarios

Use these synthetic scenarios for first-pass review. They are intentionally fictional and should not include client confidential, regulated, personal, MNPI, PCI, PHI, or production data.

## Scenario 1 - Banking Payment Exception Triage

Copy-ready prompt:

```text
I want to review a banking payment exception triage workflow. A daily operations team receives a queue of failed or delayed payment items, checks basic exception categories, looks up related internal reference data, decides whether the item can be corrected, escalated, or closed, and produces a short status note for the operations lead. The main output is a reviewed exception list with owner, status, reason, and next action.
```

What to watch:

- The app should ask for workflow boundary before detailed payment data.
- Data handling should stay category-level and synthetic.
- Product/Engineering outputs should separate queue intake, lookup, decision, escalation, and status reporting.

## Scenario 2 - Insurance Workshop Synthesis

Copy-ready prompt:

```text
I want to review an insurance workshop synthesis workflow. A consulting team runs stakeholder workshops, collects notes from breakouts, groups themes by business capability, identifies unresolved decisions, and turns the result into a summary pack for the project sponsor. The main output is a workshop synthesis document with themes, decisions, risks, and follow-up actions.
```

What to watch:

- The app should handle a workshop and facilitation use case, not only operations workflows.
- Business Value should discuss time saved in synthesis and quality of follow-ups as hypotheses.
- Governance Inputs should not over-focus on regulated data if examples stay synthetic.

## Scenario 3 - Strategy Workshop Prep

Copy-ready prompt:

```text
I want to review a strategy workshop preparation workflow. A project team receives a workshop objective, finds prior reusable materials, drafts an agenda, selects exercises, prepares pre-read content, and gets manager approval before sending materials to participants. The main output is a reviewed workshop pack ready for facilitation.
```

What to watch:

- The app should capture reusable collateral, agenda drafting, approval, and final pack handoff.
- Evidence can be optional: sample file names or metadata should be enough.
- The Combined Packet should make open questions and assumptions visible.

## Scenario 4 - Technical Test Case Generation

Copy-ready prompt:

```text
I want to review a technical test case generation workflow. A delivery team reviews a feature requirement, identifies key scenarios, writes manual test cases, maps expected results, checks edge cases, and packages the test cases for QA review. The main output is a test case set with scenario, preconditions, steps, expected result, and owner.
```

What to watch:

- Engineering Brief should capture systems, acceptance criteria, and test artifacts.
- Product PDR should keep user story and acceptance gaps explicit.
- The app should not assume code access or production system access.

## Scenario 5 - Project Governance Status Summary

Copy-ready prompt:

```text
I want to review a project governance status summary workflow. A project manager collects weekly updates from workstream leads, checks milestone status, identifies blockers and decisions, summarizes risks, and prepares a status note for leadership review. The main output is a concise status summary with milestones, blockers, decisions, and asks.
```

What to watch:

- The app should separate current-state workflow from a future AI solution idea.
- Business Value should frame speed, consistency, and leadership-readiness as hypotheses.
- Reviewer Decision Summary should capture whether the outputs are useful enough for Product or Engineering review.

## Suggested First Review Order

1. Run one scenario end to end using typed Discovery.
2. Export the workbook.
3. Review Product PDR, Engineering Brief, Business Value, Governance Inputs, Combined Packet, and Question Routing.
4. Save one feedback snapshot in Testing & Release.
5. Create Package and Download ZIP.
6. Inspect Reviewer Decision Summary.
7. Record comments in `COWORKER_FEEDBACK_TEMPLATE.md`.
