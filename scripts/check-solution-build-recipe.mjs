import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "discovery-intake-webapp");
const appUrl = process.env.APP_URL || "http://localhost:5177";
const appPath = path.join(appDir, "app.js");
const outputDir = path.join(appDir, "test-outputs/solution-build-recipe");
const outputPath = path.join(outputDir, "solution-build-recipe.json");
const browserExecutable = process.env.CHROME_EXECUTABLE || firstExistingPath([
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
]);

function firstExistingPath(candidates) {
  return candidates.find((candidate) => fsSync.existsSync(candidate)) || "";
}

function loadDefaultState() {
  const source = fsSync.readFileSync(appPath, "utf8");
  const start = source.indexOf("const defaultState = ");
  const end = source.indexOf("\n\nlet state = loadState();", start);
  if (start < 0 || end < 0) throw new Error("Could not locate defaultState in app.js.");
  const sandbox = { Date, result: null };
  vm.runInNewContext(`${source.slice(start, end)}\nresult = defaultState;`, sandbox);
  return sandbox.result;
}

function recipeState(label, overrides = {}) {
  const now = new Date().toISOString();
  const state = JSON.parse(JSON.stringify(loadDefaultState()));
  state.appMode = "analysis";
  state.activeWorkbenchTab = "blueprint";
  state.sessionMeta = {
    ...(state.sessionMeta || {}),
    id: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,
    name: label,
    owner: "Solution recipe reviewer",
    source: "Solution build recipe smoke",
    dataClassification: "Synthetic / sample",
    updatedAt: now
  };
  state.fields = {
    ...(state.fields || {}),
    workflowName: label,
    submittedWorkflowTask: label,
    submittedIdea: `Use AI to improve ${label}.`,
    submittedFrequency: "Weekly",
    submittedCurrentEffort: "4 hours",
    submittedExpectedImpact: "Reduce preparation effort and improve consistency.",
    submittedHumanReviewNeeded: "Human owner reviews before use.",
    businessOutcome: "Produce a reviewed output faster with traceable sources.",
    currentStateSummary: "A user gathers context, drafts an output, and routes it for review.",
    definitionOfDone: "Reviewed output, source notes, and open questions are ready.",
    peopleInvolved: "Analyst, manager, reviewer",
    outputConsumer: "Delivery team",
    valueHypothesis: "Less rework and faster turnaround.",
    biggestPain: "Repeated manual synthesis.",
    averageDuration: "4 hours",
    runsPerPeriod: "4 times per month",
    hoursSavedHypothesis: "1-2 hours saved per run",
    successMetrics: "Time saved, review quality, rework avoided",
    mvpScope: "Run one safe sample through the AI-assisted workflow and review the result.",
    solutionHypothesis: "AI can gather context, synthesize a draft, and preserve human review.",
    solutionType: "Prompt/Playbook",
    msaBoundary: "Uses sanitized/exported artifacts",
    deploymentEnvironment: "Company internal",
    humanJudgmentArea: "Reviewer approval before final use",
    fieldConfidence: "Medium",
    priority: "Medium",
    ...overrides.fields
  };
  state.steps = overrides.steps || [];
  state.systems = overrides.systems || [];
  state.data = overrides.data || [];
  state.decisions = overrides.decisions || [];
  return state;
}

