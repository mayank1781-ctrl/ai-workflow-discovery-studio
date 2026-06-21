// =====================================================================
// studio_engine.mjs — Reference translation + calculation engine
// The single source of truth for how a Discovery intake becomes AI
// solutions (recipes / step-by-step instructions) and the leader outputs.
//
// WHY THIS FILE EXISTS
//   The app must turn one captured workflow into: a spec canvas, a
//   build-ready recipe, and the executive (capacity / net / flow) outputs
//   — deterministically, with provenance, and with no path from
//   unconfirmed capture to a hardened number. This module pins down that
//   pipeline and the math so the app can't drift. It is pure, runnable,
//   and self-testing (run: `node studio_engine.mjs`).
//
// PORTING MAP (engine fn  ->  app seam)
//   validateIntake / normalizeIntake     ->  intake guard before Workbench
//   isConfirmed / assertHardenable       ->  Change 3 confirm gate
//   roleCapacity / costToServe / netValue/ readiness / cycleTime
//                                        ->  the calc layer Dashboard + Recipe read
//   buildSpec                            ->  the spec object on recipeUnitSource() units
//   buildRecipe                          ->  the Recipe surface (AI solution)
//   buildProjections / buildLeaderView   ->  the audience outputs
//   railCheck                            ->  Change 4 surface-aware rail (gating)
//
// CONTRACT: every value the app shows downstream is a provenance triple
//   {value, source: "stated"|"inferred", confidence}. Numbers are
//   stated only where the consultant set them; class-defaults are inferred.
// =====================================================================

// ---------------------------------------------------------------------
// CONFIG — matches the shipped "Capacity × Cost-to-Serve × Flow" model.
// Dated June 2026 for price bands; keep all tunables here.
// ---------------------------------------------------------------------
export const CONFIG = {
  weeks: 48,
  loadedRate: 85,          // $/hr fully loaded
  weeklyHours: 40,
  freeingFactor: 0.40,     // permitted -> freed (human-in-the-loop overhead)
  realizationFactor: 0.70, // freed -> realized (fluency / builder ladder)

  // policy profiles: step ceilings (% of a step AI may carry) and data-tier factors
  profiles: {
    Conservative: { step: { assembly: 65, judgment: 20, decision: 5 },
      tier: { public: 1, internal: 1, confidential: 0.9, PII: 0.5, MNPI: 0.3 }, mode: "draft-only" },
    Moderate: { step: { assembly: 80, judgment: 30, decision: 10 },
      tier: { public: 1, internal: 1, confidential: 1, PII: 0.8, MNPI: 0.6 }, mode: "bounded agents" },
    Progressive: { step: { assembly: 92, judgment: 40, decision: 15 },
      tier: { public: 1, internal: 1, confidential: 1, PII: 0.9, MNPI: 0.8 }, mode: "supervised orchestration" },
  },

  // model-fit routing by step class; decision stays human (no AI tier)
  routing: {
    routed:   { assembly: "small", judgment: "mid" },
    mid:      { assembly: "mid",   judgment: "mid" },
    frontier: { assembly: "frontier", judgment: "frontier" },
  },
  // $/M tokens [input, output]
  tierPrice: { small: [0.40, 1.60], mid: [3.00, 15.00], frontier: [5.00, 25.00], restricted: [6.00, 30.00] },

  cost: { avgTaskMin: 20, baseInTokens: 8000, baseOutTokens: 1500, agenticMultiplier: 6, retryFactor: 1.3 },

  flow: { assemblyTouchReduction: 0.18, reducibleWaitReduction: 0.30, decisionLeadReduction: 0.12, workdayHours: 8 },

  econMarginPerYr: 0, // netValue <= this at the permitted tier => gated-economics

  // class-based defaults for the quantitative layer (used when not stated -> provenance "inferred")
  defaults: { theo: { assembly: 70, judgment: 35, decision: 10 },
              touch: { assembly: 60, judgment: 45, decision: 30 } },
};

const CLASSES = ["assembly", "judgment", "decision"];
const TIERS = ["public", "internal", "confidential", "PII", "MNPI"];
const LEVELS = ["low", "medium", "high"];
const RESTRICTED_TIERS = ["confidential", "PII", "MNPI"]; // narrative: stays on approved / in-VPC models
const RESIDENCY_FORCE = ["PII", "MNPI"];                   // forces a restricted (approved) PRICING tier; confidential routes normally

// Edition 3 (F1) — identity is separate from the part played. PARTS = the part an actor plays in a
// step (≈ RACI + approver/escalation-target); doer = the performer (a hand-off = where it changes).
// LINES = the line-of-defence on a firm-level actor identity. Both used for enum-integrity surfacing.
export const PARTS = ["doer", "accountable", "reviewer", "approver", "collaborator", "escalation-target", "informed"];
export const LINES = ["1LoD", "2LoD", "3LoD", "—"];
// Edition 3 (F2) — a step/hand-off control makes a "decision" graduated & structural. four-eyes /
// segregation name two parts that MUST be different actors; authority references a sharedRules ladder;
// halt-on-flag halts and routes to a human escalation-target with a negativeConstraint.
export const CONTROL_TYPES = ["four-eyes", "segregation", "authority", "completeness", "halt-on-flag"];
// Edition 3 (F3) — routes overlay the linear recipe (absent => linear, as today). onReject + onSlaRisk
// are DERIVED from controls + escalation; onFlag is the AUTHORED exception (carries a negativeConstraint).
export const ROUTE_KINDS = ["onReject", "onFlag", "onSlaRisk"];

const prov = (value, source = "inferred", confidence = "medium") => ({ value, source, confidence });
const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };
const sum = a => a.reduce((x, y) => x + y, 0);

// =====================================================================
// 0 · INTAKE — schema, validation, normalization
// =====================================================================
// Required (must-capture) checks — same set as the Discovery capture tool.
export const REQUIRED = [
  ["header.persona", r => r.header?.persona],
  ["header.dept", r => r.header?.dept],
  ["header.anchor", r => r.header?.anchor],
  ["trigger.trigger", r => r.trigger?.trigger],
  ["trigger.cadence", r => r.trigger?.cadence],
  ["steps[class+data]", r => r.steps?.some(s => s.step && s.cls && s.data)],
  ["seams[3-dim]", r => r.seams?.some(s => s.friction && s.latency && s.crit)],
  ["judgment.needs", r => r.judgment?.needs],
  ["judgment.hard", r => r.judgment?.hard],
  ["judgment.cues", r => r.judgment?.cues],
  ["judgment.human", r => r.judgment?.human],
  ["confirm.acceptance", r => r.confirm?.acceptance],
  ["confirm.escalation", r => r.confirm?.escalation],
  ["confirm.dataTier", r => r.confirm?.dataTier],
  ["recap.confirmed", r => r.recap?.confirmed === true],
];

export function validateIntake(record) {
  const errors = [];
  if (!record || typeof record !== "object") return { ok: false, errors: ["record missing"], coverage: { pct: 0, gaps: [] } };
  // enum integrity — never silently coerce; an unknown data tier is surfaced, never assumed permissive
  (record.steps || []).forEach((s, i) => {
    if (s.cls && !CLASSES.includes(s.cls)) errors.push(`step ${i + 1}: unknown class "${s.cls}"`);
    if (s.data && !TIERS.includes(s.data)) errors.push(`step ${i + 1}: unknown data tier "${s.data}" (resolve before scoring — not assumed public)`);
    // Edition 3 (F1) — a participant's part must be a known part; surfaced, never silently dropped.
    (s.participants || []).forEach((p, j) => {
      if (p && p.part && !PARTS.includes(p.part)) errors.push(`step ${i + 1} participant ${j + 1}: unknown part "${p.part}" (Edition 3)`);
    });
    // Edition 3 (F2) — a step control must be a known control type, when present.
    if (s.control && s.control.type && !CONTROL_TYPES.includes(s.control.type)) errors.push(`step ${i + 1}: unknown control type "${s.control.type}" (Edition 3)`);
  });
  (record.seams || []).forEach((s, i) => ["friction", "latency", "crit"].forEach(k => {
    if (s[k] && !LEVELS.includes(s[k])) errors.push(`seam ${i + 1}: ${k} "${s[k]}" not in low|medium|high`);
  }));
  // Edition 3 (F1) — a firm-level actor's line-of-defence must be a known line, when present.
  (record.actors || []).forEach((a, i) => {
    if (a && a.line && !LINES.includes(a.line)) errors.push(`actor ${i + 1}: unknown line "${a.line}" (Edition 3)`);
  });
  // Edition 3 (F3) — an authored route's kind must be a known route kind, when present.
  (record.routes || []).forEach((rt, i) => {
    if (rt && rt.kind && !ROUTE_KINDS.includes(rt.kind)) errors.push(`route ${i + 1}: unknown kind "${rt.kind}" (Edition 3)`);
  });
  const passed = REQUIRED.filter(([, t]) => !!t(record));
  const gaps = REQUIRED.filter(([, t]) => !t(record)).map(([k]) => k);
  return { ok: errors.length === 0, errors, coverage: { pct: Math.round(passed.length / REQUIRED.length * 100), gaps } };
}

