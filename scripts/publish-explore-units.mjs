import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unitsRoot = path.join(root, "model_library", "units");
const indexOnly = process.argv.includes("--index-only");

const simulationSource = `import { createUnitModule } from "../../runtime/create-unit-module.js";

export function createModule(ctx) {
  return createUnitModule(ctx);
}

export function initSimulation() {
  return { status: "ready" };
}
`;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`, "utf8");
}

const dirs = fs.readdirSync(unitsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
const items = [];
const errors = [];

for (const dir of dirs) {
  const unitDir = path.join(unitsRoot, dir.name);
  const manifestPath = path.join(unitDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    errors.push(`missing manifest: ${dir.name}`);
    continue;
  }
  const manifest = readJson(manifestPath);
  if (!indexOnly) {
    manifest.status = "published";
    if (!manifest.entry || typeof manifest.entry !== "object") manifest.entry = { content: "" };
    manifest.entry.simulation = "./simulation.js";
    writeJson(manifestPath, manifest);
    fs.writeFileSync(path.join(unitDir, "simulation.js"), simulationSource, "utf8");
    fs.writeFileSync(
      path.join(unitDir, "simulation.ts"),
      "// Runtime uses simulation.js. This file remains for the V1 package contract.\nexport { createModule } from \"./simulation.js\";\n",
      "utf8",
    );
  }
  items.push({
    id: String(manifest.id),
    slug: String(manifest.slug),
    title: String(manifest.title),
    summary: String(manifest.summary),
    scene: String(manifest.scene),
    mechanisms: Array.isArray(manifest.mechanisms) ? manifest.mechanisms : [],
    category_legacy: String(manifest.category_legacy),
    level: String(manifest.level),
    duration_min: Number(manifest.duration_min) || 8,
    status: String(manifest.status),
    entry_content: String(manifest.entry?.content || ""),
    entry_simulation: String(manifest.entry?.simulation || "./simulation.js"),
    seed_pattern: String(manifest.cluster_profile?.seed_pattern || "random"),
    source_seq: Number(manifest.source?.seq) || 0,
    manifest_path: path.relative(root, manifestPath).replaceAll("\\", "/"),
  });
}

items.sort((a, b) => (a.source_seq - b.source_seq) || a.id.localeCompare(b.id));

const index = {
  version: "v1",
  generated_at: new Date().toISOString(),
  total: items.length,
  items,
};

writeJson(path.join(root, "v1_foundation", "model-index.v1.json"), index);

const csvHeader = "id,slug,title,scene,level,status,source_seq";
const csvRows = items.map((item) => [item.id, item.slug, `"${item.title.replaceAll("\"", "\"\"")}"`, item.scene, item.level, item.status, item.source_seq].join(","));
fs.writeFileSync(path.join(root, "v1_foundation", "model-index.v1.csv"), `${csvHeader}\n${csvRows.join("\n")}\n`, "utf8");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}

console.log(`Indexed ${items.length} units (${indexOnly ? "index only" : "published + simulations"}).`);
