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
const outputDir = path.join(appDir, "test-outputs/evidence-linkage");
const outputPath = path.join(outputDir, "evidence-linkage.json");
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

function evidenceLinkageSmokeState() {
  const now = new Date().toISOString();
  const state = JSON.parse(JSON.stringify(loadDefaultState()));
  state.appMode = "analysis";
  state.activeWorkbenchTab = "library";
  state.sessionMeta = {
    ...(state.sessionMeta || {}),
    id: `evidence-linkage-${Date.now().toString(36)}`,
    name: "Evidence Linkage Smoke",
    owner: "AI Infusion Reviewer",
    source: "Evidence linkage smoke",
    dataClassification: "Synthetic / sample",
    updatedAt: now
  };
  state.fields = {
    ...(state.fields || {}),
    workflowName: "Evidence-linked workshop prep",
    submittedWorkflowTask: "Evidence-linked workshop prep",
    workflowCategory: "Pre-delivery / workshop prep",
    practice: "Banking",
    domain: "Client delivery",
    businessOutcome: "Create a source-backed workshop prep packet.",
    startPoint: "Workshop request arrives",
    endPoint: "Reviewed facilitation pack is ready",
    definitionOfDone: "Agenda, deck, exercise prompts, and source notes are reviewed.",
    evidencePolicy: "Optional evidence, metadata-first"
  };
  state.steps = [
    {
      name: "Find prior assets",
      actor: "Consultant",
      tool: "SharePoint",
      accessMode: "Microsoft 365 files",
      input: "Workshop objective",
      output: "Candidate source assets",
      evidenceConfidence: "Medium"
    }
  ];
  state.systems = [{ name: "SharePoint", purpose: "Source assets", access: "Microsoft 365" }];
  state.evidenceArtifacts = [
    {
      id: "ev-linkage-smoke",
      fileName: "workshop-source-tracker.xlsx",
      fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sourceKind: "spreadsheet",
      uploadedAt: now,
      status: "reviewed",
      summary: "Tracker identifies source assets, owners, and review steps for workshop prep.",
      confidence: "medium",
      artifactType: "Spreadsheet / tracker",
      textPreview: "Synthetic tracker with assets, owners, and review status.",
      suggestedFieldUpdates: [
        { key: "workflowName", value: "Workshop source tracker review", rationale: "The file title names the workflow." },
        { key: "definitionOfDone", value: "Reviewed workshop packet with cited source assets.", rationale: "The tracker includes review status and output checklist." }
      ],
      suggestedRecords: {
        steps: [
          {
            name: "Review source tracker",
            actor: "Manager",
            tool: "Excel",
            accessMode: "User-provided workbook",
            input: "Source tracker rows",
            output: "Approved source list",
            decision: "Manager approves source list",
            evidenceConfidence: "Medium"
          }
        ],
        data: [
          {
            category: "Source asset metadata",
            source: "Tracker",
            format: "Excel",
            sensitivity: "Internal",
            usage: "Reference",
            processing: "Extract owner, status, and asset link"
          }
        ],
        systems: [
          { name: "Excel", purpose: "Evidence tracker", access: "User-provided workbook" }
        ],
        decisions: [
          { decision: "Approve source list", owner: "Manager", criteria: "Relevant, current, safe to reuse", approval: "Required" }
        ],
        patterns: [
          { pattern: "Retrieve", step: "Review source tracker", notes: "Find approved prior assets." }
        ]
      },
      suggestedIdeas: [
        { idea: "Create reusable source asset index", source: "Evidence", notes: "Could help multiple workshop teams." }
      ],
      followUpQuestions: ["Who owns the approved source asset library after the pilot?"],
      confirmationPrompt: "Should these tracker-backed source asset fields be applied?",
      warnings: ["Confirm no client-confidential source links are copied into the package."],
      applied: false,
      dismissed: false
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
  const context = await browser.newContext();
  await context.addInitScript((seedState) => {
    window.localStorage.setItem("discovery-intake-state", JSON.stringify(seedState));
  }, evidenceLinkageSmokeState());
  const page = await context.newPage();
  await page.goto(`${appUrl}/?evidence-linkage-smoke=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.deriveEvidenceLinkageContract === "function" && typeof window.evidenceLinkageRows === "function", null, { timeout: 10000 });
  await page.waitForSelector(".evidence-link-list span", { state: "visible", timeout: 10000 });
  payload = await page.evaluate(() => {
    const contract = deriveEvidenceLinkageContract();
    const rows = evidenceLinkageRows(contract);
    const markdown = evidenceLinkageMarkdown(contract);
    return {
      contract,
      rows,
      markdown,
      visibleLinkText: Array.from(document.querySelectorAll(".evidence-link-list span")).map((node) => node.innerText)
    };
  });
  await fs.writeFile(path.join(outputDir, "evidence-linkage-ui.html"), await page.content());
  await context.close();
} finally {
  await browser.close();
}

const failures = [];
const links = payload.contract.links || [];
const linkTypes = links.map((link) => link.targetType);
failIf(payload.contract.evidenceMandatory !== false, failures, "Evidence linkage contract should mark evidence as optional");
failIf(payload.contract.summary.artifactCount !== 1, failures, "Evidence linkage contract should include one artifact");
failIf(payload.contract.summary.linkCount < 8, failures, `Expected at least 8 evidence links; found ${payload.contract.summary.linkCount}`);
["Field", "Step", "Data", "System", "Decision", "AI pattern", "Idea", "Open Question", "Risk"].forEach((type) => {
  failIf(!linkTypes.includes(type), failures, `Evidence linkage missing target type: ${type}`);
});
["Artifact ID", "Target Type", "Route", "Treatment", "Link Status"].forEach((column) => {
  failIf(!payload.rows[0].includes(column), failures, `Evidence linkage rows missing column: ${column}`);
});
failIf(!/Evidence mandatory: No/.test(payload.markdown), failures, "Evidence linkage markdown does not say evidence is optional");
failIf(!payload.visibleLinkText.some((text) => /Field/i.test(text)), failures, "Visible evidence card does not show field link chip");
failIf(!payload.visibleLinkText.some((text) => /Step/i.test(text)), failures, "Visible evidence card does not show step link chip");

await fs.writeFile(outputPath, `${JSON.stringify({ summary: { passed: failures.length === 0, failures, linkTypes }, payload }, null, 2)}\n`);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`OK evidence linkage smoke passed with ${links.length} links across ${new Set(linkTypes).size} target types`);
}
