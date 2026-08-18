import { handleCors, sendJson } from "../../../lib/repo-json.js";
import { findUnit, loadModelIndex } from "../../../lib/unit-index.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const index = loadModelIndex();
    const id = req.query?.id || req.query?.id_or_slug;
    const unit = findUnit(index.items || [], id);
    if (!unit) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    sendJson(res, 200, { ok: true, item: unit });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: "unit_failed", message: err?.message || "Unknown error" });
  }
}
