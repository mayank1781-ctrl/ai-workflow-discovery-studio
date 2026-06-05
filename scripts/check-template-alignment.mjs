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
const outputDir = path.join(appDir, "test-outputs/template-alignment");
const outputPath = path.join(outputDir, "template-alignment.json");
const browserExecutable = process.env.CHROME_EXECUTABLE || firstExistingPath([
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
]);

const expectedDocuments = [
  "product-pdr",
  "engineering-brief",
  "business-value",
  "governance-inputs",
  "solution-build-recipe",
  "solution-execution-plan",
  "enterprise-readiness-brief",
  "combined-handoff"
];

const expectedRoutes = [
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
  if (start < 0 || end < 0) {
    throw new Error("Could not locate defaultState in app.js for template alignment seeding.");
  }
  const sandbox = { Date, result: null };
  vm.runInNewContext(`${source.slice(start, end)}\nresult = defaultState;`, sandbox);
  return sandbox.result;
}

function templateSmokeState() {
  const now = new Date().toISOString();
  const state = JSON.parse(JSON.stringify(loadDefaultState()));
  state.appMode = "analysis";
  state.activeWorkbenchTab = "blueprint";
  state.sessionMeta = {
    ...(state.sessionMeta || {}),
    id: `template-smoke-${Date.now().toString(36)}`,
    name: "Template Alignment Smoke",
    owner: "AI Infusion Reviewer",
    source: "Template alignment smoke",
    dataClassification: "Synthetic / sample",
    updatedAt: now
  };
  state.fields = {
    ...(state.fields || {}),
    submittedIdea: "Use AI to help prepare repeatable client workshop materials.",
    submittedWorkflowTask: "Preparing client workshop materials",
    submittedWhereToday: "Teams, SharePoint, PowerPoint, prior decks, notes, and partner input",
    submittedFrequency: "3-5 workshops per month",
    submittedCurrentEffort: "6-10 hours per workshop",
    submittedExpectedImpact: "Reduce preparation time and improve consistency.",
    submittedHumanReviewNeeded: "Partner reviews final materials before client use.",
    workflowName: "Client workshop preparation",
    workflowCategory: "Pre-delivery / workshop prep",
    useCaseArchetype: "Workshop acceleration",
    practice: "Banking",
    domain: "Client delivery",
    businessOwner: "Delivery sponsor",
    followUpOwner: "Product reviewer",
    engagementProjectType: "Client delivery",
    projectType: "Advisory engagement",
    projectPhase: "Pre-delivery",
    businessOutcome: "Create a reviewed workshop packet faster while keeping client tailoring.",
    currentStateSummary: "The team gathers context, prior materials, and partner input, then drafts and reviews a workshop packet.",
    startPoint: "Client partner asks for a workshop",
    endPoint: "Reviewed workshop packet and facilitation plan are ready",
    definitionOfDone: "Workshop agenda, pre-read, facilitation guide, output template, and partner-approved deck are ready.",
    peopleInvolved: "Consultant, manager, partner, domain SME",
    outputConsumer: "Engagement team and client workshop participants",
    stakeholders: "Partner, engagement manager, workshop facilitator",
    commercialContext: "Paid project",
    commercialValuePath: "Capacity creation and quality consistency",
    valueHypothesis: "Reduce repeated prep work and make workshop outputs more reusable.",
    biggestPain: "Finding the right prior examples and adapting them consistently.",
    primaryTimeDriver: "Searching, tailoring, and partner review loops.",
    averageDuration: "8 hours",
    runsPerPeriod: "4 workshops per month",
    hoursSavedHypothesis: "2-3 hours saved per workshop",
    kpiTypes: "Prep time, rework, partner satisfaction, reuse rate",
    successMetrics: "Cut prep time by at least 25% while preserving partner approval quality.",
    capacityTeamCompositionImpact: "Creates capacity for managers and consultants during proposal or delivery peaks.",
    reusePotential: "High across workshop-heavy engagements.",
    mvpScope: "Start with finding prior workshop assets and drafting a first-pass packet from approved examples.",
    solutionHypothesis: "A retrieval and synthesis assistant can assemble a draft workshop pack with source notes and review checkpoints.",
    solutionType: "RAG search",
    toolFitRecommendation: "ChatGPT Enterprise with Microsoft 365 source context, then enterprise connectors later.",
    msaBoundary: "Uses sanitized/exported artifacts",
    deploymentEnvironment: "Company internal",
    governancePath: "Standard AI review",
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
      time: "30 minutes",
      decision: "Partner confirms objective",
      dataSensitivity: "Internal / client-context sample",
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
      time: "2 hours",
      pain: "Search is slow and inconsistent",
      dataSensitivity: "Internal",
      pattern: "Retrieve"
    },
    {
      name: "Draft workshop packet",
      actor: "Consultant",
      tool: "PowerPoint, Word",
      accessMode: "User-provided files",
      action: "Draft agenda, exercises, prompts, and output template",
      input: "Prior decks and partner notes",
      output: "Draft workshop packet",
      handoff: "Partner review",
      time: "4 hours",
      decision: "Partner approves or requests changes",
      dataSensitivity: "Client confidential",
      pattern: "Generate"
    }
  ];
  state.systems = [
    { name: "Teams", purpose: "Workshop coordination", access: "Microsoft 365" },
    { name: "SharePoint", purpose: "Prior materials and templates", access: "Microsoft 365 files" },
    { name: "PowerPoint", purpose: "Final deck", access: "User-provided file" }
  ];
  state.data = [
    {
      category: "Workshop context",
      source: "Partner notes",
      format: "Email / meeting notes",
      sensitivity: "Client confidential",
      usage: "Input",
      processing: "Summarize and transform into agenda"
    },
    {
      category: "Reusable templates",
      source: "SharePoint",
      format: "PowerPoint",
      sensitivity: "Internal",
      usage: "Reference",
      processing: "Retrieve and adapt"
    }
  ];
  state.decisions = [
    {
      decision: "Approve final client-facing packet",
      owner: "Partner",
      criteria: "Accurate, client-specific, and safe to share",
      approval: "Required"
    }
  ];
  return state;
}

