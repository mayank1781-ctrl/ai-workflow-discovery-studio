# Test suite

Run with `npm test` (`node --test 'test/**/*.test.mjs'`). Two kinds of tests:

- **Source-extraction tests** (`scoring`, `audit`, `business-case`,
  `harvest-apply`, `accessor`, `question-memory`, `tier-sensitivity`,
  `evidence-tracing`): app.js is a browser classic script, so the functions
  under test are extracted
  from its source by brace-matching and **executed** with stubbed globals — the
  real shipped code runs, no DOM or network needed. Shared helpers live in
  `test/helpers/extract.mjs` (not matched by the test glob).
- **HTTP tests** (`server-http`): boot the real `server.mjs` as a child process
  and exercise the session API and auth gate over the wire.

## Grid cell accessor contract (PR 30)

All reads and writes of a `workflowGrid` step cell go through **one** pair of
functions in `app.js`:

- `getField(step, layer, cellKey)` — read (step defaults to the current
  interview step; `layer` is advisory and only warns on a mismatch).
- `patchField(step, layer, cellKey, value, source, confidence, options)` — the
  **only** place a step cell is mutated. It owns provenance (`cell.source` ∈
  `user-stated | user-edited | doc-extracted | ai-inferred`), the precedence
  rules (`user-* > doc-extracted > ai-inferred`, upgrades only, lower-provenance
  overwrites refused *and logged*), and the question-retirement hook.

`provenance` is derived **only from the write path** that captured the value
(the harvest payload's per-field state, a document extraction, or a user edit) —
never from the AI reply's narration of what it "captured".

This contract is enforced by an executed test: **`accessor.test.mjs`'s "no
direct step-cell mutation outside `patchField`"** greps the shipped source and
fails if any `*.cells[...] =` / `cell.value =` style assignment reappears
outside `patchField`. If you add a new writer, route it through `patchField` —
don't mutate cells directly, or that test will (correctly) go red.

## Environment contract (HTTP tests)

- **No AI keys, enforced — not assumed.** The spawn env sets
  `OPENAI_API_KEY=""` and `ANTHROPIC_API_KEY=""` explicitly, so neither the
  developer's shell env nor a local `.env` file can let a test reach
  OpenAI/Anthropic (dotenv never overrides variables that are already present,
  and an empty string counts as present). Don't remove these overrides.
- **Isolated data dir.** Each spawned server gets a throwaway temp `DATA_DIR`
  (cleaned up afterwards), so the real `data/sessions.db` and audit logs are
  never touched.
- **Ports.** Tests use 5199 (and 5198 for the auth-enabled boot), away from the
  dev server's 5173. Override with `TEST_PORT` if 5199 is taken.
