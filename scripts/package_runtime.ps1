param(
    [string]$RuntimeVersion = "1.0.0",
    [switch]$SkipCoreBuild,
    [switch]$SkipArchives
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$buildRoot = Join-Path $projectRoot "build\runtime"
$coreDistRoot = Join-Path $buildRoot "core-dist"
$coreDir = Join-Path $coreDistRoot "voxnote-sidecar"
$nvidiaDir = Join-Path $buildRoot "nvidia"
$artifactsDir = Join-Path $projectRoot "release-artifacts\runtime"
$manifestPath = Join-Path $projectRoot "resources\runtime_manifest.json"

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

function New-ZipArchive([string]$SourceDir, [string]$TargetFile) {
    $safeTarget = Assert-ProjectPath $TargetFile
    if (Test-Path -LiteralPath $safeTarget) {
        Remove-Item -LiteralPath $safeTarget -Force
    }
    & tar.exe -a -cf $safeTarget -C $SourceDir .
    if ($LASTEXITCODE -ne 0) { throw "tar failed for $safeTarget" }
}

New-Item -ItemType Directory -Path $buildRoot,$artifactsDir -Force | Out-Null

if (-not $SkipCoreBuild) {
    Write-Host "=== Build shared CPU/core runtime ===" -ForegroundColor Cyan
    & (Join-Path $projectRoot ".venv\Scripts\pyinstaller.exe") `
        (Join-Path $projectRoot "packaging\voxnote-sidecar-core.spec") `
        --distpath $coreDistRoot `
        --workpath (Join-Path $projectRoot "build\pyinstaller-core") `
        --noconfirm
    if ($LASTEXITCODE -ne 0) { throw "Core runtime build failed" }
}

if (-not (Test-Path -LiteralPath (Join-Path $coreDir "voxnote-sidecar.exe"))) {
    throw "Core runtime executable not found: $coreDir"
}

Write-Host "=== Collect NVIDIA accelerator DLLs ===" -ForegroundColor Cyan
Reset-Directory $nvidiaDir
$neededDlls = @(
    "cublas64_12.dll",
    "cublasLt64_12.dll",
    "cudnn64_9.dll",
    "cudnn_cnn64_9.dll",
    "cudnn_graph64_9.dll",
    "cudnn_ops64_9.dll",
    "nvrtc64_120_0.dll"
)
$nvidiaRoots = & (Join-Path $projectRoot ".venv\Scripts\python.exe") -c `
    "from voxnote.infrastructure.nvidia_runtime import discover_nvidia_dll_directories; print('\n'.join(map(str, discover_nvidia_dll_directories())))"
foreach ($dllName in $neededDlls) {
    $source = $null
    foreach ($root in $nvidiaRoots) {
        $candidate = Join-Path $root $dllName
        if (Test-Path -LiteralPath $candidate) { $source = $candidate; break }
    }
    if (-not $source) { throw "Required NVIDIA DLL not found: $dllName" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $nvidiaDir $dllName) -Force
}

if ($SkipArchives) {
    Write-Host "Runtime directories prepared; archives skipped." -ForegroundColor Yellow
    return
}

$coreArchiveName = "voxnote-runtime-core-$RuntimeVersion-windows-x64.zip"
$nvidiaArchiveName = "voxnote-runtime-nvidia-$RuntimeVersion-windows-x64.zip"
$coreArchive = Join-Path $artifactsDir $coreArchiveName
$nvidiaArchive = Join-Path $artifactsDir $nvidiaArchiveName

Write-Host "=== Create runtime archives ===" -ForegroundColor Cyan
New-ZipArchive $coreDir $coreArchive
New-ZipArchive $nvidiaDir $nvidiaArchive

$coreHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $coreArchive).Hash.ToLowerInvariant()
$nvidiaHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $nvidiaArchive).Hash.ToLowerInvariant()
$coreSize = (Get-Item -LiteralPath $coreArchive).Length
$nvidiaSize = (Get-Item -LiteralPath $nvidiaArchive).Length
$releaseBase = "https://github.com/wrldwideme/VoxNote/releases/download/runtime-v$RuntimeVersion"

$manifest = [ordered]@{
    schema_version = 1
    runtime_version = $RuntimeVersion
    packages = [ordered]@{
        core = [ordered]@{
            url = "$releaseBase/$coreArchiveName"
            sha256 = $coreHash
            size_bytes = $coreSize
        }
        nvidia = [ordered]@{
            url = "$releaseBase/$nvidiaArchiveName"
            sha256 = $nvidiaHash
            size_bytes = $nvidiaSize
        }
    }
}
$manifestJson = $manifest | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($manifestPath, $manifestJson, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $artifactsDir "runtime-manifest.json") -Force

Write-Host "Core download: $([math]::Round($coreSize / 1MB, 1)) MB" -ForegroundColor Green
Write-Host "NVIDIA download: $([math]::Round($nvidiaSize / 1MB, 1)) MB" -ForegroundColor Green
Write-Host "Runtime manifest updated: $manifestPath" -ForegroundColor Green