// Fill the quantitative layer by class where the consultant didn't state it. Inferred values are tagged.
export function normalizeIntake(record) {
  const r = structuredClone(record);
  const n = (r.steps || []).length || 1;
  (r.steps || []).forEach(s => {
    s._timeProv = s.time != null ? "stated" : "inferred";
    if (s.time == null) s.time = 100 / n;
    s._theoProv = s.theo != null ? "stated" : "inferred";
    if (s.theo == null) s.theo = CONFIG.defaults.theo[s.cls] ?? 40;
    s._touchProv = s.touch != null ? "stated" : "inferred";
    if (s.touch == null) s.touch = CONFIG.defaults.touch[s.cls] ?? 45;
    if (s.wait == null) s.wait = 0;
    if (!s.waitKind) s.waitKind = s.cls === "decision" ? "protected" : "reducible";
  });
  return r;
}

// =====================================================================
// 1 · CONFIRM GATE (Change 3) — no hardened artifact without it
// =====================================================================
export function isConfirmed(record) {
  if (record?.recap?.confirmed !== true) return false;
  return REQUIRED.every(([, t]) => !!t(record));
}
export function assertHardenable(record, what = "artifact") {
  if (!isConfirmed(record)) throw new Error(`refused: cannot harden ${what} from an unconfirmed unit (Change 3)`);
}

// =====================================================================
// 2 · CALCULATION ENGINE (pure) — the three-haircut chain, economics, flow
// =====================================================================
export function stepCeilingFraction(cls, dataTier, profile) {
  const P = CONFIG.profiles[profile];
  return (P.step[cls] / 100) * (P.tier[dataTier] ?? 1);
}
// permitted addressability for one step (fraction 0..1) = min(theoretical, policy ceiling)
export function stepPermitted(step, profile) {
  const theo = (step.theo ?? 0) / 100;
  return Math.min(theo, stepCeilingFraction(step.cls, step.data, profile));
}

export function roleCapacity(steps, profile, opts = {}) {
  const H = opts.weeklyHours ?? CONFIG.weeklyHours;
  const ff = opts.freeingFactor ?? CONFIG.freeingFactor;
  const rf = opts.realizationFactor ?? CONFIG.realizationFactor;
  const W = opts.weeks ?? CONFIG.weeks, rate = opts.loadedRate ?? CONFIG.loadedRate;
  const totT = sum(steps.map(s => s.time)) || 1;
  const theoPct = sum(steps.map(s => s.time * (s.theo / 100))) / totT;        // role theoretical share
  const permPct = sum(steps.map(s => s.time * stepPermitted(s, profile))) / totT; // role permitted share
  const theoHrs = theoPct * H, permittedHrs = permPct * H;
  const freedHrs = permittedHrs * ff, realizedHrs = freedHrs * rf;
  return {
    profile, theoPct, permittedPct: permPct, theoHrs, permittedHrs, freedHrs, realizedHrs,
    grossValue: realizedHrs * W * rate,
    policyGapHrs: theoHrs - permittedHrs,        // -> governance engagement
    realizationGapHrs: freedHrs - realizedHrs,   // -> L&D engagement
  };
}

// model tier for a unit: routing by class, lowered by data-tier residency
export function modelTier(stepClass, dataTier, mode = "routed", policyAllowsExternal = false) {
  if (stepClass === "decision") return "human";
  let tier = CONFIG.routing[mode][stepClass] || "mid";
  if (RESIDENCY_FORCE.includes(dataTier) && !policyAllowsExternal) tier = "restricted";
  return tier;
}
function costPerRun(tier, c = CONFIG.cost) {
  const inE = c.baseInTokens * c.agenticMultiplier * c.retryFactor;
  const outE = c.baseOutTokens * c.agenticMultiplier * c.retryFactor;
  const p = CONFIG.tierPrice[tier] || CONFIG.tierPrice.mid;
  return (inE * p[0] + outE * p[1]) / 1e6;
}
// annual cost-to-serve, blended across the AI-addressable class mix (assembly + judgment; decision is human)
export function costToServe(steps, profile, mode = "routed", opts = {}) {
  const H = opts.weeklyHours ?? CONFIG.weeklyHours, W = opts.weeks ?? CONFIG.weeks, c = opts.cost ?? CONFIG.cost;
  const totT = sum(steps.map(s => s.time)) || 1;
  const aiSteps = steps.filter(s => s.cls !== "decision");
  const permHrsByStep = aiSteps.map(s => ({ s, hrs: (s.time / totT) * stepPermitted(s, profile) * H }));
  const aiPermHrs = sum(permHrsByStep.map(x => x.hrs));
  if (aiPermHrs <= 0) return { runsPerYr: 0, blendedCostPerRun: 0, annual: 0 };
  const runsPerYr = aiPermHrs * 60 / c.avgTaskMin * W;
  const blended = sum(permHrsByStep.map(({ s, hrs }) =>
    hrs * costPerRun(modelTier(s.cls, s.data, mode, opts.policyAllowsExternal), c))) / aiPermHrs;
  return { runsPerYr, blendedCostPerRun: blended, annual: runsPerYr * blended };
}

export const netValue = (grossValue, annualCost) => grossValue - annualCost;

// readiness for an addressable unit: now / gated-policy / gated-economics / future-capability
export function readiness(unit) {
  if (unit.futureCapability) return { state: "future-capability", reason: unit.futureReason || "needs a capability not yet available" };
  const policyCapped = (unit.theoPct ?? 0) - (unit.permittedPct ?? 0) > 0.01;
  const net = unit.netValue ?? (unit.grossValue - unit.annualCost);
  if (net <= (unit.econMargin ?? CONFIG.econMarginPerYr))
    return { state: "gated-economics", reason: `net ${round(net)} at ${unit.tier || "permitted"} tier — route to a lower tier, compress context, or await cheaper capability` };
  if (policyCapped)
    return { state: "gated-policy", reason: `policy ceiling caps ${round((unit.theoPct - unit.permittedPct) * 100)}pts of addressability — governance agenda` };
  return { state: "now", reason: "addressable, policy-permitted, net-positive at an appropriate tier" };
}

// flow / cycle-time — touch + wait, with the protected (human-decision) wait preserved
export function cycleTime(steps, opts = {}) {
  const tRed = opts.assemblyTouchReduction ?? CONFIG.flow.assemblyTouchReduction;
  const wRed = opts.reducibleWaitReduction ?? CONFIG.flow.reducibleWaitReduction;
  const lRed = opts.decisionLeadReduction ?? CONFIG.flow.decisionLeadReduction;
  const touchB = sum(steps.map(s => s.touch)), waitB = sum(steps.map(s => s.wait));
  const touchA = sum(steps.map(s => s.cls === "assembly" ? s.touch * (1 - tRed) : s.touch));
  const waitA = sum(steps.map(s => s.waitKind === "protected" ? s.wait * (1 - lRed) : s.wait * (1 - wRed)));
  const cycleB = touchB + waitB, cycleA = touchA + waitA;
  return {
    cycleBefore: cycleB, cycleAfter: cycleA, touchBefore: touchB, touchAfter: touchA, waitBefore: waitB, waitAfter: waitA,
    azReductionPct: cycleB ? (cycleB - cycleA) / cycleB * 100 : 0,
    flowEffBefore: cycleB ? touchB / cycleB * 100 : 0, flowEffAfter: cycleA ? touchA / cycleA * 100 : 0,
    pctSavingFromWait: (cycleB - cycleA) ? (waitB - waitA) / (cycleB - cycleA) * 100 : 0,
  };
}
// format minutes -> "Xd Yh" on an 8h workday (matches the model)
export function fmtDur(min) {
  const h = min / 60, wd = CONFIG.flow.workdayHours;
  const d = Math.floor(h / wd), rem = Math.round(h - d * wd);
  return d > 0 ? `${d}d ${rem}h` : `${Math.round(h)}h`;
}

// =====================================================================
// 2.5 · EDITION 3 — MULTI-ACTOR MAP (F1 actors+parts · F2 controls/rail · F3 routes · F4 derived)
// A workflow is one process across many roles; the controls live in the hand-offs. ALL additive:
// a record with no actors/participants/control/sharedRules/routes behaves byte-identically to the
// single-persona, linear, control-free workflow it was before. Identity (who) lives once in a
// firm-level actors[] registry and is REFERENCED by id; the part (doer/approver/…) is per step.
// =====================================================================

// stable synthetic id for the implicit single-persona doer (absent participants => one doer = persona)
const personaActorId = (persona) => `persona:${String(persona || "").trim().toLowerCase() || "performer"}`;

// F1 — the participants of a step. Absent => one implicit doer = the workflow persona (additive,
// so today's single-role math is unchanged: every step is "done" by the one persona).
export function stepParticipants(step, record) {
  if (step && Array.isArray(step.participants) && step.participants.length) return step.participants;
  return [{ actorId: personaActorId(record?.header?.persona), part: "doer", implicit: true }];
}
// F1 — the actorId that PERFORMS the step (the doer). A hand-off is where this changes step-to-step.
export function stepDoerId(step, record) {
  const ps = stepParticipants(step, record);
  const d = ps.find(p => p && p.part === "doer") || ps[0];
  return d ? d.actorId : personaActorId(record?.header?.persona);
}
// F1 — resolve an actorId to its identity {id, role, department, line} from the firm-level registry.
// An id not in the registry (the implicit persona doer, or an unregistered ref) resolves best-effort;
// never throws (a missing actor is surfaced by validateIntake, not crashed on here).
export function resolveActor(actorId, record) {
  const reg = (record && Array.isArray(record.actors)) ? record.actors : [];
  const found = reg.find(a => a && a.id === actorId);
  if (found) return { id: found.id, role: found.role || found.id, department: found.department || "", line: found.line || "—", registered: true };
  if (String(actorId || "").startsWith("persona:")) return { id: actorId, role: record?.header?.persona || "Performer", department: record?.header?.dept || "", line: "—", registered: false };
  return { id: actorId, role: actorId || "Unknown", department: "", line: "—", registered: false };
}
// F1 — the role label the step's doer plays (for capacity roll-up by role).
export function stepDoerRole(step, record) { return resolveActor(stepDoerId(step, record), record).role; }

