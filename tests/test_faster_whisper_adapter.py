from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from voxnote.application.background import CancellationToken
from voxnote.domain.models import ProgressSnapshot, TranscriptionJob
from voxnote.infrastructure.faster_whisper_adapter import FasterWhisperTranscriptionService


@dataclass
class FakeSegment:
    start: float
    end: float
    text: str


@dataclass
class FakeInfo:
    duration: float


class FakeModel:
    def __init__(self, segments: list[FakeSegment]) -> None:
        self.segments = segments
        self.calls: list[dict[str, object]] = []

    def transcribe(
        self, audio: str | np.ndarray[Any, Any], **options: object
    ) -> tuple[Iterator[FakeSegment], FakeInfo]:
        self.calls.append({"audio": audio, **options})
        return iter(self.segments), FakeInfo(duration=20.0)


def make_job() -> TranscriptionJob:
    return TranscriptionJob(source_path=Path("лекция.ogg"), model_id="small")


def test_adapter_forces_russian_and_reports_real_progress() -> None:
    model = FakeModel(
        [
            FakeSegment(0.0, 5.0, " Первый фрагмент."),
            FakeSegment(5.0, 12.0, " Второй фрагмент."),
        ]
    )
    snapshots: list[ProgressSnapshot] = []
    service = FasterWhisperTranscriptionService(lambda: model, device_name="cpu")

    result = service.transcribe(make_job(), CancellationToken(), snapshots.append)

    assert result.text == "Первый фрагмент. Второй фрагмент."
    assert result.incomplete is False
    assert [snapshot.percent for snapshot in snapshots] == [25.0, 60.0]
    assert model.calls == [
        {
            "audio": "лекция.ogg",
            "language": "ru",
            "task": "transcribe",
            "beam_size": 5,
            "vad_filter": True,
        }
    ]


def test_adapter_returns_partial_text_after_cancellation() -> None:
    token = CancellationToken()
    model = FakeModel(
        [
            FakeSegment(0.0, 5.0, " Сохранить это."),
            FakeSegment(5.0, 10.0, " Ignore this."),
        ]
    )
    service = FasterWhisperTranscriptionService(lambda: model, device_name="cpu")

    def cancel_after_first(_snapshot: ProgressSnapshot) -> None:
        token.cancel()

    result = service.transcribe(make_job(), token, cancel_after_first)

    assert result.text == "Сохранить это."
    assert result.incomplete is True


def test_pre_cancelled_job_does_not_load_model() -> None:
    loaded = False

    def factory() -> FakeModel:
        nonlocal loaded
        loaded = True
        return FakeModel([])

    token = CancellationToken()
    token.cancel()
    service = FasterWhisperTranscriptionService(factory, device_name="cpu")

    result = service.transcribe(make_job(), token, lambda _snapshot: None)

    assert loaded is False
    assert result.incomplete is True
    assert result.text == ""


def test_cuda_prepare_runs_short_inference_warmup() -> None:
    model = FakeModel([])
    service = FasterWhisperTranscriptionService(
        lambda: model,
        device_name="cuda",
        warmup=True,
    )

    assert service.prepare(CancellationToken()) is True

    assert len(model.calls) == 1
    call = model.calls[0]
    assert isinstance(call["audio"], np.ndarray)
    assert call["audio"].shape == (16_000,)
    assert call["beam_size"] == 1
    assert call["vad_filter"] is False


def test_adapter_passes_dictionary_hints() -> None:
    class FakeDictionaryManager:
        def build_hints(self, dictionary_id: str | None) -> list[str]:
            if dictionary_id == "medical-ru":
                return ["ацетилхолин", "электрокардиография"]
            return []

    model = FakeModel([FakeSegment(0.0, 5.0, "ЭКГ в норме.")])
    service = FasterWhisperTranscriptionService(
        lambda: model,
        device_name="cpu",
        dictionary_manager=FakeDictionaryManager(),
    )
    job = TranscriptionJob(
        source_path=Path("лекция.ogg"),
        model_id="small",
        dictionary_id="medical-ru",
    )

    result = service.transcribe(job, CancellationToken(), lambda _: None)

    assert result.text == "ЭКГ в норме."
    assert result.dictionary_id == "medical-ru"
    assert len(model.calls) == 1
    call = model.calls[0]
    assert call["language"] == "ru"
    assert "ацетилхолин" in str(call.get("initial_prompt"))
    assert "электрокардиография" in str(call.get("initial_prompt"))
    assert "hotwords" not in call
