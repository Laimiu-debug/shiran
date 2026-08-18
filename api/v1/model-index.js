import { handleCors, sendJson } from "../../lib/repo-json.js";
import { loadModelIndex } from "../../lib/unit-index.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const index = loadModelIndex();
    const status = String(req.query?.status || "").trim();
    const items = Array.isArray(index.items) ? index.items : [];
    const filtered = status ? items.filter((item) => item.status === status) : items;
    sendJson(res, 200, {
      ok: true,
      version: index.version || "v1",
      generated_at: index.generated_at,
      total: filtered.length,
      items: filtered,
    });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: "model_index_failed", message: err?.message || "Unknown error" });
  }
}
