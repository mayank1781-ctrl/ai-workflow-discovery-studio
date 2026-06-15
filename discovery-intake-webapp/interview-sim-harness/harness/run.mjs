// Standalone live-model eval track. Never import this from the app and never wire it into npm test.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.mjs';
import { bootApp } from './appProcess.mjs';
import { createAppClient, readReplayFixtures, recordFixture } from './appClient.mjs';
import { gradeCaptureAccuracy } from './graders/capture.mjs';
import { gradeFlowQuality } from './graders/flow.mjs';
import { gradeOutputCompletion } from './graders/output.mjs';
import { gradeRails, personaRails } from './graders/rails.mjs';
import { loadPersonas } from './personas.mjs';
import { writeScorecard } from './scorecard.mjs';
import { median, round } from './util.mjs';
import { runInterviewSimulation } from './driver.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harnessRoot = path.resolve(__dirname, '..');
process.chdir(harnessRoot);

async function main() {
  const generatedAt = new Date().toISOString();
  console.log(`\nInterview-sim eval target=${config.target} budget=${config.budgetMin}min concurrency=${config.concurrency}`);
  console.log('Separate live-model eval track; informational only; never gates a merge.\n');

  const { globalRules, personas } = await loadPersonas(config.personasPath);
  const personaViolations = personaRails(personas);
  if (personaViolations.length) {
    console.log('Persona rail warnings:');
    for (const violation of personaViolations) console.log(`  - ${violation}`);
  }

  if (config.target === 'replay') {
    const replayed = await readReplayFixtures(config);
    const results = await gradeRawResults(replayed, personas, globalRules);
    return finish({ generatedAt, personas, results, modeNote: 'replay' });
  }

  if (config.target === 'mock') {
    const appClient = createAppClient(config);
    const results = [];
    for (let i = 0; i < personas.length; i++) {
      results.push(await runAndGrade({ persona: personas[i], globalRules, appClient, runIndex: i }));
    }
    return finish({ generatedAt, personas, results, modeNote: 'mock' });
  }

  if (config.target !== 'live-app') throw new Error(`Unknown EVAL_TARGET: ${config.target}`);
  if (!config.openAiKey) throw new Error('OPENAI_API_KEY is not visible to this process; cannot run live-app eval.');

  let app = null;
  try {
    app = await bootApp(config);
    console.log(`App listening at ${config.appBaseUrl}${app.booted ? ' (booted by harness)' : ' (pre-existing app)'}`);
    const appClient = createAppClient(config);
    const calibrationCount = Math.min(config.calibrationSims, personas.length);
    const warmups = [];
    console.log(`Calibrating with ${calibrationCount} simulation(s)...`);
    for (let i = 0; i < calibrationCount; i++) {
      const result = await runAndGrade({ persona: personas[i], globalRules, appClient, runIndex: i });
      warmups.push(result);
      await recordFixture(config, result);
      console.log(`  warmup ${i + 1}/${calibrationCount}: ${result.personaId} ${round(result.wallMs / 1000, 1)}s`);
    }

    const medianWallMs = median(warmups.map((item) => item.wallMs)) || 180_000;
    const budgetMs = config.budgetMin * 60_000;
    const safeBudgetMs = budgetMs * 0.9;
    const plannedTotal = Math.max(personas.length, Math.floor(safeBudgetMs / medianWallMs));
    const optionalLimit = Number(process.env.EVAL_SIM_LIMIT || '');
    const cappedTotal = Number.isFinite(optionalLimit) && optionalLimit > 0 ? Math.min(plannedTotal, optionalLimit) : plannedTotal;
    const schedule = buildSchedule(personas, warmups, cappedTotal);
    const calibration = {
      warmupCount: warmups.length,
      medianWallMs,
      medianWallSec: round(medianWallMs / 1000, 1),
      plannedTotal,
      cappedTotal,
      budgetMin: config.budgetMin
    };
    console.log(`Calibration median ${calibration.medianWallSec}s/sim -> planned ${plannedTotal} sim(s), running ${cappedTotal}.`);

    const remainder = await runSchedule({ schedule, globalRules, appClient, startIndex: warmups.length });
    const results = [...warmups, ...remainder];
    return finish({ generatedAt, personas, results, calibration, modeNote: 'live-app' });
  } finally {
    if (app) await app.stop();
  }
}

