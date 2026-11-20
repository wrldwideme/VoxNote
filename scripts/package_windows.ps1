param(
    [string]$SigningKeyPath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tauriConfigPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
$tauriConfig = Get-Content -Raw -LiteralPath $tauriConfigPath | ConvertFrom-Json
$appVersion = [string]$tauriConfig.version
$releaseRoot = Join-Path $projectRoot "src-tauri\target\release"
$artifactsDir = Join-Path $projectRoot "release-artifacts"

if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    if (-not $SigningKeyPath) {
        $SigningKeyPath = Join-Path $env:LOCALAPPDATA "VoxNote\release-keys\updater.key"
    }
    if (-not (Test-Path -LiteralPath $SigningKeyPath)) {
        throw "Updater signing key is missing: $SigningKeyPath"
    }
    $env:TAURI_SIGNING_PRIVATE_KEY = $SigningKeyPath
}
if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
}

Write-Host "=== Step 1: Build signed slim Tauri application ===" -ForegroundColor Cyan
& pnpm.cmd tauri build
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

Write-Host "=== Step 2: Collect release artifacts ===" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $artifactsDir -Force | Out-Null
$nsisInstaller = Get-ChildItem -LiteralPath (Join-Path $releaseRoot "bundle\nsis") -File -Filter "*.exe" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $nsisInstaller) { throw "NSIS installer not found" }

$slimInstallerName = "VoxNote_${appVersion}_x64-slim-setup.exe"
$slimInstallerPath = Join-Path $artifactsDir $slimInstallerName
Copy-Item -LiteralPath $nsisInstaller.FullName -Destination $slimInstallerPath -Force

$signaturePath = "$($nsisInstaller.FullName).sig"
if (-not (Test-Path -LiteralPath $signaturePath)) {
    throw "Updater signature not found: $signaturePath"
}
$releaseSignaturePath = Join-Path $artifactsDir "$slimInstallerName.sig"
Copy-Item -LiteralPath $signaturePath -Destination $releaseSignaturePath -Force

Write-Host "=== Step 3: Generate updater metadata ===" -ForegroundColor Cyan
$latest = [ordered]@{
    version = $appVersion
    notes = "VoxNote $appVersion"
    pub_date = (Get-Date).ToUniversalTime().ToString("o")
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = (Get-Content -Raw -LiteralPath $signaturePath).Trim()
            url = "https://github.com/wrldwideme/VoxNote/releases/download/v$appVersion/$slimInstallerName"
        }
    }
}
$latestJson = $latest | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText(
    (Join-Path $artifactsDir "latest.json"),
    $latestJson,
    [Text.UTF8Encoding]::new($false)
)

$installer = Get-Item -LiteralPath $slimInstallerPath
$installerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $slimInstallerPath).Hash.ToLowerInvariant()
Write-Host "Installer: $($installer.Name) ($([math]::Round($installer.Length / 1MB, 1)) MB)" -ForegroundColor Green
Write-Host "SHA-256: $installerHash" -ForegroundColor Green
Write-Host "Release set: installer + signature + latest.json" -ForegroundColor Green
