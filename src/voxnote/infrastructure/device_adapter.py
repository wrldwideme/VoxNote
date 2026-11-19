from __future__ import annotations

import os
import subprocess
from collections.abc import Callable
from importlib import import_module

from voxnote.domain.models import DeviceCapabilities
from voxnote.infrastructure.nvidia_runtime import register_nvidia_dll_directories

CudaCount = Callable[[], int]
ComputeTypes = Callable[[str], set[str]]
GpuDetails = Callable[[], tuple[str | None, int | None]]


class CTranslate2DeviceDetector:
    def __init__(
        self,
        *,
        cuda_count: CudaCount | None = None,
        compute_types: ComputeTypes | None = None,
        gpu_details: GpuDetails | None = None,
    ) -> None:
        self._cuda_count = cuda_count
        self._compute_types = compute_types
        self._gpu_details = gpu_details or self._query_nvidia_smi

    def detect(self) -> DeviceCapabilities:
        try:
            if (
                os.environ.get("VOXNOTE_PACKAGED_RUNTIME") == "1"
                and os.environ.get("VOXNOTE_NVIDIA_ACCELERATOR_AVAILABLE") != "1"
            ):
                return DeviceCapabilities(
                    cuda_available=False,
                    unavailable_reason="пакет ускорения NVIDIA не установлен",
                )
            register_nvidia_dll_directories()
            cuda_count = self._cuda_count or self._default_cuda_count
            compute_types = self._compute_types or self._default_compute_types
            if cuda_count() <= 0:
                return DeviceCapabilities(
                    cuda_available=False,
                    unavailable_reason="совместимая NVIDIA GPU не обнаружена",
                )
            supported = frozenset(compute_types("cuda"))
            if not supported.intersection({"float16", "int8_float16", "int8"}):
                return DeviceCapabilities(
                    cuda_available=False,
                    compute_types=supported,
                    unavailable_reason="CTranslate2 не поддерживает подходящий режим CUDA",
                )
            name, memory_mb = self._gpu_details()
            return DeviceCapabilities(
                cuda_available=True,
                gpu_name=name,
                total_memory_mb=memory_mb,
                compute_types=supported,
            )
        except (
            ImportError,
            IndexError,
            OSError,
            RuntimeError,
            ValueError,
            subprocess.SubprocessError,
        ) as error:
            return DeviceCapabilities(
                cuda_available=False,
                unavailable_reason=self._safe_reason(error),
            )

    @staticmethod
    def _default_cuda_count() -> int:
        ctranslate2 = import_module("ctranslate2")
        return int(ctranslate2.get_cuda_device_count())

    @staticmethod
    def _default_compute_types(device: str) -> set[str]:
        ctranslate2 = import_module("ctranslate2")
        return set(ctranslate2.get_supported_compute_types(device))

    @staticmethod
    def _query_nvidia_smi() -> tuple[str | None, int | None]:
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        completed = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total",
                "--format=csv,noheader,nounits",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
            creationflags=creation_flags,
        )
        first_line = completed.stdout.strip().splitlines()[0]
        name, memory = (part.strip() for part in first_line.split(",", maxsplit=1))
        return name or None, int(memory)

    @staticmethod
    def _safe_reason(error: BaseException) -> str:
        if isinstance(error, ImportError):
            return "компоненты CTranslate2 не установлены"
        return "не удалось проверить CUDA runtime"
