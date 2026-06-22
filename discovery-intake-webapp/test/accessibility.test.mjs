// C2 (Phase 3) — ACCESSIBILITY. Status is encoded by MORE than color (icon + text alongside the
// tone), controls and figures are labeled, primary controls are keyboard-reachable real <button>s with
// a visible focus ring, exports are tagged/labeled, and reduced-motion is respected. The engine carries
// the status semantics (the single source); the surfaces render them with aria + non-color cues; the
// CSS provides the focus + reduced-motion floor. Additive: the mounts are guarded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readCss = (name) => readFileSync(path.join(__dirname, "..", name), "utf8");

// ---- the engine: status encoded by more than color ----

test("C2 — every status cue carries a text label + an icon (status is legible without color)", () => {
  assert.equal(engine.statusCuesNonColor(), true);
  for (const kind of Object.keys(engine.STATUS_CUES)) {
    for (const value of Object.keys(engine.STATUS_CUES[kind])) {
      const c = engine.accessibleStatus(kind, value);
      assert.ok(c.label && c.label.replace(/[^A-Za-z]/g, "").length >= 2, `${kind}/${value} has readable text`);
      assert.ok(c.icon && c.icon.length > 0, `${kind}/${value} has an icon`);
      assert.ok(engine.STATUS_TONES.includes(c.tone), `${kind}/${value} has a known tone`);
    }
  }
});

test("C2 — accessibleStatus resolves the real status sets and is additive (unknown -> null)", () => {
  assert.equal(engine.accessibleStatus("readiness", "gated-policy").label, "Gated — policy");
  assert.equal(engine.accessibleStatus("gap", "red").label, "Action needed");
  assert.equal(engine.accessibleStatus("confidence", "directional").tone, "neutral");
  assert.equal(engine.accessibleStatus("provenance", "inferred").label, "Inferred");
  assert.equal(engine.accessibleStatus("nope", "x"), null);
  assert.equal(engine.accessibleStatus("readiness", "nope"), null);
});

// ---- the app: non-color status chips, labeled controls, tagged exports ----

function sandbox(state, engineImpl) {
  return buildSandbox(source, {
    consts: ["A11Y_TONE", "DASHBOARD_AUDIENCES"],
    functions: ["studioEngine", "escapeHtml", "engineAccessibleStatus", "statusCueHtml", "exportTagLabel", "exportIsIllustrative", "ensureDashboardAudience", "dashboardAudienceControlHtml", "dashProvDot"],
    globals: { window: { StudioEngine: engineImpl === undefined ? engine : engineImpl }, state: state || {} },
  });
}

test("C2 — a status chip is distinguishable without color (icon + words + role + aria-label)", () => {
  const sb = sandbox();
  const html = sb.statusCueHtml("gap", "red");
  assert.match(html, /role="status"/);
  assert.match(html, /aria-label="Action needed"/);
  assert.ok(html.includes("⚠"), "carries a non-color icon glyph");
  // strip every color declaration — the status text must still be there (not conveyed by color alone)
  const noColor = html.replace(/color:[^;"]*;?/g, "");
  assert.ok(noColor.includes("Action needed"), "the status reads without any color");
  // unknown status renders nothing (additive)
  assert.equal(sb.statusCueHtml("nope", "x"), "");
});

test("C2 — the audience control is a labeled group of keyboard-reachable buttons with pressed state", () => {
  const sb = sandbox();
  const html = sb.dashboardAudienceControlHtml();
  assert.match(html, /role="group"/);
  assert.match(html, /aria-label="Dashboard audience"/);
  assert.match(html, /aria-pressed="(true|false)"/);
  assert.match(html, /aria-label="View the Leadership dashboard"/);
  // real <button> elements are keyboard-reachable by default
  assert.ok((html.match(/<button /g) || []).length === 3);
});

test("C2 — the provenance dot is labeled for assistive tech (not color-alone)", () => {
  const sb = sandbox();
  assert.match(sb.dashProvDot("inferred"), /role="img"[^>]*aria-label="Inferred"/);
  assert.match(sb.dashProvDot("stated"), /aria-label="Stated"/);
});

test("C2 — exports are tagged: the download control carries a structured, labeled description", () => {
  const sb = sandbox({});
  const tag = sb.exportTagLabel("the board-ready capacity pack", "leadership", true);
  assert.match(tag, /Download the board-ready capacity pack/);
  assert.match(tag, /leadership export/);
  assert.match(tag, /illustrative/);
  assert.match(tag, /structured Markdown/);
  // the illustrative flag follows the real-confirmed-seed flag
  assert.equal(sb.exportIsIllustrative(), true);
  assert.equal(sandbox({ realConfirmedSeed: true }).exportIsIllustrative(), false);
});

// ---- the CSS floor: visible keyboard focus + reduced-motion ----

test("C2 — the Studio CSS provides a visible focus ring (:focus-visible) and respects reduced-motion", () => {
  const css = readCss("signal-glass.css");
  assert.match(css, /:focus-visible/, "a visible focus ring is defined");
  assert.match(css, /outline:/, "the focus ring uses an outline");
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, "reduced-motion is respected");
  assert.match(css, /button:focus-visible/, "buttons get a visible focus ring");
});
