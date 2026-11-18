from __future__ import annotations

import os
from pathlib import Path

from voxnote.infrastructure.nvidia_runtime import register_nvidia_dll_directories


def test_registers_existing_nvidia_dll_directories(tmp_path: Path) -> None:
    first = tmp_path / "cublas" / "bin"
    second = tmp_path / "cudnn" / "bin"
    first.mkdir(parents=True)
    second.mkdir(parents=True)
    handles: list[str] = []

    registered = register_nvidia_dll_directories(
        (first, tmp_path / "missing", second),
        add_dll_directory=lambda path: handles.append(path),
    )

    if os.name == "nt":
        assert registered == (first.resolve(), second.resolve())
        assert handles == [str(first.resolve()), str(second.resolve())]
    else:
        assert registered == ()
        assert handles == []


def test_discover_nvidia_dll_directories_handles_missing_packages(monkeypatch) -> None:
    from voxnote.infrastructure.nvidia_runtime import discover_nvidia_dll_directories

    # Should safely return a tuple without raising ModuleNotFoundError or ImportError
    directories = discover_nvidia_dll_directories()
    assert isinstance(directories, tuple)