async function runSchedule({ schedule, globalRules, appClient, startIndex }) {
  const results = [];
  let cursor = 0;
  async function worker(workerId) {
    while (cursor < schedule.length) {
      const localIndex = cursor++;
      const persona = schedule[localIndex];
      const runIndex = startIndex + localIndex;
      console.log(`  sim ${runIndex + 1}: ${persona.id} (worker ${workerId})`);
      const result = await runAndGrade({ persona, globalRules, appClient, runIndex });
      results.push(result);
      await recordFixture(config, result);
      console.log(`    done ${result.personaId}: turns=${result.turns} time=${round(result.wallMs / 1000, 1)}s rails=${result.grades.rails.pass ? 'pass' : 'fail'} captureRecall=${result.grades['capture-accuracy'].captureRecall}`);
    }
  }
  await Promise.all(Array.from({ length: config.concurrency }, (_, index) => worker(index + 1)));
  return results.sort((a, b) => a.runId.localeCompare(b.runId));
}

async function runAndGrade({ persona, globalRules, appClient, runIndex }) {
  const raw = await runInterviewSimulation({ config, persona, globalRules, appClient, runIndex });
  const grades = {
    rails: gradeRails(raw, config),
    'capture-accuracy': gradeCaptureAccuracy(raw, persona),
    'flow-quality': await gradeFlowQuality(raw, persona, config),
    'output-completion': gradeOutputCompletion(raw)
  };
  return { ...raw, grades };
}

async function gradeRawResults(rawResults, personas, globalRules) {
  const byId = new Map(personas.map((persona) => [persona.id, persona]));
  const results = [];
  for (let index = 0; index < rawResults.length; index++) {
    const raw = rawResults[index];
    const persona = byId.get(raw.personaId);
    if (!persona) continue;
    const noGrades = { ...raw };
    delete noGrades.grades;
    const grades = {
      rails: gradeRails(noGrades, config),
      'capture-accuracy': gradeCaptureAccuracy(noGrades, persona),
      'flow-quality': await gradeFlowQuality(noGrades, persona, { ...config, target: 'replay' }),
      'output-completion': gradeOutputCompletion(noGrades)
    };
    results.push({ ...noGrades, grades });
  }
  return results;
}

function buildSchedule(personas, warmups, total) {
  const seen = new Set(warmups.map((item) => item.personaId));
  const schedule = [];
  for (const persona of personas) {
    if (!seen.has(persona.id) && warmups.length + schedule.length < total) schedule.push(persona);
  }
  let i = 0;
  while (warmups.length + schedule.length < total) {
    schedule.push(personas[i % personas.length]);
    i += 1;
  }
  return schedule;
}

async function finish({ generatedAt, personas, results, calibration = null, modeNote }) {
  const payload = {
    run: {
      target: config.target,
      modeNote,
      generatedAt,
      personaCount: personas.length,
      appBaseUrl: config.appBaseUrl,
      calibration
    },
    results
  };
  const summary = await writeScorecard(config.outDir, payload);
  console.log('\nAggregate summary');
  console.log(`[ALL] n=${summary.aggregate.n} rails=${summary.aggregate.railsPassPct}% pass (${summary.aggregate.railViolations} viol) captureRecall=${summary.aggregate.captureRecall ?? '-'} capturePrecision=${summary.aggregate.capturePrecision ?? '-'} flowQuality=${summary.aggregate.flowQuality ?? '-'} flagged=${summary.aggregate.flowFlagged} output=${summary.aggregate.outputCompletionPct}%`);
  console.log('\nWeak spots');
  if (!summary.weakSpots.length) console.log('  none');
  for (const spot of summary.weakSpots) console.log(`  - ${spot.key}: ${spot.count}`);
  console.log(`\nScorecard written: ${config.outDir}/scorecard.html + ${config.outDir}/results.json\n`);
}

main().catch(async (error) => {
  console.error('eval crashed:', error.message || error);
  try {
    await writeScorecard(config.outDir, {
      run: {
        target: config.target,
        generatedAt: new Date().toISOString(),
        personaCount: 0,
        error: String(error.message || error)
      },
      results: []
    });
  } catch {
    // Ignore scorecard write failure; this eval track remains informational.
  }
  process.exitCode = 0;
});
