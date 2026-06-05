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
const outputDir = path.join(appDir, "test-outputs/handoff-package-contract");
const outputPath = path.join(outputDir, "handoff-package-contract.json");
const browserExecutable = process.env.CHROME_EXECUTABLE || firstExistingPath([
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
]);

const requiredPackageFiles = [
  "product-pdr-template.docx",
  "engineering-brief-template.docx",
  "business-value-template.docx",
  "governance-inputs-template.docx",
  "solution-build-recipe.docx",
  "solution-build-recipe.json",
  "solution-build-recipe-rows.json",
  "solution-build-spec.json",
  "solution-build-spec-rows.json",
  "solution-capability-plan.json",
  "solution-capability-plan-rows.json",
  "solution-execution-plan.json",
  "solution-execution-plan.md",
  "solution-execution-plan.docx",
  "solution-execution-plan-rows.json",
  "enterprise-connector-contracts.json",
  "enterprise-connector-contracts.md",
  "enterprise-connector-contracts.docx",
  "enterprise-connector-contract-rows.json",
  "connector-approval-checklist.json",
  "connector-approval-checklist.md",
  "connector-approval-checklist.docx",
  "connector-approval-checklist-rows.json",
  "connector-validation-plan.json",
  "connector-validation-plan.md",
  "connector-validation-plan.docx",
  "connector-validation-plan-rows.json",
  "connector-validation-evidence-log.json",
  "connector-validation-evidence-log.md",
  "connector-validation-evidence-log.docx",
  "connector-validation-evidence-log-rows.json",
  "connector-build-request-pack.json",
  "connector-build-request-pack.md",
  "connector-build-request-pack.docx",
  "connector-build-request-pack-rows.json",
  "connector-pilot-runbook.json",
  "connector-pilot-runbook.md",
  "connector-pilot-runbook.docx",
  "connector-pilot-runbook-rows.json",
  "connector-promotion-decision-packet.json",
  "connector-promotion-decision-packet.md",
  "connector-promotion-decision-packet.docx",
  "connector-promotion-decision-packet-rows.json",
  "enterprise-readiness-brief.json",
  "enterprise-readiness-brief.md",
  "enterprise-readiness-brief.docx",
  "enterprise-readiness-brief-rows.json",
  "combined-handoff-packet.json",
  "combined-handoff-packet.md",
  "combined-handoff-packet.docx",
  "template-alignment-contract.json",
  "output-manifest.json",
  "output-manifest-rows.json",
  "connector-registry.json",
  "connector-registry-rows.json",
  "question-routing.json",
  "question-routing.md",
  "question-routing.docx",
  "package-manifest.json"
];

const expectedQuestionRoutes = [
  "Product",
  "Engineering",
  "Business",
  "Governance Inputs",
  "Finance/Ops",
  "Domain Sponsor"
];

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

