import { handleCors, sendJson } from "../../../lib/repo-json.js";
import { loadModelIndex } from "../../../lib/unit-index.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

function utc8Date(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const index = loadModelIndex();
    const date = String(req.query?.date || utc8Date());
    const published = (index.items || []).filter((item) => item.status === "published");
    sendJson(res, 200, {
      ok: true,
      seed_date: date,
      seed_value: `shiran|${date}|${published.length}`,
      grid_size: { width: 160, height: 90 },
      initial_density: 0.042,
      s_ratio: 0.12,
      a_ratio: 0.4,
      b_ratio: 0.48,
      eligible_units: published.length,
    });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: "seed_failed", message: err?.message || "Unknown error" });
  }
}
