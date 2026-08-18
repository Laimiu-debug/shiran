import fs from "node:fs";
import path from "node:path";

export function readRepoJson(relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

export function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-review-token");
  res.send(JSON.stringify(payload));
}

export function handleCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-review-token");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
