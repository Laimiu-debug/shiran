import { handleCors, sendJson } from "../../../lib/repo-json.js";
import { isKvConfigured, kvCommand } from "../../../lib/kv.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const events = Array.isArray(body.events) ? body.events : Array.isArray(body) ? body : [];
  if (events.length === 0) {
    sendJson(res, 400, { ok: false, error: "empty_batch" });
    return;
  }

  const accepted = events.slice(0, 50).map((event) => ({
    event_name: String(event?.event_name || ""),
    ts: event?.ts || new Date().toISOString(),
    properties: event?.properties && typeof event.properties === "object" ? event.properties : {},
  }));

  if (isKvConfigured()) {
    try {
      await kvCommand("lpush", ["shiran:events", JSON.stringify({
        received_at: new Date().toISOString(),
        count: accepted.length,
        sample: accepted[0],
      })]);
      await kvCommand("ltrim", ["shiran:events", "0", "199"]);
    } catch (_err) {
      // Telemetry must not fail the client experience.
    }
  }

  sendJson(res, 202, { ok: true, accepted: accepted.length });
}
