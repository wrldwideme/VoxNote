from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest

from voxnote.application.background import CancellationToken
from voxnote.domain.models import (
    DeviceCapabilities,
    TranscriptionJob,
    TranscriptionResult,
)
from voxnote.infrastructure.device_adapter import CTranslate2DeviceDetector
from voxnote.infrastructure.device_routing import DeviceRoutingTranscriptionService
from voxnote.services.device import (
    DeviceExecutionError,
    DeviceSelector,
    DeviceUnavailableError,
)


@dataclass
class FakePreparedService:
    device: str
    prepare_error: RuntimeError | None = None
    transcribe_error: RuntimeError | None = None

    def prepare(self, cancellation: CancellationToken) -> bool:
        if self.prepare_error is not None:
            raise self.prepare_error
        return not cancellation.is_cancelled

    def transcribe(
        self,
        job: TranscriptionJob,
        cancellation: CancellationToken,
        on_progress: object,
    ) -> TranscriptionResult:
        del cancellation, on_progress
        if self.transcribe_error is not None:
            raise self.transcribe_error
        return TranscriptionResult("Текст", job.model_id, self.device)


def gpu_capabilities(memory_mb: int = 8_188) -> DeviceCapabilities:
    return DeviceCapabilities(
        cuda_available=True,
        gpu_name="NVIDIA GeForce RTX 4060",
        total_memory_mb=memory_mb,
        compute_types=frozenset({"float16", "int8", "float32"}),
    )


def make_job() -> TranscriptionJob:
    return TranscriptionJob(Path("лекция.ogg"), "small", device_preference="auto")


def test_detector_reports_cuda_gpu_and_memory() -> None:
    detector = CTranslate2DeviceDetector(
        cuda_count=lambda: 1,
        compute_types=lambda _device: {"float16", "float32"},
        gpu_details=lambda: ("NVIDIA GeForce RTX 4060", 8_188),
    )

    capabilities = detector.detect()

    assert capabilities.cuda_available is True
    assert capabilities.gpu_name == "NVIDIA GeForce RTX 4060"
    assert capabilities.total_memory_mb == 8_188
    assert capabilities.compute_types == frozenset({"float16", "float32"})


def test_detector_handles_missing_cuda() -> None:
    capabilities = CTranslate2DeviceDetector(
        cuda_count=lambda: 0,
        compute_types=lambda _device: set(),
        gpu_details=lambda: (None, None),
    ).detect()

    assert capabilities.cuda_available is False
    assert "не обнаружена" in (capabilities.unavailable_reason or "")


def test_packaged_cpu_runtime_does_not_offer_cuda_without_accelerator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("VOXNOTE_PACKAGED_RUNTIME", "1")
    monkeypatch.setenv("VOXNOTE_NVIDIA_ACCELERATOR_AVAILABLE", "0")
    detector_was_called = False

    def cuda_count() -> int:
        nonlocal detector_was_called
        detector_was_called = True
        return 1

    capabilities = CTranslate2DeviceDetector(
        cuda_count=cuda_count,
        compute_types=lambda _device: {"float16"},
        gpu_details=lambda: ("NVIDIA GeForce RTX 4060", 8_188),
    ).detect()

    assert capabilities.cuda_available is False
    assert capabilities.unavailable_reason == "пакет ускорения NVIDIA не установлен"
    assert detector_was_called is False


def test_packaged_nvidia_runtime_detects_cuda_when_accelerator_is_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("VOXNOTE_PACKAGED_RUNTIME", "1")
    monkeypatch.setenv("VOXNOTE_NVIDIA_ACCELERATOR_AVAILABLE", "1")

    capabilities = CTranslate2DeviceDetector(
        cuda_count=lambda: 1,
        compute_types=lambda _device: {"float16"},
        gpu_details=lambda: ("NVIDIA GeForce RTX 4060", 8_188),
    ).detect()

    assert capabilities.cuda_available is True


