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
const outputDir = path.join(appDir, "test-outputs/layout");
const outputPath = path.join(outputDir, "discovery-layout.json");
const browserExecutable = process.env.CHROME_EXECUTABLE || firstExistingPath([
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
]);

const viewports = [
  { id: "desktop", width: 1440, height: 900, requireHeroAndTranscriptInViewport: true },
  { id: "mobile", width: 390, height: 844, requireHeroAndTranscriptInViewport: false }
];

function firstExistingPath(candidates) {
  return candidates.find((candidate) => fsSync.existsSync(candidate)) || "";
}

function loadDefaultState() {
  const source = fsSync.readFileSync(appPath, "utf8");
  const start = source.indexOf("const defaultState = ");
  const end = source.indexOf("\n\nlet state = loadState();", start);
  if (start < 0 || end < 0) {
    throw new Error("Could not locate defaultState in app.js for layout seeding.");
  }
  const sandbox = { Date, result: null };
  vm.runInNewContext(`${source.slice(start, end)}\nresult = defaultState;`, sandbox);
  return sandbox.result;
}

function layoutSmokeState() {
  const now = new Date().toISOString();
  const state = JSON.parse(JSON.stringify(loadDefaultState()));
  state.appMode = "interview";
  state.activeSection = "overview";
  state.questionFocus = "auto";
  state.currentQuestionOverride = "";
  state.currentQuestionSource = "Intake guide";
  state.sessionMeta = {
    ...(state.sessionMeta || {}),
    id: `layout-smoke-${Date.now().toString(36)}`,
    name: "Layout Smoke Workflow",
    source: "Layout smoke test"
  };
  state.fields = {
    ...(state.fields || {}),
    submittedIdea: "Workshop preparation assistant",
    submittedWorkflowTask: "Preparing reusable workshop materials",
    workflowCategory: "Pre-delivery / workshop prep",
    useCaseArchetype: "Workshop acceleration",
    workflowName: "Preparing reusable workshop materials",
    startPoint: "Client partner asks for a workshop",
    endPoint: "Workshop packet and facilitation plan are ready",
    businessOutcome: "Reduce prep time while keeping partner review and client-specific tailoring.",
    currentStateSummary: "Uses Teams, SharePoint, PowerPoint, prior decks, client notes, templates, and working-session transcripts to create workshop materials."
  };
  state.systems = [
    { name: "Teams", purpose: "Coordination and meeting notes" },
    { name: "SharePoint", purpose: "Prior decks, templates, and source files" },
    { name: "PowerPoint", purpose: "Final workshop material" }
  ];
  state.data = [
    {
      category: "Workshop context",
      source: "Partner notes and prior materials",
      format: "Documents, decks, and meeting notes",
      sensitivity: "Internal / client-context sample",
      usage: "Input"
    }
  ];
  state.conversation = [
    {
      role: "assistant",
      section: "Idea",
      text: "What task or workflow do you want to talk about? Briefly describe what happens, the business outcome, and the main output.",
      time: now
    },
    {
      role: "user",
      section: "Typed answer",
      text: "Preparing workshop materials for client sessions.",
      time: now
    },
    {
      role: "assistant",
      section: "Next question",
      text: "What is this workflow called, where does it start, where does it end, and what output does it create?",
      time: now
    },
    {
      role: "user",
      section: "Typed answer",
      text: "It starts when a client partner asks for a working session and ends with a tailored workshop packet, facilitation plan, and follow-up note structure.",
      time: now
    },
    {
      role: "assistant",
      section: "Next question",
      text: "Before the A-to-Z list, what tools or systems and main inputs and data types should we capture across the workflow overall?",
      time: now
    },
    {
      role: "assistant",
      section: "Next question",
      text: "Can you give me the rough numbered A-to-Z process from trigger to final output?",
      time: now
    },
    {
      role: "user",
      section: "Typed answer",
      text: "1. Receive the partner request and clarify the target outcome.\n2. Pull prior decks, reusable templates, and relevant client context from SharePoint.\n3. Create a rough agenda and facilitation flow.\n4. Draft the workshop packet in PowerPoint.\n5. Review with the partner, revise the examples, and prepare the final materials for the client team.",
      time: now
    }
  ];
  return state;
}

function intersects(a, b, tolerance = 1) {
  return a.left < b.right - tolerance && a.right > b.left + tolerance && a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;
}

