// b4 — the app's realtime voice. Deterministic, source-level tests (NO model call, NO
// live audio, NO network). Guards the rails the voice work must hold: the realtime voice
// is ONE swappable named constant (REALTIME_VOICE), env-overridable, defaulting to a
// valid — and softer / female-sounding — realtime voice; and it is the SINGLE source —
// the realtime session handler reads the constant, never a hardcoded voice literal. The
// FINAL voice is a by-ear product choice, so these guard the mechanism (one knob, valid,
// single source), not a specific timbre — swapping the default to any valid (female-
// leaning) voice stays green. Real shipped server source read/evaluated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readServerSource, extractFunction } from "./helpers/extract.mjs";

const serverSource = readServerSource();

// The voices the OpenAI Realtime (gpt-realtime) API accepts.
const VALID_REALTIME_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];
// The softer / female-sounding subset (the b4 intent). The default must be one of these.
const FEMALE_LEANING_VOICES = ["coral", "shimmer", "sage", "marin"];

function realtimeVoiceDefault() {
  const m = serverSource.match(/const REALTIME_VOICE = process\.env\.REALTIME_VOICE \|\| "([a-z]+)"/);
  return m ? m[1] : null;
}

test("the realtime voice is ONE env-overridable named constant defaulting to a VALID realtime voice", () => {
  const def = realtimeVoiceDefault();
  assert.ok(def, "REALTIME_VOICE is a single env-overridable constant with a string fallback");
  assert.ok(VALID_REALTIME_VOICES.includes(def), `the default "${def}" is a valid realtime voice`);
});

test("the b4 default is a softer / female-sounding option (swappable to any female-leaning voice by ear)", () => {
  const def = realtimeVoiceDefault();
  assert.ok(FEMALE_LEANING_VOICES.includes(def), `the default "${def}" is a softer / female-sounding voice`);
});

test("SINGLE source: handleRealtimeSession reads REALTIME_VOICE and carries NO hardcoded voice literal", () => {
  const handler = extractFunction(serverSource, "handleRealtimeSession");
  assert.ok(/voice:\s*REALTIME_VOICE/.test(handler), "the session voice comes from the REALTIME_VOICE constant");
  assert.ok(!/voice:\s*["'][a-z]+["']/i.test(handler), "no hardcoded voice literal in the realtime session config");
});

test("REALTIME_VOICE is defined exactly once — not hardcoded in multiple places", () => {
  const defs = (serverSource.match(/const REALTIME_VOICE\s*=/g) || []).length;
  assert.equal(defs, 1, "exactly one REALTIME_VOICE definition");
});
