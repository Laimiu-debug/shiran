import { handleCors, sendJson } from "../../lib/repo-json.js";
import { filterUnits, loadModelIndex } from "../../lib/unit-index.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const index = loadModelIndex();
    const items = filterUnits(index.items || [], req.query || {});
    sendJson(res, 200, {
      ok: true,
      total: items.length,
      items,
    });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: "units_failed", message: err?.message || "Unknown error" });
  }
}
