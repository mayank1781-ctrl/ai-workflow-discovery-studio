import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "discovery-intake-webapp");
const envPath = path.join(appDir, ".env.local");
const port = process.env.PORT || "5177";

if (!fs.existsSync(envPath) && !process.env.OPENAI_API_KEY) {
  console.warn("WARN discovery-intake-webapp/.env.local was not found and OPENAI_API_KEY is not set.");
  console.warn("WARN Copy discovery-intake-webapp/.env.example to .env.local for live AI features.");
}

console.log(`Starting AI Workflow Discovery Studio on http://localhost:${port}/`);

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: appDir,
  env: { ...process.env, PORT: port },
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code || 0;
});
