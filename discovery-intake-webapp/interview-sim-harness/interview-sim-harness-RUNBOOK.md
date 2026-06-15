# Interview Simulation Harness Runbook

Standalone, on-demand AI-vs-AI interview evaluation for the Discovery Intake app.

This package is intentionally separate from the application test gate. It may call live models, it can cost money, and model behavior is non-deterministic. Do not import it from the app, do not add it to the root `npm test`, and do not use it to gate a merge.

## What Runs

The harness simulates the discovery interview loop:

1. A persona-driven interviewee answers from `personas/interview-sim-personas.json`.
2. The app acts as interviewer.
   - `EVAL_TARGET=mock`: deterministic in-process mock interviewer.
   - `EVAL_TARGET=live-app`: the running app answers through `/api/extract` and `/api/suggest-*`.
   - `EVAL_TARGET=replay`: already-recorded live fixtures are graded again.
3. Four graders score every run:
   - `rails`: rail wording, firm-name safety, and controlled-vocabulary tags.
   - `capture-accuracy`: recall/precision against persona `ground_truth`, including `captureRecall`.
   - `flow-quality`: judge model when configured, deterministic heuristic otherwise.
   - `output-completion`: final recap contains the core workflow anchors.
4. The harness writes `out/results.json` and `out/scorecard.html`.

## Mock Mode

Mock mode has no network or key requirement and should work out of the box:

```bash
cd interview-sim-harness
EVAL_TARGET=mock npm run eval
open out/scorecard.html
```

`npm run eval` defaults to mock mode when `EVAL_TARGET` is unset.

## Live App, Already Running

Use this when you already have the app running locally:

```bash
# terminal 1, from discovery-intake-webapp
AUTH_ENABLED=false PORT=5173 npm run dev
```

```bash
# terminal 2, from discovery-intake-webapp/interview-sim-harness
OPENAI_API_KEY="sk-..." \
EVAL_TARGET=live-app \
SKIP_APP_BOOT=1 \
APP_BASE_URL=http://localhost:5173 \
EVAL_BUDGET_MIN=120 \
EVAL_CONCURRENCY=1 \
EVAL_GAP_MS=300 \
npm run eval
```

## Live App, Booted By Harness

The harness can also start and stop the app process for the run:

```bash
cd interview-sim-harness
OPENAI_API_KEY="sk-..." \
EVAL_TARGET=live-app \
APP_BASE_URL=http://localhost:5173 \
PORT=5173 \
EVAL_BUDGET_MIN=120 \
EVAL_CONCURRENCY=1 \
EVAL_GAP_MS=300 \
npm run eval
```

The booted app is launched with `AUTH_ENABLED=false` so the local eval can call the app endpoints without a browser login.

## Replay Mode

Live runs can record fixtures when `EVAL_RECORD=1`. Re-grade those fixtures without calling the app:

```bash
cd interview-sim-harness
EVAL_TARGET=replay npm run eval
```

## Useful Knobs

```text
EVAL_TARGET=mock|live-app|replay
EVAL_PERSONAS=./personas/interview-sim-personas.json
EVAL_OUT=./out
EVAL_FIXTURES=./fixtures
EVAL_RECORD=1
EVAL_BUDGET_MIN=120
EVAL_CALIBRATION_SIMS=3
EVAL_CONCURRENCY=1
EVAL_GAP_MS=300
EVAL_MAX_TURNS=12
EVAL_MIN_TURNS=5
EVAL_SIM_LIMIT=3
INTERVIEWEE_MODEL=gpt-4o-mini
JUDGE_MODEL=gpt-4o
JUDGE_API_KEY=<optional override; defaults to OPENAI_API_KEY>
OPENAI_API_KEY=sk-...
APP_BASE_URL=http://localhost:5173
APP_REPO=..
PORT=5173
SKIP_APP_BOOT=1
```

## Expected Output

The scorecard headline includes `captureRecall` as an aggregate number across all simulations. `results.json` keeps the full per-run detail, including transcript, captured app state, suggestions, final recap, and the four grader outputs.