// F1 — a hand-off is where the doer changes between consecutive steps. Returns the crossings
// (with role labels + whether the hand-off crosses a line-of-defence — where controls usually sit).
export function detectHandoffs(record) {
  const steps = (record && Array.isArray(record.steps)) ? record.steps : [];
  const out = [];
  for (let i = 1; i < steps.length; i++) {
    const a = stepDoerId(steps[i - 1], record), b = stepDoerId(steps[i], record);
    if (a !== b) {
      const fa = resolveActor(a, record), fb = resolveActor(b, record);
      out.push({ index: i, fromStep: steps[i - 1].step, toStep: steps[i].step,
        fromActorId: a, toActorId: b, fromRole: fa.role, toRole: fb.role,
        crossLine: fa.line !== fb.line });
    }
  }
  return out;
}

// F1 — capacity scoped per doer. The workflow-level three-haircut chain is UNCHANGED; here it is
// PARTITIONED by each step's doer so freed capacity attributes to the right role. Because the
// decomposition is linear in each step's permitted-hours contribution, the per-role hours sum
// EXACTLY to roleCapacity(allSteps) — the reconciliation guarantee (asserted in tests). A non-doer
// part (approver/accountable/reviewer/…) is never a step's doer, so it contributes 0 freed: exactly
// the "Checker/Manager are human-held, 0 freed" property. Additive: absent participants => one
// implicit doer => a single role group == roleCapacity(allSteps).
export function roleCapacityByActor(record, profile = "Conservative", opts = {}) {
  const r = normalizeIntake(record);
  const H = opts.weeklyHours ?? CONFIG.weeklyHours;
  const ff = opts.freeingFactor ?? CONFIG.freeingFactor;
  const rf = opts.realizationFactor ?? CONFIG.realizationFactor;
  const W = opts.weeks ?? CONFIG.weeks, rate = opts.loadedRate ?? CONFIG.loadedRate;
  const totT = sum(r.steps.map(s => s.time)) || 1;
  const groups = new Map();
  r.steps.forEach(s => {
    const id = stepDoerId(s, r), actor = resolveActor(id, r);
    if (!groups.has(id)) groups.set(id, { actorId: id, role: actor.role, department: actor.department, line: actor.line,
      registered: actor.registered, theoHrs: 0, permittedHrs: 0, freedHrs: 0, realizedHrs: 0,
      assemblyTime: 0, judgmentTime: 0, decisionTime: 0, time: 0, stepCount: 0 });
    const g = groups.get(id);
    const w = s.time / totT;                                   // this step's share of the whole workflow
    const permH = w * stepPermitted(s, profile) * H;
    g.theoHrs += w * (s.theo / 100) * H;
    g.permittedHrs += permH;
    g.freedHrs += permH * ff;
    g.realizedHrs += permH * ff * rf;
    g.time += s.time; g.stepCount += 1;
    if (s.cls === "assembly") g.assemblyTime += s.time;
    else if (s.cls === "judgment") g.judgmentTime += s.time;
    else g.decisionTime += s.time;
  });
  const roles = [...groups.values()].map(g => ({
    ...g,
    grossValue: g.realizedHrs * W * rate,
    policyGapHrs: g.theoHrs - g.permittedHrs,
    realizationGapHrs: g.freedHrs - g.realizedHrs,
    // the assembly -> judgment shift: the role's time on assembly (AI-carried) vs human-held work.
    assemblyShareOfRole: g.time ? g.assemblyTime / g.time : 0,
    humanHeldShareOfRole: g.time ? (g.judgmentTime + g.decisionTime) / g.time : 0,
  })).sort((a, b) => b.freedHrs - a.freedHrs);
  return { profile, roles, handoffs: detectHandoffs(r), totalFreedHrs: round(sum(roles.map(x => x.freedHrs)), 4) };
}

// F2 — shared rules are written ONCE in workflow.sharedRules and REFERENCED by controls (never copied).
export function sharedRule(record, id) {
  return ((record && Array.isArray(record.sharedRules)) ? record.sharedRules : []).find(r => r && r.id === id) || null;
}
// F2 — resolve the approver for an authority-gated step from the value-banded ladder. Bands are read
// in order; the first band whose ceiling (maxValue, null = no ceiling) covers the item's value wins.
// Returns { approver, band } or null when the rule/bands are missing (surfaced, never assumed).
export function resolveAuthorityApprover(record, ref, value) {
  const rule = sharedRule(record, ref);
  if (!rule || !Array.isArray(rule.bands) || !rule.bands.length) return null;
  const v = Number(value);
  for (const b of rule.bands) {
    if (b.maxValue == null || (Number.isFinite(v) && v <= b.maxValue)) return { approver: b.approver, band: b };
  }
  const last = rule.bands[rule.bands.length - 1];
  return { approver: last.approver, band: last };
}
// F2 — the actorId playing a given part on a step (null if no one plays it). Used by the control rail.
export function stepPartActor(step, part) {
  const p = ((step && Array.isArray(step.participants)) ? step.participants : []).find(pp => pp && pp.part === part);
  return p ? p.actorId : null;
}
// F2 — is this actor a non-human (system / AI) performer? A registered actor with a human line-of-
// defence is human; an id prefixed system/ai/bot, or a registry entry kind:"system"/line:"system", is not.
function isNonHumanActor(actorId, record) {
  if (/^(system|ai|bot)[:_-]?/i.test(String(actorId || ""))) return true;
  const a = ((record && Array.isArray(record.actors)) ? record.actors : []).find(x => x && x.id === actorId);
  return !!(a && (a.kind === "system" || a.line === "system"));
}

// F3 — routes overlay the linear recipe (the rework loop, the AML halt, the SLA escalation). These are
// ANNOTATIONS, NOT new flow math: the happy-path cycleTime stays linear and unchanged; routes are
// rendered as loop/halt/escalation edges (F7) and checked by the rail. onReject + onSlaRisk are DERIVED
// from the controls + the escalation matrix; onFlag is AUTHORED (the unusual exception). Each carries a
// routeOrigin: derived | authored. Additive: no controls + no authored routes => [] (linear, as today).
export function deriveRoutes(record) {
  const r = record || {};
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const authoredRoutes = Array.isArray(r.routes) ? r.routes.filter(Boolean) : [];
  const out = [];
  const priorStep = (idx) => { for (let i = idx - 1; i >= 0; i--) { if (steps[i]) return steps[i].step; } return null; };
  let hasAuthorityEscalation = false, gateStep = null;
  steps.forEach((s, i) => {
    const c = s && s.control;
    if (!c) return;
    // onReject (DERIVED) — an approval gate (four-eyes / authority) implies a rework loop back to the prior step
    if (c.type === "four-eyes" || c.type === "authority" || c.authorityRef) {
      const back = priorStep(i);
      if (back) out.push({ kind: "onReject", fromStep: s.step, toStep: back, routeOrigin: "derived", reason: "rework loop on rejection (derived from the approval control)" });
      hasAuthorityEscalation = true; if (!gateStep) gateStep = s.step;
    }
    // onFlag (DERIVED fallback) — a halt-on-flag with no authored route still gets its halt edge (never-a-dead-end)
    if (c.type === "halt-on-flag") {
      const authored = authoredRoutes.some(rt => rt.kind === "onFlag" && (rt.fromStep === s.step || rt.from === s.step));
      if (!authored) out.push({ kind: "onFlag", fromStep: s.step, to: c.escalateTo || null, toRole: c.escalateTo ? resolveActor(c.escalateTo, r).role : null, routeOrigin: "derived", negativeConstraint: c.negativeConstraint || null, reason: "halt-and-route (derived from the halt-on-flag control)" });
    }
  });
  // onFlag (AUTHORED) — the unusual exception routes pass through, carrying their negativeConstraint
  authoredRoutes.forEach(rt => {
    if (rt.kind === "onFlag") out.push({ kind: "onFlag", fromStep: rt.fromStep || rt.from || null, to: rt.to || null, toRole: rt.to ? resolveActor(rt.to, r).role : null, routeOrigin: rt.routeOrigin || "authored", negativeConstraint: rt.negativeConstraint || null, reason: rt.reason || "authored exception route" });
    else out.push({ ...rt, routeOrigin: rt.routeOrigin || "authored" }); // any other authored route passes through
  });
  // onSlaRisk (DERIVED) — once, when an authority/escalation structure exists: escalate per tier on SLA breach
  if (hasAuthorityEscalation) {
    out.push({ kind: "onSlaRisk", fromStep: gateStep || (steps[0] && steps[0].step) || null, to: "escalation tier (per the authority ladder + response time)", routeOrigin: "derived", reason: "SLA-at-risk -> escalate per tier (derived from the escalation matrix)" });
  }
  return out;
}

