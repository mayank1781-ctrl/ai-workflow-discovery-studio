import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const appUrl = process.env.APP_URL || "http://localhost:5177";
const appPath = path.join(appDir, "app.js");
const outputDir = path.join(appDir, "test-outputs/regression");
const outputPath = path.join(outputDir, "interview-flow.json");
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
  if (start < 0 || end < 0) {
    throw new Error("Could not locate defaultState in app.js for regression seeding.");
  }
  const sandbox = { Date, result: null };
  vm.runInNewContext(`${source.slice(start, end)}\nresult = defaultState;`, sandbox);
  return sandbox.result;
}

const defaultState = loadDefaultState();
const baseFields = defaultState.fields;

function stateWith({ fields = {}, steps = [], systems = [], data = [], decisions = [] } = {}) {
  return {
    ...JSON.parse(JSON.stringify(defaultState)),
    fields: { ...baseFields, ...fields },
    steps,
    systems,
    data,
    decisions,
    patterns: [],
    questionFocus: "auto",
    activeSection: "idea",
    currentQuestionOverride: "",
    currentQuestionSource: "Intake guide",
    conversation: [
      {
        role: "assistant",
        section: "Idea",
        text: "Let's start simple. What idea or workflow should we explore first?",
        time: new Date().toISOString()
      }
    ],
    drilldown: {
      enabled: true,
      status: "waitingForSteps",
      skeletonConfirmed: false,
      currentClusterId: "",
      lastPrompt: "",
      manualStepFocus: false
    }
  };
}

const workshopFields = {
  submittedIdea: "Workshop use case",
  submittedWorkflowTask: "Preparing for a workshop",
  workflowCategory: "Pre-delivery / workshop prep",
  useCaseArchetype: "Workshop acceleration"
};

const boundaryFields = {
  ...workshopFields,
  workflowName: "Preparing for a workshop",
  startPoint: "Client or senior partner identifies need",
  endPoint: "Workshop output created",
  businessOutcome: "Documentation and answers to a client problem"
};

const componentFields = {
  ...boundaryFields,
  currentStateSummary: "Uses Teams, SharePoint, PowerPoint, prior decks, client problem statements, notes, and templates to create final workshop decks and facilitation materials."
};

const longConversation = [
  { role: "assistant", section: "Idea", text: "Let's start simple. What idea or workflow should we explore first?", time: new Date().toISOString() },
  { role: "user", section: "Typed answer", text: "Let's explore the Workshop use case.", time: new Date().toISOString() },
  { role: "assistant", section: "Next question", text: "I heard this is about Workshop use case. Next: What is this workflow called, where does it start, where does it end, and what output does it create?", time: new Date().toISOString() },
  { role: "user", section: "Typed answer", text: "Workflow is called Preparing for Workshop. It starts when a client or client partner asks for one, and the output is a custom packet with templates, facilitator guides, and workshop materials.", time: new Date().toISOString() },
  { role: "assistant", section: "Next question", text: "I heard the workflow frame. Before the A-to-Z list, what tools or systems and main inputs and data types should we capture across the workflow overall?", time: new Date().toISOString() },
  { role: "user", section: "Typed answer", text: "The workflow uses Teams, SharePoint, PowerPoint, prior decks, client problem statements, notes, and templates to create final workshop decks and facilitation materials.", time: new Date().toISOString() },
  { role: "assistant", section: "Next question", text: "Can you give me the rough numbered A-to-Z process from trigger to final output?", time: new Date().toISOString() }
];

