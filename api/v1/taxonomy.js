import { handleCors, sendJson } from "../../lib/repo-json.js";
import { loadTaxonomy } from "../../lib/unit-index.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const taxonomy = loadTaxonomy();
    sendJson(res, 200, { ok: true, ...taxonomy });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: "taxonomy_failed", message: err?.message || "Unknown error" });
  }
}