// =====================================================================
// 3 · SPEC CANVAS (Generator B) — deterministic assembly, per workflow unit
// =====================================================================
const TIER_RANK = { public: 0, internal: 1, confidential: 2, PII: 3, MNPI: 4 };
const uniq = a => [...new Set(a.filter(Boolean).map(s => String(s).trim()).filter(Boolean))];
const dash = s => (s && String(s).trim()) ? String(s).trim() : "\u2014";
const asm = steps => steps.filter(s => s.cls === "assembly");
const humans = steps => steps.filter(s => s.cls && s.cls !== "assembly");
const maxTier = r => {
  let m = "", mx = -1;
  (r.steps || []).forEach(s => { if (s.data && TIER_RANK[s.data] > mx) { mx = TIER_RANK[s.data]; m = s.data; } });
  if (r.confirm?.dataTier && TIER_RANK[r.confirm.dataTier] > mx) m = r.confirm.dataTier;
  return m;
};
const sensitive = r => RESTRICTED_TIERS.includes(maxTier(r));

export function buildSpec(record, opts = {}) {
  const r = normalizeIntake(record);
  const tiers = maxTier(r), tools = uniq((r.steps || []).flatMap(s => (s.tool || "").split(/[,/]/)));
  const inputs = uniq((r.steps || []).flatMap(s => (s.inputs || "").split(/[,;]/)));
  const lastDeliv = asm(r.steps).filter(s => s.output).slice(-1)[0] || (r.steps || []).filter(s => s.output).slice(-1)[0] || {};
  const art = /^[aeiou]/i.test((lastDeliv.output || "").trim()) ? "An" : "A";
  const human = humans(r.steps);
  const mode = opts.mode || "routed", profile = opts.profile || "Conservative";

  // model-fit: tier per AI-addressable class; residency note from AI-addressable steps only (not the human decision)
  const aiSteps = (r.steps || []).filter(s => s.cls !== "decision");
  let aiMaxTier = "", _mx = -1; aiSteps.forEach(s => { if (s.data && TIER_RANK[s.data] > _mx) { _mx = TIER_RANK[s.data]; aiMaxTier = s.data; } });
  const aiTiers = uniq(asm(r.steps).map(s => modelTier(s.cls, s.data, mode, opts.policyAllowsExternal)));
  let modelFit = `Routed \u2014 assembly \u2192 ${aiTiers.join("/") || "small"}; judgment-adjacent \u2192 mid; decision stays human.`;
  if (RESTRICTED_TIERS.includes(aiMaxTier)) modelFit += ` ${aiMaxTier} data stays on approved / in-VPC models (no external egress)${RESIDENCY_FORCE.includes(aiMaxTier) ? " \u2014 restricted pricing tier" : ""}.`;
  modelFit += " Cost-to-serve is a band; route to the cheapest tier that clears acceptance.";

  // readiness for the workflow's addressable portion
  const cap = roleCapacity(r.steps, profile, opts);
  const cost = costToServe(r.steps, profile, mode, opts);
  const rd = readiness({ theoPct: cap.theoPct, permittedPct: cap.permittedPct, grossValue: cap.grossValue, annualCost: cost.annual, tier: aiTiers.join("/") });

  let constraints = `${tiers ? tiers + " tier" : "data tier \u2014"}; draft-only up to human review${tools.length ? `; allowed tools: ${tools.join(", ")}` : ""}.`;
  if (sensitive(r)) constraints += " Sensitive data stays on approved / in-VPC models (no external egress).";

  return {
    goal: prov(lastDeliv.output ? `${art} ${lastDeliv.output}${lastDeliv.consumer ? ` delivered to ${lastDeliv.consumer}` : ""}.` : "\u2014", "inferred"),
    context: prov(`${dash(r.trigger?.trigger)}${inputs.length ? `; inputs: ${inputs.join(", ")}` : ""}${tools.length ? `; tools: ${tools.join(", ")}` : ""}${r.trigger?.cadence ? `; cadence ${r.trigger.cadence}` : ""}.`, "inferred"),
    constraints: prov(constraints, "inferred"),
    acceptance: prov(dash(r.confirm?.acceptance), r.confirm?.acceptance ? "stated" : "inferred"),
    decomposition: prov(`Assembly (AI-carried): ${asm(r.steps).map(s => s.step).join(" \u2192 ") || "\u2014"}. Human-held: ${human.map(s => `${s.step} (${s.cls})`).join(", ") || "\u2014"}.`, "inferred"),
    escalation: prov(dash(r.confirm?.escalation), r.confirm?.escalation ? "stated" : "inferred"),
    modelFit: prov(modelFit, "inferred"),                 // FIELD 7
    readiness: prov(`${rd.state} \u2014 ${rd.reason}`, "inferred"),
    evalCases: (r.confirm?.evals || "").split("\n").map(s => s.trim()).filter(Boolean).map(e => prov(e, "stated")),
    _capacity: cap, _cost: cost, _readiness: rd,           // attached for downstream/leaders (not worker-rendered)
  };
}

// =====================================================================
// 4 · RECIPE — the AI solution / step-by-step instructions
// =====================================================================
// F2 \u2014 project a step's control onto the recipe (resolving the referenced authority ladder + the
// escalation-target's role), so the build artifact can render the gate inline (F7). Pure.
function recipeControl(step, record) {
  const c = step && step.control; if (!c || !c.type) return undefined;
  const out = { type: c.type };
  if (c.distinct) out.distinct = c.distinct;
  if (c.note || c.rule) out.note = c.note || c.rule;
  if (c.on) out.on = c.on;
  if (c.escalateTo) { out.escalateTo = c.escalateTo; out.escalateToRole = resolveActor(c.escalateTo, record).role; }
  if (c.negativeConstraint) out.negativeConstraint = c.negativeConstraint;
  const ref = c.authorityRef || c.uses;
  if (ref) { out.authorityRef = ref; const rule = sharedRule(record, ref); if (rule) out.authority = rule; }
  return out;
}

export function buildRecipe(record, opts = {}) {
  const r = normalizeIntake(record);
  const profile = opts.profile || "Conservative", mode = opts.mode || "routed";
  const totT = sum(r.steps.map(s => s.time)) || 1;

  // ordered build steps: assembly -> an AI instruction at its tier; judgment/decision -> a human checkpoint
  const ordered = r.steps.map(s => {
    const base = (s.cls === "assembly")
      ? {
          kind: "ai-step", step: s.step, tier: modelTier(s.cls, s.data, mode, opts.policyAllowsExternal),
          action: `Assemble: ${dash(s.output) === "\u2014" ? s.step : dash(s.output)} from ${dash(s.inputs)} using ${dash(s.tool)}.`,
          guardrail: r.confirm?.acceptance ? `Check against acceptance: ${r.confirm.acceptance}` : "Check against stated acceptance.",
        }
      : {
          kind: "human-checkpoint", step: s.step, cls: s.cls,
          action: s.cls === "decision"
            ? `Human decision: ${s.step}. AI prepares the lead-up only; the call stays with the person.`
            : `Human judgment: ${s.step}. AI surfaces options/evidence; the person decides.`,
        };
    // ADDITIVE \u2014 a single-actor, control-free step renders byte-identically (no doer/control fields).
    if (!Array.isArray(s.participants) && !s.control) return base;
    const out = { ...base, doer: (() => { const id = stepDoerId(s, r), a = resolveActor(id, r); return { actorId: id, role: a.role, line: a.line }; })() };
    if (Array.isArray(s.participants)) out.participants = stepParticipants(s, r).map(p => ({ actorId: p.actorId, part: p.part, role: resolveActor(p.actorId, r).role }));
    const control = recipeControl(s, r); if (control) out.control = control;
    return out;
  });

  // high-criticality seams force an explicit checkpoint note
  (r.seams || []).filter(s => s.crit === "high").forEach(s => {
    ordered.push({ kind: "seam-checkpoint", step: `${s.from} \u2192 ${s.to}`,
      action: `Protected handoff (criticality high): ${dash(s.note)}. Do not compress past the human gate.` });
  });

  // ranked addressable units by leverage = permitted fraction x time weight
  const ranked = asm(r.steps).map(s => ({
    step: s.step, tier: modelTier(s.cls, s.data, mode, opts.policyAllowsExternal),
    leverage: round(stepPermitted(s, profile) * (s.time / totT), 4),
  })).sort((a, b) => b.leverage - a.leverage);

  return { title: prov(`AI solution \u2014 ${dash(r.header?.persona)} / ${dash(r.header?.anchor)}`, "inferred"),
    origin: opts.origin || "generation", orderedSteps: ordered, rankedUnits: ranked,
    // F1/F2/F3 \u2014 multi-actor overlays (empty/inert for a single-persona, linear, control-free workflow).
    handoffs: detectHandoffs(r), controls: r.steps.filter(s => s.control && s.control.type).map(s => ({ step: s.step, type: s.control.type })),
    routes: deriveRoutes(r), rail: controlRail(r) };
}

