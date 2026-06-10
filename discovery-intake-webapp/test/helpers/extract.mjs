// Shared source-extraction helpers for executed tests against app.js.
//
// app.js is a browser classic script (it touches `document`/`window` at load),
// so it can't be imported in Node. The functions under test are pure or
// global-parameterized, though — so we extract their source by brace-matching
// (the same convention scoring.test.mjs established) and evaluate the real
// shipped code with stubbed globals. If an extracted function ever gains an
// unbalanced brace inside a string/regex, extraction fails loudly here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function readAppSource() {
  return readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
}

// Extract a top-level `function <name>(...) { ... }` block by brace-matching.
// The parameter list is skipped first (paren-matched) so default parameters
// like `(payload = {})` can't terminate the body match early.
export function extractFunction(source, name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\b`, "m"));
  assert.notEqual(match, null, `function ${name} not found in app.js`);
  const start = match.index;
  const parenOpen = source.indexOf("(", start);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let i = parenOpen; i < source.length; i += 1) {
    if (source[i] === "(") parenDepth += 1;
    else if (source[i] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = source.indexOf("{", i);
        break;
      }
    }
  }
  assert.notEqual(bodyStart, -1, `body not found extracting ${name}`);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`unbalanced braces extracting ${name}`);
}

// Extract a top-level `const NAME = ...;` declaration (object/array/scalar).
export function extractConst(source, name) {
  const match = source.match(new RegExp(`^const ${name}\\b`, "m"));
  assert.notEqual(match, null, `const ${name} not found in app.js`);
  const start = match.index;
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
    else if (ch === ";" && depth === 0) return source.slice(start, i + 1);
  }
  assert.fail(`unterminated const ${name}`);
}

// Evaluate a set of extracted functions/consts together, with the given
// globals injected as parameters (so e.g. a stub `state` or recording
// `console` shadows the real one inside the evaluated code). Returns the
// named functions, bound to that sandbox.
export function buildSandbox(source, { functions = [], consts = [], globals = {} } = {}) {
  const code = [
    ...consts.map((name) => extractConst(source, name)),
    ...functions.map((name) => extractFunction(source, name))
  ].join("\n\n");
  const factory = new Function(...Object.keys(globals), `${code}\nreturn { ${functions.join(", ")} };`);
  return factory(...Object.values(globals));
}
