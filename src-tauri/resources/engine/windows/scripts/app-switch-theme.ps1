[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ThemeId,
  [switch]$NoApply
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
$id = "$ThemeId".Trim()
if ($id -notmatch '^[A-Za-z0-9_-]{1,80}$') { throw "Invalid theme id: $ThemeId" }
$themeDir = Join-Path $paths.Saved $id
if (-not (Test-Path -LiteralPath $themeDir -PathType Container)) { throw "Theme not found: $ThemeId" }
$null = Use-DreamSkinSavedTheme -ThemeDirectory $themeDir -StateRoot $StateRoot
Write-Host "Switched active theme to $ThemeId"
if (-not $NoApply) {
  $live = Invoke-DreamSkinLiveApply -StateRoot $StateRoot
  if ($live.Applied) {
    Write-Host $live.Message
  } else {
    Write-Warning $live.Message
    & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -RestartExisting
  }
}
