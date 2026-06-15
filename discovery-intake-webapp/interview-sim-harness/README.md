# Interview Simulation Harness

Standalone, on-demand AI-vs-AI eval for the discovery-intake app.

This package is intentionally separate from the app's offline test gate. It calls live models, costs money, is non-deterministic, and must never be wired into `npm test` or used to gate a merge. A non-zero exit is informational only.

## Quick Start

Mock mode, no network:

```bash
cd interview-sim-harness
npm run eval
open out/scorecard.html
```

Live mode, with the app booted by the harness:

```bash
cd interview-sim-harness
export OPENAI_API_KEY="sk-..."

EVAL_TARGET=live-app \
EVAL_BUDGET_MIN=120 \
EVAL_CONCURRENCY=1 \
EVAL_GAP_MS=300 \
EVAL_RECORD=1 \
npm run eval

open out/scorecard.html
```

Replay recorded live transcripts without calling the app again:

```bash
EVAL_TARGET=replay npm run eval
```

## What It Grades

- Rails: well-formed tags, controlled vocabularies, and leverage-framed language only.
- Capture accuracy: approximate anchor recall and precision vs persona `ground_truth`.
- Flow quality: pinned LLM judge (`JUDGE_MODEL`, default `gpt-4o`) when a key is present.
- Output completion: whether the captured artifact has the core interview anchors and a recap.

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
