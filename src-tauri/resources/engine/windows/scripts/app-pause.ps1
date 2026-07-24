[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
Write-DreamSkinDiagnosticEvent -Event 'pause-action-start' -StateRoot $StateRoot -Data @{
  pausedBefore = (Test-DreamSkinPaused -StateRoot $StateRoot)
}
$ctx = Get-DreamSkinLiveSessionContext -StateRoot $StateRoot
if ($null -ne $ctx) {
  $null = Invoke-DreamSkinLiveRemove -StateRoot $StateRoot
}
$null = Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot
Write-DreamSkinDiagnosticEvent -Event 'pause-action-success' -StateRoot $StateRoot -Data @{
  pausedAfter = (Test-DreamSkinPaused -StateRoot $StateRoot)
}
Write-Host 'Dream Skin paused.'
