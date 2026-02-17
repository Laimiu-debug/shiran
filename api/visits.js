import crypto from "node:crypto";

const PAGEVIEWS_KEY = "shiran:metrics:pageviews";
const VISITORS_SET_KEY = "shiran:metrics:visitors";

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(payload));
}

function getKvConfig() {
  const url = process.env.KV_REST_API_URL || "";
  const token = process.env.KV_REST_API_TOKEN || "";
  return {
    url: String(url).trim(),
    token: String(token).trim(),
  };
}

function isKvConfigured() {
  const cfg = getKvConfig();
  return Boolean(cfg.url && cfg.token);
}

async function kvCommand(command, args = []) {
  const { url, token } = getKvConfig();
  const safeCommand = String(command || "").trim().toLowerCase();
  const safeArgs = Array.isArray(args) ? args : [];
  const encodedArgs = safeArgs.map((value) => encodeURIComponent(String(value)));
  const suffix = encodedArgs.length > 0 ? `/${encodedArgs.join("/")}` : "";
  const endpoint = `${url.replace(/\/$/, "")}/${safeCommand}${suffix}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const detail = data?.error || `HTTP ${response.status}`;
    throw new Error(`KV command failed: ${safeCommand} (${detail})`);
  }

  return data?.result;
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return "unknown-ip";
}

function buildVisitorFingerprint(req) {
  const ip = getClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "unknown-ua");
  const acceptLanguage = String(req.headers["accept-language"] || "");
  const raw = `${ip}|${userAgent}|${acceptLanguage}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function toNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

async function readStats() {
  const [pageViewsRaw, uniqueVisitorsRaw] = await Promise.all([
    kvCommand("get", [PAGEVIEWS_KEY]),
    kvCommand("scard", [VISITORS_SET_KEY]),
  ]);

  return {
    pageViews: toNonNegativeInt(pageViewsRaw),
    uniqueVisitors: toNonNegativeInt(uniqueVisitorsRaw),
  };
}

async function incrementStats(req) {
  const visitorFingerprint = buildVisitorFingerprint(req);

  const [pageViewsRaw] = await Promise.all([
    kvCommand("incr", [PAGEVIEWS_KEY]),
    kvCommand("sadd", [VISITORS_SET_KEY, visitorFingerprint]),
  ]);

  const uniqueVisitorsRaw = await kvCommand("scard", [VISITORS_SET_KEY]);
  return {
    pageViews: toNonNegativeInt(pageViewsRaw),
    uniqueVisitors: toNonNegativeInt(uniqueVisitorsRaw),
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, {
      ok: false,
      error: "method_not_allowed",
      message: "Only GET and POST are supported.",
    });
    return;
  }

  if (!isKvConfigured()) {
    sendJson(res, 503, {
      ok: false,
      error: "kv_not_configured",
      message: "Missing KV_REST_API_URL or KV_REST_API_TOKEN.",
    });
    return;
  }

  try {
    const stats = req.method === "POST"
      ? await incrementStats(req)
      : await readStats();

    sendJson(res, 200, {
      ok: true,
      source: "vercel-kv",
      pageViews: stats.pageViews,
      uniqueVisitors: stats.uniqueVisitors,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: "counter_failed",
      message: err?.message || "Unknown counter error.",
    });
  }
}

