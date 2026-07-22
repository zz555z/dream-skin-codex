[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [string]$Name = '我的主题',
  [string]$Appearance = 'auto',
  [string]$SafeArea = 'auto',
  [string]$TaskMode = 'auto',
  [switch]$NoApply,
  [switch]$SaveLibrary
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$full = [System.IO.Path]::GetFullPath($ImagePath)
if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Image not found: $full" }

$theme = [pscustomobject]@{
  id = 'custom'
  name = $Name
  appearance = $Appearance
  art = [pscustomobject]@{ focusX = $null; focusY = $null; safeArea = $SafeArea; taskMode = $TaskMode }
  palette = [pscustomobject]@{}
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
    & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -RestartExisting
  }
}
