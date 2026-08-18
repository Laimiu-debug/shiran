import { readRepoJson } from "./repo-json.js";

export function loadModelIndex() {
  return readRepoJson("v1_foundation/model-index.v1.json");
}

export function loadTaxonomy() {
  return readRepoJson("v1_foundation/taxonomy.v1.json");
}

export function filterUnits(items, query) {
  const scene = String(query.scene || "").trim();
  const mechanism = String(query.mechanism || "").trim();
  const category = String(query.category_legacy || query.category || "").trim();
  const status = String(query.status || "").trim();
  const q = String(query.q || "").trim().toLowerCase();

  return items.filter((item) => {
    if (scene && item.scene !== scene) return false;
    if (category && item.category_legacy !== category) return false;
    if (status && item.status !== status) return false;
    if (mechanism) {
      const list = Array.isArray(item.mechanisms) ? item.mechanisms : [];
      if (!list.includes(mechanism)) return false;
    }
    if (q) {
      const blob = `${item.title || ""} ${item.summary || ""} ${item.slug || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

export function findUnit(items, idOrSlug) {
  const key = String(idOrSlug || "").trim();
  if (!key) return null;
  return items.find((item) => item.id === key || item.slug === key) || null;
}
