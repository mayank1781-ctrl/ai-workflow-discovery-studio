import { readFile } from "node:fs/promises";

const sampleMarkdown = [
  "# DOCX Output Check",
  "",
  "## Product",
  "- Problem & users <validated>",
  "- Output package ready",
  "",
  "Plain **markdown** text should be readable."
].join("\n");

const appSource = await readFile(new URL("../discovery-intake-webapp/app.js", import.meta.url), "utf8");
const generatorStart = appSource.indexOf("function createDocxBlob");
const generatorEnd = appSource.indexOf("function outputFormatCard");

if (generatorStart < 0 || generatorEnd < 0 || generatorEnd <= generatorStart) {
  throw new Error("Could not find the browser DOCX generator block in app.js");
}

const generatorSource = appSource.slice(generatorStart, generatorEnd);
const { createDocxBlob } = new Function(`${generatorSource}; return { createDocxBlob };`)();
const blob = createDocxBlob("DOCX Output Check", sampleMarkdown);
const browserBytes = new Uint8Array(await blob.arrayBuffer());

const serverSource = await readFile(new URL("../discovery-intake-webapp/server.mjs", import.meta.url), "utf8");
const serverGeneratorStart = serverSource.indexOf("function createDocxBuffer");
const serverGeneratorEnd = serverSource.indexOf("function safeIdentifier");

if (serverGeneratorStart < 0 || serverGeneratorEnd < 0 || serverGeneratorEnd <= serverGeneratorStart) {
  throw new Error("Could not find the server DOCX generator block in server.mjs");
}

const serverGeneratorSource = serverSource.slice(serverGeneratorStart, serverGeneratorEnd);
const { createDocxBuffer } = new Function(`${serverGeneratorSource}; return { createDocxBuffer };`)();
const serverBytes = new Uint8Array(createDocxBuffer("DOCX Output Check", sampleMarkdown));
const failures = [];

if (blob.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
  failures.push(`Browser generator returned unexpected MIME type: ${blob.type}`);
}
checkDocxBytes("Browser DOCX generator", browserBytes, failures);
checkDocxBytes("Server package DOCX generator", serverBytes, failures);

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}

console.log(`OK DOCX generators produced browser=${browserBytes.length} bytes, server=${serverBytes.length} bytes with Word document parts`);

function checkDocxBytes(label, bytes, failures) {
  const text = new TextDecoder().decode(bytes);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    failures.push(`${label} does not start with a ZIP local-file header`);
  }
  if (!text.includes("[Content_Types].xml")) {
    failures.push(`${label} is missing [Content_Types].xml`);
  }
  if (!text.includes("word/document.xml")) {
    failures.push(`${label} is missing word/document.xml`);
  }
  if (!text.includes("Problem &amp; users &lt;validated&gt;")) {
    failures.push(`${label} did not escape markdown text safely`);
  }
}
