from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from voxnote.application.background import CancellationToken
from voxnote.application.ports import ProgressCallback
from voxnote.domain.models import TranscriptionJob, TranscriptionResult
from voxnote.services.device import (
    DeviceExecutionError,
    DeviceSelector,
    DeviceUnavailableError,
)
from voxnote.services.settings import DevicePreference


class PreparedService(Protocol):
    def prepare(self, cancellation: CancellationToken) -> bool: ...

    def transcribe(
        self,
        job: TranscriptionJob,
        cancellation: CancellationToken,
        on_progress: ProgressCallback,
    ) -> TranscriptionResult: ...


ServiceBuilder = Callable[[Path, str, str], PreparedService]


class DeviceRoutingTranscriptionService:
    """Choose a device before work and never silently restart a running job."""

    def __init__(
        self,
        model_path: Path,
        preference: DevicePreference,
        selector: DeviceSelector,
        service_builder: ServiceBuilder,
    ) -> None:
        self._model_path = model_path
        self._preference = preference
        self._selector = selector
        self._service_builder = service_builder
        self._delegate: PreparedService | None = None
        self.device_label = "CPU"
        self.device_notice = ""
        self.device_name = "cpu"

    def prepare(self, cancellation: CancellationToken) -> bool:
        if cancellation.is_cancelled:
            return False
        selection = self._selector.select(self._preference, self._model_path.name)
        self.device_label = selection.label
        self.device_notice = selection.notice
        self.device_name = selection.device
        candidate = self._service_builder(
            self._model_path,
            selection.device,
            selection.compute_type,
        )
        try:
            prepared = candidate.prepare(cancellation)
        except (OSError, RuntimeError, ValueError) as error:
            if selection.device != "cuda" or self._preference != "auto":
                raise DeviceUnavailableError(self._initialization_message(error)) from error
            if cancellation.is_cancelled:
                return False
            fallback = self._selector.cpu_selection()
            candidate = self._service_builder(
                self._model_path,
                fallback.device,
                fallback.compute_type,
            )
            try:
                prepared = candidate.prepare(cancellation)
            except (OSError, RuntimeError, ValueError):
                raise
            self.device_label = fallback.label
            self.device_name = fallback.device
            self.device_notice = "NVIDIA не удалось инициализировать — используем CPU."
        if prepared:
            self._delegate = candidate
        return prepared

    def transcribe(
        self,
        job: TranscriptionJob,
        cancellation: CancellationToken,
        on_progress: ProgressCallback,
    ) -> TranscriptionResult:
        if self._delegate is None:
            raise RuntimeError("Transcription service was not prepared")
        try:
            return self._delegate.transcribe(job, cancellation, on_progress)
        except (OSError, RuntimeError, ValueError) as error:
            if self.device_name == "cuda" and self._is_cuda_error(error):
                raise DeviceExecutionError(self._execution_message(error)) from error
            raise

    @classmethod
    def _initialization_message(cls, error: BaseException) -> str:
        if cls._is_out_of_memory(error):
            return (
                "Не хватило видеопамяти для выбранной модели. "  # noqa: RUF001
                "Выберите меньшую модель или режим «Процессор»."
            )
        if cls._is_missing_cuda_library(error):
            return (
                "Не найдены библиотеки NVIDIA для распознавания: нужны cuBLAS и cuDNN "  # noqa: RUF001
                "для CUDA 12. Установите CUDA runtime или выберите режим «Процессор»."
            )
        return (
            "Не удалось запустить обработку на NVIDIA GPU. Проверьте CUDA-библиотеки "  # noqa: RUF001
            "или выберите режим «Процессор»."
        )

    @classmethod
    def _execution_message(cls, error: BaseException) -> str:
        if cls._is_out_of_memory(error):
            return (
                "Во время обработки закончилась видеопамять. Задание остановлено и не было "  # noqa: RUF001
                "перезапущено на CPU. Выберите меньшую модель или режим «Процессор»."
            )
        return (
            "GPU перестала отвечать во время обработки. Задание остановлено и не было "
            "перезапущено на CPU. Повторите в режиме «Процессор»."
        )

    @staticmethod
    def _is_out_of_memory(error: BaseException) -> bool:
        message = str(error).lower()
        return any(
            marker in message
            for marker in ("out of memory", "cuda_error_out_of_memory", "failed to allocate")
        )

    @classmethod
    def _is_cuda_error(cls, error: BaseException) -> bool:
        if cls._is_out_of_memory(error):
            return True
        message = str(error).lower()
        return any(
            marker in message for marker in ("cuda", "cudnn", "cublas", "nvidia", "device lost")
        )

    @staticmethod
    def _is_missing_cuda_library(error: BaseException) -> bool:
        message = str(error).lower()
        return ("not found" in message or "cannot be loaded" in message) and any(
            library in message for library in ("cublas", "cudnn", "cuda")
        )