def test_selector_prefers_float16_and_warns_about_low_vram() -> None:
    selection = DeviceSelector(gpu_capabilities(memory_mb=4_096)).select("auto", "large-v3")

    assert selection.device == "cuda"
    assert selection.compute_type == "float16"
    assert selection.label == "NVIDIA GeForce RTX 4060"
    assert "VRAM" in selection.notice


def test_explicit_cuda_rejects_unavailable_device() -> None:
    selector = DeviceSelector(
        DeviceCapabilities(cuda_available=False, unavailable_reason="нет CUDA runtime")
    )

    with pytest.raises(DeviceUnavailableError, match="нет CUDA runtime"):
        selector.select("cuda", "small")


def test_auto_falls_back_to_cpu_only_during_initialization() -> None:
    calls: list[tuple[str, str]] = []

    def builder(_path: Path, device: str, compute_type: str) -> FakePreparedService:
        calls.append((device, compute_type))
        error = RuntimeError("CUDA initialization failed") if device == "cuda" else None
        return FakePreparedService(device, prepare_error=error)

    service = DeviceRoutingTranscriptionService(
        Path("small"), "auto", DeviceSelector(gpu_capabilities()), builder
    )

    assert service.prepare(CancellationToken()) is True
    result = service.transcribe(make_job(), CancellationToken(), lambda _snapshot: None)

    assert calls == [("cuda", "float16"), ("cpu", "int8")]
    assert service.device_name == "cpu"
    assert service.device_label == "CPU"
    assert "используем CPU" in service.device_notice
    assert result.device == "cpu"


def test_explicit_cuda_does_not_fallback_after_initialization_error() -> None:
    calls: list[str] = []

    def builder(_path: Path, device: str, _compute_type: str) -> FakePreparedService:
        calls.append(device)
        return FakePreparedService(device, prepare_error=RuntimeError("out of memory"))

    service = DeviceRoutingTranscriptionService(
        Path("large-v3"), "cuda", DeviceSelector(gpu_capabilities()), builder
    )

    with pytest.raises(DeviceUnavailableError, match="видеопамяти"):
        service.prepare(CancellationToken())
    assert calls == ["cuda"]


def test_missing_cuda_library_has_actionable_message() -> None:
    def builder(_path: Path, device: str, _compute_type: str) -> FakePreparedService:
        return FakePreparedService(
            device,
            prepare_error=RuntimeError("Library cublas64_12.dll is not found or cannot be loaded"),
        )

    service = DeviceRoutingTranscriptionService(
        Path("small"), "cuda", DeviceSelector(gpu_capabilities()), builder
    )

    with pytest.raises(DeviceUnavailableError, match="cuBLAS и cuDNN"):
        service.prepare(CancellationToken())


def test_cuda_runtime_error_never_restarts_job_on_cpu() -> None:
    calls: list[str] = []

    def builder(_path: Path, device: str, _compute_type: str) -> FakePreparedService:
        calls.append(device)
        return FakePreparedService(device, transcribe_error=RuntimeError("CUDA device lost"))

    service = DeviceRoutingTranscriptionService(
        Path("small"), "auto", DeviceSelector(gpu_capabilities()), builder
    )
    assert service.prepare(CancellationToken()) is True

    with pytest.raises(DeviceExecutionError, match="не было перезапущено"):
        service.transcribe(make_job(), CancellationToken(), lambda _snapshot: None)
    assert calls == ["cuda"]


def test_non_cuda_runtime_error_keeps_its_original_type() -> None:
    def builder(_path: Path, device: str, _compute_type: str) -> FakePreparedService:
        return FakePreparedService(device, transcribe_error=RuntimeError("invalid audio file"))

    service = DeviceRoutingTranscriptionService(
        Path("small"), "cuda", DeviceSelector(gpu_capabilities()), builder
    )
    assert service.prepare(CancellationToken()) is True

    with pytest.raises(RuntimeError, match="invalid audio file"):
        service.transcribe(make_job(), CancellationToken(), lambda _snapshot: None)
