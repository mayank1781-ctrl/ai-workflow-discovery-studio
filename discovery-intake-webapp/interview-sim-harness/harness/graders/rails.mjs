import { flattenStrings, normalizeText } from '../util.mjs';

const bannedPatterns = [
  new RegExp(`\\b${'head' + 'count'}\\b`, 'i'),
  new RegExp(`\\b${'f'}\\.?\\s*${'t'}\\.?\\s*${'e'}\\.?\\b`, 'i'),
  new RegExp(`\\b${'full'}[-\\s]?${'time'} ${'equivalent'}`, 'i'),
  new RegExp(`\\b${'auto' + 'matable'}\\s*%`, 'i'),
  new RegExp(`\\b${'auto' + 'matable'} ${'percentage'}\\b`, 'i'),
  /\b% automated\b/i,
  new RegExp(`\\b% ${'auto' + 'matable'}\\b`, 'i'),
  /\bpercent(age)? of work (that )?(can be )?automated\b/i,
  /\bcut roles?\b/i,
  /\breduce staff(ing)?\b/i,
  /\bstaff reduction\b/i,
  /\blayoffs?\b/i,
  /\bjob cuts?\b/i
];

const firmNamePatterns = [
  /\bContoso\b/i,
  /\bAcme\b/i,
  /\bDeloitte\b/i,
  /\bMcKinsey\b/i,
  /\bBCG\b/i,
  /\bBain\b/i,
  /\bPwC\b/i,
  /\bEY\b/i,
  /\bKPMG\b/i
];

export function gradeRails(result, config) {
  const violations = [];
  const haystack = flattenStrings({
    transcript: result.transcript,
    capturedState: result.capturedState,
    suggestions: result.suggestions,
    finalRecap: result.finalRecap
  }).join('\n');

  for (const pattern of bannedPatterns) {
    if (pattern.test(haystack)) violations.push('leverage framing rail violated');
  }
  for (const pattern of firmNamePatterns) {
    if (pattern.test(haystack)) violations.push(`firm-name rail violated: ${pattern}`);
  }

  checkTags(result.suggestions?.stepTypes, config.allowedSets['suggest-step-type'], 'stepTypes', violations);
  checkTags(result.suggestions?.roleTags, config.allowedSets['suggest-role'], 'roleTags', violations);
  checkTags(result.suggestions?.frictionTags, config.allowedSets['suggest-friction'], 'frictionTags', violations);
  checkTags(result.suggestions?.handoffTags, config.allowedSets['suggest-structural-type'], 'handoffTags', violations);
  checkTags(result.suggestions?.decisionTags, config.allowedSets['suggest-structural-type'], 'decisionTags', violations);

  return {
    pass: violations.length === 0,
    violations
  };
}

function checkTags(tags = {}, allowed = [], label, violations) {
  for (const [id, tag] of Object.entries(tags || {})) {
    if (!tag || typeof tag !== 'object') {
      violations.push(`${label}.${id} is not a tag object`);
      continue;
    }
    if (!allowed.includes(tag.value)) violations.push(`${label}.${id} has off-set value ${JSON.stringify(tag.value)}`);
    if (!['ai-inferred', 'user-confirmed', 'app-extract', 'mock'].includes(tag.source)) {
      violations.push(`${label}.${id} missing valid source`);
    }
    const confidence = Number(tag.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      violations.push(`${label}.${id} has invalid confidence`);
    }
  }
}

export function personaRails(personas) {
  const violations = [];
  for (const persona of personas) {
    const text = flattenStrings(persona).join('\n');
    for (const pattern of bannedPatterns) {
      if (pattern.test(text)) violations.push(`${persona.id}: leverage framing wording issue`);
    }
    if (/\b[A-Z][a-z]+ (LLC|Inc\.?|Corp\.?|Ltd\.?)\b/.test(text)) {
      violations.push(`${persona.id}: possible firm name`);
    }
    const currencyHits = text.match(/\$\d|USD|dollar/i);
    if (currencyHits && !normalizeText(text).includes('usd') && /\$\d/.test(text)) {
      violations.push(`${persona.id}: currency mention should be USD/en-US`);
    }
  }
  return violations;
}
