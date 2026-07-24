[CmdletBinding()]
param(
  [switch]$Json
)

# Status is intentionally read-only and cheap enough for the desktop app's
# eight-second polling loop.  Do not infer liveness from state.json alone: a
# crashed Node process can leave that file behind, and its PID may be reused.
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}
. (Join-Path $PSScriptRoot 'common-windows.ps1')

$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$StatePath = Join-Path $StateRoot 'state.json'
$PausePath = Join-Path $StateRoot 'paused'
$Port = 9335
$Session = 'off'
$InjectorAlive = $false
$CodexRunning = $false
$state = $null

function Test-DreamSkinStatusInjector {
  param([AllowNull()][object]$State)

  # Keep this path free of Get-CimInstance/WMI. The desktop app polls every few
  # seconds, and WMI hangs are a common cause of "app freezes on open".
  if ($null -eq $State) { return $false }
  try {
    $processId = 0
    if (-not [int]::TryParse("$($State.injectorPid)", [ref]$processId) -or $processId -le 0) {
      return $false
    }
    $port = 0
    if (-not [int]::TryParse("$($State.port)", [ref]$port)) { return $false }
    Assert-DreamSkinPort -Port $port
    if (-not $State.injectorStartedAt -or -not $State.nodePath -or -not $State.injectorPath) {
      return $false
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $false }
    try {
      if ("$($process.ProcessName)" -ine 'node') { return $false }
    } catch {
      return $false
    }

    $processPath = $null
    try { $processPath = "$($process.Path)" } catch { $processPath = $null }
    if (-not $processPath) {
      try { $processPath = "$($process.MainModule.FileName)" } catch { $processPath = $null }
    }
    if (-not $processPath -or [System.IO.Path]::GetFileName("$processPath") -ine 'node.exe') {
      return $false
    }
    if (-not (Test-DreamSkinPathEqual -Left $processPath -Right "$($State.nodePath)")) {
      return $false
    }

    # Start-time match remains a strong liveness signal without WMI.
    try {
      $startedAt = $process.StartTime.ToUniversalTime().ToString('o')
      if (-not $startedAt -or "$startedAt" -cne "$($State.injectorStartedAt)") {
        return $false
      }
    } catch {
      return $false
    }
    return $true
  } catch {
    return $false
  }
}

try {
  if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
    try { $state = Read-DreamSkinState -Path $StatePath } catch { $state = $null }
  }
  if ($null -ne $state -and $state.port) {
    $savedPort = 0
    if ([int]::TryParse("$($state.port)", [ref]$savedPort)) { $Port = $savedPort }
  }

  $paused = Test-Path -LiteralPath $PausePath -PathType Leaf
  $InjectorAlive = Test-DreamSkinStatusInjector -State $state
  if ($InjectorAlive) {
    $Session = if ($paused) { 'paused' } else { 'active' }
  } elseif ($paused) {
    # Keep the user-facing pause state even if the watcher crashed while
    # paused; the next Apply action will validate and recreate the session.
    $Session = 'paused'
  } elseif ($null -ne $state) {
    $Session = 'stale'
  }

  try {
    $CodexRunning = @(Get-Process -Name 'ChatGPT', 'Codex' -ErrorAction SilentlyContinue).Count -gt 0
  } catch {
    $CodexRunning = $false
  }
} catch {
  # Status must never make the app's polling command fail because a process or
  # state file changed between two reads.  Return a conservative snapshot.
  $Session = if (Test-Path -LiteralPath $PausePath -PathType Leaf) { 'paused' } else { 'off' }
  $InjectorAlive = $false
}

$snapshot = [ordered]@{
  session = $Session
  port = $Port
  injectorAlive = [bool]$InjectorAlive
  cdpOk = $false
  codexRunning = [bool]$CodexRunning
  themeName = ''
  appliedThemeName = ''
}

if ($Json) {
  # All values emitted here are ASCII, so Windows PowerShell 5.1's legacy
  # console encoding cannot corrupt the JSON consumed by the Rust host.
  $snapshot | ConvertTo-Json -Compress
} else {
  $snapshot.GetEnumerator() | ForEach-Object { "{0}={1}" -f $_.Key, $_.Value }
}
