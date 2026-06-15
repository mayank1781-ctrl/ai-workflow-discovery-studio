export function gradeOutput(result) {
  const recap = result.finalRecap || {};
  const steps = Array.isArray(recap.steps) ? recap.steps : [];
  const checks = {
    workflow: Boolean(String(recap.workflow || '').trim()),
    role: Boolean(String(recap.role || '').trim()),
    cadence: Boolean(String(recap.cadence || recap.recurringOrProject || '').trim()),
    steps: steps.length >= 2,
    source: Boolean(String(recap.source || '').trim())
  };
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
  return {
    complete: missing.length === 0,
    missing,
    reason: missing.length ? `Missing ${missing.join(', ')}` : 'Recap has core anchors and source label.'
  };
}

