import { promises as fs } from 'node:fs';
import path from 'node:path';
import { median, pct, round } from './util.mjs';

export async function writeScorecard(outDir, payload) {
  await fs.mkdir(outDir, { recursive: true });
  const summary = summarize(payload);
  const full = { ...payload, summary };
  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(full, null, 2));
  await fs.writeFile(path.join(outDir, 'scorecard.html'), renderHtml(full));
  return summary;
}

export function summarize(payload) {
  const results = payload.results || [];
  const groups = groupBy(results, (item) => item.personaId);
  const perPersona = [...groups.entries()].map(([personaId, rows]) => summarizeRows(personaId, rows));
  const aggregate = summarizeRows('ALL', results);
  const weakSpots = buildWeakSpots(results);
  return { aggregate, perPersona, weakSpots };
}

function summarizeRows(label, rows) {
  const railPass = rows.filter((row) => row.grades?.rails?.pass).length;
  const outputComplete = rows.filter((row) => row.grades?.output?.complete).length;
  const flowScored = rows.filter((row) => Number.isFinite(row.grades?.flow?.score));
  const flowFlagged = rows.filter((row) => row.grades?.flow?.flagged).length;
  const avg = (values) => {
    const nums = values.filter(Number.isFinite);
    return nums.length ? round(nums.reduce((a, b) => a + b, 0) / nums.length, 3) : null;
  };
  return {
    label,
    n: rows.length,
    railsPassPct: pct(railPass, rows.length, 1),
    railViolations: rows.reduce((sum, row) => sum + (row.grades?.rails?.violations?.length || 0), 0),
    captureRecallAvg: avg(rows.map((row) => row.grades?.capture?.recall)),
    capturePrecisionAvg: avg(rows.map((row) => row.grades?.capture?.precision)),
    flowQualityAvg: avg(flowScored.map((row) => row.grades.flow.score)),
    flowFlagged,
    outputCompletionPct: pct(outputComplete, rows.length, 1),
    medianTurns: median(rows.map((row) => row.turns)),
    medianWallSec: round((median(rows.map((row) => row.wallMs)) || 0) / 1000, 1)
  };
}

