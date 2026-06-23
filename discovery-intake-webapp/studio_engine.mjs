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
  // M3 — a DECISION is never given to AI: its permitted ceiling is 0 on EVERY profile (no
  // 5/10/15% sliver). AI may prepare the lead-up, but that prep must be captured as a separate
  // upstream assembly/judgment SUPPORT step — never credited to the decision itself. Enforced
  // structurally too (stepPermitted clamps decision -> 0), so this is defence in depth.
  // A4 — `restricted` is the GENERALIZED residency class the de-identified pooled library uses in place
  // of PII / MNPI (so the moat never carries a literal PII/MNPI value). Factor = the MOST conservative
  // of PII/MNPI on each profile, so the pooled (collective) numbers are conservative, never optimistic.
  // Purely additive: existing records use public/internal/confidential/PII/MNPI and are byte-identical.
  profiles: {
    Conservative: { step: { assembly: 65, gather: 65, build: 65, judgment: 20, decision: 0, human_held: 0 },
      tier: { public: 1, internal: 1, confidential: 0.9, PII: 0.5, MNPI: 0.3, restricted: 0.3 }, mode: "draft-only" },
    Moderate: { step: { assembly: 80, gather: 80, build: 80, judgment: 30, decision: 0, human_held: 0 },
      tier: { public: 1, internal: 1, confidential: 1, PII: 0.8, MNPI: 0.6, restricted: 0.6 }, mode: "bounded agents" },
    Progressive: { step: { assembly: 92, gather: 92, build: 92, judgment: 40, decision: 0, human_held: 0 },
      tier: { public: 1, internal: 1, confidential: 1, PII: 0.9, MNPI: 0.8, restricted: 0.8 }, mode: "supervised orchestration" },
  },

  // model-fit routing by step class; decision and human_held stay human (no AI tier)
  routing: {
    routed:   { assembly: "small", gather: "small", build: "small", judgment: "mid" },
    mid:      { assembly: "mid",   gather: "mid",   build: "mid",   judgment: "mid" },
    frontier: { assembly: "frontier", gather: "frontier", build: "frontier", judgment: "frontier" },
  },
  // $/M tokens [input, output]
  tierPrice: { small: [0.40, 1.60], mid: [3.00, 15.00], frontier: [5.00, 25.00], restricted: [6.00, 30.00] },

  cost: { avgTaskMin: 20, baseInTokens: 8000, baseOutTokens: 1500, agenticMultiplier: 6, retryFactor: 1.3 },

  // A1 (M4) — per-SHAPE cost + proof profile. The v3 model applies ONE global agentic multiplier to
  // every run; a prompt-only step and a multi-tool agentic loop look identical but differ radically in
  // cost / eval effort / controls / readiness. `loop`/`retry` REPLACE the global cost.agenticMultiplier
  // / retryFactor *only when a step carries an explicit solutionShape*; an absent shape keeps the global
  // multipliers, so every existing number is byte-identical. `agentic` reproduces the global (6× · 1.3×)
  // exactly, so an all-agentic workflow equals today's numbers. prompt / deterministic-tool do NOT apply
  // the loop multiplier (the cornerstone distinction). evalEffort / needs* / controlEvidence drive the
  // recipe's proof requirements (B3), the eval-evidence readiness gate, and the control-evidence ask.
  shapeProfiles: {
    "prompt":             { loop: 1,   retry: 1.0, evalEffort: "light",    needsHarness: false, needsObservability: false, needsRollback: false, controlEvidence: "low" },
    "rag":                { loop: 1.5, retry: 1.1, evalEffort: "standard", needsHarness: true,  needsObservability: false, needsRollback: false, controlEvidence: "medium" },
    "deterministic-tool": { loop: 1,   retry: 1.0, evalEffort: "light",    needsHarness: false, needsObservability: true,  needsRollback: true,  controlEvidence: "medium" },
    "agentic":            { loop: 6,   retry: 1.3, evalEffort: "heavy",    needsHarness: true,  needsObservability: true,  needsRollback: true,  controlEvidence: "high" },
    "human-in-loop":      { loop: 1,   retry: 1.0, evalEffort: "standard", needsHarness: false, needsObservability: false, needsRollback: false, controlEvidence: "high" },
  },

  // A2 (M5) — TOTAL COST OF OWNERSHIP drivers, SHAPE-driven and SEPARATE from run-cost. Run-cost
  // (cost.* above) is inference only; TCO adds build, integration, eval-build, maintenance, eval-run,
  // and failure/rework — the build/own decision a CFO actually signs. An agentic flow costs far more
  // to build and maintain than a prompt even when its run-cost is similar. bandSpread expresses that
  // cost-to-serve + build effort are STOCHASTIC (the deck's "bands, not point estimates"). buildRate is
  // a loaded $/builder-week. Per-shape weeks; unshaped steps use `default` (a conservative middle).
  tco: {
    buildRate: 6000, bandSpread: 0.30,
    shape: {
      "prompt":             { buildWk: 1,  integrationWk: 0.25, evalBuildWk: 0.5, maintWkPerYr: 0.5, evalWkPerYr: 0.5, reworkRate: 0.02 },
      "rag":                { buildWk: 4,  integrationWk: 2,    evalBuildWk: 1.5, maintWkPerYr: 2,   evalWkPerYr: 1.5, reworkRate: 0.05 },
      "deterministic-tool": { buildWk: 3,  integrationWk: 2,    evalBuildWk: 1,   maintWkPerYr: 1.5, evalWkPerYr: 1,   reworkRate: 0.03 },
      "agentic":            { buildWk: 10, integrationWk: 5,    evalBuildWk: 4,   maintWkPerYr: 5,   evalWkPerYr: 4,   reworkRate: 0.12 },
      "human-in-loop":      { buildWk: 2,  integrationWk: 1,    evalBuildWk: 1,   maintWkPerYr: 1,   evalWkPerYr: 1,   reworkRate: 0.03 },
    },
    default: { buildWk: 3, integrationWk: 1.5, evalBuildWk: 1, maintWkPerYr: 1.5, evalWkPerYr: 1, reworkRate: 0.05 },
  },

  flow: { assemblyTouchReduction: 0.18, reducibleWaitReduction: 0.30, decisionLeadReduction: 0.12, workdayHours: 8 },

  econMarginPerYr: 0, // netValue <= this at the permitted tier => gated-economics

  // class-based defaults for the quantitative layer (used when not stated -> provenance "inferred")
  defaults: { theo: { assembly: 70, gather: 70, build: 70, judgment: 35, decision: 10, human_held: 0 },
              touch: { assembly: 60, gather: 60, build: 60, judgment: 45, decision: 30, human_held: 0 } },
};

// P4 A1 — five-rung taxonomy. "assembly" kept as legacy alias so existing test fixtures round-trip.
const CLASSES = ["gather", "build", "judgment", "decision", "human_held", "assembly"];
// A4 — `restricted` is the de-identified pooled library's generalized residency class (PII/MNPI fold
// into it). Additive: real intake still uses the five specific tiers; only pooled records use restricted.
const TIERS = ["public", "internal", "confidential", "PII", "MNPI", "restricted"];
// m1 — the controlled capability vocabulary (recurring assembly steps tag a capability so the
// reuse / adjacency layer can cluster them). An unknown tag is SURFACED at intake, never silently
// accepted — the same enum-integrity discipline as class/tier/part.
const CAPABILITY_TAGS = ["classify-and-route", "extract-and-map", "reconcile-two-sources", "draft-from-template", "summarize-thread", "validate-against-rules", "research-and-synthesize", "assemble-evidence-pack", "schedule-and-coordinate", "screen-against-list", "spread-into-schema", "generate-report"];
const LEVELS = ["low", "medium", "high"];
const RESTRICTED_TIERS = ["confidential", "PII", "MNPI", "restricted"]; // narrative: stays on approved / in-VPC models
const RESIDENCY_FORCE = ["PII", "MNPI", "restricted"];     // forces a restricted (approved) PRICING tier; confidential routes normally

// A1 (M4) — the SOLUTION-SHAPE axis: the five ways AI can carry a step. This is a SECOND axis,
// orthogonal to step class (assembly/judgment/decision). Class says "how human is the work";
// shape says "what kind of AI build it is" — and the two differ radically in cost, eval effort,
// controls, and readiness. Absent on a step => the engine behaves exactly as before (byte-identical).
// An unknown value is SURFACED at intake (enum integrity), never silently coerced — same discipline
// as class / tier / part / capability.
export const SOLUTION_SHAPES = ["prompt", "rag", "deterministic-tool", "agentic", "human-in-loop"];

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

// A2 — the SYSTEMS registry. A workflow carries systems[] (like actors[]); each step references the
// system(s) it touches by id. A system has a CLASS (the archetype), a REACHABILITY (how AI can reach
// it), and the data SOURCE it exposes. Reachability is the hard constraint on solution shape: a
// screen-only system can't honestly be agentic (no API to act through) — it caps at human-in-loop and
// carries a large integration line in TCO. Enum-integrity surfaced at intake, same as class/tier/part.
export const SYSTEM_CLASSES = ["ledger/GL", "loan-origination", "policy-admin", "ACH/payment-rail", "recon-engine", "CRM", "file-store", "email", "BI"];
export const REACHABILITY = ["api", "batch", "screen-only"];
// A2 — curated finance system-ARCHETYPE taxonomy: class -> typical data tier, control profile, and
// integration difficulty. These are the de-identified TRAITS the pooled library keeps (never a vendor
// name). Used to seed conservative defaults and to price the integration line by class.
export const SYSTEM_ARCHETYPES = {
  "ledger/GL":        { typicalDataTier: "confidential", controlProfile: "four-eyes posting; period close", integrationDifficulty: "medium" },
  "loan-origination": { typicalDataTier: "PII",          controlProfile: "credit authority bands",          integrationDifficulty: "high" },
  "policy-admin":     { typicalDataTier: "PII",          controlProfile: "underwriting authority",          integrationDifficulty: "high" },
  "ACH/payment-rail": { typicalDataTier: "confidential", controlProfile: "payment approval; sanctions screen", integrationDifficulty: "high" },
  "recon-engine":     { typicalDataTier: "confidential", controlProfile: "exception four-eyes",             integrationDifficulty: "medium" },
  "CRM":              { typicalDataTier: "PII",          controlProfile: "data-access entitlement",         integrationDifficulty: "low" },
  "file-store":       { typicalDataTier: "internal",     controlProfile: "folder access entitlement",       integrationDifficulty: "low" },
  "email":            { typicalDataTier: "internal",     controlProfile: "DLP / retention",                 integrationDifficulty: "low" },
  "BI":               { typicalDataTier: "internal",     controlProfile: "read entitlement",                integrationDifficulty: "low" },
};

// A3 — the ACTION-ON-DATA verb. Each step tags WHAT is done to the data, from a fixed set (a freeform
// step.actionNote covers the rare exception). The verb drives solution shape, controls, and
// automatability MORE than the system name does: in the SAME system and tier, `read` is cheap assembly
// AI can carry; `write-in-place` / `approve` is a controlled, often human-held act. Enum-integrity
// surfaced at intake. Additive: absent step.action, every output is byte-identical.
export const ACTION_VERBS = ["read", "download", "transform", "write-in-place", "generate-output", "notify", "approve"];

// A4 — ENTITLEMENT: the access level a step holds on its data, layered on the data tier. The truer
// value/risk signal than tier alone — nearly everyone can READ common systems, but elevated WRITE /
// APPROVE entitlement on SENSITIVE data, paired with a DECISION, is where the firm's high-value,
// human-held work lives. Captured light: infer-then-confirm (the engine infers from action verb +
// class; the human confirms at the Workbench). Enum-integrity surfaced at intake.
export const ENTITLEMENTS = ["read", "write", "approve"];
const ENTITLEMENT_RANK = { read: 1, write: 2, approve: 3 };
// sensitivity multiplier per data tier (the value/risk weight, not the policy ceiling). public/internal
// are low; confidential is elevated; PII/MNPI/restricted are the most sensitive.
const TIER_SENSITIVITY = { public: 1, internal: 1, confidential: 2, PII: 3, MNPI: 3, restricted: 3 };
const ENTITLEMENT_DECISION_MULT = 1.5; // a decision multiplies value/risk (the commit is the crown jewel)

// A5 — a CROSS-SYSTEM HANDOFF is a seam attribute, not a step: an output in one system TRIGGERS work
// in another (an email confirmation that sends the person back into the recon system, a notification,
// a file drop). These swivel-chair handoffs are prime assembly to relieve — but a high-criticality one
// is a hidden CONTROL and must never be compressed to zero. Trigger is enum-integrity surfaced.
export const HANDOFF_TRIGGERS = ["email", "notification", "file-drop"];

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

// m2 — F0 RECONCILE. Accept a dataset / capture record whose field names DRIFTED from the engine's
// canonical intake names, mapping them WITHOUT clobbering an already-canonical field:
//   header.department -> header.dept ; seam.criticality -> seam.crit ; judgmentCore -> judgment.
// Idempotent + additive: a record already in the engine shape round-trips byte-identically, so
// every existing caller is unaffected. Used at the top of validateIntake + normalizeIntake.
export function reconcileIntake(record) {
  if (!record || typeof record !== "object") return record;
  // Only clone (and reconcile) when a drift field or legacy cls is present — keeps the common path cheap.
  const hasClsMigration = Array.isArray(record.steps) && record.steps.some(s => s && s.cls === "assembly");
  const hasDrift = hasClsMigration
    || (record.header && record.header.department != null && record.header.dept == null)
    || (record.judgmentCore != null && record.judgment == null)
    || (Array.isArray(record.seams) && record.seams.some(s => s && s.criticality != null && s.crit == null));
  if (!hasDrift) return record;
  const r = structuredClone(record);
  if (r.header && r.header.department != null && r.header.dept == null) r.header.dept = r.header.department;
  if (r.judgmentCore != null && r.judgment == null) r.judgment = r.judgmentCore;
  (r.seams || []).forEach(s => { if (s && s.criticality != null && s.crit == null) s.crit = s.criticality; });
  // P4 A1 — migrate legacy "assembly" to "gather" (read/retrieve) or "build" (transform/compute).
  // Verb heuristic: action field takes priority; step name is the fallback.
  const GATHER_RE = /\b(pull|gather|collect|retriev|search|dig\s+in|extract)\b/i;
  (r.steps || []).forEach(s => {
    if (s.cls !== "assembly") return;
    const act = s.action || null;
    if (act === "read" || act === "download") { s.cls = "gather"; return; }
    if (act != null) { s.cls = "build"; return; }
    s.cls = GATHER_RE.test(String(s.step || "")) ? "gather" : "build";
  });
  return r;
}