function packageSmokeState() {
  const now = new Date().toISOString();
  const state = JSON.parse(JSON.stringify(loadDefaultState()));
  state.appMode = "analysis";
  state.activeWorkbenchTab = "outputs";
  state.sessionMeta = {
    ...(state.sessionMeta || {}),
    id: `handoff-package-contract-${Date.now().toString(36)}`,
    name: "Handoff Package Contract Smoke",
    owner: "Package reviewer",
    source: "Handoff package contract smoke",
    dataClassification: "Synthetic / sample",
    updatedAt: now
  };
  state.fields = {
    ...(state.fields || {}),
    workflowName: "Handoff package contract smoke",
    submittedWorkflowTask: "Preparing an approved workshop packet",
    submittedIdea: "Use AI to prepare repeatable workshop materials from approved Microsoft 365 examples.",
    submittedWhereToday: "Teams, SharePoint, PowerPoint, Word, and Outlook",
    submittedFrequency: "4 workshops per month",
    submittedCurrentEffort: "8 hours per workshop",
    submittedExpectedImpact: "Reduce prep time and improve consistency.",
    submittedHumanReviewNeeded: "Partner reviews final materials before client use.",
    businessOutcome: "Create a reviewed workshop packet faster while keeping client tailoring.",
    currentStateSummary: "The team gathers context, prior materials, and partner input, then drafts and reviews a workshop packet.",
    startPoint: "Partner asks for a workshop",
    endPoint: "Reviewed workshop packet is ready",
    definitionOfDone: "Agenda, pre-read, facilitation guide, output template, and partner-approved deck are ready.",
    peopleInvolved: "Consultant, manager, partner, domain SME",
    outputConsumer: "Engagement team and client workshop participants",
    valueHypothesis: "Reduce repeated prep work and make workshop outputs more reusable.",
    biggestPain: "Finding the right prior examples and adapting them consistently.",
    averageDuration: "8 hours",
    runsPerPeriod: "4 workshops per month",
    hoursSavedHypothesis: "2-3 hours saved per workshop",
    successMetrics: "Prep time, rework, partner satisfaction, reuse rate",
    mvpScope: "Find approved prior workshop assets and draft a first-pass packet with source notes.",
    solutionHypothesis: "A retrieval and synthesis assistant can assemble a draft workshop pack with review checkpoints.",
    solutionType: "Agent",
    toolFitRecommendation: "ChatGPT for reasoning and Microsoft 365 Copilot/Copilot Studio for approved source context and repeatable workflow routing.",
    msaBoundary: "Uses sanitized/exported artifacts",
    deploymentEnvironment: "Company internal",
    humanJudgmentArea: "Partner approval before client-facing use",
    fieldConfidence: "Medium",
    priority: "Medium"
  };
  state.steps = [
    {
      name: "Clarify workshop request",
      actor: "Engagement manager",
      tool: "Teams, Outlook",
      accessMode: "Microsoft 365 files and messages",
      action: "Clarify objective, audience, and expected output",
      input: "Partner request",
      output: "Workshop objective and scope",
      handoff: "Consultant begins asset search",
      decision: "Partner confirms objective",
      pattern: "Classify"
    },
    {
      name: "Find reusable materials",
      actor: "Consultant",
      tool: "SharePoint, PowerPoint",
      accessMode: "Approved file search",
      action: "Find prior decks, templates, and examples",
      input: "Workshop objective",
      output: "Candidate source materials",
      handoff: "Manager review",
      pattern: "Retrieve"
    },
    {
      name: "Draft workshop packet",
      actor: "Consultant",
      tool: "ChatGPT, PowerPoint, Word",
      accessMode: "User-provided or approved Microsoft 365 files",
      action: "Draft agenda, exercises, prompts, and output template",
      input: "Prior decks and partner notes",
      output: "Draft workshop packet",
      handoff: "Partner review",
      decision: "Partner approves or requests changes",
      pattern: "Generate"
    }
  ];
  state.systems = [
    { name: "Teams", purpose: "Workshop coordination", access: "Microsoft 365" },
    { name: "SharePoint", purpose: "Prior materials and templates", access: "Microsoft 365 files" },
    { name: "PowerPoint", purpose: "Final deck", access: "Microsoft 365" }
  ];
  state.data = [
    { category: "Workshop context", source: "Partner notes", format: "Email / meeting notes", sensitivity: "Client confidential", usage: "Input" },
    { category: "Reusable templates", source: "SharePoint", format: "PowerPoint", sensitivity: "Internal", usage: "Reference" }
  ];
  state.decisions = [
    { decision: "Approve final client-facing packet", owner: "Partner", criteria: "Accurate, client-specific, and safe to share", approval: "Required" }
  ];
  return state;
}

function failIf(condition, failures, message) {
  if (condition) failures.push(message);
}

async function readPackageJson(packagePath, fileName) {
  return JSON.parse(await fs.readFile(path.join(packagePath, fileName), "utf8"));
}