function buildWeakSpots(results) {
  const counts = new Map();
  const add = (key, detail) => {
    const item = counts.get(key) || { key, count: 0, examples: [] };
    item.count += 1;
    if (detail && item.examples.length < 5) item.examples.push(detail);
    counts.set(key, item);
  };
  for (const row of results) {
    if (!row.grades?.rails?.pass) add('rails', `${row.personaId}: ${row.grades.rails.violations[0] || 'rail violation'}`);
    if ((row.grades?.capture?.stage?.intake?.recall ?? 1) < 0.75) add('intake', `${row.personaId}: intake recall ${row.grades.capture.stage.intake.recall}`);
    if ((row.grades?.capture?.stage?.analysis?.recall ?? 1) < 0.65) add('analysis', `${row.personaId}: analysis recall ${row.grades.capture.stage.analysis.recall}`);
    if (row.grades?.flow?.flagged) add('flow', `${row.personaId}: ${row.grades.flow.reason || 'judge flagged'}`);
    if (!row.grades?.output?.complete) add('output', `${row.personaId}: ${row.grades.output.reason}`);
    for (const spot of row.grades?.flow?.weakSpots || []) add(`flow: ${spot}`, row.personaId);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

function groupBy(items, fn) {
  const map = new Map();
  for (const item of items) {
    const key = fn(item);
    const rows = map.get(key) || [];
    rows.push(item);
    map.set(key, rows);
  }
  return map;
}

function renderHtml(payload) {
  const { summary, results, run } = payload;
  const aggregate = summary.aggregate;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Interview Simulation Scorecard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; color: #17202a; background: #f7f8fa; }
    header { background: #102033; color: #fff; padding: 28px 32px; }
    main { padding: 24px 32px 48px; max-width: 1180px; margin: 0 auto; }
    h1, h2 { margin: 0 0 12px; }
    h2 { margin-top: 28px; }
    .note { color: #5b6673; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 18px 0; }
    .metric { background: #fff; border: 1px solid #dde3ea; border-radius: 8px; padding: 14px; }
    .metric strong { display: block; font-size: 24px; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dde3ea; }
    th, td { text-align: left; border-bottom: 1px solid #e8edf3; padding: 10px; vertical-align: top; }
    th { background: #eef3f8; font-size: 13px; }
    code { background: #eef3f8; padding: 2px 4px; border-radius: 4px; }
    .bad { color: #a33; font-weight: 700; }
    .ok { color: #176b3a; font-weight: 700; }
    .pill { display: inline-block; border-radius: 999px; padding: 2px 8px; background: #edf2f7; margin: 2px; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>Interview Simulation Scorecard</h1>
    <div>Separate live-model eval track. Informational only. Never gates a merge.</div>
  </header>
  <main>
    <p class="note">Target: <code>${esc(run.target)}</code> | Personas: ${esc(String(run.personaCount))} | Sims: ${esc(String(results.length))} | Generated: ${esc(run.generatedAt)}</p>
    ${run.calibration ? `<p class="note">Calibration median: ${esc(String(run.calibration.medianWallSec))}s per sim; planned total: ${esc(String(run.calibration.plannedTotal))}; budget: ${esc(String(run.calibration.budgetMin))} min with 10% margin.</p>` : ''}
    <section class="grid">
      ${metric('Rails pass', pctText(aggregate.railsPassPct))}
      ${metric('Rail violations', aggregate.railViolations)}
      ${metric('Capture recall avg', scoreText(aggregate.captureRecallAvg))}
      ${metric('Capture precision avg', scoreText(aggregate.capturePrecisionAvg))}
      ${metric('Flow quality avg', scoreText(aggregate.flowQualityAvg))}
      ${metric('Flow flagged', aggregate.flowFlagged)}
      ${metric('Output completion', pctText(aggregate.outputCompletionPct))}
      ${metric('Median turns', aggregate.medianTurns ?? '-')}
    </section>
    <h2>Weak Spots</h2>
    ${summary.weakSpots.length ? `<table><thead><tr><th>Stage</th><th>Count</th><th>Examples</th></tr></thead><tbody>${summary.weakSpots.map((spot) => `<tr><td>${esc(spot.key)}</td><td>${spot.count}</td><td>${spot.examples.map((ex) => `<span class="pill">${esc(ex)}</span>`).join(' ')}</td></tr>`).join('')}</tbody></table>` : '<p class="ok">No weak spots detected.</p>'}
    <h2>Per Persona</h2>
    <table>
      <thead><tr><th>Persona</th><th>Sims</th><th>Rails</th><th>Capture Recall</th><th>Capture Precision</th><th>Flow Avg</th><th>Flagged</th><th>Output</th><th>Median Time</th></tr></thead>
      <tbody>
        ${summary.perPersona.map((row) => `<tr><td>${esc(row.label)}</td><td>${row.n}</td><td>${pctText(row.railsPassPct)} (${row.railViolations} viol)</td><td>${scoreText(row.captureRecallAvg)}</td><td>${scoreText(row.capturePrecisionAvg)}</td><td>${scoreText(row.flowQualityAvg)}</td><td>${row.flowFlagged}</td><td>${pctText(row.outputCompletionPct)}</td><td>${row.medianWallSec}s</td></tr>`).join('')}
      </tbody>
    </table>
    <h2>Simulation Detail</h2>
    <table>
      <thead><tr><th>Run</th><th>Persona</th><th>Turns</th><th>Stop</th><th>Rails</th><th>Capture</th><th>Flow</th><th>Output</th><th>Missed Anchors</th></tr></thead>
      <tbody>
        ${results.map((row) => `<tr>
          <td>${esc(row.runId)}</td>
          <td>${esc(row.personaId)}</td>
          <td>${row.turns}</td>
          <td>${esc(row.stopReason)}</td>
          <td class="${row.grades.rails.pass ? 'ok' : 'bad'}">${row.grades.rails.pass ? 'pass' : 'fail'}${row.grades.rails.violations.length ? `<br>${row.grades.rails.violations.map(esc).join('<br>')}` : ''}</td>
          <td>R ${scoreText(row.grades.capture.recall)} / P ${scoreText(row.grades.capture.precision)}</td>
          <td>${row.grades.flow.skipped ? 'skipped' : `${scoreText(row.grades.flow.score)}${row.grades.flow.flagged ? ' flagged' : ''}`}</td>
          <td class="${row.grades.output.complete ? 'ok' : 'bad'}">${esc(row.grades.output.reason)}</td>
          <td>${(row.grades.capture.missed || []).slice(0, 5).map((m) => `<span class="pill">${esc(m.type)}: ${esc(m.value)}</span>`).join(' ')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </main>
</body>
</html>`;
}

function metric(label, value) {
  return `<div class="metric"><span>${esc(label)}</span><strong>${esc(String(value ?? '-'))}</strong></div>`;
}

function scoreText(value) {
  return value === null || value === undefined ? '-' : String(round(value, 3));
}

function pctText(value) {
  return value === null || value === undefined ? '-' : `${value}%`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

