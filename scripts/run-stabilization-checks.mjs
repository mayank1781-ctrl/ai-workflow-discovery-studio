import { spawn } from "node:child_process";

const checks = [
  {
    label: "App syntax",
    args: ["--check", "discovery-intake-webapp/app.js"]
  },
  {
    label: "Server syntax",
    args: ["--check", "discovery-intake-webapp/server.mjs"]
  },
  {
    label: "Regression script syntax",
    args: ["--check", "discovery-intake-webapp/scripts/regression-interview-flow.mjs"]
  },
  {
    label: "DOCX output generator",
    args: ["scripts/check-docx-output.mjs"]
  },
  {
    label: "Local setup and health",
    args: ["scripts/check-local-setup.mjs", "--health"]
  },
  {
    label: "Add-on Test Lab config smoke",
    args: ["scripts/check-add-on-test-lab.mjs"]
  },
  {
    label: "Enterprise transfer kit",
    args: ["scripts/check-enterprise-transfer-kit.mjs"]
  },
  {
    label: "Work environment readiness",
    args: ["scripts/check-work-environment-readiness.mjs"]
  },
  {
    label: "Workbook import smoke",
    args: ["scripts/check-workbook-import.mjs"]
  },
  {
    label: "Evidence linkage smoke",
    args: ["scripts/check-evidence-linkage.mjs"]
  },
  {
    label: "Reviewer decision smoke",
    args: ["scripts/check-reviewer-decision.mjs"]
  },
  {
    label: "Discovery layout smoke",
    args: ["scripts/check-discovery-layout.mjs"]
  },
  {
    label: "Template alignment smoke",
    args: ["scripts/check-template-alignment.mjs"]
  },
  {
    label: "Solution build recipe smoke",
    args: ["scripts/check-solution-build-recipe.mjs"]
  },
  {
    label: "Enterprise readiness brief smoke",
    args: ["scripts/check-enterprise-readiness-brief.mjs"]
  },
  {
    label: "Browser handoff package contract smoke",
    args: ["scripts/check-handoff-package-contract.mjs"]
  },
  {
    label: "Package ZIP endpoint",
    args: ["scripts/check-package-zip.mjs"]
  },
  {
    label: "Review package builder",
    args: ["scripts/build-review-package.mjs"]
  },
  {
    label: "Review package doctor",
    args: ["scripts/check-review-package.mjs"]
  },
  {
    label: "Review package clean install",
    args: ["scripts/check-review-package-install.mjs", "--copy-local-env"]
  },
  {
    label: "Discovery interview regression",
    args: ["discovery-intake-webapp/scripts/regression-interview-flow.mjs"]
  }
];

function runCheck(check) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, check.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit"
    });

    child.on("close", (code) => {
      resolve({ label: check.label, code });
    });
  });
}

for (const check of checks) {
  console.log(`\n== ${check.label} ==`);
  const result = await runCheck(check);
  if (result.code !== 0) {
    console.error(`\nFAIL ${result.label}`);
    process.exitCode = result.code || 1;
    break;
  }
}

if (!process.exitCode) {
  console.log("\nOK Stabilization checks passed");
}
