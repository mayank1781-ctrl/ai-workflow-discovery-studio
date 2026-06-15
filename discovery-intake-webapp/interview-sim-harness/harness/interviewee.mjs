import { chatJson, compact } from './util.mjs';

export async function answerAsInterviewee({ config, persona, globalRules, question, transcript, turn }) {
  if (config.target === 'mock') {
    return {
      answer: mockAnswer(persona, turn),
      improvised: false
    };
  }

  const system = [
    'You are role-playing as a realistic interviewee in a workflow discovery interview.',
    'Stay in character. Never reveal that you are an AI, a test persona, or that ground truth exists.',
    'Return ONLY valid JSON: {"answer":"...","improvised":false}.',
    'The answer must be natural prose, not a clean structured list unless the interviewer asks for a sequence.',
    'Do not volunteer the whole workflow at once. Reveal details gradually.',
    'Use USD and en-US conventions if money or locale comes up.',
    'Do not mention firm names.',
    'Hard rail: never discuss staffing reduction, role elimination, or automation percentages.',
    '',
    'Global interviewee rules:',
    ...(globalRules || []).map((rule) => `- ${rule}`),
    '',
    `Persona id: ${persona.id}`,
    `Role: ${persona.persona?.role || ''}`,
    `Seniority: ${persona.persona?.seniority || ''}`,
    `Communication style: ${persona.persona?.comms_style || ''}`,
    `Quirks: ${persona.persona?.quirks || ''}`,
    `Stress target: ${persona.stresses || ''}`,
    '',
    'Ground truth to stay consistent with:',
    JSON.stringify(persona.ground_truth, null, 2),
    '',
    'Persona-specific rules:',
    ...(persona.interviewee_rules || []).map((rule) => `- ${rule}`)
  ].join('\n');

  const recent = transcript.slice(-10).map((item) => `${item.role}: ${compact(item.text, 500)}`).join('\n');
  const parsed = await chatJson({
    apiUrl: config.openAiApiUrl,
    apiKey: config.openAiKey,
    model: config.intervieweeModel,
    temperature: 0.55,
    maxTokens: 650,
    timeoutMs: config.requestTimeoutMs,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          `Turn: ${turn}`,
          `Interviewer question: ${question}`,
          recent ? `Recent transcript:\n${recent}` : '',
          'Answer in character now. If you must answer beyond ground_truth, set improvised true; otherwise false.'
        ].filter(Boolean).join('\n\n')
      }
    ]
  });
  return {
    answer: String(parsed.answer || '').trim() || 'I am not sure how to answer that yet.',
    improvised: Boolean(parsed.improvised)
  };
}

function mockAnswer(persona, turn) {
  const truth = persona.ground_truth || {};
  if (turn === 1) {
    return `I work on ${truth.workflow_name}. It is ${truth.recurring_or_project}, ${truth.cadence?.detail || 'on a regular cadence'}, and my role is that I ${truth.your_position}.`;
  }
  if (turn === 2) {
    const steps = (truth.steps || []).map((step, index) => `${index + 1}. ${step.label}`).join('; ');
    return `At a high level the flow is ${steps}.`;
  }
  if (turn === 3) {
    const details = (truth.steps || []).slice(0, 3).map((step) => `${step.label} uses ${(step.tools || []).join(' and ')} with ${(step.people || []).join(' and ')}`).join('; ');
    return details || `The main tools and people vary by step.`;
  }
  if (turn === 4) {
    const pain = (truth.steps || []).map((step) => step.friction).filter(Boolean).join('; ');
    return `The annoying parts are mostly ${pain}.`;
  }
  const handoffs = (truth.handoffs || []).map((h) => `${h.from} hands ${h.what} to ${h.to}`).join('; ');
  return handoffs || 'That recap sounds broadly right.';
}
