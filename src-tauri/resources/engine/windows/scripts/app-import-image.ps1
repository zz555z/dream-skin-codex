[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [string]$Name = '我的主题',
  [string]$Appearance = 'auto',
  [string]$SafeArea = 'auto',
  [string]$TaskMode = 'auto',
  [string]$HomeLayout = 'auto',
  [string]$FocusX = '',
  [string]$FocusY = '',
  [string]$SurfaceStyle = 'balanced',
  [string]$CardSize = 'balanced',
  [string]$HeroTitle = '我们今天来构建什么？',
  [string]$HeroSubtitle = '和你的灵感一起，把想法写成代码。',
  [string]$ProjectLabel = '◉ 选择项目',
  [string]$StatusText = 'DREAM SKIN ONLINE',
  [string]$Accent = '',
  [switch]$NoApply,
  [switch]$SaveLibrary
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$full = [System.IO.Path]::GetFullPath($ImagePath)
if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Image not found: $full" }

function Normalize-DreamSkinText {
  param([string]$Value, [string]$Fallback, [int]$MaxLength)
  $normalized = if ($null -eq $Value) { '' } else { $Value.Trim() }
  if (-not $normalized) { return $Fallback }
  if ($normalized -match '[\x00-\x1F\x7F\u2028\u2029]') { throw 'Theme text contains control characters.' }
  if ($normalized.Length -gt $MaxLength) { return $normalized.Substring(0, $MaxLength) }
  return $normalized
}

function Normalize-DreamSkinUnit {
  param([string]$Value, [string]$Name)
  if (-not $Value) { return $null }
  $number = 0.0
  $style = [System.Globalization.NumberStyles]::Float
  $culture = [System.Globalization.CultureInfo]::InvariantCulture
  if (-not ([double]::TryParse($Value, $style, $culture, [ref]$number)) -or $number -lt 0 -or $number -gt 1) {
    throw "$Name must be a number from 0 to 1."
  }
  return $number
}

$HeroTitle = Normalize-DreamSkinText $HeroTitle '我们今天来构建什么？' 60
$HeroSubtitle = Normalize-DreamSkinText $HeroSubtitle '和你的灵感一起，把想法写成代码。' 120
$ProjectLabel = Normalize-DreamSkinText $ProjectLabel '◉ 选择项目' 40
$StatusText = Normalize-DreamSkinText $StatusText 'DREAM SKIN ONLINE' 40
if (@('auto', 'light', 'dark') -notcontains $Appearance) { throw 'Invalid appearance.' }
if (@('auto', 'left', 'right', 'center', 'none') -notcontains $SafeArea) { throw 'Invalid safe area.' }
if (@('auto', 'ambient', 'banner', 'off') -notcontains $TaskMode) { throw 'Invalid task mode.' }
if (@('auto', 'framed', 'immersive') -notcontains $HomeLayout) { throw 'Invalid home layout.' }
if (@('glass', 'balanced', 'solid') -notcontains $SurfaceStyle) { throw 'Invalid surface style.' }
if (@('compact', 'balanced', 'showcase') -notcontains $CardSize) { throw 'Invalid card size.' }
$normalizedFocusX = Normalize-DreamSkinUnit $FocusX 'FocusX'
$normalizedFocusY = Normalize-DreamSkinUnit $FocusY 'FocusY'
if ($Accent -and $Accent -notmatch '^#[0-9a-fA-F]{6}$') { throw 'Accent must be a six-digit hex color.' }
$palette = if ($Accent) {
  [pscustomobject]@{ accent = $Accent.ToLowerInvariant() }
} else {
  [pscustomobject]@{}
}

$theme = [pscustomobject]@{
  id = 'custom'
  name = $Name
  brandSubtitle = 'CODEX DREAM SKIN'
  tagline = $HeroSubtitle
  projectPrefix = '选择项目 · '
  projectLabel = $ProjectLabel
  statusText = $StatusText
  quote = 'MAKE SOMETHING WONDERFUL'
  hero = [pscustomobject]@{ title = $HeroTitle; subtitle = $HeroSubtitle }
  appearance = $Appearance
  art = [pscustomobject]@{
    focusX = $normalizedFocusX
    focusY = $normalizedFocusY
    safeArea = $SafeArea
    taskMode = $TaskMode
    homeLayout = $HomeLayout
    surfaceStyle = $SurfaceStyle
    cardSize = $CardSize
  }
  palette = $palette
}

if ($NoApply) {
  # Library-only: do not rewrite the active theme used by the left-card preview.
  if (-not $SaveLibrary) { $SaveLibrary = $true }
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $paths.Root -Root $paths.Root
  Ensure-DreamSkinManagedDirectory -Path $paths.Saved -Root $paths.Root
  Ensure-DreamSkinManagedDirectory -Path $paths.Images -Root $paths.Root
  Assert-DreamSkinImageFile -Path $full

  $id = (Get-Date).ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
  $destination = Join-Path $paths.Saved $id
  Ensure-DreamSkinManagedDirectory -Path $destination -Root $paths.Root
  $extension = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
  $imageName = 'art' + $extension
  $destinationImage = Join-Path $destination $imageName
  Copy-Item -LiteralPath $full -Destination $destinationImage -Force
  Assert-DreamSkinImageFile -Path $destinationImage

  $pack = $theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $pack.id = $id
  $pack.name = $Name
  $pack.image = $imageName
  Write-DreamSkinTheme -ThemeDirectory $destination -Theme $pack
  Write-Host ("THEME_ID=" + $id)
  Write-Host ("Saved library theme without applying: " + $Name)
  return
}

$active = Set-DreamSkinActiveTheme -ImagePath $full -Theme $theme -Name $Name -StateRoot $StateRoot
Write-Host ("Active theme set: " + $active.Theme.name)
if ($SaveLibrary) {
  $saved = Save-DreamSkinCurrentTheme -Name $Name -StateRoot $StateRoot
  Write-Host ("THEME_ID=" + $saved.Theme.id)
}
if (-not $NoApply) {
  $live = Invoke-DreamSkinLiveApply -StateRoot $StateRoot
  if ($live.Applied) {
    Write-Host $live.Message
  } else {
    Write-Warning $live.Message
    # Start/restart must finish enough for state.json, but keep verify short so the
    # desktop app can leave the spinner and show success without killing Codex.
    & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -RestartExisting
    Write-Host 'Dream Skin session restarted; check the Codex window.'
  }
}
