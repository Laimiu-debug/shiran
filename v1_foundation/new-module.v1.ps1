param(
  [Parameter(Mandatory = $true)]
  [string]$UnitId,
  [Parameter(Mandatory = $true)]
  [string]$Title,
  [Parameter(Mandatory = $true)]
  [string]$Scene,
  [string[]]$Mechanisms = @('反馈'),
  [ValidateSet('S级','A级','B级')]
  [string]$Level = 'B级'
)

$root = "e:\Laimiu\SHIRAN"
$unitDir = Join-Path $root ("model_library\units\{0}" -f $UnitId)

if (Test-Path -LiteralPath $unitDir) {
  throw "Unit already exists: $unitDir"
}

New-Item -ItemType Directory -Force -Path $unitDir | Out-Null

$slug = ("u-{0}" -f $UnitId.Substring(0, [Math]::Min(8, $UnitId.Length))).ToLower()

$manifest = [ordered]@{
  id = $UnitId
  slug = $slug
  title = $Title
  summary = "模块占位符：待补充"
  scene = $Scene
  mechanisms = @($Mechanisms | Select-Object -First 3)
  category_legacy = "待映射"
  level = $Level
  duration_min = 10
  status = "draft"
  entry = [ordered]@{
    content = "./content.mdx"
    simulation = "./simulation.ts"
  }
  cluster_profile = [ordered]@{
    seed_pattern = if ($Level -eq 'S级') { 'stable' } elseif ($Level -eq 'A级') { 'oscillator' } else { 'random' }
    seed_weight = 1.0
  }
  source = [ordered]@{
    seq = 0
    markdown = ""
  }
}

($manifest | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath (Join-Path $unitDir 'manifest.json') -Encoding UTF8

@"
---
title: "$Title"
summary: "模块占位符：待补充"
---

# $Title

这里是模块内容占位符。
"@ | Set-Content -LiteralPath (Join-Path $unitDir 'content.mdx') -Encoding UTF8

@"
// Simulation placeholder for $Title
import type { CreateModule } from "../../../v1_foundation/module-runtime-api.v1";

export const createModule: CreateModule = (ctx) => {
  return {
    mount() {
      ctx.emit("module_enter", { unit_id: ctx.unit.id });
    },
    tick() {
      // TODO: implement module simulation
    },
  };
};
"@ | Set-Content -LiteralPath (Join-Path $unitDir 'simulation.ts') -Encoding UTF8

Write-Host "New module scaffold created: $unitDir"
Write-Host "Next step: run .\\build-model-index.v1.ps1 -Root 'e:\\Laimiu\\SHIRAN'"
