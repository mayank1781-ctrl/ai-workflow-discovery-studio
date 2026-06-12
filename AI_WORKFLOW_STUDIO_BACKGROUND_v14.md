# AI Workflow Discovery Studio — Background (v14)
**Updated 2026-06-12, at UX polish PR (#133) wrap-up. Companion to NEW_CHAT_HANDOFF_v14.md — the handoff carries working style + current state + next action; this doc carries everything else.**

---

## 1. What this app is

An enterprise vanilla-JS single-page app for Finance-focused management-consulting teams. A consultant runs a structured AI discovery interview — or pastes an existing workflow document — and the app maps the workflow into a scored automation opportunity: a 3-layer extraction grid, a 10-principle score with tier classification, a defensible business case, and an OpenAI-first recipe (named pipelines, "Open ChatGPT → My GPTs → Create → paste system prompt" framing — never "work with your development team"). It is a personal implementation guide the consultant executes themselves with ChatGPT / Custom GPTs / GPT Actions / Assistants API.

**Personas:** Senior Business Analysts (Capital Markets, Banking, Payments) · Management Consultants (Risk, Regulation, Financial Crime) · Finance Transformation Consultants (FP&A, month-end close, GL reconciliation) · Data & AI Strategists · Project/Programme Managers · Corporate Services.

**The dominant product principle:** the app never silently invents, changes, or recomputes anything a user might rely on. Every value knows its provenance; outputs change only visibly, on user action, with the prior preserved; 119 executed tests pin these behaviors at every merge.

**A second product principle settled in PR 31:** questions reach the user through exactly TWO deliberate funnels — Discovery's KEY QUESTIONS TO FILL GAPS (≤3, intent-driven) and the recipe gate panel (≤3, recipe-critical). Document-derived model questions improve the WORDING inside those funnels; they never get a third surface of their own.

**A third posture settled at the 2026-06-12 business review:** Compliance is a FLAG, not a gate. Compliance-tier and P9 copy is advisory ("Flagged for governance review — recipe produced") — viable recipes are never withheld (generation-never-blocked is structurally test-pinned). PR 38 will evaluate against the firm's actual uploaded AI policy text.

**Hard rules:** no firm names anywhere (app, code, output — "the firm", "the engagement" only) · USD/en-US only · toast() never showToast · buttons never hard-disabled (toast guard + return) · inline hex colors only · raw Node HTTP, never Express · node:sqlite (built-in) · Node 24.

## 2. Repo & environment

**Repo:** github.com/mayank1781-ctrl/ai-workflow-discovery-studio
**Local path:** /Users/mayankpandey/Downloads/ai-workflow-discovery-studio-github-upload-20260605/ai-workflow-discovery-studio-review-0.1.0-2026-06-05T11-50-53-306Z/discovery-intake-webapp
**Dev URL:** http://localhost:5173 · **Start:** `npm run dev` (Server tab only)
**Files:** app.js (~1.4 MB SPA, no framework) + index.html + design-system.css (ds-* classes) + future.css/cockpit.css/styles.css (legacy layers; the Open-popup dim lives in future.css) + server.mjs (raw Node HTTP, handleXxx routes) + data/sessions.db (sqlite) + test/**/*.test.mjs
**Build tooling:** Claude Code (Fable 5, plan-included until Jun 22) in a remote container — commits, pushes, opens PRs; NEVER merges; cannot delete remote branches (proxy 403). Remote sessions are pinned to auto-named `claude/*` branches (the polish PR rode claude/youthful-tesla-9lej3p — branch names in kickoff prompts are advisory there). Fresh containers need `npm install` in discovery-intake-webapp before the suite passes (6 env-failures otherwise — missing dotenv, server spawn). Merges + branch deletion: GitHub website only. CI = GitHub Checks (the `validate` check run is the real signal; legacy commit-status API shows pending — noise).
**Deploy:** Docker + Railway (railway.json dockerfilePath repo-root-relative). DATA_DIR env override (tests use temp dirs).

## 3. Engineering Invariants (learned the hard way)

1. **No silent drops in the extraction path.** Every layer that can discard data logs when it does: [session-load], [harvest-grid] parsed/dropped-key, discarded stepUpdate under lock, provenance-precedence refusals, [migrate] lines at startup. The 29b latent bug survived because THREE silent-drop layers stacked.
2. **No silent changes to user-relied outputs.** Grid cells (30), recipes (30b), business case (32), recipes on classification change (33), tier classification (31). Extended in the polish PR: even HIDING list rows is announced ("N empty hidden" note in the Open popup).
3. **Verify every model swap against real output.** One logged end-to-end run before merge.
4. **One state path per surface.** getField/patchField accessor + executed guard test. Cross-session writes via load → patchField → save. applyFieldEdit is the ONE field-edit path; patchField's options.clear is the ONE user-clear path.
5. **Verify on the branch, not main — and PULL FIRST.** Container commits don't exist locally until pushed AND pulled.
6. **UI mounts get pinned by tests.** Twice-precedented (#sessionLibraryList ghost host, evidence workbench panels). Any feature with a render surface carries a mount test asserting its host id exists in index.html. The polish PR extended this to CSS: a selector keyed on an id pins that id's existence (the dim overlay test).
7. **NEW (polish PR): any value derived in BOTH app.js and server.mjs is lockstep-tested.** Precedents: migrateSessionState ↔ migrateSessionStateV2 (PR 33, deepEqual) and now session-summary stepCount (server counted legacy state.steps only, client counted workflowGrid.steps — every grid-built session's server summary lied "0 steps"; found in the Slice 1 browser pass). Server list endpoints recompute summaries from stored state so a summarizer fix self-corrects old rows.

## 4. Design System

| Token | Value |
|---|---|
| Page background | #0d1b2e |
| Card | #162438 · Panel #0a1525 · Border #1e3350 |
| Muted #8899aa · Dim #445566 |
| Teal (L1/Quick Win) | #00d4b4 |
| Pink (L2/Compliance) | #ff4fc8 |
| Amber (L3/Speculative) | #f59e0b |
| Purple (Strategic) | #a855f7 |

Layers: L1 THE FLOW teal · L2 PEOPLE & FRICTION pink · L3 DATA & RISK amber. Provenance badges: user-stated teal · user-edited cyan ("EDITED") · doc-extracted amber ("DOC") · ai-inferred slate (confidence % hover only). Low-confidence chips: amber. P9 note: violet. Business-case badge: teal "Computed on request". Pattern chips in pattern colors. **Family chip (polish, de-emphasized): muted outline pill, family color reduced to a 6px dot — logic/popover untouched (settled).** Pencil ✎ edit affordances on grid cells and recipe-card meta values; tier-change banner at top of grid tab; 🔒 P9 lock badge; Esc kbd chip in the Answering banner. Open-popup dim: body:has(#openSessionsMenu[open])::before overlay + topbar lift (future.css).

## 5. Architecture & Key Decisions

### Session metadata
workflowName (display rule: both Analysis Studio headers fall back workflow name → SESSION name via sessionNameForHeader() → placeholder/timestamp; "Untitled discovery" never counts as a name — polish item 1) · engagementContext · userRole (analyst/consultant/manager/principal) · blendedRate derived ($75/$100/$150/$200, never stored) · workflowFamily (workflow-level, PR 33) · workflowMode defaults to project — EXCEPT Corporate Services workflows, which default to role mode (ongoing work); lands with PR 35's family expansion (business-review decision).

### Business case (PR 32 — server-only + snapshot; polish refinements)
computeBusinessCase lives in server.mjs ONLY; BC_CONFIG holds the 48-week constant + role rates. Role mode: hrs/wk = inst/wk × mins ÷ 60; annual = hrs/wk × 48 × rate. Project mode (default): total = inst/wk × weeks × mins ÷ 60; value = total × rate. POST /api/business-case is the only compute path (auth-gated 401, 400 on empty steps, computedAt server-stamped). Render from state.businessCaseSnapshot only; recompute rotates to businessCaseSnapshotPrior; footer Previous line; DOCX embeds snapshot. rateSource reflects the write path — **and the basis-line suffix now mirrors it: "(Settings override)" / "(Role)" / "(default rate)" (polish item 7).** Two render sites — Recipe Book + Engineering Doc tab — share businessCaseBlockForCurrentWorkflow and both wire Compute/Recompute (structurally pinned, polish item 10). One-per-session (PR 36 re-keys). Rates stop being hardcoded-only in PR 37 (business inputs checklist — see roadmap).

### Schema versioning framework (PR 33)
SESSION_MIGRATIONS sequential array in server.mjs `{ to, name, migrate(state) }`; migrateSessionRecord applies pending steps in order, stamping. v1→v2 = migrateSessionStateV2. Dual-store lockstep: client migrateSessionState ↔ server copy, EXECUTED deepEqual test. Startup batch runStartupSchemaMigrations(): .bak before touching anything; one transaction; any throw → ROLLBACK + console.error naming row/step/.bak/restore command + process.exit(1). 147 sessions migrated clean.

### Saved-session library & Open popup (PR 33 + polish PR)
- **persistState() content guard (polish item 2):** a contentless session (sessionHasContent() false — no steps/data/systems/decisions/captured idea or name) never auto-saves to the library or server sync; the localStorage current-state write stays unconditional. This was the factory for ~50 stray zero-step "Untitled discovery" rows. The explicit Save button still server-saves on demand.
- **savedSessionVisibleInList (polish item 2):** Open-popup list + count badge hide zero-step strays with NO user-meaningful name; visible header note "N empty hidden" (Invariant 2). Named-but-empty sessions stay visible/loadable BY DESIGN (a stale-but-named duplicate row staying visible is accepted; deletion affordance deliberately deferred).
- **Server summary lockstep (Slice 1 fix):** summarizeSession counts workflowGrid.steps first (mirrors client sessionSummaryMeta); handleListSessions recomputes summaries from stored state per list. Lockstep + behavior test-pinned.
- **Local library cap:** localStorage library holds 40 entries, newest-first; evicted sessions become remote-only ("on disk") and contribute $0 to portfolio totals (PR 32 never-recompute rule — sessionCardMetrics reads inline state only). Loading a session re-localizes it (totals can legitimately RISE as evicted sessions are reloaded — recovery, not inflation). Visibility hint is a future item.
- **Loading bumps updatedAt (pre-existing, accepted for now):** loadSessionFromLibrary → persistState stamps updatedAt and re-saves identical content. Cells/labels/provenance untouched. "Load shouldn't count as an update" is a logged future item.
- **Bulk classification review filters (polish item 8):** session-name search + "Unverified only" toggle; module state (bulkReviewUnverifiedOnly / bulkReviewSearchTerm — the tier-change-banner pattern); filters are session-level and apply AFTER totals accumulate (summary line stays library-wide); over-narrow filters render a no-match line, never unmount the controls; search keeps focus across the full-panel rerender.
- **Open-popup dim (polish item 3):** body:has(#openSessionsMenu[open])::before fixed overlay + .session-topbar lift. The overlay CANNOT live inside the details — the topbar's backdrop-filter makes it a containing block for fixed descendants (lesson worth keeping). Clicking the dim closes via the pre-existing document-level outside-click handler.

### Classification correction (PR 33) — unchanged
Pattern chip per step → AI_PATTERNS popover → patchField(aiPattern, 'user-edited') → retires the intent → routes into the 30b gated flow. rotateRecipeOnLanding called solely from runRecipeGeneration's success path (structurally pinned). Prior preserved verbatim + labels. Family chip toasts, never auto-regenerates. commitCrossSessionClassification = only cross-session write path. Verified = provenance promotion without label change; idempotent.

### Field-level correction (PR 31) — unchanged
applyFieldEdit (THE field-edit path) · floating editor with computeFieldEditorPosition containment (measure-then-place, flip/clamp/internal scroll, five-anchor test) · clear path + materiality rule (normalize → Levenshtein ≤ max(2, 20%) trivial; material → reaskEligible; emptying reopens immediately) · live client re-score (scoring ENTIRELY client-side, getStepOpportunityMeta ~5071-ish, NO /api/score) · explainTierChange banner (grid-tab-only, module state) + live tierSensitivity recompute via composeWhatIfMeta · P9 confirm-to-lock/unlock (provenance promotion, no new flag; generation untouched, structurally pinned) · model-question intent unification + wording substitution (two-surface funnel, shared claim set) · Answering banner Esc.

### Recipe card copy & blurb (polish PR)
- recipePromptBlurbLine(prompt) — pure: first prompt line that isn't "Key: value" metadata OR a bare "Key:" section label (regex `^[A-Za-z ]{2,24}:(\s|$)`; a lone "Pipeline:" no longer renders as the blurb — item 6). Known pre-existing trade-off, documented in test: a SHORT "Word: ..." prose opener also skips.
- "Pattern confidence:" labels (meta row + footer) — the % reads the pattern cell (recipeConfidencePct); rename not rewire (item 4). The recipeConfidencePct → oppConfidence → aiPattern chain itself is unchanged.
- Regenerate-while-gated toast (item 5): generateRecipePrompt detects the panel already up (data-gate-generate-anyway probe) and toasts "Still gated — N field(s) unconfirmed. Answer below, or use Generate anyway." First-time gating stays silent; copy promises nothing the gate intercepts.

### Compliance/P9 advisory copy (polish item 11 — COPY ONLY, settled posture)
- Tier label: **"Flagged for governance review"** (was "Compliance review required"); tier value "compliance", priority null, override rule byte-identical.
- tierSensitivity flip warnings name the tier plainly ("becomes Compliance").
- P9 violet note + download twin (lockstep test-pinned): "Provenance note: data sensitivity was unconfirmed (AI-inferred or below threshold) when this recipe was generated. Flagged for governance review — recipe produced; review data handling against firm AI policy before deploying."
- recipeGateCheck asserted tier-blind (no tier/compliance reference — generation never blocks). PR 38 replaces generic advisory text with citations from the firm's uploaded AI policy.

### gridState / Accessor layer / Question memory / Confidence-gated generation / Two-model extraction / Scoring — unchanged from v13
(9 fields / 3 layers / 16 cell keys · getField/patchField only, upgrade-only precedence, 0.7 shared threshold, dataSensitivityBaseline exception folds in PR 36 · intent = sorted cell keys, retirement rules + PR 31 exception · recipeGateCheck 5 fields, "Generate anyway" never disabled · Claude narrates / gpt-4o harvests, evidenceArtifacts followUpQuestions feed the wording funnel · P1–P10, tiers 24/16/10 boundaries, P9=1 Compliance override, P7=1 caps Quick Win.)

### Models (deliberate split — don't conflate)
**App runtime (OpenAI):** gpt-5.5 structured extraction · gpt-4o harvest/doc extraction · gpt-4o-mini recipes · gpt-realtime-2 voice. claude-fable-5 on minor server call sites. **Build tooling:** Claude Code on Fable 5 (plan-included until Jun 22). OpenAI gpt-* constants untouched in any model work. "No AI opportunity identified" on near-empty steps is expected (TEST A).

### Taxonomy — CODE/DOC MISMATCH (owns a PR 35 task)
Documented: 5 families → 10 planned; 6 patterns → 12 planned. **Live AI_PATTERNS constant holds ~10 patterns.** Reconcile BEFORE expanding.

## 6. Current UI Layout (post polish PR)

**Discovery page** — unchanged from v13 (left: metadata → current question → KEY QUESTIONS → dictate/docs → step cards → pattern overview; right: golden composer with Esc chip → conversation → live grid).

**Open popup (Saved Sessions)** — page DIMS behind it; click dim to close. Header "N saved · M empty hidden". Classification review panel (collapsed) now has search + Unverified-only. Zero-step strays hidden from the list (named empties stay). Count badge = visible sessions.

**Analysis Studio** — tabs: Workflow Grid | AI Opportunities | Recipe Book | Engineering Doc.
- **Workflow Grid:** header shows workflow name → SESSION name fallback; coverage cards + matrix + ✎ editors + tier-change banner.
- **Recipe Book:** header shows session-name fallback + de-emphasized family chip (muted pill, color dot). Cards: editable pattern chip, muted Family echo, Frequency/Sensitivity click-to-edit, **"Pattern confidence: N%"**, gap panel (regenerate-while-gated now toasts), "Previous recipe" expander, violet P9 note (advisory copy), oversight banner. Bottom: Business Case Estimate (rateSource-honest suffix) + scoring breakdown (P9 lock strip; advisory flip-warning copy) + downloads.
- **Engineering Doc:** bottom carries the same business-case block, wired.

## 7. PR History

| PR | # | Description | Status |
|---|---|---|---|
| 1–29d | various | Auth, SQLite, Docker/Railway, Settings, sensitivity guard, Discovery restructure, step cards, inline key questions, golden input, model swap + triple-silent-drop fix, executed test foundation | ✓ |
| 30 | #128 | Accessor + question memory + low-data warning + evidence (52/52) | ✓ |
| 30b | #129 | Confidence-gated generation + snapshot markers + P9 note (57/57) | ✓ |
| 32 | #130 | Business case server-only + snapshot + schemaVersion 2 (63/63) | ✓ |
| 33 | #131 | Schema versioning + classification correction (77/77) | ✓ |
| 31 | #132 | Field-level correction UX (99/99) | ✓ Merged 06-11 |
| **polish** | **#133** | **UX/UI polish pass — 11 items, 4 slices. S1: stray containment (persistState guard + savedSessionVisibleInList + "N empty hidden") + popup dim + review search/unverified filter; S1 fix: server stepCount lockstep + list-time summary recompute (found in browser pass); S2: session-name header fallback + Pattern-confidence relabel + gated-regenerate toast + bare-label blurb skip; S3: rateSource-honest rate suffix + family chip de-emphasis + business-case sites pinned; S4: compliance/P9 advisory copy (copy only, logic byte-identical). 99 → 119.** | **Open 06-12** |

**Test gate history:** 63 → 77 → 82 → 83 → 88 → 92 → 97 → 98 → 99 → **119** (un-piped, always). New test files: saved-sessions-polish · recipe-card-polish · business-family-polish · compliance-copy-polish.

## 8. Standard Test Fixtures (post-polish state)

- **TEST A — Sparse Gate Session** — pasted monthly client fee reconciliation, almost nothing confirmed. Gate fires (multi-field panel), "No AI opportunity" on thin steps expected. Business-case snapshot ($1,680,000 / 16,800 hrs; Previous lines — do NOT casually Recompute, it rotates the preserved prior). Family = Capital Markets & Trading Ops (user-set), patterns Summarise on steps 01/05, violet P9 notes carry the advisory copy.
- **TEST B — Confirmed Gate Session** — same workflow conversationally. **4 steps (RESOLVED: the app was right; older docs said 5).** Only step 01 ("Reconcile client fees") richly confirmed; steps 02+ thin. Step 01 gates on SENSITIVITY — dataSensitivity/regulatoryContext intentionally EMPTY ("Set sensitivity" is the correct P9 variant). Family = Regulatory & Compliance, step 01 pattern = Extract. Carries its own computed business-case snapshot (same $ figures as TEST A — same workflow, same parsed inputs; both aggregating in the popup totals = $3,360,000 is correct, not a double-count). Scoring breakdown shows the low-data "provisional" tierSensitivity variant (mostly-neutral principles — expected variant selection). Session id: session-mq8glj24-5nj5om. **A stale Jun-10 duplicate row named "TEST B — Confirmed Gate Session" (0 steps, on disk) stays visible under the named-empty protection — by design, ignore it.**
- Loading any fixture bumps its updatedAt and re-saves identical content (pre-existing; content untouched).
- Console seed/cleanup for substitution checks — unchanged from v13 (seed ev-verify artifact, cleanup by id; load the fixture FIRST).
- Trust re-verification: TEST A → multi-field panel on Generate; TEST B step 01 → at most the sensitivity gap.
- **Both fixtures' pattern/family labels are PR 35's verified label set — don't casually overwrite.**

## 9. Roadmap (RE-CUT at the 2026-06-12 business review — supersedes v13's order)

**Phases A–D ✅ · UX polish PR ✅ (#133, this PR).**

**Execution order: ledger findings-only check → PR 36 → PR 37 → PR 34 → PR 35 → PR 38 → Phase G (slimmed).** Rationale: riskiest change (36) tackled early, aimed inside the Fable 5 window (Jun 22).

1. **Ledger findings-only session (BEFORE PR 36 code):** verify the ledger design covers PR 31's additions — clear path, materiality/reask flags, P9 lock-by-precedence. Report before any code.
2. **PR 36 — Ledger + hybrid:** patchField internals → append-only ledger (accessor API unchanged); doc + interview any sequence; latest-explicit-wins with visible history. Carry-items: dataSensitivityBaseline fold-in · real evidence offsets · multi-key retirement revisit · /api/pattern-handoff removal · per-workflow snapshot re-key · dead-code cleanup (renderSessionLibrary + #sessionLibraryList + activeWorkbenchTab="library" · evidence ghost-hosts renderEvidenceWorkbench/renderEvidenceReviewPanel + five missing ids + dead evidenceArtifactCard "full" path) · renderAiMirror//api/ai-mirror. Branch pr36-hybrid-ledger.
3. **PR 37 — Business inputs checklist (NEW):** rates stop being hardcoded-only. End-of-Discovery / pre-deliverables checklist surface: editable rate/hr (pre-filled from the role table), mode, engagement weeks; user-tweakable; downloadable; feeds the business case via the existing rateSource disclosure plumbing. Engine change, its own PR, never part of polish.
4. **PR 34 — Feedback loop:** thumbs per field/principle; recipe 1–5 + text; negatives stored as reproducible failure cases; Portfolio failure-cases view; human review only year one. Gap-question cap STAYS 3 (open to 4 later, judged by feel after the pilot — NO telemetry; scope unchanged). Branch pr34-feedback-loop.
5. **PR 35 — Taxonomy expansion:** FIRST reconcile AI_PATTERNS code (~10) vs doc (6) — then families 5→10, patterns →12, disambiguation rules, regression eval against the verified label set (TEST A/B), ranked alternative routes. **Includes the Corporate Services role-mode default.** Branch pr35-taxonomy-expansion.
6. **PR 38 — Firm AI policy evaluation (NEW):** upload the firm's AI policy doc as the evaluation standard; warnings cite actual policy text; viable recipes never withheld (generation-never-blocked already structurally pinned). Built AFTER the pilot so pilot feedback shapes it.
7. **Phase G — Corporate deployment (SLIMMED):** real Azure AD end-to-end · corporate repo copy · pilot. OpenAI data-handling sign-off is handled within firm compliance EXTERNALLY — removed from blockers. **Pilot bar: ~12 colleague interviews plus screenshots, process documents, and charts as inputs. The doc-extraction path takes the load — its parked indicator investigations get a findings-only check before the pilot.**

**Deferred/opportunistic:** strict json_schema on harvest (if dropped-key logs recur) · reply-narration from harvest (36 rider) · app.js modularization (stays opportunistic — settled, ONE file; don't propose extraction with 36) · scoring.test.mjs extractor migration · automated feedback consumption · per-artifact question browsing (REJECTED — two-surface funnel is settled).

## 10. UX Feedback Log (implemented + carried)

1–30 from v12/v13 (see v13 for detail). New resolutions in the polish PR (06-12):
31. ✓ Loaded session header shows the SESSION name (both Analysis Studio headers)
32. ✓ Stray zero-step sessions hidden + auto-save guard (the factory is off)
33. → White bar below Discovery content — STILL unanswered (findings-only re-ask)
34. ✓ (found in polish browser pass) Server summaries miscounted grid-built sessions as 0 steps — lockstep fix
35. → Saved-session list shows stale named duplicates (e.g. Jun-10 TEST B); cleanup affordance deferred

## 11. Corporate Readiness

Trust layer ✅ (30/30b) · Engine integrity ✅ (32/33) · Correction UX ✅ (31) · Polish ✅ (#133) · Feedback loop queued (34, after 36/37). **OpenAI data-handling sign-off: handled within firm compliance externally — no longer a blocker.** Still needed before corporate copy: real Azure AD end-to-end · corporate repo copy · pilot (bar: ~12 colleague interviews + doc/screenshot/chart inputs).

## 12. Key Technical Notes

- OPENAI_API_KEY module-level const; Settings sets ephemeral runtimeOpenAiKey; tests strip keys in spawn env
- computeBusinessCase server-only; /health bypasses auth; tests spawn server.mjs on 5199; expected count **119**, un-piped; fresh checkouts need `npm install` in discovery-intake-webapp
- runStartupSchemaMigrations in server.mjs; [migrate] log lines; restore = `cp data/sessions.db.<stamp>.bak data/sessions.db` + restart
- Lockstep pairs (Invariant 7): app.js migrateSessionState ↔ server migrateSessionStateV2 · client sessionSummaryMeta stepCount ↔ server summarizeSession stepCount (both executed-tested)
- **Polish PR function map:** savedSessionVisibleInList (list visibility rule) · sessionHasContent guard in persistState · bulkReviewSessionVisible / bulkReviewNameMatches + module state bulkReviewUnverifiedOnly/bulkReviewSearchTerm · sessionNameForHeader (header fallback) · recipePromptBlurbLine (pure blurb skip) · rateSuffix keyed on bc.rateSource (in businessCaseBlockHtml) · dim overlay rules in future.css (~line 12150)
- PR 31 function map unchanged: applyFieldEdit · computeFieldEditorPosition · wireGridCellEditors · explainTierChange · composeWhatIfMeta · p9SensitivityLocked · reopenQuestionsForCell · modelQuestionIntent / MODEL_QUESTION_INTENT_RULES · modelQuestionForCells
- Confidence display chain (recipeConfidencePct → oppConfidence → aiPattern cell) unchanged; now honestly LABELED "Pattern confidence"
- rotateRecipeOnLanding: one call site, structurally pinned · commitCrossSessionClassification: no JSON.parse/.replace (test-asserted) · recipeGateCheck: tier-blind (test-asserted)
- Local session library: localStorage, 40-entry cap, newest-first; eviction → remote-only → $0 in portfolio totals (visibility hint = future item)
- **Dead code (inert, removal queued PR 36 — don't delete casually):** renderAiMirror//api/ai-mirror · /api/pattern-handoff · renderSessionLibrary + #sessionLibraryList + activeWorkbenchTab="library" call sites · evidence ghost-hosts (see roadmap)
- Container resets: frequent; post-reset ritual = branch-state proof + model-indicator check + re-send unacknowledged messages
- node:sqlite ExperimentalWarning on Node <24 (suite still green on 22) · remote branch deletion website-only · DevTools "allow pasting" once; panel covers the right column — close before judging right-side UI
- ROSETTA.md still describes the pre-advisory "Compliance review" copy (~line 466) — docs sweep candidate

## 13. Decisions Log (settled — don't reopen without cause)

All v11/v12/v13 decisions stand (see v13 list; highlights: no hard P9 gates · provenance badge primary · OpenAI runtime / Fable build split · 0.7 shared threshold (gate + retirement — STAYS one number until testing says otherwise, re-affirmed 06-12) · generate-anyway never disabled · business case server-only + snapshot + prior preserved · two-surface question funnel · scoring client-side only · materiality rule · tier flips always explained · P9 lock = provenance promotion · mount tests required · test gate now **119/119**).

**New from the 2026-06-12 business review:**
- Roadmap re-cut: polish → ledger findings check → 36 → 37 (NEW) → 34 → 35 → 38 (NEW) → Phase G slimmed
- Project mode stays default EXCEPT Corporate Services → role mode (lands with PR 35)
- PR 37 business inputs checklist (editable rate/mode/weeks, downloadable, feeds rateSource plumbing) — engine change, own PR
- Pilot bar: ~12 colleague interviews + screenshots/process docs/charts; doc-extraction indicator findings check before pilot
- OpenAI data-handling sign-off handled externally — off the blocker list; Phase G = Azure AD e2e + corporate repo copy + pilot
- Gap-question cap stays 3; NO telemetry; PR 34 scope unchanged
- Compliance posture: advisory flag, never a gate (copy landed in #133; PR 38 cites real firm policy text; viable recipes never withheld)
- Findings-only ledger-design session before PR 36 code (covers PR 31's clear path, materiality/reask flags, P9 lock-by-precedence)
- app.js stays ONE file; modularization opportunistic — don't propose extraction with 36

**New from the polish PR session (06-12):**
- Contentless sessions never auto-save (sessionHasContent guard); current-state localStorage write unconditional
- List-visibility rule: zero-step AND no user-meaningful name = hidden, with a visible "N empty hidden" count; named empties always stay (legitimate-session protection outranks stray hygiene; deletion affordance deferred)
- Invariant 7: dual-derivation values are lockstep-tested; server list endpoints recompute summaries from state
- Review-panel filters are session-level; totals stay library-wide; controls never unmount
- Advisory copy strings (see Section 5) — tier label "Flagged for governance review", P9 note card/download lockstep
- Blurb heuristic: bare "Key:" labels are metadata; short "Word: ..." prose openers skipping is a documented pre-existing trade-off

## 14. Watch Items

- [harvest-grid] dropped-key logs → strict json_schema escalation (ready)
- **Fable 5 plan-included until Jun 22** — polish PR landed inside the window; aim PR 36 inside it too (that's why it's next)
- Container resets frequent → branch-state proof + model check + re-send after every one
- **AI_PATTERNS code (~10) vs doc (6)** — reconcile in/before PR 35
- ~~TEST B step count~~ RESOLVED: 4 steps, docs corrected
- TEST B step 01 gates on sensitivity (cells intentionally empty) — expected, don't "fix"
- TEST B scoring shows the low-data "provisional" variant — expected variant selection, not a regression
- White bar below Discovery content — answer still pending (findings-only re-ask)
- "Analyzed as pasted workflow" indicator presumed not rendering · per-step DOCX may lack 30b provenance lines · provenance-pill hover tooltip never visually confirmed — all get the findings-only check BEFORE the pilot (doc-extraction path takes the pilot load)
- Old cached prompts show stale blurbs until regenerated (accepted) · npm test un-piped, always

## 15. Session Handoff Checklist

Before starting a session:
- [ ] Branch checked out (colourful tab: `git branch`)
- [ ] Server running on the correct branch (Server tab)
- [ ] Open PRs? (**#133 open at time of writing — merge on GitHub website, delete branch there**)
- [ ] **119/119** tests passing on current branch (un-piped)
- [ ] Claude Code model indicator shows Fable 5 (re-check after every reset)

**Current state:** polish PR #133 open (branch claude/youthful-tesla-9lej3p), all 4 slices browser-verified, gate 119/119 · fixtures intact and carrying verified labels (TEST B sensitivity intentionally empty; stale Jun-10 named-empty duplicate visible by design) · next action after merge: **ledger findings-only session** (kickoff prompt in NEW_CHAT_HANDOFF_v14.md), then PR 36 → 37 → 34 → 35 → 38 → Phase G.