function failIf(condition, failures, message) {
  if (condition) failures.push(message);
}

async function run() {
  await fs.mkdir(outputDir, { recursive: true });
  const launchOptions = { headless: true };
  if (browserExecutable) launchOptions.executablePath = browserExecutable;
  const browser = await chromium.launch(launchOptions);
  let payload;
  try {
    const context = await browser.newContext();
    await context.addInitScript((seedState) => {
      window.localStorage.setItem("discovery-intake-state", JSON.stringify(seedState));
    }, templateSmokeState());
    const page = await context.newPage();
    await page.goto(`${appUrl}/?template-alignment-smoke=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.deriveProductBrief === "function" && typeof window.deriveSolutionBuildRecipe === "function" && typeof window.deriveTemplateAlignmentContract === "function", null, { timeout: 10000 });
    await page.waitForSelector("[data-template-alignment-panel]", { state: "visible", timeout: 10000 });
    await page.waitForSelector("[data-question-routing-panel]", { state: "visible", timeout: 10000 });
    await page.waitForSelector("[data-enterprise-connector-contract-panel]", { state: "visible", timeout: 10000 });
    await page.waitForSelector("[data-connector-validation-plan-panel]", { state: "visible", timeout: 10000 });
    await page.waitForSelector("[data-connector-validation-evidence-log-panel]", { state: "visible", timeout: 10000 });
    await page.waitForSelector("[data-connector-build-request-panel]", { state: "visible", timeout: 10000 });
    await page.waitForSelector("[data-connector-pilot-runbook-panel]", { state: "visible", timeout: 10000 });
    await page.waitForSelector("[data-connector-promotion-decision-panel]", { state: "visible", timeout: 10000 });
    payload = await page.evaluate(() => {
      const product = deriveProductBrief();
      const engineering = deriveEngineeringBrief();
      const business = deriveBusinessBrief();
      const governance = deriveGovernanceBrief();
      const recipe = deriveSolutionBuildRecipe(product, engineering, business);
      const spec = deriveSolutionBuildSpec(recipe);
      const executionPlan = deriveSolutionExecutionPlan(spec);
      const executionBrief = deriveSolutionExecutionBrief(executionPlan);
      const capabilityPlan = deriveSolutionCapabilityPlan(spec);
      const connectorContracts = deriveEnterpriseConnectorContracts(spec);
      const enterpriseReadiness = deriveEnterpriseReadinessBrief(spec, connectorContracts, capabilityPlan);
      const enterpriseReadinessTemplate = deriveEnterpriseReadinessTemplateBrief(enterpriseReadiness);
      const combined = deriveCombinedHandoff(product, engineering, business, recipe, executionBrief, enterpriseReadinessTemplate);
      const contract = deriveTemplateAlignmentContract(product, engineering, business, governance, combined, recipe, executionBrief, enterpriseReadinessTemplate);
      const manifest = deriveOutputManifest(product, engineering, business, governance, combined, recipe, executionBrief, enterpriseReadinessTemplate);
      return {
        contract,
        manifest,
        rows: {
          templateAlignment: templateAlignmentRows(product, engineering, business, governance, combined, recipe, executionBrief, enterpriseReadinessTemplate),
          outputManifest: outputManifestRows(product, engineering, business, governance, combined, recipe, executionBrief, enterpriseReadinessTemplate),
          product: templateBriefRows(product),
          engineering: templateBriefRows(engineering),
          business: templateBriefRows(business),
          recipe: solutionBuildRecipeRows(recipe),
          execution: templateBriefRows(executionBrief),
          enterprise: templateBriefRows(enterpriseReadinessTemplate),
          combined: combinedHandoffRows(combined),
          routing: questionRoutingRows()
        },
        markdownChecks: {
          product: product.markdown,
          engineering: engineering.markdown,
          business: business.markdown,
          governance: governance.markdown,
          recipe: recipe.markdown,
          execution: executionBrief.markdown,
          enterprise: enterpriseReadinessTemplate.markdown,
          combined: combined.markdown
        },
        visiblePanel: {
          heading: document.querySelector("[data-template-alignment-panel] h3")?.innerText || "",
          cardCount: document.querySelectorAll("[data-template-contract-id]").length,
          contractIds: Array.from(document.querySelectorAll("[data-template-contract-id]")).map((node) => node.dataset.templateContractId || ""),
          metricText: document.querySelector(".template-alignment-metrics")?.innerText || ""
        },
        visibleQuestionRouting: {
          heading: document.querySelector("[data-question-routing-panel] h3")?.innerText || "",
          cardCount: document.querySelectorAll("[data-question-route-card]").length,
          routes: Array.from(document.querySelectorAll("[data-question-route-card]")).map((node) => node.dataset.questionRoute || ""),
          text: document.querySelector("[data-question-routing-panel]")?.innerText || ""
        },
        visibleConnectorContracts: {
          heading: document.querySelector("[data-enterprise-connector-contract-panel] h4")?.innerText || "",
          cardCount: document.querySelectorAll("[data-enterprise-connector-contract-id]").length,
          contractIds: Array.from(document.querySelectorAll("[data-enterprise-connector-contract-id]")).map((node) => node.dataset.enterpriseConnectorContractId || ""),
          text: document.querySelector("[data-enterprise-connector-contract-panel]")?.innerText || ""
        },
        visibleConnectorValidation: {
          heading: document.querySelector("[data-connector-validation-plan-panel] h4")?.innerText || "",
          cardCount: document.querySelectorAll("[data-connector-validation-test-id]").length,
          text: document.querySelector("[data-connector-validation-plan-panel]")?.innerText || ""
        },
        visibleConnectorEvidence: {
          heading: document.querySelector("[data-connector-validation-evidence-log-panel] h4")?.innerText || "",
          cardCount: document.querySelectorAll("[data-connector-validation-evidence-id]").length,
          text: document.querySelector("[data-connector-validation-evidence-log-panel]")?.innerText || ""
        },
        visibleConnectorBuildRequests: {
          heading: document.querySelector("[data-connector-build-request-panel] h4")?.innerText || "",
          cardCount: document.querySelectorAll("[data-connector-build-request-id]").length,
          text: document.querySelector("[data-connector-build-request-panel]")?.innerText || ""
        },
        visibleConnectorPilotRunbook: {
          heading: document.querySelector("[data-connector-pilot-runbook-panel] h4")?.innerText || "",
          cardCount: document.querySelectorAll("[data-connector-pilot-step-id]").length,
          text: document.querySelector("[data-connector-pilot-runbook-panel]")?.innerText || ""
        },
        visibleConnectorPromotionDecisions: {
          heading: document.querySelector("[data-connector-promotion-decision-panel] h4")?.innerText || "",
          cardCount: document.querySelectorAll("[data-connector-promotion-decision-id]").length,
          text: document.querySelector("[data-connector-promotion-decision-panel]")?.innerText || ""
        }
      };
    });
    await context.close();
  } finally {
    await browser.close();
  }

  const failures = [];
  const documents = payload.contract.documents || [];
  const documentIds = documents.map((document) => document.id);
  expectedDocuments.forEach((id) => failIf(!documentIds.includes(id), failures, `Missing template document contract: ${id}`));
  failIf(payload.visiblePanel.cardCount !== expectedDocuments.length, failures, `Visible Template Alignment panel has ${payload.visiblePanel.cardCount} cards; expected ${expectedDocuments.length}`);
  expectedDocuments.forEach((id) => failIf(!payload.visiblePanel.contractIds.includes(id), failures, `Visible Template Alignment panel missing card: ${id}`));
  failIf(!payload.visiblePanel.heading.includes(`${expectedDocuments.length}/${expectedDocuments.length}`), failures, "Visible Template Alignment panel does not show all outputs aligned");
  failIf(!/workbook sheets/i.test(payload.visiblePanel.metricText), failures, "Visible Template Alignment panel missing workbook sheet metric");
  failIf(!/package files/i.test(payload.visiblePanel.metricText), failures, "Visible Template Alignment panel missing package file metric");
  failIf(payload.visibleQuestionRouting.cardCount < expectedRoutes.length, failures, `Visible Question Routing panel has ${payload.visibleQuestionRouting.cardCount} cards; expected at least ${expectedRoutes.length}`);
  expectedRoutes.forEach((route) => failIf(!payload.visibleQuestionRouting.routes.includes(route), failures, `Visible Question Routing panel missing route: ${route}`));
  failIf(!/routed questions/i.test(payload.visibleQuestionRouting.heading), failures, "Visible Question Routing panel missing routed question count");
  failIf(!/Open Question Routing/i.test(payload.visibleQuestionRouting.text), failures, "Visible Question Routing panel missing title");
  failIf(!/owner lanes/i.test(payload.visibleQuestionRouting.text), failures, "Visible Question Routing panel missing owner lane summary");
  failIf(payload.visibleConnectorContracts.cardCount < 3, failures, `Visible connector contract panel has ${payload.visibleConnectorContracts.cardCount} cards; expected at least 3`);
  ["manual-evidence-files", "chatgpt-tools", "microsoft-365-copilot"].forEach((id) => failIf(!payload.visibleConnectorContracts.contractIds.includes(id), failures, `Visible connector contract panel missing card: ${id}`));
  failIf(!/Source locations/i.test(payload.visibleConnectorContracts.text), failures, "Visible connector contract panel missing source locations");
  failIf(!/Permission scope/i.test(payload.visibleConnectorContracts.text), failures, "Visible connector contract panel missing permission scope");
  failIf(!/Blocked operations/i.test(payload.visibleConnectorContracts.text), failures, "Visible connector contract panel missing blocked operations");
  failIf(!/Fallback mode/i.test(payload.visibleConnectorContracts.text), failures, "Visible connector contract panel missing fallback mode");
  failIf(payload.visibleConnectorValidation.cardCount < 4, failures, `Visible connector validation panel has ${payload.visibleConnectorValidation.cardCount} cards; expected at least 4`);
  failIf(!/validation test/i.test(payload.visibleConnectorValidation.heading), failures, "Visible connector validation panel missing validation count");
  failIf(!/Source reachability/i.test(payload.visibleConnectorValidation.text), failures, "Visible connector validation panel missing source reachability");
  failIf(!/Expected evidence/i.test(payload.visibleConnectorValidation.text), failures, "Visible connector validation panel missing expected evidence");
  failIf(payload.visibleConnectorEvidence.cardCount < 4, failures, `Visible connector evidence panel has ${payload.visibleConnectorEvidence.cardCount} cards; expected at least 4`);
  failIf(!/evidence item/i.test(payload.visibleConnectorEvidence.heading), failures, "Visible connector evidence panel missing evidence count");
  failIf(!/Proof to capture/i.test(payload.visibleConnectorEvidence.text), failures, "Visible connector evidence panel missing proof to capture");
  failIf(!/Decision impact/i.test(payload.visibleConnectorEvidence.text), failures, "Visible connector evidence panel missing decision impact");
  failIf(payload.visibleConnectorBuildRequests.cardCount < 3, failures, `Visible connector build request panel has ${payload.visibleConnectorBuildRequests.cardCount} cards; expected at least 3`);
  failIf(!/platform request/i.test(payload.visibleConnectorBuildRequests.heading), failures, "Visible connector build request panel missing request count");
  failIf(!/Minimum build scope/i.test(payload.visibleConnectorBuildRequests.text), failures, "Visible connector build request panel missing minimum build scope");
  failIf(!/Evidence package/i.test(payload.visibleConnectorBuildRequests.text), failures, "Visible connector build request panel missing evidence package");
  failIf(payload.visibleConnectorPilotRunbook.cardCount < 4, failures, `Visible connector pilot runbook panel has ${payload.visibleConnectorPilotRunbook.cardCount} cards; expected at least 4`);
  failIf(!/pilot step/i.test(payload.visibleConnectorPilotRunbook.heading), failures, "Visible connector pilot runbook panel missing step count");
  failIf(!/Stop trigger/i.test(payload.visibleConnectorPilotRunbook.text), failures, "Visible connector pilot runbook panel missing stop trigger");
  failIf(!/Decision gate/i.test(payload.visibleConnectorPilotRunbook.text), failures, "Visible connector pilot runbook panel missing decision gate");
  failIf(payload.visibleConnectorPromotionDecisions.cardCount < 3, failures, `Visible connector promotion decision panel has ${payload.visibleConnectorPromotionDecisions.cardCount} cards; expected at least 3`);
  failIf(!/promotion decision/i.test(payload.visibleConnectorPromotionDecisions.heading), failures, "Visible connector promotion decision panel missing decision count");
  failIf(!/Promotion scope/i.test(payload.visibleConnectorPromotionDecisions.text), failures, "Visible connector promotion decision panel missing promotion scope");
  failIf(!/Enterprise handoff/i.test(payload.visibleConnectorPromotionDecisions.text), failures, "Visible connector promotion decision panel missing enterprise handoff");
  failIf(!/Stop criteria/i.test(payload.visibleConnectorPromotionDecisions.text), failures, "Visible connector promotion decision panel missing stop criteria");

  for (const document of documents) {
    failIf(document.sectionCount < document.minSections, failures, `${document.label} has ${document.sectionCount} sections; expected at least ${document.minSections}`);
    failIf(document.fieldCount < document.sectionCount, failures, `${document.label} has fewer fields than sections`);
    failIf(document.missingRequiredSections.length > 0, failures, `${document.label} missing required sections: ${document.missingRequiredSections.join(", ")}`);
    failIf(!document.primaryPackageFile.endsWith(".docx"), failures, `${document.label} primary package file is not DOCX`);
    failIf(!document.packageFiles.some((file) => file.endsWith(".json")), failures, `${document.label} missing JSON package file`);
    failIf(!document.packageFiles.some((file) => file.endsWith(".md")), failures, `${document.label} missing Markdown package file`);
    failIf(!document.outputSurfaces.includes("Package DOCX"), failures, `${document.label} missing Package DOCX surface`);
    failIf(!document.workbookSheet, failures, `${document.label} missing workbook sheet contract`);
  }

  const manifestIds = payload.manifest.map((item) => item.contractId).filter(Boolean);
  expectedDocuments.forEach((id) => failIf(!manifestIds.includes(id), failures, `Output manifest missing contract id: ${id}`));
  const connectorManifest = payload.manifest.find((item) => item.contractId === "enterprise-connector-contracts") || {};
  failIf(!String(connectorManifest.packageFiles || "").includes("enterprise-connector-contracts.md"), failures, "Enterprise Connector Contracts manifest missing Markdown package file");
  failIf(!String(connectorManifest.packageFiles || "").includes("enterprise-connector-contracts.docx"), failures, "Enterprise Connector Contracts manifest missing DOCX package file");
  const connectorApprovalManifest = payload.manifest.find((item) => item.contractId === "connector-approval-checklist") || {};
  failIf(!String(connectorApprovalManifest.packageFiles || "").includes("connector-approval-checklist.md"), failures, "Connector Approval Checklist manifest missing Markdown package file");
  failIf(!String(connectorApprovalManifest.packageFiles || "").includes("connector-approval-checklist.docx"), failures, "Connector Approval Checklist manifest missing DOCX package file");
  const connectorValidationManifest = payload.manifest.find((item) => item.contractId === "connector-validation-plan") || {};
  failIf(!String(connectorValidationManifest.packageFiles || "").includes("connector-validation-plan.md"), failures, "Connector Validation Plan manifest missing Markdown package file");
  failIf(!String(connectorValidationManifest.packageFiles || "").includes("connector-validation-plan.docx"), failures, "Connector Validation Plan manifest missing DOCX package file");
  const connectorEvidenceManifest = payload.manifest.find((item) => item.contractId === "connector-validation-evidence-log") || {};
  failIf(!String(connectorEvidenceManifest.packageFiles || "").includes("connector-validation-evidence-log.md"), failures, "Connector Validation Evidence Log manifest missing Markdown package file");
  failIf(!String(connectorEvidenceManifest.packageFiles || "").includes("connector-validation-evidence-log.docx"), failures, "Connector Validation Evidence Log manifest missing DOCX package file");
  const connectorBuildRequestManifest = payload.manifest.find((item) => item.contractId === "connector-build-request-pack") || {};
  failIf(!String(connectorBuildRequestManifest.packageFiles || "").includes("connector-build-request-pack.md"), failures, "Connector Build Request Pack manifest missing Markdown package file");
  failIf(!String(connectorBuildRequestManifest.packageFiles || "").includes("connector-build-request-pack.docx"), failures, "Connector Build Request Pack manifest missing DOCX package file");
  const connectorPilotRunbookManifest = payload.manifest.find((item) => item.contractId === "connector-pilot-runbook") || {};
  failIf(!String(connectorPilotRunbookManifest.packageFiles || "").includes("connector-pilot-runbook.md"), failures, "Connector Pilot Runbook manifest missing Markdown package file");
  failIf(!String(connectorPilotRunbookManifest.packageFiles || "").includes("connector-pilot-runbook.docx"), failures, "Connector Pilot Runbook manifest missing DOCX package file");
  const connectorPromotionDecisionManifest = payload.manifest.find((item) => item.contractId === "connector-promotion-decision-packet") || {};
  failIf(!String(connectorPromotionDecisionManifest.packageFiles || "").includes("connector-promotion-decision-packet.md"), failures, "Connector Promotion Decision Packet manifest missing Markdown package file");
  failIf(!String(connectorPromotionDecisionManifest.packageFiles || "").includes("connector-promotion-decision-packet.docx"), failures, "Connector Promotion Decision Packet manifest missing DOCX package file");

  const routes = payload.rows.routing.slice(1).map((row) => row[0]);
  expectedRoutes.forEach((route) => failIf(!routes.includes(route), failures, `Question routing missing route: ${route}`));

  failIf(payload.rows.templateAlignment.length !== expectedDocuments.length + 1, failures, "Template Alignment rows do not cover each expected document");
  failIf(!payload.rows.templateAlignment[0].includes("Missing Required Sections"), failures, "Template Alignment rows missing required-section column");
  failIf(!payload.rows.templateAlignment[0].includes("Supplement Fields"), failures, "Template Alignment rows missing supplement-field column");
  failIf(!payload.rows.templateAlignment[0].includes("Source Types"), failures, "Template Alignment rows missing source-type column");
  failIf(!payload.rows.outputManifest[0].includes("Contract ID"), failures, "Output Manifest rows missing Contract ID column");
  failIf(!payload.rows.outputManifest[0].includes("Workbook Sheet"), failures, "Output Manifest rows missing Workbook Sheet column");
  for (const [name, rows] of Object.entries({ product: payload.rows.product, engineering: payload.rows.engineering, business: payload.rows.business, recipe: payload.rows.recipe, execution: payload.rows.execution, enterprise: payload.rows.enterprise })) {
    failIf(!rows[0].includes("Owner Route"), failures, `${name} rows missing owner route column`);
    failIf(!rows[0].includes("Source Type"), failures, `${name} rows missing source type column`);
    failIf(!rows[0].includes("Treatment"), failures, `${name} rows missing treatment column`);
    failIf(!rows[0].includes("Supplement Later?"), failures, `${name} rows missing supplement-later column`);
  }
  failIf(!payload.rows.business.some((row) => row.includes("Supplement later")), failures, "Business rows do not flag supplement-later value fields");
  failIf(!documents.some((document) => document.supplementFieldCount > 0), failures, "Template contract does not count supplement-later fields");

  for (const [name, markdown] of Object.entries(payload.markdownChecks)) {
    failIf(!markdown.includes("## Executive Snapshot"), failures, `${name} markdown missing Executive Snapshot`);
    failIf(!markdown.includes("## Routed Questions"), failures, `${name} markdown missing Routed Questions`);
    failIf(!markdown.includes("## Full Field Detail"), failures, `${name} markdown missing Full Field Detail`);
    failIf(!markdown.includes("Source") && !markdown.includes("Discovery capture"), failures, `${name} markdown missing field provenance metadata`);
  }
  failIf(!payload.markdownChecks.recipe.includes("ChatGPT"), failures, "Solution Build Recipe markdown missing ChatGPT guidance");
  failIf(!payload.markdownChecks.recipe.includes("Microsoft Copilot"), failures, "Solution Build Recipe markdown missing Microsoft Copilot guidance");
  failIf(!payload.markdownChecks.recipe.includes("Builder Execution Plan"), failures, "Solution Build Recipe markdown missing Builder Execution Plan");
  failIf(!payload.markdownChecks.execution.includes("ChatGPT Builder Actions"), failures, "Solution Execution Plan markdown missing ChatGPT Builder Actions");
  failIf(!payload.markdownChecks.execution.includes("Microsoft Copilot Builder Actions"), failures, "Solution Execution Plan markdown missing Microsoft Copilot Builder Actions");
  failIf(!payload.markdownChecks.execution.includes("Data Inputs and Permission Gates"), failures, "Solution Execution Plan markdown missing data and permission gates");
  failIf(!payload.markdownChecks.enterprise.includes("Enterprise Source Setup"), failures, "Enterprise Readiness Brief markdown missing source setup gates");
  failIf(!payload.markdownChecks.enterprise.includes("Connector Approval Gates"), failures, "Enterprise Readiness Brief markdown missing connector approval gates");
  failIf(!payload.markdownChecks.enterprise.includes("Evidence Needed and Next Actions"), failures, "Enterprise Readiness Brief markdown missing evidence and next actions");
  failIf(!payload.rows.recipe.some((row) => row.includes("Recommended route")), failures, "Solution Build Recipe rows missing recommended route");
  failIf(!documents.find((document) => document.id === "solution-build-recipe")?.packageFiles.includes("solution-execution-plan.json"), failures, "Solution Build Recipe package contract missing solution-execution-plan.json");
  failIf(!documents.find((document) => document.id === "solution-execution-plan")?.packageFiles.includes("solution-execution-plan.docx"), failures, "Solution Execution Plan package contract missing solution-execution-plan.docx");
  failIf(!documents.find((document) => document.id === "solution-build-recipe")?.packageFiles.includes("enterprise-connector-contracts.md"), failures, "Solution Build Recipe package contract missing enterprise-connector-contracts.md");
  failIf(!documents.find((document) => document.id === "solution-build-recipe")?.packageFiles.includes("connector-approval-checklist.md"), failures, "Solution Build Recipe package contract missing connector-approval-checklist.md");
  failIf(!documents.find((document) => document.id === "solution-build-recipe")?.packageFiles.includes("connector-validation-plan.md"), failures, "Solution Build Recipe package contract missing connector-validation-plan.md");
  failIf(!documents.find((document) => document.id === "solution-build-recipe")?.packageFiles.includes("connector-validation-evidence-log.md"), failures, "Solution Build Recipe package contract missing connector-validation-evidence-log.md");
  failIf(!documents.find((document) => document.id === "solution-build-recipe")?.packageFiles.includes("connector-build-request-pack.md"), failures, "Solution Build Recipe package contract missing connector-build-request-pack.md");
  failIf(!documents.find((document) => document.id === "solution-build-recipe")?.packageFiles.includes("connector-pilot-runbook.md"), failures, "Solution Build Recipe package contract missing connector-pilot-runbook.md");
  failIf(!documents.find((document) => document.id === "solution-build-recipe")?.packageFiles.includes("connector-promotion-decision-packet.md"), failures, "Solution Build Recipe package contract missing connector-promotion-decision-packet.md");
  failIf(!documents.find((document) => document.id === "enterprise-readiness-brief")?.packageFiles.includes("enterprise-readiness-brief.docx"), failures, "Enterprise Readiness Brief package contract missing enterprise-readiness-brief.docx");

  ["## Product PDR", "## Engineering / Solution Architecture Brief", "## Business Value Brief", "## Governance Inputs", "## Solution Build Recipe", "## Solution Execution Plan", "## Enterprise Readiness Brief", "## Open Question Routing"].forEach((heading) => {
    failIf(!payload.markdownChecks.combined.includes(heading), failures, `Combined packet missing ${heading}`);
  });
  failIf(!payload.rows.combined.some((row) => row.includes("Build and Readiness Artifacts")), failures, "Combined packet rows missing Build and Readiness Artifacts section");
  failIf(!payload.rows.combined.some((row) => row.includes("Enterprise Readiness Brief")), failures, "Combined packet rows missing Enterprise Readiness Brief artifact");

  const summary = {
    appUrl,
    checkedAt: new Date().toISOString(),
    passed: failures.length === 0,
    failures,
    documentIds,
    routes: [...new Set(routes)],
    packageFiles: payload.contract.packageManifestFiles,
    workbookSheets: payload.contract.workbookSheets
  };
  await fs.writeFile(outputPath, `${JSON.stringify({ summary, payload }, null, 2)}\n`);
  if (failures.length) {
    failures.forEach((failure) => console.error(`FAIL ${failure}`));
    process.exitCode = 1;
    return;
  }
  console.log(`OK template alignment smoke passed for ${documents.length} documents and ${summary.routes.length} question routes`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
