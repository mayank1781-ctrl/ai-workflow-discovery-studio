const appUrl = process.env.APP_URL || "http://localhost:5177";

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

async function postJson(path, body) {
  const response = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) fail(`${path} returned HTTP ${response.status}: ${payload.error || "unknown error"}`);
  return payload;
}

const payload = await postJson("/api/add-ons/test", { allowLiveChecks: false });
if (!payload.ok) fail("add-on test response was not ok");
if (payload.allowLiveChecks) fail("config-only check unexpectedly enabled live checks");
if (payload.secretsExposed !== false) fail("add-on test response did not mark secretsExposed=false");
if (!Array.isArray(payload.results) || payload.results.length < 12) fail("add-on test response did not include the provider registry");

const byId = Object.fromEntries(payload.results.map((result) => [result.id, result]));
if (!["configured", "missing-config"].includes(byId["openai-responses"]?.testStatus)) fail("OpenAI Responses config status was not reported correctly");
if (byId["mermaid-workflow-map"]?.testStatus !== "passed") fail("Mermaid local provider did not pass");
if (!["configured", "missing-config"].includes(byId["elevenlabs-voice"]?.testStatus)) fail("ElevenLabs config status was not reported correctly");
if (!["configured", "missing-config"].includes(byId["azure-document-intelligence"]?.testStatus)) fail("Azure Document Intelligence config status was not reported correctly");
if (payload.results.some((result) => result.secret || result.apiKey || result.keyValue)) fail("provider result exposed a secret-like field");

console.log(`OK Add-on Test Lab config check passed (${payload.results.length} providers)`);
