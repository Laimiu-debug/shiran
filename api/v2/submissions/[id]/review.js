import { isKvConfigured, kvGetJson, kvSetJson } from "../../../../lib/kv.js";
import { handleCors, sendJson } from "../../../../lib/repo-json.js";

const DECISIONS = new Set(["approve", "reject", "request_changes"]);

function statusFromDecision(decision) {
  if (decision === "approve") return "approved";
  if (decision === "reject") return "rejected";
  return "changes_requested";
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  if (!isKvConfigured()) {
    sendJson(res, 503, { ok: false, error: "kv_not_configured" });
    return;
  }

  const expected = String(process.env.CREATOR_REVIEW_TOKEN || "").trim();
  const provided = String(req.headers["x-review-token"] || "").trim();
  if (expected && provided !== expected) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const decision = String(body.decision || "").trim();
  if (!DECISIONS.has(decision)) {
    sendJson(res, 400, { ok: false, error: "invalid_decision" });
    return;
  }

  const id = String(req.query?.id || "").trim();
  const row = await kvGetJson(`shiran:submissions:${id}`);
  if (!row) {
    sendJson(res, 404, { ok: false, error: "not_found" });
    return;
  }

  row.status = statusFromDecision(decision);
  row.review = {
    decision,
    comment: String(body.comment || "").slice(0, 2000),
    reviewed_at: new Date().toISOString(),
  };
  await kvSetJson(`shiran:submissions:${id}`, row);
  sendJson(res, 200, { ok: true, id: row.id, status: row.status, review: row.review });
}