const scenarios = [
  {
    label: "ChatGPT file synthesis",
    expectedRoute: /ChatGPT-first/i,
    state: recipeState("ChatGPT file synthesis", {
      fields: {
        submittedWhereToday: "Uploaded PDFs, notes, and templates",
        toolFitRecommendation: "ChatGPT Enterprise project with reusable instructions and files",
        solutionType: "Prompt/Playbook"
      },
      steps: [
        { name: "Collect approved files", actor: "Analyst", tool: "Local files", action: "Upload sample documents", input: "PDF and notes", output: "Source set", pattern: "Retrieve" },
        { name: "Draft summary", actor: "Analyst", tool: "ChatGPT", action: "Synthesize draft", input: "Source set", output: "Reviewed summary", pattern: "Summarize" }
      ],
      data: [
        { category: "Approved files", source: "Manual upload", format: "PDF / notes", sensitivity: "Internal", usage: "Reference" }
      ]
    })
  },
  {
    label: "Microsoft 365 workshop prep",
    expectedRoute: /Microsoft 365 Copilot-first/i,
    state: recipeState("Microsoft 365 workshop prep", {
      fields: {
        submittedWhereToday: "Teams, SharePoint, PowerPoint, Word, and Outlook",
        toolFitRecommendation: "Microsoft 365 Copilot with approved SharePoint and Office context",
        solutionType: "Copilot/Assistant"
      },
      steps: [
        { name: "Find prior materials", actor: "Consultant", tool: "SharePoint, PowerPoint", accessMode: "Microsoft 365", action: "Search approved examples", input: "Workshop objective", output: "Candidate materials", pattern: "Retrieve" },
        { name: "Draft workshop packet", actor: "Consultant", tool: "PowerPoint, Word", accessMode: "Microsoft 365", action: "Draft agenda and deck", input: "Examples and notes", output: "Draft packet", pattern: "Generate" }
      ],
      systems: [
        { name: "SharePoint", purpose: "Approved templates", access: "Microsoft 365" },
        { name: "PowerPoint", purpose: "Final deck", access: "Microsoft 365" }
      ],
      data: [
        { category: "Templates", source: "SharePoint", format: "PowerPoint", sensitivity: "Internal", usage: "Reference" }
      ]
    })
  },
  {
    label: "Hybrid approval workflow",
    expectedRoute: /Hybrid/i,
    state: recipeState("Hybrid approval workflow", {
      fields: {
        submittedWhereToday: "Teams, SharePoint, Excel tracker, Outlook approvals",
        toolFitRecommendation: "ChatGPT for reasoning and Copilot Studio for repeatable routing",
        solutionType: "Agent"
      },
      steps: [
        { name: "Read request", actor: "Coordinator", tool: "Teams", action: "Review intake", input: "Request", output: "Validated request", decision: "Accept or return", pattern: "Classify" },
        { name: "Pull evidence", actor: "Analyst", tool: "SharePoint", action: "Find supporting files", input: "Validated request", output: "Evidence set", pattern: "Retrieve" },
        { name: "Draft update", actor: "Analyst", tool: "ChatGPT", action: "Generate update", input: "Evidence set", output: "Draft response", pattern: "Generate" },
        { name: "Update tracker", actor: "Coordinator", tool: "Excel", action: "Create tracker row", input: "Approved response", output: "Updated record", pattern: "Transform" },
        { name: "Notify owner", actor: "Coordinator", tool: "Outlook", action: "Send approval note", input: "Updated record", output: "Notification", decision: "Owner approves", pattern: "Route" }
      ],
      systems: [
        { name: "Teams", purpose: "Requests", access: "Microsoft 365" },
        { name: "SharePoint", purpose: "Evidence", access: "Microsoft 365" },
        { name: "Excel", purpose: "Tracker", access: "Microsoft 365" }
      ],
      decisions: [
        { decision: "Approve final response", owner: "Manager", criteria: "Accurate and safe", approval: "Required" },
        { decision: "Update enterprise tracker", owner: "Process owner", criteria: "Approved record", approval: "Required" }
      ],
      data: [
        { category: "Request records", source: "Teams and Excel", format: "Message / spreadsheet", sensitivity: "Internal", usage: "Input" }
      ]
    })
  }
];

function failIf(condition, failures, message) {
  if (condition) failures.push(message);
}

