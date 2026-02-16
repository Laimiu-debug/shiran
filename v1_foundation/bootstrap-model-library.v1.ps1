param(
  [string]$Root = "e:\Laimiu\SHIRAN",
  [switch]$Clean
)

$foundationDir = Join-Path $Root 'v1_foundation'
$unitsJson = Join-Path $foundationDir 'explore_units.v1.json'
$modelRoot = Join-Path $Root 'model_library'
$unitsRoot = Join-Path $modelRoot 'units'

if (-not (Test-Path -LiteralPath $unitsJson)) {
  throw "Missing dataset: $unitsJson"
}

if ($Clean -and (Test-Path -LiteralPath $unitsRoot)) {
  Remove-Item -LiteralPath $unitsRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $unitsRoot | Out-Null

$units = Get-Content -LiteralPath $unitsJson -Encoding UTF8 | ConvertFrom-Json

$created = 0
foreach ($u in $units) {
  $unitDir = Join-Path $unitsRoot $u.id
  New-Item -ItemType Directory -Force -Path $unitDir | Out-Null

  $pattern = switch ($u.level) {
    'S级' { 'stable' }
    'A级' { 'oscillator' }
    default { 'random' }
  }

  $manifest = [ordered]@{
    id = $u.id
    slug = $u.slug
    title = $u.title
    summary = $u.summary
    scene = $u.scene
    mechanisms = @($u.mechanisms)
    category_legacy = $u.category_legacy
    level = $u.level
    duration_min = [int]$u.duration_min
    status = if ($u.status -eq '待开发') { 'draft' } else { $u.status }
    entry = [ordered]@{
      content = if ([string]::IsNullOrWhiteSpace($u.file_ref)) { '' } else { "../../ExportBlock/$($u.file_ref)" }
      simulation = "./simulation.ts"
    }
    cluster_profile = [ordered]@{
      seed_pattern = $pattern
      seed_weight = 1.0
    }
    source = [ordered]@{
      seq = [int]$u.source_seq
      markdown = $u.file_ref
    }
  }

  ($manifest | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath (Join-Path $unitDir 'manifest.json') -Encoding UTF8

  $placeholderSimulation = @"
// Placeholder simulation module for $($u.id)
// Replace with real implementation when this unit is developed.
export function initSimulation() {
  return {
    status: "todo",
    unitId: "$($u.id)"
  };
}
"@
  $placeholderSimulation | Set-Content -LiteralPath (Join-Path $unitDir 'simulation.ts') -Encoding UTF8

  $created++
}

Write-Host "Model modules created: $created"
Write-Host "Output: $unitsRoot"