const scenarios = [
  {
    id: "fresh",
    state: stateWith(),
    expectedQuestion: ["what task or workflow"],
    forbiddenQueue: ["data boundary", "client-approved", "direct system access"],
    minSessionPercent: 0
  },
  {
    id: "generic-topic-not-captured",
    state: stateWith({ fields: { submittedIdea: "A new use case" } }),
    expectedQuestion: ["what task or workflow"],
    forbiddenQueue: ["data boundary", "client-approved", "direct system access"],
    minSessionPercent: 0
  },
  {
    id: "topic-only",
    state: stateWith({ fields: workshopFields }),
    expectedQuestion: ["workflow called", "where does it start", "what output"],
    forbiddenQueue: ["data boundary", "client-approved", "direct system access"],
    minSessionPercent: 10
  },
  {
    id: "raw-ai-boundary-redirected-after-topic",
    state: {
      ...stateWith({ fields: workshopFields }),
      currentQuestionOverride: "What data boundary applies: internal only, client-approved environment, sanitized artifacts, client data approval, likely MSA review, or unknown?",
      currentQuestionSource: "AI extraction"
    },
    expectedQuestion: ["workflow called", "where does it start", "what output"],
    forbiddenQueue: ["data boundary", "client-approved", "direct system access"],
    minSessionPercent: 10
  },
  {
    id: "boundary-captured",
    state: stateWith({ fields: boundaryFields }),
    expectedQuestion: ["before the a-to-z list", "tools or systems", "main inputs"],
    forbiddenQueue: ["data boundary", "client-approved", "direct system access"],
    minSessionPercent: 24
  },
  {
    id: "raw-ai-boundary-redirected-after-overview",
    state: {
      ...stateWith({ fields: componentFields }),
      systems: [{ name: "SharePoint", purpose: "file storage" }],
      data: [{ category: "Client problem statements", sensitivity: "Client confidential" }],
      currentQuestionOverride: "What data boundary applies: internal only, client-approved environment, sanitized artifacts, client data approval, likely MSA review, or unknown?",
      currentQuestionSource: "AI extraction"
    },
    expectedQuestion: ["rough numbered a-to-z process", "trigger to final output"],
    forbiddenQueue: ["data boundary", "client-approved"],
    minSessionPercent: 43
  },
  {
    id: "components-captured",
    state: stateWith({
      fields: componentFields,
      systems: [{ name: "SharePoint", purpose: "file storage" }],
      data: [{ category: "Client problem statements", sensitivity: "Client confidential" }]
    }),
    expectedQuestion: ["rough numbered a-to-z process", "trigger to final output"],
    forbiddenQueue: ["data boundary", "client-approved", "direct system access"],
    minSessionPercent: 43
  },
  {
    id: "long-transcript-rail",
    state: {
      ...stateWith({
        fields: componentFields,
        systems: [{ name: "SharePoint", purpose: "file storage" }],
        data: [{ category: "Client problem statements", sensitivity: "Client confidential" }]
      }),
      conversation: longConversation
    },
    expectedQuestion: ["rough numbered a-to-z process", "trigger to final output"],
    forbiddenQueue: ["data boundary", "client-approved", "direct system access"],
    minSessionPercent: 43,
    maxVisibleMessages: 4,
    requireHistoryNote: true
  },
  {
    id: "first-step-exists",
    state: stateWith({
      fields: componentFields,
      systems: [{ name: "SharePoint", purpose: "file storage" }],
      data: [{ category: "Client problem statements", sensitivity: "Client confidential" }],
      steps: [
        {
          name: "Receive initial workshop request",
          actor: "Engagement lead",
          input: "Client problem",
          output: "Workshop need",
          evidenceConfidence: "Medium"
        }
      ]
    }),
    expectedQuestion: ["receive initial workshop request", "systems or tools"],
    allowedDetailedQueue: true,
    minSessionPercent: 65
  }
];

function containsAll(text, terms) {
  const haystack = String(text || "").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function containsAny(text, terms = []) {
  const haystack = String(text || "").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function assertScenario(spec, result) {
  const failures = [];
  if (!containsAll(result.currentQuestion, spec.expectedQuestion)) {
    failures.push(`Expected current question to include: ${spec.expectedQuestion.join(", ")}`);
  }
  if (!spec.allowedDetailedQueue && containsAny(result.queueText, spec.forbiddenQueue)) {
    failures.push(`Detailed queue appeared too early: ${spec.forbiddenQueue.join(", ")}`);
  }
  if (typeof spec.minSessionPercent === "number" && result.sessionPercent < spec.minSessionPercent) {
    failures.push(`Session progress ${result.sessionPercent}% below expected ${spec.minSessionPercent}%`);
  }
  if (typeof spec.maxVisibleMessages === "number" && result.visibleMessages > spec.maxVisibleMessages) {
    failures.push(`Transcript shows ${result.visibleMessages} messages; expected at most ${spec.maxVisibleMessages}`);
  }
  if (spec.requireHistoryNote && !result.historyNote) {
    failures.push("Expected older-turn history note in transcript rail");
  }
  if (result.transcriptOverlap) {
    failures.push("Transcript message cards overlap visually");
  }
  return failures;
}

async function run() {
  const launchOptions = { headless: true };
  if (browserExecutable) launchOptions.executablePath = browserExecutable;
  const browser = await chromium.launch(launchOptions);
  const results = [];

  for (const scenario of scenarios) {
    const context = await browser.newContext();
    await context.addInitScript((seedState) => {
      window.localStorage.setItem("discovery-intake-state", JSON.stringify(seedState));
    }, scenario.state);
    const page = await context.newPage();
    await page.goto(appUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#currentQuestion", { timeout: 10000 });
    const result = await page.evaluate(() => {
      const queue = Array.from(document.querySelectorAll("#questionQueuePreview article")).map((node) =>
        node.innerText.replace(/\s+/g, " ").trim()
      );
      const messageBoxes = Array.from(document.querySelectorAll("#conversationLog .message")).map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      return {
        currentQuestion: document.querySelector("#currentQuestion")?.innerText || "",
        source: document.querySelector("#questionSource")?.innerText || "",
        sessionPercent: Number((document.querySelector("#discoveryCompletionLabel")?.innerText || "").match(/\d+/)?.[0] || 0),
        visibleMessages: document.querySelectorAll("#conversationLog .message").length,
        historyNote: document.querySelector("#conversationLog .conversation-history-note")?.innerText || "",
        transcriptOverlap: messageBoxes.some((box, index) => index > 0 && box.top < messageBoxes[index - 1].bottom - 2),
        queue,
        queueText: queue.join(" | ")
      };
    });
    const failures = assertScenario(scenario, result);
    results.push({ id: scenario.id, status: failures.length ? "fail" : "pass", failures, ...result });
    await context.close();
  }

  await browser.close();
  const summary = {
    appUrl,
    checkedAt: new Date().toISOString(),
    passed: results.filter((result) => result.status === "pass").length,
    failed: results.filter((result) => result.status === "fail").length,
    results
  };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
