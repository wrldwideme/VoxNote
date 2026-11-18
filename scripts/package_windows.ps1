# scripts/package_windows.ps1
# Automates VoxNote Stage 14: Packaging for Windows 10/11 x64

$ErrorActionPreference = "Stop"

Write-Host "=== Step 1: Generate icons ===" -ForegroundColor Cyan
& .\.venv\Scripts\python.exe scripts/generate_icons.py

Write-Host "=== Step 2: Build Python Sidecar (faster-whisper + PyAV + CUDA) ===" -ForegroundColor Cyan
& .\.venv\Scripts\pyinstaller.exe packaging/voxnote-sidecar.spec --distpath src-tauri/binaries --workpath build/pyinstaller --noconfirm

Write-Host "=== Step 3: Build React Frontend ===" -ForegroundColor Cyan
pnpm build

Write-Host "=== Step 4: Build Tauri Windows Bundle (NSIS Installer) ===" -ForegroundColor Cyan
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
pnpm tauri build

Write-Host "=== Step 5: Create Portable ZIP distribution and collect artifacts ===" -ForegroundColor Cyan
$releaseDir = "src-tauri\target\release"
$artifactsDir = "release-artifacts"
$portableDir = "$artifactsDir\VoxNote-0.1.0-Portable"

New-Item -ItemType Directory -Path $artifactsDir -Force | Out-Null
Copy-Item "src-tauri\target\release\bundle\nsis\VoxNote_0.1.0_x64-setup.exe" -Destination "$artifactsDir\" -Force
Copy-Item "src-tauri\target\release\bundle\msi\VoxNote_0.1.0_x64_en-US.msi" -Destination "$artifactsDir\" -Force

if (Test-Path "$releaseDir\voxnote.exe") {
    if (Test-Path $portableDir) { Remove-Item -Recurse -Force $portableDir }
    New-Item -ItemType Directory -Path $portableDir -Force | Out-Null
    
    Copy-Item "$releaseDir\voxnote.exe" -Destination "$portableDir\VoxNote.exe"
    Copy-Item -Recurse "src-tauri\binaries\voxnote-sidecar" -Destination "$portableDir\voxnote-sidecar"
    
    Compress-Archive -Path "$portableDir\*" -DestinationPath "$artifactsDir\VoxNote-0.1.0-Windows-x64-Portable.zip" -Force
    Write-Host "Portable archive created at $artifactsDir\VoxNote-0.1.0-Windows-x64-Portable.zip" -ForegroundColor Green
}

Write-Host "=== Packaging Complete! ===" -ForegroundColor Green
