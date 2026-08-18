import { isKvConfigured, kvGetJson } from "../../../lib/kv.js";
import { handleCors, sendJson } from "../../../lib/repo-json.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  if (!isKvConfigured()) {
    sendJson(res, 503, { ok: false, error: "kv_not_configured" });
    return;
  }

  const id = String(req.query?.id || "").trim();
  const row = await kvGetJson(`shiran:submissions:${id}`);
  if (!row) {
    sendJson(res, 404, { ok: false, error: "not_found" });
    return;
  }
  sendJson(res, 200, { ok: true, ...row });
}