export function validateIntake(rawRecord) {
  const record = reconcileIntake(rawRecord); // m2 — F0 field-name reconcile (additive)
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
    // M1 — NUMERIC BOUNDS: a relied-on number must be a finite, non-negative value (and a
    // percentage stays 0..100). A negative time/volume or a NaN is surfaced as invalid, never
    // silently fed into the capacity / cost / flow math where it would distort the economics.
    [["time", 0, Infinity], ["touch", 0, Infinity], ["wait", 0, Infinity], ["theo", 0, 100]].forEach(([k, lo, hi]) => {
      if (s[k] == null) return;
      const n = s[k];
      if (typeof n !== "number" || !Number.isFinite(n)) errors.push(`step ${i + 1}: ${k} "${n}" is not a finite number`);
      else if (n < lo || n > hi) errors.push(`step ${i + 1}: ${k} ${n} is out of bounds (${lo}..${hi === Infinity ? "∞" : hi})`);
    });
    // m1 — a step's capability tag (when present) must resolve to the controlled vocabulary; an
    // unresolved / typo'd tag is surfaced here, never silently accepted (it would break clustering).
    if (s.capability && !CAPABILITY_TAGS.includes(s.capability)) errors.push(`step ${i + 1}: unresolved capability tag "${s.capability}" (not in the controlled vocabulary)`);
    // A1 — a step's solution shape (when present) must resolve to the controlled vocabulary; an
    // unknown shape is surfaced here, never silently accepted (it would mis-price cost-to-serve).
    if (s.solutionShape && !SOLUTION_SHAPES.includes(s.solutionShape)) errors.push(`step ${i + 1}: unknown solution shape "${s.solutionShape}" (not in ${SOLUTION_SHAPES.join("|")})`);
    // A3 — a step's action verb (when present) must resolve to the fixed set; the rare exception goes
    // in step.actionNote (freeform). An unknown verb is surfaced, never silently accepted.
    if (s.action != null && !ACTION_VERBS.includes(s.action)) errors.push(`step ${i + 1}: unknown action "${s.action}" (not in ${ACTION_VERBS.join("|")}; use step.actionNote for the rare exception)`);
    // A4 — a step's entitlement (when stated) must resolve to read|write|approve; surfaced, never coerced.
    if (s.entitlement != null && !ENTITLEMENTS.includes(s.entitlement)) errors.push(`step ${i + 1}: unknown entitlement "${s.entitlement}" (not in ${ENTITLEMENTS.join("|")})`);
    if (s.volume != null && (typeof s.volume !== "number" || !Number.isFinite(s.volume) || s.volume < 0)) errors.push(`step ${i + 1}: volume "${s.volume}" is not a valid non-negative number`);
    // A2 — a step's system refs must resolve to the systems[] registry (when a registry exists); an
    // unresolved ref is surfaced, never silently assumed reachable (it would mis-shape the build).
    if (Array.isArray(record.systems) && Array.isArray(s.systems)) {
      s.systems.forEach(ref => {
        const key = (ref && typeof ref === "object") ? (ref.ref ?? ref.id ?? ref.name) : ref;
        if (key != null && !record.systems.some(sys => sys && (sys.id === key || sys.name === key))) errors.push(`step ${i + 1}: system ref "${key}" does not resolve to the systems[] registry`);
      });
    }
  });
  // A2 — systems[] registry enum integrity: class + reachability resolve to the controlled vocab.
  (record.systems || []).forEach((sys, i) => {
    if (sys && sys.class && !SYSTEM_CLASSES.includes(sys.class)) errors.push(`system ${i + 1}: unknown class "${sys.class}" (not in ${SYSTEM_CLASSES.join("|")})`);
    if (sys && sys.reachability && !REACHABILITY.includes(sys.reachability)) errors.push(`system ${i + 1}: unknown reachability "${sys.reachability}" (not in ${REACHABILITY.join("|")})`);
  });
  (record.seams || []).forEach((s, i) => {
    ["friction", "latency", "crit"].forEach(k => {
      if (s[k] && !LEVELS.includes(s[k])) errors.push(`seam ${i + 1}: ${k} "${s[k]}" not in low|medium|high`);
    });
    // A5 — a cross-system handoff's trigger (when present) must resolve to the fixed set; surfaced, never coerced.
    if (s.handoff && s.handoff.trigger != null && !HANDOFF_TRIGGERS.includes(s.handoff.trigger)) errors.push(`seam ${i + 1}: unknown handoff trigger "${s.handoff.trigger}" (not in ${HANDOFF_TRIGGERS.join("|")})`);
  });
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
  const r = structuredClone(reconcileIntake(record)); // m2 — F0 field-name reconcile before normalizing
  const n = (r.steps || []).length || 1;
  (r.steps || []).forEach(s => {
    s._timeProv = s.time != null ? "stated" : "inferred";
    if (s.time == null) s.time = 100 / n;
    s._theoProv = s.theo != null ? "stated" : "inferred";
    if (s.theo == null) s.theo = CONFIG.defaults.theo[s.cls] ?? 40;
    s._touchProv = s.touch != null ? "stated" : "inferred";
    if (s.touch == null) s.touch = CONFIG.defaults.touch[s.cls] ?? 45;
    if (s.wait == null) s.wait = 0;
    if (!s.waitKind) s.waitKind = (s.cls === "decision" || s.cls === "human_held") ? "protected" : "reducible";
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
// M1 — the FULL hardening gate (not just recap+coverage): asserts canHarden, which now also
// covers numeric bounds, per-field provenance (no all-inferred key value), the semantic class
// check (B2), and the control rail. A hardened spec/recipe is built only past this.
export function assertHardenable(record, what = "artifact") {
  const blockers = confirmBlockers(record);
  if (blockers.length) throw new Error(`refused: cannot harden ${what} — ${blockers.map(b => b.detail || b.rule).join("; ")}`);
}

// =====================================================================
// 2 · CALCULATION ENGINE (pure) — the three-haircut chain, economics, flow
// =====================================================================
export function stepCeilingFraction(cls, dataTier, profile) {
  const P = CONFIG.profiles[profile];
  return (P.step[cls] / 100) * (P.tier[dataTier] ?? 1);
}
// A3 — the control + automatability PROFILE of an action verb. read/download/transform are cheap,
// low-control assembly AI can carry; generate-output/notify need output/recipient controls;
// write-in-place is a controlled write into the system of record (write authority, four-eyes,
// reversibility); approve is the human-held commit. Unknown/absent => a conservative neutral profile.
export function actionProfile(action) {
  const P = {
    "read":            { automatability: "high",       controls: ["least-privilege read scope"], humanHeld: false },
    "download":        { automatability: "high",       controls: ["egress / DLP scope"], humanHeld: false },
    "transform":       { automatability: "high",       controls: ["validation; reversibility"], humanHeld: false },
    "generate-output": { automatability: "medium",     controls: ["output review; grounding to source"], humanHeld: false },
    "notify":          { automatability: "medium",     controls: ["recipient scoping; no auto-send external"], humanHeld: false },
    "write-in-place":  { automatability: "low",        controls: ["write authority", "four-eyes on the write", "reversibility / audit trail"], humanHeld: false },
    "approve":         { automatability: "human-held", controls: ["authority band", "segregation of duties"], humanHeld: true },
  };
  return { action: action || null, ...(P[action] || { automatability: "medium", controls: [], humanHeld: false }) };
}
// A3 — how much of a step AI may realistically carry given its action verb (a ceiling FACTOR 0..1),
// applied on top of the class/tier policy ceiling: read/transform = full; the controlled write is
// haircut; approve = 0 (the commit stays human). 1 for an absent/unknown verb -> an un-tagged step is
// byte-identical. (approve is also caught upstream by stepDecisionLanguage; the 0 here is defence-in-depth.)
const ACTION_CEILING = { "read": 1, "download": 1, "transform": 1, "generate-output": 1, "notify": 1, "write-in-place": 0.6, "approve": 0 };
export function actionCeilingFactor(action) { return action != null && ACTION_CEILING[action] != null ? ACTION_CEILING[action] : 1; }

// A4 — INFER the access entitlement of a step from its action verb + class when not stated (round to
// the floor — read — and flag it for confirm; the human rounds UP at the Workbench). A stated
// step.entitlement is honoured as-is. approve action / decision class / a four-eyes control => approve;
// write-in-place => write; otherwise read.
export function inferEntitlement(step) {
  if (!step) return "read";
  if (step.entitlement && ENTITLEMENTS.includes(step.entitlement)) return step.entitlement;
  if (step.action === "approve" || step.cls === "decision" || (step.control && step.control.type === "four-eyes")) return "approve";
  if (step.action === "write-in-place") return "write";
  return "read";
}
// A4 — the resolved entitlement as a provenance pair: stated when the consultant set it, else inferred.
export function entitlementOf(step) {
  const stated = step && step.entitlement && ENTITLEMENTS.includes(step.entitlement);
  return { value: inferEntitlement(step), source: stated ? "stated" : "inferred" };
}
// A4 — the VALUE/RISK weight of a step = entitlement rank × data-tier sensitivity, with a DECISION as
// a multiplier. read-only on confidential scores below write/approve on the same tier; elevated
// entitlement on sensitive data + a decision is the highest-weight, human-held core. Pure & additive.
export function stepValueRisk(step) {
  if (!step) return 0;
  const ent = ENTITLEMENT_RANK[entitlementOf(step).value] || 1;
  const sens = TIER_SENSITIVITY[step.data] ?? 1;
  const mult = step.cls === "decision" ? ENTITLEMENT_DECISION_MULT : 1;
  return round(ent * sens * mult, 3);
}
// A4 — the entitlement × sensitivity profile of a workflow: per-step value/risk, the high-value
// human-held core (elevated entitlement on sensitive data + a decision), and the inferred-entitlement
// confirm queue (infer-then-confirm). The "entitlement profile" set feeds the B1 adjacency leg.
export function buildEntitlementRisk(record, opts = {}) {
  const r = normalizeIntake(record);
  const steps = r.steps.map(s => {
    const ent = entitlementOf(s);
    return { step: s.step, entitlement: ent.value, source: ent.source, dataTier: s.data, cls: s.cls, valueRisk: stepValueRisk(s) };
  });
  const highValueCore = steps.filter(s => (ENTITLEMENT_RANK[s.entitlement] || 1) >= 2 && (TIER_SENSITIVITY[s.dataTier] ?? 1) >= 2 && s.cls === "decision");
  const confirmQueue = steps.filter(s => s.source === "inferred").map(s => ({ step: s.step, inferredEntitlement: s.entitlement }));
  return { steps, highValueCore, confirmQueue, inferredCount: confirmQueue.length,
    maxValueRisk: steps.length ? Math.max(...steps.map(s => s.valueRisk)) : 0,
    profile: uniq(steps.map(s => s.entitlement)).sort(), // the entitlement profile (B1 adjacency leg)
    note: confirmQueue.length ? "inferred entitlements — confirm (round up) at the Workbench before they count" : null };
}
// B2 — SEMANTIC CLASS CHECK. A step whose TEXT reads as a firm decision/commitment (approve /
// waive / authorize / sign-off / send-final / sanction — scored by the SAME eval-gated rubric the
// rest of the app uses, rubricStepClass) but is DECLARED assembly/judgment is a mislabel: left
// alone it would harden into an AI step and earn capacity for a call a human must keep. Returns
// true for that mislabel. Two escapes, both deliberate: SPLIT the step (the prep clause classifies
// assembly, the decision clause classifies decision — so neither single step is a mislabel), or
// supply an explicit, documented human override (step.classOverride, >= 8 chars). Additive:
// false for any step without decision language, so existing capture is byte-identical.
export function stepDecisionLanguage(step) {
  if (!step || !step.cls || step.cls === "decision" || step.cls === "human_held") return false;
  const text = `${step.step || ""}. ${step.output || ""}. ${step.action || ""}`;
  if (rubricStepClass(text) !== "decision") return false;
  const override = step.classOverride ?? step.overrideRationale;
  if (typeof override === "string" && override.trim().length >= 8) return false;
  return true;
}

// permitted addressability for one step (fraction 0..1) = min(theoretical, policy ceiling)
export function stepPermitted(step, profile) {
  if (step.cls === "decision" || step.cls === "human_held") return 0; // M3 — decisions and human-held steps are never given to AI
  if (stepDecisionLanguage(step)) return 0; // B2 — a decision in disguise earns NO automation
  const theo = (step.theo ?? 0) / 100;
  const af = step.action != null ? actionCeilingFactor(step.action) : 1; // A3 — the action verb caps automatability (a controlled write/approve carries less than a read)
  return Math.min(theo, stepCeilingFraction(step.cls, step.data, profile)) * af;
}

// A1 — the systems a step INVOLVES (Option-A counting). A step may legitimately touch several
// systems at once (Section 0 of the rubric: switching systems is NOT a step boundary). The systems
// are an ATTRIBUTE of the step, not separate steps. Reads an explicit `step.systems` (A2 registry
// refs) when present, else parses the free-text `step.tool`. Used to RECORD involvement only; the
// capacity / cost / flow math below counts time to the STEP AS A WHOLE and never gives a system a
// split share of the hours (splitting invents precision no one can defend). Returns a deduped list.
export function stepSystems(step) {
  if (!step || typeof step !== "object") return [];
  if (Array.isArray(step.systems) && step.systems.length) {
    return uniq(step.systems.map(s => (s && typeof s === "object") ? (s.ref ?? s.id ?? s.name) : s));
  }
  return uniq(String(step.tool || "").split(/[,/]/));
}

// A2 — resolve a step's system reference against the workflow's systems[] registry. Returns the
// registry record {id,name,class,reachability,dataSource} when the ref matches an id/name; otherwise
// a minimal {ref} so an un-registered ref is still legible (validateIntake surfaces the drift).
export function resolveSystem(ref, record) {
  const key = (ref && typeof ref === "object") ? (ref.ref ?? ref.id ?? ref.name) : ref;
  const reg = Array.isArray(record?.systems) ? record.systems : [];
  return reg.find(s => s && (s.id === key || s.name === key)) || { ref: key };
}
// A2 — the system records a step touches (resolved against the registry). Drives the reachability
// cap and the integration line. Empty when the step references no systems.
export function stepSystemRecords(step, record) {
  return stepSystems(step).map(ref => resolveSystem(ref, record));
}
// A2 — the REALISTIC solution shape after the reachability cap. A screen-only system has no API for
// AI to act through, so an agentic plan is un-buildable: the realistic shape caps at human-in-loop
// (the rubric's "a screen-only system can't honestly be agentic"). batch/api impose no cap here.
// Additive: with no systems referenced, realistic === declared and capped:false.
export function cappedSolutionShape(step, record) {
  const declared = (step && step.solutionShape) || null;
  const recs = stepSystemRecords(step, record);
  const screenOnly = recs.filter(s => s && s.reachability === "screen-only");
  if (screenOnly.length) {
    return { declared, realistic: "human-in-loop", capped: declared != null && declared !== "human-in-loop",
      reason: "a screen-only system has no API to act through — an agentic plan is un-buildable; realistic shape is human-in-loop (with a large integration line in TCO)." };
  }
  return { declared, realistic: declared, capped: false, reason: null };
}

// A1 — OPTION-A COUNTING. roleCapacity attributes each step's effort to the step as a whole. A step
// that spans several systems (stepSystems().length > 1) is still ONE unit of capacity — its hours are
// never divided per system. Purely a function of s.time, so a one-class step touching three systems
// scores exactly as the same step touching one (the systems are recorded as involved, not as shares).
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

// M2 — a FORMAL residency exception. PII/MNPI restriction is NON-BYPASSABLE except by a real,
// complete, unexpired exception object: a named approver, a jurisdiction, the dataClass it covers
// (must match the step's restricted tier), and a future expiry. A bare boolean (the old bypass),
// a partial object, an expired one, or one for the wrong data class is NOT an exception — the
// data stays restricted. Deterministic when the caller supplies exc.asOf (else the wall clock).
export function validPolicyException(exc, dataTier) {
  if (!exc || typeof exc !== "object" || Array.isArray(exc)) return false;
  const approver = typeof exc.approver === "string" ? exc.approver.trim() : "";
  const jurisdiction = typeof exc.jurisdiction === "string" ? exc.jurisdiction.trim() : "";
  if (!approver || !jurisdiction) return false;
  if (exc.dataClass !== dataTier) return false;              // must explicitly cover THIS restricted class
  const exp = Date.parse(exc.expiry);
  if (Number.isNaN(exp)) return false;
  const now = exc.asOf != null ? Date.parse(exc.asOf) : Date.now();
  if (Number.isNaN(now) || exp <= now) return false;         // must be unexpired
  return true;
}

// model tier for a unit: routing by class, FORCED to restricted by data-tier residency unless a
// valid, formal policy exception lifts it (M2 — a bare boolean can no longer downgrade PII/MNPI).
export function modelTier(stepClass, dataTier, mode = "routed", policyException = false) {
  if (stepClass === "decision" || stepClass === "human_held") return "human";
  let tier = CONFIG.routing[mode][stepClass] || "mid";
  if (RESIDENCY_FORCE.includes(dataTier) && !validPolicyException(policyException, dataTier)) tier = "restricted";
  return tier;
}
// A1 — cost per run is SHAPE-DRIVEN. The loop multiplier and retry factor come from the step's
// solution shape (agentic re-sends context in a loop → 6×; prompt / deterministic-tool do not →
// 1×). An ABSENT shape falls back to the global cost.agenticMultiplier / retryFactor, so an
// unshaped step is priced byte-identically to before. A shape not in the profile table also falls
// back to the global (safe). `agentic` is calibrated to equal the global (6× · 1.3×).
function costPerRun(tier, c = CONFIG.cost, shape) {
  const sp = shape != null ? CONFIG.shapeProfiles[shape] : null;
  const loop = sp ? sp.loop : c.agenticMultiplier;
  const retry = sp ? sp.retry : c.retryFactor;
  const inE = c.baseInTokens * loop * retry;
  const outE = c.baseOutTokens * loop * retry;
  const p = CONFIG.tierPrice[tier] || CONFIG.tierPrice.mid;
  return (inE * p[0] + outE * p[1]) / 1e6;
}
// annual cost-to-serve, blended across the AI-addressable class mix (gather/build/judgment; decision+human_held are human)
export function costToServe(steps, profile, mode = "routed", opts = {}) {
  const H = opts.weeklyHours ?? CONFIG.weeklyHours, W = opts.weeks ?? CONFIG.weeks, c = opts.cost ?? CONFIG.cost;
  const totT = sum(steps.map(s => s.time)) || 1;
  const aiSteps = steps.filter(s => s.cls !== "decision" && s.cls !== "human_held");
  const permHrsByStep = aiSteps.map(s => ({ s, hrs: (s.time / totT) * stepPermitted(s, profile) * H }));
  const aiPermHrs = sum(permHrsByStep.map(x => x.hrs));
  if (aiPermHrs <= 0) return { runsPerYr: 0, blendedCostPerRun: 0, annual: 0 };
  const runsPerYr = aiPermHrs * 60 / c.avgTaskMin * W;
  const blended = sum(permHrsByStep.map(({ s, hrs }) =>           // A1 — thread each step's shape into its per-run cost
    hrs * costPerRun(modelTier(s.cls, s.data, mode, opts.policyException), c, s.solutionShape))) / aiPermHrs;
  return { runsPerYr, blendedCostPerRun: blended, annual: runsPerYr * blended };
}

// A1 — the proof / control requirements a solution shape carries. An agentic flow needs an eval
// harness, run observability, and a rollback path before it is trustworthy; a prompt does not.
// Drives the recipe's "how you prove it" (B3), the eval-evidence readiness gate, and the control
// ask. Unknown / absent shape => a conservative middle (standard eval effort, no hard requirements).
export function shapeRequirements(shape) {
  const sp = (shape != null && CONFIG.shapeProfiles[shape]) || null;
  if (!sp) return { shape: shape || null, evalEffort: "standard", needsHarness: false, needsObservability: false, needsRollback: false, controlEvidence: "medium", requiredEvidence: [] };
  const req = [];
  if (sp.needsHarness) req.push("eval harness (golden set + thresholds)");
  if (sp.needsObservability) req.push("run observability / logging");
  if (sp.needsRollback) req.push("rollback / fallback path");
  if (sp.controlEvidence === "high") req.push("control evidence (owner, halts, four-eyes)");
  return { shape, evalEffort: sp.evalEffort, needsHarness: sp.needsHarness, needsObservability: sp.needsObservability, needsRollback: sp.needsRollback, controlEvidence: sp.controlEvidence, requiredEvidence: req };
}

// A1 — roll the per-step shapes of a workflow into a profile: which shapes appear, the heaviest
// eval effort any shaped step demands, and the union of required evidence. INERT when no step
// carries a shape (shaped:0, empty maps/lists) so an unshaped workflow's outputs are byte-identical.
const SHAPE_EFFORT_RANK = { none: 0, light: 1, standard: 2, heavy: 3 };
export function buildShapeProfile(steps) {
  const list = (Array.isArray(steps) ? steps : []).filter(s => s && s.solutionShape);
  const byShape = {};
  list.forEach(s => { byShape[s.solutionShape] = (byShape[s.solutionShape] || 0) + 1; });
  let maxEvalEffort = "none"; const evidence = new Set();
  list.forEach(s => {
    const rq = shapeRequirements(s.solutionShape);
    if ((SHAPE_EFFORT_RANK[rq.evalEffort] ?? 0) > (SHAPE_EFFORT_RANK[maxEvalEffort] ?? 0)) maxEvalEffort = rq.evalEffort;
    rq.requiredEvidence.forEach(e => evidence.add(e));
  });
  return { shaped: list.length, byShape, maxEvalEffort, requiredEvidence: [...evidence], hasAgentic: !!byShape.agentic };
}

export const netValue = (grossValue, annualCost) => grossValue - annualCost;

// A2 (M5) — RUN-COST vs TOTAL COST OF OWNERSHIP, as two separate lenses.
//   • RUN-COST is the v3 inference model (costToServe). Net realized value keeps using it — UNCHANGED.
//   • TCO adds the build/own costs run-cost ignores: build, integration, eval-build (all one-time),
//     plus maintenance, eval-run, and failure/rework (annual). All SHAPE-driven — an agentic flow is
//     far more expensive to build and keep alive than a prompt even when the per-run cost is close.
// Both are BANDS (cost-to-serve + build effort are stochastic — the deck's discipline). Payback is a
// RANGE: one-time build / annual net benefit (gross − run-cost − ongoing). Each AI-addressable step is
// a build unit (decision steps are human → no AI build). Unshaped steps use the conservative default,
// so a workflow with no shapes still gets a defensible TCO (and is byte-identical to the default model).
export function buildTco(record, opts = {}) {
  const r = normalizeIntake(record);
  const profile = opts.profile || "Conservative", mode = opts.mode || "routed";
  const T = opts.tco || CONFIG.tco, rate = T.buildRate, spread = T.bandSpread;
  // You BUILD a recipe once and DEPLOY it across N instances (the roles that run it). Build/maintain
  // are one-time/fixed; the captured value and the run-cost scale with the deployment. instances
  // defaults to 1 (the single-role lens); the dashboards pass the role headcount.
  const instances = Math.max(1, Number(opts.instances) || 1);
  const cap = roleCapacity(r.steps, profile, opts);
  const grossScaled = cap.grossValue * instances;
  const runAnnual = costToServe(r.steps, profile, mode, opts).annual * instances;
  const aiSteps = r.steps.filter(s => s.cls !== "decision" && s.cls !== "human_held"); // decision+human_held = human, no AI build
  const drv = (s) => (s.solutionShape && T.shape[s.solutionShape]) || T.default;
  // one-time build cost (each AI step is a build unit; agentic steps dominate). Built ONCE for the deployment.
  const build = sum(aiSteps.map(s => drv(s).buildWk)) * rate;
  const integration = sum(aiSteps.map(s => drv(s).integrationWk)) * rate;
  const evalBuild = sum(aiSteps.map(s => drv(s).evalBuildWk)) * rate;
  // A2 — a SCREEN-ONLY system has no API: integrating AI means scraping / RPA / human-in-loop glue,
  // a large one-time integration line over and above the shape's. Added per AI step that touches a
  // screen-only system. Additive: ZERO when no systems are referenced, so an un-systemed workflow's
  // TCO is byte-identical (the component line only appears when the cost is non-zero).
  const screenOnlyWk = T.screenOnlyIntegrationWk ?? 6;
  const screenOnlySteps = aiSteps.filter(s => stepSystemRecords(s, r).some(sys => sys && sys.reachability === "screen-only"));
  const screenOnlyIntegration = screenOnlySteps.length * screenOnlyWk * rate;
  const buildOneTime = build + integration + screenOnlyIntegration + evalBuild;
  // annual ongoing (EXCLUDES run-cost — that is its own lens). maintain/eval are fixed per recipe;
  // rework scales with the value at stake (the riskiest shape sets the rate).
  const maintenance = sum(aiSteps.map(s => drv(s).maintWkPerYr)) * rate;
  const evalOngoing = sum(aiSteps.map(s => drv(s).evalWkPerYr)) * rate;
  const reworkRate = aiSteps.length ? Math.max(...aiSteps.map(s => drv(s).reworkRate)) : 0;
  const rework = reworkRate * grossScaled;
  const annualOngoing = maintenance + evalOngoing + rework;
  const band = (x) => ({ low: round(x * (1 - spread)), point: round(x), high: round(x * (1 + spread)) });
  const firstYear = buildOneTime + annualOngoing + runAnnual;
  // payback band: one-time build / annual net benefit; honest when no positive benefit exists.
  const annualBenefit = grossScaled - runAnnual - annualOngoing;
  const pay = (b, n) => (n > 0 ? round(b / n, 2) : null);
  const payback = annualBenefit > 0
    ? { lowYears: pay(buildOneTime * (1 - spread), annualBenefit * (1 + spread)),
        highYears: pay(buildOneTime * (1 + spread), annualBenefit * (1 - spread)),
        annualBenefit: round(annualBenefit),
        note: "one-time build / annual net benefit (band — cost-to-serve is stochastic)" }
    : { lowYears: null, highYears: null, annualBenefit: round(annualBenefit),
        note: "no positive annual net benefit after ownership cost — TCO is not recovered; a route-down / defer (build-or-buy) decision, separate from the run-cost net" };
  return {
    instances,
    runCost: band(runAnnual),                                          // the v3 inference lens (a band), at deployment scale
    tco: {
      buildOneTime: band(buildOneTime), annualOngoing: band(annualOngoing), firstYear: band(firstYear),
      components: { build: round(build), integration: round(integration), eval: round(evalBuild + evalOngoing), maintenance: round(maintenance), rework: round(rework),
        ...(screenOnlyIntegration > 0 ? { screenOnlyIntegration: round(screenOnlyIntegration) } : {}) }, // A2 — only when a screen-only system is touched (byte-identical otherwise)
    },
    payback,
    grossValue: round(grossScaled),
    netRunCost: round(grossScaled - runAnnual),                        // the EXISTING net lens (run-cost only) — unchanged at instances=1
    shape: buildShapeProfile(r.steps),
  };
}

// M6 — INDEPENDENT GATE MATRIX. The single 4-state verdict collapses too much: ordering economics
// before policy lets weak economics MASK a policy block. This computes six gates independently —
// policy · data · control · economics · adoption · evidence — each status ok | caution | blocked |
// n-a, plus a one-line summary. A red policy gate shows regardless of the economics gate. Every
// input is optional and defaults to n-a, so a caller that only knows economics still gets a matrix.
const GATE = (status, reason) => ({ status, reason });
export function readinessGates(unit = {}) {
  const u = unit || {};
  const net = u.netValue ?? ((u.grossValue ?? 0) - (u.annualCost ?? 0));
  const margin = u.econMargin ?? CONFIG.econMarginPerYr;
  const policyGap = (u.theoPct ?? 0) - (u.permittedPct ?? 0);

  const policy = policyGap > 0.01
    ? GATE("blocked", `policy ceiling caps ${round(policyGap * 100)}pts of addressability — governance agenda`)
    : GATE("ok", "policy-permitted at the appropriate tier");

  const economics = (u.grossValue == null && u.annualCost == null && u.netValue == null)
    ? GATE("n-a", "economics not computed")
    : net <= margin
      ? GATE("blocked", `net ${round(net)} at ${u.tier || "permitted"} tier — route to a lower tier, compress context, or await cheaper capability`)
      : GATE("ok", `net-positive (${round(net)}/yr) at an appropriate tier`);

  const data = (() => {
    const t = u.dataTier;
    if (t && !TIERS.includes(t)) return GATE("blocked", `unknown data tier "${t}" — resolve before relying on the figure`);
    if (RESIDENCY_FORCE.includes(t)) return GATE("caution", `${t} forces a restricted / in-VPC model (no external egress)`);
    if (t === "confidential") return GATE("caution", "confidential — stays on approved models");
    if (!t) return GATE("n-a", "data tier not captured");
    return GATE("ok", `${t} routes normally`);
  })();

  const control = (Array.isArray(u.controlViolations) && u.controlViolations.length)
    ? GATE("blocked", `${u.controlViolations.length} control check(s) unresolved`)
    : u.controlOk === false ? GATE("blocked", "a control check is unresolved")
    : u.controlOk === true ? GATE("ok", "four-eyes / authority / halt controls pass")
    : GATE("n-a", "no controls to check");

  const adoption = (() => {
    const freed = u.freedHrs, gap = u.realizationGapHrs;
    if (freed == null || gap == null) return GATE("n-a", "realization not modeled");
    if (freed <= 0) return GATE("n-a", "nothing freed to realize");
    return (gap / freed) > 0.25
      ? GATE("caution", `${round((gap / freed) * 100)}% of the freed time needs an enablement (L&D) push`)
      : GATE("ok", "realization within range");
  })();

  // A1 — solution shape can move a unit to EVIDENCE-gated: an agentic / RAG flow needs an eval
  // harness, observability, and a rollback path that a prompt does not. If the shape demands
  // evidence the unit hasn't supplied, the evidence gate blocks (independent of the value provenance).
  const shapeMissing = Array.isArray(u.shapeEvidenceMissing) ? u.shapeEvidenceMissing.filter(Boolean) : [];
  const evidence = shapeMissing.length
    ? GATE("blocked", `the ${u.solutionShape || "chosen"} solution shape needs evidence not yet supplied: ${shapeMissing.join("; ")}`)
    : u.evidenceInferred === true
    ? GATE("blocked", "the headline values are all inferred — capture at least one stated value")
    : u.evidenceLow === true ? GATE("caution", "thin provenance — confirm the key values")
    : (u.evidenceInferred === false || u.evidenceConfirmed === true) ? GATE("ok", "key values are stated / confirmed")
    : GATE("n-a", "provenance not assessed");

  const gates = { policy, data, control, economics, adoption, evidence };
  const order = ["policy", "data", "control", "economics", "adoption", "evidence"];
  const blocked = order.filter(k => gates[k].status === "blocked");
  const caution = order.filter(k => gates[k].status === "caution");
  const summary = blocked.length
    ? `Blocked on ${blocked.join(", ")} — gates are independent (economics never masks policy).`
    : caution.length ? `Usable with caution on ${caution.join(", ")}.`
    : "All gates clear.";
  return { gates, blocked, caution, summary };
}

// readiness for an addressable unit: now / gated-policy / gated-economics / future-capability.
// M6 — the OLD 4-state verdict (state + reason) is preserved EXACTLY (additive); the independent
// gate matrix + one-line summary are attached so nothing downstream breaks.
export function readiness(unit) {
  const matrix = readinessGates(unit);
  const attach = (base) => ({ ...base, gates: matrix.gates, gateSummary: matrix.summary, gatesBlocked: matrix.blocked });
  if (unit.futureCapability) return attach({ state: "future-capability", reason: unit.futureReason || "needs a capability not yet available" });
  const policyCapped = (unit.theoPct ?? 0) - (unit.permittedPct ?? 0) > 0.01;
  const net = unit.netValue ?? (unit.grossValue - unit.annualCost);
  if (net <= (unit.econMargin ?? CONFIG.econMarginPerYr))
    return attach({ state: "gated-economics", reason: `net ${round(net)} at ${unit.tier || "permitted"} tier — route to a lower tier, compress context, or await cheaper capability` });
  if (policyCapped)
    return attach({ state: "gated-policy", reason: `policy ceiling caps ${round((unit.theoPct - unit.permittedPct) * 100)}pts of addressability — governance agenda` });
  return attach({ state: "now", reason: "addressable, policy-permitted, net-positive at an appropriate tier" });
}

// flow / cycle-time — touch + wait, with the protected (human-decision) wait preserved
export function cycleTime(steps, opts = {}) {
  const tRed = opts.assemblyTouchReduction ?? CONFIG.flow.assemblyTouchReduction;
  const wRed = opts.reducibleWaitReduction ?? CONFIG.flow.reducibleWaitReduction;
  const lRed = opts.decisionLeadReduction ?? CONFIG.flow.decisionLeadReduction;
  const touchB = sum(steps.map(s => s.touch)), waitB = sum(steps.map(s => s.wait));
  const touchA = sum(steps.map(s => (s.cls === "assembly" || s.cls === "gather" || s.cls === "build") ? s.touch * (1 - tRed) : s.touch));
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
    if (s.cls === "assembly" || s.cls === "gather" || s.cls === "build") g.assemblyTime += s.time;
    else if (s.cls === "judgment") g.judgmentTime += s.time;
    else g.decisionTime += s.time; // decision + human_held
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
const TIER_RANK = { public: 0, internal: 1, confidential: 2, PII: 3, MNPI: 4, restricted: 4 }; // A4 — restricted ranks as most-sensitive (= MNPI)
const uniq = a => [...new Set(a.filter(Boolean).map(s => String(s).trim()).filter(Boolean))];
const dash = s => (s && String(s).trim()) ? String(s).trim() : "\u2014";
const asm = steps => steps.filter(s => s.cls === "assembly" || s.cls === "gather" || s.cls === "build");
const humans = steps => steps.filter(s => s.cls && s.cls !== "assembly" && s.cls !== "gather" && s.cls !== "build");
const maxTier = r => {
  let m = "", mx = -1;
  (r.steps || []).forEach(s => { if (s.data && TIER_RANK[s.data] > mx) { mx = TIER_RANK[s.data]; m = s.data; } });
  if (r.confirm?.dataTier && TIER_RANK[r.confirm.dataTier] > mx) m = r.confirm.dataTier;
  return m;
};
const sensitive = r => RESTRICTED_TIERS.includes(maxTier(r));

// M1 — DRAFT spec: a preview of a unit that may not be confirmed yet. Never asserts; tagged
// draft:true so no surface mistakes it for a hardened, relied-upon artifact. The app's preview
// adapters use this. buildSpec() (below) is the HARDENED path and refuses an unconfirmed unit.
export function buildDraftSpec(record, opts = {}) {
  const r = normalizeIntake(record);
  const tiers = maxTier(r), tools = uniq((r.steps || []).flatMap(s => (s.tool || "").split(/[,/]/)));
  const inputs = uniq((r.steps || []).flatMap(s => (s.inputs || "").split(/[,;]/)));
  const lastDeliv = asm(r.steps).filter(s => s.output).slice(-1)[0] || (r.steps || []).filter(s => s.output).slice(-1)[0] || {};
  const art = /^[aeiou]/i.test((lastDeliv.output || "").trim()) ? "An" : "A";
  const human = humans(r.steps);
  const mode = opts.mode || "routed", profile = opts.profile || "Conservative";

  // model-fit: tier per AI-addressable class; residency note from AI-addressable steps only (not the human decision or human-held)
  const aiSteps = (r.steps || []).filter(s => s.cls !== "decision" && s.cls !== "human_held");
  let aiMaxTier = "", _mx = -1; aiSteps.forEach(s => { if (s.data && TIER_RANK[s.data] > _mx) { _mx = TIER_RANK[s.data]; aiMaxTier = s.data; } });
  const aiTiers = uniq(asm(r.steps).map(s => modelTier(s.cls, s.data, mode, opts.policyException)));
  let modelFit = `Routed \u2014 assembly \u2192 ${aiTiers.join("/") || "small"}; judgment-adjacent \u2192 mid; decision stays human.`;
  if (RESTRICTED_TIERS.includes(aiMaxTier)) modelFit += ` ${aiMaxTier} data stays on approved / in-VPC models (no external egress)${RESIDENCY_FORCE.includes(aiMaxTier) ? " \u2014 restricted pricing tier" : ""}.`;
  modelFit += " Cost-to-serve is a band; route to the cheapest tier that clears acceptance.";

  // readiness for the workflow's addressable portion — M6: feed the independent gate matrix the
  // data tier (residency), the control-rail result, the realization gap, and whether the headline
  // values are all-inferred, so the spec carries policy · data · control · economics · adoption ·
  // evidence gates (not just economics). Provenance is read off the RAW record (pre-normalize).
  const cap = roleCapacity(r.steps, profile, opts);
  const cost = costToServe(r.steps, profile, mode, opts);
  const ctrl = controlRail(r);
  // A1 \u2014 solution-shape profile across the AI-addressable steps + the evidence the shape demands but
  // the record hasn't supplied (an agentic flow needs an eval harness / observability / rollback a
  // prompt doesn't). INERT when no step is shaped, so the spec is byte-identical for today's records.
  const shapeProf = buildShapeProfile(aiSteps);
  const evidenced = new Set();
  if ((r.confirm?.evals || "").trim()) evidenced.add("eval harness (golden set + thresholds)");
  if ((r.steps || []).some(s => s.control && s.control.type)) evidenced.add("control evidence (owner, halts, four-eyes)");
  const shapeEvidenceMissing = shapeProf.requiredEvidence.filter(e => !evidenced.has(e));
  const rd = readiness({ theoPct: cap.theoPct, permittedPct: cap.permittedPct, grossValue: cap.grossValue, annualCost: cost.annual, tier: aiTiers.join("/"),
    dataTier: aiMaxTier || maxTier(r), controlOk: ctrl.ok, controlViolations: ctrl.violations,
    freedHrs: cap.freedHrs, realizationGapHrs: cap.realizationGapHrs, evidenceInferred: provenanceBlockers(record).length > 0,
    shapeEvidenceMissing, solutionShape: shapeProf.hasAgentic ? "agentic" : (Object.keys(shapeProf.byShape)[0] || null) });

  let constraints = `${tiers ? tiers + " tier" : "data tier \u2014"}; draft-only up to human review${tools.length ? `; allowed tools: ${tools.join(", ")}` : ""}.`;
  if (sensitive(r)) constraints += " Sensitive data stays on approved / in-VPC models (no external egress).";

  // A1 \u2014 attach the shape fields ONLY when at least one step is shaped (empty spread otherwise => the
  // returned object is byte-identical to the pre-A1 spec for every existing record).
  const shapeFields = shapeProf.shaped > 0 ? {
    solutionShapes: prov(Object.entries(shapeProf.byShape).map(([k, v]) => `${k}\u00d7${v}`).join(", "), "stated"),
    shapeEvalEffort: prov(shapeProf.maxEvalEffort, "inferred"),
    shapeProof: prov(shapeProf.requiredEvidence.join("; ") || "no additional shape evidence required", "inferred"),
    _shapeProfile: shapeProf, _shapeEvidenceMissing: shapeEvidenceMissing,
  } : {};

  return {
    ...shapeFields,
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
    draft: true,                                           // M1 — a draft preview, never a hardened recommendation
  };
}

// M1 — HARDENED spec. Refuses an unconfirmed / un-hardenable unit (full canHarden gate), so a
// relied-upon spec can never be produced from a record that hasn't passed the confirm boundary.
export function buildSpec(record, opts = {}) {
  assertHardenable(record, "spec");
  return { ...buildDraftSpec(record, opts), draft: false, hardened: true };
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

// M1 — DRAFT recipe: a preview of a unit that may not be confirmed. Never asserts; tagged
// draft:true. buildRecipe() (below) is the HARDENED path and refuses an unconfirmed unit.
export function buildDraftRecipe(record, opts = {}) {
  const r = normalizeIntake(record);
  const profile = opts.profile || "Conservative", mode = opts.mode || "routed";
  const totT = sum(r.steps.map(s => s.time)) || 1;

  // ordered build steps: assembly -> an AI instruction at its tier; judgment/decision -> a human checkpoint
  const ordered = r.steps.map(s => {
    // B2 \u2014 a step tagged gather/build but whose text commits the firm is NEVER rendered as an AI step;
    // it falls through to a human checkpoint that says split prep from the decision.
    const base = ((s.cls === "assembly" || s.cls === "gather" || s.cls === "build") && !stepDecisionLanguage(s))
      ? {
          kind: "ai-step", step: s.step, tier: modelTier(s.cls, s.data, mode, opts.policyException),
          action: `Assemble: ${dash(s.output) === "\u2014" ? s.step : dash(s.output)} from ${dash(s.inputs)} using ${dash(s.tool)}.`,
          guardrail: r.confirm?.acceptance ? `Check against acceptance: ${r.confirm.acceptance}` : "Check against stated acceptance.",
        }
      : {
          kind: "human-checkpoint", step: s.step, cls: s.cls,
          action: stepDecisionLanguage(s)
            ? `Decision/commitment language in a step tagged "${s.cls}" \u2014 AI prepares the lead-up only; the call stays with the person. Split prep (AI) from the decision before hardening.`
            : s.cls === "human_held"
            ? `Human-held: ${s.step}. Trust, strategy, or relationship — not addressable by AI.`
            : s.cls === "decision"
            ? `Human decision: ${s.step}. AI prepares the lead-up only; the call stays with the person.`
            : `Human judgment: ${s.step}. AI surfaces options/evidence; the person decides.`,
        };
    // A1 \u2014 thread the solution shape onto the build step when captured (absent => field omitted =>
    // byte-identical). Lets the recipe surface "prompt vs agentic" and B3 attach per-shape proof.
    if (s.solutionShape) base.solutionShape = s.solutionShape;
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
  const ranked = asm(r.steps).map(s => {
    const u = { step: s.step, tier: modelTier(s.cls, s.data, mode, opts.policyException),
      leverage: round(stepPermitted(s, profile) * (s.time / totT), 4) };
    if (s.solutionShape) u.solutionShape = s.solutionShape; // A1 \u2014 carried when captured (else omitted => byte-identical)
    return u;
  }).sort((a, b) => b.leverage - a.leverage);

  // A1 \u2014 workflow-level shape profile (INERT when no step is shaped, so the recipe object is
  // byte-identical for today's records: the field is only added when shaped > 0).
  const shapeProf = buildShapeProfile(r.steps);

  return { title: prov(`AI solution \u2014 ${dash(r.header?.persona)} / ${dash(r.header?.anchor)}`, "inferred"),
    origin: opts.origin || "generation", orderedSteps: ordered, rankedUnits: ranked,
    ...(shapeProf.shaped > 0 ? { shapeProfile: shapeProf } : {}),
    // F1/F2/F3 \u2014 multi-actor overlays (empty/inert for a single-persona, linear, control-free workflow).
    handoffs: detectHandoffs(r), controls: r.steps.filter(s => s.control && s.control.type).map(s => ({ step: s.step, type: s.control.type })),
    routes: deriveRoutes(r), rail: controlRail(r), draft: true };
}

// M1 \u2014 HARDENED recipe. Refuses an unconfirmed / un-hardenable unit (full canHarden gate).
export function buildRecipe(record, opts = {}) {
  assertHardenable(record, "recipe");
  return { ...buildDraftRecipe(record, opts), draft: false, hardened: true };
}

// B3 (Phase 2) — the RECIPE PROOF block: everything a recipe must carry to be buildable, beyond the
// ordered steps. Solution shape (A1) drives the eval plan + maintenance cost (A2); the deck's required
// fields ride along: "how you prove it" (a golden set + thresholds from acceptance) and "the governance
// remedy" (the named policy change that unlocks a gated-policy recipe). Model-fit is shown as a COSTED
// LEVER (routed vs frontier-everywhere delta). Pure; composes the existing engine — no new math.
export function buildRecipeProof(record, opts = {}) {
  const r = normalizeIntake(record);
  const profile = opts.profile || "Conservative";
  const instances = Math.max(1, Number(opts.instances) || 1);
  const shapeProf = buildShapeProfile(r.steps);
  const cap = roleCapacity(r.steps, profile, opts);
  // MODEL-FIT LEVER — routed (right model per step) vs frontier-everywhere, costed (the deck's $ lever).
  const routed = costToServe(r.steps, profile, "routed", opts).annual * instances;
  const frontier = costToServe(r.steps, profile, "frontier", opts).annual * instances;
  const modelFitLever = { routed: round(routed), frontier: round(frontier), delta: round(frontier - routed),
    note: "routed (the right model per step) vs frontier-everywhere — the FinOps lever from gross to net; route down to the cheapest tier that clears acceptance." };
  // HOW YOU PROVE IT — a golden set + thresholds from the acceptance criteria (+ a route-back fallback).
  const acceptance = (r.confirm?.acceptance || "").trim();
  const cases = (r.confirm?.evals || "").split("\n").map(s => s.trim()).filter(Boolean);
  const howYouProveIt = {
    goldenSet: cases.length ? `${cases.length} acceptance case(s) form the golden set` : "capture a golden set from the acceptance criteria",
    thresholds: acceptance ? `meets: ${acceptance}` : "set thresholds from the acceptance criteria",
    cases, source: acceptance ? "stated" : "inferred",
    fallback: "if quality slips below threshold it routes back to the human — never an auto-pass",
  };
  // THE GOVERNANCE REMEDY — the named policy change that unlocks a gated-policy recipe (else null).
  const policyGapPts = round((cap.theoPct - cap.permittedPct) * 100);
  const aiMaxTier = (() => { let m = "", mx = -1; r.steps.filter(s => s.cls !== "decision").forEach(s => { if (s.data && TIER_RANK[s.data] > mx) { mx = TIER_RANK[s.data]; m = s.data; } }); return m; })();
  const governanceRemedy = policyGapPts > 1
    ? { gated: true, unlockPts: policyGapPts,
        remedy: `Permit AI on ${aiMaxTier || "the restricted"} data with redaction + the mandatory human gate — one posture change unlocks ~${policyGapPts}pts of addressability (the governance agenda).` }
    : { gated: false, unlockPts: 0, remedy: null };
  // SHAPE-DRIVEN eval plan + maintenance cost (A1 requirements + A2 ownership components).
  const evalPlan = shapeProf.requiredEvidence.length ? shapeProf.requiredEvidence : ["spot-check against the acceptance criteria"];
  const tco = buildTco(record, { ...opts, instances });
  return {
    solutionShapes: shapeProf.byShape, hasAgentic: shapeProf.hasAgentic,
    evalPlan, evalEffort: shapeProf.maxEvalEffort,
    owner: opts.owner || r.confirm?.checker || r.judgment?.human || "name the recipe owner before deploy",
    evidenceLog: { kind: "append-only", entries: [], note: "log runs + outcomes here (reuses the audit primitive — hash-chained, frozen)" },
    fallback: howYouProveIt.fallback,
    maintenanceCost: { annualPoint: round(tco.tco.components.maintenance + tco.tco.components.eval), band: tco.tco.annualOngoing },
    howYouProveIt, governanceRemedy, modelFitLever,
  };
}

// =====================================================================
// 5 · OUTPUTS — worker / engineering / business projections + leader roll-up
// =====================================================================
export function buildProjections(record, opts = {}) {
  const r = normalizeIntake(record);
  const spec = buildDraftSpec(r, opts), human = humans(r.steps); // M1 — projection is a narrative view, not the hardened artifact
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
      policyGapHrs: cap.policyGapHrs, realizationGapHrs: cap.realizationGapHrs, flow, readiness: rd.state,
      shape: buildShapeProfile(nr.steps) }; // A1 — per-unit solution-shape profile (inert when unshaped)
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
    // A1 — solution-shape mix across confirmed units (the dashboard slices on this; C1 wires the control).
    // Empty {} when no unit is shaped, so an unshaped department reads exactly as before.
    shapeMix: units.reduce((m, u) => { Object.entries(u.shape.byShape).forEach(([k, v]) => { m[k] = (m[k] || 0) + v; }); return m; }, {}),
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
// C1 (Phase 2) — the SHARED SLICE + DRILL-DOWN + THREE-LENSES-ALWAYS. One control pivots all three
// dashboards (department / function / workflow / data tier / solution shape); rendering invariant:
// capacity is NEVER shown alone — every capacity figure is paired with cost and flow (the three lenses).
// =====================================================================

// C1 — slice records by one dimension. Empty / "all" / unknown => no-op (returns all). Pure.
export function sliceRecords(records, slice) {
  const list = (Array.isArray(records) ? records : []).filter(Boolean);
  if (!slice || !slice.dimension || slice.value == null || slice.value === "" || slice.value === "all") return list;
  const dim = slice.dimension, val = String(slice.value);
  return list.filter(r => {
    switch (dim) {
      case "department": case "function": return String(r.header?.dept || "") === val;
      case "workflow": return String(r.header?.anchor || r.header?.persona || "") === val;
      case "dataTier": return (maxTier(r) || "internal") === val;
      case "solutionShape": return Object.keys(buildShapeProfile(normalizeIntake(r).steps).byShape).includes(val);
      default: return true;
    }
  });
}
// C1 — the slice options present across the loaded records (for the control's dropdowns).
export function sliceOptions(records) {
  const list = (Array.isArray(records) ? records : []).filter(Boolean);
  const uniqv = (f) => [...new Set(list.map(f).filter(v => v != null && v !== ""))];
  return {
    department: uniqv(r => r.header?.dept),
    workflow: uniqv(r => r.header?.anchor || r.header?.persona),
    dataTier: uniqv(r => maxTier(r) || "internal"),
    solutionShape: [...new Set(list.flatMap(r => Object.keys(buildShapeProfile(normalizeIntake(r).steps).byShape)))],
  };
}
// C1 — drill-down: department -> its workflows -> a workflow's recipe units (ranked). Pure, confirmed-only.
export function drillDown(records, opts = {}) {
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  const byDept = {};
  confirmed.forEach(r => {
    const d = r.header?.dept || "—";
    (byDept[d] = byDept[d] || []).push({ workflow: r.header?.anchor || r.header?.persona || "workflow",
      units: buildDraftRecipe(r, opts).rankedUnits.map(u => ({ step: u.step, tier: u.tier, leverage: u.leverage, solutionShape: u.solutionShape })) });
  });
  return Object.entries(byDept).map(([department, workflows]) => ({ department, workflows }));
}

// C1 — THREE LENSES, never one number alone. Returns capacity ALWAYS bundled with cost + flow, so a
// surface physically cannot show a lone capacity figure (the render guard enforces this — see app).
export function threeLenses(records, opts = {}) {
  const lv = buildLeaderView(records, opts);
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  const flow = confirmed.length ? cycleTime(normalizeIntake(confirmed[0]).steps, opts) : null;
  const k = (id) => { const kpi = lv.kpis.find(x => x.id === id); return kpi ? kpi.value : 0; };
  return {
    capacity: { gross: k("gross_capacity"), net: k("net_capacity"), policyGapHrs: k("policy_gap"), realizationGapHrs: k("realization_gap") },
    cost: { costToServe: k("cost_to_serve"), modelFitLever: k("model_fit_lever") },
    flow: flow ? { azReductionPct: round(flow.azReductionPct, 1), pctSavingFromWait: round(flow.pctSavingFromWait, 1) } : { azReductionPct: null, pctSavingFromWait: null, note: "no confirmed flow yet" },
    confirmedCount: lv.confirmedCount, pairedLenses: true,
  };
}

// =====================================================================
// C2 (Phase 2) — the WORKER VIEW. Leverage framing ONLY: "what AI carries vs what stays mine" and
// "time given back, and to what". NO cost, NO capacity, NO headcount, NO FTE — every string here must
// pass railCheck(text, "worker"). Reuses buildRoleView for the assembly->judgment shift; the leverage
// summary is a real, rail-clean export.
// =====================================================================
export function buildWorkerView(records, opts = {}) {
  const rv = buildRoleView(records, opts);
  const roles = rv.roles.map(r => ({
    role: r.role,
    timeGivenBackHrsPerWeek: r.freedHrs,                 // a numeric FIELD (rendered as "time given back", never "hours saved")
    assemblyShare: r.assemblyShare, humanHeldShare: r.humanHeldShare, shift: r.shift,
    aiCarries: `AI carries the heavy lifting on the assembly work (${Math.round(r.assemblyShare * 100)}% of your steps).`,
    staysMine: `The judgment and the decisions stay yours (${Math.round(r.humanHeldShare * 100)}%) — AI assists, you decide.`,
    givenBackTo: "time back for the parts that need you — the judgment, the relationships, the harder calls.",
  }));
  return { surface: "worker", roles, confirmedCount: rv.confirmedCount,
    headline: "From tasks to leverage — AI carries the heavy lifting so you spend more time on the parts that need you.",
    note: rv.confirmedCount ? null : "No confirmed work yet — capture a workflow to see where the leverage is." };
}

// C2 — the leverage-summary export (worker-safe). Returns the content + a filename for the download.
// Every line is leverage framing and passes the worker rail (asserted in tests).
export function buildLeverageSummary(records, opts = {}) {
  const wv = buildWorkerView(records, opts);
  const lines = ["# Your leverage summary", "", wv.headline, ""];
  if (!wv.roles.length) { lines.push("No confirmed work yet — capture a workflow to see where the leverage is."); }
  wv.roles.forEach(r => {
    lines.push(`## ${r.role}`, `- ${r.aiCarries}`, `- ${r.staysMine}`, `- The shift: ${r.shift}.`, `- Time given back: ${r.givenBackTo}`, "");
  });
  return { content: lines.join("\n"), filename: "leverage-summary.md", surface: "worker", roleCount: wv.roles.length };
}

// =====================================================================
// C3 (Phase 2) — the LEADERSHIP dashboard aggregations (capacity language; the leader rail). All pure,
// confirmed-only, composed from the existing engine. AI/Hybrid/Human mix · two gap tiles + remedies ·
// cross-group sequencing · collective heatmap (n + confidence) · realization uplift · role redefinition.
// Two real exports: the board-ready capacity pack and the Land -> Expand -> Retain roadmap.
// =====================================================================

// C3 — where the line sits: AI (assembly) / Hybrid (judgment, AI assists) / Human (decision), time-weighted.
export function buildAiHybridHumanMix(records, opts = {}) {
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  let ai = 0, hybrid = 0, human = 0;
  confirmed.forEach(rec => normalizeIntake(rec).steps.forEach(s => {
    const t = s.time || 0;
    if (s.cls === "assembly" || s.cls === "gather" || s.cls === "build") ai += t;
    else if (s.cls === "judgment") hybrid += t;
    else human += t; // decision + human_held
  }));
  const tot = ai + hybrid + human || 1;
  const pct = n => round(n / tot * 100);
  return { ai: pct(ai), hybrid: pct(hybrid), human: pct(human), confirmedCount: confirmed.length,
    whereTheLineSits: `AI carries ${pct(ai)}% (gather/build); ${pct(hybrid)}% is hybrid (judgment — AI assists, the person decides); ${pct(human)}% stays human (decisions and human-held).` };
}

// C3 — the two gap tiles, each with its remedy. The POLICY tile is RED whenever a policy gap exists —
// INDEPENDENT of economics (M6: economics never masks policy). Realization tile drives the L&D agenda.
export function buildGapTiles(records, opts = {}) {
  const lv = buildLeaderView(records, opts);
  const k = id => { const kpi = lv.kpis.find(x => x.id === id); return kpi ? kpi.value : 0; };
  const policyGap = k("policy_gap") || 0, realizationGap = k("realization_gap") || 0;
  return {
    policy: { lens: "policy", hrs: policyGap, status: policyGap > 0.5 ? "red" : "ok",
      remedy: policyGap > 0.5 ? "governance posture review — permit AI on the restricted tier with redaction + the mandatory human gate" : "no policy gap — deployable now" },
    realization: { lens: "adoption", hrs: realizationGap, status: realizationGap > 0.5 ? "amber" : "ok",
      remedy: realizationGap > 0.5 ? "enablement — the role-based builder ladder (Use -> Shape -> Evaluate)" : "realization within range" },
  };
}

// C3 — cross-group sequencing (computed from per-group policy gap): build where the gap is low NOW, run
// the governance track where the gap is high IN PARALLEL. Derived, never hardcoded.
export function buildCrossGroupSequencing(records, opts = {}) {
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  const byDept = {};
  confirmed.forEach(rec => {
    const d = rec.header?.dept || "—";
    const cap = roleCapacity(normalizeIntake(rec).steps, opts.profile || "Conservative", opts);
    const g = byDept[d] = byDept[d] || { dept: d, policyGapHrs: 0, count: 0 };
    g.policyGapHrs += cap.policyGapHrs; g.count += 1;
  });
  const groups = Object.values(byDept).map(g => ({ dept: g.dept, policyGapHrs: round(g.policyGapHrs, 1), count: g.count })).sort((a, b) => a.policyGapHrs - b.policyGapHrs);
  const floor = groups.length ? groups[0].policyGapHrs : 0;
  const sequence = groups.map(g => ({ dept: g.dept, policyGapHrs: g.policyGapHrs,
    move: g.policyGapHrs <= floor + 1 ? "build now (low policy gap — deployable)" : "run the governance track in parallel (the policy gap unlocks the prize)" }));
  return { groups, sequence,
    note: groups.length >= 2 ? `Build in ${groups[0].dept} now; run the governance track for ${groups[groups.length - 1].dept} in parallel — that is where the single biggest unlock sits.` : "Single group — sequence by readiness." };
}

// C3 — collective historical heatmap over the POOLED library (de-identified, A4). Each cell carries
// n = discoveries behind it + a confidence/coverage marker; degrades GRACEFULLY under low n (n<3 =>
// directional). Replaces the old "what changed since last view".
export function buildCollectiveHeatmap(pooledRecords, opts = {}) {
  const pool = (Array.isArray(pooledRecords) ? pooledRecords : []).filter(isConfirmed);
  const cells = {};
  pool.forEach(rec => buildRoleView([rec], opts).roles.forEach(role => {
    const c = cells[role.role] = cells[role.role] || { role: role.role, dept: rec.header?.dept || "—", n: 0, freedHrs: 0 };
    c.n += 1; c.freedHrs += role.freedHrs;
  }));
  const rows = Object.values(cells).map(c => ({ role: c.role, dept: c.dept, n: c.n, freedHrs: round(c.freedHrs, 2),
    confidence: c.n >= 5 ? "established" : c.n >= 3 ? "indicative" : "directional",
    lowConfidence: c.n < 3, coverage: c.n < 3 ? "low — directional only (degrades gracefully under low n)" : "ok" }));
  return { rows, totalDiscoveries: pool.length,
    note: pool.length ? null : "No pooled discoveries yet — the collective view fills as engagements are pooled (the moat)." };
}

// C3 / D1 — the realization uplift, COMPUTED from the builder-ladder rung (the realization factor), never
// a constant: recompute gross at base vs target realization; the uplift is the delta. Changing the rung
// changes the number (asserted in D1).
export function realizationUplift(records, opts = {}) {
  const baseRf = opts.realizationFactor ?? CONFIG.realizationFactor;       // ~0.70 today
  const targetRf = opts.targetRealizationFactor ?? 0.85;                   // builder-ladder rung 3
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  const grossAt = rf => sum(confirmed.map(rec => roleCapacity(normalizeIntake(rec).steps, opts.profile || "Conservative", { ...opts, realizationFactor: rf }).grossValue));
  const base = grossAt(baseRf), target = grossAt(targetRf);
  return { baseRealization: baseRf, targetRealization: targetRf, baseGross: round(base), targetGross: round(target),
    upliftDollars: round(target - base), upliftPct: base ? round((target - base) / base * 100, 1) : 0,
    headline: `Realization ${Math.round(baseRf * 100)}% -> ${Math.round(targetRf * 100)}% (the builder ladder) — +${base ? round((target - base) / base * 100, 1) : 0}% more deployable capacity on the same footprint.` };
}

// D1 — the GOVERNANCE UNLOCK: the policy-gap dollars that MOVE when the policy profile shifts (e.g.
// Conservative -> Moderate). COMPUTED, never a constant — recompute gross at each profile; the unlock is
// the delta. Changing the target profile changes the number (asserted in D1).
export function governanceUnlock(records, opts = {}) {
  const from = opts.fromProfile || "Conservative", to = opts.toProfile || "Moderate";
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  const grossAt = profile => sum(confirmed.map(rec => roleCapacity(normalizeIntake(rec).steps, profile, opts).grossValue));
  const fromGross = grossAt(from), toGross = grossAt(to);
  return { fromProfile: from, toProfile: to, fromGross: round(fromGross), toGross: round(toGross),
    unlockDollars: round(toGross - fromGross),
    note: `Moving ${from} -> ${to} converts ~$${round(toGross - fromGross).toLocaleString("en-US")}/yr of policy-locked value to deployable — a risk conversation becomes a costed decision.` };
}

// C3 — role redefinition: individual -> team -> department (its own section + download).
export function buildRoleRedefinition(records, opts = {}) {
  const rv = buildRoleView(records, opts);
  return { confirmedCount: rv.confirmedCount,
    individual: rv.roles.map(r => ({ role: r.role, shift: r.shift, was: "assembler", becomes: "spends the freed time on the judgment that was always theirs" })),
    // D2 — reshape framing, rail-clean: the literal "headcount" is banned everywhere; the same team
    // takes on more WITHOUT GROWING (the deck's "same team" idea, expressed so the collective rail passes).
    team: "from throughput to coverage — the same team takes on more without growing, and reviews more consistently because every number traces to a source",
    department: "from cost center to capability — a truthful map of where AI helps, a governance agenda with dollars attached, and a builder ladder that compounds" };
}

// C3 — honest-under-pressure: the disclosures a CFO asks for (confirmed-vs-inferred, excluded steps,
// policy blockers, TCO payback). Pure summary over the confirmed set.
export function buildHonestUnderPressure(records, opts = {}) {
  const all = (Array.isArray(records) ? records : []);
  const confirmed = all.filter(isConfirmed);
  let inferredUnits = 0, excludedDecisionSteps = 0, policyBlocked = 0;
  confirmed.forEach(rec => {
    if (provenanceBlockers(rec).length) inferredUnits += 1;
    const r = normalizeIntake(rec);
    excludedDecisionSteps += r.steps.filter(s => s.cls === "decision" || s.cls === "human_held").length;
    const cap = roleCapacity(r.steps, opts.profile || "Conservative", opts);
    if ((cap.theoPct - cap.permittedPct) > 0.01) policyBlocked += 1;
  });
  const tco = confirmed.length ? buildTco(confirmed[0], opts) : null;
  return { confirmedCount: confirmed.length, skippedUnconfirmed: all.length - confirmed.length,
    inferredUnits, excludedDecisionSteps, policyBlocked,
    tcoPayback: tco ? tco.payback : null,
    disclosures: [
      `${confirmed.length} confirmed · ${all.length - confirmed.length} unconfirmed (excluded from the figures)`,
      `${excludedDecisionSteps} decision step(s) excluded — never credited to AI`,
      `${policyBlocked} unit(s) policy-blocked (governance agenda)`,
      `${inferredUnits} unit(s) rest on inferred values — confirm before relying`,
    ] };
}

// C3/D3 — the two REAL exports. Both carry the illustrative marker (D3) unless opts.realConfirmedSeed is set.
// D3 — until a REAL confirmed seed replaces the calibrated/illustrative one, EVERY export pack (capacity,
// evidence, roadmap) carries this visible marker; opts.realConfirmedSeed === true drops it. Single source.
export const CALIBRATED_SEED_MARKER = "Illustrative — calibrated seed, not a confirmed pilot.";
export function illustrativeMarker(opts) { return (opts && opts.realConfirmedSeed === true) ? null : CALIBRATED_SEED_MARKER; }
// D4 (Phase 3) — the REAL-SEED INGESTION PATH. The illustrative marker drops ONLY when a GENUINE
// confirmed pilot discovery is supplied — never on a bare flag, and never for the calibrated seed.
// ingestRealSeed validates a candidate: it must NOT declare itself illustrative/calibrated, must
// validate cleanly, be a confirmed discovery, and harden (controls + provenance — canHarden already
// folds in the "at least one observed time" provenance gate). Only then is realConfirmedSeed true and
// the marker null. Until a real pilot is supplied, no candidate is accepted and exports stay
// illustrative — the path exists and is validated, but it never fabricates a real seed. Pure; additive.
export function ingestRealSeed(record) {
  const reject = (reasons) => ({ accepted: false, realConfirmedSeed: false, marker: CALIBRATED_SEED_MARKER, reasons });
  if (!record || typeof record !== "object") return reject(["no candidate seed supplied"]);
  const reasons = [];
  if (record.calibrated === true || record.illustrative === true) reasons.push("the candidate declares itself illustrative/calibrated — not a real confirmed pilot");
  if (!validateIntake(record).ok) reasons.push("does not validate — resolve the enum / bounds errors first");
  if (!isConfirmed(record)) reasons.push("not a confirmed discovery — needs recap.confirmed + the required fields");
  if (!canHarden(record)) reasons.push(`cannot harden — ${confirmBlockers(record).map(b => b.rule).join(", ") || "control / provenance gate"}`);
  if (reasons.length) return reject(reasons);
  return { accepted: true, realConfirmedSeed: true, marker: null, reasons: [] };
}
export function buildCapacityPack(records, opts = {}) {
  const lv = buildLeaderView(records, opts), mix = buildAiHybridHumanMix(records, opts), tiles = buildGapTiles(records, opts), up = realizationUplift(records, opts);
  const k = id => { const kpi = lv.kpis.find(x => x.id === id); return kpi ? kpi.value : 0; };
  const usd = n => `$${Number(n || 0).toLocaleString("en-US")}`;
  const lines = ["# Board-ready capacity pack", "", `Confirmed units: ${lv.confirmedCount} (${lv.skippedUnconfirmed} unconfirmed excluded)`, "",
    `Net deployable capacity: ${usd(k("net_capacity"))}/yr (outcome quality held)`,
    `Cost-to-serve (routed): ${usd(k("cost_to_serve"))}/yr · Model-fit lever: ${usd(k("model_fit_lever"))}/yr`,
    `AI / Hybrid / Human: ${mix.ai}% / ${mix.hybrid}% / ${mix.human}%`,
    `Policy gap: ${tiles.policy.hrs} h/wk -> ${tiles.policy.remedy}`,
    `Realization gap: ${tiles.realization.hrs} h/wk -> ${tiles.realization.remedy}`,
    `Realization uplift: ${up.headline}`,
    illustrativeMarker(opts)].filter(x => x != null);
  return { content: lines.join("\n"), filename: "capacity-pack.md", surface: "dashboard", illustrative: illustrativeMarker(opts) != null };
}
export function buildRoadmapExport(records, opts = {}) {
  const seq = buildCrossGroupSequencing(records, opts), up = realizationUplift(records, opts);
  const lines = ["# Land -> Expand -> Retain roadmap", "",
    "BUILD · now — ship the deployables (technology-led, no policy change needed).",
    "GOVERNANCE — posture review (unlocks the gated-policy workflows).",
    `ENABLEMENT — builder ladder (closes the realization gap; ${up.headline}).`,
    "MODEL-FIT / FinOps — route & protect (defer gated-economics; protect the lever).",
    "", "Sequence (computed from per-group policy gap):", ...seq.sequence.map(s => `- ${s.dept}: ${s.move}`),
    "", "... then RETAIN — a recurring capacity/cost/flow telemetry view + a de-identified recipe added to a library only you own.",
    illustrativeMarker(opts)].filter(x => x != null);
  return { content: lines.join("\n"), filename: "land-expand-retain-roadmap.md", surface: "dashboard", illustrative: illustrativeMarker(opts) != null };
}

// =====================================================================
// C1 (Phase 3) — PLAIN-LANGUAGE SELF-EXPLAINING LAYER. Every figure explains itself in ITS OWN
// audience's words: a worker explainer never borrows the leader's capacity/cost vocabulary (it would
// fail the worker rail), and a leader figure explains its computation in the leader's terms. First-
// encounter explainers cover the five richer ideas — solution shape · TCO · adjacency/grouping ·
// entitlement × sensitivity · the ecosystem map — "what this is and why it changes the number." The
// honesty markers (confirmed · inferred · illustrative · directional · discoveries-behind-it) say what
// they mean in PLAIN terms, not jargon. All STATIC copy + pure lookups: additive, no numeric output
// changes. Rail-respecting is an ENFORCED invariant (explainersRailClean + the self-test/suite), never
// auto-sanitized — a regression that lets leader vocab into a worker explainer FAILS the gate.
// =====================================================================
export const EXPLAINER_AUDIENCES = ["worker", "leader", "techgov"];
// the surface each audience renders on (drives the rail the explainer must pass). worker -> the strict
// worker rail (no capacity, no cost, no headcount/FTE; leverage allowed); leader/techgov -> the
// dashboard rail (the capacity + cost economics live here).
export function audienceSurface(audience) { return audience === "worker" ? "worker" : "dashboard"; }

// per-figure explainers, keyed by audience then figure id (the ids match the engine's real figure ids:
// the worker-view fields, buildLeaderView kpi ids, buildTechGovKpis ids). Each: what the figure MEANS
// and HOW it is computed, in that audience's words.
export const FIGURE_EXPLAINERS = {
  worker: {
    time_given_back: { label: "Time given back",
      whatThisMeans: "The time AI gives back to you each week by carrying the routine assembly work — the pulling, formatting, and cross-checking — so more of your week goes to the judgment and the calls that need you.",
      howComputed: "We take the share of your steps that are routine assembly, count only the part AI can honestly carry, and show it as time given back. The judgment and the decisions are never counted — they stay yours." },
    ai_carries: { label: "What AI carries",
      whatThisMeans: "The routine, rule-following part of your work AI can take on — so you're not the one rekeying and reconciling.",
      howComputed: "The share of your steps tagged as assembly (same inputs, same right output), before any judgment or decision." },
    stays_mine: { label: "What stays yours",
      whatThisMeans: "The judgment and the decisions stay with you — AI assists, you decide.",
      howComputed: "Every step that needs your read (judgment) or commits the firm (decision) is held with you, never handed to AI." },
  },
  leader: {
    gross_capacity: { label: "Gross capacity value",
      whatThisMeans: "The yearly value of the capacity AI could free across the confirmed assembly work — before the cost of running it.",
      howComputed: "Per confirmed unit, the freed assembly hours valued at the role rate, summed. Decisions earn nothing — they stay human. This is gross, i.e. before cost-to-serve." },
    cost_to_serve: { label: "Cost-to-serve (routed)",
      whatThisMeans: "The yearly cost of running the AI that frees that capacity, on the best-matched (routed) model tier.",
      howComputed: "The per-run inference cost of the AI-addressable steps at the routed tier, annualized across the deployment." },
    net_capacity: { label: "Net capacity value",
      whatThisMeans: "The capacity value that is actually bankable — gross capacity after the cost of serving it, counting only the units where that net is positive.",
      howComputed: "Gross capacity value minus cost-to-serve, summed over net-positive units. Economics-gated units contribute zero and are flagged separately, never hidden." },
    model_fit_lever: { label: "Model-fit lever",
      whatThisMeans: "The yearly swing from matching each step to the right model tier instead of running everything on the frontier tier.",
      howComputed: "Net capacity on the routed (best-matched) tier minus net on the frontier tier — the value of routing rather than over-paying." },
    economics_gated: { label: "Economics-gated units",
      whatThisMeans: "Units where the cost to serve would exceed the capacity value at the permitted tier — deferred, not deleted.",
      howComputed: "A count of confirmed units whose net capacity value is zero or below once cost-to-serve is subtracted at the permitted tier." },
    policy_gap: { label: "Policy gap (governance agenda)",
      whatThisMeans: "Capacity AI could touch in theory but policy does not yet permit — a governance conversation, not a delivery number.",
      howComputed: "The weekly hours between what is theoretically addressable and what policy currently permits, summed across confirmed units." },
    realization_gap: { label: "Realization gap (L&D agenda)",
      whatThisMeans: "Freed capacity that will not land until the team is enabled to use AI well — the enablement agenda.",
      howComputed: "The weekly hours between the capacity freed and the capacity realized at today's realization factor, across confirmed units." },
  },
  techgov: {
    ai_steps_human_owner: { label: "% AI steps with a human owner",
      whatThisMeans: "How much of the AI-addressable work has a named human accountable for it — the control that AI assists but a person owns.",
      howComputed: "AI-addressable steps (everything that is not a decision) with a human owner or approver, as a share of all AI-addressable steps." },
    hardened_from_confirmed: { label: "% hardened from confirmed data",
      whatThisMeans: "How much of the confirmed work is ready to build from data a person stood behind — not from inferred guesses.",
      howComputed: "Confirmed units that pass every hardening gate (provenance, controls, no decision mislabel) as a share of confirmed units." },
    residency_exceptions_open: { label: "Residency exceptions open",
      whatThisMeans: "How many formal exceptions are letting sensitive data run somewhere it normally would not — each one a governance item to review.",
      howComputed: "A count of valid, unexpired policy exceptions (approver, jurisdiction, data class, expiry) across the confirmed set." },
    eval_coverage_by_shape: { label: "% shaped steps with eval coverage",
      whatThisMeans: "How much of the buildable work has a test plan behind it — the evidence that an AI step does what it should.",
      howComputed: "Steps that carry a solution shape and a stated eval plan, as a share of all shaped steps." },
    control_evidence_completeness: { label: "Control-evidence completeness",
      whatThisMeans: "How much of the control work (four-eyes, authority, halts) is fully evidenced and passes its checks.",
      howComputed: "Steps whose control passes the control rail, as a share of all steps that carry a control." },
    model_tier_mix: { label: "Model-tier mix",
      whatThisMeans: "Where the work lands across the model tiers — how much sits on the restricted, small, or frontier tier.",
      howComputed: "A tally of AI-addressable steps by the routed model tier each one resolves to under policy." },
  },
};

// the five FIRST-ENCOUNTER explainers (the richer ideas): what it is + why it moves the number. Shown
// on the leadership / tech-governance surfaces (the dashboard rail), where these concepts surface.
export const FIRST_ENCOUNTER_EXPLAINERS = [
  { id: "solutionShape", title: "Solution shape", surface: "dashboard",
    whatItIs: "How AI would actually be delivered for a step — a prompt, a retrieval-grounded assistant (RAG), a deterministic tool, an agentic flow, or human-in-the-loop.",
    whyItChangesTheNumber: "The shape sets what is buildable and what it costs to own. A screen-only system cannot honestly be agentic, so it is human-in-the-loop with a larger integration cost — the shape moves both feasibility and the total cost of ownership." },
  { id: "tco", title: "Total cost of ownership (TCO)", surface: "dashboard",
    whatItIs: "The full cost of owning a recipe, not just running it: one-time build, integration and eval-build, plus ongoing maintenance, eval, and rework — separate from the per-run cost-to-serve.",
    whyItChangesTheNumber: "Two recipes with the same per-run cost can cost very different amounts to own — an agentic flow is far more expensive to build and keep alive than a prompt. TCO is what turns a gross figure into an honest payback." },
  { id: "adjacency", title: "Adjacency & grouping", surface: "dashboard",
    whatItIs: "Where two confirmed workflows share enough — a role or capability, plus compatible data, controls, cadence, tooling, system class and access — to be built once and reused, shown as a handful of grouped clusters rather than hundreds of pairs.",
    whyItChangesTheNumber: "Genuinely adjacent work is built once and reused, so the combined capacity lands for less build effort. Where two workflows differ on access or system class they do not combine — surfaced as why-blocked, never forced." },
  { id: "entitlement", title: "Entitlement × sensitivity", surface: "dashboard",
    whatItIs: "The access level a step uses (read, write, or approve) paired with how sensitive the data is — read-only on a report and write/approve on the same records are opposite work at the same tier.",
    whyItChangesTheNumber: "Elevated write/approve access on sensitive data, paired with a decision, is the firm's high-value, human-held core — it raises both the value and the risk weighting, and it is the truest signal of whether two workflows should combine." },
  { id: "ecosystem", title: "Ecosystem map", surface: "dashboard",
    whatItIs: "The systems the whole portfolio converges on — workflows linked by a shared data source, system class, or access profile — with the high-degree (bottleneck) systems surfaced.",
    whyItChangesTheNumber: "When many workflows depend on the same feed, integrating it once unlocks all of them at once. It is honest at one discovery (labelled directional) and sharper across twenty." },
];

// honesty markers in PLAIN terms (not jargon). These are the words on the surfaces — confirmed vs
// inferred, the illustrative seed marker, the low-n directional marker, and the discovery count.
export const HONESTY_MARKERS = {
  confirmed: { term: "Confirmed", means: "A person reviewed this and stands behind it, so it counts toward the figures." },
  inferred: { term: "Inferred", means: "We filled this in from what was said — a best read, not yet checked. Confirm it before relying on it." },
  illustrative: { term: "Illustrative", means: "These numbers come from a calibrated example, not a confirmed pilot — use them for shape and direction, not as the budget." },
  directional: { term: "Directional", means: "Based on one person's picture so far — a direction, not a settled pattern. It sharpens as more discoveries are pooled." },
  nDiscoveries: { term: "Discoveries behind it", means: "How many discovery conversations sit behind this number — the more there are, the more confidence it carries." },
};

// C1 — look up one figure's explainer for an audience. Returns the explainer (with figureId/audience/
// surface attached) or null for an unknown figure/audience (additive: callers render nothing).
export function explainFigure(figureId, audience) {
  const byFig = FIGURE_EXPLAINERS[audience];
  const e = byFig && byFig[figureId];
  if (!e) return null;
  return { figureId, audience, surface: audienceSurface(audience), label: e.label, whatThisMeans: e.whatThisMeans, howComputed: e.howComputed };
}
// C1 — every figure explainer for one audience (a surface renders these). [] for an unknown audience.
export function buildExplainers(audience) {
  const byFig = FIGURE_EXPLAINERS[audience];
  if (!byFig) return [];
  return Object.keys(byFig).map(figureId => explainFigure(figureId, audience));
}
// C1 — the first-encounter explainer for one of the five richer concepts, or null.
export function firstEncounterExplainer(conceptId) {
  return FIRST_ENCOUNTER_EXPLAINERS.find(f => f.id === conceptId) || null;
}
export function listFirstEncounterExplainers() { return FIRST_ENCOUNTER_EXPLAINERS.slice(); }
// C1 — a plain-language honesty marker by id, or null.
export function explainHonestyMarker(id) {
  const m = HONESTY_MARKERS[id];
  return m ? { id, term: m.term, means: m.means } : null;
}
export function plainHonestyMarkers() { return Object.keys(HONESTY_MARKERS).map(id => explainHonestyMarker(id)); }
// C1 — the ENFORCED rail-respecting invariant: every worker explainer passes the worker rail (no
// capacity/cost/headcount), and every leader/techgov figure + first-encounter + honesty marker passes
// the dashboard rail. True iff the whole plain-language layer is rail-clean for its audience. Checked
// by the self-test and the suite; never used to silently rewrite copy.
export function explainersRailClean() {
  const wOk = buildExplainers("worker").every(e => railCheck(`${e.label}. ${e.whatThisMeans} ${e.howComputed}`, "worker").ok);
  const dashFigs = [...buildExplainers("leader"), ...buildExplainers("techgov")]
    .every(e => railCheck(`${e.label}. ${e.whatThisMeans} ${e.howComputed}`, "dashboard").ok);
  const feOk = FIRST_ENCOUNTER_EXPLAINERS.every(f => railCheck(`${f.title}. ${f.whatItIs} ${f.whyItChangesTheNumber}`, f.surface || "dashboard").ok);
  const hmOk = plainHonestyMarkers().every(m => railCheck(`${m.term}. ${m.means}`, "dashboard").ok);
  return wOk && dashFigs && feOk && hmOk;
}

// =====================================================================
// C2 (Phase 3) — ACCESSIBILITY: status encoded by MORE than color. accessibleStatus(kind, value)
// returns a status as a {label, icon, tone} triple — a TEXT label and an ICON glyph alongside the tone
// (the color the surface derives) — so a status is never distinguishable by color alone, and assistive
// tech reads the label. Pure + additive: an unknown kind/value returns null, nothing else changes. The
// values match the engine's real status sets (readiness states · gap tile status · heatmap confidence ·
// provenance). The accessible labels / focus rings / reduced-motion CSS live on the surfaces (app + CSS).
// =====================================================================
export const STATUS_TONES = ["positive", "caution", "blocked", "neutral", "info"];
export const STATUS_CUES = {
  readiness: {
    now: { label: "Ready now", icon: "✓", tone: "positive" },
    "gated-policy": { label: "Gated — policy", icon: "⚑", tone: "blocked" },
    "gated-economics": { label: "Gated — economics", icon: "⚠", tone: "caution" },
    "future-capability": { label: "Future capability", icon: "◷", tone: "neutral" },
  },
  gap: {
    ok: { label: "On track", icon: "✓", tone: "positive" },
    amber: { label: "Watch", icon: "▲", tone: "caution" },
    red: { label: "Action needed", icon: "⚠", tone: "blocked" },
  },
  confidence: {
    established: { label: "Established", icon: "●●●", tone: "positive" },
    indicative: { label: "Indicative", icon: "●●", tone: "caution" },
    directional: { label: "Directional", icon: "●", tone: "neutral" },
  },
  provenance: {
    stated: { label: "Stated", icon: "◆", tone: "positive" },
    inferred: { label: "Inferred", icon: "◇", tone: "caution" },
    computed: { label: "Computed", icon: "∑", tone: "info" },
  },
};
export function accessibleStatus(kind, value) {
  const byKind = STATUS_CUES[kind];
  const c = byKind && byKind[value];
  if (!c) return null;
  return { kind, value, label: c.label, icon: c.icon, tone: c.tone };
}
// C2 — the non-color invariant, ENFORCED: every status cue carries a non-empty text label AND a
// non-empty icon (legible without color) and a known tone. Checked by the self-test + the suite.
export function statusCuesNonColor() {
  return Object.keys(STATUS_CUES).every(kind => Object.keys(STATUS_CUES[kind]).every(v => {
    const c = accessibleStatus(kind, v);
    return c && typeof c.label === "string" && c.label.length > 0 && typeof c.icon === "string" && c.icon.length > 0 && STATUS_TONES.includes(c.tone);
  }));
}

// =====================================================================
// C4 (Phase 2) — the TECH & GOVERNANCE dashboard. Build view (shape · model tier · eval plan · owner
// per recipe) · control evidence (four-eyes / authority / halts + the Phase-1 gate-matrix status) · the
// six AI-policy KPIs · the builder ladder (Use -> Shape -> Evaluate). One real export: the audit-ready
// evidence pack. All pure, composed from the existing engine.
// =====================================================================

// C4 — the builder ladder (the realization / enablement track lives here): rungs map to a realization
// factor, so the enablement story ties to the computed uplift (C3 / D1).
export const BUILDER_LADDER = [
  { rung: 1, name: "Use", detail: "run the shipped recipes confidently; know when to trust and when to check", realization: 0.70 },
  { rung: 2, name: "Shape", detail: "adapt prompts + acceptance criteria to your own portfolio or service", realization: 0.78 },
  { rung: 3, name: "Evaluate", detail: "read evals, catch drift, own the quality guardrail for your workflow", realization: 0.85 },
];

// C4 — the six AI-policy KPIs + the residency exceptions. Confirmed-only.
export function buildTechGovKpis(records, opts = {}) {
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  let aiSteps = 0, aiWithOwner = 0, controls = 0, controlsOk = 0, shaped = 0, shapedWithEval = 0, hardened = 0;
  const tierMix = {}; const openExceptions = [];
  confirmed.forEach(rec => {
    const r = normalizeIntake(rec);
    if (canHarden(rec)) hardened += 1;
    const hasEvals = !!(rec.confirm?.evals || "").trim();
    const hasHumanOwner = !!(rec.confirm?.checker || rec.judgment?.human);
    r.steps.filter(s => s.cls !== "decision" && s.cls !== "human_held").forEach(s => {
      aiSteps += 1;
      const owned = hasHumanOwner || (Array.isArray(s.participants) && s.participants.some(p => p.part === "approver" && !isNonHumanActor(p.actorId, rec)));
      if (owned) aiWithOwner += 1;
      tierMix[modelTier(s.cls, s.data, "routed")] = (tierMix[modelTier(s.cls, s.data, "routed")] || 0) + 1;
      if (s.solutionShape) { shaped += 1; if (hasEvals) shapedWithEval += 1; }
    });
    const violated = new Set(controlRail(rec).violations.map(v => v.step));
    r.steps.forEach(s => { if (s.control && s.control.type) { controls += 1; if (!violated.has(s.step)) controlsOk += 1; } });
    (Array.isArray(rec.policyExceptions) ? rec.policyExceptions : []).forEach(exc => { if (validPolicyException(exc, exc && exc.dataClass)) openExceptions.push({ approver: exc.approver, jurisdiction: exc.jurisdiction, dataClass: exc.dataClass, expiry: exc.expiry }); });
  });
  const pct = (a, b) => b ? round(a / b * 100) : 0;
  return {
    kpis: [
      { id: "ai_steps_human_owner", label: "% AI steps with a human owner", value: pct(aiWithOwner, aiSteps), unit: "%" },
      { id: "hardened_from_confirmed", label: "% hardened from confirmed data", value: pct(hardened, confirmed.length), unit: "%" },
      { id: "residency_exceptions_open", label: "Residency exceptions open", value: openExceptions.length, unit: "count" },
      { id: "eval_coverage_by_shape", label: "% shaped steps with eval coverage", value: pct(shapedWithEval, shaped), unit: "%" },
      { id: "control_evidence_completeness", label: "Control-evidence completeness", value: pct(controlsOk, controls), unit: "%" },
      { id: "model_tier_mix", label: "Model-tier mix", value: tierMix, unit: "mix" },
    ],
    residencyExceptions: openExceptions, confirmedCount: confirmed.length,
  };
}

// C4 — the build view (per recipe) + control evidence (the gate matrix) + the KPIs + the ladder.
export function buildTechGovView(records, opts = {}) {
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  const builds = confirmed.map(rec => {
    const proof = buildRecipeProof(rec, opts);
    const rec2 = buildDraftRecipe(rec, opts);
    const ctrl = controlRail(rec);
    return {
      workflow: rec.header?.anchor || rec.header?.persona || "workflow",
      shapes: proof.solutionShapes, evalEffort: proof.evalEffort, owner: proof.owner,
      tiers: [...new Set(rec2.rankedUnits.map(u => u.tier))],
      evalPlan: proof.evalPlan,
      controlEvidence: { ok: ctrl.ok, violations: ctrl.violations.map(v => ({ rule: v.rule, step: v.step, detail: v.detail })),
        controls: normalizeIntake(rec).steps.filter(s => s.control && s.control.type).map(s => ({ step: s.step, type: s.control.type })) },
    };
  });
  return { builds, kpis: buildTechGovKpis(records, opts), builderLadder: BUILDER_LADDER, confirmedCount: confirmed.length,
    note: confirmed.length ? null : "No confirmed units yet — confirm a workflow to populate the build & governance view." };
}

// C4 — the audit-ready evidence pack export (control evidence + KPIs + hardened status). Carries the
// illustrative marker (D3) unless a real confirmed seed is flagged.
export function buildEvidencePack(records, opts = {}) {
  const view = buildTechGovView(records, opts);
  const kpiLine = view.kpis.kpis.filter(k => k.unit !== "mix").map(k => `${k.label}: ${k.value}${k.unit === "%" ? "%" : ""}`).join(" · ");
  const lines = ["# Audit-ready evidence pack", "", `Confirmed units: ${view.confirmedCount}`, "", "## AI-policy KPIs", kpiLine, `Model-tier mix: ${JSON.stringify(view.kpis.kpis.find(k => k.id === "model_tier_mix").value)}`, "", "## Control evidence"];
  view.builds.forEach(b => {
    lines.push(`### ${b.workflow}`, `- shape: ${Object.keys(b.shapes).join(", ") || "—"} · owner: ${b.owner} · tiers: ${b.tiers.join("/")}`,
      `- controls: ${b.controlEvidence.controls.map(c => `${c.step} (${c.type})`).join("; ") || "none"}`,
      `- control rail: ${b.controlEvidence.ok ? "PASS" : `BLOCKED — ${b.controlEvidence.violations.map(v => v.rule).join(", ")}`}`, "");
  });
  lines.push("## Residency exceptions (open)");
  view.kpis.residencyExceptions.forEach(e => lines.push(`- ${e.dataClass} by ${e.approver} (${e.jurisdiction}), expires ${e.expiry}`));
  if (!view.kpis.residencyExceptions.length) lines.push("- none open");
  const mark = illustrativeMarker(opts); if (mark) lines.push("", mark);
  return { content: lines.join("\n"), filename: "evidence-pack.md", surface: "dashboard", illustrative: mark != null };
}

// =====================================================================
// 5.5 · EDITION 3 — DERIVED LEADER LAYER (F4): role roll-up · capability map · adjacency
// Pure derived views over CONFIRMED multi-actor workflows (no new schema), the way buildLeaderView sits
// on the units. Capacity + operating-model language ONLY — the reasons name controls / data tiers, never
// people. Adjacency is a HYPOTHESIS for leaders, human-confirmed; never a reorg, never headcount.
// =====================================================================

// =====================================================================
// A4 (two-tier discovery store) — DE-IDENTIFY pass for the POOLED cross-discovery library.
// A confirmed discovery is persisted in TWO tiers:
//   • per-engagement store — FULL fidelity (PII / confidential allowed), scoped to one engagement;
//   • pooled cross-discovery library — written through this de-identify pass, which keeps ONLY the
//     de-identified shape the collective views need (roles, capabilities, data-tier CLASS, step-classes,
//     metrics) and STRIPS names, PII / MNPI content, and proprietary free-text. The pool is the moat.
// The pooled record retains enough STRUCTURE (non-sensitive placeholders) to pass isConfirmed, so the
// whole derived layer (role view / capability map / adjacency / leader view) runs over the pool directly.
// =====================================================================
const POOL_REDACT = "[de-identified]";
// generalize a captured tier to the pooled residency class (PII/MNPI -> restricted; never a literal
// PII/MNPI value survives into the pool). public/internal/confidential pass through (not sensitive content).
function pooledTier(t) { return (t === "PII" || t === "MNPI") ? "restricted" : (TIERS.includes(t) ? t : "internal"); }
// deterministic opaque id (no Date.now/Math.random) from the de-identified SHAPE only — never the name.
function pooledId(r) {
  const basis = JSON.stringify((r.steps || []).map(s => [s.cls, pooledTier(s.data), s.capability || ""])) + "|" + (r.header?.dept || "") + "|" + (r.trigger?.cadence || "");
  let h = 0; for (let i = 0; i < basis.length; i++) h = (h * 31 + basis.charCodeAt(i)) | 0;
  return "pooled-" + (h >>> 0).toString(36);
}
export function deIdentify(record, opts = {}) {
  const r = reconcileIntake(record);
  const id = opts.poolId || pooledId(r);
  const steps = (r.steps || []).map((s, i) => {
    const out = {
      step: `${POOL_REDACT} step ${i + 1}`,                 // structural placeholder; the real text is proprietary
      cls: s.cls, data: pooledTier(s.data),                 // step-class + (generalized) data tier = KEPT categories
      capability: s.capability || capabilitySignature(s),    // capability signature = KEPT
    };
    ["time", "theo", "touch", "wait", "volume"].forEach(k => { if (s[k] != null) out[k] = s[k]; }); // metrics = KEPT
    if (s.waitKind) out.waitKind = s.waitKind;
    if (s.solutionShape) out.solutionShape = s.solutionShape; // shape is a category (A1) = KEPT
    // A2 — a step's systems become CLASSES (the archetype the moat needs); the vendor id/name never pools.
    if (Array.isArray(s.systems)) { const cls = uniq(s.systems.map(ref => resolveSystem(ref, r).class)); if (cls.length) out.systemClasses = cls; }
    if (s.entitlement) out.entitlement = s.entitlement; // A4 — entitlement is a CATEGORY (the truest adjacency leg) = KEPT
    if (s.action) out.action = s.action;                 // A3 — action-on-data class = KEPT category
    if (Array.isArray(s.participants)) out.participants = s.participants.map(p => ({ actorId: p.actorId, part: p.part })); // PART + opaque ref, not a person
    if (s.control && s.control.type) out.control = { type: s.control.type, ...(s.control.distinct ? { distinct: s.control.distinct } : {}) }; // control TYPE only
    return out;
  });
  const out = {
    pooled: true, deIdentified: true, poolId: id,
    // header: persona is a ROLE label (a category the moat needs) — kept; the proprietary workflow name (anchor) is replaced by the opaque id.
    header: { persona: r.header?.persona || POOL_REDACT, dept: r.header?.dept || POOL_REDACT, anchor: id, lifecycle: r.header?.lifecycle || "confirmed" },
    trigger: { trigger: POOL_REDACT, cadence: r.trigger?.cadence || POOL_REDACT, ...(r.trigger?.volume != null ? { volume: r.trigger.volume } : {}) },
    steps,
    seams: (Array.isArray(r.seams) && r.seams.length) ? r.seams.map(s => ({ friction: s.friction, latency: s.latency, crit: s.crit, type: s.type,
      ...(s.handoff ? { handoff: { trigger: s.handoff.trigger || null, bridgeCount: Array.isArray(s.handoff.bridges) ? s.handoff.bridges.length : 0 } } : {}) })) : [{ friction: "low", latency: "low", crit: "low", type: "seam" }], // A5 — handoff PATTERN (trigger + bridge count) is a kept class; vendor system names never pool
    judgment: { needs: POOL_REDACT, hard: POOL_REDACT, cues: POOL_REDACT, human: POOL_REDACT },
    confirm: { acceptance: POOL_REDACT, escalation: POOL_REDACT, dataTier: pooledTier(r.confirm?.dataTier || maxTier(r) || "internal") },
    recap: { confirmed: true },
  };
  if (Array.isArray(r.actors)) out.actors = r.actors.map(a => ({ id: a.id, role: a.role, department: a.department, line: a.line })); // role labels (categories), not names
  // A2 — the pooled systems registry keeps only the system CLASS + reachability TRAITS, never the vendor name/id/dataSource.
  if (Array.isArray(r.systems)) out.systems = r.systems.map(sys => ({ class: sys.class, reachability: sys.reachability }));
  if (Array.isArray(r.sharedRules)) out.sharedRules = r.sharedRules.map(rule => ({ id: rule.id, kind: rule.kind, bands: (rule.bands || []).map(b => ({ maxValue: b.maxValue, approver: b.approver })) })); // authority ladder = role refs, structural
  return out;
}
// A4 — the two-tier WRITE for a confirmed discovery: full record -> engagement store; de-identified -> pool.
export function splitDiscoveryTiers(record, opts = {}) {
  return { engagement: record, pooled: deIdentify(record, opts) };
}
// A4 — build the pooled library from many discoveries (confirmed only). The derived layer runs over this.
export function buildPooledLibrary(records) {
  return (Array.isArray(records) ? records : []).filter(isConfirmed).map(r => deIdentify(r));
}

// F4 — freed capacity per ROLE across every confirmed workflow that role's doer touches, plus the
// assembly -> judgment shift per role. Sums roleCapacityByActor across confirmed records by role label.
export function buildRoleView(records, opts = {}) {
  const profile = opts.profile || "Conservative";
  const all = Array.isArray(records) ? records : [];
  const confirmed = all.filter(isConfirmed);
  const H = opts.weeklyHours ?? CONFIG.weeklyHours;
  const byRole = new Map();
  confirmed.forEach(rec => {
    const rc = roleCapacityByActor(rec, profile, opts);
    const wf = rec.header?.anchor || rec.header?.persona || "workflow";
    rc.roles.forEach(role => {
      const key = role.role;
      if (!byRole.has(key)) byRole.set(key, { role: key, line: role.line, freedHrs: 0, realizedHrs: 0, theoHrs: 0, permittedHrs: 0, grossValue: 0, assemblyTime: 0, judgmentTime: 0, decisionTime: 0, time: 0, workflows: new Set() });
      const g = byRole.get(key);
      g.freedHrs += role.freedHrs; g.realizedHrs += role.realizedHrs; g.theoHrs += role.theoHrs; g.permittedHrs += role.permittedHrs; g.grossValue += role.grossValue;
      g.assemblyTime += role.assemblyTime; g.judgmentTime += role.judgmentTime; g.decisionTime += role.decisionTime; g.time += role.time;
      g.workflows.add(wf);
    });
  });
  const roles = [...byRole.values()].map(g => ({
    role: g.role, line: g.line,
    freedHrs: round(g.freedHrs, 3), freedFTE: round(g.freedHrs / H, 3),
    realizedHrs: round(g.realizedHrs, 3), grossValue: round(g.grossValue), workflowCount: g.workflows.size,
    assemblyShare: g.time ? round(g.assemblyTime / g.time, 3) : 0,
    humanHeldShare: g.time ? round((g.judgmentTime + g.decisionTime) / g.time, 3) : 0,
    // the reshaping headline: the role spends less time assembling, more on judgment (NEVER headcount)
    shift: g.time ? `assembly ${Math.round(g.assemblyTime / g.time * 100)}% → judgment/decision ${Math.round((g.judgmentTime + g.decisionTime) / g.time * 100)}%` : "—",
  })).sort((a, b) => b.freedHrs - a.freedHrs);
  return { profile, confirmedCount: confirmed.length, skippedUnconfirmed: all.length - confirmed.length, roles,
    note: confirmed.length ? null : "No confirmed multi-actor units yet — confirm units on the Workbench to populate the role view." };
}

// F4 — recurring assembly steps grouped into capabilities (by verb / output shape); ranked by combined
// leverage; a build-once reuse factor (one build cost amortised across N workflows — the library moat at
// capability level). Confirmed-only.
const CAPABILITY_VERBS = [
  ["classify", /\b(classif|categor|triage|tag\b|label)/i],
  ["reconcile", /\b(reconcil|tie[- ]?out|match\b|compare)/i],
  ["extract", /\b(extract|gather|collect|retriev)/i],
  ["draft", /\b(draft|compose|narrat|write[- ]?up)/i],
  ["summarize", /\b(summar|digest|condens)/i],
  ["compute", /\b(comput|calculat|spread\b|model\b)/i],
  ["populate", /\b(populat|format|map\b|fill\b)/i],
  ["route", /\b(rout|allocat|assign|dispatch)/i],
  ["post", /\b(post\b|book\b|enter\b|record\b)/i],
];
function capabilitySignature(step) {
  const text = `${(step && step.step) || ""} ${(step && step.output) || ""}`;
  for (const [cap, re] of CAPABILITY_VERBS) if (re.test(text)) return cap;
  const w = String((step && step.step) || "").trim().toLowerCase().split(/\s+/)[0];
  return w || "misc";
}
export function buildCapabilityMap(records, opts = {}) {
  const profile = opts.profile || "Conservative";
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  const caps = new Map();
  confirmed.forEach(rec => {
    const r = normalizeIntake(rec);
    const totT = sum(r.steps.map(s => s.time)) || 1;
    const wf = rec.header?.anchor || rec.header?.persona || "workflow";
    r.steps.filter(s => s.cls === "assembly" || s.cls === "gather" || s.cls === "build").forEach(s => {
      const sig = capabilitySignature(s);
      if (!caps.has(sig)) caps.set(sig, { capability: sig, occurrences: [], workflows: new Set(), combinedLeverage: 0 });
      const c = caps.get(sig);
      c.occurrences.push({ workflow: wf, step: s.step });
      c.workflows.add(wf);
      c.combinedLeverage += stepPermitted(s, profile) * (s.time / totT);
    });
  });
  const capabilities = [...caps.values()].map(c => ({
    capability: c.capability, occurrenceCount: c.occurrences.length, reuseCount: c.workflows.size,
    workflows: [...c.workflows], occurrences: c.occurrences, combinedLeverage: round(c.combinedLeverage, 4),
    buildOnce: c.workflows.size >= 2, // build once, light up many workflows
  })).sort((a, b) => b.combinedLeverage - a.combinedLeverage);
  return { profile, confirmedCount: confirmed.length, capabilities,
    note: confirmed.length ? null : "No confirmed units yet — confirm units to surface shared capabilities." };
}

// the four-eyes doer-roles vs approver-roles of a workflow (where SoD lives) — used by adjacency.
function fourEyesRoles(rec) {
  const doerRoles = new Set(), approverRoles = new Set();
  (rec.steps || []).forEach(s => {
    const c = s.control; if (!c || (c.type !== "four-eyes" && c.type !== "segregation")) return;
    const d = stepPartActor(s, "doer"), a = stepPartActor(s, "approver");
    if (d) doerRoles.add(resolveActor(d, rec).role);
    if (a) approverRoles.add(resolveActor(a, rec).role);
  });
  return { doerRoles, approverRoles };
}
// F4 + A3 (M8) — STRICTER adjacency. A shared role/capability makes two confirmed workflows
// CANDIDATES, but they only ENABLE as one build when they are ALSO compatible on data tier, controls
// (four-eyes / SoD), CADENCE, and TOOLING / SOLUTION-SHAPE. A shared role alone is not enough — that
// looseness produced thousands of phantom clusters (~4,916 on the stress set). Incompatible candidates
// are NOT dropped: each is surfaced in `whyBlocked` with the dimension and reason (never-a-dead-end).
// `clusters` keeps the full candidate list tagged enabled | control-blocked (backward-compatible);
// `enabledClusters` is the small actionable set the looseness used to drown. A single workflow => none.
// B1 — GROUP the enabled pairwise edges into connected components (union-find), so the leader view
// shows a handful of actionable CLUSTERS, not hundreds of pairs. Each group = a set of workflows that
// transitively combine into one build; combinedFreedHrs sums the distinct members. Pure.
function groupEnabled(edges, freedByName) {
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const ensure = x => { if (!parent.has(x)) parent.set(x, x); };
  edges.forEach(e => { const [a, b] = e.workflows; ensure(a); ensure(b); parent.set(find(a), find(b)); });
  const byRoot = new Map();
  edges.forEach(e => { const root = find(e.workflows[0]); if (!byRoot.has(root)) byRoot.set(root, { members: new Set(), edges: 0 }); const g = byRoot.get(root); e.workflows.forEach(w => g.members.add(w)); g.edges += 1; });
  return [...byRoot.values()].map(g => {
    const workflows = [...g.members];
    return { workflows, size: workflows.length, edgeCount: g.edges,
      combinedFreedHrs: round(sum(workflows.map(w => freedByName.get(w) || 0)), 3),
      reason: `${workflows.length} workflows combine — build the capability once, reuse across the cluster (a less fragmented team); compatible on data, controls, cadence, tooling, shape, system class & entitlement.` };
  }).sort((a, b) => b.combinedFreedHrs - a.combinedFreedHrs);
}
export function buildAdjacency(records, opts = {}) {
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  if (confirmed.length < 2) {
    return { clusters: [], enabledClusters: [], enabledGroups: [], groupCount: 0, whyBlocked: [], enabledCount: 0, blockedCount: 0, candidateCount: 0, confirmedCount: confirmed.length,
      note: "Adjacency needs ≥2 confirmed workflows — thin at this breadth; it sharpens as the library grows." };
  }
  const lc = s => String(s || "").trim().toLowerCase();
  const meta = confirmed.map(rec => {
    const rc = roleCapacityByActor(rec, opts.profile || "Conservative", opts);
    return { rec, name: rec.header?.anchor || rec.header?.persona || "workflow",
      roles: new Set(rc.roles.map(r => r.role)),
      caps: new Set(buildCapabilityMap([rec], opts).capabilities.map(c => c.capability)),
      tier: maxTier(rec) || "internal", handoffs: detectHandoffs(rec).map(h => `${h.fromRole}>${h.toRole}`),
      cadence: lc(rec.trigger?.cadence),                                          // A3 — operational envelope
      tools: new Set(uniq((rec.steps || []).flatMap(s => (s.tool || "").split(/[,/]/))).map(lc)), // A3 — integration surface
      shapes: new Set((rec.steps || []).map(s => s.solutionShape).filter(Boolean)),                // A3 — solution shape
      systemClasses: new Set((rec.systems || []).map(s => s && s.class).filter(Boolean)),          // B1 — shared system archetype leg
      entGov: ["read", "write", "approve"][Math.max(1, ...(rec.steps || []).map(s => ENTITLEMENT_RANK[inferEntitlement(s)] || 1)) - 1], // B1 — governing entitlement profile leg
      fourEyes: fourEyesRoles(rec), freedHrs: rc.totalFreedHrs };
  });
  const inter = (a, b) => [...a].filter(x => b.has(x));
  const clusters = [];
  for (let i = 0; i < meta.length; i++) for (let j = i + 1; j < meta.length; j++) {
    const A = meta[i], B = meta[j];
    const sharedRoles = inter(A.roles, B.roles), sharedCaps = inter(A.caps, B.caps);
    const sharedHandoffs = A.handoffs.filter(h => B.handoffs.includes(h));
    if (!sharedRoles.length && !sharedCaps.length) continue; // not even a candidate — no false adjacency
    let status = "enabled", dimension = null;
    let reason = `shared ${sharedCaps.length ? `capability (${sharedCaps.join(", ")})` : `role (${sharedRoles.join(", ")})`} — and compatible on data, controls, cadence & tooling: build the capability once, reuse across both (a more capable, less fragmented team).`;
    const rankA = TIER_RANK[A.tier] ?? 1, rankB = TIER_RANK[B.tier] ?? 1;
    const sod = inter(A.fourEyes.doerRoles, B.fourEyes.approverRoles).concat(inter(A.fourEyes.approverRoles, B.fourEyes.doerRoles));
    // priority-ordered compatibility — the FIRST incompatible dimension is the why-blocked reason.
    if (A.tier !== B.tier && Math.max(rankA, rankB) >= TIER_RANK.confidential) {
      status = "control-blocked"; dimension = "data"; reason = `combining would cross a ${A.tier} ↔ ${B.tier} data boundary — raise the ceiling first (the control bounds the combine).`;
    } else if (sod.length) {
      status = "control-blocked"; dimension = "control"; reason = `combining would break the four-eyes — ${sod[0]} can't be both maker and checker (separation of duties).`;
    } else if (A.cadence && B.cadence && A.cadence !== B.cadence) {
      status = "control-blocked"; dimension = "cadence"; reason = `shared role/capability but different cadence (${A.cadence} vs ${B.cadence}) — a different operational envelope; sequence separately, don't co-build.`;
    } else if (A.tools.size && B.tools.size && !inter(A.tools, B.tools).length) {
      status = "control-blocked"; dimension = "tooling"; reason = `shared role/capability but no shared tooling (${[...A.tools].slice(0, 2).join("/")} vs ${[...B.tools].slice(0, 2).join("/")}) — a different integration surface, not a reuse.`;
    } else if (A.shapes.size && B.shapes.size && !inter(A.shapes, B.shapes).length) {
      status = "control-blocked"; dimension = "shape"; reason = `shared role/capability but a different solution shape (${[...A.shapes].join("/")} vs ${[...B.shapes].join("/")}) — the capability isn't one build.`;
    } else if (A.systemClasses.size && B.systemClasses.size && !inter(A.systemClasses, B.systemClasses).length) {
      // B1 — shared system CLASS is a truer combine signal than a shared role: different archetypes aren't one build.
      status = "control-blocked"; dimension = "system-class"; reason = `shared role/capability but no shared system class (${[...A.systemClasses].join("/")} vs ${[...B.systemClasses].join("/")}) — different system archetypes; not one build.`;
    } else if (A.entGov && B.entGov && A.entGov !== B.entGov) {
      // B1 — a shared role with a DIFFERENT entitlement profile is opposite access/risk; combining over-grants.
      status = "control-blocked"; dimension = "entitlement"; reason = `shared role/capability but a different entitlement profile (${A.entGov} vs ${B.entGov}) — opposite access/risk; combining would over-grant access. Keep them separate.`;
    }
    const entry = { workflows: [A.name, B.name], sharedRoles, sharedCapabilities: sharedCaps, sharedHandoffs, status, reason, combinedFreedHrs: round(A.freedHrs + B.freedHrs, 3) };
    if (dimension) entry.blockedDimension = dimension;
    clusters.push(entry);
  }
  clusters.sort((a, b) => b.combinedFreedHrs - a.combinedFreedHrs);
  const enabledClusters = clusters.filter(c => c.status === "enabled");
  const whyBlocked = clusters.filter(c => c.status !== "enabled");
  // B1 — the GROUPED view: connected components over the enabled pairs (the leader surface renders these).
  const enabledGroups = groupEnabled(enabledClusters, new Map(meta.map(m => [m.name, m.freedHrs])));
  return { clusters, enabledClusters, enabledGroups, groupCount: enabledGroups.length, whyBlocked,
    enabledCount: enabledClusters.length, blockedCount: whyBlocked.length, candidateCount: clusters.length, confirmedCount: confirmed.length,
    note: clusters.length
      ? `${enabledGroups.length} actionable cluster(s) (${enabledClusters.length} enabled pair(s) grouped); ${whyBlocked.length} candidate pair(s) blocked on data / controls / cadence / tooling / shape / system class / entitlement (surfaced as why-blocked, not dropped).`
      : "No adjacency yet — these confirmed workflows don't share a role or capability." };
}

// =====================================================================
// B2 · ECOSYSTEM & CONVERGENCE MAP — derived from the AGGREGATE across discoveries.
// Where adjacency asks "do two workflows combine into one build", the ecosystem map asks "which
// SYSTEMS does the whole portfolio converge on" — workflows linked by shared data source / system
// class / entitlement profile. The high-degree (bottleneck) systems are the integrate-once leverage:
// "N workflows across M departments depend on the same GL feed -> integrate once, unlock N." HONEST
// at any n (no hard floor): a single-n node is labelled DIRECTIONAL (one person's picture), sharper at
// n=20. Two audience projections: Leadership = the integrate-once economics; Tech & Governance = the
// dependency / single-point-of-failure / risk-concentration view. Confirmed-only; pure.
// =====================================================================
export function buildEcosystemMap(records, opts = {}) {
  const profile = opts.profile || "Conservative";
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  const nodes = new Map(); // node = a SYSTEM (class [+ dataSource]); the portfolio converges on these
  const freedByWf = new Map();
  confirmed.forEach(rec => {
    const wf = rec.header?.anchor || rec.header?.persona || "workflow";
    const dept = rec.header?.dept || "—";
    let entProfile = "read";
    try { entProfile = buildEntitlementRisk(rec, opts).profile.join("+") || "read"; } catch (_e) { /* additive: ignore */ }
    try { freedByWf.set(wf, roleCapacityByActor(rec, profile, opts).totalFreedHrs || 0); } catch (_e) { freedByWf.set(wf, 0); }
    (Array.isArray(rec.systems) ? rec.systems : []).forEach(sys => {
      if (!sys || !sys.class) return;
      const key = sys.class + (sys.dataSource ? `:${sys.dataSource}` : "");
      if (!nodes.has(key)) nodes.set(key, { key, systemClass: sys.class, dataSource: sys.dataSource || null, workflows: new Set(), departments: new Set(), entitlementProfiles: new Set(), reachability: new Set() });
      const n = nodes.get(key);
      n.workflows.add(wf); n.departments.add(dept); n.entitlementProfiles.add(entProfile);
      if (sys.reachability) n.reachability.add(sys.reachability);
    });
  });
  const systems = [...nodes.values()].map(n => {
    const workflows = [...n.workflows];
    return { key: n.key, systemClass: n.systemClass, dataSource: n.dataSource,
      workflowCount: workflows.length, departmentCount: n.departments.size,
      workflows, departments: [...n.departments], entitlementProfiles: [...n.entitlementProfiles], reachability: [...n.reachability],
      combinedFreedHrs: round(sum(workflows.map(w => freedByWf.get(w) || 0)), 3),
      bottleneck: workflows.length >= 2,        // depended on by 2+ workflows = a convergence point
      directional: workflows.length <= 1 };      // n=1 cell — one person's picture, not asserted
  }).sort((a, b) => b.workflowCount - a.workflowCount || b.departmentCount - a.departmentCount);
  return { confirmedCount: confirmed.length, systems, bottlenecks: systems.filter(s => s.bottleneck),
    directional: confirmed.length <= 1,
    note: systems.length
      ? (confirmed.length <= 1 ? "directional — one person's picture; the convergence sharpens across the library (n→20)" : null)
      : "No confirmed workflows carry a systems registry yet — the ecosystem map is empty (it derives from the aggregate)." };
}
// B2 — LEADERSHIP projection: the integrate-once economics. For each bottleneck system, "N workflows
// across M departments depend on it -> integrate once, unlock N", with the combined freed capacity.
export function buildEcosystemLeadership(records, opts = {}) {
  const eco = buildEcosystemMap(records, opts);
  const integrateOnce = eco.bottlenecks.map(b => ({
    system: b.dataSource || b.systemClass, systemClass: b.systemClass,
    workflowCount: b.workflowCount, departmentCount: b.departmentCount, combinedFreedHrs: b.combinedFreedHrs, directional: b.directional,
    headline: `${b.workflowCount} workflow${b.workflowCount === 1 ? "" : "s"} across ${b.departmentCount} department${b.departmentCount === 1 ? "" : "s"} depend on the ${b.dataSource || b.systemClass} — integrate once, unlock ${b.workflowCount}.${b.directional ? " (directional — one person's picture)" : ""}` }));
  return { lens: "leadership", confirmedCount: eco.confirmedCount, directional: eco.directional, integrateOnce, systems: eco.systems, note: eco.note,
    guardrail: "integrate-once is a leverage hypothesis — human-confirmed; never a reorg or headcount." };
}
// B2 — TECH & GOVERNANCE projection: the dependency / single-point-of-failure / risk-concentration
// view. A high-degree system is a SPOF: N workflows fail if it fails; screen-only reachability raises
// integration + continuity risk; a wide entitlement spread on one system is access-risk concentration.
export function buildEcosystemTechGov(records, opts = {}) {
  const eco = buildEcosystemMap(records, opts);
  const dependencies = eco.bottlenecks.map(b => ({
    system: b.dataSource || b.systemClass, systemClass: b.systemClass,
    workflowCount: b.workflowCount, departmentCount: b.departmentCount, reachability: b.reachability, entitlementProfiles: b.entitlementProfiles,
    singlePointOfFailure: b.workflowCount >= 2, directional: b.directional,
    risk: `${b.workflowCount} workflows depend on the ${b.dataSource || b.systemClass} — a single point of failure / risk concentration${b.reachability.includes("screen-only") ? "; screen-only (no API) raises integration + continuity risk" : ""}.${b.directional ? " (directional)" : ""}` }));
  return { lens: "tech-governance", confirmedCount: eco.confirmedCount, directional: eco.directional, dependencies, systems: eco.systems, note: eco.note,
    guardrail: "a dependency map is a risk view — it never asserts a single-n cell; it sharpens across the library." };
}

// F8 — cross-role hand-off reduction (a leader org-tier number). A hand-off is where the doer changes;
// AI carrying the assembly collapses the swivel-chair hand-offs INTO pure-assembly steps, while the
// human-held gates + controls STAY. baseline = every cross-role hand-off; remaining = the hand-offs into a
// human-held (judgment/decision) step or across a control (protected). Confirmed-only. Fewer swivel-chair
// hand-offs => faster flow + less op-risk. (Reshape language; never headcount.)
export function buildHandoffReduction(records) {
  const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
  let baseline = 0, remaining = 0;
  confirmed.forEach(rec => {
    const r = normalizeIntake(rec);
    detectHandoffs(rec).forEach(h => {
      baseline += 1;
      const toStep = r.steps[h.index];
      if (toStep && (toStep.cls === "judgment" || toStep.cls === "decision" || toStep.control)) remaining += 1;
    });
  });
  return { baseline, remaining, collapsed: baseline - remaining, confirmedCount: confirmed.length,
    guardrail: "the human-held gates and controls stay; only swivel-chair hand-offs into assembly collapse" };
}

// A5 — the CROSS-SYSTEM handoff seams of a workflow (seam.handoff present). Each = the systems bridged
// + the trigger; `protected` when the seam is high-criticality (a control gate, not mechanical toil).
export function seamHandoffs(record) {
  const seams = Array.isArray(record?.seams) ? record.seams : [];
  return seams.filter(s => s && s.handoff && (Array.isArray(s.handoff.bridges) || s.handoff.trigger != null))
    .map(s => ({
      bridges: Array.isArray(s.handoff.bridges) && s.handoff.bridges.length ? s.handoff.bridges : [s.from, s.to].filter(Boolean),
      trigger: s.handoff.trigger || null,
      friction: s.friction || "medium", crit: s.crit || "low",
      protected: s.crit === "high",       // a high-criticality handoff is a hidden control — never compressed to zero
      note: s.note || null,
    }));
}
// A5 — the SWIVEL-CHAIR leverage number, derived from the cross-system handoff seams. The relievable
// swivel-chair count is the mechanical re-entry AI collapses into assembly; the PROTECTED handoffs
// (high-criticality control gates) are never compressed to zero. Honest at n=1 (directional). Counts the
// captured handoff seams (not gated on confirmed — a single capture still surfaces its swivel-chair).
export function buildSwivelChairRelief(records, opts = {}) {
  const list = Array.isArray(records) ? records : [records];
  const all = list.flatMap(r => seamHandoffs(r));
  const relievable = all.filter(h => !h.protected);
  const protectedHandoffs = all.filter(h => h.protected);
  const byTrigger = {}; relievable.forEach(h => { if (h.trigger) byTrigger[h.trigger] = (byTrigger[h.trigger] || 0) + 1; });
  const confirmedCount = list.filter(isConfirmed).length;
  return {
    handoffSeams: all.length,
    swivelChairRelieved: relievable.length,       // the swivel-chair leverage number (mechanical re-entry collapsed)
    protectedHandoffs: protectedHandoffs.length,  // control gates — never compressed to zero
    byTrigger, confirmedCount, directional: confirmedCount <= 1,
    guardrail: "swivel-chair re-entry collapses into assembly; the protected control handoffs stay (never compressed to zero)",
    note: all.length ? (confirmedCount <= 1 ? "directional — one person's picture; sharpens across the library" : null) : "No cross-system handoff seams captured — the swivel-chair number is 0." };
}

// F8 — risk / SLA dividend (the recon-SOP lens). For ops workflows, freed capacity is headroom for the
// backlog (fewer aged items / SLA breaches). HONEST: expressed as freed hours / role-weeks paired with its
// guardrail; the per-item aged/breach count is a LABELED placeholder until volume + SLA telemetry is
// supplied (never fabricated). Confirmed-only.
export function buildSlaDividend(records, opts = {}) {
  const rv = buildRoleView(records, opts);
  const H = opts.weeklyHours ?? CONFIG.weeklyHours;
  const freedHrs = round(sum(rv.roles.map(r => r.freedHrs)), 2);
  return { freedHrs, freedRoleWeeks: round(freedHrs / H, 2), confirmedCount: rv.confirmedCount,
    agedItemsAvoided: null, slaBreachesAvoided: null, // labeled placeholders — need volume/SLA telemetry; never fabricated
    note: "freed capacity is headroom for the backlog — fewer aged items / SLA breaches once volume telemetry is supplied",
    guardrail: "pair every efficiency metric with its quality guardrail; the protected human decisions are unchanged" };
}

// =====================================================================
// 5.6 · EDITION 3 — INTERPRETATION RUBRIC, EXECUTABLE (F5 — the layer above the engine)
// The engine trusts the consultant's tags completely; it cannot catch a bad one. This encodes the
// rubric's decision RULES so a wrong tag fails CI. classifyUtterance(sme_says) returns the rubric's
// classification; the eval set asserts it never produces a dangerous_wrong (a decision/judgment step
// labeled assembly, an un-split combined step, a high-criticality seam scored low, an auto-resolvable
// halt). CONSERVATIVE — round UP: when unsure, keep more with the human (assembly < judgment < decision).
// =====================================================================

// commit-the-firm / accountability verbs -> decision (highest). "decide if/whether" commits; so does the send.
// NOTE: stems anchor with a LEADING \b only (so "approv" matches "approve/approval/approved"); a trailing \b
// would block the suffix. "commit" keeps a trailing \b so it does not match "committee".
const RUBRIC_DECISION_RE = /\b(?:approv|declin|sign[\s-]?off|signs?\s+off|authori[sz]e|waiv|escalat|commit(?:s|ted|ting)?\b|deploy|releas|merg|remediat|put\s+in\s+whether|present(?:s|ing)?\s+to\s+(?:the\s+)?committee)/i;
const RUBRIC_PUSH_PROD_RE = /\bpush(?:es|ed|ing)?\b[^.]*\b(prod|production|live)\b/i;
const RUBRIC_SEND_FINAL_RE = /\bsend(?:s|ing)?\b[^.]*\b(final|memo|client|customer|as final)\b|\bsend it on\b/i;
const RUBRIC_DECIDE_COMMIT_RE = /\bdecide\s+(?:if|whether)\b|\bdecide\b[^.]*\b(?:page|incident|escalat)/i;
// needs a person's read -> judgment. "decide/choose WHICH/WHAT" is a read (not a firm-commit).
const RUBRIC_JUDGMENT_RE = /\b(?:assess|interpret|weigh|evaluat|prioriti[sz]e|judge|decid(?:e|ing)\s+wh(?:ich|at)|choose\s+(?:wh|the\s+relevant|relevant)|select\s+(?:wh|the\s+relevant|relevant)|which\s+\w+\s+(?:are|is)\s+relevant|figure\s+out\s+wh|understand\s+the\s+(?:request|ask|situation|case)|techniques?\s+to\s+use|where\s+the\s+art\s+is)/i;
// rule-following, same inputs -> same output -> gather or build (AI can carry it, with a spot-check).
const RUBRIC_ASSEMBLY_RE = /\b(?:pull|gather|extract|\bmap\b|format|populat|reconcil|comput|calculat|work(?:s|ed|ing)?\s+out|draft|classif|categor|collect|retriev|summari[sz]e|correlat|spread|search|dig\s+in|tie[\s-]?out|review|book|post)/i;
// P4 A1 — within RUBRIC_ASSEMBLY_RE, read/retrieve verbs → gather; transform/compute verbs → build.
const RUBRIC_GATHER_RE = /\b(?:pull|gather|collect|retriev|search|dig\s+in|extract)\b/i;

export function rubricStepClass(text) {
  const t = String(text || "");
  if (RUBRIC_DECISION_RE.test(t) || RUBRIC_PUSH_PROD_RE.test(t) || RUBRIC_SEND_FINAL_RE.test(t) || RUBRIC_DECIDE_COMMIT_RE.test(t)) return "decision";
  if (RUBRIC_JUDGMENT_RE.test(t)) return "judgment";
  if (RUBRIC_ASSEMBLY_RE.test(t)) return RUBRIC_GATHER_RE.test(t) ? "gather" : "build";
  return "judgment"; // round UP when unsure — never silently assembly
}
const rubricHasVerb = (t) => RUBRIC_DECISION_RE.test(t) || RUBRIC_PUSH_PROD_RE.test(t) || RUBRIC_SEND_FINAL_RE.test(t) || RUBRIC_DECIDE_COMMIT_RE.test(t) || RUBRIC_JUDGMENT_RE.test(t) || RUBRIC_ASSEMBLY_RE.test(t);

// Split a combined utterance into atomic acts; a step that bundles assembly with a judgment/decision is
// TWO steps (so AI carries the assembly and the human keeps the call). Returns split + per-act classes.
export function rubricClassify(utterance) {
  const t = String(utterance || "");
  const clauses = t.split(/\b(?:and then|and|then)\b|[,;.]/i).map(s => s.trim()).filter(s => s.length > 2);
  const acts = clauses.map(c => ({ text: c, cls: rubricStepClass(c) })).filter(a => rubricHasVerb(a.text));
  const classes = new Set(acts.map(a => a.cls));
  const isAI = cls => cls === "gather" || cls === "build" || cls === "assembly";
  const split = acts.length >= 2 && acts.some(a => isAI(a.cls)) && (classes.has("judgment") || classes.has("decision"));
  const overall = classes.has("decision") ? "decision" : classes.has("judgment") ? "judgment" : (acts.some(a => isAI(a.cls)) ? acts.find(a => isAI(a.cls)).cls : rubricStepClass(t));
  return { split, steps: split ? acts.map(a => ({ text: a.text, cls: a.cls })) : [{ text: t, cls: overall }], cls: overall,
    // a facilitation/template step's output is deliberately incomplete — AI must NOT pre-fill the answer.
    aiMustNotPrefill: /facilitat|deliberately incomplete|live during|template with headers|populate it live|not coming with it|fill(?:s|ing)?\s+in\s+the\s+answer/i.test(t) };
}

// data tier — the HIGHEST the step actually touches; round UP. Personal identifiers -> PII; market-moving
// -> MNPI; non-public business/borrower -> confidential; else internal/public.
export function rubricDataTier(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(ssn|social security|passport|date of birth|home address|personally? identif|named individual|account numbers?)\b/.test(t)) return "PII";
  if (/\b(mnpi|material non[\s-]?public|inside information|insider|unannounced deal|pending merger)\b/.test(t)) return "MNPI";
  if (/\b(financ(?:ials?|e)|borrower|client\b|revenue|earnings|forecast|spread|covenant|salary|tax returns?|confidential|non[\s-]?public)\b/.test(t)) return "confidential";
  if (/\b(internal|operational|ticket|\blog)\b/.test(t)) return "internal";
  if (/\b(public|published|press release)\b/.test(t)) return "public";
  return null;
}
// theo % — honest, never 100 for gather/build (setup, exceptions, verification keep headroom: ~65–80%).
export function rubricTheoRange(cls) {
  if (cls === "gather" || cls === "build" || cls === "assembly") return [65, 80];
  if (cls === "judgment") return [20, 40];
  if (cls === "human_held") return [0, 0];
  return [5, 15];
}
// seam friction — mechanical toil only (re-key/swivel/manual). "one click" is LOW friction.
export function rubricSeamFriction(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(re-?key|rekey|swivel|copy[\s-]?paste|manual|retype|by hand|reformat)\b/.test(t)) return "high";
  if (/\b(one click|single click|automatic|a click)\b/.test(t)) return "low";
  return "medium";
}
// seam criticality — from CONSEQUENCE, never from ease. A flag/hand-off into a decision/officer/credit is HIGH.
// (Leading-\b stems only, so "approv" matches "approval"; a trailing \b would block the suffix.)
export function rubricSeamCriticality(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(?:flag|escalat|officer|approv|credit|sign[\s-]?off|committee|decision|breach|aml|\brisk|compliance|four-eyes)/.test(t)) return "high";
  if (/\b(?:review|check|verify|reconcil)/.test(t)) return "medium";
  return "low";
}
// waitKind — the wait around a human DECISION is protected (never compress to zero); routine queue is reducible.
export function rubricWaitKind(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(committee|approval|sign[\s-]?off|deliberat|board|decision|review meeting|hearing)\b/.test(t)) return "protected";
  return "reducible";
}
export function rubricWaits(text) {
  const segs = String(text || "").split(/[,;]|\bthen\b/i).map(s => s.trim()).filter(Boolean);
  return segs.filter(s => /\b(wait|sits|queue|pending|few days|a day|committee|deliberat)\b/i.test(s)).map(s => ({ what: s, waitKind: rubricWaitKind(s) }));
}
// acceptance/escalation source — inferred when the SME didn't state it (the consultant filled it in).
export function rubricAcceptanceSource(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(never states?|assumes?|consultant (?:fills|assumes)|inferred|i'?d guess|probably|typical(?:ly)?)\b/.test(t)) return "inferred";
  return "stated";
}

// Phase 3 (A4) — entitlement, read UP (read < write < approve). approve/sign-off/authorize/waive ->
// approve; a write-in-place into a system (post/write/book/key/enter/amend in/overwrite) -> write; else
// read. Same system, opposite work: under-reading a write/approve as a read is the v3 dangerous error.
export function rubricEntitlement(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(approv|sign[\s-]?off|signs?\s+(?:it|them|off)|authori[sz]e|waiv|countersign)\b/.test(t)) return "approve";
  if (/\b(post(?:ed|s|ing)?\s+(?:it\s+|the\s+\w+\s+)?(?:to|into)|writ(?:e|ing|es)\s+(?:it\s+|the\s+\w+\s+)?(?:to|into|in)\b|book(?:ed|ing)?\s+the\s+entry|key(?:ed|ing)?\s+(?:it\s+)?(?:in|into)|enter(?:ed|ing)?\s+(?:it\s+)?(?:in|into)|amend\w*\b[^.]*\bin\b|overwrit|updat\w*\b[^.]*\bin\s+place)\b/.test(t)) return "write";
  return "read";
}
// Phase 3 (A3) — action verb, coherent with the entitlement (write -> write-in-place, approve -> approve).
export function rubricActionVerb(text) {
  const ent = rubricEntitlement(text);
  if (ent === "approve") return "approve";
  if (ent === "write") return "write-in-place";
  const t = String(text || "").toLowerCase();
  if (/\b(notif\w*|send(?:s|ing)?\s+(?:a\s+)?(?:reminder|notification|alert|email))\b/.test(t)) return "notify";
  if (/\b(generat\w*|draft\w*|produc\w*\s+(?:the\s+)?output)\b/.test(t)) return "generate-output";
  if (/\b(download\w*|export\w*)\b/.test(t)) return "download";
  if (/\b(transform|reformat|reconcil\w*|normali[sz]\w*)\b/.test(t)) return "transform";
  return "read";
}
// Phase 3 (A2) — reachability of the system the step touches; bounds the realistic solution shape.
export function rubricReachability(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(screen[\s-]?only|no api|without an? api|by hand|on the screen|manual portal|copy\s+from\s+the\s+screen|screen[\s-]?scrap\w*|scrape|\brpa\b)\b/.test(t)) return "screen-only";
  if (/\b(batch|overnight (?:file|run)|file[\s-]?drop|sftp|nightly file)\b/.test(t)) return "batch";
  if (/\b(api|webhook|endpoint)\b/.test(t)) return "api";
  return null;
}
// Phase 3 (A2) — a screen-only system cannot honestly be agentic; its realistic shape is human-in-loop.
export function rubricRealisticShape(text) {
  return rubricReachability(text) === "screen-only" ? "human-in-loop" : null;
}
// Phase 3 (Section 2) — system != work. A shared system NAME alone is never evidence two workflows
// combine — the truer signals are shared action + data + access. null when no combine claim is made;
// false when a combine claim rests on a shared system/app without those; true only with all three.
export function rubricCombinable(text) {
  const t = String(text || "").toLowerCase();
  const claimsCombine = /\b(combin\w*|merg\w*|same build|one build|same recipe|one recipe|same workflow|do them together|build (?:it )?once for both)\b/.test(t);
  if (!claimsCombine) return null;
  const sharedAction = /\bsame (?:action|task|work|verb|step)\b/.test(t);
  const sharedData = /\bsame (?:data|records?|dataset|feed|source)\b/.test(t);
  const sharedAccess = /\bsame (?:access|entitlement|permission|approval)\b/.test(t);
  return (sharedAction && sharedData && sharedAccess) ? true : false;
}

// classifyUtterance — the rubric's full read of one SME utterance. The eval set runs each case through
// this and asserts the dangerous_wrong never occurs (gating). This IS the rubric, executable.
export function classifyUtterance(text) {
  const c = rubricClassify(text);
  const entitlement = rubricEntitlement(text);
  const dataTier = rubricDataTier(text);
  // A4 — the high-value, human-held core: elevated write/approve access on sensitive (>= confidential)
  // data. Reading it as low-value because the access wasn't captured mis-prices both value and risk.
  const highValue = (entitlement === "write" || entitlement === "approve") && (TIER_RANK[dataTier] ?? 0) >= TIER_RANK.confidential;
  return { ...c, dataTier, theoRange: rubricTheoRange(c.cls),
    seamFriction: rubricSeamFriction(text), seamCriticality: rubricSeamCriticality(text),
    waits: rubricWaits(text), acceptanceSource: rubricAcceptanceSource(text),
    // Phase 3 — the v3 rubric reads (additive; the existing fields above are unchanged):
    action: rubricActionVerb(text), entitlement, reachability: rubricReachability(text),
    realisticShape: rubricRealisticShape(text), highValue, combinable: rubricCombinable(text) };
}

// F5 (render) — the eval traps as inline warnings on a Discovery capture string. null when no trap fires.
// Worker-safe (no economics/headcount): nudges the consultant to split/round-up, never tells them an answer.
export function discoveryRubricHint(text) {
  const t = String(text || "").toLowerCase();
  if (/\bjust\s+(sign[\s-]?off|approv)/.test(t)) return "'just sign off' usually hides a decision — split the sign-off (the person) from the prep (AI)?";
  if (RUBRIC_SEND_FINAL_RE.test(t)) return "the send is the commit — AI drafts, the person sends. Tag the send as a decision?";
  if (/\bdraft\b[^.]*\b(recommend|waiv|whether)\b/.test(t)) return "two things in one step — split the draft (AI) from the call (the person)?";
  if (/\b(pull|gather|review)\b[^.]*\b(decide|choose|page|approv|merge)\b/.test(t)) return "this bundles assembly with a decision — split them so AI carries the gather and the person keeps the call?";
  if (/\bbasically do the whole\b|\bcould (?:basically )?do (?:it|the whole)\b/.test(t)) return "even strong assembly keeps headroom (~65–80%) — setup, exceptions and verification stay with the person.";
  if (/\bone click\b/.test(t)) return "one click ≠ low stakes — score how bad it is if it's wrong from the consequence, not the ease.";
  return null;
}

// =====================================================================
// B1 · DISCOVERY — clean-capture helpers: combined-step split flag + contradiction queue.
// Pure + additive. The capture surface calls these so the consultant SPLITS combined steps and
// RECONCILES contradictions at capture, instead of hardening a fiction. Same eval-gated rubric the
// rest of the app trusts (rubricClassify / stepDecisionLanguage) — no parallel classifier.
// =====================================================================

// B1 — flag a captured step whose utterance bundles assembly with a judgment/decision act
// ("draft and approve" -> draft (AI) + approve (the person)). combined:false for a single-act step.
export function flagCombinedStep(text) {
  const rc = rubricClassify(text);
  return {
    combined: rc.split === true,
    acts: rc.steps.map(a => ({ text: String(a.text || "").trim(), cls: a.cls })),
    overall: rc.cls,
    // A1 — which boundary (rule 0) the combined step crosses: a CLASS change is the boundary that
    // forces a split (assembly bundled with a judgment/decision). null when the step is single-act.
    boundary: rc.split ? "class-change" : null,
    suggestion: rc.split
      ? `Split into ${rc.steps.length} steps: ${rc.steps.map(a => `"${String(a.text || "").trim()}" (${a.cls})`).join(" + ")}. AI carries the gather/build step; the person keeps the judgment/decision.`
      : null,
  };
}

// A1 — THE UNIT-OF-WORK RULE (rubric Section 0), encoded so the engine and the capture surface
// agree on where one step ends and the next begins. A STEP is one CLASS of work (assembly /
// judgment / decision), by one PERSON, that may span SEVERAL SYSTEMS at once — ending at the FIRST
// of: (a) the class changes · (b) the person changes · (c) the work waits on a signal. Two
// corollaries the engine enforces elsewhere: switching systems is NOT a boundary (stepSystems +
// Option-A counting), and a DECISION is ALWAYS its own step (stepPermitted clamps it to 0, and a
// combined utterance carrying a decision splits the decision out). Pure data — additive.
export const STEP_RULE = {
  unit: "one class of work, by one person, spanning any number of systems at once",
  boundaries: ["class-change", "person-change", "wait-on-signal"],
  notABoundary: ["system-switch"],
  always: "a decision is its own step",
  counting: "Option A — capacity counts to the step as a whole; systems are recorded as involved, never given a split share",
};

// A1 — apply the step rule to a CAPTURED step: a step whose utterance bundles assembly with a
// judgment/decision act is TWO (or more) atomic steps — so AI carries the assembly and the person
// keeps the call (a decision is always carved out). Builds the atomic steps off the parent (its
// data tier / systems / action ride along; per-act time is left UNSET so normalizeIntake fills it
// by class — we never invent a split share). A single-act step round-trips as one step unchanged
// (additive). The text used is the step's own label/utterance, falling back to step.step.
export function splitCombinedStep(step) {
  const text = String((step && (step.utterance ?? step.step)) || "");
  const f = flagCombinedStep(text);
  if (!f.combined) return { combined: false, boundary: null, steps: [step] };
  const base = (step && typeof step === "object") ? step : {};
  const steps = f.acts.map(a => {
    const { utterance, time, ...carry } = base;       // drop the parent's combined label + shared time
    return { ...carry, step: a.text, cls: a.cls };    // per-act class; time re-inferred by class
  });
  return { combined: true, boundary: f.boundary, steps };
}

// B1 — the live CONTRADICTION QUEUE. Surfaces captured signals that conflict so they are reconciled at
// capture, never hardened. Each entry is a {kind, a, b, detail} pair (the two conflicting signals + why).
// Empty array when the capture is internally consistent (additive — no false conflicts).
export function detectContradictions(record) {
  const r = record || {};
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const out = [];
  // 1) class vs language — a step tagged assembly/judgment whose text commits the firm (the B2 rubric)
  steps.forEach(s => {
    if (stepDecisionLanguage(s)) out.push({ kind: "class-vs-language",
      a: { field: "class", step: s.step, value: s.cls }, b: { field: "text", step: s.step, value: s.step },
      detail: `"${s.step || "this step"}" reads as a decision/commitment but is tagged "${s.cls}" — split the prep (AI) from the call (the person), or confirm the class.` });
  });
  // 2) declared sensitivity vs what a step actually touches (the higher tier governs)
  const declared = r.confirm?.dataTier;
  if (declared && TIER_RANK[declared] != null) {
    steps.forEach(s => {
      if (s.data && TIER_RANK[s.data] != null && TIER_RANK[s.data] > TIER_RANK[declared]) {
        out.push({ kind: "sensitivity",
          a: { field: "confirm.dataTier", value: declared }, b: { field: "data", step: s.step, value: s.data },
          detail: `the workflow is classified "${declared}" but "${s.step}" touches "${s.data}" — the higher tier governs; reconcile the classification before scoring.` });
      }
    });
  }
  // 3) acceptance/escalation requires a human sign-off, but every captured step is assembly (no human-held step)
  const acc = `${r.confirm?.acceptance || ""} ${r.confirm?.escalation || ""}`.toLowerCase();
  const needsHuman = /\b(sign[\s-]?off|reviewer|approv|four-eyes|human review|escalat)\b/.test(acc);
  const hasHumanHeld = steps.some(s => s.cls === "judgment" || s.cls === "decision");
  if (needsHuman && steps.length && !hasHumanHeld) {
    out.push({ kind: "review-vs-steps",
      a: { field: "confirm.acceptance", value: r.confirm?.acceptance || r.confirm?.escalation }, b: { field: "steps", value: "every step tagged assembly" },
      detail: "acceptance/escalation requires a human sign-off, but every captured step is tagged assembly — add the human-held review/decision step it implies." });
  }
  return out;
}

// =====================================================================
// 6 · RAIL (Change 4) — surface-aware, deterministic, gating
// =====================================================================
export const RAIL = {
  // denied on EVERY surface (reduction / headcount / displacement framing). NOTE: "fte" moved to a
  // WORD-BOUNDED bannedPattern below — the bare substring also matched innocent words (softer,
  // drafter, lifted). "FTE"/"F.T.E" are still banned everywhere via that pattern.
  banned: ["headcount", "reduce headcount", "cut staff", "eliminate roles", "hours saved", "hours-saved", "lay off", "layoff", "replace the", "downsize"],
  // M7 — denied on EVERY surface, matched as WORD-BOUNDED patterns over NORMALIZED text so the
  // spaced / hyphenated / synonym / risk-phrase variants the audit slipped past are caught too.
  // Separators are flexible ([\s-]*) so "headcount" / "head count" / "head-count" all match; word
  // boundaries keep innocent text safe (e.g. "ahead counting" does NOT match "head count").
  bannedPatterns: [
    /\bhead[\s-]*counts?\b/,                                  // headcount / head count / head-count
    /\bf[\s.\-]*t[\s.\-]*e[\s.\-]*s?\b/,                      // FTE / F.T.E / F T E (word-bounded; not "softer")
    /\b(?:reduc\w*|cut\w*|trim\w*|shrink\w*)\s+(?:the\s+)?(?:head[\s-]*count|workforce|staff|teams?|roles?)\b/,
    /\b(?:head[\s-]*count|workforce|staff|role|job)[\s-]*(?:reduc\w*|cuts?|eliminat\w*)\b/,
    /\bwork[\s-]*force\s+(?:reduc\w*|optimi[sz]\w*|rationali[sz]\w*)\b/,
    /\broles?\s+eliminat\w*\b/, /\beliminat\w*\s+(?:the\s+)?roles?\b/,
    /\bhours?[\s-]*saved\b/, /\bsaved\s+hours?\b/, /\btime[\s-]*saved\b/,
    /\blay[\s-]*offs?\b/, /\bdown[\s-]*siz\w*\b/, /\bright[\s-]*siz\w*\b/,
    /\bredundanc\w*\b/, /\bjob[\s-]*cuts?\b/, /\breduction[\s-]+in[\s-]+force\b/,
    /\battrition\s+target\w*\b/, /\bredeploy\s+(?:the\s+)?staff\b/,
  ],
  // allowed ONLY on dashboard
  capacityFamily: ["capacity", "consolidation", "reinvestment", "capacity planning"],
  // allowed on recipe + dashboard (engineering economics)
  costFamily: ["cost-to-serve", "cost to serve", "net value", "net capacity", "token cost", "inference cost", "model tier", "frontier tier", "small tier", "mid tier"],
  // allowed on workbench + recipe; kept off capture
  leverage: ["leverage"],
};

// M7 — homoglyph confusables (the common Cyrillic / Greek look-alikes) folded to their Latin
// equivalent, so "hеadcount" (Cyrillic е) can't slip past. en-US worker surfaces only — folding
// to Latin is correct here.
const RAIL_CONFUSABLES = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "ѕ": "s", "і": "i", "ј": "j", "к": "k", "һ": "h", "ԁ": "d", "ο": "o", "α": "a", "ι": "i", "κ": "k", "ρ": "p", "ν": "v", "ɡ": "g", "ł": "l", "ᴄ": "c" };

