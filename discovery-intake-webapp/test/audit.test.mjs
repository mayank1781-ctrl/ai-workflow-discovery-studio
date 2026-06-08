// Unit tests for auditHash() — the content-hashing helper used by the Phase 5e
// audit trail in server.mjs.
//
// server.mjs imports runtime deps and calls server.listen() at module load, so
// it can't be imported here. auditHash is pure (crypto + JSON), so we extract
// its source from server.mjs and eval it with crypto in scope — testing the
// real shipped helper without booting the server.
//
// Run with: npm test   (node --test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} not found in server.mjs`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces extracting ${name}`);
}

const serverSource = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
// auditHash closes over `crypto`; the eval'd function picks up this module's import.
// eslint-disable-next-line no-eval
const auditHash = eval(`(${extractFunction(serverSource, "auditHash")})`);

test("returns a 32-char hex digest", () => {
  const h = auditHash({ a: 1 });
  assert.match(h, /^[0-9a-f]{32}$/);
});

test("is deterministic for equal input", () => {
  assert.equal(auditHash({ a: 1, b: [2, 3] }), auditHash({ a: 1, b: [2, 3] }));
});

test("differs for different input", () => {
  assert.notEqual(auditHash({ a: 1 }), auditHash({ a: 2 }));
});

test("accepts strings and objects without throwing", () => {
  assert.match(auditHash("hello"), /^[0-9a-f]{32}$/);
  assert.match(auditHash({ steps: [{ id: 1 }] }), /^[0-9a-f]{32}$/);
});

test("treats nullish input as a stable hash (no throw)", () => {
  assert.match(auditHash(undefined), /^[0-9a-f]{32}$/);
  assert.equal(auditHash(undefined), auditHash(null));   // both → (x ?? "") → JSON.stringify("") === '""'
});
