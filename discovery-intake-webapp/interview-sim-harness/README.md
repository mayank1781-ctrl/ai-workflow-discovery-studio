# Interview Simulation Harness

Standalone, on-demand AI-vs-AI eval for the discovery-intake app. See
`interview-sim-harness-RUNBOOK.md` for the operating contract.

This package is intentionally separate from the app's offline test gate. It calls live models, costs money, is non-deterministic, and must never be wired into `npm test` or used to gate a merge. A non-zero exit is informational only.

## Quick Start

Mock mode, no network or API key:

```bash
cd interview-sim-harness
EVAL_TARGET=mock npm run eval
open out/scorecard.html
```

Live mode, against an already-running app:

```bash
cd interview-sim-harness
export OPENAI_API_KEY="sk-..."

EVAL_TARGET=live-app \
SKIP_APP_BOOT=1 \
APP_BASE_URL=http://localhost:5173 \
EVAL_BUDGET_MIN=120 \
EVAL_CONCURRENCY=1 \
EVAL_GAP_MS=300 \
EVAL_RECORD=1 \
npm run eval

open out/scorecard.html
```

Live mode can also boot the app itself; omit `SKIP_APP_BOOT=1` and set `PORT`
if you need a non-default port.

Replay recorded live transcripts without calling the app again:

```bash
EVAL_TARGET=replay npm run eval
```

## What It Grades

- `rails`: well-formed tags, controlled vocabularies, and leverage-framed language only.
- `capture-accuracy`: approximate anchor recall and precision vs persona `ground_truth`; exposes `captureRecall`.
- `flow-quality`: pinned LLM judge (`JUDGE_MODEL`, default `gpt-4o`) when a key is present, otherwise a deterministic heuristic.
- `output-completion`: whether the captured artifact has the core interview anchors and a recap.

Outputs:

```text
out/results.json
out/scorecard.html
```

Useful knobs:

```text
EVAL_TARGET=mock|live-app|replay
EVAL_BUDGET_MIN=120
EVAL_CALIBRATION_SIMS=3
EVAL_CONCURRENCY=1
EVAL_GAP_MS=300
EVAL_MAX_TURNS=12
INTERVIEWEE_MODEL=gpt-4o-mini
JUDGE_MODEL=gpt-4o
SKIP_APP_BOOT=1
```
