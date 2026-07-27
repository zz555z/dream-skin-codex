[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$engineRoot = Join-Path $repoRoot 'src-tauri\resources\engine\windows'
$scriptRoot = Join-Path $engineRoot 'scripts'

function Assert-DreamSkinTest {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

Write-Host 'Parsing Windows PowerShell scripts...'
foreach ($file in Get-ChildItem -LiteralPath $scriptRoot -Filter '*.ps1' -File) {
  $tokens = $null
  $parseErrors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseFile(
    $file.FullName,
    [ref]$tokens,
    [ref]$parseErrors
  )
  if ($parseErrors.Count -gt 0) {
    $details = ($parseErrors | ForEach-Object { "$($_.Extent): $($_.Message)" }) -join "`n"
    throw "PowerShell parse failed for $($file.Name):`n$details"
  }
}

. (Join-Path $scriptRoot 'common-windows.ps1')
. (Join-Path $scriptRoot 'theme-windows.ps1')

Write-Host 'Checking Windows renderer payload...'
& node (Join-Path $scriptRoot 'injector.mjs') --self-test
if ($LASTEXITCODE -ne 0) { throw 'Windows injector self-test failed.' }

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  'dream-skin-windows-tests-' + [guid]::NewGuid().ToString('N')
)
try {
  New-Item -ItemType Directory -Path $testRoot | Out-Null

  $script:lockActionRan = $false
  Invoke-DreamSkinLockedOperation -Action { $script:lockActionRan = $true }
  Assert-DreamSkinTest $script:lockActionRan 'Operation-lock wrapper did not run its action.'

  $utf8Path = Join-Path $testRoot 'utf8.json'
  Write-DreamSkinUtf8FileAtomically -Path $utf8Path -Content "{`"name`":`"主题`"}`r`n"
  $utf8Text = Read-DreamSkinUtf8File -Path $utf8Path
  Assert-DreamSkinTest ($utf8Text -match '主题') 'UTF-8 round trip failed.'

  $themeDirectory = Join-Path $testRoot 'theme'
  New-Item -ItemType Directory -Path $themeDirectory | Out-Null
  $sourceImage = Join-Path $engineRoot 'assets\dream-reference.jpg'
  $themeImage = Join-Path $themeDirectory 'art.jpg'
  Copy-Item -LiteralPath $sourceImage -Destination $themeImage
  Assert-DreamSkinImageFile -Path $themeImage
  $theme = [pscustomobject]@{
    id = 'test-theme'
    name = 'Windows Test Theme'
    image = 'art.jpg'
    appearance = 'auto'
  }
  Write-DreamSkinTheme -ThemeDirectory $themeDirectory -Theme $theme
  $loaded = Read-DreamSkinTheme -ThemeDirectory $themeDirectory
  Assert-DreamSkinTest ($loaded.Theme.id -eq 'test-theme') 'Theme round trip failed.'

  $unsupported = Join-Path $testRoot 'unsupported.heic'
  [System.IO.File]::WriteAllBytes($unsupported, [byte[]](1, 2, 3, 4))
  $rejected = $false
  try { Assert-DreamSkinImageFile -Path $unsupported } catch { $rejected = $true }
  Assert-DreamSkinTest $rejected 'Unsupported Windows image format was accepted.'

  $stateRoot = Join-Path $testRoot 'state'
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $stateRoot
  Assert-DreamSkinTest (Test-DreamSkinPaused -StateRoot $stateRoot) 'Pause marker was not written.'
  $null = Set-DreamSkinPaused -Paused $false -StateRoot $stateRoot
  Assert-DreamSkinTest (-not (Test-DreamSkinPaused -StateRoot $stateRoot)) 'Pause marker was not removed.'
  Assert-DreamSkinTest (Test-Path -LiteralPath (Join-Path $stateRoot 'app-actions.log') -PathType Leaf) `
    'Core Windows action log was not written by default.'

  $failedState = Join-Path $stateRoot 'state.json'
  Write-DreamSkinUtf8FileAtomically -Path $failedState -Content "{}`r`n"
  $failedArchive = Archive-DreamSkinStateFile -Path $failedState -Reason failed
  Assert-DreamSkinTest ($failedArchive -and (Test-Path -LiteralPath $failedArchive -PathType Leaf)) `
    'Failed Windows state was not archived.'
  Assert-DreamSkinTest ([System.IO.Path]::GetFileName($failedArchive).StartsWith('state.failed-')) `
    'Failed Windows state archive name is incorrect.'

  Write-Host 'Windows engine checks passed.'
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
