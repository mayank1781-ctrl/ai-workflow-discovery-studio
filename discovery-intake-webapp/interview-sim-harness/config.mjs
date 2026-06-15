import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRootDefault = path.resolve(__dirname, '..');

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const bool = (name, fallback = false) => {
  if (!(name in process.env)) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name]).toLowerCase());
};

export const config = {
  target: process.env.EVAL_TARGET || 'mock',
  appRoot: process.env.APP_REPO || appRootDefault,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:5173',
  appPort: String(process.env.PORT || '5173'),
  personasPath: process.env.EVAL_PERSONAS || './personas/interview-sim-personas.json',
  outDir: process.env.EVAL_OUT || './out',
  fixturesDir: process.env.EVAL_FIXTURES || './fixtures',
  record: bool('EVAL_RECORD', true),
  skipAppBoot: bool('SKIP_APP_BOOT', false),
  budgetMin: num('EVAL_BUDGET_MIN', 120),
  calibrationSims: num('EVAL_CALIBRATION_SIMS', 3),
  concurrency: Math.max(1, Math.min(3, num('EVAL_CONCURRENCY', 1))),
  gapMs: Math.max(0, num('EVAL_GAP_MS', 300)),
  maxTurns: Math.max(4, num('EVAL_MAX_TURNS', 12)),
  minTurns: Math.max(2, num('EVAL_MIN_TURNS', 5)),
  requestTimeoutMs: Math.max(10_000, num('EVAL_REQUEST_TIMEOUT_MS', 180_000)),
  intervieweeModel: process.env.INTERVIEWEE_MODEL || 'gpt-4o-mini',
  judgeModel: process.env.JUDGE_MODEL || 'gpt-4o',
  openAiApiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
  openAiKey: process.env.OPENAI_API_KEY || '',
  judgeApiKey: process.env.JUDGE_API_KEY || process.env.OPENAI_API_KEY || '',
  locale: 'en-US',
  currency: 'USD',
  firstQuestion: 'What task or workflow do you want to talk about? Briefly describe what happens, the business outcome, and the main output.',
  allowedSets: {
    'suggest-role': ['operations', 'analysis', 'review-approval', 'client-facing', 'project-management', 'specialist', 'support'],
    'suggest-step-type': ['decision', 'handoff', 'data-op', 'judgment', 'review'],
    'suggest-structural-type': ['role-to-role', 'human-to-system', 'system-to-human', 'system-to-system', 'approval', 'routing', 'prioritization', 'exception-handling', 'judgment-call'],
    'suggest-friction': ['manual-entry', 'system-switching', 'rework', 'waiting', 'error-prone']
  }
};