async function evaluateScenario(page, scenario) {
  await page.evaluate((seedState) => {
    window.localStorage.setItem("discovery-intake-state", JSON.stringify(seedState));
    window.location.reload();
  }, scenario.state);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => typeof window.deriveSolutionBuildRecipe === "function" && typeof window.solutionBuildRoute === "function", null, { timeout: 10000 });
  return page.evaluate(() => {
    const product = deriveProductBrief();
    const engineering = deriveEngineeringBrief();
    const business = deriveBusinessBrief();
    const governance = deriveGovernanceBrief();
    const recipe = deriveSolutionBuildRecipe(product, engineering, business);
    const spec = deriveSolutionBuildSpec(recipe);
    const capabilityPlan = deriveSolutionCapabilityPlan(spec);
    const executionPlan = deriveSolutionExecutionPlan(spec);
    const executionBrief = deriveSolutionExecutionBrief(executionPlan);
    const connectorContracts = deriveEnterpriseConnectorContracts(spec);
    const connectorApprovalChecklist = deriveConnectorApprovalChecklist(connectorContracts);
    const connectorValidationPlan = deriveConnectorValidationPlan(connectorContracts, connectorApprovalChecklist);
    const connectorValidationEvidenceLog = deriveConnectorValidationEvidenceLog(connectorValidationPlan);
    const connectorBuildRequestPack = deriveConnectorBuildRequestPack(connectorContracts, connectorApprovalChecklist, connectorValidationPlan, connectorValidationEvidenceLog);
    const connectorPilotRunbook = deriveConnectorPilotRunbook(connectorBuildRequestPack, connectorValidationPlan, connectorValidationEvidenceLog);
    const connectorPromotionDecisionPacket = deriveConnectorPromotionDecisionPacket(connectorPilotRunbook, connectorBuildRequestPack, connectorValidationEvidenceLog);
    const enterpriseReadinessTemplate = deriveEnterpriseReadinessTemplateBrief(deriveEnterpriseReadinessBrief(spec, connectorContracts, capabilityPlan));
    const combined = deriveCombinedHandoff(product, engineering, business, recipe, executionBrief, enterpriseReadinessTemplate);
    const route = solutionBuildRoute();
    const contract = deriveTemplateAlignmentContract(product, engineering, business, governance, combined, recipe, executionBrief, enterpriseReadinessTemplate);
    const manifest = deriveOutputManifest(product, engineering, business, governance, combined, recipe, executionBrief, enterpriseReadinessTemplate);
    return {
      route,
      recipe,
      spec,
      capabilityPlan,
      executionPlan,
      connectorContracts,
      connectorMarkdown: enterpriseConnectorContractsMarkdown(connectorContracts),
      connectorApprovalChecklist,
      connectorApprovalRows: connectorApprovalChecklistRows(connectorApprovalChecklist),
      connectorApprovalMarkdown: connectorApprovalChecklistMarkdown(connectorApprovalChecklist),
      connectorValidationPlan,
      connectorValidationRows: connectorValidationPlanRows(connectorValidationPlan),
      connectorValidationMarkdown: connectorValidationPlanMarkdown(connectorValidationPlan),
      connectorValidationEvidenceLog,
      connectorValidationEvidenceRows: connectorValidationEvidenceLogRows(connectorValidationEvidenceLog),
      connectorValidationEvidenceMarkdown: connectorValidationEvidenceLogMarkdown(connectorValidationEvidenceLog),
      connectorBuildRequestPack,
      connectorBuildRequestRows: connectorBuildRequestRows(connectorBuildRequestPack),
      connectorBuildRequestMarkdown: connectorBuildRequestMarkdown(connectorBuildRequestPack),
      connectorPilotRunbook,
      connectorPilotRunbookRows: connectorPilotRunbookRows(connectorPilotRunbook),
      connectorPilotRunbookMarkdown: connectorPilotRunbookMarkdown(connectorPilotRunbook),
      connectorPromotionDecisionPacket,
      connectorPromotionDecisionRows: connectorPromotionDecisionRows(connectorPromotionDecisionPacket),
      connectorPromotionDecisionMarkdown: connectorPromotionDecisionMarkdown(connectorPromotionDecisionPacket),
      rows: solutionBuildRecipeRows(recipe),
      specRows: solutionBuildSpecRows(spec),
      capabilityRows: solutionCapabilityPlanRows(capabilityPlan),
      executionRows: solutionExecutionPlanRows(executionPlan),
      connectorRows: enterpriseConnectorContractRows(connectorContracts),
      documentIds: (contract.documents || []).map((document) => document.id),
      manifestIds: manifest.map((item) => item.contractId),
      connectorManifest: manifest.find((item) => item.contractId === "enterprise-connector-contracts") || {},
      workbookSheets: contract.workbookSheets,
      packageFiles: contract.packageManifestFiles
    };
  });
}

