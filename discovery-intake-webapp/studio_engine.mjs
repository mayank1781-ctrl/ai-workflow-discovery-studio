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
  });
  (record.seams || []).forEach((s, i) => ["friction", "latency", "crit"].forEach(k => {
    if (s[k] && !LEVELS.includes(s[k])) errors.push(`seam ${i + 1}: ${k} "${s[k]}" not in low|medium|high`);
  }));
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
export function buildRecipe(record, opts = {}) {
  const r = normalizeIntake(record);
  const profile = opts.profile || "Conservative", mode = opts.mode || "routed";
  const totT = sum(r.steps.map(s => s.time)) || 1;

  // ordered build steps: assembly -> an AI instruction at its tier; judgment/decision -> a human checkpoint
  const ordered = r.steps.map(s => {
    if (s.cls === "assembly") {
      return {
        kind: "ai-step", step: s.step, tier: modelTier(s.cls, s.data, mode, opts.policyAllowsExternal),
        action: `Assemble: ${dash(s.output) === "\u2014" ? s.step : dash(s.output)} from ${dash(s.inputs)} using ${dash(s.tool)}.`,
        guardrail: r.confirm?.acceptance ? `Check against acceptance: ${r.confirm.acceptance}` : "Check against stated acceptance.",
      };
    }
    return {
      kind: "human-checkpoint", step: s.step, cls: s.cls,
      action: s.cls === "decision"
        ? `Human decision: ${s.step}. AI prepares the lead-up only; the call stays with the person.`
        : `Human judgment: ${s.step}. AI surfaces options/evidence; the person decides.`,
    };
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
    origin: opts.origin || "generation", orderedSteps: ordered, rankedUnits: ranked };
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
  const t = String(text || "").toLowerCase(), v = [];
  RAIL.banned.forEach(w => { if (t.includes(w)) v.push({ term: w, rule: "banned-everywhere" }); });
  if (surface !== "dashboard") RAIL.capacityFamily.forEach(w => { if (new RegExp(`\\b${w}\\b`).test(t)) v.push({ term: w, rule: "capacity-dashboard-only" }); });
  if (!["recipe", "dashboard"].includes(surface)) RAIL.costFamily.forEach(w => { if (t.includes(w)) v.push({ term: w, rule: "cost-recipe+dashboard-only" }); });
  if (surface === "capture") RAIL.leverage.forEach(w => { if (new RegExp(`\\b${w}\\b`).test(t)) v.push({ term: w, rule: "leverage-not-on-capture" }); });
  return { ok: v.length === 0, violations: v };
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

  console.log(`\n${fail === 0 ? "\u2713 ALL PASS" : "\u2717 FAILURES"} \u2014 ${pass} passed, ${fail} failed`);
  return fail === 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const okAll = runTests();
  process.exit(okAll ? 0 : 1);
}
