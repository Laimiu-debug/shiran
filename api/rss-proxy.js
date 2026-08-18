import { handleCors, sendJson } from "../lib/repo-json.js";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const MAX_BYTES = 800_000;

function isPrivateHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".local")) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const rawUrl = String(req.query?.url || "").trim();
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_err) {
    sendJson(res, 400, { ok: false, error: "invalid_url" });
    return;
  }

  if (!/^https?:$/i.test(parsed.protocol) || isPrivateHostname(parsed.hostname)) {
    sendJson(res, 400, { ok: false, error: "url_not_allowed" });
    return;
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
        "User-Agent": "ShiranRssProxy/1.0",
      },
    });
    if (!upstream.ok) {
      sendJson(res, 502, { ok: false, error: "upstream_failed", status: upstream.status });
      return;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      sendJson(res, 413, { ok: false, error: "payload_too_large" });
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(buffer.toString("utf8"));
  } catch (err) {
    sendJson(res, 502, { ok: false, error: "proxy_failed", message: err?.message || "Unknown error" });
  }
}
