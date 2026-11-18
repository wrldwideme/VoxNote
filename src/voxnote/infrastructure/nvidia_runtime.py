from __future__ import annotations

import os
import sys
from collections.abc import Callable, Iterable
from importlib.util import find_spec
from pathlib import Path

DllDirectoryHandle = object
AddDllDirectory = Callable[[str], DllDirectoryHandle]

_DLL_HANDLES: list[DllDirectoryHandle] = []
_REGISTERED_PATHS: set[Path] = set()


def discover_nvidia_dll_directories() -> tuple[Path, ...]:
    directories: list[Path] = []

    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        for candidate in (exe_dir, exe_dir / "_internal", exe_dir / "nvidia"):
            if candidate.is_dir():
                directories.append(candidate)
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            meipass_dir = Path(meipass)
            for candidate in (meipass_dir, meipass_dir / "_internal", meipass_dir / "nvidia"):
                if candidate.is_dir():
                    directories.append(candidate)

    for package in ("nvidia.cublas", "nvidia.cudnn", "nvidia.cuda_nvrtc"):
        try:
            spec = find_spec(package)
        except (ImportError, AttributeError, ValueError):
            continue
        if spec is None or spec.submodule_search_locations is None:
            continue
        for location in spec.submodule_search_locations:
            candidate = Path(location) / "bin"
            if candidate.is_dir():
                directories.append(candidate.resolve())
    return tuple(dict.fromkeys(directories))


def register_nvidia_dll_directories(
    directories: Iterable[Path] | None = None,
    *,
    add_dll_directory: AddDllDirectory | None = None,
) -> tuple[Path, ...]:
    """Expose NVIDIA wheel DLLs to CTranslate2 without changing the system PATH."""
    if os.name != "nt":
        return ()
    add_directory = add_dll_directory or getattr(os, "add_dll_directory", None)
    if add_directory is None:
        return ()

    registered: list[Path] = []
    for directory in directories or discover_nvidia_dll_directories():
        resolved = directory.resolve()
        if not resolved.is_dir():
            continue
        if resolved not in _REGISTERED_PATHS:
            _DLL_HANDLES.append(add_directory(str(resolved)))
            _REGISTERED_PATHS.add(resolved)
            current_path = os.environ.get("PATH", "")
            entries = current_path.split(os.pathsep) if current_path else []
            if str(resolved) not in entries:
                os.environ["PATH"] = os.pathsep.join((str(resolved), *entries))
        registered.append(resolved)
    return tuple(registered)
