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
    duration_after_vad: float = 20.0


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
    assert [segment.text for segment in snapshots[0].partial_segments] == ["Первый фрагмент."]
    assert [segment.text for segment in snapshots[1].partial_segments] == [
        "Первый фрагмент.",
        "Второй фрагмент.",
    ]
    assert model.calls == [
        {
            "audio": "лекция.ogg",
            "language": "ru",
            "task": "transcribe",
            "beam_size": 1,
            "vad_filter": True,
            "condition_on_previous_text": False,
            "max_new_tokens": 320,
        }
    ]


def test_adapter_retains_beam_search_for_accuracy_profiles() -> None:
    model = FakeModel([])
    service = FasterWhisperTranscriptionService(lambda: model, device_name="cuda")
    job = TranscriptionJob(source_path=Path("лекция.ogg"), model_id="large-v3")

    service.transcribe(job, CancellationToken(), lambda _snapshot: None)

    assert model.calls[0]["beam_size"] == 5


def test_adapter_resumes_from_saved_audio_position() -> None:
    model = FakeModel([FakeSegment(120.0, 125.0, "Продолжение.")])
    service = FasterWhisperTranscriptionService(lambda: model, device_name="cuda")
    job = TranscriptionJob(
        source_path=Path("лекция.ogg"),
        model_id="small",
        resume_from_seconds=120.0,
    )

    result = service.transcribe(job, CancellationToken(), lambda _snapshot: None)

    assert model.calls[0]["clip_timestamps"] == "120.000"
    assert result.segments[0].start == 120.0


def test_adapter_finishes_without_iterating_when_vad_removes_all_audio() -> None:
    class UnexpectedSegments:
        def __iter__(self) -> UnexpectedSegments:
            return self

        def __next__(self) -> FakeSegment:
            raise AssertionError("Empty VAD output must not enter Whisper generation")

    class SilentModel:
        def transcribe(
            self, audio: str | np.ndarray[Any, Any], **options: object
        ) -> tuple[UnexpectedSegments, FakeInfo]:
            del audio, options
            return UnexpectedSegments(), FakeInfo(duration=1.0, duration_after_vad=0.0)

    snapshots: list[ProgressSnapshot] = []
    service = FasterWhisperTranscriptionService(SilentModel, device_name="cpu")

    result = service.transcribe(make_job(), CancellationToken(), snapshots.append)

    assert result.text == ""
    assert result.incomplete is False
    assert result.segments == ()
    assert snapshots == []


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


def test_cuda_prepare_loads_model_without_synthetic_inference() -> None:
    model = FakeModel([])
    loads = 0

    def factory() -> FakeModel:
        nonlocal loads
        loads += 1
        return model

    service = FasterWhisperTranscriptionService(
        factory,
        device_name="cuda",
    )

    assert service.prepare(CancellationToken()) is True
    assert loads == 1
    assert model.calls == []


def test_adapter_passes_dictionary_hints() -> None:
    class FakeDictionaryManager:
        def build_hints(self, dictionary_id: str | None) -> list[str]:
            if dictionary_id == "medical-ru":
                return [f"термин-{index}" for index in range(40)]
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
    assert "initial_prompt" not in call
    assert "термин-0" in str(call.get("hotwords"))
    assert "термин-39" in str(call.get("hotwords"))
    assert call["max_new_tokens"] == 200
