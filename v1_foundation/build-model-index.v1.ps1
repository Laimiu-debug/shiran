param(
  [string]$Root = "e:\Laimiu\SHIRAN"
)

$modelRoot = Join-Path $Root 'model_library'
$unitsRoot = Join-Path $modelRoot 'units'
$outDir = Join-Path $Root 'v1_foundation'
$outJson = Join-Path $outDir 'model-index.v1.json'
$outCsv = Join-Path $outDir 'model-index.v1.csv'

if (-not (Test-Path -LiteralPath $unitsRoot)) {
  throw "Units directory not found: $unitsRoot"
}

$manifestFiles = Get-ChildItem -LiteralPath $unitsRoot -Recurse -File -Filter 'manifest.json'
if ($manifestFiles.Count -eq 0) {
  throw "No manifest files found under: $unitsRoot"
}

$required = @('id','slug','title','summary','scene','mechanisms','category_legacy','level','duration_min','status','entry')
$items = New-Object System.Collections.Generic.List[object]
$errors = New-Object System.Collections.Generic.List[string]

foreach ($f in $manifestFiles) {
  try {
    $m = Get-Content -LiteralPath $f.FullName -Encoding UTF8 -Raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    $errors.Add("Invalid JSON: $($f.FullName)")
    continue
  }

  foreach ($k in $required) {
    if (-not ($m.PSObject.Properties.Name -contains $k)) {
      $errors.Add("Missing '$k' in $($f.FullName)")
    }
  }

  if (($m.mechanisms | Measure-Object).Count -lt 1 -or ($m.mechanisms | Measure-Object).Count -gt 3) {
    $errors.Add("mechanisms must be 1..3 in $($f.FullName)")
  }

  if ($m.entry -and -not ($m.entry.PSObject.Properties.Name -contains 'content')) {
    $errors.Add("entry.content is required in $($f.FullName)")
  }

  $items.Add([pscustomobject]@{
    id = [string]$m.id
    slug = [string]$m.slug
    title = [string]$m.title
    summary = [string]$m.summary
    scene = [string]$m.scene
    mechanisms = @($m.mechanisms)
    category_legacy = [string]$m.category_legacy
    level = [string]$m.level
    duration_min = [int]$m.duration_min
    status = [string]$m.status
    entry_content = [string]$m.entry.content
    entry_simulation = [string]$m.entry.simulation
    seed_pattern = [string]$m.cluster_profile.seed_pattern
    source_seq = [int]$m.source.seq
    manifest_path = $f.FullName.Substring($Root.Length + 1)
  })
}

$idDup = $items | Group-Object id | Where-Object { $_.Count -gt 1 }
foreach ($d in $idDup) { $errors.Add("Duplicate id: $($d.Name)") }
$slugDup = $items | Group-Object slug | Where-Object { $_.Count -gt 1 }
foreach ($d in $slugDup) { $errors.Add("Duplicate slug: $($d.Name)") }

if ($errors.Count -gt 0) {
  Write-Host "Validation errors:"
  $errors | ForEach-Object { Write-Host " - $_" }
  throw "Model library validation failed"
}

$sorted = $items | Sort-Object source_seq, id

$index = [ordered]@{
  version = 'v1'
  generated_at = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK')
  total = $sorted.Count
  items = $sorted
}

$index | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outJson -Encoding UTF8
$sorted | Select-Object id,slug,title,summary,scene,@{Name='mechanisms';Expression={ ($_.mechanisms -join ';') }},category_legacy,level,duration_min,status,entry_content,entry_simulation,seed_pattern,source_seq,manifest_path |
  Export-Csv -LiteralPath $outCsv -NoTypeInformation -Encoding UTF8

$sceneStats = $sorted | Group-Object scene | Sort-Object Name
$levelStats = $sorted | Group-Object level | Sort-Object Name
$statusStats = $sorted | Group-Object status | Sort-Object Name

Write-Host "Model index built: $outJson"
Write-Host "Total models: $($sorted.Count)"
Write-Host "Scenes: " (($sceneStats | ForEach-Object { "{0}:{1}" -f $_.Name,$_.Count }) -join ', ')
Write-Host "Levels: " (($levelStats | ForEach-Object { "{0}:{1}" -f $_.Name,$_.Count }) -join ', ')
Write-Host "Status: " (($statusStats | ForEach-Object { "{0}:{1}" -f $_.Name,$_.Count }) -join ', ')
