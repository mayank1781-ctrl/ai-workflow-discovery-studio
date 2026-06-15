import { promises as fs } from 'node:fs';
import path from 'node:path';
import { compact, fetchJsonWithRetry, flattenStrings, normalizeText, sleep, stableId } from './util.mjs';

const collectionNames = ['steps', 'data', 'systems', 'decisions', 'patterns'];

export function createAppClient(config) {
  if (config.target === 'mock') return new MockAppClient(config);
  if (config.target === 'live-app') return new LiveAppClient(config);
  throw new Error(`App client does not support target ${config.target}`);
}

class MockAppClient {
  constructor(config) {
    this.config = config;
  }

  async startDiscovery({ persona }) {
    return {
      id: `mock-${persona.id}-${Date.now()}`,
      persona,
      turn: 0,
      transcript: [],
      currentQuestion: this.config.firstQuestion,
      state: emptyState(),
      suggestions: emptySuggestions()
    };
  }

  async sendTurn(session, answerText) {
    session.turn += 1;
    session.transcript.push({ role: 'user', text: answerText });
    applyGroundTruthProgress(session.state, session.persona.ground_truth, session.turn);
    const done = session.turn >= Math.max(4, this.config.minTurns);
    session.currentQuestion = done
      ? 'I think I have enough to recap the workflow. Does this look right?'
      : mockQuestion(session.turn);
    return { nextQuestion: session.currentQuestion, capturedState: session.state, done };
  }

  async enrichSuggestions(session) {
    const steps = session.state.steps || [];
    steps.forEach((step, index) => {
      const id = step.id || stableId('step', index);
      session.suggestions.stepTypes[id] = tag('data-op', 0.82);
      session.suggestions.roleTags[id] = tag(index % 2 ? 'review-approval' : 'operations', 0.78);
      session.suggestions.frictionTags[id] = { ...tag('manual-entry', 0.8), note: 'mock friction note' };
      if (step.handoff) session.suggestions.handoffTags[`h:${id}`] = tag('role-to-role', 0.76);
    });
    return session.suggestions;
  }
}

class LiveAppClient {
  constructor(config) {
    this.config = config;
  }

  async startDiscovery({ persona }) {
    return {
      id: `live-${persona.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      persona,
      turn: 0,
      transcript: [],
      currentQuestion: this.config.firstQuestion,
      state: emptyState(),
      suggestions: emptySuggestions()
    };
  }

  async sendTurn(session, answerText) {
    session.turn += 1;
    session.transcript.push({ role: 'user', text: answerText });
    const transcriptText = transcriptToText(session.transcript);
    const result = await this.post('/api/extract', {
      currentSection: session.state.activeSection,
      answer: answerText,
      transcript: transcriptText,
      currentQuestion: session.currentQuestion,
      gridContext: gridContext(session.state),
      gridSummary: gridSummary(session.state),
      state: session.state
    });
    mergeExtraction(session.state, result);
    const nextQuestion = cleanQuestion(result?.nextQuestion) || fallbackQuestion(session);
    session.currentQuestion = nextQuestion;
    session.transcript.push({
      role: 'assistant',
      text: nextQuestion,
      summary: result?.summary || '',
      progressNotes: result?.progressNotes || ''
    });
    await sleep(this.config.gapMs);
    return {
      nextQuestion,
      capturedState: session.state,
      raw: result,
      done: doneHeuristic(session, this.config)
    };
  }

  async enrichSuggestions(session) {
    const steps = (session.state.steps || []).slice(0, 8);
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      const id = step.id || stableId('step', index);
      step.id = id;
      const text = stepText(step);
      const [stepType, friction, role] = await Promise.all([
        this.safeSuggest('/api/suggest-step-type', { step: suggestionStep(step) }),
        this.safeSuggest('/api/suggest-friction', { text }),
        this.safeSuggest('/api/suggest-role', { text })
      ]);
      if (stepType?.value) session.suggestions.stepTypes[id] = tag(stepType.value, stepType.confidence);
      if (friction?.value) session.suggestions.frictionTags[id] = { ...tag(friction.value, friction.confidence), note: friction.note || '' };
      if (role?.value) session.suggestions.roleTags[id] = tag(role.value, role.confidence);
      if (step.handoff) {
        const structural = await this.safeSuggest('/api/suggest-structural-type', { kind: 'handoff', text: step.handoff });
        if (structural?.value) session.suggestions.handoffTags[`h:${id}`] = tag(structural.value, structural.confidence);
      }
      await sleep(this.config.gapMs);
    }
    return session.suggestions;
  }

  async safeSuggest(route, body) {
    try {
      return await this.post(route, body);
    } catch (error) {
      return { value: null, error: String(error.message || error) };
    }
  }

  async post(route, body) {
    return fetchJsonWithRetry(`${this.config.appBaseUrl}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, {
      timeoutMs: this.config.requestTimeoutMs
    });
  }
}

