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
const outputDir = path.join(appDir, "test-outputs/enterprise-readiness");
const outputPath = path.join(outputDir, "enterprise-readiness-brief.json");
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

function enterpriseReadinessState() {
  const now = new Date().toISOString();
  const state = JSON.parse(JSON.stringify(loadDefaultState()));
  state.appMode = "analysis";
  state.activeWorkbenchTab = "testing";
  state.sessionMeta = {
    ...(state.sessionMeta || {}),
    id: `enterprise-readiness-${Date.now().toString(36)}`,
    name: "Enterprise Readiness Brief Smoke",
    owner: "Enterprise pilot owner",
    source: "Enterprise readiness smoke",
    dataClassification: "Synthetic / sample",
    lastPackagePath: "data/packages/enterprise-readiness-smoke",
    updatedAt: now
  };
  state.pilotControls = {
    ...(state.pilotControls || {}),
    enterpriseReadinessMode: "Enterprise rollout prep",
    storageTarget: "SharePoint / OneDrive planned",
    authMode: "Microsoft Entra ID planned",
    evidencePolicy: "Optional evidence with approved files",
    clientDataPolicy: "Sanitized client examples only",
    shareMode: "Selected SMEs",
    entraAppStatus: "Planned",
    storageStatus: "SharePoint path identified",
    auditStatus: "Central audit planned",
    controlsConfirmed: "No",
    pilotAudience: "AI Infusion reviewers, Microsoft 365 platform owner, security reviewer",
    readinessOwner: "Enterprise pilot owner",
    sharepointPath: "TBD approved SharePoint site",
    retentionNote: "Retain pilot packages and feedback snapshots in approved storage for review.",
    approvedTools: "ChatGPT Enterprise, Microsoft 365 Copilot, Copilot Studio after approval"
  };
  state.fields = {
    ...(state.fields || {}),
    workflowName: "Enterprise readiness brief smoke",
    submittedWorkflowTask: "Prepare approved workshop packet",
    submittedIdea: "Use AI to assemble a reviewed workshop packet from approved Microsoft 365 material.",
    submittedWhereToday: "Teams, SharePoint, PowerPoint, Word, Outlook",
    submittedFrequency: "Weekly",
    submittedCurrentEffort: "6 hours",
    submittedExpectedImpact: "Reduce prep time and improve reuse.",
    submittedHumanReviewNeeded: "Partner reviews before client use.",
    businessOutcome: "Create a partner-reviewed workshop packet with source traceability.",
    currentStateSummary: "The team gathers approved source material, drafts a workshop packet, and routes it to a partner for review.",
    startPoint: "Partner requests a workshop",
    endPoint: "Reviewed packet is ready",
    definitionOfDone: "Agenda, pre-read, deck outline, facilitator guide, and open questions are ready.",
    peopleInvolved: "Consultant, manager, partner, Microsoft 365 owner",
    outputConsumer: "Engagement team",
    valueHypothesis: "Save 2 hours per workshop and improve consistency.",
    biggestPain: "Finding approved prior materials and adapting them consistently.",
    averageDuration: "6 hours",
    runsPerPeriod: "4 per month",
    hoursSavedHypothesis: "2 hours",
    successMetrics: "Prep time, rework, reviewer confidence, source traceability",
    mvpScope: "Run one sanitized workshop example through ChatGPT, then map approved SharePoint sources for Copilot.",
    solutionHypothesis: "ChatGPT can draft from approved files while Copilot grounds the workflow in Microsoft 365 after approvals.",
    solutionType: "Agent",
    toolFitRecommendation: "Hybrid ChatGPT + Microsoft 365 Copilot route with read-only sources first.",
    msaBoundary: "Uses sanitized/exported artifacts",
    deploymentEnvironment: "Company internal",
    humanJudgmentArea: "Partner approval before client-facing use",
    fieldConfidence: "Medium",
    priority: "Medium"
  };
  state.steps = [
    { name: "Clarify workshop objective", actor: "Manager", tool: "Teams, Outlook", accessMode: "Microsoft 365", action: "Clarify objective", input: "Partner request", output: "Workshop scope", decision: "Partner confirms scope", pattern: "Classify" },
    { name: "Find approved source material", actor: "Consultant", tool: "SharePoint, PowerPoint", accessMode: "Approved Microsoft 365 files", action: "Search prior examples", input: "Workshop scope", output: "Candidate sources", pattern: "Retrieve" },
    { name: "Draft workshop packet", actor: "Consultant", tool: "ChatGPT, Word, PowerPoint", accessMode: "Approved files", action: "Draft packet", input: "Candidate sources", output: "Draft packet", decision: "Partner review", pattern: "Generate" },
    { name: "Route final review", actor: "Manager", tool: "Teams, Outlook", accessMode: "Microsoft 365", action: "Send for approval", input: "Draft packet", output: "Approved packet", decision: "Approve or request edits", pattern: "Route" }
  ];
  state.systems = [
    { name: "SharePoint", purpose: "Approved source material", access: "Microsoft 365" },
    { name: "Teams", purpose: "Review and coordination", access: "Microsoft 365" },
    { name: "PowerPoint", purpose: "Workshop deck", access: "Microsoft 365" }
  ];
  state.data = [
    { category: "Workshop examples", source: "SharePoint", format: "PowerPoint / Word", sensitivity: "Internal", usage: "Reference" },
    { category: "Partner notes", source: "Outlook / Teams", format: "Message notes", sensitivity: "Client confidential", usage: "Input" }
  ];
  state.decisions = [
    { decision: "Approve final packet", owner: "Partner", criteria: "Accurate and safe for client use", approval: "Required" }
  ];
  state.pilotFeedbackLog = [
    feedback("Reviewer A", "Ready for Engineering review", "4 - Strong", "Need SharePoint path and Entra owner."),
    feedback("Reviewer B", "Run another pilot", "4 - Strong", "Clarify audit and retention evidence."),
    feedback("Reviewer C", "Ready for Product review", "3 - Usable", "Good package, but owner approval path needs detail.")
  ];
  return state;
}

