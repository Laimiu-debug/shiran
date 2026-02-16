param(
  [string]$Root = "e:\Laimiu\SHIRAN",
  [string]$CsvPath = ""
)

$exportDir = Join-Path $Root 'ExportBlock'
$outDir = Join-Path $Root 'v1_foundation'

if (-not (Test-Path -LiteralPath $exportDir)) {
  throw "Export directory not found: $exportDir"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if ([string]::IsNullOrWhiteSpace($CsvPath)) {
  $candidate = Get-ChildItem -LiteralPath $exportDir -File -Filter '*.csv' |
    Where-Object { $_.Name -like '命题数据库*.csv' -and $_.Name -notlike '*_all.csv' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($null -eq $candidate) {
    throw "No source CSV found under $exportDir"
  }
  $sourceCsv = $candidate.FullName
} else {
  $sourceCsv = $CsvPath
}

$rows = Import-Csv -LiteralPath $sourceCsv -Encoding UTF8
Write-Host "Source CSV: $sourceCsv"

function Normalize-Title([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return '' }
  $t = $s.ToLowerInvariant()
  $t = [regex]::Replace($t, '[（(].*?[)）]', '')
  $t = [regex]::Replace($t, '[^\p{L}\p{Nd}]', '')
  return $t
}

$titleMap = @{}
$normMap = @{}
$mdFiles = Get-ChildItem -LiteralPath $exportDir -File -Filter '*.md' | Where-Object { $_.Name -notin @('目录.md','可行性优先级分析.md') }
foreach ($f in $mdFiles) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  if ($base -match '^(?<title>.+?)\s+(?<hash>[0-9a-f]{32})$') {
    $title = $Matches['title']
    $hash = $Matches['hash']
    $titleMap[$title] = [pscustomobject]@{ Hash = $hash; File = $f.Name }
    $normMap[(Normalize-Title $title)] = [pscustomobject]@{ Hash = $hash; File = $f.Name }
  }
}

$sceneMap = @{
  '涌现与自组织' = '自然与物理'
  '混沌与非线性' = '自然与物理'
  '博弈与策略' = '日常决策'
  '概率与统计直觉' = '数学与计算'
  '物理模拟' = '自然与物理'
  '优化与搜索' = '数学与计算'
  '网络与传播' = '社会与群体'
  '中华智慧' = '文化与思想实验'
  '群体心理' = '社会与群体'
  '认知偏差' = '日常决策'
  '经济与金融' = '市场与系统'
  '生物与生态' = '自然与物理'
  '信息论与编码' = '数学与计算'
  '数学趣题' = '数学与计算'
  '决策与风险' = '日常决策'
  '日常现象' = '日常决策'
  '艺术与数学' = '文化与思想实验'
}

$defaultMechMap = @{
  '涌现与自组织' = @('涌现','反馈')
  '混沌与非线性' = @('非线性','反馈')
  '博弈与策略' = @('博弈','策略与风险')
  '概率与统计直觉' = @('随机性','时空与尺度')
  '物理模拟' = @('平衡与稳定','时空与尺度')
  '优化与搜索' = @('优化','策略与风险')
  '网络与传播' = @('网络传播','反馈')
  '中华智慧' = @('策略与风险','平衡与稳定')
  '群体心理' = @('认知偏差','网络传播')
  '认知偏差' = @('认知偏差','策略与风险')
  '经济与金融' = @('反馈','策略与风险')
  '生物与生态' = @('涌现','平衡与稳定')
  '信息论与编码' = @('编码与信息','优化')
  '数学趣题' = @('时空与尺度','非线性')
  '决策与风险' = @('策略与风险','随机性')
  '日常现象' = @('平衡与稳定','时空与尺度')
  '艺术与数学' = @('时空与尺度','非线性')
}

$keywordRules = @(
  [pscustomobject]@{ Pattern='博弈|囚徒|纳什|拍卖|选美|围棋|兵法'; Mech='博弈' },
  [pscustomobject]@{ Pattern='随机|概率|蒙特卡洛|马尔可夫|贝叶斯|大数|中心极限|布朗|赌徒|生日'; Mech='随机性' },
  [pscustomobject]@{ Pattern='网络|传播|茧房|六度|pagerank|社交'; Mech='网络传播' },
  [pscustomobject]@{ Pattern='优化|寻路|退火|梯度|粒子群|旅行商|报童|多臂老虎机'; Mech='优化' },
  [pscustomobject]@{ Pattern='涌现|生命游戏|蚁群|自组织|沙堆|元胞|boids'; Mech='涌现' },
  [pscustomobject]@{ Pattern='混沌|双摆|洛伦兹|logistic|分形|吸引子|三体|费根鲍姆'; Mech='非线性' },
  [pscustomobject]@{ Pattern='偏差|效应|框架|锚定|沉没成本|损失厌恶|确认偏误|可得性|幸存者'; Mech='认知偏差' },
  [pscustomobject]@{ Pattern='平衡|均衡|守恒|共振|热传导|供需|免疫|生态|稳定'; Mech='平衡与稳定' },
  [pscustomobject]@{ Pattern='编码|信息|通信|熵|压缩|rsa|纠错|隐写|逻辑门|图灵'; Mech='编码与信息' },
  [pscustomobject]@{ Pattern='尺度|维度|比例|黄金|地图投影|相对论|拉格朗日|轨道|mandelbrot|julia|时空'; Mech='时空与尺度' },
  [pscustomobject]@{ Pattern='风险|决策|策略|秘书|凯利|圣彼得堡|期望|通胀|泡沫|挤兑'; Mech='策略与风险' },
  [pscustomobject]@{ Pattern='反馈|回路|反应扩散|循环'; Mech='反馈' }
)

function Add-Unique([System.Collections.Generic.List[string]]$list, [string]$item) {
  if ([string]::IsNullOrWhiteSpace($item)) { return }
  if (-not $list.Contains($item)) { [void]$list.Add($item) }
}

function Get-DurationMin([int]$d) {
  switch ($d) {
    1 { return 6 }
    2 { return 8 }
    3 { return 10 }
    4 { return 12 }
    5 { return 15 }
    6 { return 18 }
    7 { return 20 }
    default { return 10 }
  }
}

$units = New-Object System.Collections.Generic.List[object]

foreach ($r in $rows) {
  $seq = 0
  [void][int]::TryParse([string]$r.序号, [ref]$seq)
  $title = [string]$r.命题名称
  $category = [string]$r.分类
  $scene = if ($sceneMap.ContainsKey($category)) { $sceneMap[$category] } else { '日常决策' }

  $ref = $null
  if ($titleMap.ContainsKey($title)) { $ref = $titleMap[$title] }
  else {
    $norm = Normalize-Title $title
    if ($normMap.ContainsKey($norm)) { $ref = $normMap[$norm] }
  }

  if ($null -ne $ref) {
    $id = $ref.Hash
    $fileRef = $ref.File
  } else {
    $id = ('legacy-{0:d3}' -f $seq)
    $fileRef = ''
  }

  $slug = ('u-{0:d3}-{1}' -f $seq, $id.Substring(0, [Math]::Min(8, $id.Length)))

  $mechList = New-Object System.Collections.Generic.List[string]
  if ($defaultMechMap.ContainsKey($category)) {
    foreach ($m in $defaultMechMap[$category]) { Add-Unique $mechList $m }
  }

  $text = ('{0} {1} {2}' -f $title, [string]$r.核心规则, [string]$r.技术要点).ToLowerInvariant()
  foreach ($rule in $keywordRules) {
    if ($text -match $rule.Pattern) { Add-Unique $mechList $rule.Mech }
  }
  if ($mechList.Count -eq 0) { Add-Unique $mechList '反馈' }

  $days = 0
  [void][int]::TryParse([string]$r.'预估工时(天)', [ref]$days)
  if ($days -eq 0) { $days = 3 }

  $summary = [string]$r.核心规则
  if ([string]::IsNullOrWhiteSpace($summary)) { $summary = [string]$r.技术要点 }
  $summary = $summary.Trim()
  if ($summary.Length -gt 72) { $summary = $summary.Substring(0, 72) + '...' }

  $units.Add([pscustomobject]@{
    id = $id
    slug = $slug
    title = $title
    summary = $summary
    scene = $scene
    mechanisms = @($mechList | Select-Object -First 3)
    category_legacy = $category
    level = [string]$r.等级
    duration_min = (Get-DurationMin $days)
    status = [string]$r.状态
    source_seq = $seq
    simulation_type = [string]$r.模拟类型
    file_ref = $fileRef
  })
}

$unitsSorted = $units | Sort-Object source_seq

$unitsSorted | Select-Object id,slug,title,summary,scene,@{Name='mechanisms';Expression={ ($_.mechanisms -join ';') }},category_legacy,level,duration_min,status,source_seq,simulation_type,file_ref |
  Export-Csv -LiteralPath (Join-Path $outDir 'explore_units.v1.csv') -NoTypeInformation -Encoding UTF8

$unitsSorted | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $outDir 'explore_units.v1.json') -Encoding UTF8

Write-Host "Generated explore_units.v1.csv and explore_units.v1.json in $outDir"

