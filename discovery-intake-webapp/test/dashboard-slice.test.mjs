// C1 (Phase 2) — the shared slice control + drill-down + three-lenses-always. One slice pivots all
// three dashboards (department / function / workflow / data tier / solution shape); the render
// invariant is that capacity is NEVER shown alone — every capacity figure is paired with cost + flow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const FPA = engine.FPA_INTAKE;
const tech = { ...FPA, header: { ...FPA.header, dept: "Technology", anchor: "tech-wf" }, steps: FPA.steps.map((s) => (s.cls === "gather" || s.cls === "build" || s.cls === "assembly") ? { ...s, solutionShape: "agentic", data: "internal" } : { ...s, data: "internal" }), confirm: { ...FPA.confirm, dataTier: "internal" } };
const credit = { ...FPA, header: { ...FPA.header, dept: "Credit Risk", anchor: "credit-wf" }, steps: FPA.steps.map((s) => (s.cls === "gather" || s.cls === "build" || s.cls === "assembly") ? { ...s, solutionShape: "prompt" } : s) };
const SET = [tech, credit];

test("C1 — slicing by solution shape = agentic filters the record set", () => {
  const sliced = engine.sliceRecords(SET, { dimension: "solutionShape", value: "agentic" });
  assert.equal(sliced.length, 1);
  assert.equal(sliced[0].header.dept, "Technology");
});

test("C1 — slice pivots by department / data tier; all/empty is a no-op", () => {
  assert.equal(engine.sliceRecords(SET, { dimension: "department", value: "Credit Risk" }).length, 1);
  assert.equal(engine.sliceRecords(SET, { dimension: "dataTier", value: "internal" }).length, 1);
  assert.equal(engine.sliceRecords(SET, { dimension: "department", value: "all" }).length, 2);
  assert.equal(engine.sliceRecords(SET, null).length, 2);
  assert.ok(engine.sliceOptions(SET).department.includes("Technology"));
  assert.ok(engine.sliceOptions(SET).solutionShape.includes("agentic"));
});

test("C1 — drill-down goes department → workflows → ranked recipe units", () => {
  const dd = engine.drillDown(SET);
  assert.equal(dd.length, 2);
  assert.ok(dd.every((d) => d.workflows.length >= 1 && d.workflows[0].units.length >= 1));
});

test("C1 — threeLenses bundles capacity WITH cost AND flow (never one number)", () => {
  const tl = engine.threeLenses(SET);
  assert.ok(tl.capacity && tl.cost && tl.flow);
  assert.equal(tl.pairedLenses, true);
});

// ---- app: the slice control + the three-lens render guard ----
function sandbox(state) {
  return buildSandbox(source, {
    consts: ["DASHBOARD_SLICE_DIMENSIONS"],
    functions: [
      "studioEngine", "ensureDashboardSlice", "setDashboardSlice", "sliceDashboardRecords",
      "engineSliceRecords", "engineSliceOptions", "engineThreeLenses", "engineDrillDown",
      "threeLensGuard", "threeLensTileHtml", "dashboardSliceControlHtml", "escapeHtml",
    ],
    globals: { state: state || {}, window: { StudioEngine: engine } },
  });
}

test("C1 — the app slice control delegates to the engine and pivots state", () => {
  const state = {};
  const sb = sandbox(state);
  sb.setDashboardSlice("solutionShape", "agentic");
  assert.equal(state.dashboardSlice.dimension, "solutionShape");
  assert.equal(sb.sliceDashboardRecords(SET).length, 1, "the shared slice filters the set");
  // switching dimension resets the value to all
  sb.setDashboardSlice("all");
  assert.equal(sb.sliceDashboardRecords(SET).length, 2);
});

test("C1 — a capacity tile WITHOUT cost + flow fails the render assertion (three-lenses invariant)", () => {
  const sb = sandbox({});
  // lone capacity → guard refuses (no capacity number rendered)
  const guard = sb.threeLensGuard({ capacity: { net: 100000 } });
  assert.equal(guard.ok, false);
  assert.ok(guard.missing.includes("cost") && guard.missing.includes("flow"));
  const lone = sb.threeLensTileHtml({ capacity: { net: 100000 } });
  assert.match(lone, /three-lenses invariant/);
  assert.ok(!/100,000/.test(lone), "a lone capacity number must not render");
  // all three present → renders the bundle
  const full = sb.threeLensTileHtml(engine.threeLenses(SET));
  assert.match(full, /Capacity/);
  assert.match(full, /Cost/);
  assert.match(full, /Flow/);
});