// =====================================================================
// 5 · OUTPUTS — worker / engineering / business projections + leader roll-up
// =====================================================================
export function buildProjections(record, opts = {}) {
  const r = normalizeIntake(record);
  const spec = buildSpec(r, opts), human = humans(r.steps);
  const flow = asm(r.steps).map(s => s.step).join(" \u2192 ") || "\u2014";
  const seamTxt = (r.seams || []).filter(s => s.from).map(s => `${s.from}\u2192${s.to} (${s.type || "seam"})`).join("; ") || "\u2014";
  const hd = r.judgment?.human || (human.length ? human.map(s => s.step).join(", ") : "the human decision");
  return {
    // WORKER surface — leverage language only; no cost / capacity
    worker: `Your workflow: ${flow}. ${human.length ? `The ${human.map(s => s.step).join(" and ")} stay yours \u2014 the judgment calls we protect. ` : ""}Confirm the steps and the seams.`,
    // ENGINEERING surface — spec + recipe + seams + model-fit (cost-to-serve allowed here)
    engineering: `Spec canvas (7 fields incl. model-fit). Seams: ${seamTxt}. Readiness: ${spec.readiness.value}.`,
    // BUSINESS surface — capacity net of cost-to-serve; decision protected (dashboard vocabulary)
    business: `Capacity freed across the assembly steps, reported net of cost-to-serve. End-to-end flow improves where wait is reducible; ${hd} is protected. Pair every efficiency metric with a guardrail.`,
    // PRODUCT surface — telemetry
    product: `Lifecycle ${dash(r.header?.lifecycle)} \u00b7 readiness ${spec._readiness.state} \u00b7 corrections on recap: ${r.recap?.corrections ? "yes" : "none"}.`,
  };
}

// Department leader view — CONFIRMED units only, with the new KPIs. Throws nothing; skips unconfirmed.
export function buildLeaderView(records, opts = {}) {
  const profile = opts.profile || "Conservative";
  const confirmed = records.filter(isConfirmed);
  const units = confirmed.map(r => {
    const nr = normalizeIntake(r);
    const uOpts = { ...opts, cost: r.cost || opts.cost }; // per-unit cost drivers (agentic profile) override the global default
    const cap = roleCapacity(nr.steps, profile, uOpts);
    const routed = costToServe(nr.steps, profile, "routed", uOpts).annual;
    const frontier = costToServe(nr.steps, profile, "frontier", uOpts).annual;
    const flow = cycleTime(nr.steps, uOpts);
    const rd = readiness({ theoPct: cap.theoPct, permittedPct: cap.permittedPct, grossValue: cap.grossValue, annualCost: routed });
    return { gross: cap.grossValue, routed, frontier, netRouted: cap.grossValue - routed, netFrontier: cap.grossValue - frontier,
      theoHrs: cap.theoHrs, permittedHrs: cap.permittedHrs, freedHrs: cap.freedHrs, realizedHrs: cap.realizedHrs,
      policyGapHrs: cap.policyGapHrs, realizationGapHrs: cap.realizationGapHrs, flow, readiness: rd.state };
  });
  const S = k => sum(units.map(u => u[k]));
  const Spos = k => sum(units.map(u => Math.max(0, u[k]))); // deployable: net<=0 (economics-gated) contributes 0, flagged separately
  const mix = { now: 0, "gated-policy": 0, "gated-economics": 0, "future-capability": 0 };
  units.forEach(u => { mix[u.readiness] = (mix[u.readiness] || 0) + 1; });
  const lifeMix = {};
  confirmed.forEach(r => { const k = r.header?.lifecycle || "confirmed"; lifeMix[k] = (lifeMix[k] || 0) + 1; });

  // deployable = net-positive units (the bankable set; the waterfall reconciles over these); gated = economics-gated, deferred
  const dep = units.filter(u => u.netRouted > 0), gated = units.filter(u => u.readiness === "gated-economics");
  const sumD = k => round(sum(dep.map(u => u[k])));
  const breakdown = {
    deployable: { count: dep.length, gross: sumD("gross"), cost: sumD("routed"), net: round(sum(dep.map(u => u.netRouted))),
      chain: { theoHrs: sumD("theoHrs"), permittedHrs: sumD("permittedHrs"), freedHrs: sumD("freedHrs"), realizedHrs: sumD("realizedHrs") } },
    gated: { count: gated.length, gross: round(sum(gated.map(u => u.gross))), cost: round(sum(gated.map(u => u.routed))) },
    flowSample: dep[0]?.flow || units[0]?.flow || null, // a representative confirmed workflow for the cycle-time view
  };

  return {
    surface: "dashboard",
    confirmedCount: confirmed.length, skippedUnconfirmed: records.length - confirmed.length,
    breakdown,
    kpis: [
      { id: "gross_capacity", label: "Gross capacity value", value: round(S("gross")), unit: "$/yr", provenance: "inferred" },
      { id: "cost_to_serve", label: "Cost-to-serve (routed)", value: round(S("routed")), unit: "$/yr", provenance: "inferred" },
      { id: "net_capacity", label: "Net capacity value (deployable, routed)", value: round(Spos("netRouted")), unit: "$/yr", provenance: "inferred", guardrail: "outcome quality held" },
      { id: "model_fit_lever", label: "Model-fit lever (routed vs frontier)", value: round(Spos("netRouted") - Spos("netFrontier")), unit: "$/yr swing", provenance: "inferred" },
      { id: "economics_gated", label: "Economics-gated units", value: mix["gated-economics"], unit: "count", provenance: "stated" },
      { id: "policy_gap", label: "Policy-gap (governance agenda)", value: round(S("policyGapHrs")), unit: "h/wk", provenance: "inferred" },
      { id: "realization_gap", label: "Realization-gap (L&D agenda)", value: round(S("realizationGapHrs")), unit: "h/wk", provenance: "inferred" },
      { id: "readiness_mix", label: "Readiness mix", value: mix, provenance: "stated" },
      { id: "lifecycle_funnel", label: "Lifecycle funnel", value: lifeMix, provenance: "stated" },
    ],
    note: confirmed.length ? null : "No confirmed units yet \u2014 confirm units on the Workbench to populate.",
  };
}

// =====================================================================
// 6 · RAIL (Change 4) — surface-aware, deterministic, gating
// =====================================================================
export const RAIL = {
  // denied on EVERY surface (reduction / headcount / displacement framing)
  banned: ["headcount", "fte", "reduce headcount", "cut staff", "eliminate roles", "hours saved", "hours-saved", "lay off", "layoff", "replace the", "downsize"],
  // allowed ONLY on dashboard
  capacityFamily: ["capacity", "consolidation", "reinvestment", "capacity planning"],
  // allowed on recipe + dashboard (engineering economics)
  costFamily: ["cost-to-serve", "cost to serve", "net value", "net capacity", "token cost", "inference cost", "model tier", "frontier tier", "small tier", "mid tier"],
  // allowed on workbench + recipe; kept off capture
  leverage: ["leverage"],
};
export function railCheck(text, surface) {
  // Edition 3 (F2) — ONE rail, two modes. Passed a record (an object with steps), railCheck runs the
  // CONTROL-AWARE structural gating checks; passed a string, it runs the surface-aware vocabulary rail
  // exactly as before (byte-identical — a string never has .steps).
  if (text && typeof text === "object" && Array.isArray(text.steps)) return controlRail(text, surface);
  const t = String(text || "").toLowerCase(), v = [];
  RAIL.banned.forEach(w => { if (t.includes(w)) v.push({ term: w, rule: "banned-everywhere" }); });
  if (surface !== "dashboard") RAIL.capacityFamily.forEach(w => { if (new RegExp(`\\b${w}\\b`).test(t)) v.push({ term: w, rule: "capacity-dashboard-only" }); });
  if (!["recipe", "dashboard"].includes(surface)) RAIL.costFamily.forEach(w => { if (t.includes(w)) v.push({ term: w, rule: "cost-recipe+dashboard-only" }); });
  if (surface === "capture") RAIL.leverage.forEach(w => { if (new RegExp(`\\b${w}\\b`).test(t)) v.push({ term: w, rule: "leverage-not-on-capture" }); });
  return { ok: v.length === 0, violations: v };
}

