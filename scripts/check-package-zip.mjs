import fs from "node:fs/promises";
import path from "node:path";

const appUrl = process.env.APP_URL || "http://localhost:5177";
let createdPackagePath = "";

try {
  const sample = {
    state: {
      sessionMeta: {
        id: `zip-package-smoke-${Date.now().toString(36)}`,
        name: "ZIP Package Smoke",
        createdAt: new Date().toISOString()
      },
      fields: {
        workflowName: "ZIP Package Smoke"
      },
      steps: [],
      data: [],
      systems: [],
      decisions: []
    },
    productBrief: {
      title: "Product PDR Smoke",
      markdown: "# Product PDR Smoke\n\n- Problem & users <validated>"
    },
    engineeringBrief: {
      title: "Engineering Smoke",
      markdown: "# Engineering Smoke\n\n- Systems & tools"
    },
    businessBrief: {
      title: "Business Smoke",
      markdown: "# Business Smoke\n\n- Value & KPIs"
    },
    governanceBrief: {
      title: "Governance Smoke",
      markdown: "# Governance Smoke\n\n- Boundary & review"
    },
    solutionBuildRecipe: {
      title: "Solution Build Recipe Smoke",
      markdown: "# Solution Build Recipe Smoke\n\n- ChatGPT + Microsoft Copilot build route"
    },
    solutionBuildRecipeRows: [
      ["Template", "Section", "Field", "Value"],
      ["Solution Build Recipe", "Recommended Platform Route", "Recommended route", "ChatGPT-first"]
    ],
    solutionBuildSpec: {
      version: 1,
      route: { routeType: "ChatGPT-first", label: "ChatGPT-first guided workflow route" },
      platforms: [{ id: "chatgpt" }, { id: "microsoft-copilot" }],
      connectors: [{ id: "manual-evidence-files" }]
    },
    solutionBuildSpecRows: [
      ["Area", "Item", "Value", "Owner / Platform", "Status / Mode"],
      ["Route", "Recommended route", "ChatGPT-first guided workflow route", "Solution Builder", "ChatGPT-first"]
    ],
    solutionCapabilityPlan: {
      version: 1,
      routeType: "ChatGPT-first",
      routeLabel: "ChatGPT-first guided workflow route",
      chatgptCapabilities: [{ id: "chatgpt-instructions" }],
      microsoftCopilotCapabilities: [{ id: "copilot-office-drafting" }],
      humanCheckpoints: [{ id: "output-review" }]
    },
    solutionCapabilityPlanRows: [
      ["Area", "ID", "Capability / Checkpoint / Phase"],
      ["ChatGPT", "chatgpt-instructions", "Reusable instructions"]
    ],
    solutionExecutionPlan: {
      version: 1,
      routeType: "ChatGPT-first",
      routeLabel: "ChatGPT-first guided workflow route",
      items: [{
        id: "chatgpt-instructions",
        platform: "ChatGPT / OpenAI",
        dataInputs: "Approved sample input",
        permissionsNeeded: "Approved ChatGPT Enterprise workspace",
        enterpriseControls: "Human review before reliance",
        humanCheckpoint: "Draft output reviewed",
        expectedOutput: "Instruction pack"
      }]
    },
    solutionExecutionBrief: {
      title: "Solution Execution Plan Smoke",
      markdown: "# Solution Execution Plan Smoke\n\n## Execution Summary\n\n- Builder runbook\n\n## ChatGPT Builder Actions\n\n- Build instruction pack\n\n## Microsoft Copilot Builder Actions\n\n- Confirm Office output path"
    },
    solutionExecutionPlanMarkdown: "# Solution Execution Plan Smoke\n\n## Execution Summary\n\n- Builder runbook\n\n## ChatGPT Builder Actions\n\n- Build instruction pack\n\n## Microsoft Copilot Builder Actions\n\n- Confirm Office output path",
    solutionExecutionPlanRows: [
      ["Phase", "ID", "Platform", "Owner", "Builder Action", "Data Inputs", "Permissions Needed", "Enterprise Controls", "Human Checkpoint", "Expected Output"],
      ["First MVP", "chatgpt-instructions", "ChatGPT / OpenAI", "Solution Builder", "Build instruction pack", "Approved sample input", "Approved ChatGPT Enterprise workspace", "Human review before reliance", "Draft output reviewed", "Instruction pack"]
    ],
    enterpriseConnectorContracts: {
      version: 1,
      readiness: 75,
      contracts: [{
        id: "manual-evidence-files",
        sourceLocations: "Approved sample files",
        permissionScope: "Read-only local file access",
        allowedOperations: "Upload approved files and summarize evidence",
        blockedOperations: "No raw client data or writeback",
        approvalGate: "Session owner confirms sample source set",
        pilotDataPolicy: "Synthetic or sanitized samples only",
        fallbackMode: "Conversation-only intake"
      }]
    },
    enterpriseConnectorContractRows: [
      ["ID", "Name", "Platform", "Source Locations", "Permission Scope", "Allowed Operations", "Blocked Operations", "Approval Gate", "Pilot Data Policy", "Fallback Mode"],
      ["manual-evidence-files", "Manual evidence/file source contract", "Shared MVP", "Approved sample files", "Read-only local file access", "Upload approved files", "No raw client data", "Session owner confirms sample source set", "Synthetic or sanitized samples only", "Conversation-only intake"]
    ],
    enterpriseConnectorContractsMarkdown: "# Enterprise Connector Contracts - ZIP Package Smoke\n\n## Manual evidence/file source contract\n\n- Source locations: Approved sample files\n- Permission scope: Read-only local file access\n- Blocked operations: No raw client data or writeback\n\n### Approval Gate\n\n- Approval gate: Session owner confirms sample source set\n- Fallback mode: Conversation-only intake\n\n### Test Criteria\n\n1. Only approved source content is reachable.",
    connectorApprovalChecklist: {
      version: 1,
      readiness: 80,
      readinessLabel: "Template ready",
      items: [{
        id: "manual-evidence-files",
        connectorName: "Manual evidence/file source contract",
        platform: "Shared MVP",
        owner: "Session owner",
        status: "Ready for local safe sample",
        score: 82,
        approvalGate: "Session owner confirms sample source set",
        fallbackMode: "Conversation-only intake",
        requiredEvidence: [{ label: "Source owner", status: "Ready", value: "Session owner", needed: "Approval owner" }],
        decisionOptions: ["Approve for local safe-sample review only."]
      }]
    },
    connectorApprovalChecklistRows: [
      ["ID", "Connector", "Platform", "Owner", "Status", "Score", "Required Evidence", "Decision Options"],
      ["manual-evidence-files", "Manual evidence/file source contract", "Shared MVP", "Session owner", "Ready for local safe sample", 82, "Source owner: Ready", "Approve for local safe-sample review only."]
    ],
    connectorApprovalChecklistMarkdown: "# Connector Approval Checklist - ZIP Package Smoke\n\n## Manual evidence/file source contract\n\n### Required Evidence\n\n1. Source owner: Ready - Session owner\n\n### Decision Options\n\n1. Approve for local safe-sample review only.\n\n- Fallback mode: Conversation-only intake",
    connectorValidationPlan: {
      version: 1,
      readiness: 82,
      readinessLabel: "Template ready",
      totalCount: 2,
      readyCount: 2,
      needsApprovalCount: 0,
      blockedCount: 0,
      tests: [
        {
          id: "manual-evidence-files-source-reachability",
          connectorId: "manual-evidence-files",
          connectorName: "Manual evidence/file source contract",
          platform: "Shared MVP",
          testArea: "Source reachability",
          test: "Run one safe sample upload.",
          expectedEvidence: "Approved sample files and source owner confirmation.",
          owner: "Session owner",
          status: "Ready to test",
          passCriteria: "Only approved source content is reachable.",
          fallbackIfFailed: "Conversation-only intake.",
          source: "Enterprise Connector Contracts; Connector Approval Checklist"
        },
        {
          id: "manual-evidence-files-blocked-operations",
          connectorId: "manual-evidence-files",
          connectorName: "Manual evidence/file source contract",
          platform: "Shared MVP",
          testArea: "Blocked operations",
          test: "Confirm raw client data and writeback are blocked.",
          expectedEvidence: "Negative test result.",
          owner: "Session owner",
          status: "Ready to test",
          passCriteria: "No prohibited operation is available.",
          fallbackIfFailed: "Disable file evidence path.",
          source: "Enterprise Connector Contracts; Connector Approval Checklist"
        }
      ]
    },
    connectorValidationPlanRows: [
      ["Connector ID", "Connector", "Platform", "Test Area", "Test", "Expected Evidence", "Owner", "Status", "Pass Criteria", "Fallback If Failed", "Source"],
      ["manual-evidence-files", "Manual evidence/file source contract", "Shared MVP", "Source reachability", "Run one safe sample upload.", "Approved sample files and source owner confirmation.", "Session owner", "Ready to test", "Only approved source content is reachable.", "Conversation-only intake.", "Enterprise Connector Contracts; Connector Approval Checklist"]
    ],
    connectorValidationPlanMarkdown: "# Connector Validation Plan - ZIP Package Smoke\n\n## Test Summary\n\n- Total tests: 2\n\n## Manual evidence/file source contract\n\n### Source reachability\n\n- Expected evidence: Approved sample files and source owner confirmation.\n- Pass criteria: Only approved source content is reachable.\n- Fallback if failed: Conversation-only intake.\n\n### Blocked operations\n\n- Expected evidence: Negative test result.",
    connectorValidationEvidenceLog: {
      version: 1,
      readiness: 88,
      readinessLabel: "Template ready",
      totalCount: 1,
      readyCount: 1,
      entries: [{
        id: "manual-evidence-files-source-reachability-evidence",
        testId: "manual-evidence-files-source-reachability",
        connectorId: "manual-evidence-files",
        connectorName: "Manual evidence/file source contract",
        platform: "Shared MVP",
        testArea: "Source reachability",
        validationStatus: "Ready to test",
        evidenceStatus: "Ready to capture",
        evidenceOwner: "Session owner",
        proofToCapture: "Screenshot or reviewer note showing only approved sample files are reachable.",
        expectedEvidence: "Approved sample files and source owner confirmation.",
        captureMethod: "Capture source-owner note plus screenshot or access test output.",
        reviewerPrompt: "Does the evidence prove source reachability?",
        resultOptions: ["Pass - evidence captured", "Defer to fallback mode"],
        decisionImpact: "Determines whether the connector can access the approved source boundary at all.",
        fallbackIfMissing: "Conversation-only intake.",
        packageTarget: "connector-validation/manual-evidence-files-source-reachability",
        source: "Connector Validation Plan"
      }]
    },
    connectorValidationEvidenceLogRows: [
      ["Evidence ID", "Test ID", "Connector ID", "Connector", "Platform", "Test Area", "Validation Status", "Evidence Status", "Evidence Owner", "Proof To Capture", "Expected Evidence", "Capture Method", "Reviewer Prompt", "Result Options", "Decision Impact", "Fallback If Missing", "Package Target", "Source"],
      ["manual-evidence-files-source-reachability-evidence", "manual-evidence-files-source-reachability", "manual-evidence-files", "Manual evidence/file source contract", "Shared MVP", "Source reachability", "Ready to test", "Ready to capture", "Session owner", "Screenshot or reviewer note showing only approved sample files are reachable.", "Approved sample files and source owner confirmation.", "Capture source-owner note plus screenshot or access test output.", "Does the evidence prove source reachability?", "Pass - evidence captured\nDefer to fallback mode", "Determines whether the connector can access the approved source boundary at all.", "Conversation-only intake.", "connector-validation/manual-evidence-files-source-reachability", "Connector Validation Plan"]
    ],
    connectorValidationEvidenceLogMarkdown: "# Connector Validation Evidence Log - ZIP Package Smoke\n\n## Evidence Summary\n\n- Evidence items: 1\n\n## Manual evidence/file source contract\n\n### Source reachability\n\n- Proof to capture: Screenshot or reviewer note showing only approved sample files are reachable.\n- Result options: Pass - evidence captured\n- Decision impact: Determines whether the connector can access the approved source boundary at all.\n- Fallback if missing: Conversation-only intake.",
    connectorBuildRequestPack: {
      version: 1,
      readiness: 88,
      readinessLabel: "Template ready",
      totalCount: 1,
      readyCount: 1,
      requests: [{
        id: "manual-evidence-files-build-request",
        connectorId: "manual-evidence-files",
        connectorName: "Manual evidence/file source contract",
        platform: "Shared MVP",
        requestType: "Manual evidence source promotion request",
        requestStatus: "Ready for owner review",
        requestedDecision: "Approve local safe-sample source validation and keep fallback mode available.",
        approvalOwner: "Session owner",
        sourceSystem: "Approved sample files",
        sourceLocations: "Approved sample files",
        authModel: "User-provided files",
        permissionScope: "Read-only local file access",
        readWriteMode: "Read-only",
        minimumBuildScope: "Use approved safe-sample files or manual exports with no live system access.",
        outOfScope: "No raw client data or writeback",
        allowedOperations: "Upload approved files",
        dataBoundary: "Synthetic or sanitized samples only",
        pilotDataPolicy: "Synthetic or sanitized samples only",
        requiredApprovals: "Session owner",
        approvalGate: "Session owner confirms sample source set",
        validationSummary: "Ready to test: 1",
        evidenceSummary: "Ready to capture: 1",
        humanCheckpoints: ["Session owner approves the connector boundary."],
        enterpriseControls: ["Least-privilege source boundary."],
        evidencePackage: "enterprise-connector-contracts.json; connector-approval-checklist.json; connector-validation-plan.json; connector-validation-evidence-log.json",
        fallbackMode: "Conversation-only intake",
        reviewerQuestions: ["Who is the accountable approver?"],
        nextAction: "Review this request with the session owner before promoting beyond local package review."
      }]
    },
    connectorBuildRequestRows: [
      ["Request ID", "Connector ID", "Connector", "Platform", "Request Type", "Request Status", "Requested Decision", "Approval Owner", "Source System", "Source Locations", "Auth Model", "Permission Scope", "Read/Write Mode", "Minimum Build Scope", "Out Of Scope", "Allowed Operations", "Data Boundary", "Pilot Data Policy", "Required Approvals", "Approval Gate", "Validation Summary", "Evidence Summary", "Human Checkpoints", "Enterprise Controls", "Evidence Package", "Fallback Mode", "Reviewer Questions", "Next Action"],
      ["manual-evidence-files-build-request", "manual-evidence-files", "Manual evidence/file source contract", "Shared MVP", "Manual evidence source promotion request", "Ready for owner review", "Approve local safe-sample source validation and keep fallback mode available.", "Session owner", "Approved sample files", "Approved sample files", "User-provided files", "Read-only local file access", "Read-only", "Use approved safe-sample files or manual exports with no live system access.", "No raw client data or writeback", "Upload approved files", "Synthetic or sanitized samples only", "Synthetic or sanitized samples only", "Session owner", "Session owner confirms sample source set", "Ready to test: 1", "Ready to capture: 1", "Session owner approves the connector boundary.", "Least-privilege source boundary.", "enterprise-connector-contracts.json; connector-approval-checklist.json; connector-validation-plan.json; connector-validation-evidence-log.json", "Conversation-only intake", "Who is the accountable approver?", "Review this request with the session owner before promoting beyond local package review."]
    ],
    connectorBuildRequestMarkdown: "# Connector Build Request Pack - ZIP Package Smoke\n\n## Request Summary\n\n- Requests: 1\n\n## Manual evidence/file source contract\n\n- Requested decision: Approve local safe-sample source validation and keep fallback mode available.\n- Minimum build scope: Use approved safe-sample files or manual exports with no live system access.\n- Evidence package: enterprise-connector-contracts.json; connector-approval-checklist.json; connector-validation-plan.json; connector-validation-evidence-log.json\n\n### Human Checkpoints\n\n1. Session owner approves the connector boundary.\n\n### Enterprise Controls\n\n1. Least-privilege source boundary.",
    connectorPilotRunbook: {
      version: 1,
      readiness: 88,
      readinessLabel: "Template ready",
      totalCount: 1,
      readyCount: 1,
      steps: [{
        id: "manual-evidence-files-pilot-preflight",
        connectorId: "manual-evidence-files",
        connectorName: "Manual evidence/file source contract",
        platform: "Shared MVP",
        sequence: 1,
        phase: "Pilot preflight",
        action: "Confirm request status, owner, and source boundary.",
        owner: "Session owner",
        status: "Ready",
        entryCriteria: "Connector build request exists.",
        evidenceToCapture: "Request status, owner, source boundary, and blocked operations.",
        passCriteria: "Pilot scope is safe-sample only.",
        stopTrigger: "Source owner or permission scope is unclear.",
        fallbackAction: "Conversation-only intake",
        decisionGate: "Proceed only when the named owner confirms the sample and access boundary.",
        packageEvidence: "connector-build-request-pack.json",
        source: "Connector Build Request Pack; Connector Validation Plan; Connector Validation Evidence Log"
      }]
    },
    connectorPilotRunbookRows: [
      ["Step ID", "Connector ID", "Connector", "Platform", "Sequence", "Phase", "Action", "Owner", "Status", "Entry Criteria", "Evidence To Capture", "Pass Criteria", "Stop Trigger", "Fallback Action", "Decision Gate", "Package Evidence", "Source"],
      ["manual-evidence-files-pilot-preflight", "manual-evidence-files", "Manual evidence/file source contract", "Shared MVP", 1, "Pilot preflight", "Confirm request status, owner, and source boundary.", "Session owner", "Ready", "Connector build request exists.", "Request status, owner, source boundary, and blocked operations.", "Pilot scope is safe-sample only.", "Source owner or permission scope is unclear.", "Conversation-only intake", "Proceed only when the named owner confirms the sample and access boundary.", "connector-build-request-pack.json", "Connector Build Request Pack; Connector Validation Plan; Connector Validation Evidence Log"]
    ],
    connectorPilotRunbookMarkdown: "# Connector Pilot Runbook - ZIP Package Smoke\n\n## Pilot Summary\n\n- Pilot steps: 1\n\n## Manual evidence/file source contract\n\n### 1. Pilot preflight\n\n- Action: Confirm request status, owner, and source boundary.\n- Status: Ready\n- Stop trigger: Source owner or permission scope is unclear.\n- Fallback action: Conversation-only intake\n- Decision gate: Proceed only when the named owner confirms the sample and access boundary.\n- Package evidence: connector-build-request-pack.json\n\n### 8. Promotion decision\n\n- Decision gate: Approve, defer, or block.",
    connectorPromotionDecisionPacket: {
      version: 1,
      readiness: 88,
      readinessLabel: "Template ready",
      totalCount: 1,
      readyCount: 1,
      decisions: [{
        id: "manual-evidence-files-promotion-decision",
        connectorId: "manual-evidence-files",
        connectorName: "Manual evidence/file source contract",
        platform: "Shared MVP",
        recommendedDecision: "Promote to next controlled safe-sample pilot",
        decisionStatus: "Ready for owner decision",
        owner: "Session owner",
        requestedDecision: "Approve local safe-sample source validation and keep fallback mode available.",
        pilotReadiness: "1/1 ready; 0 deferred; 0 stop/block",
        evidenceStatus: "1/1 validation evidence entries ready to capture.",
        promotionScope: "Use approved safe-sample files or manual exports with no live system access.",
        conditions: ["Named owner records approve, defer, or block decision."],
        openGaps: ["No critical promotion gaps generated; confirm with the named owner before broader use."],
        fallbackPosture: "Conversation-only intake. Keep this fallback active until the promotion decision is accepted.",
        enterpriseHandoff: "Hand off connector build request, pilot runbook, validation evidence, fallback drill, and owner decision to enterprise reviewers.",
        stopCriteria: "No raw client data or writeback.",
        nextAction: "Review the promotion recommendation with the named owner before broader use.",
        packageEvidence: "connector-build-request-pack.json; connector-validation-evidence-log.json; connector-pilot-runbook.json",
        source: "Connector Pilot Runbook; Connector Build Request Pack; Connector Validation Evidence Log"
      }]
    },
    connectorPromotionDecisionRows: [
      ["Decision ID", "Connector ID", "Connector", "Platform", "Recommended Decision", "Decision Status", "Owner", "Requested Decision", "Pilot Readiness", "Evidence Status", "Promotion Scope", "Conditions", "Open Gaps", "Fallback Posture", "Enterprise Handoff", "Stop Criteria", "Next Action", "Package Evidence", "Source"],
      ["manual-evidence-files-promotion-decision", "manual-evidence-files", "Manual evidence/file source contract", "Shared MVP", "Promote to next controlled safe-sample pilot", "Ready for owner decision", "Session owner", "Approve local safe-sample source validation and keep fallback mode available.", "1/1 ready; 0 deferred; 0 stop/block", "1/1 validation evidence entries ready to capture.", "Use approved safe-sample files or manual exports with no live system access.", "Named owner records approve, defer, or block decision.", "No critical promotion gaps generated; confirm with the named owner before broader use.", "Conversation-only intake. Keep this fallback active until the promotion decision is accepted.", "Hand off connector build request, pilot runbook, validation evidence, fallback drill, and owner decision to enterprise reviewers.", "No raw client data or writeback.", "Review the promotion recommendation with the named owner before broader use.", "connector-build-request-pack.json; connector-validation-evidence-log.json; connector-pilot-runbook.json", "Connector Pilot Runbook; Connector Build Request Pack; Connector Validation Evidence Log"]
    ],
    connectorPromotionDecisionMarkdown: "# Connector Promotion Decision Packet - ZIP Package Smoke\n\n## Decision Summary\n\n- Decisions: 1\n\n## Manual evidence/file source contract\n\n- Recommended decision: Promote to next controlled safe-sample pilot\n- Decision status: Ready for owner decision\n- Promotion scope: Use approved safe-sample files or manual exports with no live system access.\n\n### Conditions\n\n1. Named owner records approve, defer, or block decision.\n\n### Open gaps\n\n1. No critical promotion gaps generated; confirm with the named owner before broader use.\n\n- Fallback posture: Conversation-only intake.\n- Enterprise handoff: Hand off connector build request, pilot runbook, validation evidence, fallback drill, and owner decision to enterprise reviewers.\n- Stop criteria: No raw client data or writeback.\n- Package evidence: connector-build-request-pack.json; connector-validation-evidence-log.json; connector-pilot-runbook.json",
    enterpriseReadinessBrief: {
      version: 1,
      decision: "Local/coworker pilot only.",
      readinessScore: 55,
      gates: [{ id: "enterprise-storage", gate: "Approved storage" }],
      approvals: [{ approval: "Governance/Security review" }],
      nextActions: ["Review enterprise gates."]
    },
    enterpriseReadinessBriefMarkdown: "# Enterprise Readiness Brief Smoke\n\n- Review enterprise gates.",
    enterpriseReadinessBriefRows: [
      ["Area", "ID", "Gate / Item"],
      ["Summary", "decision", "Decision"]
    ],
    combinedHandoff: {
      title: "Combined Smoke",
      markdown: "# Combined Smoke\n\n- Product + Engineering"
    },
    questionRouting: [
      ["Route", "Priority", "Suggested Owner", "Question", "Why It Matters", "Status"],
      ["Product", 1, "Product owner", "What scope should the MVP include?", "Defines pilot scope.", "Open"],
      ["Engineering", 1, "Solution architect", "Which approved sources are allowed?", "Sets data and permission boundary.", "Open"],
      ["Business", 1, "Business sponsor", "What value threshold matters?", "Sets value proof.", "Open"],
      ["Governance Inputs", 1, "Governance reviewer", "Which controls are required?", "Sets review path.", "Open"],
      ["Finance/Ops", 1, "Finance partner", "What baseline volume should be used?", "Sets value estimate.", "Open"],
      ["Domain Sponsor", 1, "Domain sponsor", "Who signs off on pilot use?", "Sets adoption ownership.", "Open"]
    ],
    questionRoutingMarkdown: "# Open Question Routing - ZIP Package Smoke\n\n## Product\n\n1. What scope should the MVP include?\n\n## Engineering\n\n1. Which approved sources are allowed?\n\n## Business\n\n1. What value threshold matters?\n\n## Governance Inputs\n\n1. Which controls are required?\n\n## Finance/Ops\n\n1. What baseline volume should be used?\n\n## Domain Sponsor\n\n1. Who signs off on pilot use?",
    outputManifest: [],
    connectorRegistry: []
  };

  const createResponse = await fetch(`${appUrl}/api/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sample)
  });
  if (!createResponse.ok) throw new Error(`Package create failed: ${await createResponse.text()}`);

  const payload = await createResponse.json();
  createdPackagePath = payload.packagePath || "";
  const requiredFiles = [
    "product-pdr-template.docx",
    "engineering-brief-template.docx",
    "business-value-template.docx",
    "governance-inputs-template.docx",
    "solution-build-recipe.docx",
    "solution-build-recipe.json",
    "solution-build-recipe.md",
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
    "template-alignment-contract-rows.json",
    "question-routing.json",
    "question-routing.md",
    "question-routing.docx",
    "evidence-linkage.json",
    "evidence-linkage-rows.json",
    "reviewer-decision-summary.json",
    "reviewer-decision-summary-rows.json",
    "package-manifest.json"
  ];
  const missingFiles = requiredFiles.filter((file) => !payload.files?.includes(file));
  if (missingFiles.length) throw new Error(`Package response missing files: ${missingFiles.join(", ")}`);

  const zipResponse = await fetch(`${appUrl}${payload.zipUrl || `/api/packages/${encodeURIComponent(payload.packageName)}/download`}`);
  if (!zipResponse.ok) throw new Error(`Package ZIP download failed: ${await zipResponse.text()}`);

  const zipBytes = new Uint8Array(await zipResponse.arrayBuffer());
  const zipText = new TextDecoder().decode(zipBytes);
  const missingZipEntries = requiredFiles.filter((file) => !zipText.includes(`${payload.packageName}/${file}`));

  if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b || zipBytes[2] !== 0x03 || zipBytes[3] !== 0x04) {
    throw new Error("Downloaded package is not a ZIP file");
  }
  if (missingZipEntries.length) {
    throw new Error(`ZIP missing entries: ${missingZipEntries.join(", ")}`);
  }

  console.log(`OK package ZIP produced ${zipBytes.length} bytes with ${requiredFiles.length} required entries`);
} finally {
  if (createdPackagePath && createdPackagePath.includes(`${path.sep}data${path.sep}packages${path.sep}`)) {
    await fs.rm(createdPackagePath, { recursive: true, force: true });
  }
}
