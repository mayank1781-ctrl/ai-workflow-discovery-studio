import { chromium } from "playwright";

const appUrl = process.env.APP_URL || "http://localhost:5177";
const browser = await chromium.launch();

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#workbookImportInput", { state: "attached", timeout: 10000 });

  await page.evaluate(async () => {
    const workbook = XLSX.utils.book_new();
    const addSheet = (name, rows) => {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
    };

    addSheet("Session Metadata", [
      ["Field", "Value"],
      ["Session_ID", "import-smoke"],
      ["Session_Name", "Imported Workflow Smoke"],
      ["Owner", "Import Tester"],
      ["Data_Classification", "Synthetic / sample"],
      ["Status", "Ready for review"],
      ["Workflow_Name", "Imported Workflow Smoke"],
      ["Workflow_Category", "Client delivery execution"]
    ]);
    addSheet("Submitted Idea", [
      ["Field", "Answer"],
      ["Submitted_Idea", "Import a prior workflow workbook and continue discovery."],
      ["Workflow_Category", "Client delivery execution"],
      ["Practice", "Banking"],
      ["Unit_Of_Analysis", "End-to-End Workflow"],
      ["Build_Readiness", "Medium"],
      ["Commercial_Context", "Paid project"]
    ]);
    addSheet("Session Summary", [
      ["Field", "Answer"],
      ["Workflow name", "Imported Workflow Smoke"],
      ["Domain", "Banking operations"],
      ["Workflow start point", "Request received"],
      ["Workflow end point", "Reviewed output package"],
      ["Business outcome", "Reusable workflow handoff can be restored from Excel."]
    ]);
    addSheet("Process Steps", [
      ["Step #", "Step Name", "Actor", "Tool/System", "Access / Source Mode", "Action", "Input", "In-Process Data Handling", "Output", "Handoff", "Trigger / Dependency", "Time", "Decision", "Pain", "Risk", "Exceptions / Variations", "Data Sensitivity", "AI Pattern", "Likely Tool Fit", "Evidence Confidence", "Interview Notes", "Open Questions"],
      [1, "Receive request", "Analyst", "Outlook", "User-provided email", "Read intake request", "Request email", "Classify request", "Intake summary", "Manager review", "Email trigger", "15 min", "Confirm scope", "Manual triage", "", "", "Internal", "Classify", "ChatGPT Enterprise", "High", "Imported row", ""],
      [2, "Create handoff package", "Manager", "Excel, Word", "Local workbook", "Prepare package", "Validated workbook", "Review fields", "PDR and brief packet", "Product review", "Step 1 complete", "30 min", "Approve package", "", "Incomplete workbook could mislead", "", "Internal", "Generate", "ChatGPT Enterprise", "Medium", "Imported row", "Who signs off?"]
    ]);
    addSheet("Data Handling", [
      ["Data Category", "Source", "Format", "Sensitivity", "Usage Mode", "Processing Actions", "Tool/System", "Storage", "Access", "Can Avoid Raw Client Data?", "Split Notes"],
      ["Request metadata", "Outlook", "Email", "Internal", "Input", "Extract key fields", "Outlook", "Local server files", "User provided", "Yes", ""]
    ]);
    addSheet("Systems Tools", [
      ["Tool/System", "Purpose", "Access Method", "Owner", "Integration Notes", "Client Data Present?"],
      ["Excel", "Workbook export/import", "Local browser file", "AI Infusion", "No connector required for smoke test", "No"]
    ]);
    addSheet("Human Decisions", [
      ["Decision", "Owner", "Criteria", "Risk If Wrong", "Human Approval Required?", "Escalation Path"],
      ["Approve imported package", "Manager", "Core fields restored", "Bad package goes to Product", "Yes", "AI Infusion owner"]
    ]);
    addSheet("Evidence Artifacts", [
      ["Artifact ID", "File", "Type", "Source Kind", "Status", "Confidence", "Summary", "Suggestions", "Link Count", "Linked Targets", "Follow-up Questions", "Warnings", "Uploaded At", "Applied At", "Dismissed At"],
      ["ev-import-smoke", "example-tracker.xlsx", "Spreadsheet / tracker", "spreadsheet", "reviewed", "medium", "Example evidence reference imported.", 1, 1, "Field: Workflow name", "Confirm source owner", "", "2026-05-27T00:00:00.000Z", "", ""]
    ]);
    addSheet("Evidence Linkage", [
      ["Artifact ID", "File", "Artifact Status", "Link Type", "Target Type", "Target ID", "Target Label", "Route", "Source Type", "Treatment", "Confidence", "Value / Evidence", "Rationale", "Link Status", "Question"],
      ["ev-import-smoke", "example-tracker.xlsx", "reviewed", "Suggested field", "Field", "workflowName", "Workflow name", "Product", "Evidence suggestion", "Review before applying", "medium", "Imported Workflow Smoke", "Workbook smoke evidence link.", "Needs review", ""],
      ["ev-import-smoke", "example-tracker.xlsx", "reviewed", "Follow-up question", "Open Question", "question-1", "Confirm source owner", "Domain Sponsor", "Evidence follow-up", "Ask in Discovery", "medium", "", "Workbook smoke evidence link.", "Needs review", "Confirm source owner"]
    ]);

    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const file = new File([bytes], "import-smoke.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const input = document.querySelector("#workbookImportInput");
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("discovery-intake-state") || "{}");
    return state.fields?.workflowName === "Imported Workflow Smoke" && state.steps?.length === 2;
  }, null, { timeout: 10000 });

  const imported = await page.evaluate(() => JSON.parse(localStorage.getItem("discovery-intake-state") || "{}"));
  const failures = [];
  if (imported.sessionMeta?.source !== "Workbook import") failures.push("Session source was not marked as Workbook import");
  if (imported.fields?.practice !== "Banking") failures.push("Practice field did not import");
  if (imported.fields?.commercialContext !== "Paid project") failures.push("Commercial context did not import");
  if (imported.systems?.[0]?.name !== "Excel") failures.push("Systems sheet did not import");
  if (imported.data?.[0]?.category !== "Request metadata") failures.push("Data Handling sheet did not import");
  if (imported.decisions?.[0]?.decision !== "Approve imported package") failures.push("Human Decisions sheet did not import");
  if (imported.evidenceArtifacts?.[0]?.fileName !== "example-tracker.xlsx") failures.push("Evidence artifact metadata did not import");
  if (imported.evidenceArtifacts?.[0]?.evidenceLinks?.length !== 2) failures.push("Evidence linkage rows did not import");
  if (imported.evidenceArtifacts?.[0]?.evidenceLinks?.[0]?.targetId !== "workflowName") failures.push("Evidence field link did not import");
  if (imported.appMode !== "analysis" || imported.activeWorkbenchTab !== "library") failures.push("Import did not land in Analysis library view");

  if (failures.length) {
    failures.forEach((failure) => console.error(`FAIL ${failure}`));
    process.exit(1);
  }

  console.log(`OK workbook import restored ${imported.steps.length} steps, ${imported.systems.length} systems, ${imported.data.length} data rows, ${imported.evidenceArtifacts.length} evidence reference, and ${imported.evidenceArtifacts[0].evidenceLinks.length} evidence links`);
  await context.close();
} finally {
  await browser.close();
}
