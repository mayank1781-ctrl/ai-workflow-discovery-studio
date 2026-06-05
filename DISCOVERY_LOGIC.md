# Discovery Logic

The app is designed to interview before it solutionizes.

In plain English: it first tries to understand the real current-state workflow, then turns that into Product, Engineering, Business, and Governance handoff material.

## Intended Question Order

1. Capture the submitted idea or starting topic.
2. Ask for the broad workflow frame:
   - workflow name
   - where it starts
   - where it ends
   - what output it creates
3. Ask for broad components:
   - tools and systems
   - main inputs and data types
   - final outputs
4. Ask for the rough numbered A-to-Z process.
5. Drill into each step:
   - actor
   - tools
   - access/source mode
   - input
   - in-process handling
   - output
   - handoff
   - trigger
   - time taken
   - decision or human judgment
   - pain or friction
   - exceptions
   - data sensitivity
6. Surface unanswered questions and handoff readiness.
7. Generate Product, Engineering, Business, Governance, ChatGPT + Microsoft Copilot Build Recipe, and Combined Packet outputs.

## Key Guardrail

The app should not jump into detailed data-boundary, access, governance, or value questions before it has the basic workflow frame and broad component overview.

This matters because early governance-heavy questions can make the interview feel like a compliance review before the team even understands the work.

## Where To Review The Logic

In `discovery-intake-webapp/app.js`, start with:

- `sections`: field groups and visible intake categories
- `defaultState`: session state model
- `renderCurrentQuestion` and question-routing helpers
- `buildReviewGate`: readiness, follow-up, and open-question logic
- `questionRoutingRows`: Product, Engineering, Business, Governance, Finance/Ops, and Domain Sponsor routing
- `deriveProductBrief`
- `deriveEngineeringBrief`
- `deriveBusinessBrief`
- `deriveCombinedHandoff`
- `exportWorkbook`
- `createHandoffPackage`
- `handleWorkbookImport`

## What Reviewers Should Challenge

- Are the interview questions in the right order?
- Are the outputs useful for a real Product PDR review?
- Are Engineering questions specific enough without over-designing the solution?
- Are Business Value assumptions clearly marked when Finance/Ops data is missing?
- Does the Build Recipe give practical ChatGPT, Microsoft Copilot, connector, prompt, control, MVP, and test-script guidance?
- Does the Solution Build Spec turn that recipe into a machine-readable contract that a future scaffold or engineering review can consume?
- Does the Solution Capability Plan make the build sequence concrete enough: ChatGPT capabilities first, Copilot surfaces when needed, human checkpoints, and later enterprise hardening?
- Do the Enterprise Connector Contracts identify auth, permissions, read/write mode, approvals, setup steps, and tests before any enterprise connector is requested?
- Does the Enterprise Readiness Brief separate local/coworker pilot readiness from true enterprise release gates, owners, evidence, and approvals?
- Are governance inputs framed correctly for later review?
- Are there cases where the app infers too much from thin evidence?