async function capturePageLayout(page, viewport) {
  return page.evaluate((options) => {
    const selectors = {
      currentQuestion: "#currentQuestion",
      currentQuestionCard: ".current-question-card",
      questionQueue: "#questionQueuePreview",
      mainTurnActions: ".main-turn-actions",
      transcriptCard: ".embedded-transcript-card",
      conversationLog: "#conversationLog",
      transcriptComposer: ".transcript-composer",
      textInput: "#aiChatInput",
      sendButton: "#sendChatButton",
      completionPill: "#discoveryCompletionPill"
    };
    const rectFor = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return {
        selector,
        display: style.display,
        visibility: style.visibility,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth,
        horizontallyContained: rect.left >= -2 && rect.right <= window.innerWidth + 2
      };
    };
    const rects = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, rectFor(selector)]));
    const messageRects = Array.from(document.querySelectorAll("#conversationLog .message")).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: node.innerText.replace(/\s+/g, " ").trim().slice(0, 80),
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    });
    const buttonOverflows = Array.from(document.querySelectorAll("button, label.secondary-button, label.primary-button"))
      .filter((node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      })
      .filter((node) => node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 4)
      .map((node) => node.innerText.replace(/\s+/g, " ").trim() || node.id || node.className);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.getBoundingClientRect().width,
      visibleMessages: messageRects.length,
      historyNote: document.querySelector("#conversationLog .conversation-history-note")?.innerText || "",
      expanders: document.querySelectorAll("#conversationLog .message-expand summary").length,
      rects,
      messageRects,
      buttonOverflows,
      requireHeroAndTranscriptInViewport: options.requireHeroAndTranscriptInViewport
    };
  }, viewport);
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1
  });
  await context.addInitScript((seedState) => {
    window.localStorage.setItem("discovery-intake-state", JSON.stringify(seedState));
  }, layoutSmokeState());
  const page = await context.newPage();
  await page.goto(`${appUrl}/?layout-smoke=${viewport.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#conversationLog .message", { timeout: 10000 });
  await page.evaluate(() => document.fonts?.ready);

  const topScreenshot = path.join(outputDir, `discovery-${viewport.id}-top.png`);
  await page.screenshot({ path: topScreenshot, fullPage: false });
  const topResult = await capturePageLayout(page, viewport);

  let transcriptResult = topResult;
  if (!viewport.requireHeroAndTranscriptInViewport) {
    await page.locator(".embedded-transcript-card").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDir, `discovery-${viewport.id}-transcript.png`), fullPage: false });
    transcriptResult = await capturePageLayout(page, viewport);
  }

  const result = transcriptResult;

  const failures = [];
  for (const [key, rect] of Object.entries({ ...topResult.rects, ...transcriptResult.rects })) {
    if (!rect) {
      failures.push(`Missing required element: ${key}`);
    } else if (rect.display === "none" || rect.visibility === "hidden" || rect.width < 1 || rect.height < 1) {
      failures.push(`Required element is hidden or has no size: ${key}`);
    }
  }

  for (const snapshot of [topResult, transcriptResult]) {
    if (snapshot.documentWidth > snapshot.viewport.width + 2) {
      failures.push(`Horizontal overflow: document ${snapshot.documentWidth}px exceeds viewport ${snapshot.viewport.width}px`);
    }
  }
  for (const key of ["currentQuestionCard", "questionQueue", "mainTurnActions", "completionPill"]) {
    const rect = topResult.rects[key];
    if (rect && !rect.horizontallyContained) {
      failures.push(`${key} is clipped horizontally in the first viewport`);
    }
  }
  if (result.visibleMessages > 2) {
    failures.push(`Transcript shows ${result.visibleMessages} turns; expected latest two turns only`);
  }
  if (!result.historyNote.includes("older turns saved")) {
    failures.push("Transcript history note is missing for older turns");
  }
  if (result.expanders < 1) {
    failures.push("Long transcript turn does not expose a Show full turn control");
  }
  if (result.buttonOverflows.length) {
    failures.push(`Visible button/label content overflows: ${result.buttonOverflows.join(", ")}`);
  }

  const messageOverlap = result.messageRects.some((box, index, all) => index > 0 && box.top < all[index - 1].bottom - 2);
  if (messageOverlap) {
    failures.push("Visible transcript message cards overlap");
  }

  const pairs = [
    ["currentQuestionCard", "mainTurnActions"],
    ["conversationLog", "transcriptComposer"]
  ];
  if (viewport.requireHeroAndTranscriptInViewport) {
    pairs.push(["currentQuestionCard", "transcriptCard"], ["mainTurnActions", "transcriptCard"]);
  }
  for (const [aKey, bKey] of pairs) {
    const a = result.rects[aKey];
    const b = result.rects[bKey];
    if (a && b && intersects(a, b, 2)) {
      failures.push(`${aKey} overlaps ${bKey}`);
    }
  }

  if (viewport.requireHeroAndTranscriptInViewport) {
    for (const key of ["currentQuestionCard", "mainTurnActions", "transcriptCard", "conversationLog", "transcriptComposer"]) {
      if (!result.rects[key]?.inViewport) failures.push(`${key} is not visible in the first desktop viewport`);
    }
  }

  await context.close();
  return {
    id: viewport.id,
    status: failures.length ? "fail" : "pass",
    failures,
    screenshot: path.relative(root, topScreenshot),
    ...result
  };
}

async function run() {
  await fs.mkdir(outputDir, { recursive: true });
  const launchOptions = { headless: true };
  if (browserExecutable) launchOptions.executablePath = browserExecutable;
  const browser = await chromium.launch(launchOptions);
  const results = [];
  try {
    for (const viewport of viewports) {
      results.push(await runViewport(browser, viewport));
    }
  } finally {
    await browser.close();
  }

  const summary = {
    appUrl,
    checkedAt: new Date().toISOString(),
    passed: results.filter((result) => result.status === "pass").length,
    failed: results.filter((result) => result.status === "fail").length,
    results
  };
  await fs.writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (summary.failed) {
    for (const result of results) {
      for (const failure of result.failures) {
        console.error(`FAIL ${result.id}: ${failure}`);
      }
    }
    process.exitCode = 1;
    return;
  }
  console.log(`OK Discovery layout smoke passed for ${results.length} viewports; screenshots written to ${path.relative(root, outputDir)}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
