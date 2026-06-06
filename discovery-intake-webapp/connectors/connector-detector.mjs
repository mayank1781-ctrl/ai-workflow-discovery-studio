/**
 * connector-detector.mjs
 *
 * Reads interview session text and returns:
 *   - detected connectors (with confidence scores)
 *   - suggested agent boundary points
 *   - recommended first agent to build
 *
 * Three-pass detection:
 *   Pass 1 — fast keyword match (no API cost, instant)
 *   Pass 2 — normalisation & deduplication
 *   Pass 3 — optional AI enhancement for ambiguous cases
 *
 * DROP INTO: discovery-intake-webapp/connectors/detector.mjs
 */

import { CATALOG, getAllKeywords, getById } from "./connector-catalog.mjs";

// ─── Pass 1: Keyword matching ─────────────────────────────────────────────────

/**
 * Scans all text fields in the session state for connector keywords.
 *
 * @param {object} sessionState - The full interview session state from app.js
 * @returns {Map<string, {connectorId, matchedKeywords, occurrences}>}
 */
function keywordScan(sessionState) {
  // Flatten all text fields from the session into one corpus
  const corpus = extractTextCorpus(sessionState).toLowerCase();

  const hits = new Map(); // connectorId → match data
  const keywordList = getAllKeywords();

  for (const { connectorId, keyword } of keywordList) {
    const pattern = new RegExp(`\\b${escapeRegex(keyword)}s?\\b`, "gi");
    const matches = corpus.match(pattern);
    if (!matches) continue;

    if (!hits.has(connectorId)) {
      hits.set(connectorId, {
        connectorId,
        matchedKeywords: new Set(),
        occurrences: 0,
      });
    }

    const entry = hits.get(connectorId);
    entry.matchedKeywords.add(keyword);
    entry.occurrences += matches.length;
  }

  return hits;
}

/**
 * Extracts all user-entered text from the session state into a single string.
 * Looks through all string-typed values in the state, one level deep.
 */
function extractTextCorpus(sessionState) {
  if (!sessionState || typeof sessionState !== "object") return "";

  const textParts = [];

  // Direct string fields
  for (const [key, val] of Object.entries(sessionState)) {
    if (typeof val === "string" && val.length > 0) {
      textParts.push(val);
    }
    // One level deep — handles nested objects like workflowData, stepsData, etc.
    else if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [, innerVal] of Object.entries(val)) {
        if (typeof innerVal === "string") textParts.push(innerVal);
      }
    }
    // Arrays of strings (e.g. listed tools, systems)
    else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") textParts.push(item);
        else if (item && typeof item === "object") {
          for (const [, v] of Object.entries(item)) {
            if (typeof v === "string") textParts.push(v);
          }
        }
      }
    }
  }

  return textParts.join(" ");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Pass 2: Scoring and deduplication ───────────────────────────────────────

/**
 * Converts raw keyword hits into confidence-scored connector detections.
 *
 * Confidence:
 *   0.9+  — multiple distinct keywords matched, or ≥3 occurrences
 *   0.7   — 2 occurrences or 2 distinct keywords
 *   0.5   — single keyword match
 */
function scoreAndDeduplicate(hits) {
  const results = [];

  for (const [connectorId, data] of hits.entries()) {
    const connector = getById(connectorId);
    if (!connector) continue;

    const distinctKeywords = data.matchedKeywords.size;
    const occurrences      = data.occurrences;

    let confidence = 0.5;
    if (distinctKeywords >= 3 || occurrences >= 4) confidence = 0.95;
    else if (distinctKeywords >= 2 || occurrences >= 2) confidence = 0.75;

    results.push({
      connectorId,
      name:            connector.name,
      category:        connector.category,
      tier:            connector.tier,
      recipeReady:     connector.recipeReady,
      confidence,
      matchedKeywords: [...data.matchedKeywords],
      occurrences,
    });
  }

  // Sort: highest confidence first, then alphabetically
  return results.sort((a, b) =>
    b.confidence !== a.confidence
      ? b.confidence - a.confidence
      : a.name.localeCompare(b.name)
  );
}

// ─── Pass 3: AI enhancement ───────────────────────────────────────────────────

