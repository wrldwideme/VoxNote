# -*- mode: python ; coding: utf-8 -*-
"""CPU-capable shared runtime without redistributable NVIDIA libraries."""

from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

project_root = Path.cwd()
src_dir = project_root / "src"

datas = []
for pkg in ["faster_whisper", "ctranslate2", "huggingface_hub", "tokenizers", "onnxruntime"]:
    try:
        datas.extend(collect_data_files(pkg))
    except Exception:
        pass

dict_dir = project_root / "resources" / "dictionaries"
for file_path in dict_dir.glob("*.json"):
    datas.append((str(file_path), "resources/dictionaries"))

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
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "PySide6",
        "PyQt5",
        "tkinter",
        "matplotlib",
        "scipy",
        "PIL",
        "hf_xet",
        "pytest",
        "py",
        "nvidia",
        "nvidia.cublas",
        "nvidia.cudnn",
        "nvidia.cuda_nvrtc",
    ],
    noarchive=False,
    optimize=1,
)

# PyInstaller can discover NVIDIA DLLs transitively through installed wheels.
# The core runtime must stay CPU-capable and receives GPU DLLs only through the
# separately versioned accelerator directory added to PATH by the Rust shell.
cuda_names = {
    "cublas64_12.dll",
    "cublaslt64_12.dll",
    "cudnn64_9.dll",
    "cudnn_cnn64_9.dll",
    "cudnn_graph64_9.dll",
    "cudnn_ops64_9.dll",
    "nvrtc64_120_0.dll",
}
filtered_binaries = []
seen = set()
for dest_name, src_path, type_name in a.binaries:
    normalized_dest = str(dest_name).replace("\\", "/").lower()
    base_name = Path(dest_name).name.lower()
    if base_name in cuda_names or normalized_dest.startswith("nvidia/"):
        continue
    if base_name.endswith(".dll") and base_name in seen:
        continue
    if base_name.endswith(".dll"):
        seen.add(base_name)
    filtered_binaries.append((dest_name, src_path, type_name))
a.binaries = filtered_binaries

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
