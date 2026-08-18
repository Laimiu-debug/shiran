import crypto from "node:crypto";
import { isKvConfigured, kvGetJson, kvSetJson } from "../../lib/kv.js";
import { handleCors, sendJson } from "../../lib/repo-json.js";

const INDEX_KEY = "shiran:submissions:index";

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_err) {
      return {};
    }
  }
  return {};
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    return ["manifest must be an object"];
  }
  const required = ["id", "slug", "title", "summary", "scene", "mechanisms", "category_legacy", "level"];
  for (const key of required) {
    if (manifest[key] == null || manifest[key] === "") {
      errors.push(`missing ${key}`);
    }
  }
  if (manifest.mechanisms && !Array.isArray(manifest.mechanisms)) {
    errors.push("mechanisms must be an array");
  } else if (Array.isArray(manifest.mechanisms) && (manifest.mechanisms.length < 1 || manifest.mechanisms.length > 3)) {
    errors.push("mechanisms must have 1..3 items");
  }
  return errors;
}

async function readIndex() {
  const index = await kvGetJson(INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (!isKvConfigured()) {
    sendJson(res, 503, {
      ok: false,
      error: "kv_not_configured",
      message: "Creator submissions require KV_REST_API_URL and KV_REST_API_TOKEN.",
    });
    return;
  }

  if (req.method === "GET") {
    const ids = await readIndex();
    const items = [];
    for (const id of ids.slice(0, 50)) {
      const row = await kvGetJson(`shiran:submissions:${id}`);
      if (row) {
        items.push({
          id: row.id,
          status: row.status,
          created_at: row.created_at,
          title: row.manifest?.title || "",
        });
      }
    }
    sendJson(res, 200, { ok: true, total: items.length, items });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const body = readBody(req);
  const manifest = body.manifest && typeof body.manifest === "object"
    ? body.manifest
    : (typeof body.manifest === "string" ? JSON.parse(body.manifest) : null);
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    sendJson(res, 400, { ok: false, error: "invalid_payload", validation_report: errors });
    return;
  }

  const id = crypto.randomUUID();
  const submission = {
    id,
    status: "submitted",
    created_at: new Date().toISOString(),
    notes: String(body.notes || "").slice(0, 2000),
    manifest,
    simulation: String(body.simulation || "").slice(0, 120000),
    content: String(body.content || "").slice(0, 80000),
    validation_report: [],
  };

  await kvSetJson(`shiran:submissions:${id}`, submission);
  const index = await readIndex();
  index.unshift(id);
  await kvSetJson(INDEX_KEY, index.slice(0, 500));

  sendJson(res, 201, {
    ok: true,
    id: submission.id,
    status: submission.status,
    created_at: submission.created_at,
    manifest: submission.manifest,
  });
}
