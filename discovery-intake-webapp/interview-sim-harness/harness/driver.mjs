import { answerAsInterviewee } from './interviewee.mjs';
import { compact } from './util.mjs';

export async function runInterviewSimulation({ config, persona, globalRules, appClient, runIndex }) {
  const started = Date.now();
  const runId = `${persona.id}-r${String(runIndex + 1).padStart(3, '0')}`;
  const session = await appClient.startDiscovery({ persona, runId });
  const transcript = [{ role: 'assistant', text: session.currentQuestion, time: new Date().toISOString() }];
  const improvisedTurns = [];
  let stopReason = 'max-turns';
  let lastResponse = null;

  for (let turn = 1; turn <= config.maxTurns; turn++) {
    const answer = await answerAsInterviewee({
      config,
      persona,
      globalRules,
      question: session.currentQuestion,
      transcript,
      turn
    });
    transcript.push({
      role: 'user',
      text: answer.answer,
      improvised: answer.improvised,
      time: new Date().toISOString()
    });
    if (answer.improvised) improvisedTurns.push(turn);

    lastResponse = await appClient.sendTurn(session, answer.answer);
    if (lastResponse.nextQuestion) {
      const alreadyAdded = session.transcript.at(-1)?.role === 'assistant' && session.transcript.at(-1)?.text === lastResponse.nextQuestion;
      transcript.push({
        role: 'assistant',
        text: lastResponse.nextQuestion,
        time: new Date().toISOString(),
        summary: compact(lastResponse.raw?.summary || '', 240)
      });
      if (!alreadyAdded) session.transcript.push({ role: 'assistant', text: lastResponse.nextQuestion });
    }

    if (lastResponse.done) {
      stopReason = 'completion-heuristic';
      break;
    }
  }

  const suggestions = await appClient.enrichSuggestions(session);
  const finalRecap = buildFinalRecap(session, persona, stopReason);
  const wallMs = Date.now() - started;
  return {
    runId,
    personaId: persona.id,
    sector: persona.sector,
    role: persona.persona?.role || '',
    style: persona.persona?.comms_style || '',
    stresses: persona.stresses || '',
    stopReason,
    turns: transcript.filter((turn) => turn.role === 'user').length,
    wallMs,
    improvisedTurns,
    transcript,
    capturedState: session.state,
    suggestions,
    finalRecap,
    lastResponse
  };
}

function buildFinalRecap(session, persona, stopReason) {
  const state = session.state || {};
  const fields = state.fields || {};
  const workflow = fields.workflowName || fields.submittedWorkflowTask || persona.ground_truth?.workflow_name || 'Workflow not fully named';
  const role = fields.intervieweeRole || fields.peopleInvolved || persona.persona?.role || 'Role not fully captured';
  const cadence = fields.submittedFrequency || fields.triggerFrequency || persona.ground_truth?.cadence?.detail || 'Cadence not fully captured';
  const steps = (state.steps || []).map((step, index) => ({
    index: index + 1,
    name: step.name || step.action || `Step ${index + 1}`,
    actor: step.actor || '',
    tool: step.tool || '',
    pain: step.pain || '',
    handoff: step.handoff || ''
  }));
  return {
    workflow,
    role,
    cadence,
    recurringOrProject: fields.projectType || fields.triggerType || persona.ground_truth?.recurring_or_project || '',
    steps,
    source: 'transcript + app extraction',
    stopReason
  };
}
