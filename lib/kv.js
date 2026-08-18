const PAGEVIEWS_KEY = "shiran:metrics:pageviews";

export function getKvConfig() {
  const url = process.env.KV_REST_API_URL || "";
  const token = process.env.KV_REST_API_TOKEN || "";
  return {
    url: String(url).trim(),
    token: String(token).trim(),
  };
}

export function isKvConfigured() {
  const cfg = getKvConfig();
  return Boolean(cfg.url && cfg.token);
}

export async function kvCommand(command, args = []) {
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

export async function kvGetJson(key) {
  const raw = await kvCommand("get", [key]);
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_err) {
    return null;
  }
}

export async function kvSetJson(key, value) {
  await kvCommand("set", [key, JSON.stringify(value)]);
}

export { PAGEVIEWS_KEY };
