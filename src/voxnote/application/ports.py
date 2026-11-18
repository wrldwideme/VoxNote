from __future__ import annotations

from collections.abc import Callable, Sequence
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from voxnote.services.settings import DevicePreference

from voxnote.application.background import CancellationToken
from voxnote.domain.models import (
    AudioMetadata,
    ProgressSnapshot,
    TranscriptionJob,
    TranscriptionResult,
)


class AudioService(Protocol):
    def inspect(self, path: Path, cancellation: CancellationToken) -> AudioMetadata | None: ...


class ModelManager(Protocol):
    def is_installed(self, model_id: str) -> bool: ...

    def installed_models(self) -> Sequence[str]: ...


class DictionaryManager(Protocol):
    def build_hints(self, dictionary_id: str | None) -> Sequence[str]: ...


ProgressCallback = Callable[[ProgressSnapshot], None]


class TranscriptionService(Protocol):
    def transcribe(
        self,
        job: TranscriptionJob,
        cancellation: CancellationToken,
        on_progress: ProgressCallback,
    ) -> TranscriptionResult: ...


class PreparedTranscriptionService(TranscriptionService, Protocol):
    def prepare(self, cancellation: CancellationToken) -> bool: ...


ServiceFactory = Callable[[Path, "DevicePreference"], PreparedTranscriptionService]