await fs.mkdir(outputDir, { recursive: true });
const launchOptions = { headless: true };
if (browserExecutable) launchOptions.executablePath = browserExecutable;
const browser = await chromium.launch(launchOptions);
let payload = null;
try {
  const context = await browser.newContext();
  await context.addInitScript((seedState) => {
    window.localStorage.setItem("discovery-intake-state", JSON.stringify(seedState));
  }, packageSmokeState());
  const page = await context.newPage();
  await page.goto(`${appUrl}/?handoff-package-contract-smoke=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.createHandoffPackage === "function", null, { timeout: 10000 });
  payload = await page.evaluate(async () => createHandoffPackage());
  await context.close();
} finally {
  await browser.close();
}

const failures = [];
failIf(!payload, failures, "createHandoffPackage returned no payload");
failIf(!payload?.packagePath, failures, "Package payload missing packagePath");
failIf(!payload?.zipUrl, failures, "Package payload missing zipUrl");

const packagePath = payload?.packagePath || "";
if (packagePath) {
  for (const file of requiredPackageFiles) {
    failIf(!payload.files?.includes(file), failures, `Package response missing ${file}`);
    failIf(!fsSync.existsSync(path.join(packagePath, file)), failures, `Package directory missing ${file}`);
  }
  if (!failures.length) {
    const manifest = await readPackageJson(packagePath, "output-manifest.json");
    const manifestIds = manifest.map((item) => item.contractId).filter(Boolean);
    const executionManifest = manifest.find((item) => item.contractId === "solution-execution-plan") || {};
    const connectorManifest = manifest.find((item) => item.contractId === "enterprise-connector-contracts") || {};
    const connectorApprovalManifest = manifest.find((item) => item.contractId === "connector-approval-checklist") || {};
    const connectorValidationManifest = manifest.find((item) => item.contractId === "connector-validation-plan") || {};
    const connectorEvidenceManifest = manifest.find((item) => item.contractId === "connector-validation-evidence-log") || {};
    const connectorBuildRequestManifest = manifest.find((item) => item.contractId === "connector-build-request-pack") || {};
    const connectorPilotRunbookManifest = manifest.find((item) => item.contractId === "connector-pilot-runbook") || {};
    const connectorPromotionDecisionManifest = manifest.find((item) => item.contractId === "connector-promotion-decision-packet") || {};
    const templateAlignment = await readPackageJson(packagePath, "template-alignment-contract.json");
    const templateDocumentIds = (templateAlignment.documents || []).map((document) => document.id);
    const solutionBuildSpec = await readPackageJson(packagePath, "solution-build-spec.json");
    const capabilityPlan = await readPackageJson(packagePath, "solution-capability-plan.json");
    const executionPlan = await readPackageJson(packagePath, "solution-execution-plan.json");
    const connectorContracts = await readPackageJson(packagePath, "enterprise-connector-contracts.json");
    const connectorMarkdown = await fs.readFile(path.join(packagePath, "enterprise-connector-contracts.md"), "utf8");
    const connectorApprovalChecklist = await readPackageJson(packagePath, "connector-approval-checklist.json");
    const connectorApprovalMarkdown = await fs.readFile(path.join(packagePath, "connector-approval-checklist.md"), "utf8");
    const connectorValidationPlan = await readPackageJson(packagePath, "connector-validation-plan.json");
    const connectorValidationMarkdown = await fs.readFile(path.join(packagePath, "connector-validation-plan.md"), "utf8");
    const connectorValidationEvidenceLog = await readPackageJson(packagePath, "connector-validation-evidence-log.json");
    const connectorValidationEvidenceMarkdown = await fs.readFile(path.join(packagePath, "connector-validation-evidence-log.md"), "utf8");
    const connectorBuildRequestPack = await readPackageJson(packagePath, "connector-build-request-pack.json");
    const connectorBuildRequestMarkdown = await fs.readFile(path.join(packagePath, "connector-build-request-pack.md"), "utf8");
    const connectorPilotRunbook = await readPackageJson(packagePath, "connector-pilot-runbook.json");
    const connectorPilotRunbookMarkdown = await fs.readFile(path.join(packagePath, "connector-pilot-runbook.md"), "utf8");
    const connectorPromotionDecisionPacket = await readPackageJson(packagePath, "connector-promotion-decision-packet.json");
    const connectorPromotionDecisionMarkdown = await fs.readFile(path.join(packagePath, "connector-promotion-decision-packet.md"), "utf8");
    const readinessBrief = await readPackageJson(packagePath, "enterprise-readiness-brief.json");
    const combinedHandoff = await readPackageJson(packagePath, "combined-handoff-packet.json");
    const combinedMarkdown = await fs.readFile(path.join(packagePath, "combined-handoff-packet.md"), "utf8");
    const questionRoutingRows = await readPackageJson(packagePath, "question-routing.json");
    const questionRoutingMarkdown = await fs.readFile(path.join(packagePath, "question-routing.md"), "utf8");
    failIf(!manifestIds.includes("solution-build-recipe"), failures, "Output manifest missing solution-build-recipe");
    failIf(!manifestIds.includes("solution-build-spec"), failures, "Output manifest missing solution-build-spec");
    failIf(!manifestIds.includes("solution-capability-plan"), failures, "Output manifest missing solution-capability-plan");
    failIf(!manifestIds.includes("solution-execution-plan"), failures, "Output manifest missing solution-execution-plan");
    failIf(!String(executionManifest.packageFiles || "").includes("solution-execution-plan.md"), failures, "Solution Execution Plan manifest missing Markdown file");
    failIf(!String(executionManifest.packageFiles || "").includes("solution-execution-plan.docx"), failures, "Solution Execution Plan manifest missing DOCX file");
    failIf(!manifestIds.includes("enterprise-connector-contracts"), failures, "Output manifest missing enterprise-connector-contracts");
    failIf(!String(connectorManifest.packageFiles || "").includes("enterprise-connector-contracts.md"), failures, "Enterprise Connector Contracts manifest missing Markdown file");
    failIf(!String(connectorManifest.packageFiles || "").includes("enterprise-connector-contracts.docx"), failures, "Enterprise Connector Contracts manifest missing DOCX file");
    failIf(!manifestIds.includes("connector-approval-checklist"), failures, "Output manifest missing connector-approval-checklist");
    failIf(!String(connectorApprovalManifest.packageFiles || "").includes("connector-approval-checklist.md"), failures, "Connector Approval Checklist manifest missing Markdown file");
    failIf(!String(connectorApprovalManifest.packageFiles || "").includes("connector-approval-checklist.docx"), failures, "Connector Approval Checklist manifest missing DOCX file");
    failIf(!manifestIds.includes("connector-validation-plan"), failures, "Output manifest missing connector-validation-plan");
    failIf(!String(connectorValidationManifest.packageFiles || "").includes("connector-validation-plan.md"), failures, "Connector Validation Plan manifest missing Markdown file");
    failIf(!String(connectorValidationManifest.packageFiles || "").includes("connector-validation-plan.docx"), failures, "Connector Validation Plan manifest missing DOCX file");
    failIf(!manifestIds.includes("connector-validation-evidence-log"), failures, "Output manifest missing connector-validation-evidence-log");
    failIf(!String(connectorEvidenceManifest.packageFiles || "").includes("connector-validation-evidence-log.md"), failures, "Connector Validation Evidence Log manifest missing Markdown file");
    failIf(!String(connectorEvidenceManifest.packageFiles || "").includes("connector-validation-evidence-log.docx"), failures, "Connector Validation Evidence Log manifest missing DOCX file");
    failIf(!manifestIds.includes("connector-build-request-pack"), failures, "Output manifest missing connector-build-request-pack");
    failIf(!String(connectorBuildRequestManifest.packageFiles || "").includes("connector-build-request-pack.md"), failures, "Connector Build Request Pack manifest missing Markdown file");
    failIf(!String(connectorBuildRequestManifest.packageFiles || "").includes("connector-build-request-pack.docx"), failures, "Connector Build Request Pack manifest missing DOCX file");
    failIf(!manifestIds.includes("connector-pilot-runbook"), failures, "Output manifest missing connector-pilot-runbook");
    failIf(!String(connectorPilotRunbookManifest.packageFiles || "").includes("connector-pilot-runbook.md"), failures, "Connector Pilot Runbook manifest missing Markdown file");
    failIf(!String(connectorPilotRunbookManifest.packageFiles || "").includes("connector-pilot-runbook.docx"), failures, "Connector Pilot Runbook manifest missing DOCX file");
    failIf(!manifestIds.includes("connector-promotion-decision-packet"), failures, "Output manifest missing connector-promotion-decision-packet");
    failIf(!String(connectorPromotionDecisionManifest.packageFiles || "").includes("connector-promotion-decision-packet.md"), failures, "Connector Promotion Decision Packet manifest missing Markdown file");
    failIf(!String(connectorPromotionDecisionManifest.packageFiles || "").includes("connector-promotion-decision-packet.docx"), failures, "Connector Promotion Decision Packet manifest missing DOCX file");
    failIf(!manifestIds.includes("enterprise-readiness-brief"), failures, "Output manifest missing enterprise-readiness-brief");
    failIf(!templateDocumentIds.includes("enterprise-readiness-brief"), failures, "Template Alignment missing enterprise-readiness-brief");
    failIf(solutionBuildSpec.version !== 1, failures, "Solution Build Spec version is not 1");
    failIf(!solutionBuildSpec.platforms?.some((platform) => platform.id === "chatgpt"), failures, "Solution Build Spec missing ChatGPT platform");
    failIf(!solutionBuildSpec.platforms?.some((platform) => platform.id === "microsoft-copilot"), failures, "Solution Build Spec missing Microsoft Copilot platform");
    failIf(capabilityPlan.version !== 1, failures, "Solution Capability Plan version is not 1");
    failIf(!capabilityPlan.chatgptCapabilities?.length, failures, "Solution Capability Plan missing ChatGPT capabilities");
    failIf(!capabilityPlan.microsoftCopilotCapabilities?.length, failures, "Solution Capability Plan missing Microsoft Copilot capabilities");
    failIf(!capabilityPlan.humanCheckpoints?.length, failures, "Solution Capability Plan missing human checkpoints");
    failIf(executionPlan.version !== 1, failures, "Solution Execution Plan version is not 1");
    failIf(!executionPlan.items?.length, failures, "Solution Execution Plan missing builder actions");
    failIf(!executionPlan.items?.every((item) => item.dataInputs && item.permissionsNeeded && item.enterpriseControls && item.humanCheckpoint), failures, "Solution Execution Plan missing data/permission/control/human checkpoint fields");
    failIf(connectorContracts.version !== 1, failures, "Enterprise Connector Contracts version is not 1");
    failIf(!connectorContracts.contracts?.length, failures, "Enterprise Connector Contracts are empty");
    failIf(!connectorContracts.contracts?.every((contract) => contract.authModel && contract.readWriteMode && contract.requiredApprovals && contract.testCriteria?.length), failures, "Enterprise connector contracts missing auth/read-write/approval/test criteria");
    failIf(!connectorContracts.contracts?.every((contract) => contract.sourceLocations && contract.permissionScope && contract.allowedOperations && contract.blockedOperations), failures, "Enterprise connector contracts missing source-location, permission-scope, or operation-boundary fields");
    failIf(!connectorContracts.contracts?.every((contract) => contract.approvalGate && contract.pilotDataPolicy && contract.fallbackMode), failures, "Enterprise connector contracts missing approval gate, pilot data policy, or fallback mode");
    failIf(!connectorContracts.contracts?.some((contract) => /microsoft|copilot/i.test(`${contract.platform} ${contract.connectorType}`) && /SharePoint|OneDrive|Teams|Outlook|Word|PowerPoint|Excel|Microsoft 365/i.test(`${contract.sourceLocations} ${contract.allowedOperations}`)), failures, "Enterprise connector contracts missing Microsoft 365 source location detail");
    ["Source locations", "Permission scope", "Blocked operations", "Approval Gate", "Fallback mode", "Test Criteria"].forEach((heading) => failIf(!connectorMarkdown.includes(heading), failures, `Enterprise Connector Contracts markdown missing ${heading}`));
    failIf(!/Microsoft 365|Copilot/i.test(connectorMarkdown), failures, "Enterprise Connector Contracts markdown missing Microsoft 365/Copilot detail");
    failIf(connectorApprovalChecklist.version !== 1, failures, "Connector Approval Checklist version is not 1");
    failIf(!connectorApprovalChecklist.items?.length, failures, "Connector Approval Checklist is empty");
    failIf(!connectorApprovalChecklist.items?.every((item) => item.requiredEvidence?.length && item.decisionOptions?.length && item.approvalGate && item.fallbackMode), failures, "Connector Approval Checklist missing evidence/options/gate/fallback fields");
    ["Required Evidence", "Decision Options", "Fallback mode"].forEach((heading) => failIf(!connectorApprovalMarkdown.includes(heading), failures, `Connector Approval Checklist markdown missing ${heading}`));
    failIf(connectorValidationPlan.version !== 1, failures, "Connector Validation Plan version is not 1");
    failIf(!connectorValidationPlan.tests?.length, failures, "Connector Validation Plan is empty");
    failIf(!connectorValidationPlan.tests?.every((test) => test.testArea && test.expectedEvidence && test.passCriteria && test.fallbackIfFailed && test.status), failures, "Connector Validation Plan missing test evidence/status fields");
    ["Source reachability", "Permission boundary", "Blocked operations", "Pilot data policy", "Audit evidence", "Human review gate", "Fallback mode"].forEach((area) => failIf(!connectorValidationPlan.tests.some((test) => test.testArea === area), failures, `Connector Validation Plan missing ${area}`));
    ["Test Summary", "Expected evidence", "Pass criteria", "Fallback if failed"].forEach((heading) => failIf(!connectorValidationMarkdown.includes(heading), failures, `Connector Validation Plan markdown missing ${heading}`));
    failIf(connectorValidationEvidenceLog.version !== 1, failures, "Connector Validation Evidence Log version is not 1");
    failIf(!connectorValidationEvidenceLog.entries?.length, failures, "Connector Validation Evidence Log is empty");
    failIf(!connectorValidationEvidenceLog.entries?.every((entry) => entry.proofToCapture && entry.evidenceOwner && entry.resultOptions?.length && entry.decisionImpact && entry.packageTarget), failures, "Connector Validation Evidence Log missing proof/owner/options/decision/package fields");
    ["Evidence Summary", "Proof to capture", "Result options", "Decision impact", "Fallback if missing"].forEach((heading) => failIf(!connectorValidationEvidenceMarkdown.includes(heading), failures, `Connector Validation Evidence Log markdown missing ${heading}`));
    failIf(connectorBuildRequestPack.version !== 1, failures, "Connector Build Request Pack version is not 1");
    failIf(!connectorBuildRequestPack.requests?.length, failures, "Connector Build Request Pack is empty");
    failIf(!connectorBuildRequestPack.requests?.every((request) => request.requestType && request.requestedDecision && request.minimumBuildScope && request.evidencePackage && request.nextAction), failures, "Connector Build Request Pack missing type/decision/scope/evidence/action fields");
    ["Request Summary", "Requested decision", "Minimum build scope", "Evidence package", "Human Checkpoints", "Enterprise Controls"].forEach((heading) => failIf(!connectorBuildRequestMarkdown.includes(heading), failures, `Connector Build Request Pack markdown missing ${heading}`));
    failIf(connectorPilotRunbook.version !== 1, failures, "Connector Pilot Runbook version is not 1");
    failIf(!connectorPilotRunbook.steps?.length, failures, "Connector Pilot Runbook is empty");
    failIf(!connectorPilotRunbook.steps?.every((step) => step.phase && step.action && step.owner && step.status && step.entryCriteria && step.evidenceToCapture && step.passCriteria && step.stopTrigger && step.fallbackAction && step.decisionGate && step.packageEvidence), failures, "Connector Pilot Runbook missing phase/action/owner/status/evidence/gate fields");
    ["Pilot Summary", "Pilot preflight", "Safe sample setup", "Access setup", "Validation run", "Evidence capture", "Human signoff", "Fallback drill", "Promotion decision", "Stop trigger", "Fallback action", "Decision gate", "Package evidence"].forEach((heading) => failIf(!connectorPilotRunbookMarkdown.includes(heading), failures, `Connector Pilot Runbook markdown missing ${heading}`));
    failIf(connectorPromotionDecisionPacket.version !== 1, failures, "Connector Promotion Decision Packet version is not 1");
    failIf(!connectorPromotionDecisionPacket.decisions?.length, failures, "Connector Promotion Decision Packet is empty");
    failIf(!connectorPromotionDecisionPacket.decisions?.every((decision) => decision.recommendedDecision && decision.decisionStatus && decision.owner && decision.pilotReadiness && decision.evidenceStatus && decision.promotionScope && decision.conditions?.length && decision.openGaps?.length && decision.fallbackPosture && decision.enterpriseHandoff && decision.stopCriteria && decision.nextAction && decision.packageEvidence), failures, "Connector Promotion Decision Packet missing decision/status/evidence/fallback/handoff fields");
    ["Decision Summary", "Recommended decision", "Promotion scope", "Conditions", "Open gaps", "Fallback posture", "Enterprise handoff", "Stop criteria", "Package evidence"].forEach((heading) => failIf(!connectorPromotionDecisionMarkdown.includes(heading), failures, `Connector Promotion Decision Packet markdown missing ${heading}`));
    failIf(readinessBrief.version !== 1, failures, "Enterprise Readiness Brief version is not 1");
    failIf(!readinessBrief.gates?.length, failures, "Enterprise Readiness Brief missing gates");
    failIf(!readinessBrief.approvals?.length, failures, "Enterprise Readiness Brief missing approvals");
    failIf(!readinessBrief.nextActions?.length, failures, "Enterprise Readiness Brief missing next actions");
    failIf(!combinedHandoff.sections?.some((section) => section.title === "Build and Readiness Artifacts"), failures, "Combined Handoff missing Build and Readiness Artifacts section");
    failIf(!combinedMarkdown.includes("## Solution Execution Plan"), failures, "Combined Handoff markdown missing Solution Execution Plan");
    failIf(!combinedMarkdown.includes("## Enterprise Readiness Brief"), failures, "Combined Handoff markdown missing Enterprise Readiness Brief");
    expectedQuestionRoutes.forEach((route) => failIf(!questionRoutingRows.slice(1).some((row) => row[0] === route), failures, `Question Routing rows missing ${route} route`));
    expectedQuestionRoutes.forEach((route) => failIf(!questionRoutingMarkdown.includes(`## ${route}`), failures, `Question Routing markdown missing ${route} section`));
  }
}

await fs.writeFile(outputPath, `${JSON.stringify({
  appUrl,
  checkedAt: new Date().toISOString(),
  passed: failures.length === 0,
  failures,
  packageName: payload?.packageName || "",
  packagePath,
  files: payload?.files || []
}, null, 2)}\n`);

if (packagePath && packagePath.includes(`${path.sep}data${path.sep}packages${path.sep}`)) {
  await fs.rm(packagePath, { recursive: true, force: true });
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`OK browser handoff package contract smoke passed with ${requiredPackageFiles.length} required files`);
}