function feedback(reviewerName, decision, experienceRating, enterpriseConcerns) {
  return {
    reviewerName,
    reviewerRole: "Pilot reviewer",
    pilotScenario: "Synthetic banking test",
    experienceRating,
    decision,
    outputUsefulness: "Outputs are useful for first review.",
    enterpriseConcerns,
    recommendedChanges: "Tighten enterprise readiness evidence.",
    savedAt: new Date().toISOString(),
    packagePath: "data/packages/enterprise-readiness-smoke"
  };
}

function failIf(condition, failures, message) {
  if (condition) failures.push(message);
}

await fs.mkdir(outputDir, { recursive: true });
const launchOptions = { headless: true };
if (browserExecutable) launchOptions.executablePath = browserExecutable;
const browser = await chromium.launch(launchOptions);
let payload;
try {
  const context = await browser.newContext();
  await context.addInitScript((seedState) => {
    window.localStorage.setItem("discovery-intake-state", JSON.stringify(seedState));
  }, enterpriseReadinessState());
  const page = await context.newPage();
  await page.goto(`${appUrl}/?enterprise-readiness-smoke=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.deriveEnterpriseReadinessBrief === "function", null, { timeout: 10000 });
  payload = await page.evaluate(() => {
    const product = deriveProductBrief();
    const engineering = deriveEngineeringBrief();
    const business = deriveBusinessBrief();
    const governance = deriveGovernanceBrief();
    const recipe = deriveSolutionBuildRecipe(product, engineering, business);
    const spec = deriveSolutionBuildSpec(recipe);
    const capabilityPlan = deriveSolutionCapabilityPlan(spec);
    const executionBrief = deriveSolutionExecutionBrief(deriveSolutionExecutionPlan(spec));
    const connectorContracts = deriveEnterpriseConnectorContracts(spec);
    const brief = deriveEnterpriseReadinessBrief(spec, connectorContracts, capabilityPlan);
    const templateBrief = deriveEnterpriseReadinessTemplateBrief(brief);
    const combined = deriveCombinedHandoff(product, engineering, business, recipe, executionBrief, templateBrief);
    const rows = enterpriseReadinessBriefRows(brief);
    const manifest = deriveOutputManifest(product, engineering, business, governance, combined, recipe, executionBrief, templateBrief);
    const contract = deriveTemplateAlignmentContract(product, engineering, business, governance, combined, recipe, executionBrief, templateBrief);
    return {
      brief,
      templateBrief,
      rows,
      manifestIds: manifest.map((item) => item.contractId),
      manifestItem: manifest.find((item) => item.contractId === "enterprise-readiness-brief"),
      templateDocument: (contract.documents || []).find((document) => document.id === "enterprise-readiness-brief")
    };
  });
  await context.close();
} finally {
  await browser.close();
}

const failures = [];
failIf(payload.brief.version !== 1, failures, "Enterprise Readiness Brief version is not 1");
failIf(!payload.brief.gates?.length, failures, "Enterprise Readiness Brief missing gates");
failIf(!payload.brief.gates?.some((gate) => gate.area === "Enterprise Source Setup"), failures, "Enterprise Readiness Brief missing source setup gates");
failIf(!payload.brief.gates?.some((gate) => gate.area === "Connector Approval"), failures, "Enterprise Readiness Brief missing connector approval gates");
failIf(!payload.brief.gates?.some((gate) => gate.area === "Human Checkpoint"), failures, "Enterprise Readiness Brief missing human checkpoint gates");
failIf(!payload.brief.approvals?.length, failures, "Enterprise Readiness Brief missing approvals");
failIf(!payload.brief.evidenceNeeded?.length, failures, "Enterprise Readiness Brief missing evidence-needed list");
failIf(!payload.brief.nextActions?.length, failures, "Enterprise Readiness Brief missing next actions");
failIf(!payload.brief.markdown?.includes("Enterprise Readiness Brief"), failures, "Enterprise Readiness Brief markdown missing title");
failIf(!payload.rows[0].includes("Required Action"), failures, "Enterprise Readiness Brief rows missing Required Action column");
failIf(!payload.rows.some((row) => row.includes("Connector Approval")), failures, "Enterprise Readiness Brief rows missing connector approvals");
failIf(!payload.manifestIds.includes("enterprise-readiness-brief"), failures, "Output manifest missing enterprise-readiness-brief");
failIf(!payload.manifestItem?.packageFiles?.includes("enterprise-readiness-brief.json"), failures, "Output manifest package files missing enterprise-readiness-brief.json");
failIf(!payload.manifestItem?.packageFiles?.includes("enterprise-readiness-brief.docx"), failures, "Output manifest package files missing enterprise-readiness-brief.docx");
failIf(payload.templateBrief.id !== "enterprise-readiness-brief", failures, "Enterprise Readiness template brief id is wrong");
failIf(!payload.templateBrief.markdown?.includes("Enterprise Source Setup"), failures, "Enterprise Readiness template markdown missing source setup section");
failIf(!payload.templateBrief.markdown?.includes("Connector Approval Gates"), failures, "Enterprise Readiness template markdown missing connector approval section");
failIf(!payload.templateDocument, failures, "Template Alignment missing enterprise-readiness-brief");
failIf(!payload.templateDocument?.packageFiles?.includes("enterprise-readiness-brief.md"), failures, "Template Alignment enterprise readiness package files missing Markdown");
failIf(!payload.templateDocument?.outputSurfaces?.includes("Package DOCX"), failures, "Template Alignment enterprise readiness missing Package DOCX surface");

await fs.writeFile(outputPath, `${JSON.stringify({
  appUrl,
  checkedAt: new Date().toISOString(),
  passed: failures.length === 0,
  failures,
  decision: payload.brief.decision,
  readinessScore: payload.brief.readinessScore,
  gateCount: payload.brief.gates.length,
  approvalCount: payload.brief.approvals.length,
  nextActions: payload.brief.nextActions
}, null, 2)}\n`);

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`OK enterprise readiness brief smoke passed with ${payload.brief.gates.length} gates and ${payload.brief.approvals.length} approvals`);
}
