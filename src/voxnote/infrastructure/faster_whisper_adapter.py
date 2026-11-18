from __future__ import annotations

from collections.abc import Callable, Iterable
from importlib import import_module
from pathlib import Path
from time import perf_counter
from typing import Any, Protocol, cast

import numpy as np

from voxnote.application.background import CancellationToken
from voxnote.application.ports import DictionaryManager, ProgressCallback
from voxnote.domain.models import (
    ProgressSnapshot,
    TranscriptionJob,
    TranscriptionResult,
    TranscriptSegment,
)


class SegmentLike(Protocol):
    start: float
    end: float
    text: str


class TranscriptionInfoLike(Protocol):
    duration: float


class WhisperModelLike(Protocol):
    def transcribe(
        self,
        audio: str | np.ndarray[Any, Any],
        *,
        language: str,
        task: str,
        beam_size: int,
        vad_filter: bool,
        initial_prompt: str | None = None,
        hotwords: str | None = None,
    ) -> tuple[Iterable[SegmentLike], TranscriptionInfoLike]: ...


ModelFactory = Callable[[], WhisperModelLike]


class FasterWhisperTranscriptionService:
    """Translate the faster-whisper API into the VoxNote domain contract."""

    def __init__(
        self,
        model_factory: ModelFactory,
        *,
        device_name: str,
        warmup: bool = False,
        dictionary_manager: DictionaryManager | None = None,
    ) -> None:
        self._model_factory = model_factory
        self._device_name = device_name
        self._warmup = warmup
        self._warmed_up = False
        self._model: WhisperModelLike | None = None
        self._dictionary_manager = dictionary_manager

    @classmethod
    def from_model_path(
        cls,
        model_path: Path,
        *,
        device: str = "cpu",
        compute_type: str = "int8",
        dictionary_manager: DictionaryManager | None = None,
    ) -> FasterWhisperTranscriptionService:
        def factory() -> WhisperModelLike:
            faster_whisper = import_module("faster_whisper")
            model = faster_whisper.WhisperModel(
                str(model_path),
                device=device,
                compute_type=compute_type,
                local_files_only=True,
            )
            return cast(WhisperModelLike, model)

        return cls(
            factory,
            device_name=device,
            warmup=device == "cuda",
            dictionary_manager=dictionary_manager,
        )

    def _get_model(self) -> WhisperModelLike:
        if self._model is None:
            self._model = self._model_factory()
        return self._model

    def prepare(self, cancellation: CancellationToken) -> bool:
        """Load the model once and report whether work may continue."""
        if cancellation.is_cancelled:
            return False
        model = self._get_model()
        if self._warmup and not self._warmed_up:
            segments, _info = model.transcribe(
                np.zeros(16_000, dtype=np.float32),
                language="ru",
                task="transcribe",
                beam_size=1,
                vad_filter=False,
            )
            next(iter(segments), None)
            self._warmed_up = True
        return not cancellation.is_cancelled

    def transcribe(
        self,
        job: TranscriptionJob,
        cancellation: CancellationToken,
        on_progress: ProgressCallback,
    ) -> TranscriptionResult:
        started_at = perf_counter()
        if cancellation.is_cancelled:
            return self._result(job, text="", incomplete=True)

        model = self._get_model()
        if cancellation.is_cancelled:
            return self._result(job, text="", incomplete=True)

        hints = (
            self._dictionary_manager.build_hints(job.dictionary_id)
            if self._dictionary_manager is not None and job.dictionary_id
            else ()
        )
        transcribe_kwargs: dict[str, Any] = {
            "language": "ru",
            "task": "transcribe",
            "beam_size": 5,
            "vad_filter": True,
        }
        if hints:
            prompt_terms = ", ".join(hints[:30])
            transcribe_kwargs["initial_prompt"] = f"Контекст и термины: {prompt_terms}."

        segments, info = model.transcribe(
            str(job.source_path),
            **transcribe_kwargs,
        )

        parts: list[str] = []
        transcript_segments: list[TranscriptSegment] = []
        for segment in segments:
            if cancellation.is_cancelled:
                return self._result(
                    job,
                    text=" ".join(parts),
                    incomplete=True,
                    segments=tuple(transcript_segments),
                )

            text = segment.text.strip()
            if text:
                parts.append(text)
                transcript_segments.append(
                    TranscriptSegment(
                        start=float(segment.start),
                        end=float(segment.end),
                        text=text,
                    )
                )
            on_progress(
                ProgressSnapshot(
                    processed_seconds=max(0.0, segment.end),
                    total_seconds=info.duration if info.duration > 0 else None,
                    elapsed_seconds=perf_counter() - started_at,
                )
            )

        return self._result(
            job,
            text=" ".join(parts),
            incomplete=False,
            segments=tuple(transcript_segments),
        )

    def _result(
        self,
        job: TranscriptionJob,
        *,
        text: str,
        incomplete: bool,
        segments: tuple[TranscriptSegment, ...] = (),
    ) -> TranscriptionResult:
        return TranscriptionResult(
            text=text,
            model_id=job.model_id,
            device=self._device_name,
            dictionary_id=job.dictionary_id,
            incomplete=incomplete,
            segments=segments,
        )
