export const ONBOARDING_KEY = "shiran.home.onboarding.v1.dismissed";
export const DEFAULT_GENERATION_MS = 900;
export const MIN_GENERATION_MS = 120;
export const MAX_GENERATION_MS = 5000;

export const SCENE_COLORS = {
  "日常决策": "#ff8c42",
  "社会与群体": "#3aaed8",
  "市场与系统": "#f65d6d",
  "自然与物理": "#46c36f",
  "数学与计算": "#4f7cff",
  "文化与思想实验": "#c46ee8",
};

export function formatMechanisms(mechanisms) {
  if (!Array.isArray(mechanisms)) return "";
  return mechanisms.join(" / ");
}

export function formatGenerationMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  const sec = (ms / 1000).toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
  return `${sec}s`;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function normalizePath(input) {
  if (!input) return "";
  return String(input).replace(/\\/g, "/");
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDateSeed(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function weightedSceneShuffle(units, rng) {
  const buckets = new Map();
  for (const unit of units) {
    if (!buckets.has(unit.scene)) buckets.set(unit.scene, []);
    buckets.get(unit.scene).push(unit);
  }

  for (const arr of buckets.values()) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  const orderedScenes = [...buckets.keys()].sort((a, b) => {
    const ad = buckets.get(a).length;
    const bd = buckets.get(b).length;
    return bd - ad;
  });

  const merged = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const scene of orderedScenes) {
      const arr = buckets.get(scene);
      if (arr.length > 0) {
        merged.push(arr.shift());
        remaining = true;
      }
    }
  }

  return merged;
}

export function chooseActiveUnits(allUnits, rng, maxCount = 120) {
  const published = allUnits.filter((u) => u.status === "published");
  const pool = published.length > 0 ? published : allUnits.filter((u) => u.status !== "archived");
  const ordered = weightedSceneShuffle(pool, rng);
  return ordered.slice(0, Math.min(maxCount, ordered.length));
}

export function eventTracker(eventName, payload = {}) {
  const event = {
    event_name: eventName,
    ts: new Date().toISOString(),
    properties: payload,
  };
  // V1: local console sink. Replace with /api/v1/events/batch integration.
  // eslint-disable-next-line no-console
  console.log("[telemetry]", event);
  return event;
}
