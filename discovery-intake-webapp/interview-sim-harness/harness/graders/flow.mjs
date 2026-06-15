import { chatJson, compact, flattenStrings, round } from '../util.mjs';

export async function gradeFlow(result, persona, config) {
  if (!config.judgeApiKey || config.target === 'mock') {
    return {
      skipped: true,
      score: null,
      flagged: false,
      reason: config.target === 'mock' ? 'Skipped in mock mode: no network.' : 'No judge key configured.'
    };
  }

  const transcript = result.transcript.map((turn) => `${turn.role === 'assistant' ? 'Interviewer' : 'Interviewee'}: ${compact(turn.text, 800)}`).join('\n');
  const prompt = [
    'You are grading a discovery interview transcript for a finance / consulting / corporate workflow intake app.',
    'Return ONLY JSON with this shape:',
    '{"score":0.0,"subscores":{"next_questions":0.0,"gap_targeting":0.0,"non_redundancy":0.0,"recap":0.0,"uncertainty":0.0,"leverage_frame":0.0,"non_leading":0.0},"flagged":false,"weak_spots":["..."],"reason":"..."}',
    '',
    'Rubric:',
    '- Asked good next questions.',
    '- Targeted gaps in workflow, people, tools, data, friction, handoffs.',
    '- Avoided redundant questions.',
    '- Recapped or moved toward recap correctly.',
    '- Wore uncertainty; did not assert inferred facts as certain.',
    '- Stayed leverage-framed; no staffing-reduction or automation-percentage framing.',
    '- Did not lead the witness.',
    '',
    'Persona stress target:',
    persona.stresses || '',
    '',
    'Ground truth summary:',
    JSON.stringify(persona.ground_truth, null, 2),
    '',
    'Transcript:',
    transcript,
    '',
    'Captured output:',
    compact(flattenStrings(result.finalRecap).join(' '), 1800)
  ].join('\n');

  try {
    const parsed = await chatJson({
      apiUrl: config.openAiApiUrl,
      apiKey: config.judgeApiKey,
      model: config.judgeModel,
      temperature: 0,
      maxTokens: 900,
      timeoutMs: config.requestTimeoutMs,
      messages: [
        { role: 'system', content: 'You are a strict but practical eval judge. Use the fixed rubric. Return JSON only.' },
        { role: 'user', content: prompt }
      ]
    });
    const score = Number(parsed.score);
    return {
      skipped: false,
      score: round(Number.isFinite(score) ? score : 0, 3),
      subscores: parsed.subscores || {},
      flagged: Boolean(parsed.flagged) || (Number.isFinite(score) && score < 0.7),
      weakSpots: Array.isArray(parsed.weak_spots) ? parsed.weak_spots.slice(0, 6).map(String) : [],
      reason: String(parsed.reason || '')
    };
  } catch (error) {
    return {
      skipped: true,
      score: null,
      flagged: true,
      reason: `Judge failed: ${error.message || error}`
    };
  }
}
