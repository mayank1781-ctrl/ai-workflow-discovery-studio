// M10 — ISOLATED spreadsheet parse worker.
//
// The `xlsx` library carries high-severity advisories (prototype pollution, ReDoS) with no fix
// available. Rather than parse untrusted upload bytes with it in the main server process, the
// parent spawns THIS worker, hands it the buffer, and kills it on timeout. A crash, hang, or
// exploit attempt is contained here — it cannot take down or compromise the server, and the
// parent rejects the upload (it is never "parsed" into the main process).
//
// Hardened parse options disable the risky features: no formula evaluation, no embedded HTML,
// no VBA. The worker only ever posts back plain CSV text (or a failure), never live objects.

import { parentPort, workerData } from "node:worker_threads";
import * as XLSX from "xlsx";

function run() {
  try {
    const src = workerData && workerData.buffer;
    if (!src) return parentPort.postMessage({ ok: false, error: "no buffer" });
    const buffer = Buffer.isBuffer(src) ? src : Buffer.from(src);
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: false,   // do not parse/evaluate formulas
      cellHTML: false,      // do not emit HTML (XSS / injection surface)
      bookVBA: false,       // ignore embedded macros
      dense: true,
    });
    const sheets = [];
    for (const name of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv && csv.trim()) sheets.push(`--- Sheet: ${name} ---\n${csv}`);
    }
    parentPort.postMessage({ ok: true, text: sheets.join("\n\n") });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
  }
}

run();