/**
 * Uses OpenAI to identify tools the keyword scan may have missed
 * (abbreviations, product names used informally, tool nicknames).
 *
 * Only called when aiClient is provided and confidence is needed for
 * low-confidence matches or when the corpus is rich enough to warrant it.
 *
 * @param {string} corpus - The full text from the session
 * @param {object[]} basicMatches - Results from scoreAndDeduplicate
 * @param {object} openaiClient - Initialised OpenAI client (from server.mjs)
 * @returns {Promise<object[]>} - Enhanced match list, same shape
 */
async function aiEnhancement(corpus, basicMatches, openaiClient) {
  if (!openaiClient) return basicMatches;

  const knownNames     = basicMatches.map(m => m.name);
  const catalogNames   = CATALOG.map(c => c.name);

  const systemPrompt = `You are a tool-detection assistant.
Given a workflow description, identify every specific software tool, platform, or system mentioned — including informal names, abbreviations, and nicknames.
Reply ONLY with a JSON array of strings. Each string is a tool/platform name exactly as it appears in the provided catalog list.
Do not invent tools not in the catalog. Do not include tools already in the known list.`;

  const userPrompt = `Catalog of tools to match against:
${catalogNames.join(", ")}

Already detected (skip these):
${knownNames.join(", ")}

Workflow description:
${corpus.slice(0, 3000)}

Reply with a JSON array of newly-detected tool names from the catalog only.`;

  try {
    const response = await openaiClient.chat.completions.create({
      model:       "gpt-4o-mini", // cheap — this is a lightweight extraction task
      temperature: 0,
      max_tokens:  256,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "[]";

    // Strip markdown fences if present
    const cleaned    = raw.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
    const aiNewNames = JSON.parse(cleaned);

    if (!Array.isArray(aiNewNames)) return basicMatches;

    // Map AI-returned names back to catalog entries
    const aiHits = [];
    for (const name of aiNewNames) {
      const connector = CATALOG.find(
        c => c.name.toLowerCase() === name.toLowerCase()
      );
      if (connector && !basicMatches.some(m => m.connectorId === connector.id)) {
        aiHits.push({
          connectorId:     connector.id,
          name:            connector.name,
          category:        connector.category,
          tier:            connector.tier,
          recipeReady:     connector.recipeReady,
          confidence:      0.6, // AI-only detection — slightly lower confidence
          matchedKeywords: ["ai-detected"],
          occurrences:     0,
          aiDetected:      true,
        });
      }
    }

    return [...basicMatches, ...aiHits].sort((a, b) => b.confidence - a.confidence);
  } catch (err) {
    // AI enhancement is optional — silently fall back to basic results
    console.warn("[connector-detector] AI enhancement failed:", err.message);
    return basicMatches;
  }
}

// ─── Agent boundary detection ─────────────────────────────────────────────────

/**
 * Analyses the workflow steps and detected connectors to suggest where
 * agent boundaries should be drawn.
 *
 * A boundary is suggested when:
 *   - The tool/data source changes significantly between steps
 *   - A human judgment/approval/review step is present
 *   - A different actor takes over
 *   - The output format changes (e.g. from data processing to communication)
 *
 * @param {object[]} workflowSteps  - Array of step objects from session state
 *   Each step: { stepNumber, actor, tools, input, output, hasDecision, hasPain }
 * @param {object[]} detectedConnectors - Output from detectConnectors()
 * @returns {object[]} - Suggested agent groups with rationale
 */
export function detectAgentBoundaries(workflowSteps, detectedConnectors) {
  if (!workflowSteps || workflowSteps.length === 0) {
    return [{
      agentNumber:  1,
      name:         "Primary Agent",
      stepRange:    "All steps",
      steps:        [],
      rationale:    "Single agent — workflow steps not yet captured in detail",
      connectors:   detectedConnectors.map(c => c.connectorId),
      buildFirst:   true,
    }];
  }

  // Boundary signals
  const JUDGMENT_KEYWORDS = [
    "review", "decide", "approve", "check", "validate", "confirm",
    "sign off", "sign-off", "authorise", "authorize", "override",
    "human review", "manually", "exception",
  ];
  const OUTPUT_SHIFT_KEYWORDS = [
    "send", "email", "notify", "post", "publish", "report", "summary",
    "dashboard", "present", "share", "distribute",
  ];
  const DATA_SHIFT_KEYWORDS = [
    "upload", "download", "export", "import", "transfer", "move",
    "extract", "load", "sync",
  ];

  const boundaries = [];
  let currentGroup = [];
  let agentNum     = 1;

  for (let i = 0; i < workflowSteps.length; i++) {
    const step = workflowSteps[i];
    const stepText = [
      step.actor || "", step.tools || "", step.input || "",
      step.output || "", step.pain || "",
    ].join(" ").toLowerCase();

    const isJudgment   = JUDGMENT_KEYWORDS.some(kw => stepText.includes(kw));
    const isOutputShift = OUTPUT_SHIFT_KEYWORDS.some(kw => stepText.includes(kw));
    const isDataShift   = DATA_SHIFT_KEYWORDS.some(kw => stepText.includes(kw));

    // Check if the tool set changes significantly from the previous step
    const prevStep     = workflowSteps[i - 1];
    const toolOverlap  = prevStep ? computeToolOverlap(prevStep.tools, step.tools) : 1;
    const toolsShift   = toolOverlap < 0.25 && currentGroup.length >= 2;

    // Commit current group if a significant boundary signal is found
    const shouldSplit  = i > 0 && (
      (isJudgment && currentGroup.length >= 1)  ||
      (isOutputShift && currentGroup.length >= 2)||
      (toolsShift && currentGroup.length >= 2)
    );

    if (shouldSplit && currentGroup.length > 0) {
      boundaries.push(buildAgentGroup(agentNum, currentGroup, detectedConnectors));
      agentNum++;
      currentGroup = [];
    }

    currentGroup.push({ ...step, isJudgment, isOutputShift, isDataShift });
  }

  // Last group
  if (currentGroup.length > 0) {
    boundaries.push(buildAgentGroup(agentNum, currentGroup, detectedConnectors));
  }

  // Mark recommended first build (highest value/complexity ratio)
  markBuildOrder(boundaries, detectedConnectors);

  return boundaries;
}

function buildAgentGroup(agentNumber, steps, allConnectors) {
  // Infer agent name from dominant activity
  const hasOutput  = steps.some(s => s.isOutputShift);
  const hasJudge   = steps.some(s => s.isJudgment);
  const hasData    = steps.some(s => s.isDataShift);
  const isFirst    = agentNumber === 1;

  let name = `Agent ${agentNumber}`;
  if (isFirst)     name = "Data Gatherer";
  else if (hasOutput) name = "Comms & Reporting";
  else if (hasJudge)  name = "Review & Exception Handler";
  else if (hasData)   name = "Data Processor";
  else               name = `Processor ${agentNumber}`;

  // Identify relevant connectors for these steps
  const stepText = steps.map(s =>
    [s.actor, s.tools, s.input, s.output].filter(Boolean).join(" ")
  ).join(" ").toLowerCase();

  const relevantConnectors = allConnectors
    .filter(c => c.matchedKeywords.some(kw => stepText.includes(kw.toLowerCase())))
    .map(c => c.connectorId);

  // Rationale
  const signals = [];
  if (steps.some(s => s.isJudgment))    signals.push("human judgment/approval step detected");
  if (steps.some(s => s.isOutputShift)) signals.push("output/comms activity detected");
  if (steps.some(s => s.isDataShift))   signals.push("data movement detected");
  if (relevantConnectors.length > 0)    signals.push(`uses ${relevantConnectors.length} connector(s)`);

  return {
    agentNumber,
    name,
    stepRange:  `Steps ${steps[0].stepNumber}–${steps[steps.length - 1].stepNumber}`,
    stepCount:  steps.length,
    connectors: relevantConnectors,
    rationale:  signals.length > 0
      ? signals.join("; ")
      : "natural grouping by workflow activity",
    buildFirst: false,
    steps:      steps.map(s => s.stepNumber),
  };
}

function markBuildOrder(groups, allConnectors) {
  if (groups.length === 0) return;

  // Score each group: prefer recipe-ready connectors + central/non-communication role
  let bestScore = -1;
  let bestIdx   = 0;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const groupConnectors = group.connectors.map(id =>
      allConnectors.find(c => c.connectorId === id)
    ).filter(Boolean);

    const recipeReadyCount = groupConnectors.filter(c => c.recipeReady).length;
    const isCentral = !group.name.includes("Gatherer") && !group.name.includes("Comms");
    const score = recipeReadyCount * 2 + (isCentral ? 1 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestIdx   = i;
    }
  }

  groups[bestIdx].buildFirst = true;
}

function computeToolOverlap(toolsA = "", toolsB = "") {
  if (!toolsA || !toolsB) return 0;
  const setA = new Set(toolsA.toLowerCase().split(/[\s,;]+/).filter(Boolean));
  const setB = new Set(toolsB.toLowerCase().split(/[\s,;]+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(x => setB.has(x)).length;
  return intersection / Math.max(setA.size, setB.size);
}

// ─── Main export: full detection pipeline ────────────────────────────────────

/**
 * Runs the full detection pipeline on a session state.
 *
 * @param {object} sessionState   - Interview session state
 * @param {object} [openaiClient] - Optional: OpenAI client for AI enhancement
 * @returns {Promise<DetectionResult>}
 *
 * DetectionResult shape:
 * {
 *   connectors: [
 *     {
 *       connectorId, name, category, tier, recipeReady,
 *       confidence, matchedKeywords, occurrences, aiDetected?
 *     }
 *   ],
 *   agentBoundaries: [
 *     {
 *       agentNumber, name, stepRange, connectors,
 *       rationale, buildFirst, steps
 *     }
 *   ],
 *   summary: {
 *     totalConnectors, recipeReady, engOnly,
 *     recommendedFirstAgent, confidenceThreshold
 *   }
 * }
 */
export async function detectConnectors(sessionState, openaiClient = null) {
  // Pass 1 — keyword scan
  const rawHits  = keywordScan(sessionState);

  // Pass 2 — scoring
  let connectors = scoreAndDeduplicate(rawHits);

  // Pass 3 — AI enhancement (optional, non-blocking)
  if (openaiClient && connectors.length < 8) {
    // Only run AI pass when we have room to discover more
    const corpus = extractTextCorpus(sessionState);
    connectors   = await aiEnhancement(corpus, connectors, openaiClient);
  }

  // Filter out very low confidence hits (likely false positives)
  const CONFIDENCE_THRESHOLD = 0.45;
  const filtered = connectors.filter(c => c.confidence >= CONFIDENCE_THRESHOLD);

  // Agent boundary detection
  const workflowSteps = sessionState?.workflowSteps
    ?? sessionState?.steps
    ?? sessionState?.processSteps
    ?? [];

  const agentBoundaries = detectAgentBoundaries(workflowSteps, filtered);
  const firstAgent      = agentBoundaries.find(g => g.buildFirst) ?? agentBoundaries[0];

  return {
    connectors: filtered,
    agentBoundaries,
    summary: {
      totalConnectors:       filtered.length,
      recipeReady:           filtered.filter(c => c.recipeReady).length,
      engOnly:               filtered.filter(c => !c.recipeReady).length,
      recommendedFirstAgent: firstAgent?.name ?? null,
      confidenceThreshold:   CONFIDENCE_THRESHOLD,
    },
  };
}

// ─── Convenience: format for recipe output ───────────────────────────────────

/**
 * Returns connectors formatted for injection into the Recipe Book output.
 * Groups by tier (core always first) and filters to recipe-ready only
 * for the Recipe section, all for the Engineering section.
 */
export function formatForRecipe(detectionResult) {
  const { connectors } = detectionResult;

  return {
    // Recipe Book section — only what's usable by non-technical users
    recipeConnectors: connectors
      .filter(c => c.recipeReady)
      .map(c => {
        const cat = getById(c.connectorId);
        return {
          id:          c.connectorId,
          name:        c.name,
          tier:        c.tier,
          confidence:  c.confidence,
          recipe:      cat?.recipe ?? null,
        };
      }),

    // Engineering Doc section — all detected connectors, full detail
    engConnectors: connectors.map(c => {
      const cat = getById(c.connectorId);
      return {
        id:          c.connectorId,
        name:        c.name,
        tier:        c.tier,
        confidence:  c.confidence,
        engineering: cat?.engineering ?? null,
      };
    }),
  };
}
