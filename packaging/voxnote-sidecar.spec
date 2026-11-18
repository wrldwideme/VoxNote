# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules
from voxnote.infrastructure.nvidia_runtime import discover_nvidia_dll_directories

project_root = Path.cwd()
src_dir = project_root / "src"

# Targeted CUDA DLL collection for CTranslate2 without multi-gigabyte duplicates
NEEDED_CUDA_DLLS = {
    "cublas64_12.dll",
    "cublasLt64_12.dll",
    "cudnn64_9.dll",
    "cudnn_cnn64_9.dll",
    "cudnn_ops64_9.dll",
    "nvrtc64_120_0.dll",
}

binaries = []
seen_dlls = set()
for d in discover_nvidia_dll_directories():
    for f in d.glob("*.dll"):
        if f.name in NEEDED_CUDA_DLLS and f.name not in seen_dlls:
            binaries.append((str(f), "."))
            seen_dlls.add(f.name)

# Package data files
datas = []
for pkg in ["faster_whisper", "ctranslate2", "huggingface_hub", "tokenizers", "onnxruntime"]:
    try:
        datas.extend(collect_data_files(pkg))
    except Exception:
        pass

# Built-in dictionaries
dict_dir = project_root / "resources" / "dictionaries"
for f in dict_dir.glob("*.json"):
    datas.append((str(f), "resources/dictionaries"))

hiddenimports = [
    "voxnote",
    "voxnote.sidecar",
    "voxnote.sidecar.__main__",
    "voxnote.sidecar.service",
    "voxnote.application.ports",
    "voxnote.domain.models",
    "voxnote.infrastructure.audio_adapter",
    "voxnote.infrastructure.faster_whisper_adapter",
    "voxnote.infrastructure.nvidia_runtime",
    "voxnote.infrastructure.device_routing",
    "voxnote.services.controller",
    "voxnote.services.dictionary",
    "voxnote.services.history",
    "voxnote.services.model_manager",
    "voxnote.services.paths",
    "voxnote.services.progress",
    "voxnote.services.settings",
    "faster_whisper",
    "ctranslate2",
    "av",
    "av.audio",
    "av.container",
    "av.subtitles",
    "av.video",
    "numpy",
    "huggingface_hub",
    "tokenizers",
    "onnxruntime",
]
hiddenimports.extend(collect_submodules("voxnote"))
hiddenimports.extend(collect_submodules("faster_whisper"))

a = Analysis(
    [str(src_dir / "voxnote" / "sidecar" / "__main__.py")],
    pathex=[str(src_dir)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["PySide6", "PyQt5", "tkinter", "matplotlib", "scipy"],
    noarchive=False,
    optimize=0,
)

# Deduplicate DLLs to prevent installer size overflow for NSIS (2GB limit)
seen_dll_names = set()
unique_binaries = []
for dest_name, src_path, type_ in a.binaries:
    base_name = Path(dest_name).name.lower()
    if base_name.endswith(".dll"):
        if base_name in seen_dll_names:
            continue
        seen_dll_names.add(base_name)
    unique_binaries.append((dest_name, src_path, type_))
a.binaries = unique_binaries

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="voxnote-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(project_root / "resources" / "icons" / "icon.ico"),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="voxnote-sidecar",
)
