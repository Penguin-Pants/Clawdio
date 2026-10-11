# Milestone 0 idle memory on Windows (P3.5, D28): the sum of the private working set over the
# app process tree, WebView2 processes included. Each Library mode runs $Runs times; the value
# per mode is the median. The gate value is the worst mode.
# Usage: pwsh scripts/measure-memory.ps1 -Binary <app.exe> [-Output memory-windows.json]
param(
  [Parameter(Mandatory = $true)][string]$Binary,
  [string]$Output = "memory-windows.json",
  [int]$Runs = 3,
  [int]$StartupSeconds = 15,
  [int]$IdleSeconds = 60
)
$ErrorActionPreference = "Stop"
$modes = @("tree", "columns", "topBottom")

# The app process and all its descendants (WebView2 runs as child processes).
function Get-TreeIds([int]$Root) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
  $ids = [System.Collections.Generic.List[int]]::new()
  $ids.Add($Root)
  for ($i = 0; $i -lt $ids.Count; $i++) {
    foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $ids[$i] }) { $ids.Add([int]$child.ProcessId) }
  }
  return $ids
}

# Private working set in kB per process id, from the Process performance counters.
function Get-PrivateWorkingSet([int[]]$Ids) {
  $counters = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
    Select-Object IDProcess, Name, WorkingSetPrivate
  $result = @()
  foreach ($id in $Ids) {
    $row = $counters | Where-Object { $_.IDProcess -eq $id } | Select-Object -First 1
    if ($row) { $result += [pscustomobject]@{ pid = $id; name = $row.Name; privateWorkingSetKb = [int64]($row.WorkingSetPrivate / 1KB) } }
  }
  return $result
}

$runRecords = @()
$medians = [ordered]@{}
$worst = 0
foreach ($mode in $modes) {
  $totals = @()
  for ($run = 1; $run -le $Runs; $run++) {
    $env:CLAWDIO_MEASURE_MODE = $mode
    $app = Start-Process -FilePath $Binary -PassThru
    Start-Sleep -Seconds ($StartupSeconds + $IdleSeconds)
    # A run where the app exited early would sum to zero. Fail instead of recording it.
    if ($app.HasExited) { throw "$mode run ${run}: the app exited before the sample" }
    $processes = Get-PrivateWorkingSet (Get-TreeIds $app.Id)
    $total = ($processes | Measure-Object -Property privateWorkingSetKb -Sum).Sum
    foreach ($id in (Get-TreeIds $app.Id)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    $totals += $total
    $runRecords += [pscustomobject]@{ mode = $mode; run = $run; totalKb = $total; processes = $processes }
    Write-Host "$mode run ${run}: $([math]::Round($total / 1024)) MB"
  }
  $sorted = $totals | Sort-Object
  $median = $sorted[[math]::Floor(($sorted.Count - 1) / 2)]
  $medians[$mode] = $median
  if ($median -gt $worst) { $worst = $median }
}

$os = Get-CimInstance Win32_OperatingSystem
$webview = (Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue).pv
[ordered]@{
  os = "windows"
  metric = "sum of the private working set over the app process tree (D28)"
  environment = [ordered]@{
    system = "$($os.Caption) $($os.Version)"
    memTotalKb = [int64]$os.TotalVisibleMemorySize
    cpus = [Environment]::ProcessorCount
    webview2 = "$webview"
  }
  settings = [ordered]@{ runs = $Runs; startupSeconds = $StartupSeconds; idleSeconds = $IdleSeconds }
  medianKbPerMode = $medians
  gateKb = $worst
  runs = $runRecords
} | ConvertTo-Json -Depth 6 | Set-Content -Path $Output -Encoding utf8
Write-Host "gate value: $([math]::Round($worst / 1024)) MB (worst mode median)"