export async function recordFixture(config, result) {
  if (!config.record || config.target !== 'live-app') return;
  await fs.mkdir(config.fixturesDir, { recursive: true });
  const name = `${result.personaId}.${result.runId}.json`;
  await fs.writeFile(path.join(config.fixturesDir, name), JSON.stringify(result, null, 2));
}

export async function readReplayFixtures(config) {
  const entries = await fs.readdir(config.fixturesDir).catch(() => []);
  const fixtures = [];
  for (const entry of entries.filter((name) => name.endsWith('.json')).sort()) {
    const raw = JSON.parse(await fs.readFile(path.join(config.fixturesDir, entry), 'utf8'));
    fixtures.push(raw);
  }
  return fixtures;
}

export function emptyState() {
  return {
    activeSection: 'workflow',
    fields: {},
    steps: [],
    data: [],
    systems: [],
    decisions: [],
    patterns: [],
    ideas: [],
    evidenceArtifacts: []
  };
}

function emptySuggestions() {
  return {
    stepTypes: {},
    handoffTags: {},
    decisionTags: {},
    frictionTags: {},
    roleTags: {}
  };
}

function tag(value, confidence = 0.5) {
  return {
    value,
    source: 'ai-inferred',
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0.5
  };
}

function applyGroundTruthProgress(state, truth, turn) {
  if (turn >= 1) {
    state.fields.workflowName = truth.workflow_name;
    state.fields.submittedWorkflowTask = truth.workflow_name;
    state.fields.submittedFrequency = truth.cadence?.detail || truth.recurring_or_project;
    state.fields.intervieweeRole = truth.your_position;
    state.fields.currentStateSummary = `${truth.workflow_name}: ${truth.your_position}`;
  }
  if (turn >= 2) {
    state.steps = (truth.steps || []).map((step, index) => ({
      id: stableId('step', index),
      name: step.label,
      actor: (step.people || []).join(', '),
      tool: (step.tools || []).join(', '),
      action: step.label,
      handoff: (truth.handoffs || [])[index]?.what || '',
      pain: step.friction,
      output: (truth.handoffs || [])[index]?.what || ''
    }));
  }
  if (turn >= 3) {
    state.decisions = (truth.handoffs || []).map((handoff) => ({
      decision: handoff.what,
      owner: handoff.to,
      criteria: '',
      risk: '',
      approval: '',
      escalation: ''
    }));
  }
}

function mockQuestion(turn) {
  const questions = [
    'Walk me through the workflow from beginning to end.',
    'Where are the main handoffs or approvals?',
    'What tools and data show up in the main steps?',
    'What is most painful or slow today?'
  ];
  return questions[Math.min(turn, questions.length - 1)];
}

function mergeExtraction(state, result = {}) {
  const fields = result.fields || {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && value.trim()) state.fields[key] = value.trim();
  }
  const records = result.newRecords || {};
  for (const collection of collectionNames) {
    const incoming = Array.isArray(records[collection]) ? records[collection] : [];
    for (const record of incoming) mergeRecord(state[collection], record, collection);
  }
}

