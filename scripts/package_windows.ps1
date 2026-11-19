param(
    [string]$RuntimeVersion = "1.0.0",
    [switch]$SkipRuntimeBuild
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tauriConfigPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
$tauriConfig = Get-Content -Raw -LiteralPath $tauriConfigPath | ConvertFrom-Json
$appVersion = [string]$tauriConfig.version
$releaseRoot = Join-Path $projectRoot "src-tauri\target\release"
$artifactsDir = Join-Path $projectRoot "release-artifacts"
$runtimeBuildRoot = Join-Path $projectRoot "build\runtime"
$coreDir = Join-Path $runtimeBuildRoot "core-dist\voxnote-sidecar"
$nvidiaDir = Join-Path $runtimeBuildRoot "nvidia"
$signingKey = Join-Path $env:LOCALAPPDATA "VoxNote\release-keys\updater.key"

function Assert-ProjectPath([string]$Path) {
    $absolute = [IO.Path]::GetFullPath($Path)
    if (-not $absolute.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe path outside project: $absolute"
    }
    return $absolute
}

function Reset-Directory([string]$Path) {
    $safePath = Assert-ProjectPath $Path
    if (Test-Path -LiteralPath $safePath) {
        Remove-Item -LiteralPath $safePath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $safePath -Force | Out-Null
}

function New-PortableArchive([string]$Profile, [bool]$WithNvidia) {
    $portableName = "VoxNote-$appVersion-Windows-x64-$Profile-Portable"
    $portableDir = Join-Path $artifactsDir $portableName
    Reset-Directory $portableDir
    Copy-Item -LiteralPath (Join-Path $releaseRoot "voxnote.exe") -Destination (Join-Path $portableDir "VoxNote.exe") -Force

    $runtimeDir = Join-Path $portableDir "runtime"
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    Copy-Item -LiteralPath $coreDir -Destination (Join-Path $runtimeDir "core-$RuntimeVersion") -Recurse -Force
    if ($WithNvidia) {
        Copy-Item -LiteralPath $nvidiaDir -Destination (Join-Path $runtimeDir "nvidia-$RuntimeVersion") -Recurse -Force
    }

    $archive = Join-Path $artifactsDir "$portableName.zip"
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    & tar.exe -a -cf $archive -C $portableDir .
    if ($LASTEXITCODE -ne 0) { throw "Failed to create $archive" }
    Write-Host "$Profile Portable: $([math]::Round((Get-Item $archive).Length / 1MB, 1)) MB" -ForegroundColor Green
}

Write-Host "=== Step 1: Generate icons ===" -ForegroundColor Cyan
& (Join-Path $projectRoot ".venv\Scripts\python.exe") (Join-Path $projectRoot "scripts\generate_icons.py")

Write-Host "=== Step 2: Build versioned runtime packages ===" -ForegroundColor Cyan
if ($SkipRuntimeBuild) {
    & (Join-Path $projectRoot "scripts\package_runtime.ps1") -RuntimeVersion $RuntimeVersion -SkipCoreBuild -SkipArchives
} else {
    & (Join-Path $projectRoot "scripts\package_runtime.ps1") -RuntimeVersion $RuntimeVersion
}
if (-not (Test-Path (Join-Path $coreDir "voxnote-sidecar.exe"))) { throw "Core runtime is missing" }

Write-Host "=== Step 3: Build React frontend ===" -ForegroundColor Cyan
& pnpm.cmd build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }

Write-Host "=== Step 4: Build slim signed Tauri application ===" -ForegroundColor Cyan
if (-not (Test-Path -LiteralPath $signingKey)) {
    throw "Updater signing key is missing: $signingKey"
}
$env:TAURI_SIGNING_PRIVATE_KEY = $signingKey
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
& pnpm.cmd tauri build
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

New-Item -ItemType Directory -Path $artifactsDir -Force | Out-Null
$nsisInstaller = Get-ChildItem -LiteralPath (Join-Path $releaseRoot "bundle\nsis") -File -Filter "*.exe" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $nsisInstaller) { throw "NSIS installer not found" }
$slimInstallerName = "VoxNote_${appVersion}_x64-slim-setup.exe"
Copy-Item -LiteralPath $nsisInstaller.FullName -Destination (Join-Path $artifactsDir $slimInstallerName) -Force
Write-Host "Slim installer: $([math]::Round($nsisInstaller.Length / 1MB, 1)) MB" -ForegroundColor Green

Write-Host "=== Step 5: Generate signed updater metadata ===" -ForegroundColor Cyan
$signaturePath = "$($nsisInstaller.FullName).sig"
if (-not (Test-Path -LiteralPath $signaturePath)) { throw "Updater signature not found: $signaturePath" }
Copy-Item -LiteralPath $signaturePath -Destination (Join-Path $artifactsDir "$slimInstallerName.sig") -Force
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

Write-Host "=== Step 6: Build CPU and Full NVIDIA Portable archives ===" -ForegroundColor Cyan
New-PortableArchive "CPU" $false
New-PortableArchive "Full-NVIDIA" $true

Write-Host "=== Packaging complete ===" -ForegroundColor Green
