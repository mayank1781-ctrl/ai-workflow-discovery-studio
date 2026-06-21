// B2 (Phase 2) — Workbench: adversarial confirm + the protected-by-design artifact. The confirm gate
// raises four skeptical flags (implies-decision / inferred-value / control-owner-missing / mixes-maker-
// checker) before hardening; the protected-by-design artifact lists confirmed decision steps + high-
// criticality seams, human-held. Both reuse Phase-1 primitives; the app delegates (no fork).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const RECON = engine.RECON_INTAKE;
// a decision-language step MIS-tagged assembly (the B2 canonical case)
const MISLABEL = { ...RECON, header: { ...RECON.header, anchor: "Mislabel SOP" },
  steps: [{ step: "Approve the waiver and send it", cls: "assembly", data: "internal", time: 10, theo: 80, participants: [{ actorId: "maker", part: "doer" }] }, ...RECON.steps.slice(1)] };

test("B2 — a decision-language step tagged assembly is FLAGGED at confirm (implies-decision)", () => {
  const af = engine.adversarialConfirmFlags(MISLABEL);
  assert.ok(af.kinds.impliesDecision >= 1);
  assert.ok(af.flags.some((f) => f.kind === "implies-decision" && /Approve the waiver/.test(f.step || "")));
});

test("B2 — the confirm gate surfaces all four adversarial flag kinds", () => {
  // inferred value
  assert.ok(engine.adversarialConfirmFlags({ steps: [{ step: "x", cls: "assembly", data: "internal", theo: 80 }] }).kinds.inferredValue >= 1);
  // control owner missing (authority step with no named approver)
  assert.ok(engine.adversarialConfirmFlags({ steps: [{ step: "x", cls: "assembly", data: "internal", time: 5, control: { type: "authority", authorityRef: "ladder" } }] }).kinds.controlOwnerMissing >= 1);
  // mixes maker & checker (AI is both doer and approver)
  const same = { actors: [{ id: "ai", role: "Bot", line: "system", kind: "system" }], steps: [{ step: "self-approve", cls: "decision", data: "internal", time: 5, participants: [{ actorId: "ai", part: "doer" }, { actorId: "ai", part: "approver" }], control: { type: "four-eyes", distinct: ["doer", "approver"] } }] };
  assert.ok(engine.adversarialConfirmFlags(same).kinds.mixesMakerChecker >= 1);
});

test("B2 — the protected-by-design list contains the decision step (and the mislabeled one)", () => {
  const pbd = engine.buildProtectedByDesign(RECON);
  assert.ok(pbd.items.some((i) => i.kind === "decision-step" && i.humanHeld === true));
  assert.ok(pbd.items.some((i) => i.kind === "high-criticality-seam"));
  // the mislabeled assembly-tagged decision is still protected (semantic class check)
  const mis = engine.buildProtectedByDesign(MISLABEL);
  assert.ok(mis.items.some((i) => /Approve the waiver/.test(i.item) && i.humanHeld));
  assert.match(pbd.note, /Protected by design|never decomposed/);
});

test("B2 — a clean record raises no false flags, but still protects its decisions", () => {
  const af = engine.adversarialConfirmFlags(RECON); // RECON is confirmed & control-clean
  assert.equal(af.kinds.impliesDecision, 0, "no false implies-decision on a clean capture");
  assert.equal(af.kinds.mixesMakerChecker, 0, "RECON four-eyes is correctly distinct");
  assert.ok(engine.buildProtectedByDesign(RECON).count > 0, "decisions are still protected");
});

// ---- app: the adapters + render delegate to the engine ----
function sandbox() {
  return buildSandbox(source, {
    functions: ["studioEngine", "engineAdversarialFlags", "engineProtectedByDesign", "adversarialFlagsHtml", "protectedByDesignHtml", "escapeHtml"],
    globals: { window: { StudioEngine: engine }, HUMAN_HOLD_HUE: "#FF4FD8", appWorkflowToIntake: () => MISLABEL },
  });
}

test("B2 — the app adapters delegate to the engine", () => {
  const sb = sandbox();
  assert.ok(sb.engineAdversarialFlags({ record: MISLABEL }).kinds.impliesDecision >= 1);
  assert.ok(sb.engineProtectedByDesign(MISLABEL).items.some((i) => /Approve the waiver/.test(i.item)));
});

test("B2 — the render surfaces the flags + the protected-by-design list (Human Pink)", () => {
  const sb = sandbox();
  const flagsHtml = sb.adversarialFlagsHtml({ record: MISLABEL });
  assert.match(flagsHtml, /imply a decision/);
  const pbdHtml = sb.protectedByDesignHtml(MISLABEL);
  assert.match(pbdHtml, /Protected by design/);
  assert.match(pbdHtml, /Approve the waiver/);
  assert.ok(/#FF4FD8/i.test(pbdHtml), "protected-by-design uses the human-hold pink");
});