await fs.mkdir(outputDir, { recursive: true });
const launchOptions = { headless: true };
if (browserExecutable) launchOptions.executablePath = browserExecutable;
const browser = await chromium.launch(launchOptions);
const results = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${appUrl}/?solution-build-recipe-smoke=1`, { waitUntil: "domcontentloaded" });
  for (const scenario of scenarios) {
    results.push({ scenario: scenario.label, expectedRoute: String(scenario.expectedRoute), payload: await evaluateScenario(page, scenario) });
  }
  await context.close();
} finally {
  await browser.close();
}

const failures = [];
for (const result of results) {
  const scenario = scenarios.find((item) => item.label === result.scenario);
  const { payload } = result;
  failIf(!scenario.expectedRoute.test(payload.route.label), failures, `${result.scenario} route was ${payload.route.label}`);
  failIf(payload.recipe.id !== "solution-build-recipe", failures, `${result.scenario} recipe id is incorrect`);
  failIf(payload.recipe.sections.length < 8, failures, `${result.scenario} recipe has too few sections`);
  failIf(!payload.recipe.markdown.includes("ChatGPT"), failures, `${result.scenario} recipe missing ChatGPT guidance`);
  failIf(!payload.recipe.markdown.includes("Microsoft Copilot"), failures, `${result.scenario} recipe missing Microsoft Copilot guidance`);
  failIf(!payload.recipe.markdown.includes("MVP Build Steps"), failures, `${result.scenario} recipe missing MVP build steps`);
  failIf(payload.spec.version !== 1, failures, `${result.scenario} solution build spec has incorrect version`);
  failIf(payload.spec.route.routeType !== payload.route.routeType, failures, `${result.scenario} solution build spec route does not match recipe route`);
  failIf(!payload.spec.platforms.some((platform) => platform.id === "chatgpt"), failures, `${result.scenario} spec missing ChatGPT platform`);
  failIf(!payload.spec.platforms.some((platform) => platform.id === "microsoft-copilot"), failures, `${result.scenario} spec missing Microsoft Copilot platform`);
  failIf(!payload.spec.connectors.length, failures, `${result.scenario} spec missing connector contracts`);
  failIf(!payload.specRows.some((row) => row.includes("Connector")), failures, `${result.scenario} spec rows missing connector area`);
  failIf(!payload.specRows.some((row) => row.includes("Capability")), failures, `${result.scenario} spec rows missing capability area`);
  failIf(payload.capabilityPlan.version !== 1, failures, `${result.scenario} capability plan has incorrect version`);
  failIf(payload.capabilityPlan.routeType !== payload.route.routeType, failures, `${result.scenario} capability plan route does not match recipe route`);
  failIf(!payload.capabilityPlan.chatgptCapabilities?.length, failures, `${result.scenario} capability plan missing ChatGPT capabilities`);
  failIf(!payload.capabilityPlan.microsoftCopilotCapabilities?.length, failures, `${result.scenario} capability plan missing Microsoft Copilot capabilities`);
  failIf(!payload.capabilityPlan.humanCheckpoints?.length, failures, `${result.scenario} capability plan missing human checkpoints`);
  failIf(!payload.capabilityPlan.buildPhases?.length, failures, `${result.scenario} capability plan missing build phases`);
  failIf(!payload.capabilityRows[0].includes("Capability / Checkpoint / Phase"), failures, `${result.scenario} capability rows missing capability/checkpoint/phase column`);
  failIf(payload.executionPlan.version !== 1, failures, `${result.scenario} execution plan has incorrect version`);
  failIf(payload.executionPlan.routeType !== payload.route.routeType, failures, `${result.scenario} execution plan route does not match recipe route`);
  failIf(!payload.executionPlan.items?.length, failures, `${result.scenario} execution plan missing builder actions`);
  failIf(!payload.executionPlan.items?.some((item) => item.platform.includes("ChatGPT")), failures, `${result.scenario} execution plan missing ChatGPT action`);
  failIf(!payload.executionPlan.items?.some((item) => item.platform.includes("Microsoft 365")), failures, `${result.scenario} execution plan missing Microsoft 365 action`);
  failIf(!payload.executionPlan.items?.every((item) => item.dataInputs && item.permissionsNeeded && item.enterpriseControls && item.humanCheckpoint && item.expectedOutput), failures, `${result.scenario} execution plan missing data/permissions/control/gate/output fields`);
  failIf(!payload.executionRows[0].includes("Permissions Needed"), failures, `${result.scenario} execution rows missing permissions column`);
  failIf(!payload.executionRows[0].includes("Human Checkpoint"), failures, `${result.scenario} execution rows missing human checkpoint column`);
  failIf(payload.connectorContracts.version !== 1, failures, `${result.scenario} enterprise connector contract has incorrect version`);
  failIf(!payload.connectorContracts.contracts.length, failures, `${result.scenario} enterprise connector contract pack is empty`);
  failIf(!payload.connectorContracts.contracts.every((contract) => contract.authModel && contract.readWriteMode && contract.requiredApprovals), failures, `${result.scenario} connector contracts missing auth/read-write/approval fields`);
  failIf(!payload.connectorContracts.contracts.every((contract) => contract.sourceLocations && contract.permissionScope && contract.allowedOperations && contract.blockedOperations), failures, `${result.scenario} connector contracts missing source location / permission scope / operation boundary fields`);
  failIf(!payload.connectorContracts.contracts.every((contract) => contract.approvalGate && contract.pilotDataPolicy && contract.fallbackMode), failures, `${result.scenario} connector contracts missing approval gate / pilot data policy / fallback mode fields`);
  failIf(!payload.connectorContracts.contracts.some((contract) => /microsoft|copilot/i.test(`${contract.platform} ${contract.connectorType}`) && /SharePoint|Teams|PowerPoint|Excel|Microsoft 365|OneDrive|Outlook|Word/i.test(`${contract.sourceLocations} ${contract.allowedOperations}`)), failures, `${result.scenario} connector contracts missing Microsoft 365 source-location detail`);
  failIf(!payload.connectorRows[0].includes("Required Approvals"), failures, `${result.scenario} connector rows missing required approvals column`);
  failIf(!payload.connectorRows[0].includes("Source Locations"), failures, `${result.scenario} connector rows missing source locations column`);
  failIf(!payload.connectorRows[0].includes("Permission Scope"), failures, `${result.scenario} connector rows missing permission scope column`);
  failIf(!payload.connectorRows[0].includes("Blocked Operations"), failures, `${result.scenario} connector rows missing blocked operations column`);
  failIf(!payload.connectorRows[0].includes("Fallback Mode"), failures, `${result.scenario} connector rows missing fallback mode column`);
  failIf(!payload.connectorMarkdown.includes("Source locations"), failures, `${result.scenario} connector markdown missing source locations`);
  failIf(!payload.connectorMarkdown.includes("Approval Gate"), failures, `${result.scenario} connector markdown missing approval gate`);
  failIf(!payload.connectorMarkdown.includes("Fallback mode"), failures, `${result.scenario} connector markdown missing fallback mode`);
  failIf(payload.connectorApprovalChecklist.version !== 1, failures, `${result.scenario} connector approval checklist has incorrect version`);
  failIf(!payload.connectorApprovalChecklist.items?.length, failures, `${result.scenario} connector approval checklist is empty`);
  failIf(!payload.connectorApprovalChecklist.items?.every((item) => item.requiredEvidence?.length && item.decisionOptions?.length && item.approvalGate && item.fallbackMode), failures, `${result.scenario} connector approval checklist missing evidence/options/gate/fallback fields`);
  failIf(!payload.connectorApprovalRows[0].includes("Required Evidence"), failures, `${result.scenario} connector approval rows missing required evidence column`);
  failIf(!payload.connectorApprovalRows[0].includes("Decision Options"), failures, `${result.scenario} connector approval rows missing decision options column`);
  failIf(!payload.connectorApprovalMarkdown.includes("Required Evidence"), failures, `${result.scenario} connector approval markdown missing Required Evidence`);
  failIf(!payload.connectorApprovalMarkdown.includes("Decision Options"), failures, `${result.scenario} connector approval markdown missing Decision Options`);
  failIf(payload.connectorValidationPlan.version !== 1, failures, `${result.scenario} connector validation plan has incorrect version`);
  failIf(!payload.connectorValidationPlan.tests?.length, failures, `${result.scenario} connector validation plan is empty`);
  failIf(!payload.connectorValidationPlan.tests?.every((test) => test.testArea && test.expectedEvidence && test.passCriteria && test.fallbackIfFailed && test.status), failures, `${result.scenario} connector validation plan missing required test fields`);
  ["Source reachability", "Permission boundary", "Blocked operations", "Pilot data policy", "Audit evidence", "Human review gate", "Fallback mode"].forEach((area) => failIf(!payload.connectorValidationPlan.tests.some((test) => test.testArea === area), failures, `${result.scenario} connector validation plan missing ${area}`));
  failIf(!payload.connectorValidationRows[0].includes("Expected Evidence"), failures, `${result.scenario} connector validation rows missing expected evidence column`);
  failIf(!payload.connectorValidationRows[0].includes("Pass Criteria"), failures, `${result.scenario} connector validation rows missing pass criteria column`);
  failIf(!payload.connectorValidationMarkdown.includes("Source reachability"), failures, `${result.scenario} connector validation markdown missing source reachability`);
  failIf(!payload.connectorValidationMarkdown.includes("Blocked operations"), failures, `${result.scenario} connector validation markdown missing blocked operations`);
  failIf(payload.connectorValidationEvidenceLog.version !== 1, failures, `${result.scenario} connector validation evidence log has incorrect version`);
  failIf(!payload.connectorValidationEvidenceLog.entries?.length, failures, `${result.scenario} connector validation evidence log is empty`);
  failIf(!payload.connectorValidationEvidenceLog.entries?.every((entry) => entry.proofToCapture && entry.evidenceOwner && entry.resultOptions?.length && entry.decisionImpact && entry.packageTarget), failures, `${result.scenario} connector validation evidence log missing proof/owner/options/decision/package fields`);
  failIf(!payload.connectorValidationEvidenceRows[0].includes("Proof To Capture"), failures, `${result.scenario} connector validation evidence rows missing proof column`);
  failIf(!payload.connectorValidationEvidenceRows[0].includes("Decision Impact"), failures, `${result.scenario} connector validation evidence rows missing decision impact column`);
  failIf(!payload.connectorValidationEvidenceMarkdown.includes("Evidence Summary"), failures, `${result.scenario} connector validation evidence markdown missing Evidence Summary`);
  failIf(!payload.connectorValidationEvidenceMarkdown.includes("Result options"), failures, `${result.scenario} connector validation evidence markdown missing result options`);
  failIf(payload.connectorBuildRequestPack.version !== 1, failures, `${result.scenario} connector build request pack has incorrect version`);
  failIf(!payload.connectorBuildRequestPack.requests?.length, failures, `${result.scenario} connector build request pack is empty`);
  failIf(!payload.connectorBuildRequestPack.requests?.every((request) => request.requestType && request.requestedDecision && request.minimumBuildScope && request.evidencePackage && request.nextAction), failures, `${result.scenario} connector build request pack missing type/decision/scope/evidence/action fields`);
  failIf(!payload.connectorBuildRequestRows[0].includes("Requested Decision"), failures, `${result.scenario} connector build request rows missing requested decision column`);
  failIf(!payload.connectorBuildRequestRows[0].includes("Minimum Build Scope"), failures, `${result.scenario} connector build request rows missing minimum build scope column`);
  failIf(!payload.connectorBuildRequestMarkdown.includes("Request Summary"), failures, `${result.scenario} connector build request markdown missing Request Summary`);
  failIf(!payload.connectorBuildRequestMarkdown.includes("Minimum build scope"), failures, `${result.scenario} connector build request markdown missing minimum build scope`);
  failIf(payload.connectorPilotRunbook.version !== 1, failures, `${result.scenario} connector pilot runbook has incorrect version`);
  failIf(!payload.connectorPilotRunbook.steps?.length, failures, `${result.scenario} connector pilot runbook is empty`);
  failIf(!payload.connectorPilotRunbook.steps?.every((step) => step.phase && step.action && step.owner && step.status && step.entryCriteria && step.evidenceToCapture && step.passCriteria && step.stopTrigger && step.fallbackAction && step.decisionGate && step.packageEvidence), failures, `${result.scenario} connector pilot runbook missing phase/action/owner/status/evidence/gate fields`);
  ["Pilot preflight", "Safe sample setup", "Access setup", "Validation run", "Evidence capture", "Human signoff", "Fallback drill", "Promotion decision"].forEach((phase) => failIf(!payload.connectorPilotRunbook.steps.some((step) => step.phase === phase), failures, `${result.scenario} connector pilot runbook missing ${phase}`));
  failIf(!payload.connectorPilotRunbookRows[0].includes("Stop Trigger"), failures, `${result.scenario} connector pilot runbook rows missing stop trigger column`);
  failIf(!payload.connectorPilotRunbookRows[0].includes("Decision Gate"), failures, `${result.scenario} connector pilot runbook rows missing decision gate column`);
  failIf(!payload.connectorPilotRunbookRows[0].includes("Package Evidence"), failures, `${result.scenario} connector pilot runbook rows missing package evidence column`);
  failIf(!payload.connectorPilotRunbookMarkdown.includes("Pilot Summary"), failures, `${result.scenario} connector pilot runbook markdown missing Pilot Summary`);
  failIf(!payload.connectorPilotRunbookMarkdown.includes("Fallback action"), failures, `${result.scenario} connector pilot runbook markdown missing Fallback action`);
  failIf(!payload.connectorPilotRunbookMarkdown.includes("Promotion decision"), failures, `${result.scenario} connector pilot runbook markdown missing Promotion decision`);
  failIf(payload.connectorPromotionDecisionPacket.version !== 1, failures, `${result.scenario} connector promotion decision packet has incorrect version`);
  failIf(!payload.connectorPromotionDecisionPacket.decisions?.length, failures, `${result.scenario} connector promotion decision packet is empty`);
  failIf(!payload.connectorPromotionDecisionPacket.decisions?.every((decision) => decision.recommendedDecision && decision.decisionStatus && decision.owner && decision.pilotReadiness && decision.evidenceStatus && decision.promotionScope && decision.conditions?.length && decision.openGaps?.length && decision.fallbackPosture && decision.enterpriseHandoff && decision.stopCriteria && decision.nextAction && decision.packageEvidence), failures, `${result.scenario} connector promotion decision packet missing decision/status/evidence/fallback/handoff fields`);
  failIf(!payload.connectorPromotionDecisionRows[0].includes("Recommended Decision"), failures, `${result.scenario} connector promotion decision rows missing recommended decision column`);
  failIf(!payload.connectorPromotionDecisionRows[0].includes("Enterprise Handoff"), failures, `${result.scenario} connector promotion decision rows missing enterprise handoff column`);
  failIf(!payload.connectorPromotionDecisionRows[0].includes("Stop Criteria"), failures, `${result.scenario} connector promotion decision rows missing stop criteria column`);
  failIf(!payload.connectorPromotionDecisionMarkdown.includes("Decision Summary"), failures, `${result.scenario} connector promotion decision markdown missing Decision Summary`);
  failIf(!payload.connectorPromotionDecisionMarkdown.includes("Recommended decision"), failures, `${result.scenario} connector promotion decision markdown missing recommended decision`);
  failIf(!payload.connectorPromotionDecisionMarkdown.includes("Enterprise handoff"), failures, `${result.scenario} connector promotion decision markdown missing enterprise handoff`);
  failIf(!payload.rows[0].includes("Owner Route"), failures, `${result.scenario} recipe rows missing owner route`);
  failIf(!payload.rows.some((row) => row.includes("Recommended route")), failures, `${result.scenario} recipe rows missing recommended route`);
  failIf(!payload.documentIds.includes("solution-build-recipe"), failures, `${result.scenario} template contract missing solution-build-recipe`);
  failIf(!payload.documentIds.includes("solution-execution-plan"), failures, `${result.scenario} template contract missing solution-execution-plan`);
  failIf(!payload.documentIds.includes("enterprise-readiness-brief"), failures, `${result.scenario} template contract missing enterprise-readiness-brief`);
  failIf(!payload.manifestIds.includes("solution-build-recipe"), failures, `${result.scenario} output manifest missing solution-build-recipe`);
  failIf(!payload.manifestIds.includes("solution-build-spec"), failures, `${result.scenario} output manifest missing solution-build-spec`);
  failIf(!payload.manifestIds.includes("solution-capability-plan"), failures, `${result.scenario} output manifest missing solution-capability-plan`);
  failIf(!payload.manifestIds.includes("solution-execution-plan"), failures, `${result.scenario} output manifest missing solution-execution-plan`);
  failIf(!payload.manifestIds.includes("enterprise-connector-contracts"), failures, `${result.scenario} output manifest missing enterprise-connector-contracts`);
  failIf(!payload.manifestIds.includes("connector-approval-checklist"), failures, `${result.scenario} output manifest missing connector-approval-checklist`);
  failIf(!payload.manifestIds.includes("connector-validation-plan"), failures, `${result.scenario} output manifest missing connector-validation-plan`);
  failIf(!payload.manifestIds.includes("connector-validation-evidence-log"), failures, `${result.scenario} output manifest missing connector-validation-evidence-log`);
  failIf(!payload.manifestIds.includes("connector-build-request-pack"), failures, `${result.scenario} output manifest missing connector-build-request-pack`);
  failIf(!payload.manifestIds.includes("connector-pilot-runbook"), failures, `${result.scenario} output manifest missing connector-pilot-runbook`);
  failIf(!payload.manifestIds.includes("connector-promotion-decision-packet"), failures, `${result.scenario} output manifest missing connector-promotion-decision-packet`);
  failIf(!String(payload.connectorManifest.packageFiles || "").includes("enterprise-connector-contracts.md"), failures, `${result.scenario} enterprise connector manifest missing Markdown package file`);
  failIf(!String(payload.connectorManifest.packageFiles || "").includes("enterprise-connector-contracts.docx"), failures, `${result.scenario} enterprise connector manifest missing DOCX package file`);
  failIf(!payload.workbookSheets.includes("Solution Build Recipe"), failures, `${result.scenario} workbook sheets missing Solution Build Recipe`);
  failIf(!payload.packageFiles.includes("solution-build-recipe.docx"), failures, `${result.scenario} package files missing solution-build-recipe.docx`);
  failIf(!payload.packageFiles.includes("solution-build-recipe-rows.json"), failures, `${result.scenario} package files missing solution-build-recipe-rows.json`);
  failIf(!payload.packageFiles.includes("solution-build-spec.json"), failures, `${result.scenario} package files missing solution-build-spec.json`);
  failIf(!payload.packageFiles.includes("solution-build-spec-rows.json"), failures, `${result.scenario} package files missing solution-build-spec-rows.json`);
  failIf(!payload.packageFiles.includes("solution-capability-plan.json"), failures, `${result.scenario} package files missing solution-capability-plan.json`);
  failIf(!payload.packageFiles.includes("solution-capability-plan-rows.json"), failures, `${result.scenario} package files missing solution-capability-plan-rows.json`);
  failIf(!payload.packageFiles.includes("solution-execution-plan.json"), failures, `${result.scenario} package files missing solution-execution-plan.json`);
  failIf(!payload.packageFiles.includes("solution-execution-plan.md"), failures, `${result.scenario} package files missing solution-execution-plan.md`);
  failIf(!payload.packageFiles.includes("solution-execution-plan.docx"), failures, `${result.scenario} package files missing solution-execution-plan.docx`);
  failIf(!payload.packageFiles.includes("solution-execution-plan-rows.json"), failures, `${result.scenario} package files missing solution-execution-plan-rows.json`);
  failIf(!payload.packageFiles.includes("enterprise-connector-contracts.md"), failures, `${result.scenario} package files missing enterprise-connector-contracts.md`);
  failIf(!payload.packageFiles.includes("enterprise-connector-contracts.docx"), failures, `${result.scenario} package files missing enterprise-connector-contracts.docx`);
  failIf(!payload.packageFiles.includes("connector-approval-checklist.md"), failures, `${result.scenario} package files missing connector-approval-checklist.md`);
  failIf(!payload.packageFiles.includes("connector-approval-checklist.docx"), failures, `${result.scenario} package files missing connector-approval-checklist.docx`);
  failIf(!payload.packageFiles.includes("connector-validation-plan.md"), failures, `${result.scenario} package files missing connector-validation-plan.md`);
  failIf(!payload.packageFiles.includes("connector-validation-plan.docx"), failures, `${result.scenario} package files missing connector-validation-plan.docx`);
  failIf(!payload.packageFiles.includes("connector-validation-evidence-log.md"), failures, `${result.scenario} package files missing connector-validation-evidence-log.md`);
  failIf(!payload.packageFiles.includes("connector-validation-evidence-log.docx"), failures, `${result.scenario} package files missing connector-validation-evidence-log.docx`);
  failIf(!payload.packageFiles.includes("connector-build-request-pack.md"), failures, `${result.scenario} package files missing connector-build-request-pack.md`);
  failIf(!payload.packageFiles.includes("connector-build-request-pack.docx"), failures, `${result.scenario} package files missing connector-build-request-pack.docx`);
  failIf(!payload.packageFiles.includes("connector-pilot-runbook.md"), failures, `${result.scenario} package files missing connector-pilot-runbook.md`);
  failIf(!payload.packageFiles.includes("connector-pilot-runbook.docx"), failures, `${result.scenario} package files missing connector-pilot-runbook.docx`);
  failIf(!payload.packageFiles.includes("connector-promotion-decision-packet.md"), failures, `${result.scenario} package files missing connector-promotion-decision-packet.md`);
  failIf(!payload.packageFiles.includes("connector-promotion-decision-packet.docx"), failures, `${result.scenario} package files missing connector-promotion-decision-packet.docx`);
  failIf(!payload.packageFiles.includes("enterprise-readiness-brief.docx"), failures, `${result.scenario} package files missing enterprise-readiness-brief.docx`);
}

await fs.writeFile(outputPath, `${JSON.stringify({
  appUrl,
  checkedAt: new Date().toISOString(),
  passed: failures.length === 0,
  failures,
  results: results.map((result) => ({
    scenario: result.scenario,
    route: result.payload.route,
    readiness: result.payload.recipe.readiness,
    sections: result.payload.recipe.sections.map((section) => section.title)
  }))
}, null, 2)}\n`);

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`OK solution build recipe smoke passed for ${results.length} ChatGPT/Copilot routing scenarios`);
}