// M7 — normalize text before the rail reads it: NFKC (fold full-width / compatibility forms), strip
// zero-width + soft-hyphen, fold the dash family to '-', fold unicode spaces to ' ', fold homoglyphs,
// lowercase, collapse whitespace. Strictly widens what the existing banned list catches (never less).
export function normalizeRailText(s) {
  let t = String(s == null ? "" : s);
  try { t = t.normalize("NFKC"); } catch (_e) { /* keep raw on the rare normalize failure */ }
  t = t
    .replace(/[​‌‍⁠﻿­]/g, "")                 // zero-width + soft hyphen -> remove
    .replace(/[‐‑‒–—―−]/g, "-")          // dash / non-breaking-hyphen family -> '-'
    .replace(/[  -   　]/g, " ")               // unicode spaces -> ' '
    .replace(/[Ѐ-ӿͰ-Ͽɐ-ʯᴀ-ᵿԀ-ԯ]/g, (ch) => RAIL_CONFUSABLES[ch] || ch)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

export function railCheck(text, surface) {
  // Edition 3 (F2) — ONE rail, two modes. Passed a record (an object with steps), railCheck runs the
  // CONTROL-AWARE structural gating checks; passed a string, it runs the surface-aware vocabulary rail.
  if (text && typeof text === "object" && Array.isArray(text.steps)) return controlRail(text, surface);
  try {
    const t = normalizeRailText(text), v = [];
    RAIL.banned.forEach(w => { if (t.includes(w)) v.push({ term: w, rule: "banned-everywhere" }); });
    RAIL.bannedPatterns.forEach(re => { const m = t.match(re); if (m) v.push({ term: m[0], rule: "banned-everywhere" }); });
    if (surface !== "dashboard") RAIL.capacityFamily.forEach(w => { if (new RegExp(`\\b${w}\\b`).test(t)) v.push({ term: w, rule: "capacity-dashboard-only" }); });
    if (!["recipe", "dashboard"].includes(surface)) RAIL.costFamily.forEach(w => { if (t.includes(w)) v.push({ term: w, rule: "cost-recipe+dashboard-only" }); });
    if (surface === "capture") RAIL.leverage.forEach(w => { if (new RegExp(`\\b${w}\\b`).test(t)) v.push({ term: w, rule: "leverage-not-on-capture" }); });
    return { ok: v.length === 0, violations: v };
  } catch (_e) {
    // M7 — FAIL CLOSED: if the rail itself can't run, never report ok (a worker surface must not
    // render un-checked vocabulary just because the checker threw).
    return { ok: false, violations: [{ term: "", rule: "rail-error", detail: "the worker-safe rail could not run — failing closed (M7)" }], railError: true };
  }
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

// D2 (Phase 2) — the rail extends to the COLLECTIVE / aggregate surfaces (the leadership + collective
// heatmap text), the highest-risk place for "leverage" to drift into "headcount reduction". Runs the
// Phase-1 hardened rail (normalize Unicode + tokenize + synonym/risk phrases) over EVERY aggregate
// string and FAILS CLOSED: if any string carries banned vocab, or the rail itself can't run, ok=false
// so the surface refuses to render un-checked aggregate text. Reshape framing only; never headcount.
export function railGuardCollective(texts, surface = "dashboard") {
  const list = Array.isArray(texts) ? texts : [texts];
  const violations = [];
  let railError = false;
  for (const t of list) {
    let r;
    try { r = railCheck(t, surface); } catch (_e) { railError = true; continue; } // fail closed on a throw
    if (r && r.railError) railError = true;
    if (r && !r.ok) violations.push({ text: typeof t === "string" ? String(t).slice(0, 80) : "", violations: r.violations });
  }
  return { ok: violations.length === 0 && !railError, violations, railError,
    detail: railError ? "the collective-view rail could not run — failing closed (D2)" : (violations.length ? "banned vocabulary on the collective surface — blocked (D2)" : "") };
}

// F6 — the confirm/harden gate, now CONTROL-AWARE. A unit hardens only when it is confirmed (recap +
// every required field) AND its controls pass the rail (four-eyes distinct, authority names a human
// approver, halt not auto-resolved). This EXTENDS the no-bypass boundary (isConfirmed/assertHardenable)
// — nothing hardens unconfirmed, and now nothing hardens with a broken control. Returns the blockers
// (empty => hardenable), each a human-readable reason for the Workbench confirm affordance.
// M1 — PER-FIELD PROVENANCE: a required quantitative value that is ENTIRELY inferred (no SME
// ever stated it) cannot harden. The headline capacity weights every step by its time, so if
// not a single step carries a stated time the numbers rest on class defaults alone — that is a
// draft, not a defensible figure. Surfaced as a blocker so the consultant captures one real time.
export function provenanceBlockers(record) {
  const steps = Array.isArray(record?.steps) ? record.steps : [];
  if (!steps.length) return [];
  const out = [];
  const statedTime = steps.some(s => s && typeof s.time === "number" && Number.isFinite(s.time) && s.time >= 0);
  if (!statedTime) out.push({ rule: "all-inferred-time", detail: "no step has a stated effort/time — the capacity rests entirely on class defaults; capture at least one observed time before hardening" });
  return out;
}

// B2 — one blocker per step whose declared class contradicts its decision/commitment text.
// Surfaced at the Workbench confirm affordance so the consultant must split or override.
export function decisionMislabelBlockers(record) {
  const steps = Array.isArray(record?.steps) ? record.steps : [];
  return steps.filter(stepDecisionLanguage).map(s => ({
    rule: "class-mismatch-decision", step: s.step || "step",
    detail: `"${s.step || "this step"}" uses decision/authority/approval language but is tagged "${s.cls}". Split the prep (AI) from the call (the person), or supply an explicit override rationale — AI must never harden a decision.`,
  }));
}
export function confirmBlockers(record) {
  const blockers = [];
  if (record?.recap?.confirmed !== true) blockers.push({ rule: "not-confirmed", detail: "the unit hasn't been confirmed on the Workbench" });
  const cov = validateIntake(record);
  cov.coverage.gaps.forEach(g => blockers.push({ rule: "incomplete", field: g, detail: `still needed before confirm: ${g}` }));
  cov.errors.forEach(e => blockers.push({ rule: "invalid", detail: e }));
  controlRail(record).violations.forEach(v => blockers.push({ rule: v.rule, step: v.step, detail: v.detail }));
  decisionMislabelBlockers(record).forEach(b => blockers.push(b)); // B2 — semantic class check
  provenanceBlockers(record).forEach(b => blockers.push(b));       // M1 — no all-inferred key value
  return blockers;
}
export function canHarden(record) { return confirmBlockers(record).length === 0; }

// =====================================================================
// B2 (Phase 2) — ADVERSARIAL CONFIRM + the PROTECTED-BY-DESIGN artifact.
// The confirm gate stops trusting the capture and actively tries to break it: four skeptical flags
// raised BEFORE hardening. All four reuse Phase-1 primitives (decisionMislabelBlockers / the
// per-field provenance / controlRail) — no parallel checker. The protected-by-design artifact is the
// confirmed list of decision steps + high-criticality seams marked human-held (the deck's "feature,
// not a limitation"), reusing the semantic class check + the readiness gate matrix.
// =====================================================================

// map a controlRail violation rule to its adversarial flag category.
function controlFlagKind(rule) {
  if (/four-eyes-distinct|ai-no-self-approve|segregation/.test(rule)) return "mixes-maker-checker";
  if (/named|escalation-target|human-approver|halt-human-target|authority-rule-missing/.test(rule)) return "control-owner-missing";
  return "control";
}
export function adversarialConfirmFlags(record) {
  const r = record || {};
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const nr = normalizeIntake(r);
  const flags = [];
  // (1) "these words imply a decision" — a step tagged assembly/judgment whose text commits the firm
  decisionMislabelBlockers(r).forEach(b => flags.push({ kind: "implies-decision", step: b.step, detail: b.detail }));
  // (2) "this value is inferred" — a relied-on number resting on a class default, not a stated value
  nr.steps.forEach((s, i) => {
    const which = [s._timeProv === "inferred" ? "effort/time" : null, s._theoProv === "inferred" ? "addressability" : null].filter(Boolean);
    if (which.length) flags.push({ kind: "inferred-value", step: (steps[i] && steps[i].step) || s.step, detail: `${which.join(" + ")} is inferred (class default), not stated — confirm it or capture the real value before it hardens.` });
  });
  provenanceBlockers(r).forEach(b => flags.push({ kind: "inferred-value", detail: b.detail }));
  // (3) "this control owner is missing" + (4) "this step mixes maker and checker" — from the control rail
  controlRail(r).violations.forEach(v => flags.push({ kind: controlFlagKind(v.rule), step: v.step, rule: v.rule, detail: v.detail }));
  const byKind = flags.reduce((m, f) => { (m[f.kind] = m[f.kind] || []).push(f); return m; }, {});
  return { flags, byKind, count: flags.length,
    kinds: { impliesDecision: (byKind["implies-decision"] || []).length, inferredValue: (byKind["inferred-value"] || []).length,
      controlOwnerMissing: (byKind["control-owner-missing"] || []).length, mixesMakerChecker: (byKind["mixes-maker-checker"] || []).length } };
}

// B2 — the PROTECTED-BY-DESIGN artifact: every decision step (by class OR by committing language) and
// every high-criticality seam, marked human-held and "never decomposed to AI". One record or many.
export function buildProtectedByDesign(records) {
  const list = Array.isArray(records) ? records : [records];
  const items = [];
  list.filter(Boolean).forEach(rec => {
    const r = normalizeIntake(rec);
    const wf = rec.header?.anchor || rec.header?.persona || "workflow";
    (r.steps || []).forEach(s => {
      if (s.cls === "decision" || stepDecisionLanguage(s)) {
        // the readiness matrix's data/control gates describe WHY it stays human; we keep it minimal here.
        items.push({ workflow: wf, kind: "decision-step", item: s.step, humanHeld: true,
          why: s.cls === "decision" ? "a decision — AI must never own it (it commits the firm)" : "decision/commitment language — the call stays with the person; split the prep (AI) from the decision" });
      }
    });
    (r.seams || []).filter(s => s.crit === "high").forEach(s => {
      items.push({ workflow: wf, kind: "high-criticality-seam", item: `${s.from || "?"} → ${s.to || "?"}`, humanHeld: true,
        why: `high-criticality seam${s.note ? `: ${s.note}` : ""} — do not compress past the human gate` });
    });
  });
  return { items, count: items.length,
    note: items.length ? "Protected by design — marked at the Workbench, never decomposed to AI. For a regulated firm this list is a feature, not a limitation." : "No decision steps or high-criticality seams captured yet." };
}

// =====================================================================
// GOLDEN FIXTURE + SELF-TEST  (run: node studio_engine.mjs)
// =====================================================================
export const FPA_INTAKE = {
  header: { persona: "FP&A analyst", dept: "Finance", anchor: "Last monthly forecast refresh & variance pack", lifecycle: "confirmed" },
  trigger: { trigger: "month-end close completes", cadence: "monthly", volume: "~12/yr" },
  steps: [
    { step: "Collect & consolidate", cls: "gather", data: "confidential", time: 18, theo: 85, touch: 90, wait: 0, waitKind: "reducible", inputs: "GL extract", output: "consolidated actuals", consumer: "self", tool: "ERP, Excel" },
    { step: "Reconcile & validate", cls: "build", data: "confidential", time: 16, theo: 70, touch: 120, wait: 240, waitKind: "reducible", inputs: "sub-ledger vs GL", output: "reconciled figures", consumer: "self", tool: "ERP, Excel" },
    { step: "Build & refresh models", cls: "build", data: "confidential", time: 14, theo: 55, touch: 90, wait: 0, waitKind: "reducible", inputs: "actuals, drivers", output: "updated model", consumer: "self", tool: "Excel" },
    { step: "Variance analysis", cls: "judgment", data: "confidential", time: 14, theo: 30, touch: 60, wait: 0, waitKind: "reducible", inputs: "actuals vs forecast", output: "explained variances", consumer: "reviewer", tool: "Excel" },
    { step: "Draft commentary", cls: "build", data: "confidential", time: 16, theo: 60, touch: 60, wait: 480, waitKind: "reducible", inputs: "variances", output: "narrative", consumer: "reporting manager", tool: "Excel, Word" },
    { step: "Forecast updates", cls: "build", data: "confidential", time: 12, theo: 50, touch: 45, wait: 2880, waitKind: "protected", inputs: "revised assumptions", output: "updated forecast", consumer: "leadership", tool: "Excel" },
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
    { step: "Allocate exception", cls: "build", data: "internal", time: 10, theo: 80, touch: 30, wait: 60, waitKind: "reducible",
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
    { step: "Post adjustment", cls: "build", data: "confidential", time: 14, theo: 75, touch: 30, wait: 0, waitKind: "reducible",
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

// A1 — the recon "Classify and open" first step, as the SME actually says it: it bundles a JUDGMENT
// (read whether it's a real break or a timing difference) with an ASSEMBLY (pull the file and open
// the case). By the step rule it is TWO steps, not one. splitCombinedStep(RECON_S1_COMBINED) carves
// the human-held read away from the mechanical open, so AI can carry the open while the person keeps
// the call. The canonical RECON_INTAKE seed is left byte-identical; this is the worked split example
// (and the shape D1's stress recon carries pre-split).
export const RECON_S1_COMBINED = {
  step: "Classify and open",
  utterance: "Assess whether it's a real break or a timing difference and pull the case file to open it",
  cls: "judgment", data: "confidential", tool: "case manager, ERP",
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
  ok("gross ~$20,778", near(cap.grossValue, 20778, 30), round(cap.grossValue)); // M3 — decision ceiling 0 (was ~$20,849 at 5%)

  // cost-to-serve + net
  const routed = costToServe(normalizeIntake(FPA_INTAKE).steps, "Conservative", "routed");
  const frontier = costToServe(normalizeIntake(FPA_INTAKE).steps, "Conservative", "frontier");
  ok("routed cost ~$161", near(routed.annual, 161, 8), round(routed.annual));
  ok("frontier cost ~$1,583", near(frontier.annual, 1583, 25), round(frontier.annual));
  ok("net routed ~$20,617", near(netValue(cap.grossValue, routed.annual), 20617, 30), round(netValue(cap.grossValue, routed.annual))); // M3 — decision ceiling 0

  // A2 — RUN-COST vs TCO as two separate lenses; both bands; shape drives TCO + payback
  {
    const wf = (shape) => ({ ...FPA_INTAKE, steps: FPA_INTAKE.steps.map(s => (s.cls === "gather" || s.cls === "build" || s.cls === "assembly") ? { ...s, solutionShape: shape } : s) });
    const tProm = buildTco(wf("prompt"), { instances: 18 }), tAgent = buildTco(wf("agentic"), { instances: 18 });
    ok("A2 run-cost and TCO are separate", tProm.runCost.point !== tProm.tco.firstYear.point && tProm.tco.buildOneTime.point > 0, "");
    ok("A2 agentic TCO build >> prompt TCO build", tAgent.tco.buildOneTime.point > tProm.tco.buildOneTime.point * 3, `${tAgent.tco.buildOneTime.point} vs ${tProm.tco.buildOneTime.point}`);
    ok("A2 agentic payback longer than prompt", tAgent.payback.highYears > tProm.payback.highYears, `${tAgent.payback.highYears} vs ${tProm.payback.highYears}`);
    ok("A2 each cost is a band (low<point<high)", tAgent.runCost.low < tAgent.runCost.high && tAgent.tco.firstYear.low < tAgent.tco.firstYear.high, "");
    ok("A2 net realized value still run-cost only (unchanged at instances=1)", near(buildTco(wf("prompt")).netRunCost, round(netValue(roleCapacity(normalizeIntake(wf("prompt")).steps, "Conservative").grossValue, costToServe(normalizeIntake(wf("prompt")).steps, "Conservative", "routed").annual)), 1), "");
    // even when run-cost is forced similar (low-volume), TCO still diverges by shape — the whole point
    const tiny = (shape) => buildTco({ ...FPA_INTAKE, steps: [{ step: "reconcile", cls: "assembly", data: "internal", time: 1, theo: 80, solutionShape: shape }], recap: { confirmed: true } });
    const dRun = Math.abs(tiny("agentic").runCost.point - tiny("prompt").runCost.point);
    const dTco = tiny("agentic").tco.buildOneTime.point - tiny("prompt").tco.buildOneTime.point;
    ok("A2 TCO gap exceeds run-cost gap (TCO is the lens that reveals build/maintain)", dTco > dRun, `dTco=${dTco} dRun=${round(dRun, 2)}`);
  }

  // readiness states
  ok("net-negative -> gated-economics", readiness({ theoPct: .5, permittedPct: .5, grossValue: 1000, annualCost: 4000 }).state === "gated-economics", "");
  ok("policy-capped -> gated-policy", readiness({ theoPct: .8, permittedPct: .4, grossValue: 50000, annualCost: 200 }).state === "gated-policy", "");
  ok("clean -> now", readiness({ theoPct: .5, permittedPct: .5, grossValue: 50000, annualCost: 200 }).state === "now", "");

  // A1 — SOLUTION SHAPE drives cost / eval / readiness; absent shape is byte-identical
  {
    const oneStep = (shape) => [{ step: "Reconcile two feeds", cls: "assembly", data: "internal", time: 100, theo: 80, ...(shape ? { solutionShape: shape } : {}) }];
    const cPrompt = costToServe(normalizeIntake({ steps: oneStep("prompt") }).steps, "Conservative", "routed").annual;
    const cAgentic = costToServe(normalizeIntake({ steps: oneStep("agentic") }).steps, "Conservative", "routed").annual;
    const cAbsent = costToServe(normalizeIntake({ steps: oneStep(null) }).steps, "Conservative", "routed").annual;
    ok("A1 prompt much cheaper than agentic", cAgentic > cPrompt * 5, `${round(cAgentic)} vs ${round(cPrompt)}`);
    ok("A1 absent == agentic (global multiplier preserved)", near(cAbsent, cAgentic, 0.01), `${round(cAbsent, 2)} vs ${round(cAgentic, 2)}`);
    ok("A1 deterministic-tool skips the loop multiplier", near(costToServe(normalizeIntake({ steps: oneStep("deterministic-tool") }).steps, "Conservative", "routed").annual, cPrompt, 0.01), "");
    // eval / evidence requirement differs by shape
    ok("A1 agentic demands an eval harness; prompt does not", shapeRequirements("agentic").requiredEvidence.length > 0 && shapeRequirements("prompt").requiredEvidence.length === 0, "");
    ok("A1 agentic eval effort heavier than prompt", SHAPE_EFFORT_RANK[shapeRequirements("agentic").evalEffort] > SHAPE_EFFORT_RANK[shapeRequirements("prompt").evalEffort], "");
    // readiness moves to evidence-gated when an agentic shape's evidence is missing
    const gAgentic = readinessGates({ theoPct: .5, permittedPct: .5, grossValue: 50000, annualCost: 200, shapeEvidenceMissing: ["eval harness (golden set + thresholds)"], solutionShape: "agentic" });
    ok("A1 missing shape evidence -> evidence gate blocked", gAgentic.gates.evidence.status === "blocked" && gAgentic.blocked.includes("evidence"), gAgentic.gates.evidence.status);
    // schema: unknown shape surfaced, valid shape accepted, absent unchanged
    ok("A1 unknown shape flagged", !validateIntake({ ...FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "internal", solutionShape: "magic" }] }).ok, "");
    ok("A1 valid shape accepted", validateIntake({ ...FPA_INTAKE, steps: FPA_INTAKE.steps.map((s, i) => i === 0 ? { ...s, solutionShape: "agentic" } : s) }).ok, "");
    // byte-identical guarantee: an unshaped spec/recipe carries no shape fields
    ok("A1 unshaped spec has no shapeProfile", buildDraftSpec(FPA_INTAKE)._shapeProfile === undefined, "");
    ok("A1 unshaped recipe has no shapeProfile", buildDraftRecipe(FPA_INTAKE).shapeProfile === undefined, "");
    ok("A1 shaped recipe carries the shape on its ranked unit", (() => {
      const rec = buildDraftRecipe({ ...FPA_INTAKE, steps: FPA_INTAKE.steps.map((s, i) => i === 0 ? { ...s, solutionShape: "agentic" } : s) });
      return rec.shapeProfile && rec.shapeProfile.hasAgentic && rec.rankedUnits.some(u => u.solutionShape === "agentic");
    })(), "");
  }

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

  // ---- Edition 3 \u00b7 F4 \u2014 derived leader layer: role \u00b7 capability \u00b7 adjacency ----
  const RECON2 = { ...RECON_INTAKE, header: { ...RECON_INTAKE.header, anchor: "Payment investigations (SOP-0117)" } };
  // role view \u2014 confirmed-only, freed per role across all the role's workflows, the assembly->judgment shift
  const rv = buildRoleView([RECON_INTAKE, RECON2, { ...RECON_INTAKE, recap: { confirmed: false } }]);
  ok("F4 role view is confirmed-only (drops the unconfirmed unit)", rv.confirmedCount === 2 && rv.skippedUnconfirmed === 1, `${rv.confirmedCount}/${rv.skippedUnconfirmed}`);
  ok("F4 role view sums freed across both workflows (Ops Analyst = 2x single)", (() => { const one = roleCapacityByActor(RECON_INTAKE).roles.find(r => r.role === "Ops Analyst").freedHrs; const both = rv.roles.find(r => r.role === "Ops Analyst").freedHrs; return near(both, 2 * one, 0.01); })(), "");
  ok("F4 role view reports freedFTE + the assembly->judgment shift, never headcount", (() => { const a = rv.roles.find(r => r.role === "Ops Analyst"); return a.freedFTE > 0 && /assembly .* judgment/.test(a.shift); })(), "");
  // (the rail bans the literal "fte"/"headcount" everywhere — F8 renders freedFTE as a role-week, never the banned token)
  ok("F4 leader capacity language passes the dashboard rail, fails on a worker surface", railCheck("freed capacity this quarter", "dashboard").ok && !railCheck("freed capacity this quarter", "workbench").ok, "");
  ok("F4 the literal 'FTE' token is banned everywhere (so the render must phrase it as a role-week)", !railCheck("0.6 FTE freed", "dashboard").ok, "");
  // capability map \u2014 group a shared assembly capability across >=2 workflows, ranked by leverage, build-once
  const cm = buildCapabilityMap([RECON_INTAKE, RECON2]);
  ok("F4 capability map groups a shared assembly capability across 2 workflows (buildOnce)", cm.capabilities.some(c => c.reuseCount === 2 && c.buildOnce), JSON.stringify(cm.capabilities.map(c => `${c.capability}:${c.reuseCount}`)));
  ok("F4 capability map is ranked by combined leverage desc", cm.capabilities.every((c, i, a) => i === 0 || a[i - 1].combinedLeverage >= c.combinedLeverage), "");
  // adjacency \u2014 single => none; shared => enabled; data boundary / SoD => control-blocked with a reason
  ok("F4 a single workflow yields NO adjacency (no false clusters)", buildAdjacency([RECON_INTAKE]).clusters.length === 0, "");
  ok("F4 thin adjacency returns a labeled placeholder", /needs \u22652 confirmed/.test(buildAdjacency([RECON_INTAKE]).note || ""), "");
  ok("F4 two workflows sharing role/capability cluster as ENABLED", buildAdjacency([RECON_INTAKE, RECON2]).clusters.some(c => c.status === "enabled" && c.sharedCapabilities.length), "");
  const PAY_MNPI = { ...RECON2, steps: RECON2.steps.map(s => ({ ...s, data: s.data === "confidential" ? "MNPI" : s.data })) };
  ok("F4 a data-tier boundary combine is CONTROL-BLOCKED with a reason", buildAdjacency([RECON_INTAKE, PAY_MNPI]).clusters.some(c => c.status === "control-blocked" && /data boundary/.test(c.reason)), "");
  const SOD = { ...RECON_INTAKE, header: { ...RECON_INTAKE.header, anchor: "QA second review (SOP-9)" }, steps: [
    { step: "Allocate QA case", cls: "assembly", data: "internal", time: 20, theo: 80, participants: [{ actorId: "maker", part: "doer" }] },
    { step: "QA approve", cls: "decision", data: "confidential", time: 10, theo: 10, participants: [{ actorId: "checker", part: "doer" }, { actorId: "opsManager", part: "approver" }], control: { type: "four-eyes", distinct: ["doer", "approver"] } },
  ] };
  ok("F4 a four-eyes/SoD collision is CONTROL-BLOCKED with a reason", buildAdjacency([RECON_INTAKE, SOD]).clusters.some(c => c.status === "control-blocked" && /four-eyes|separation of duties/.test(c.reason)), JSON.stringify(buildAdjacency([RECON_INTAKE, SOD]).clusters.map(c => `${c.status}:${c.reason}`)));
  ok("F4 the derived layer never emits headcount/cut vocabulary", [JSON.stringify(rv), JSON.stringify(cm), JSON.stringify(buildAdjacency([RECON_INTAKE, PAY_MNPI]))].every(s => !/headcount|cut staff|lay ?off|eliminate role|reduce role/i.test(s)), "");

  // A3 — STRICTER adjacency: shared role alone is not enough; the loose count collapses to a handful
  {
    // 100 confirmed clones of the recon SOP, all sharing the SAME roles + capabilities (so EVERY pair
    // is a loose candidate ~ C(100,2)=4950). Only 8 "twin" pairs are fully compatible (a unique shared
    // cadence); everyone else differs in cadence => why-blocked, never dropped.
    const N = 100, base = RECON_INTAKE;
    const stress = Array.from({ length: N }, (_, i) => {
      const bucket = i < 16 ? Math.floor(i / 2) : 1000 + i;       // 8 twin-pairs (0..15) + uniques
      return { ...base, header: { ...base.header, anchor: `STRESS-${i}` }, trigger: { ...base.trigger, cadence: `cad-${bucket}` } };
    });
    const adj = buildAdjacency(stress);
    const loose = adj.candidateCount; // pairs sharing role/capability under the OLD rule
    ok("A3 loose candidate count is in the thousands (the ~4,916 problem)", loose > 4000, loose);
    ok("A3 enabled clusters collapse to a handful (<=25)", adj.enabledCount <= 25 && adj.enabledCount > 0, adj.enabledCount);
    ok("A3 enabled is exactly the 8 compatible twin-pairs", adj.enabledCount === 8, adj.enabledCount);
    ok("A3 nothing dropped — enabled + blocked = all loose candidates", adj.enabledCount + adj.blockedCount === loose, `${adj.enabledCount}+${adj.blockedCount} vs ${loose}`);
    ok("A3 every blocked pair names its dimension + reason", adj.whyBlocked.every(c => c.blockedDimension && c.reason), "");
    // two workflows sharing ONLY a role but differing in data tier do NOT cluster
    const roleA = { ...FPA_INTAKE, header: { ...FPA_INTAKE.header, persona: "Analyst", anchor: "A-internal" }, steps: FPA_INTAKE.steps.map(s => ({ ...s, data: "internal" })), confirm: { ...FPA_INTAKE.confirm, dataTier: "internal" } };
    const roleB = { ...FPA_INTAKE, header: { ...FPA_INTAKE.header, persona: "Analyst", anchor: "B-mnpi" }, steps: FPA_INTAKE.steps.map(s => ({ ...s, data: "MNPI" })) };
    const adj2 = buildAdjacency([roleA, roleB]);
    ok("A3 role-only + different tier => NOT enabled (surfaced in why-blocked on data)", adj2.enabledCount === 0 && adj2.whyBlocked.some(c => c.blockedDimension === "data"), JSON.stringify(adj2.whyBlocked.map(c => c.blockedDimension)));

    // B1 — GROUPED clusters (connected components over enabled pairs) + the two new compatibility legs
    ok("B1 the enabled pairs GROUP into connected components (a handful, not raw pairs)", adj.groupCount === 8 && adj.enabledGroups.length === 8, `${adj.groupCount}`);
    ok("B1 each twin group has the two compatible workflows", adj.enabledGroups.every(g => g.size === 2 && g.workflows.length === 2), JSON.stringify(adj.enabledGroups.map(g => g.size)));
    ok("B1 a fully-compatible pair forms ONE group of two", (() => { const a = buildAdjacency([RECON_INTAKE, { ...RECON_INTAKE, header: { ...RECON_INTAKE.header, anchor: "recon-2" } }]); return a.groupCount === 1 && a.enabledGroups[0].size === 2; })(), "");
    // shared role but DIFFERENT system class => not a combine (why-blocked on system-class)
    const sysGL = { ...RECON_INTAKE, header: { ...RECON_INTAKE.header, anchor: "recon-GL" }, systems: [{ id: "gl", class: "ledger/GL", reachability: "batch" }] };
    const sysCRM = { ...RECON_INTAKE, header: { ...RECON_INTAKE.header, anchor: "recon-CRM" }, systems: [{ id: "crm", class: "CRM", reachability: "api" }] };
    const adjSys = buildAdjacency([sysGL, sysCRM]);
    ok("B1 a shared role with a different SYSTEM CLASS does not combine (why-blocked on system-class)", adjSys.enabledCount === 0 && adjSys.whyBlocked.some(c => c.blockedDimension === "system-class"), JSON.stringify(adjSys.whyBlocked.map(c => c.blockedDimension)));
    // shared role but DIFFERENT entitlement profile => not a combine (why-blocked on entitlement)
    const entBase = (anchor, ent) => ({ ...FPA_INTAKE, header: { ...FPA_INTAKE.header, persona: "Analyst", anchor }, steps: FPA_INTAKE.steps.map(s => ({ ...s, entitlement: ent })) });
    const adjEnt = buildAdjacency([entBase("ent-read", "read"), entBase("ent-approve", "approve")]);
    ok("B1 a shared role with a different ENTITLEMENT profile does not combine (why-blocked on entitlement)", adjEnt.enabledCount === 0 && adjEnt.whyBlocked.some(c => c.blockedDimension === "entitlement"), JSON.stringify(adjEnt.whyBlocked.map(c => c.blockedDimension)));
    ok("B1 enabled + blocked still = all candidates (nothing dropped by the new legs)", adjSys.enabledCount + adjSys.blockedCount === adjSys.candidateCount, "");
  }

  // B2 — ecosystem & convergence map: bottleneck systems + honest at n=1 + two audience projections
  {
    const glSys = { id: "gl", name: "Oracle GL", class: "ledger/GL", reachability: "screen-only", dataSource: "GL feed" };
    const wfWith = (anchor, dept) => ({ ...RECON_INTAKE, header: { ...RECON_INTAKE.header, anchor, dept }, systems: [glSys], steps: RECON_INTAKE.steps.map((s, i) => i === 1 ? { ...s, systems: ["gl"] } : s) });
    const a = wfWith("recon-A", "CIB Operations"), b = wfWith("recon-B", "CIB Operations"), c = wfWith("recon-C", "Finance");
    const eco = buildEcosystemMap([a, b, c]);
    ok("B2 a system shared by several workflows surfaces as a convergence/bottleneck with its count", eco.bottlenecks.some(s => s.systemClass === "ledger/GL" && s.workflowCount === 3 && s.departmentCount === 2), JSON.stringify(eco.bottlenecks.map(s => `${s.systemClass}:${s.workflowCount}/${s.departmentCount}`)));
    ok("B2 a single-n cell is labelled DIRECTIONAL, not asserted", buildEcosystemMap([a]).systems[0].directional === true && buildEcosystemMap([a]).directional === true, "");
    ok("B2 a single-n system is NOT a bottleneck (no false convergence)", buildEcosystemMap([a]).bottlenecks.length === 0, "");
    // leadership projection — the integrate-once economics
    const lead = buildEcosystemLeadership([a, b, c]);
    ok("B2 Leadership: integrate-once headline names N workflows across M departments -> unlock N", lead.integrateOnce[0] && /3 workflows across 2 departments/.test(lead.integrateOnce[0].headline) && /integrate once, unlock 3/.test(lead.integrateOnce[0].headline), JSON.stringify(lead.integrateOnce[0] || {}));
    ok("B2 Leadership: the integrate-once node carries combined freed capacity", lead.integrateOnce[0].combinedFreedHrs >= 0, "");
    // tech & governance projection — dependency / SPOF / risk concentration
    const tg = buildEcosystemTechGov([a, b, c]);
    ok("B2 Tech&Gov: the shared system is a single point of failure", tg.dependencies[0] && tg.dependencies[0].singlePointOfFailure === true, "");
    ok("B2 Tech&Gov: a screen-only dependency raises the integration/continuity risk", /screen-only/.test(tg.dependencies[0].risk), tg.dependencies[0].risk);
    ok("B2 honest at n=1: the tech-gov map is directional, never asserted", buildEcosystemTechGov([a]).directional === true, "");
    ok("B2 additive: a workflow with no systems registry yields an empty ecosystem map", buildEcosystemMap([RECON_INTAKE]).systems.length === 0, "");
  }

  // A4 — two-tier store: the pooled de-identify pass strips PII/MNPI/names/free-text; derived layer runs over the pool
  {
    const dirty = { ...FPA_INTAKE,
      header: { ...FPA_INTAKE.header, anchor: "Acme Corp Q3 close SECRET" },
      steps: FPA_INTAKE.steps.map((s, i) => i === 0 ? { ...s, data: "PII", inputs: "John Smith SSN 123-45-6789", output: "acct 9988", tool: "AcmeSecretTool" } : s),
      judgment: { ...FPA_INTAKE.judgment, human: "approve waiver for client X PROPRIETARY" },
      confirm: { ...FPA_INTAKE.confirm, acceptance: "reconciles SECRETSAUCE", dataTier: "MNPI" } };
    const pooled = deIdentify(dirty);
    const json = JSON.stringify(pooled);
    const leaks = ["Acme Corp", "SECRET", "John Smith", "123-45-6789", "9988", "AcmeSecretTool", "client X", "SECRETSAUCE", "PROPRIETARY"].filter(s => json.includes(s));
    ok("A4 pooled record leaks NO PII/MNPI/name/proprietary free-text", leaks.length === 0, JSON.stringify(leaks));
    ok("A4 pooled record never holds a literal PII/MNPI tier value (generalized to restricted)", !/"(PII|MNPI)"/.test(json), "");
    ok("A4 pooled record keeps the de-identified shape (class/tier/capability/metrics)", pooled.steps[0].cls === "gather" && pooled.steps[0].data === "restricted" && !!pooled.steps[0].capability && pooled.steps[0].time === 18, JSON.stringify(pooled.steps[0]));
    ok("A4 pooled record still passes isConfirmed (placeholders, not sensitive)", isConfirmed(pooled), "");
    const two = splitDiscoveryTiers(dirty);
    ok("A4 split writes both tiers (full engagement + de-identified pooled)", two.engagement === dirty && two.pooled.deIdentified === true, "");
    const pool = buildPooledLibrary([dirty, RECON_INTAKE]);
    ok("A4 derived layer aggregates over the POOLED library (role/capability/leader)", buildRoleView(pool).confirmedCount === 2 && buildCapabilityMap(pool).confirmedCount === 2 && buildLeaderView(pool).confirmedCount === 2, "");
    ok("A4 the whole pooled library carries no literal PII/MNPI value", !/"(PII|MNPI)"/.test(JSON.stringify(pool)), "");
  }

  // A1 — the unit-of-work step rule: combined-step split + Option-A multi-system counting
  {
    ok("A1 STEP_RULE names the three boundaries and the system-switch non-boundary", STEP_RULE.boundaries.length === 3 && STEP_RULE.notABoundary.includes("system-switch") && /decision/.test(STEP_RULE.always), JSON.stringify(STEP_RULE));
    ok("A1 'draft and approve' flags a required split on a class-change boundary", (() => { const f = flagCombinedStep("draft and approve the memo"); return f.combined === true && f.boundary === "class-change"; })(), "");
    // recon s1 ("Classify and open") is TWO steps by the rule — a human-held read carved from the open
    const s1 = splitCombinedStep(RECON_S1_COMBINED);
    ok("A1 recon s1 'Classify and open' splits into two steps", s1.combined === true && s1.steps.length === 2, `${s1.combined}/${s1.steps.length}`);
    ok("A1 recon s1 split keeps a human-held read + a carried gather/build", s1.steps.some(x => x.cls === "judgment") && s1.steps.some(x => x.cls === "gather" || x.cls === "build" || x.cls === "assembly"), JSON.stringify(s1.steps.map(x => x.cls)));
    ok("A1 a single-act step is NOT split (round-trips as one)", splitCombinedStep({ step: "Reconcile the two ledgers", cls: "assembly", data: "internal" }).combined === false, "");
    // Option-A: a one-class step touching three systems stays ONE step; capacity is NOT divided per system
    const oneSys = [{ step: "Pull and reconcile feeds", cls: "assembly", data: "internal", time: 100, theo: 80, tool: "ERP" }];
    const threeSys = [{ step: "Pull and reconcile feeds", cls: "assembly", data: "internal", time: 100, theo: 80, tool: "ERP, SharePoint, recon engine" }];
    ok("A1 a multi-system step records 3 systems involved", stepSystems(threeSys[0]).length === 3, JSON.stringify(stepSystems(threeSys[0])));
    ok("A1 capacity counts to the step as a whole — not divided per system", roleCapacity(normalizeIntake({ steps: threeSys }).steps, "Conservative").grossValue === roleCapacity(normalizeIntake({ steps: oneSys }).steps, "Conservative").grossValue, "");
    ok("A1 cost-to-serve is the step's, not split per system", costToServe(normalizeIntake({ steps: threeSys }).steps, "Conservative", "routed").annual === costToServe(normalizeIntake({ steps: oneSys }).steps, "Conservative", "routed").annual, "");
    ok("A1 explicit systems[] refs are read without dividing capacity", stepSystems({ systems: [{ ref: "sysA" }, { ref: "sysB" }] }).length === 2, "");
  }

  // A2 — systems registry + reachability: the screen-only cap + the TCO integration line + the pooled strip
  {
    const reconScreen = { ...RECON_INTAKE,
      systems: [{ id: "caseMgr", name: "CIB Case Manager", class: "recon-engine", reachability: "screen-only", dataSource: "exception queue" },
                { id: "erp", name: "Oracle GL", class: "ledger/GL", reachability: "batch", dataSource: "GL extract" }],
      steps: RECON_INTAKE.steps.map((s, i) => i === 1 ? { ...s, systems: ["caseMgr", "erp"] } : s) };
    ok("A2 the archetype taxonomy covers every system class", SYSTEM_CLASSES.every(c => SYSTEM_ARCHETYPES[c] && SYSTEM_ARCHETYPES[c].integrationDifficulty), "");
    ok("A2 a screen-only system caps the realistic shape at human-in-loop", cappedSolutionShape({ solutionShape: "agentic", systems: ["caseMgr"] }, reconScreen).realistic === "human-in-loop", "");
    ok("A2 the cap is flagged when an agentic plan was declared on a screen-only system", cappedSolutionShape({ solutionShape: "agentic", systems: ["caseMgr"] }, reconScreen).capped === true, "");
    ok("A2 a batch/api system imposes NO shape cap", cappedSolutionShape({ solutionShape: "agentic", systems: ["erp"] }, reconScreen).capped === false, "");
    // a screen-only system adds an integration line to TCO (and raises the one-time build)
    const tScreen = buildTco(reconScreen), tBase = buildTco(RECON_INTAKE);
    ok("A2 a screen-only system adds a TCO integration line", tScreen.tco.components.screenOnlyIntegration > 0, JSON.stringify(tScreen.tco.components));
    ok("A2 the screen-only integration raises one-time build above the un-systemed TCO", tScreen.tco.buildOneTime.point > tBase.tco.buildOneTime.point, `${tScreen.tco.buildOneTime.point} vs ${tBase.tco.buildOneTime.point}`);
    ok("A2 an un-systemed workflow's TCO has NO screen-only line (byte-identical)", tBase.tco.components.screenOnlyIntegration === undefined, JSON.stringify(tBase.tco.components));
    // the pooled record keeps only class/traits — never the vendor name
    const pooled = deIdentify(reconScreen);
    ok("A2 the pooled record contains NO vendor system name", !JSON.stringify(pooled).includes("CIB Case Manager") && !JSON.stringify(pooled).includes("Oracle GL"), "");
    ok("A2 the pooled systems registry keeps class + reachability traits", pooled.systems.every(s => SYSTEM_CLASSES.includes(s.class) && REACHABILITY.includes(s.reachability) && !s.name), JSON.stringify(pooled.systems));
    ok("A2 the pooled step references system CLASSES, not vendor ids", pooled.steps[1].systemClasses.includes("recon-engine"), JSON.stringify(pooled.steps[1].systemClasses));
    // enum integrity surfaced at intake; the valid record passes
    ok("A2 an unknown system class is surfaced at intake", !validateIntake({ ...RECON_INTAKE, systems: [{ id: "x", class: "made-up", reachability: "api" }] }).ok, "");
    ok("A2 an unknown reachability is surfaced at intake", !validateIntake({ ...RECON_INTAKE, systems: [{ id: "x", class: "CRM", reachability: "telepathy" }] }).ok, "");
    ok("A2 an unresolved step system ref is surfaced at intake", !validateIntake({ ...RECON_INTAKE, systems: [{ id: "erp", class: "ledger/GL", reachability: "batch" }], steps: RECON_INTAKE.steps.map((s, i) => i === 0 ? { ...s, systems: ["ghost"] } : s) }).ok, "");
    ok("A2 a well-formed systems registry validates clean", validateIntake(reconScreen).ok, JSON.stringify(validateIntake(reconScreen).errors));
  }

  // A3 — the action-on-data verb drives controls + automatability (same system + tier, opposite work)
  {
    const base = { step: "Reconcile the two feeds", cls: "assembly", data: "confidential", theo: 80, time: 100 };
    // control requirements differ by verb
    ok("A3 read and write-in-place carry DIFFERENT controls", JSON.stringify(actionProfile("read").controls) !== JSON.stringify(actionProfile("write-in-place").controls), "");
    ok("A3 read is high automatability; write-in-place is low", actionProfile("read").automatability === "high" && actionProfile("write-in-place").automatability === "low", "");
    ok("A3 approve is human-held", actionProfile("approve").humanHeld === true && actionProfile("approve").automatability === "human-held", "");
    // automatability is REAL: in the same class/tier, read carries more than a controlled write
    ok("A3 read carries more permitted automation than write-in-place (same tier)", stepPermitted({ ...base, action: "read" }, "Conservative") > stepPermitted({ ...base, action: "write-in-place" }, "Conservative"), "");
    ok("A3 an approve action earns ZERO permitted automation (the commit stays human)", stepPermitted({ ...base, action: "approve" }, "Conservative") === 0, "");
    // additive: an absent action behaves exactly like read (factor 1) — un-tagged steps byte-identical
    ok("A3 absent action == read (no cap) -> byte-identical", stepPermitted(base, "Conservative") === stepPermitted({ ...base, action: "read" }, "Conservative"), "");
    ok("A3 read vs write-in-place yields different role capacity", roleCapacity([{ ...base, action: "read" }], "Conservative").grossValue > roleCapacity([{ ...base, action: "write-in-place" }], "Conservative").grossValue, "");
    // enum integrity surfaced; valid verb + freeform note both accepted
    ok("A3 an unknown action is surfaced at intake", !validateIntake({ ...RECON_INTAKE, steps: RECON_INTAKE.steps.map((s, i) => i === 0 ? { ...s, action: "frobnicate" } : s) }).ok, "");
    ok("A3 a valid action + a freeform actionNote validate clean", validateIntake({ ...RECON_INTAKE, steps: RECON_INTAKE.steps.map((s, i) => i === 0 ? { ...s, action: "read", actionNote: "screen-scrape exception list" } : s) }).ok, "");
  }

  // A4 — entitlement × sensitivity: the truer value/risk signal; infer-then-confirm
  {
    const conf = { cls: "assembly", data: "confidential", theo: 80, time: 10 };
    const vrRead = stepValueRisk({ ...conf, entitlement: "read" });
    const vrWrite = stepValueRisk({ ...conf, entitlement: "write" });
    const vrApprove = stepValueRisk({ ...conf, cls: "decision", entitlement: "approve" });
    ok("A4 read-only on confidential scores LOWER value/risk than write on the same tier", vrRead < vrWrite, `${vrRead} vs ${vrWrite}`);
    ok("A4 elevated entitlement + a decision is the highest value/risk", vrApprove > vrWrite && vrApprove > vrRead, `${vrApprove}`);
    // inference (infer-then-confirm): decision -> approve; write-in-place -> write; default read
    ok("A4 inferEntitlement: a decision infers approve", inferEntitlement({ cls: "decision" }) === "approve", "");
    ok("A4 inferEntitlement: a write-in-place action infers write", inferEntitlement({ cls: "assembly", action: "write-in-place" }) === "write", "");
    ok("A4 inferEntitlement: nothing stated infers read (the floor — round up at confirm)", inferEntitlement({ cls: "assembly" }) === "read", "");
    ok("A4 a stated entitlement is sourced 'stated'; an inferred one 'inferred'", entitlementOf({ entitlement: "write" }).source === "stated" && entitlementOf({ cls: "assembly" }).source === "inferred", "");
    // the high-value human-held core (elevated entitlement on sensitive data + a decision)
    const er = buildEntitlementRisk(RECON_INTAKE);
    ok("A4 the high-value core is the decision on sensitive data (human-held)", er.highValueCore.some(s => /Approve adjustment/.test(s.step) && s.cls === "decision"), JSON.stringify(er.highValueCore.map(s => s.step)));
    ok("A4 inferred entitlements are flagged for confirm", er.inferredCount > 0 && er.confirmQueue.length === er.inferredCount, `${er.inferredCount}`);
    ok("A4 the entitlement profile is the set of distinct levels (the B1 adjacency leg)", Array.isArray(er.profile) && er.profile.every(e => ENTITLEMENTS.includes(e)), JSON.stringify(er.profile));
    // enum integrity + additive
    ok("A4 an unknown entitlement is surfaced at intake", !validateIntake({ ...RECON_INTAKE, steps: RECON_INTAKE.steps.map((s, i) => i === 0 ? { ...s, entitlement: "superuser" } : s) }).ok, "");
    ok("A4 a stated entitlement validates clean", validateIntake({ ...RECON_INTAKE, steps: RECON_INTAKE.steps.map((s, i) => i === 0 ? { ...s, entitlement: "read" } : s) }).ok, "");
    ok("A4 additive: value/risk is a separate lens — capacity is unchanged by entitlement", roleCapacity(normalizeIntake({ steps: [{ ...conf, entitlement: "write" }] }).steps, "Conservative").grossValue === roleCapacity(normalizeIntake({ steps: [conf] }).steps, "Conservative").grossValue, "");
  }

  // A5 — cross-system handoffs as seam attributes; the swivel-chair leverage number
  {
    const reconHandoff = { ...RECON_INTAKE, seams: [
      ...RECON_INTAKE.seams,
      { from: "email", to: "recon engine", type: "handoff", friction: "high", latency: "medium", crit: "low", note: "email confirmation sends me back into the recon system", handoff: { bridges: ["email", "recon engine"], trigger: "email" } },
      { from: "case manager", to: "FinCrime system", type: "handoff", friction: "low", latency: "low", crit: "high", note: "AML referral gate", handoff: { bridges: ["case manager", "FinCrime system"], trigger: "notification" } },
    ] };
    const hs = seamHandoffs(reconHandoff);
    ok("A5 an 'email confirmation sends me back into system X' pattern is captured as a handoff seam", hs.some(h => h.trigger === "email" && h.bridges.length === 2), JSON.stringify(hs));
    const sc = buildSwivelChairRelief([reconHandoff]);
    ok("A5 the handoff seam counts toward the swivel-chair relief number", sc.swivelChairRelieved >= 1 && sc.byTrigger.email === 1, JSON.stringify(sc));
    ok("A5 a high-criticality handoff is PROTECTED — never compressed to zero", sc.protectedHandoffs === 1 && sc.swivelChairRelieved === 1, JSON.stringify(sc));
    ok("A5 the swivel-chair view is directional at n=1 (honest)", sc.directional === true, "");
    // de-identify: the handoff PATTERN (trigger + bridge count) pools; vendor system names never do
    const pooled = deIdentify(reconHandoff);
    ok("A5 the pooled handoff keeps the trigger, not the vendor system name", JSON.stringify(pooled).includes("email") && !JSON.stringify(pooled).includes("FinCrime system"), "");
    // enum integrity + additive
    ok("A5 an unknown handoff trigger is surfaced at intake", !validateIntake({ ...RECON_INTAKE, seams: [{ ...RECON_INTAKE.seams[0], handoff: { bridges: ["a", "b"], trigger: "carrier-pigeon" } }] }).ok, "");
    ok("A5 a valid handoff trigger validates clean", validateIntake({ ...RECON_INTAKE, seams: [{ ...RECON_INTAKE.seams[0], handoff: { bridges: ["a", "b"], trigger: "file-drop" } }, RECON_INTAKE.seams[1]] }).ok, JSON.stringify(validateIntake({ ...RECON_INTAKE, seams: [{ ...RECON_INTAKE.seams[0], handoff: { bridges: ["a", "b"], trigger: "file-drop" } }, RECON_INTAKE.seams[1]] }).errors));
    ok("A5 additive: a workflow with no handoff seams has a swivel-chair number of 0", buildSwivelChairRelief([RECON_INTAKE]).handoffSeams === 0 && buildSwivelChairRelief([RECON_INTAKE]).swivelChairRelieved === 0, "");
  }

  // B1 — clean capture: combined-step split flag + the contradiction queue
  {
    ok("B1 'draft and approve' is flagged for split at capture", flagCombinedStep("draft and approve the memo").combined === true, "");
    ok("B1 the split names the build/gather + decision acts", (() => { const f = flagCombinedStep("draft and approve the memo"); return f.acts.length >= 2 && f.acts.some(a => a.cls === "build" || a.cls === "gather" || a.cls === "assembly") && f.acts.some(a => a.cls === "decision"); })(), "");
    ok("B1 a single assembly act is NOT flagged (no false split)", flagCombinedStep("reconcile the two ledgers").combined === false, "");
    // contradiction queue — a step tagged assembly but committing the firm lands in the queue
    const mis = { steps: [{ step: "Approve the waiver and send it", cls: "assembly", data: "internal", time: 10, theo: 80 }] };
    ok("B1 a class-vs-language contradiction lands in the queue", detectContradictions(mis).some(c => c.kind === "class-vs-language"), "");
    // declared sensitivity vs what a step touches
    const sens = { steps: [{ step: "Pull client financials", cls: "assembly", data: "MNPI", time: 10, theo: 80 }], confirm: { dataTier: "internal" } };
    ok("B1 a sensitivity contradiction lands in the queue", detectContradictions(sens).some(c => c.kind === "sensitivity"), "");
    ok("B1 a clean capture has an EMPTY queue (no false conflicts)", detectContradictions(FPA_INTAKE).length === 0, JSON.stringify(detectContradictions(FPA_INTAKE)));
  }

  // B2 — adversarial confirm (4 flags) + the protected-by-design artifact
  {
    const mislabel = { ...RECON_INTAKE, steps: [{ step: "Approve the waiver and send it", cls: "assembly", data: "internal", time: 10, theo: 80, participants: [{ actorId: "maker", part: "doer" }] }, ...RECON_INTAKE.steps.slice(1)] };
    const af = adversarialConfirmFlags(mislabel);
    ok("B2 a decision-language step tagged assembly is FLAGGED at confirm", af.kinds.impliesDecision >= 1, JSON.stringify(af.kinds));
    // a four-eyes step missing one named part -> control-owner-missing; an inferred number -> inferred-value
    const noApprover = { steps: [{ step: "x", cls: "assembly", data: "internal", time: 10, control: { type: "authority", authorityRef: "ladder" } }] };
    ok("B2 a missing control owner is flagged", adversarialConfirmFlags(noApprover).kinds.controlOwnerMissing >= 1, "");
    const sameActor = { actors: [{ id: "ai", role: "Bot", line: "system", kind: "system" }], steps: [{ step: "self-approve", cls: "decision", data: "internal", time: 5, participants: [{ actorId: "ai", part: "doer" }, { actorId: "ai", part: "approver" }], control: { type: "four-eyes", distinct: ["doer", "approver"] } }] };
    ok("B2 a maker==checker collision is flagged (mixes maker and checker)", adversarialConfirmFlags(sameActor).kinds.mixesMakerChecker >= 1, JSON.stringify(adversarialConfirmFlags(sameActor).flags.map(f => f.kind)));
    ok("B2 an all-inferred capture raises an inferred-value flag", adversarialConfirmFlags({ steps: [{ step: "y", cls: "assembly", data: "internal", theo: 80 }] }).kinds.inferredValue >= 1, "");
    // protected-by-design — decision steps + high-criticality seams, human-held
    const pbd = buildProtectedByDesign(RECON_INTAKE);
    ok("B2 protected-by-design lists the decision steps human-held", pbd.items.some(i => i.kind === "decision-step" && i.humanHeld), "");
    ok("B2 protected-by-design lists high-criticality seams", pbd.items.some(i => i.kind === "high-criticality-seam"), "");
    ok("B2 the mislabeled decision (assembly tag) appears in protected-by-design", buildProtectedByDesign(mislabel).items.some(i => /Approve the waiver/.test(i.item)), JSON.stringify(buildProtectedByDesign(mislabel).items.map(i => i.item)));
  }

  // B3 — the recipe proof block: shape + eval + owner + fallback + maintenance + how-you-prove-it + remedy + costed model-fit lever
  {
    const proof = buildRecipeProof(FPA_INTAKE);  // FPA at Conservative is gated-policy (theo 55% > permitted ~46%)
    ok("B3 the model-fit lever shows a NON-ZERO routed-vs-frontier delta", proof.modelFitLever.delta > 0 && proof.modelFitLever.frontier > proof.modelFitLever.routed, JSON.stringify(proof.modelFitLever));
    ok("B3 a gated-policy recipe NAMES its governance remedy", proof.governanceRemedy.gated === true && typeof proof.governanceRemedy.remedy === "string" && proof.governanceRemedy.unlockPts > 0, JSON.stringify(proof.governanceRemedy));
    ok("B3 the recipe carries shape / eval plan / owner / fallback / maintenance", !!proof.solutionShapes && Array.isArray(proof.evalPlan) && !!proof.owner && !!proof.fallback && proof.maintenanceCost.annualPoint >= 0, "");
    ok("B3 'how you prove it' derives a golden set + thresholds from acceptance", /golden set/.test(proof.howYouProveIt.goldenSet) && /meets:/.test(proof.howYouProveIt.thresholds) && /routes back/.test(proof.howYouProveIt.fallback), JSON.stringify(proof.howYouProveIt));
    // shape drives the eval plan: an agentic recipe demands the harness; a prompt does not
    const agentic = buildRecipeProof({ ...FPA_INTAKE, steps: FPA_INTAKE.steps.map(s => (s.cls === "gather" || s.cls === "build" || s.cls === "assembly") ? { ...s, solutionShape: "agentic" } : s) });
    ok("B3 an agentic recipe's eval plan demands a harness; a prompt's does not", agentic.evalPlan.some(e => /harness/.test(e)) && !buildRecipeProof({ ...FPA_INTAKE, steps: FPA_INTAKE.steps.map(s => (s.cls === "gather" || s.cls === "build" || s.cls === "assembly") ? { ...s, solutionShape: "prompt" } : s) }).evalPlan.some(e => /harness/.test(e)), JSON.stringify(agentic.evalPlan));
    // a non-gated workflow (no policy gap) names no remedy
    const clean = buildRecipeProof({ steps: [{ step: "x", cls: "assembly", data: "internal", time: 10, theo: 50 }], confirm: { acceptance: "matches" } }, { profile: "Progressive" });
    ok("B3 a non-gated recipe names NO false remedy", clean.governanceRemedy.gated === false && clean.governanceRemedy.remedy === null, JSON.stringify(clean.governanceRemedy));
  }

  // C1 — shared slice + drill-down + three-lenses-always
  {
    const tech = { ...FPA_INTAKE, header: { ...FPA_INTAKE.header, dept: "Technology", anchor: "tech-wf" }, steps: FPA_INTAKE.steps.map(s => (s.cls === "gather" || s.cls === "build" || s.cls === "assembly") ? { ...s, solutionShape: "agentic", data: "internal" } : { ...s, data: "internal" }), confirm: { ...FPA_INTAKE.confirm, dataTier: "internal" } };
    const credit = { ...FPA_INTAKE, header: { ...FPA_INTAKE.header, dept: "Credit Risk", anchor: "credit-wf" }, steps: FPA_INTAKE.steps.map(s => (s.cls === "gather" || s.cls === "build" || s.cls === "assembly") ? { ...s, solutionShape: "prompt" } : s) };
    const set = [tech, credit];
    ok("C1 slice by department filters all dashboards", sliceRecords(set, { dimension: "department", value: "Technology" }).length === 1, "");
    ok("C1 slice by solution shape = agentic filters to the agentic workflow", sliceRecords(set, { dimension: "solutionShape", value: "agentic" }).length === 1 && sliceRecords(set, { dimension: "solutionShape", value: "agentic" })[0].header.dept === "Technology", "");
    ok("C1 slice by data tier filters", sliceRecords(set, { dimension: "dataTier", value: "internal" }).length === 1, "");
    ok("C1 empty/all slice is a no-op (returns all)", sliceRecords(set, { dimension: "department", value: "all" }).length === 2 && sliceRecords(set, null).length === 2, "");
    ok("C1 slice options enumerate departments + shapes", sliceOptions(set).department.includes("Technology") && sliceOptions(set).solutionShape.includes("agentic"), JSON.stringify(sliceOptions(set)));
    // three lenses — capacity NEVER alone: always bundled with cost + flow
    const tl = threeLenses(set);
    ok("C1 threeLenses bundles capacity WITH cost AND flow (never one number)", tl.capacity && tl.cost && tl.flow && tl.pairedLenses === true, JSON.stringify(Object.keys(tl)));
    // drill-down: department -> workflows -> units
    const dd = drillDown(set);
    ok("C1 drill-down goes department -> workflows -> ranked units", dd.length === 2 && dd.every(d => d.workflows.length >= 1 && d.workflows[0].units.length >= 1), JSON.stringify(dd.map(d => d.department)));
  }

  // C2 — worker view: leverage framing only; every string passes the worker rail; leverage summary exports
  {
    const wv = buildWorkerView([RECON_INTAKE]);
    ok("C2 worker view frames AI-carries vs stays-mine + time given back", wv.roles.length >= 1 && wv.roles.every(r => /AI carries/.test(r.aiCarries) && /stay yours/.test(r.staysMine) && /time back/.test(r.givenBackTo)), "");
    // EVERY rendered worker string passes the worker rail (no cost / capacity / headcount / FTE)
    const workerStrings = [wv.headline, ...wv.roles.flatMap(r => [r.aiCarries, r.staysMine, r.givenBackTo, r.shift])];
    ok("C2 every worker-view string passes the worker rail", workerStrings.every(s => railCheck(s, "worker").ok), JSON.stringify(workerStrings.filter(s => !railCheck(s, "worker").ok)));
    // the rail BLOCKS cost / headcount on the worker surface (the guard the test pins)
    ok("C2 cost/headcount vocab is BLOCKED on the worker surface", !railCheck("cost-to-serve", "worker").ok && !railCheck("reduce headcount", "worker").ok && !railCheck("0.6 FTE freed", "worker").ok, "");
    // the leverage summary is a real, rail-clean export
    const ls = buildLeverageSummary([RECON_INTAKE]);
    ok("C2 leverage summary exports rail-clean content + a filename", railCheck(ls.content, "worker").ok && ls.filename === "leverage-summary.md" && ls.content.length > 0, JSON.stringify(railCheck(ls.content, "worker").violations));
  }

  // C3 — leadership dashboard: AI/Hybrid/Human mix, gap tiles + remedies, sequencing, collective heatmap, uplift, exports
  {
    const tech = { ...RECON_INTAKE, header: { ...RECON_INTAKE.header, dept: "Technology", anchor: "tech-wf" }, steps: RECON_INTAKE.steps.map(s => ({ ...s, data: "internal" })), confirm: { ...RECON_INTAKE.confirm, dataTier: "internal" } };
    const credit = { ...RECON_INTAKE, header: { ...RECON_INTAKE.header, dept: "Credit Risk", anchor: "credit-wf" } };
    const set = [tech, credit];
    const mix = buildAiHybridHumanMix(set);
    ok("C3 AI/Hybrid/Human mix sums to 100 and shows where the line sits", mix.ai + mix.hybrid + mix.human >= 99 && /AI carries/.test(mix.whereTheLineSits), JSON.stringify(mix));
    // gap tiles — the POLICY tile is RED regardless of economics
    const weakEcon = { ...FPA_INTAKE, steps: FPA_INTAKE.steps.map(s => ({ ...s, data: "MNPI" })) }; // high policy gap + weak economics
    ok("C3 a policy-blocked + weak-economics workflow shows the policy tile RED regardless of economics", buildGapTiles([weakEcon]).policy.status === "red" && !!buildGapTiles([weakEcon]).policy.remedy, JSON.stringify(buildGapTiles([weakEcon]).policy));
    ok("C3 the realization gap tile names the builder-ladder remedy", /builder ladder/.test(buildGapTiles([credit]).realization.remedy) || buildGapTiles([credit]).realization.status === "ok", "");
    // cross-group sequencing — computed from per-group policy gap
    const seq = buildCrossGroupSequencing(set);
    ok("C3 cross-group sequencing builds low-gap now, governance high-gap in parallel", seq.sequence.length === 2 && seq.sequence[0].move.includes("build now") && /governance track/.test(seq.note), JSON.stringify(seq.sequence));
    // collective heatmap over the pooled library — n + confidence; <3 = directional
    const pool = buildPooledLibrary([RECON_INTAKE, RECON_INTAKE]);
    const heat = buildCollectiveHeatmap(pool);
    ok("C3 a collective cell backed by <3 discoveries is marked directional/low-confidence", heat.rows.length && heat.rows.every(r => r.n < 3 ? (r.confidence === "directional" && r.lowConfidence) : true), JSON.stringify(heat.rows.map(r => `${r.role}:n=${r.n}:${r.confidence}`)));
    // realization uplift — computed from the rung (not a constant)
    const up = realizationUplift(set), upHigher = realizationUplift(set, { targetRealizationFactor: 0.95 });
    ok("C3 realization uplift is COMPUTED (a higher rung gives a bigger uplift)", up.upliftDollars > 0 && upHigher.upliftDollars > up.upliftDollars, `${up.upliftDollars} vs ${upHigher.upliftDollars}`);
    // role redefinition + honest-under-pressure
    ok("C3 role redefinition spans individual -> team -> department", buildRoleRedefinition(set).individual.length >= 1 && /coverage/.test(buildRoleRedefinition(set).team) && /capability/.test(buildRoleRedefinition(set).department), "");
    ok("C3 honest-under-pressure discloses excluded decisions + policy blockers + TCO payback", buildHonestUnderPressure(set).excludedDecisionSteps > 0 && buildHonestUnderPressure(set).disclosures.length >= 4 && buildHonestUnderPressure(set).tcoPayback !== undefined, "");
    // two REAL exports
    ok("C3 the capacity pack export produces real content + filename", buildCapacityPack(set).content.length > 0 && buildCapacityPack(set).filename === "capacity-pack.md", "");
    ok("C3 the roadmap export produces real content + filename", buildRoadmapExport(set).content.length > 0 && buildRoadmapExport(set).filename === "land-expand-retain-roadmap.md" && /Land -> Expand -> Retain/.test(buildRoadmapExport(set).content), "");
  }

  // C4 — tech & governance: build view, control evidence, six AI-policy KPIs, builder ladder, evidence pack
  {
    const view = buildTechGovView([RECON_INTAKE]);
    ok("C4 the build view carries shape / model tier / eval plan / owner per recipe", view.builds.length >= 1 && view.builds[0].owner && Array.isArray(view.builds[0].evalPlan) && view.builds[0].tiers.length >= 1, "");
    ok("C4 control evidence carries the gate-matrix status + the controls", view.builds[0].controlEvidence && typeof view.builds[0].controlEvidence.ok === "boolean" && view.builds[0].controlEvidence.controls.length >= 1, JSON.stringify(view.builds[0].controlEvidence.controls));
    ok("C4 the six AI-policy KPIs are present", view.kpis.kpis.length === 6 && view.kpis.kpis.map(k => k.id).join(",") === "ai_steps_human_owner,hardened_from_confirmed,residency_exceptions_open,eval_coverage_by_shape,control_evidence_completeness,model_tier_mix", "");
    ok("C4 the builder ladder is Use -> Shape -> Evaluate (the enablement track)", view.builderLadder.map(r => r.name).join(" -> ") === "Use -> Shape -> Evaluate", "");
    // residency-exceptions-open KPI reflects ACTUAL exception objects
    const withExc = { ...RECON_INTAKE, policyExceptions: [{ approver: "CRO", jurisdiction: "US", dataClass: "confidential", expiry: "2099-01-01" }] };
    const expired = { ...RECON_INTAKE, policyExceptions: [{ approver: "CRO", jurisdiction: "US", dataClass: "confidential", expiry: "2000-01-01" }] };
    ok("C4 residency-exceptions-open KPI reflects actual valid exception objects", buildTechGovKpis([withExc]).kpis.find(k => k.id === "residency_exceptions_open").value === 1 && buildTechGovKpis([RECON_INTAKE]).kpis.find(k => k.id === "residency_exceptions_open").value === 0, "");
    ok("C4 an expired/invalid exception does NOT count as open", buildTechGovKpis([expired]).kpis.find(k => k.id === "residency_exceptions_open").value === 0, "");
    // the evidence pack is a real export
    const ep = buildEvidencePack([withExc]);
    ok("C4 the evidence pack produces real content + filename", ep.content.length > 0 && ep.filename === "evidence-pack.md" && /Control evidence/.test(ep.content) && /CRO/.test(ep.content), "");
  }

  // D1 — computed, never fixed: the three signature figures change when their driver changes
  {
    const set = [FPA_INTAKE];
    // (1) realization uplift driven by the builder-ladder rung
    const u70to85 = realizationUplift(set, { targetRealizationFactor: 0.85 });
    const u70to95 = realizationUplift(set, { targetRealizationFactor: 0.95 });
    ok("D1 changing the builder-ladder rung CHANGES the uplift (not a constant)", u70to85.upliftDollars !== u70to95.upliftDollars && u70to95.upliftDollars > u70to85.upliftDollars, `${u70to85.upliftDollars} vs ${u70to95.upliftDollars}`);
    // (2) governance unlock driven by the policy profile shift
    const gMod = governanceUnlock(set, { toProfile: "Moderate" });
    const gProg = governanceUnlock(set, { toProfile: "Progressive" });
    ok("D1 changing the policy profile CHANGES the governance-unlock dollars (not a constant)", gMod.unlockDollars !== gProg.unlockDollars && gProg.unlockDollars >= gMod.unlockDollars, `${gMod.unlockDollars} vs ${gProg.unlockDollars}`);
    // (3) model-fit lever = frontier-everywhere minus routed (computed)
    const proof = buildRecipeProof(FPA_INTAKE);
    const routed = costToServe(normalizeIntake(FPA_INTAKE).steps, "Conservative", "routed").annual;
    const frontier = costToServe(normalizeIntake(FPA_INTAKE).steps, "Conservative", "frontier").annual;
    ok("D1 the model-fit lever IS frontier-everywhere minus routed (computed)", near(proof.modelFitLever.delta, round(frontier - routed), 1) && proof.modelFitLever.delta > 0, `${proof.modelFitLever.delta} vs ${round(frontier - routed)}`);
    // a zero-policy-gap set unlocks nothing (the unlock tracks the actual gap, not a fixed figure)
    ok("D1 governance unlock tracks the ACTUAL gap (a no-gap set unlocks ~0)", governanceUnlock([{ steps: [{ step: "x", cls: "assembly", data: "internal", time: 10, theo: 30 }], recap: { confirmed: true }, header: { persona: "p", dept: "d", anchor: "a" }, trigger: { trigger: "t", cadence: "daily" }, seams: [{ friction: "low", latency: "low", crit: "low" }], judgment: { needs: "n", hard: "h", cues: "c", human: "h" }, confirm: { acceptance: "a", escalation: "e", dataTier: "internal" } }], { fromProfile: "Conservative", toProfile: "Moderate" }).unlockDollars === 0, "");
  }

  // D2 — the rail extends to the COLLECTIVE / aggregate surfaces and FAILS CLOSED
  {
    ok("D2 collective rail BLOCKS headcount vocab on the aggregate surface", !railGuardCollective(["reduce headcount across the department"], "dashboard").ok, "");
    ok("D2 collective rail BLOCKS a unicode-obfuscated variant", !railGuardCollective(["rеduce hеadcount"], "dashboard").ok, ""); // Cyrillic е folds to Latin
    ok("D2 collective rail BLOCKS synonym variants (workforce reduction / role elimination / FTE)", !railGuardCollective(["workforce reduction"], "dashboard").ok && !railGuardCollective(["role elimination plan"], "dashboard").ok && !railGuardCollective(["cut 3 FTE"], "dashboard").ok, "");
    ok("D2 collective rail PASSES clean reshape framing", railGuardCollective(["AI carries the assembly; the team reshapes toward judgment work"], "dashboard").ok && railGuardCollective(["freed capacity reinvested into coverage; the line stays human"], "dashboard").ok, "");
    ok("D2 the actual collective heatmap text is rail-clean", (() => { const heat = buildCollectiveHeatmap(buildPooledLibrary([RECON_INTAKE, RECON_INTAKE])); const texts = [heat.note, ...heat.rows.map(r => `${r.role} n=${r.n} ${r.confidence} ${r.coverage}`)].filter(Boolean); return railGuardCollective(texts, "dashboard").ok; })(), "");
    ok("D2 the leadership aggregate text is rail-clean (mix + sequencing + uplift + unlock)", (() => { const set = [RECON_INTAKE, { ...RECON_INTAKE, header: { ...RECON_INTAKE.header, dept: "Tech", anchor: "t" } }]; const texts = [buildAiHybridHumanMix(set).whereTheLineSits, buildCrossGroupSequencing(set).note, realizationUplift(set).headline, governanceUnlock(set).note, buildRoleRedefinition(set).team, buildRoleRedefinition(set).department]; return railGuardCollective(texts, "dashboard").ok; })(), "");
    ok("D2 FAILS CLOSED if the rail itself throws (never a fake-OK on the collective surface)", railGuardCollective([{ toString() { throw new Error("boom"); } }], "dashboard").ok === false, "");
  }

  // D3 — illustrative-data provenance: every export carries the calibrated-seed marker; a real confirmed seed drops it
  {
    const set = [FPA_INTAKE];
    const exports = [buildCapacityPack, buildRoadmapExport, buildEvidencePack];
    ok("D3 every export shows the calibrated-seed marker by default", exports.every(fn => fn(set).content.includes(CALIBRATED_SEED_MARKER) && fn(set).illustrative === true), "");
    ok("D3 every export DROPS the marker under a real-confirmed-seed flag", exports.every(fn => !fn(set, { realConfirmedSeed: true }).content.includes(CALIBRATED_SEED_MARKER) && fn(set, { realConfirmedSeed: true }).illustrative === false), "");
    ok("D3 the marker is the single shared source of truth", CALIBRATED_SEED_MARKER === illustrativeMarker({}) && illustrativeMarker({ realConfirmedSeed: true }) === null, "");
  }

  // ---- Edition 3 \u00b7 F6 \u2014 confirm gate, control-aware (confirmBlockers / canHarden) ----
  ok("F6 a clean confirmed multi-actor unit can harden", canHarden(RECON_INTAKE), JSON.stringify(confirmBlockers(RECON_INTAKE)));
  ok("F6 an unconfirmed unit cannot harden (recap gate preserved)", !canHarden({ ...RECON_INTAKE, recap: { confirmed: false } }), "");
  const sameActor6 = { ...RECON_INTAKE, steps: RECON_INTAKE.steps.map(s => s.step === "Approve adjustment" ? { ...s, participants: [{ actorId: "maker", part: "doer" }, { actorId: "maker", part: "approver" }] } : s) };
  ok("F6 a four-eyes with the same actor cannot harden, with a reason", !canHarden(sameActor6) && confirmBlockers(sameActor6).some(b => b.rule === "four-eyes-distinct"), "");
  const noAppr6 = { ...RECON_INTAKE, steps: RECON_INTAKE.steps.map(s => s.step === "Approve adjustment" ? { ...s, participants: [{ actorId: "maker", part: "doer" }] } : s) };
  ok("F6 an authority/four-eyes step missing its approver cannot harden", !canHarden(noAppr6) && confirmBlockers(noAppr6).some(b => /approver|named/.test(b.rule)), "");
  const autoHalt6 = { ...RECON_INTAKE, steps: RECON_INTAKE.steps.map(s => s.step === "Investigate root cause" ? { ...s, autoResolve: true } : s) };
  ok("F6 a halt that is auto-resolvable cannot harden", !canHarden(autoHalt6) && confirmBlockers(autoHalt6).some(b => b.rule === "halt-no-auto-resolve"), "");
  ok("F6 a single-persona confirmed workflow still hardens (additive)", canHarden(FPA_INTAKE), JSON.stringify(confirmBlockers(FPA_INTAKE)));

  // ---- P2 (B2) — semantic class check: a decision/commitment mislabeled as assembly is caught ----
  const mislabelB2 = { ...RECON_INTAKE, steps: RECON_INTAKE.steps.map(s => s.step === "Post adjustment" ? { ...s, step: "Approve the write-off and post the final entry" } : s) };
  const mlStep = mislabelB2.steps.find(s => /Approve the write-off/.test(s.step));
  ok("B2 a decision-language step tagged assembly blocks hardening", !canHarden(mislabelB2) && confirmBlockers(mislabelB2).some(b => b.rule === "class-mismatch-decision"), JSON.stringify(confirmBlockers(mislabelB2)));
  ok("B2 the mislabeled step earns ZERO permitted automation (no fake capacity)", stepPermitted(mlStep, "Conservative") === 0 && roleCapacity(normalizeIntake({ steps: [mlStep] }).steps, "Conservative").grossValue === 0, String(stepPermitted(mlStep, "Conservative")));
  ok("B2 the recipe renders the mislabel as a human checkpoint, not an ai-step (draft view)", (() => { const st = buildDraftRecipe(mislabelB2).orderedSteps.find(s => /Approve the write-off/.test(s.step)); return st && st.kind !== "ai-step"; })(), "");
  ok("B2/M1 the HARDENED recipe REFUSES the mislabel outright (no bypass)", (() => { try { buildRecipe(mislabelB2); return false; } catch { return true; } })(), "");
  ok("B2 an explicit override rationale lets a genuine edge case through", stepDecisionLanguage({ ...mlStep, classOverride: "Control owner reviewed: rote posting, not a firm commitment." }) === false, "");
  ok("B2 a clean record still hardens — no false positive (additive)", canHarden(RECON_INTAKE) && canHarden(FPA_INTAKE), "");

  // ---- P3 (M3) — a decision is NEVER given to AI: zero permitted automation, zero capacity ----
  const allDecision = { steps: [
    { step: "Approve the write-off", cls: "decision", data: "confidential", time: 20, theo: 15 },
    { step: "Sign off on the close", cls: "decision", data: "internal", time: 20, theo: 12 },
  ] };
  const decCap = roleCapacity(normalizeIntake(allDecision).steps, "Progressive"); // most permissive profile
  ok("M3 a decision earns ZERO permitted automation on every profile (no 5/10/15% sliver)", ["Conservative", "Moderate", "Progressive"].every(p => stepPermitted({ cls: "decision", data: "public", theo: 99 }, p) === 0), "");
  ok("M3 an all-decision workflow yields ZERO AI capacity", decCap.permittedPct === 0 && decCap.grossValue === 0, JSON.stringify({ permittedPct: decCap.permittedPct, gross: decCap.grossValue }));
  ok("M3 an all-decision workflow has ZERO cost-to-serve (nothing routed to AI)", costToServe(normalizeIntake(allDecision).steps, "Progressive").annual === 0, "");
  ok("M3 assembly/judgment still earn capacity (decision-only change, additive)", stepPermitted({ cls: "assembly", data: "public", theo: 80 }, "Conservative") > 0 && stepPermitted({ cls: "judgment", data: "public", theo: 35 }, "Conservative") > 0, "");

  // ---- P4 (M1) — harden gate refuses unconfirmed/draft; numeric bounds; per-field provenance ----
  ok("M1 the HARDENED buildSpec REFUSES an unconfirmed unit (throws)", (() => { try { buildSpec({ ...FPA_INTAKE, recap: { confirmed: false } }); return false; } catch { return true; } })(), "");
  ok("M1 the HARDENED buildRecipe REFUSES an unconfirmed unit (throws)", (() => { try { buildRecipe({ ...FPA_INTAKE, recap: { confirmed: false } }); return false; } catch { return true; } })(), "");
  ok("M1 buildDraftSpec previews an unconfirmed unit WITHOUT asserting, and is tagged draft", (() => { const d = buildDraftSpec({ ...FPA_INTAKE, recap: { confirmed: false } }); return d && d.draft === true && !!d.modelFit; })(), "");
  ok("M1 a confirmed unit DOES harden, and the spec/recipe are tagged hardened (not draft)", buildSpec(FPA_INTAKE).hardened === true && buildSpec(FPA_INTAKE).draft === false && buildRecipe(FPA_INTAKE).hardened === true, "");
  ok("M1 a NEGATIVE time is rejected by validateIntake (never fed to the economics)", !validateIntake({ ...FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "internal", time: -5 }] }).ok, "");
  ok("M1 an out-of-range theo (>100%) is rejected", !validateIntake({ ...FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "internal", theo: 140 }] }).ok, "");
  ok("M1 a NaN time is rejected (not silently used)", !validateIntake({ ...FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "internal", time: NaN }] }).ok, "");
  ok("M1 an all-inferred (no stated time) confirmed-shaped record CANNOT harden", (() => { const r = { ...RECON_INTAKE, steps: RECON_INTAKE.steps.map(s => { const c = { ...s }; delete c.time; return c; }) }; return !canHarden(r) && confirmBlockers(r).some(b => b.rule === "all-inferred-time"); })(), "");
  ok("M1 one stated time clears the provenance gate (FP&A/RECON still harden)", canHarden(FPA_INTAKE) && canHarden(RECON_INTAKE) && provenanceBlockers(FPA_INTAKE).length === 0, "");

  // ---- P5 (M2) — PII/MNPI residency is non-bypassable without a FORMAL policy exception ----
  const validExc = { approver: "CISO", jurisdiction: "EU", dataClass: "PII", expiry: "2099-01-01", asOf: "2026-06-21" };
  ok("M2 a bare boolean true CANNOT downgrade PII off restricted (the audit bypass is closed)", modelTier("assembly", "PII", "routed", true) === "restricted", modelTier("assembly", "PII", "routed", true));
  ok("M2 MNPI with a bare true stays restricted", modelTier("assembly", "MNPI", "routed", true) === "restricted", "");
  ok("M2 a partial exception (missing jurisdiction/expiry) does NOT lift residency", modelTier("assembly", "PII", "routed", { approver: "CISO", dataClass: "PII" }) === "restricted", "");
  ok("M2 an EXPIRED exception does NOT lift residency", modelTier("assembly", "PII", "routed", { ...validExc, expiry: "2020-01-01" }) === "restricted", "");
  ok("M2 an exception for the WRONG data class does NOT lift residency", modelTier("assembly", "MNPI", "routed", validExc) === "restricted", "");
  ok("M2 a VALID, complete, unexpired exception (approver+jurisdiction+dataClass+expiry) DOES lift PII", modelTier("assembly", "PII", "routed", validExc) === "small", modelTier("assembly", "PII", "routed", validExc));
  ok("M2 confidential is unaffected (routes normally, never forced)", modelTier("assembly", "confidential", "routed") === "small", "");
  ok("M2 the default (no exception) forces PII/MNPI to restricted", modelTier("assembly", "PII", "routed") === "restricted" && modelTier("assembly", "MNPI", "routed") === "restricted", "");

  // ---- P6 (M6) — independent readiness gate matrix: economics never masks policy ----
  const p0 = readiness({ theoPct: 0.8, permittedPct: 0.4, grossValue: 100, annualCost: 5000 }); // policy-capped AND net-negative
  ok("M6 a policy-blocked + weak-economics unit shows the POLICY gate red regardless of economics", p0.gates.policy.status === "blocked" && p0.gates.economics.status === "blocked", JSON.stringify({ policy: p0.gates.policy.status, economics: p0.gates.economics.status }));
  ok("M6 the old single 4-state verdict is preserved (additive)", p0.state === "gated-economics" && typeof p0.reason === "string", p0.state); // old field still present
  ok("M6 a clean unit has all gates clear and a summary", (() => { const r = readiness({ theoPct: 0.5, permittedPct: 0.5, grossValue: 50000, annualCost: 200, dataTier: "internal", controlOk: true, evidenceInferred: false }); return r.gates.policy.status === "ok" && r.gates.economics.status === "ok" && /clear/i.test(r.gateSummary); })(), "");
  ok("M6 PII data raises the DATA gate to caution independently", readiness({ theoPct: 0.5, permittedPct: 0.5, grossValue: 50000, annualCost: 200, dataTier: "PII" }).gates.data.status === "caution", "");
  ok("M6 a control violation raises the CONTROL gate to blocked independently", readiness({ theoPct: 0.5, permittedPct: 0.5, grossValue: 50000, annualCost: 200, controlViolations: [{ rule: "x" }] }).gates.control.status === "blocked", "");
  ok("M6 an all-inferred unit raises the EVIDENCE gate to blocked", readiness({ theoPct: 0.5, permittedPct: 0.5, grossValue: 50000, annualCost: 200, evidenceInferred: true }).gates.evidence.status === "blocked", "");
  ok("M6 the six gates are always present and named", (() => { const g = readiness({ grossValue: 1, annualCost: 0 }).gates; return ["policy", "data", "control", "economics", "adoption", "evidence"].every(k => g[k] && typeof g[k].status === "string"); })(), "");
  ok("M6 the buildSpec carries the gate matrix on its readiness object", (() => { const sp = buildSpec(FPA_INTAKE); return sp._readiness && sp._readiness.gates && sp._readiness.gates.data && typeof sp._readiness.gateSummary === "string"; })(), "");

  // ---- P7 (M7) — the worker-safe rail catches obfuscation + synonyms, and fails closed ----
  ok("M7 spaced 'head count' is blocked everywhere", !railCheck("plan a head count review", "dashboard").ok, "");
  ok("M7 a zero-width-space inside 'head\\u200Bcount' is blocked", !railCheck("head​count target", "recipe").ok, "");
  ok("M7 a non-breaking hyphen in 'hours\\u2011saved' is blocked", !railCheck("hours‑saved this quarter", "recipe").ok, "");
  ok("M7 a Cyrillic homoglyph 'h\\u0435adcount' is blocked", !railCheck("hеadcount", "dashboard").ok, "");
  ok("M7 synonyms are blocked (workforce reduction / role elimination / job cuts / downsize)", ["workforce reduction", "role elimination", "job cuts", "downsize the team", "reduce the workforce"].every(p => !railCheck(p, "recipe").ok), "");
  ok("M7 the literal FTE and F.T.E are still banned (word-bounded)", !railCheck("0.6 FTE freed", "dashboard").ok && !railCheck("cut F.T.E", "recipe").ok, "");
  ok("M7 NO over-block: innocent words containing 'fte' as a substring pass (softer/drafter/lifted)", railCheck("a softer drafter lifted the tone", "capture").ok, "");
  ok("M7 the rail FAILS CLOSED if it cannot run (railCheck never returns ok on an internal error)", (() => { const real = RAIL.bannedPatterns; try { RAIL.bannedPatterns = { forEach() { throw new Error("boom"); } }; const r = railCheck("anything", "capture"); return r.ok === false && r.railError === true; } finally { RAIL.bannedPatterns = real; } })(), "");
  ok("M7 surface families still hold (capacity dashboard-only; cost recipe+dashboard; leverage off capture)", railCheck("capacity freed", "dashboard").ok && !railCheck("capacity freed", "capture").ok && railCheck("cost-to-serve", "recipe").ok && !railCheck("leverage", "capture").ok, "");

  // ---- P10 (m1 + m2) — F0 reconcile of drifted field names + capability-vocabulary integrity ----
  const drift = { ...RECON_INTAKE, header: { persona: "Ops Analyst", department: "CIB Operations", anchor: "Recon (drifted)", lifecycle: "confirmed" }, judgmentCore: RECON_INTAKE.judgment, seams: RECON_INTAKE.seams.map(s => { const c = { ...s, criticality: s.crit }; delete c.crit; return c; }) };
  const recDrift = reconcileIntake(drift);
  ok("m2 F0 reconcile maps department->dept, criticality->crit, judgmentCore->judgment", recDrift.header.dept === "CIB Operations" && recDrift.seams.every(s => s.crit) && recDrift.judgment && recDrift.judgment.needs, JSON.stringify({ dept: recDrift.header.dept, crit: recDrift.seams.map(s => s.crit) }));
  ok("m2 a drifted-but-otherwise-clean record now VALIDATES (coverage 100) and hardens", validateIntake(drift).coverage.pct === 100 && canHarden(drift), JSON.stringify(validateIntake(drift).coverage.gaps));
  ok("m2 reconcile is idempotent + additive (a canonical record is returned unchanged, same ref)", reconcileIntake(RECON_INTAKE) === RECON_INTAKE, "");
  ok("m1 an unresolved capability tag is SURFACED at intake (not silently accepted)", !validateIntake({ ...RECON_INTAKE, steps: [{ ...RECON_INTAKE.steps[0], capability: "frobnicate-widgets" }] }).ok, "");
  ok("m1 a capability tag IN the controlled vocabulary is accepted", validateIntake({ ...RECON_INTAKE, steps: RECON_INTAKE.steps.map((s, i) => i === 0 ? { ...s, capability: "reconcile-two-sources" } : s) }).ok, JSON.stringify(validateIntake({ ...RECON_INTAKE, steps: [{ ...RECON_INTAKE.steps[0], capability: "reconcile-two-sources" }] }).errors));

  // ---- Edition 3 \u00b7 F8 \u2014 org-tier numbers: hand-off reduction + SLA dividend ----
  const hr = buildHandoffReduction([RECON_INTAKE]);
  ok("F8 hand-off reduction counts cross-role hand-offs (recon: 2 baseline, both into human-held => stay)", hr.baseline === 2 && hr.remaining === 2 && hr.collapsed === 0, JSON.stringify(hr));
  // a workflow whose hand-off lands on an ASSEMBLY step collapses (AI absorbs it)
  const asmHandoff = { ...RECON_INTAKE, steps: [
    { step: "Pull", cls: "assembly", data: "internal", time: 50, theo: 80, participants: [{ actorId: "teamLead", part: "doer" }] },
    { step: "Format", cls: "assembly", data: "internal", time: 50, theo: 80, participants: [{ actorId: "maker", part: "doer" }] },
  ] };
  ok("F8 a hand-off into an assembly step collapses (swivel-chair removed)", buildHandoffReduction([asmHandoff]).collapsed === 1, JSON.stringify(buildHandoffReduction([asmHandoff])));
  ok("F8 hand-off reduction is confirmed-only (drops the unconfirmed)", buildHandoffReduction([RECON_INTAKE, { ...RECON_INTAKE, recap: { confirmed: false } }]).confirmedCount === 1, "");
  const sla = buildSlaDividend([RECON_INTAKE, RECON_INTAKE]);
  ok("F8 SLA dividend = freed capacity as role-weeks (honest), aged/breach counts are LABELED placeholders", sla.freedRoleWeeks > 0 && sla.agedItemsAvoided === null && sla.slaBreachesAvoided === null, JSON.stringify(sla));
  ok("F8 SLA dividend freed == role view freed (no fork)", near(sla.freedHrs, round(sum(buildRoleView([RECON_INTAKE, RECON_INTAKE]).roles.map(r => r.freedHrs)), 2), 0.02), "");
  ok("F8 org-tier numbers carry no headcount/fte vocabulary", !/headcount|\bfte\b|cut staff|lay ?off/i.test(JSON.stringify(hr) + JSON.stringify(sla)), "");

  // ---- Phase 3 \u00b7 C1 \u2014 plain-language self-explaining layer (per-surface, rail-respecting) ----
  const wExpl = explainFigure("time_given_back", "worker");
  ok("C1 the worker 'time given back' explainer exists with what-this-means + how-computed", !!wExpl && !!wExpl.whatThisMeans && !!wExpl.howComputed, JSON.stringify(wExpl));
  ok("C1 the worker freed-capacity explainer is rail-clean on the worker surface (no cost / capacity / headcount / fte)", railCheck(`${wExpl.whatThisMeans} ${wExpl.howComputed}`, "worker").ok, JSON.stringify(railCheck(`${wExpl.whatThisMeans} ${wExpl.howComputed}`, "worker").violations));
  ok("C1 NO worker explainer borrows leader vocabulary (capacity / cost / headcount / fte)", buildExplainers("worker").every(e => !/\bcapacity\b|\bcost\b|head[\s-]*count|\bfte\b/i.test(`${e.label} ${e.whatThisMeans} ${e.howComputed}`)), JSON.stringify(buildExplainers("worker").map(e => e.figureId)));
  const lExpl = explainFigure("net_capacity", "leader");
  ok("C1 a leadership figure explains its computation in the leader's terms (capacity / cost / net)", !!lExpl && /capacity|cost|net/i.test(lExpl.howComputed), JSON.stringify(lExpl));
  ok("C1 every leader + techgov + first-encounter + honesty marker is rail-clean for its surface", explainersRailClean(), "");
  ok("C1 first-encounter explainers exist for all five richer concepts (what-it-is + why-it-changes-the-number)", ["solutionShape", "tco", "adjacency", "entitlement", "ecosystem"].every(id => { const f = firstEncounterExplainer(id); return f && f.whatItIs && f.whyItChangesTheNumber; }), JSON.stringify(listFirstEncounterExplainers().map(f => f.id)));
  ok("C1 honesty markers read in plain terms (confirmed / inferred / illustrative / directional / discoveries)", ["confirmed", "inferred", "illustrative", "directional", "nDiscoveries"].every(id => { const m = explainHonestyMarker(id); return m && m.means.length >= 24 && /\.$/.test(m.means.trim()) && !/provenance|addressabilit|\btheo\b|\bn=\b|de-identif/i.test(m.means) && railCheck(m.means, "dashboard").ok; }), "");
  ok("C1 the plain-language layer is additive \u2014 an unknown figure / concept / marker returns null, no throw", explainFigure("nope", "leader") === null && firstEncounterExplainer("nope") === null && explainHonestyMarker("nope") === null && buildExplainers("nope").length === 0, "");

  // ---- Phase 3 \u00b7 C2 \u2014 accessibility: status encoded by MORE than color ----
  ok("C2 every status cue carries a text label + an icon (status is legible without color)", statusCuesNonColor(), "");
  ok("C2 accessibleStatus resolves the real status sets (readiness / gap / confidence / provenance)", !!accessibleStatus("readiness", "gated-policy") && !!accessibleStatus("gap", "red") && !!accessibleStatus("confidence", "directional") && !!accessibleStatus("provenance", "inferred"), "");
  ok("C2 a status cue's label is distinguishable without color (non-empty text beyond the icon)", (() => { const c = accessibleStatus("readiness", "gated-policy"); return c && c.label.replace(/[^A-Za-z]/g, "").length >= 3; })(), "");
  ok("C2 accessibleStatus is additive \u2014 an unknown kind / value returns null, no throw", accessibleStatus("nope", "x") === null && accessibleStatus("readiness", "nope") === null, "");

  // ---- Phase 3 \u00b7 D3 \u2014 the rubric reads the v3 dimensions (the four new dangerous-error guards) ----
  ok("D3 a write-in-place is NOT under-read as a read (action write-in-place / entitlement write)", (() => { const r = classifyUtterance("after it's checked I post it into the GL myself \u2014 it's a write straight into the ledger, not just a lookup"); return r.action === "write-in-place" && r.entitlement === "write"; })(), JSON.stringify(classifyUtterance("post it into the GL").action));
  ok("D3 a screen-only system's realistic shape is human-in-loop, never agentic", (() => { const r = classifyUtterance("the state licensing portal is screen-only \u2014 there's no API at all, so I key it in by hand on the screen"); return r.reachability === "screen-only" && r.realisticShape === "human-in-loop"; })(), "");
  ok("D3 elevated approve on sensitive (client) data is flagged high-value, not low", (() => { const r = classifyUtterance("I approve write-offs up to ten thousand dollars on client accounts and sign them off myself"); return r.entitlement === "approve" && r.highValue === true; })(), "");
  ok("D3 a shared system NAME alone is NOT combinable (needs shared action + data + access)", classifyUtterance("both teams work in the same CRM, so these two workflows are the same build \u2014 just combine them").combinable === false, "");
  ok("D3 a genuine shared action + data + access DOES read as combinable", classifyUtterance("same task, same data, same access on both \u2014 one build for both, combine them").combinable === true, "");
  ok("D3 read-only on a report stays a read (no false write/approve, not high-value)", (() => { const r = classifyUtterance("I just read the report and pull the figures into a summary"); return r.action === "read" && r.entitlement === "read" && r.highValue === false; })(), "");
  ok("D3 the v3 reads are additive \u2014 the existing fields are unchanged (a clean build still reads build)", (() => { const r = classifyUtterance("reconcile the two ledgers"); return r.cls === "build" && Array.isArray(r.theoRange) && r.combinable === null; })(), "");

  // ---- Phase 3 \u00b7 D4 \u2014 the real-seed ingestion path (the marker drops only on a genuine confirmed pilot) ----
  ok("D4 a genuine confirmed seed is ACCEPTED \u2014 realConfirmedSeed flips true, marker null", (() => { const r = ingestRealSeed(RECON_INTAKE); return r.accepted === true && r.realConfirmedSeed === true && r.marker === null; })(), JSON.stringify(ingestRealSeed(RECON_INTAKE).reasons));
  ok("D4 a candidate marked illustrative/calibrated is REJECTED (never fake a real seed)", (() => { const r = ingestRealSeed({ ...RECON_INTAKE, calibrated: true }); return r.accepted === false && r.realConfirmedSeed === false && r.marker === CALIBRATED_SEED_MARKER; })(), "");
  ok("D4 an UNCONFIRMED candidate is REJECTED (flag stays false, marker stays)", ingestRealSeed({ ...RECON_INTAKE, recap: { confirmed: false } }).realConfirmedSeed === false, "");
  ok("D4 a non-record / empty candidate is REJECTED with a reason (no throw)", ingestRealSeed(null).accepted === false && ingestRealSeed(null).reasons.length > 0, "");
  ok("D4 the marker is driven by the flag: default keeps it, an accepted ingestion drops it across every export", (() => {
    const set = [RECON_INTAKE, FPA_INTAKE];
    const flag = ingestRealSeed(RECON_INTAKE).realConfirmedSeed; // true
    const def = buildCapacityPack(set), real = buildCapacityPack(set, { realConfirmedSeed: flag });
    return def.illustrative === true && def.content.includes(CALIBRATED_SEED_MARKER) && real.illustrative === false && !real.content.includes(CALIBRATED_SEED_MARKER);
  })(), "");
  ok("D4 the SHIPPED default stays illustrative \u2014 no opts means the marker is present (never faked real)", illustrativeMarker({}) === CALIBRATED_SEED_MARKER && illustrativeMarker(undefined) === CALIBRATED_SEED_MARKER, "");

  console.log(`\n${fail === 0 ? "\u2713 ALL PASS" : "\u2717 FAILURES"} \u2014 ${pass} passed, ${fail} failed`);
  return fail === 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const okAll = runTests();
  process.exit(okAll ? 0 : 1);
}
