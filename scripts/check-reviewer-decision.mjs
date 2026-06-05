import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "discovery-intake-webapp");
const appPath = path.join(appDir, "app.js");
const appUrl = process.env.APP_URL || "http://localhost:5177";
const outputDir = path.join(appDir, "test-outputs/reviewer-decision");
const outputPath = path.join(outputDir, "reviewer-decision-summary.json");
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

function reviewerDecisionSmokeState() {
  const now = new Date();
  const state = JSON.parse(JSON.stringify(loadDefaultState()));
  state.appMode = "analysis";
  state.activeWorkbenchTab = "business";
  state.sessionMeta = {
    ...(state.sessionMeta || {}),
    id: `reviewer-decision-${Date.now().toString(36)}`,
    name: "Reviewer Decision Smoke",
    owner: "AI Infusion Reviewer",
    source: "Reviewer decision smoke",
    dataClassification: "Synthetic / sample",
    lastPackagePath: "data/packages/reviewer-decision-smoke-package",
    lastPackageName: "reviewer-decision-smoke-package",
    updatedAt: now.toISOString()
  };
  state.fields = {
    ...(state.fields || {}),
    workflowName: "Coworker review handoff",
    submittedWorkflowTask: "Coworker review handoff",
    workflowCategory: "Client delivery",
    domain: "Financial services",
    businessOutcome: "Make coworker feedback reviewable before broader testing."
  };
  state.steps = [
    {
      name: "Capture workflow",
      actor: "Consultant",
      tool: "Discovery Studio",
      input: "Reviewer workflow notes",
      output: "Draft handoff packet"
    }
  ];
  state.pilotFeedbackLog = [
    {
      ...state.pilotFeedback,
      id: "feedback-engineering",
      reviewerName: "Engineering Reviewer",
      reviewerRole: "Solution architecture",
      pilotScenario: "Live colleague pilot",
      experienceRating: "4 - Strong",
      decision: "Ready for Engineering review",
      outputUsefulness: "Engineering brief separated build assumptions from validated facts.",
      productEngineeringGaps: "Needs clearer connector error-handling notes.",
      recommendedChanges: "Add a compact readiness summary to the package.",
      pilotRunLabel: "Pilot 3",
      packagePath: "data/packages/reviewer-decision-smoke-package",
      savedAt: new Date(now.getTime() - 1_000).toISOString()
    },
    {
      ...state.pilotFeedback,
      id: "feedback-pilot",
      reviewerName: "Product Reviewer",
      reviewerRole: "Product lead",
      pilotScenario: "Synthetic banking test",
      experienceRating: "3 - Usable",
      decision: "Run another pilot",
      missingQuestions: "Ask earlier about output consumer and handoff owner.",
      productEngineeringGaps: "Product PDR needs a sharper user story.",
      confusingMoments: "The feedback area was easy to miss.",
      pilotRunLabel: "Pilot 2",
      packagePath: "data/packages/reviewer-decision-smoke-package",
      savedAt: new Date(now.getTime() - 2_000).toISOString()
    },
    {
      ...state.pilotFeedback,
      id: "feedback-product",
      reviewerName: "Business Reviewer",
      reviewerRole: "AI Infusion sponsor",
      pilotScenario: "Strategy workshop prep test",
      experienceRating: "4 - Strong",
      decision: "Ready for Product review",
      questionsThatWorked: "The A-to-Z process question worked well.",
      outputUsefulness: "Business value draft was useful enough for review.",
      enterpriseConcerns: "Need approved SharePoint storage before broader testing.",
      pilotRunLabel: "Pilot 1",
      packagePath: "data/packages/reviewer-decision-smoke-package",
      savedAt: new Date(now.getTime() - 3_000).toISOString()
    }
  ];
  return state;
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
  const context = await browser.newContext({ viewport: { width: 1366, height: 980 } });
  await context.addInitScript((seedState) => {
    window.localStorage.setItem("discovery-intake-state", JSON.stringify(seedState));
  }, reviewerDecisionSmokeState());
  const page = await context.newPage();
  await page.goto(`${appUrl}/?reviewer-decision-smoke=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.deriveReviewerDecisionSummary === "function" && typeof window.reviewerDecisionRows === "function", null, { timeout: 10000 });
  await page.waitForSelector("[data-reviewer-decision-panel]", { state: "visible", timeout: 10000 });
  payload = await page.evaluate(() => {
    const summary = deriveReviewerDecisionSummary();
    const rows = reviewerDecisionRows(summary);
    const markdown = reviewerDecisionMarkdown(summary);
    const panel = document.querySelector("[data-reviewer-decision-panel]");
    const panelBox = panel.getBoundingClientRect();
    return {
      summary,
      rows,
      markdown,
      panelText: panel.innerText,
      panelBox: {
        width: panelBox.width,
        height: panelBox.height
      }
    };
  });
  await fs.writeFile(path.join(outputDir, "reviewer-decision-ui.html"), await page.content());
  await context.close();
} finally {
  await browser.close();
}

const failures = [];
const header = payload.rows[0] || [];
const decisions = payload.summary.decisionBreakdown.map((item) => item.decision);
const categories = payload.summary.backlogItems.map((item) => item.category);

failIf(payload.summary.feedbackCount !== 3, failures, `Expected 3 feedback signals; found ${payload.summary.feedbackCount}`);
failIf(payload.summary.averageRating < 3.5, failures, `Expected average rating >= 3.5; found ${payload.summary.averageRating}`);
["Ready for Product review", "Ready for Engineering review", "Run another pilot"].forEach((decision) => {
  failIf(!decisions.includes(decision), failures, `Reviewer decision summary missing decision: ${decision}`);
});
["Question gap", "Handoff gap", "App change"].forEach((category) => {
  failIf(!categories.includes(category), failures, `Reviewer backlog missing category: ${category}`);
});
["Decision", "Reviewer", "Recommended Action"].forEach((column) => {
  failIf(!header.includes(column), failures, `Reviewer decision rows missing column: ${column}`);
});
failIf(!/# Reviewer Decision Summary/.test(payload.markdown), failures, "Reviewer decision markdown missing heading");
failIf(!/Product\/Engineering review candidate/.test(payload.panelText), failures, "Visible reviewer decision panel missing suggested phase");
failIf(payload.panelBox.width < 600 || payload.panelBox.height < 200, failures, "Reviewer decision panel rendered too small to review");

await fs.writeFile(outputPath, `${JSON.stringify({ summary: { passed: failures.length === 0, failures, decisions, categories }, payload }, null, 2)}\n`);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`OK reviewer decision smoke passed with ${payload.summary.feedbackCount} reviews and ${payload.summary.backlogItems.length} backlog items`);
}
