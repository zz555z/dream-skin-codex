[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$ctx = Get-DreamSkinLiveSessionContext -StateRoot $StateRoot
if ($null -ne $ctx) {
  $null = Invoke-DreamSkinLiveRemove -Context $ctx
}
$null = Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot
Write-Host 'Dream Skin paused.'