// F2 — the CONTROL-AWARE rail: deterministic, gating, control-aware checks over a record. One place,
// same authority as the vocabulary rail. Turns the eval set's conservative defaults into HARD rules:
//   (1) four-eyes / segregation — the two named parts must be two DIFFERENT actors, and an AI/system
//       actor may never be both doer and approver (no self-approval);
//   (2) authority — the step must name a HUMAN approver, and its referenced ladder must exist;
//   (3) halt-on-flag — must route to a HUMAN escalation-target, carry a negativeConstraint, and may
//       NEVER be auto-resolved by AI.
// Additive: a record with no controls has nothing to check => ok (a control-free workflow as today).
export function controlRail(record, opts = {}) {
  const r = record || {};
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const v = [];
  steps.forEach((s, i) => {
    const c = s && s.control; if (!c || !c.type) return;
    const label = (s && s.step) || `step ${i + 1}`;
    if (c.type === "four-eyes" || c.type === "segregation") {
      const parts = (Array.isArray(c.distinct) && c.distinct.length === 2) ? c.distinct : ["doer", "approver"];
      const a = stepPartActor(s, parts[0]), b = stepPartActor(s, parts[1]);
      if (!a || !b) v.push({ step: label, rule: "four-eyes-named", detail: `${c.type} needs both "${parts[0]}" and "${parts[1]}" named on the step` });
      else if (a === b) v.push({ step: label, rule: "four-eyes-distinct", detail: `"${parts[0]}" and "${parts[1]}" are the same actor (${a}); ${c.type} requires two different actors` });
      else {
        // an AI/system actor may never be both doer and approver (no self-approval)
        const doer = stepPartActor(s, "doer"), appr = stepPartActor(s, "approver");
        if (doer && appr && doer === appr && isNonHumanActor(doer, r)) v.push({ step: label, rule: "ai-no-self-approve", detail: "an AI/system actor cannot be both doer and approver in a four-eyes control" });
        if (appr && isNonHumanActor(appr, r)) v.push({ step: label, rule: "approver-must-be-human", detail: `the approver (${appr}) must be a human, not an AI/system actor` });
      }
    }
    if (c.type === "authority" || c.authorityRef) {
      const ref = c.authorityRef || c.uses;
      const appr = stepPartActor(s, "approver");
      if (!appr) v.push({ step: label, rule: "authority-named-approver", detail: "an authority-gated step must name a human approver" });
      else if (isNonHumanActor(appr, r)) v.push({ step: label, rule: "authority-human-approver", detail: `the authority approver (${appr}) must be human, at/above the item's band` });
      if (ref && !sharedRule(r, ref)) v.push({ step: label, rule: "authority-rule-missing", detail: `authority references a missing sharedRule "${ref}"` });
    }
    if (c.type === "halt-on-flag") {
      if (!c.escalateTo) v.push({ step: label, rule: "halt-escalation-target", detail: "a halt-on-flag must name an escalation-target" });
      else if (isNonHumanActor(c.escalateTo, r)) v.push({ step: label, rule: "halt-human-target", detail: `a halt must escalate to a human (${c.escalateTo} is AI/system)` });
      if (!c.negativeConstraint) v.push({ step: label, rule: "halt-negative-constraint", detail: "a halt-on-flag must carry a negativeConstraint (what AI must not do)" });
      if (s.autoResolve === true || c.autoResolve === true) v.push({ step: label, rule: "halt-no-auto-resolve", detail: "a halt-on-flag step may never be auto-resolved by AI" });
    }
  });
  return { ok: v.length === 0, surface: opts.surface || "control", violations: v };
}

// =====================================================================
// GOLDEN FIXTURE + SELF-TEST  (run: node studio_engine.mjs)
// =====================================================================
export const FPA_INTAKE = {
  header: { persona: "FP&A analyst", dept: "Finance", anchor: "Last monthly forecast refresh & variance pack", lifecycle: "confirmed" },
  trigger: { trigger: "month-end close completes", cadence: "monthly", volume: "~12/yr" },
  steps: [
    { step: "Collect & consolidate", cls: "assembly", data: "confidential", time: 18, theo: 85, touch: 90, wait: 0, waitKind: "reducible", inputs: "GL extract", output: "consolidated actuals", consumer: "self", tool: "ERP, Excel" },
    { step: "Reconcile & validate", cls: "assembly", data: "confidential", time: 16, theo: 70, touch: 120, wait: 240, waitKind: "reducible", inputs: "sub-ledger vs GL", output: "reconciled figures", consumer: "self", tool: "ERP, Excel" },
    { step: "Build & refresh models", cls: "assembly", data: "confidential", time: 14, theo: 55, touch: 90, wait: 0, waitKind: "reducible", inputs: "actuals, drivers", output: "updated model", consumer: "self", tool: "Excel" },
    { step: "Variance analysis", cls: "judgment", data: "confidential", time: 14, theo: 30, touch: 60, wait: 0, waitKind: "reducible", inputs: "actuals vs forecast", output: "explained variances", consumer: "reviewer", tool: "Excel" },
    { step: "Draft commentary", cls: "assembly", data: "confidential", time: 16, theo: 60, touch: 60, wait: 480, waitKind: "reducible", inputs: "variances", output: "narrative", consumer: "reporting manager", tool: "Excel, Word" },
    { step: "Forecast updates", cls: "assembly", data: "confidential", time: 12, theo: 50, touch: 45, wait: 2880, waitKind: "protected", inputs: "revised assumptions", output: "updated forecast", consumer: "leadership", tool: "Excel" },
    { step: "Stakeholder advisory", cls: "decision", data: "MNPI", time: 10, theo: 10, touch: 30, wait: 0, waitKind: "reducible", inputs: "the pack", output: "guidance", consumer: "leadership", tool: "meeting" },
  ],
  seams: [
    { from: "ERP", to: "Excel", type: "re-key", friction: "high", latency: "low", crit: "medium", note: "Export then manual reformat" },
    { from: "Pack", to: "leadership", type: "handoff", friction: "low", latency: "high", crit: "high", note: "Human decision; the lead-up dominates A\u2013Z time" },
  ],
  judgment: { needs: "variance and advisory", human: "the advisory call to leadership (MNPI)", hard: "real variance vs noise", cues: "size vs threshold, trend", joiner: "chases immaterial variances" },
  confirm: { acceptance: "ties to source, reconciles to zero, within materiality, reviewer sign-off", checker: "reporting manager", escalation: "unexplained variance above threshold", dataTier: "MNPI", evals: "clean month \u2192 pack reconciles, top 3 variances flagged\nFX reval \u2192 caught and escalated" },
  recap: { corrections: "added the FX revaluation reconciling step", confirmed: true },
};

// Edition 3 multi-actor fixture — the recon exception SOP (CIB-OPS-SOP-0142), the worked example's
// shape: identity in a firm-level actors[] registry, referenced per step; controls in the hand-offs;
// an authority ladder written once in sharedRules; an authored AML halt route. Reused across F1–F8
// tests. (control / sharedRules / routes are inert until F2/F3 — additive proof along the way.)
export const RECON_INTAKE = {
  header: { persona: "Ops Analyst", dept: "CIB Operations", anchor: "Reconciliation exception matching (SOP-0142)", lifecycle: "confirmed" },
  trigger: { trigger: "exception queue populated after the engine auto-matches", cadence: "daily", volume: "~200/day" },
  actors: [
    { id: "maker", role: "Ops Analyst", department: "CIB Operations", line: "1LoD" },
    { id: "checker", role: "Senior Analyst", department: "CIB Operations", line: "1LoD" },
    { id: "teamLead", role: "Team Lead", department: "CIB Operations", line: "1LoD" },
    { id: "opsManager", role: "Ops Manager", department: "CIB Operations", line: "1LoD" },
    { id: "finance", role: "Product Control", department: "Finance", line: "1LoD" },
    { id: "finCrime", role: "Financial Crime", department: "Financial Crime", line: "2LoD" },
  ],
  sharedRules: [
    { id: "authorityMatrix:writeOff", kind: "authorityMatrix", bands: [
      { maxValue: 100, approver: "checker" },
      { maxValue: 1000, approver: "teamLead" },
      { maxValue: 10000, approver: "opsManager" },
      { maxValue: null, approver: "opsManager+finance" },
    ] },
  ],
  steps: [
    { step: "Allocate exception", cls: "assembly", data: "internal", time: 10, theo: 80, touch: 30, wait: 60, waitKind: "reducible",
      inputs: "exception queue", output: "allocated case", tool: "case manager",
      participants: [{ actorId: "teamLead", part: "doer" }],
      control: { type: "completeness", rule: "every exception allocated within SLA; none left unassigned" } },
    { step: "Investigate root cause", cls: "judgment", data: "confidential", time: 26, theo: 35, touch: 120, wait: 0, waitKind: "reducible",
      inputs: "break detail, sub-ledger", output: "root cause", tool: "case manager, ERP",
      participants: [{ actorId: "maker", part: "doer" }],
      control: { type: "halt-on-flag", on: "AML indicator", escalateTo: "finCrime", negativeConstraint: "do not clear or return; preserve evidence; no tip-off" } },
    { step: "Propose resolution", cls: "judgment", data: "confidential", time: 16, theo: 35, touch: 60, wait: 0, waitKind: "reducible",
      inputs: "root cause", output: "proposed adjustment", tool: "case manager",
      participants: [{ actorId: "maker", part: "doer" }] },
    { step: "Approve adjustment", cls: "decision", data: "confidential", time: 12, theo: 10, touch: 30, wait: 240, waitKind: "protected",
      inputs: "proposed adjustment", output: "approval", tool: "case manager",
      participants: [{ actorId: "maker", part: "doer" }, { actorId: "checker", part: "approver" }],
      control: { type: "four-eyes", distinct: ["doer", "approver"], authorityRef: "authorityMatrix:writeOff" } },
    { step: "Post adjustment", cls: "assembly", data: "confidential", time: 14, theo: 75, touch: 30, wait: 0, waitKind: "reducible",
      inputs: "approval", output: "posted entry", tool: "ERP",
      participants: [{ actorId: "maker", part: "doer" }] },
    { step: "Close & sign off", cls: "decision", data: "internal", time: 8, theo: 10, touch: 20, wait: 0, waitKind: "protected",
      inputs: "posted entry", output: "closed case", tool: "case manager",
      participants: [{ actorId: "teamLead", part: "doer" }, { actorId: "opsManager", part: "accountable" }] },
  ],
  seams: [
    { from: "Team Lead", to: "Ops Analyst", type: "handoff", friction: "low", latency: "medium", crit: "medium", note: "Allocation respects SoD" },
    { from: "Ops Analyst", to: "Senior Analyst", type: "handoff", friction: "low", latency: "medium", crit: "high", note: "Four-eyes approval gate; one click but the call commits" },
  ],
  routes: [
    { kind: "onFlag", fromStep: "Investigate root cause", to: "finCrime", routeOrigin: "authored", negativeConstraint: "do not clear or return; preserve evidence; no tip-off" },
  ],
  judgment: { needs: "root cause and materiality", human: "the four-eyes approval and the AML referral call", hard: "a real break vs a timing difference", cues: "break code, value band" },
  confirm: { acceptance: "every adjustment is four-eyes approved; AML flags are referred, never cleared", escalation: "value over band -> higher authority; AML indicator -> Financial Crime", dataTier: "confidential", evals: "clean break -> matched and posted\nAML indicator -> halted and referred" },
  recap: { corrections: "split investigate from propose; named the four-eyes approver ladder", confirmed: true },
};

