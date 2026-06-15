import { flattenStrings, normalizeText, pct, round } from '../util.mjs';

export function gradeCaptureAccuracy(result, persona) {
  const truth = persona.ground_truth || {};
  const capturedText = normalizeText(flattenStrings({
    fields: result.capturedState?.fields,
    steps: result.capturedState?.steps,
    decisions: result.capturedState?.decisions,
    finalRecap: result.finalRecap
  }).join(' '));

  const expected = buildExpectedAnchors(truth);
  const matched = expected.filter((anchor) => matches(capturedText, anchor.value));
  const capturedItems = buildCapturedItems(result);
  const precise = capturedItems.filter((item) => expected.some((anchor) => matches(normalizeText(anchor.value), item) || matches(normalizeText(item), anchor.value)));

  const stage = {
    intake: scoreGroup(expected, matched, ['workflow', 'cadence', 'position', 'recurring']),
    analysis: scoreGroup(expected, matched, ['step', 'tool', 'person', 'friction', 'handoff'])
  };

  const recall = round(matched.length / Math.max(1, expected.length), 3);
  const precision = round(precise.length / Math.max(1, capturedItems.length), 3);
  return {
    expectedAnchors: expected.length,
    matchedAnchors: matched.length,
    capturedItems: capturedItems.length,
    preciseItems: precise.length,
    captureRecall: recall,
    capturePrecision: precision,
    recall,
    precision,
    recallPct: pct(matched.length, expected.length, 1),
    precisionPct: pct(precise.length, capturedItems.length, 1),
    missed: expected.filter((anchor) => !matched.includes(anchor)).slice(0, 12),
    stage
  };
}

export const gradeCapture = gradeCaptureAccuracy;

function buildExpectedAnchors(truth) {
  const anchors = [];
  add(anchors, 'workflow', truth.workflow_name);
  add(anchors, 'cadence', truth.cadence?.detail || truth.cadence?.type);
  add(anchors, 'position', truth.your_position);
  add(anchors, 'recurring', truth.recurring_or_project);
  for (const step of truth.steps || []) {
    add(anchors, 'step', step.label);
    for (const tool of step.tools || []) add(anchors, 'tool', tool);
    for (const person of step.people || []) add(anchors, 'person', person);
    add(anchors, 'friction', step.friction);
  }
  for (const handoff of truth.handoffs || []) {
    add(anchors, 'handoff', `${handoff.from} ${handoff.to} ${handoff.what}`);
  }
  return anchors;
}

function add(anchors, type, value) {
  if (value && String(value).trim()) anchors.push({ type, value: String(value).trim() });
}

function buildCapturedItems(result) {
  const items = [];
  const state = result.capturedState || {};
  for (const value of Object.values(state.fields || {})) if (String(value || '').trim()) items.push(String(value));
  for (const step of state.steps || []) {
    for (const key of ['name', 'actor', 'tool', 'action', 'output', 'handoff', 'trigger', 'decision', 'pain']) {
      if (String(step[key] || '').trim()) items.push(String(step[key]));
    }
  }
  for (const decision of state.decisions || []) {
    for (const value of Object.values(decision || {})) if (String(value || '').trim()) items.push(String(value));
  }
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function matches(haystackOrNeedle, maybeNeedle) {
  const haystack = normalizeText(haystackOrNeedle);
  const needle = normalizeText(maybeNeedle);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  const tokens = needle.split(' ').filter((token) => token.length > 2);
  if (!tokens.length) return false;
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits / tokens.length >= (tokens.length <= 2 ? 1 : 0.6);
}

function scoreGroup(expected, matched, types) {
  const exp = expected.filter((anchor) => types.includes(anchor.type));
  const got = matched.filter((anchor) => types.includes(anchor.type));
  return {
    expected: exp.length,
    matched: got.length,
    recall: round(got.length / Math.max(1, exp.length), 3)
  };
}