function mergeRecord(collection, record, collectionName) {
  if (!record || !flattenStrings(record).join('').trim()) return;
  const candidate = { ...record };
  const key = normalizeText(candidate.name || candidate.decision || candidate.category || candidate.step || flattenStrings(candidate).slice(0, 2).join(' '));
  if (!key) return;
  const existing = collection.find((item) => {
    const itemKey = normalizeText(item.name || item.decision || item.category || item.step || flattenStrings(item).slice(0, 2).join(' '));
    return itemKey && (itemKey === key || itemKey.includes(key) || key.includes(itemKey));
  });
  if (existing) {
    for (const [k, v] of Object.entries(candidate)) {
      if (typeof v === 'string' && v.trim() && !String(existing[k] || '').trim()) existing[k] = v.trim();
    }
    return;
  }
  if (collectionName === 'steps' && !candidate.id) candidate.id = stableId('step', collection.length);
  collection.push(candidate);
}

function cleanQuestion(text) {
  return String(text || '').replace(/^\s*(next\s+question|question)\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
}

function fallbackQuestion(session) {
  if (!session.state.steps.length) return 'Walk me through the workflow from beginning to end.';
  const step = session.state.steps.find((item) => !item.tool || !item.actor || !item.pain);
  if (step) return `For ${step.name || 'that step'}, what tools, people, or pain points matter most?`;
  return 'Can you confirm the recap and call out anything missing or wrong?';
}

function doneHeuristic(session, config) {
  if (session.turn < config.minTurns) return false;
  const truthCount = session.persona.ground_truth?.steps?.length || 4;
  const capturedSteps = session.state.steps?.length || 0;
  const hasWorkflow = Boolean(session.state.fields.workflowName || session.state.fields.submittedWorkflowTask);
  const completionSignal = /enough|recap|look at what|take a look|confirm|does this look right/i.test(session.currentQuestion || '');
  return hasWorkflow && capturedSteps >= Math.max(2, Math.ceil(truthCount * 0.6)) && completionSignal;
}

function transcriptToText(transcript) {
  return transcript.map((turn) => `${turn.role === 'assistant' ? 'Interviewer' : 'Interviewee'}: ${turn.text}`).join('\n');
}

function gridContext(state) {
  return {
    workflowName: state.fields.workflowName || state.fields.submittedWorkflowTask || '',
    knownStepCount: state.steps.length,
    knownSteps: state.steps.map((step) => ({
      name: step.name || step.action || '',
      actor: step.actor || '',
      tool: step.tool || '',
      pain: step.pain || ''
    }))
  };
}

function gridSummary(state) {
  const workflow = state.fields.workflowName || state.fields.submittedWorkflowTask || 'Workflow not named yet';
  const steps = state.steps.map((step, index) => `${index + 1}. ${compact(step.name || step.action || 'Unnamed step', 80)} (${compact(step.actor || '', 60)}; ${compact(step.tool || '', 60)})`);
  return [`Workflow: ${workflow}`, steps.length ? `Known steps:\n${steps.join('\n')}` : 'No confirmed steps yet.'].join('\n');
}

function stepText(step = {}) {
  return ['name', 'description', 'actor', 'tool', 'action', 'input', 'dataHandling', 'output', 'handoff', 'trigger', 'time', 'decision', 'pain', 'risk', 'exceptions']
    .map((key) => step[key])
    .filter(Boolean)
    .join('\n');
}

function suggestionStep(step = {}) {
  return {
    name: step.name || '',
    description: step.description || step.action || '',
    rulesDecisionLogic: step.decision || step.exceptions || '',
    dataProcessing: step.dataHandling || step.input || step.output || '',
    humanCheckpoint: step.actor || '',
    handoff: step.handoff || ''
  };
}

