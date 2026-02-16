import { normalizePath } from "./utils.js";

const INDEX_RELATIVE_PATH = "../v1_foundation/model-index.v1.json";

export async function loadModelIndex() {
  const res = await fetch(INDEX_RELATIVE_PATH, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load model index: ${res.status}`);
  }
  const index = await res.json();
  if (!index || !Array.isArray(index.items)) {
    throw new Error("Invalid model index payload");
  }

  return {
    ...index,
    items: index.items.map((item) => ({
      ...item,
      entry: {
        content: normalizePath(item.entry?.content || item.entry_content || ""),
        simulation: normalizePath(item.entry?.simulation || item.entry_simulation || ""),
      },
      manifest_path: normalizePath(item.manifest_path || ""),
    })),
  };
}
