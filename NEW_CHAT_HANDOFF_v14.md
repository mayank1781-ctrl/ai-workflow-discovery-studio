# New Chat Handoff — AI Workflow Discovery Studio (v14)
**Updated 2026-06-12, at UX polish PR (#133) wrap-up. Supersedes v13. Companion: AI_WORKFLOW_STUDIO_BACKGROUND_v14.md (this doc = working style + current state + next action; background doc = everything else).**

I'm continuing a build session for AI Workflow Discovery Studio.
I've attached **AI_WORKFLOW_STUDIO_BACKGROUND_v14.md** — read it fully before responding, including the Engineering Invariants (Section 3, now seven — note new Invariant 7 on dual-derivation lockstep), the accessor + gate + migration architecture (Section 5), the saved-session library rules (Section 5, polish PR), the RE-CUT roadmap (Section 9), the standard test fixtures (Section 8), and the Decisions Log (Section 13).

---

## HOW I LIKE TO WORK (follow this exactly)

### Instruction format
- Numbered steps, each with a clear label saying WHERE I do it:
  - **Claude Code** — the Claude Code web UI; prompts go in its "Type / for commands" box. NOTE: remote sessions are pinned to auto-named `claude/*` branches — branch names in kickoff prompts are advisory; Claude Code states the real branch in its first report
  - **Colourful command tab** — my second Mac Terminal tab (the one with the colourful prompt); git, npm test, npm install, everything except the dev server
  - **Server tab** — my first Mac Terminal tab; runs `npm run dev` ONLY, nothing else ever. Server logs ([harvest-grid], [session-load], [migrate], [auth]) print HERE, not in the browser console
  - **Browser** — http://localhost:5173; hard refresh is Cmd+Shift+R, console is Cmd+Option+J
  - **GitHub website** — github.com in the browser; I merge PRs here and nowhere else; remote branch deletion here and nowhere else
- Steps and explanations always SEPARATE — never mix a step with its rationale; explain first or after, steps stay clean
- EVERY command and EVERY Claude Code prompt in a copy/paste code block — I paste, I don't retype. Especially Claude Code prompts: write the full prompt out, ready to paste verbatim
- Max 3–4 steps at a time — never more. If the task needs more, stop at a checkpoint and wait for me
- **Keep instructions SHORT and visually light:** fewer bullets, less bold, less text per step. Default to 4 one-line steps. If I say "simpler please", strip jargon and describe what I'll literally see on screen
- **Whenever a Claude Code push needs browser verification, ALWAYS include the pull/restart/refresh copy-paste block** (colourful tab `git pull --ff-only` → server tab Ctrl+C + `npm run dev` → browser Cmd+Shift+R) — never just say "then verify". ALWAYS pull before browser checks (stale-code false bugs are twice-precedented). When the change is server-side, SAY the restart matters this time
- When a step happens inside the app, give the exact tab/section/card TITLE and which session to use (e.g. "Analysis Studio → Recipe Book tab → step 01 card, in TEST B") — never just "go to the scoring page". This applies INSIDE panels too
- **If an app element could be mistaken for a control, say what it is** — column HEADERS are not clickable; cell CONTENT is. Spell these out
- When a step involves hovering or clicking a SMALL element, describe exactly which element and where it sits
- **Browser console steps:** I may be new to DevTools. Explain the `>` prompt, the one-time "allow pasting", give the full one-line paste. Warn me the DevTools panel COVERS the right side of the app — close it before judging right-column UI
- Don't summarise back what I said — confirm context briefly, tell me what's next
- **All questions for me go at the END of your message, gathered together and numbered** — never scattered. If I don't understand a question, rephrase plainer and offer a/b answers
- When a decision is mine, label it plainly ("your call"), give your recommendation with the trade-off, and don't bury it
- I sometimes ask for quick status updates (PRs remaining, what this session moved) — keep a running answer ready

### Screenshots
- I share screenshots frequently — wait for them before giving next steps
- Read them carefully and flag anything wrong FIRST, before any instructions
- Check my zoom level before judging layout severity; ask what zoom if layout looks broken
- Never assume something worked — confirm visually, or via test output for test-only changes
- If my screenshot shows the wrong place (wrong fixture, wrong session), say so plainly and re-point me with exact names
- If you (the chat assistant) made a wrong claim, say so plainly when the screenshot proves it — keep verification honest in BOTH directions. Polish-PR example of the reverse direction done right: my report template once went through with an unfilled placeholder — Claude Code flagged it and folded the missing check into the next slice's browser pass instead of assuming a pass

### Git / GitHub
- I merge on the **GitHub website** only, and only after verification (independent local `npm test` + browser pass + CI green). CI note: GitHub Checks `validate` run is the real signal; legacy commit-status pending is noise
- **Claude Code** does all committing, pushing, PR opening. Standing instruction: "commit, push, open the PR, report — do not merge"
- Remote-branch deletion of MERGED branches happens on the **GitHub website**. I delete my Mac's local copy with `git branch -d <branch> && git fetch --prune`
- Push-per-slice (settled): Claude Code pushes after every slice — backup, not PR-opening
- Pulls always `--ff-only`; divergence stops loudly; Claude Code is source of truth on conflict
- **Claude Code runs in a remote container** — its branches DON'T exist on my Mac until pushed. Before any browser verification: colourful tab → `git fetch && git checkout <branch> && git pull --ff-only`, restart Server tab, hard refresh. Fresh containers need `npm install` in discovery-intake-webapp before the suite passes (6 env-failures otherwise — not code failures)
- Environment resets are ROUTINE. After ANY reset: have Claude Code post `git branch -vv && git log --oneline -3 && git ls-remote origin <branch>` before continuing. **Resets can silently revert the model picker — check the indicator shows Fable 5 after every reset.** If Claude Code's reply seems to ignore something I sent, assume the message was lost and re-send
- Claude Code runs on **Fable 5** — included in plan until **Jun 22**, plan limits after (app runtime is OpenAI — deliberate split, don't conflate)
- Origin carries ~110 stale historic branches (old claude/*, pr16–pr33 era) — cleanup is mine, GitHub website, low priority; the old "origin holds main only" claim was wrong

### Working rhythm
- For investigations: Claude Code reports findings BEFORE changing code ("findings-only")
- For multi-session PRs: Claude Code proposes a plan, waits for my go; then slice-by-slice — report and STOP after each slice; I verify in browser between slices when UI changed. Server-only slices can be pre-authorized through their gates
- Browser verification uses the standard fixtures — tell me which one to load AND which step. Per-slice browser passes EARN THEIR KEEP: the polish PR's Slice 1 pass caught the server stepCount lie that 105 green tests missed
- Scope challenges are welcome: answer the purpose question first, then propose the smallest fix
- Wiring first, UX polish later (settled) — unless actively false labels on user-relied output, or unusable-not-cosmetic
- Accumulate carry-items and watch-items during the session and surface them at PR-open and at wrap-up
- Console seed/cleanup pattern for fixtures (reusable; load the target fixture FIRST, seed second):
  - Seed: `state.evidenceArtifacts = [...(state.evidenceArtifacts||[]), { id: "ev-verify", fileName: "verify-note.txt", followUpQuestions: ["<doc-phrased question>"] }]; persistState(); render();`
  - Cleanup: `state.evidenceArtifacts = (state.evidenceArtifacts||[]).filter(a => a.id !== "ev-verify"); persistState(); render();`

### Standard test fixtures (saved sessions — use these, don't improvise)
- **TEST A — Sparse Gate Session** — pasted fee-reconciliation workflow, almost nothing confirmed. Gate FIRES (multi-field panel); "No AI opportunity" on thin steps expected. Family = Capital Markets & Trading Ops (user-set), patterns Summarise on steps 01/05. Carries computed business-case snapshot ($1,680,000 / 16,800 hrs; Previous lines — do NOT casually Recompute)
- **TEST B — Confirmed Gate Session** — same workflow conversationally; **4 steps** (resolved — older docs said 5). Only step 01 ("Reconcile client fees") richly confirmed. Step 01 gates on SENSITIVITY (cells intentionally EMPTY — expected, don't "fix"). Family = Regulatory & Compliance, step 01 pattern = Extract. Has its own snapshot (same $ as TEST A — same workflow; popup total $3,360,000 with both local is correct). Scoring shows the low-data "provisional" warning variant — expected. **Ignore the stale Jun-10 duplicate row (named, 0 steps, on disk) — visible by design**
- Loading a fixture bumps its timestamp and re-saves identical content (pre-existing; content untouched)
- Trust re-verification: TEST A → multi-field gap panel on Generate; TEST B step 01 → at most the sensitivity gap
- Business-case re-verification: never-computed/legacy → "Not computed yet", never a figure; Recompute → Previous line
- **Both fixtures' pattern/family labels are PR 35's verified label set — don't casually overwrite**

---

## CURRENT STATE (polish PR wrap-up, 2026-06-12)

- **Polish PR #133 OPEN** (branch claude/youthful-tesla-9lej3p) — all 11 items, 4 slices + 1 found-in-browser fix, each slice browser-verified. Commits: edbc36d (S1) → a73ae3e (S1 fix) → 1511db7 (S2) → f64b8e8 (S3) → 13c1da8 (S4) → docs v14
- **Test gate: 119/119** (was 99 — +8 S1+fix, +5 S2, +5 S3, +2 S4, pins updated in scoring + tier-sensitivity)
- Found-in-browser this PR: server summaries miscounted grid-built sessions as 0 steps (Invariant 7 born); library 40-cap eviction explains portfolio-total movements
- **MY NEXT ACTIONS (GitHub website):** verify CI green on #133 → merge → delete branch → colourful tab: `git checkout main && git pull --ff-only && git branch -d claude/youthful-tesla-9lej3p && git fetch --prune && npm test` (expect 119)
- Then: **ledger findings-only session** (below) before any PR 36 code

## LEDGER FINDINGS-ONLY SESSION KICKOFF (next action after merge)

**Step 1 — Colourful command tab** (pre-flight; pass = clean fast-forward, then 119 pass / 0 fail, un-piped):

```
git checkout main && git pull --ff-only && npm test
```

**Step 2 — Claude Code** (check the model indicator shows Fable 5, then paste):

```
Polish PR merged (#133), gate 119/119. FINDINGS-ONLY session — no code changes, report before anything else.

Task: verify the PR 36 append-only ledger design covers everything PR 31 added to patchField's semantics. Specifically:
1. The user-clear path (patchField options.clear, extraction sources refused) — how does an append-only ledger represent a clear, and does reopenQuestionsForCell still find its trigger?
2. The materiality/reask flags (reaskEligible on material edits; trivial edits never reopen) — where does that state live when writes become ledger entries?
3. P9 lock-by-precedence (p9SensitivityLocked derived from user provenance; permanence via upgrade-only precedence refusing later ai/doc writes) — confirm latest-explicit-wins cannot let a later doc-extracted entry shadow a user entry, and that the lock stays a DERIVED property under the ledger.
4. Anything else in PR 30/31/33's accessor contract (retirement thresholds, intent retirement on patch, dataSensitivityBaseline exception, multi-key retirement) that an append-only rewrite could silently change.

Output: a findings report — design risks, what the ledger schema must carry per entry, which existing executed tests pin each behavior and which need new pins — then STOP and wait. Do not start PR 36.
```

**Step 3 —** share the findings report back in chat before any PR 36 go.

## AFTER THE LEDGER CHECK (execution order — full specs in background doc Section 9)

**PR 36 — Ledger + hybrid** (riskiest; aim inside the Fable 5 window, Jun 22) → **PR 37 — Business inputs checklist (NEW)** → **PR 34 — Feedback loop** (cap stays 3, no telemetry) → **PR 35 — Taxonomy expansion** (+ Corporate Services role-mode default; reconcile AI_PATTERNS first) → **PR 38 — Firm AI policy evaluation (NEW, after the pilot)** → **Phase G (SLIMMED):** real Azure AD e2e · corporate repo copy · pilot (~12 colleague interviews + screenshots/process docs/charts; doc-extraction indicator findings check BEFORE the pilot).

## SETTLED DECISIONS — don't reopen without cause
Everything in v11/v12/v13 still stands (background doc Section 13 has the consolidated list: accessor + upgrade-only precedence · 0.7 shared threshold, re-affirmed · generate-anyway never disabled · business case server-only + snapshot + prior preserved · scoring client-side only · two-surface question funnel · materiality rule · tier flips always explained · P9 lock = provenance promotion · mount tests required · wiring first, polish later · test gate **119/119**), **plus new 2026-06-12:**
- **Business review:** roadmap re-cut (36 early, inside the window) · PR 37 + PR 38 added · Corporate Services role-mode default (with 35) · pilot bar ~12 interviews + doc inputs · OpenAI sign-off external, Phase G slimmed · gap cap stays 3, NO telemetry · compliance = advisory flag, never a gate · ledger findings check before 36 · app.js stays ONE file
- **Polish PR:** contentless sessions never auto-save (current-state localStorage write stays unconditional) · list hides zero-step UNNAMED strays with a visible "N empty hidden" count; named empties always stay (legitimate-session protection outranks stray hygiene; deletion affordance deferred) · Invariant 7: dual-derivation values lockstep-tested, list endpoints recompute summaries from state · review-panel filters session-level, totals library-wide, controls never unmount · advisory copy strings (tier label "Flagged for governance review"; P9 note card/download lockstep) · "Pattern confidence" relabel (rename not rewire) · family chip muted with color dot (logic kept) · rate suffix mirrors rateSource

## CARRY-ITEMS (don't lose)
**→ Polish PR: ALL 11 DONE** (#133)
**→ PR 36:** dataSensitivityBaseline fold-in · per-workflow snapshot re-key · /api/pattern-handoff removal · renderSessionLibrary + ghost #sessionLibraryList + activeWorkbenchTab="library" call sites · evidence ghost-hosts (renderEvidenceWorkbench/renderEvidenceReviewPanel, five missing ids, dead evidenceArtifactCard "full" path) · real evidence offsets · multi-key retirement revisit · 40-cap eviction visibility ("on disk — value not loaded" hint, PR-36-adjacent)
**→ Future items (logged in #133's description):** empty-session cleanup affordance (destructive surface, deferred) · loading shouldn't bump updatedAt/re-save · origin branch cleanup (~110 stale, GitHub website, mine) · ROSETTA.md still has pre-advisory compliance copy (~line 466)
**→ Investigate someday (findings-only; the starred ones MUST be checked before the pilot — doc-extraction path takes the pilot load):** *"Analyzed as pasted workflow" indicator presumed not rendering · *per-step DOCX may lack 30b provenance lines · *provenance-pill hover tooltip never visually confirmed · stray white horizontal bar below Discovery main content (answer still pending — re-ask)

## WATCH ITEMS
- If [harvest-grid] dropped-key logs reappear → escalate to strict json_schema (ready-made deferred fix)
- **Fable 5 plan-included until Jun 22** — polish landed inside the window; PR 36 is next precisely to fit inside it too
- Container resets frequent → after any reset: branch-state proof, model-indicator check, re-send anything unacknowledged
- **AI_PATTERNS code (~10) vs doc (6) mismatch** — reconcile in/before PR 35
- TEST B step 01 gates on sensitivity — expected fixture state; TEST B scoring shows the low-data "provisional" variant — expected; the Jun-10 named-empty duplicate row — visible by design
- npm test read un-piped, always · old cached prompts show stale blurbs until regenerated (accepted)
