# Test suite

Run with `npm test` (`node --test 'test/**/*.test.mjs'`). Two kinds of tests:

- **Source-extraction tests** (`scoring`, `audit`, `business-case`, `harvest-apply`):
  app.js is a browser classic script, so the functions under test are extracted
  from its source by brace-matching and **executed** with stubbed globals — the
  real shipped code runs, no DOM or network needed. Shared helpers live in
  `test/helpers/extract.mjs` (not matched by the test glob).
- **HTTP tests** (`server-http`): boot the real `server.mjs` as a child process
  and exercise the session API and auth gate over the wire.

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