function runTests() {
  let pass = 0, fail = 0;
  const ok = (name, cond, got) => { if (cond) { pass++; } else { fail++; console.log(`  \u2717 ${name}  got=${got}`); } };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // intake + gate
  ok("valid intake passes", validateIntake(FPA_INTAKE).ok, JSON.stringify(validateIntake(FPA_INTAKE).errors));
  ok("coverage 100%", validateIntake(FPA_INTAKE).coverage.pct === 100, validateIntake(FPA_INTAKE).coverage.pct);
  ok("unknown tier flagged", !validateIntake({ ...FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "secret" }] }).ok, "");
  ok("confirm gate allows", isConfirmed(FPA_INTAKE), "");
  ok("unconfirmed refused", (() => { try { assertHardenable({ ...FPA_INTAKE, recap: { confirmed: false } }); return false; } catch { return true; } })(), "");

  // capacity chain — must reproduce the model
  const cap = roleCapacity(normalizeIntake(FPA_INTAKE).steps, "Conservative");
  ok("theoretical 55%", near(cap.theoPct * 100, 55, 0.5), round(cap.theoPct * 100, 2));
  ok("permitted ~46%", near(cap.permittedPct * 100, 45.6, 0.6), round(cap.permittedPct * 100, 2));
  ok("permitted hrs ~18.2", near(cap.permittedHrs, 18.25, 0.2), round(cap.permittedHrs, 2));
  ok("realized hrs ~5.1", near(cap.realizedHrs, 5.11, 0.1), round(cap.realizedHrs, 2));
  ok("gross ~$20,849", near(cap.grossValue, 20849, 30), round(cap.grossValue));

  // cost-to-serve + net
  const routed = costToServe(normalizeIntake(FPA_INTAKE).steps, "Conservative", "routed");
  const frontier = costToServe(normalizeIntake(FPA_INTAKE).steps, "Conservative", "frontier");
  ok("routed cost ~$161", near(routed.annual, 161, 8), round(routed.annual));
  ok("frontier cost ~$1,583", near(frontier.annual, 1583, 25), round(frontier.annual));
  ok("net routed ~$20,688", near(netValue(cap.grossValue, routed.annual), 20688, 30), round(netValue(cap.grossValue, routed.annual)));

  // readiness states
  ok("net-negative -> gated-economics", readiness({ theoPct: .5, permittedPct: .5, grossValue: 1000, annualCost: 4000 }).state === "gated-economics", "");
  ok("policy-capped -> gated-policy", readiness({ theoPct: .8, permittedPct: .4, grossValue: 50000, annualCost: 200 }).state === "gated-policy", "");
  ok("clean -> now", readiness({ theoPct: .5, permittedPct: .5, grossValue: 50000, annualCost: 200 }).state === "now", "");

  // flow — reproduce 8d4h -> 7d2h, ~89% from wait
  const f = cycleTime(normalizeIntake(FPA_INTAKE).steps);
  ok("cycle before 4095m", f.cycleBefore === 4095, f.cycleBefore);
  ok("cycle after ~3460m", near(f.cycleAfter, 3460.5, 1), round(f.cycleAfter, 1));
  ok("A-Z reduction ~15%", near(f.azReductionPct, 15.5, 0.5), round(f.azReductionPct, 1));
  ok("~89% from wait", near(f.pctSavingFromWait, 88.5, 1), round(f.pctSavingFromWait, 1));
  ok("fmtDur before = 8d 4h", fmtDur(f.cycleBefore) === "8d 4h", fmtDur(f.cycleBefore));
  ok("fmtDur after = 7d 2h", fmtDur(f.cycleAfter) === "7d 2h", fmtDur(f.cycleAfter));

  // spec — decision must NOT be in the AI-carried decomposition; residency note present
  const spec = buildSpec(FPA_INTAKE);
  ok("spec has 7th field", !!spec.modelFit && !!spec.modelFit.value, "");
  ok("decision NOT AI-carried", !/Assembly \(AI-carried\)[^.]*Stakeholder advisory/.test(spec.decomposition.value), spec.decomposition.value);
  ok("residency note present", /in-VPC|restricted|approved/.test(spec.modelFit.value), spec.modelFit.value);

  // recipe — decision becomes a human checkpoint; ranked by leverage
  const rec = buildRecipe(FPA_INTAKE);
  ok("decision -> human checkpoint", rec.orderedSteps.some(s => s.kind === "human-checkpoint" && /advisory/i.test(s.step)), "");
  ok("ranked by leverage desc", rec.rankedUnits.every((u, i, a) => i === 0 || a[i - 1].leverage >= u.leverage), "");

  // projections — rail discipline
  const pj = buildProjections(FPA_INTAKE);
  ok("worker view clean on capture", railCheck(pj.worker, "capture").ok, JSON.stringify(railCheck(pj.worker, "capture").violations));
  ok("business view fails on worker surface", !railCheck(pj.business, "workbench").ok, "");

  // rail unit checks
  ok("capacity blocked on capture", !railCheck("capacity freed", "capture").ok, "");
  ok("capacity ok on dashboard", railCheck("capacity freed", "dashboard").ok, "");
  ok("reduction blocked on dashboard", !railCheck("reduce headcount", "dashboard").ok, "");
  ok("cost-to-serve ok on recipe", railCheck("cost-to-serve is a band", "recipe").ok, "");
  ok("cost-to-serve blocked on capture", !railCheck("cost-to-serve is a band", "capture").ok, "");

  // leader view — confirmed only
  const lv = buildLeaderView([FPA_INTAKE, FPA_INTAKE, { ...FPA_INTAKE, recap: { confirmed: false } }]);
  ok("leader view drops unconfirmed", lv.confirmedCount === 2 && lv.skippedUnconfirmed === 1, `${lv.confirmedCount}/${lv.skippedUnconfirmed}`);
  ok("net KPI = 2x single", near(lv.kpis.find(k => k.id === "net_capacity").value, 2 * round(netValue(cap.grossValue, routed.annual)), 60), lv.kpis.find(k => k.id === "net_capacity").value);
  ok("breakdown reconciles (gross-cost=net)", lv.breakdown.deployable.gross - lv.breakdown.deployable.cost === lv.breakdown.deployable.net, "");
  // economics-gating: a heavy-agentic MNPI unit goes net-negative and is floored out of deployable
  const heavy = { ...FPA_INTAKE, header: { ...FPA_INTAKE.header, persona: "x" }, steps: [{ step: "monitor", cls: "assembly", data: "MNPI", time: 100, theo: 40, touch: 40, wait: 0, waitKind: "reducible" }], cost: { avgTaskMin: 8, baseInTokens: 8000, baseOutTokens: 1500, agenticMultiplier: 30, retryFactor: 3 } };
  const lv2 = buildLeaderView([heavy]);
  ok("heavy-agentic MNPI -> economics-gated", lv2.kpis.find(k => k.id === "economics_gated").value === 1 && lv2.breakdown.gated.count === 1, "");
  ok("gated unit floored from net", lv2.kpis.find(k => k.id === "net_capacity").value === 0, lv2.kpis.find(k => k.id === "net_capacity").value);

  // ---- Edition 3 \u00b7 F1 \u2014 firm-level actors + per-step parts ----
  // identity REFERENCED, not embedded: a step holds only an actorId; the role comes from the registry
  ok("F1 actor resolved from registry by reference", resolveActor("maker", RECON_INTAKE).role === "Ops Analyst", resolveActor("maker", RECON_INTAKE).role);
  ok("F1 doer of a multi-part step is the doer, not the approver", stepDoerId(RECON_INTAKE.steps[3], RECON_INTAKE) === "maker", stepDoerId(RECON_INTAKE.steps[3], RECON_INTAKE));
  const hos = detectHandoffs(RECON_INTAKE);
  ok("F1 hand-off detected where the doer changes (teamLead->maker)", hos.some(h => h.fromActorId === "teamLead" && h.toActorId === "maker"), JSON.stringify(hos.map(h => `${h.fromActorId}>${h.toActorId}`)));
  ok("F1 no hand-off within a same-doer run (investigate->propose, both maker)", !hos.some(h => h.fromStep === "Investigate root cause" && h.toStep === "Propose resolution"), "");
  ok("F1 a 2LoD hand-off is flagged cross-line", detectHandoffs({ ...RECON_INTAKE, steps: [RECON_INTAKE.steps[1], { ...RECON_INTAKE.steps[1], step: "Refer", participants: [{ actorId: "finCrime", part: "doer" }] }] })[0].crossLine === true, "");
  const rc = roleCapacityByActor(RECON_INTAKE, "Conservative");
  ok("F1 capacity rolls up by doer-role (Ops Analyst freed > 0)", rc.roles.some(r => r.role === "Ops Analyst" && r.freedHrs > 0), JSON.stringify(rc.roles.map(r => r.role)));
  ok("F1 a non-doer part frees 0 (Senior Analyst is approver-only => no doer-role group)", !rc.roles.some(r => r.role === "Senior Analyst"), JSON.stringify(rc.roles.map(r => r.role)));
  const reconWhole = roleCapacity(normalizeIntake(RECON_INTAKE).steps, "Conservative");
  ok("F1 per-role freed reconciles to the workflow freed (linear decomposition)", near(rc.totalFreedHrs, reconWhole.freedHrs, 0.01), `${rc.totalFreedHrs} vs ${reconWhole.freedHrs}`);
  ok("F1 the assembly->judgment shift is per role (Team Lead carries assembly)", rc.roles.find(r => r.role === "Team Lead").assemblyShareOfRole > 0, "");
  // ADDITIVE \u2014 a single-persona workflow (no participants) => ONE doer-role = the persona, math unchanged
  const solo = roleCapacityByActor(FPA_INTAKE, "Conservative");
  ok("F1 absent participants => single implicit doer = persona", solo.roles.length === 1 && solo.roles[0].role === "FP&A analyst", JSON.stringify(solo.roles.map(r => r.role)));
  ok("F1 absent participants => freed == roleCapacity(allSteps) (byte-identical)", near(solo.roles[0].freedHrs, roleCapacity(normalizeIntake(FPA_INTAKE).steps, "Conservative").freedHrs, 0.001), `${solo.roles[0].freedHrs}`);
  ok("F1 RECON intake is valid, coverage 100", validateIntake(RECON_INTAKE).ok && validateIntake(RECON_INTAKE).coverage.pct === 100, JSON.stringify(validateIntake(RECON_INTAKE).errors));
  ok("F1 an unknown part is surfaced, never silently dropped", !validateIntake({ ...FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "public", participants: [{ actorId: "a", part: "owner" }] }] }).ok, "");

  // ---- Edition 3 \u00b7 F2 \u2014 controls + shared rules + control-aware rail ----
  // authority resolves the right approver per value band, from the write-once ladder
  ok("F2 authority band <= $100 -> checker", resolveAuthorityApprover(RECON_INTAKE, "authorityMatrix:writeOff", 50)?.approver === "checker", "");
  ok("F2 authority band ~ $5k -> opsManager", resolveAuthorityApprover(RECON_INTAKE, "authorityMatrix:writeOff", 5000)?.approver === "opsManager", "");
  ok("F2 authority above ceiling -> opsManager + finance", resolveAuthorityApprover(RECON_INTAKE, "authorityMatrix:writeOff", 50000)?.approver === "opsManager+finance", "");
  ok("F2 missing shared rule -> null (surfaced, never assumed)", resolveAuthorityApprover(RECON_INTAKE, "authorityMatrix:none", 10) === null, "");
  // the control-aware rail PASSES on the clean recon SOP (four-eyes maker!=checker; halt to a human; completeness)
  ok("F2 controlRail passes on the clean recon SOP", controlRail(RECON_INTAKE).ok, JSON.stringify(controlRail(RECON_INTAKE).violations));
  // (1) four-eyes requires two DIFFERENT actors
  const sameActor = { ...RECON_INTAKE, steps: [{ ...RECON_INTAKE.steps[3], participants: [{ actorId: "maker", part: "doer" }, { actorId: "maker", part: "approver" }] }] };
  ok("F2 four-eyes with the same actor is a violation", controlRail(sameActor).violations.some(x => x.rule === "four-eyes-distinct"), "");
  // (1b) an AI/system actor may never be the approver
  const aiApprover = { ...RECON_INTAKE, steps: [{ ...RECON_INTAKE.steps[3], participants: [{ actorId: "maker", part: "doer" }, { actorId: "system:autoApprove", part: "approver" }] }] };
  ok("F2 an AI/system approver in a four-eyes is a violation", controlRail(aiApprover).violations.some(x => x.rule === "approver-must-be-human"), "");
  // (2) an authority step missing its approver is a violation
  const noAppr = { ...RECON_INTAKE, steps: [{ ...RECON_INTAKE.steps[3], participants: [{ actorId: "maker", part: "doer" }] }] };
  ok("F2 authority/four-eyes missing the approver is a violation", !controlRail(noAppr).ok, "");
  // (3) a halt-on-flag may NEVER be auto-resolved by AI
  const autoHalt = { ...RECON_INTAKE, steps: [{ ...RECON_INTAKE.steps[1], autoResolve: true }] };
  ok("F2 an auto-resolvable halt-on-flag is a violation", controlRail(autoHalt).violations.some(x => x.rule === "halt-no-auto-resolve"), "");
  const haltNoTarget = { ...RECON_INTAKE, steps: [{ ...RECON_INTAKE.steps[1], control: { type: "halt-on-flag", on: "AML", negativeConstraint: "no tip-off" } }] };
  ok("F2 a halt with no escalation-target is a violation", controlRail(haltNoTarget).violations.some(x => x.rule === "halt-escalation-target"), "");
  // railCheck is ONE entry point: passed a record it delegates to the control rail; the text rail is unchanged
  ok("F2 railCheck(record) delegates to controlRail", railCheck(RECON_INTAKE).ok === controlRail(RECON_INTAKE).ok, "");
  ok("F2 railCheck(text) is byte-identical (capacity still blocked off-dashboard)", !railCheck("capacity freed", "capture").ok && railCheck("capacity freed", "dashboard").ok, "");
  ok("F2 unknown control type is surfaced", !validateIntake({ ...FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "public", control: { type: "rubber-stamp" } }] }).ok, "");
  // ADDITIVE \u2014 a control-free workflow has nothing to gate; the recipe single-actor steps are unchanged
  ok("F2 controlRail on a control-free workflow passes (additive)", controlRail(FPA_INTAKE).ok, "");
  ok("F2 buildRecipe single-actor step stays byte-identical (no doer/control fields)", (() => { const st = buildRecipe(FPA_INTAKE).orderedSteps[0]; return !("doer" in st) && !("control" in st); })(), "");
  ok("F2 buildRecipe surfaces the four-eyes control + resolved authority ladder on the recon approve step", (() => { const st = buildRecipe(RECON_INTAKE).orderedSteps.find(s => s.step === "Approve adjustment"); return st && st.control && st.control.type === "four-eyes" && st.control.authority && Array.isArray(st.control.authority.bands); })(), "");

  // ---- Edition 3 \u00b7 F3 \u2014 routes (derive common, author exceptions) ----
  const routes = deriveRoutes(RECON_INTAKE);
  ok("F3 onReject is DERIVED from the four-eyes approval gate (Approve -> Propose rework loop)", routes.some(rt => rt.kind === "onReject" && rt.fromStep === "Approve adjustment" && rt.toStep === "Propose resolution" && rt.routeOrigin === "derived"), JSON.stringify(routes.map(r => `${r.kind}:${r.routeOrigin}`)));
  ok("F3 onFlag is AUTHORED and round-trips with its negativeConstraint", routes.some(rt => rt.kind === "onFlag" && rt.routeOrigin === "authored" && /tip-off/.test(rt.negativeConstraint || "")), "");
  ok("F3 onSlaRisk is DERIVED from the escalation/authority structure", routes.some(rt => rt.kind === "onSlaRisk" && rt.routeOrigin === "derived"), "");
  ok("F3 every route names a routeOrigin in {derived, authored}", routes.every(rt => ["derived", "authored"].includes(rt.routeOrigin)), "");
  // ADDITIVE \u2014 no controls + no authored routes => linear (no routes)
  ok("F3 absent routes => linear (FP&A derives no routes)", deriveRoutes(FPA_INTAKE).length === 0, JSON.stringify(deriveRoutes(FPA_INTAKE)));
  // a halt-on-flag with NO authored route still gets its halt edge (never-a-dead-end)
  const haltOnly = { ...RECON_INTAKE, routes: [] };
  ok("F3 a halt-on-flag with no authored route gets a DERIVED halt edge", deriveRoutes(haltOnly).some(rt => rt.kind === "onFlag" && rt.routeOrigin === "derived" && rt.fromStep === "Investigate root cause"), "");
  // NO new flow math \u2014 deriveRoutes is a pure annotation; cycleTime is byte-identical with/without routes
  const stripped = { ...RECON_INTAKE }; delete stripped.routes;
  ok("F3 routes add NO flow math (cycleTime unchanged with/without routes)", JSON.stringify(cycleTime(normalizeIntake(RECON_INTAKE).steps)) === JSON.stringify(cycleTime(normalizeIntake(stripped).steps)), "");
  ok("F3 the rail blocks an auto-resolve past a halt route", !controlRail({ ...RECON_INTAKE, steps: [{ ...RECON_INTAKE.steps[1], autoResolve: true }] }).ok, "");
  ok("F3 buildRecipe carries routes; the FP&A single-persona recipe stays linear (no routes)", buildRecipe(RECON_INTAKE).routes.length >= 3 && buildRecipe(FPA_INTAKE).routes.length === 0, "");
  ok("F3 unknown route kind is surfaced", !validateIntake({ ...RECON_INTAKE, routes: [{ kind: "onWhatever" }] }).ok, "");

  console.log(`\n${fail === 0 ? "\u2713 ALL PASS" : "\u2717 FAILURES"} \u2014 ${pass} passed, ${fail} failed`);
  return fail === 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const okAll = runTests();
  process.exit(okAll ? 0 : 1);
}
