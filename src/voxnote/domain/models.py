from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class AudioMetadata:
    duration_seconds: float
    sample_rate: int
    channels: int
    codec: str
    waveform: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class DeviceCapabilities:
    cuda_available: bool
    gpu_name: str | None = None
    total_memory_mb: int | None = None
    compute_types: frozenset[str] = frozenset()
    unavailable_reason: str | None = None

    @property
    def gpu_label(self) -> str:
        return self.gpu_name or "NVIDIA GPU"


@dataclass(frozen=True, slots=True)
class DeviceSelection:
    device: str
    compute_type: str
    label: str
    notice: str = ""


@dataclass(frozen=True, slots=True)
class DictionaryDescriptor:
    id: str
    name: str
    description: str
    term_count: int
    available: bool = True
    source: str = ""


@dataclass(frozen=True, slots=True)
class DictionaryProfile:
    id: str
    name: str
    description: str
    terms: tuple[str, ...]
    source: str = ""
    version: int = 1

    @property
    def term_count(self) -> int:
        return len(self.terms)


@dataclass(frozen=True, slots=True)
class TranscriptionJob:
    source_path: Path
    model_id: str
    dictionary_id: str | None = None
    device_preference: str = "auto"


@dataclass(frozen=True, slots=True)
class ProgressSnapshot:
    processed_seconds: float
    total_seconds: float | None
    elapsed_seconds: float
    eta_seconds: float | None = None

    @property
    def percent(self) -> float | None:
        if self.total_seconds is None or self.total_seconds <= 0:
            return None
        value = self.processed_seconds / self.total_seconds * 100
        return max(0.0, min(value, 100.0))

    @property
    def remaining_percent(self) -> float | None:
        percent = self.percent
        return None if percent is None else 100.0 - percent


@dataclass(frozen=True, slots=True)
class TranscriptSegment:
    start: float
    end: float
    text: str

    @property
    def start_formatted(self) -> str:
        total = max(0, round(self.start))
        hours, remainder = divmod(total, 3600)
        minutes, seconds = divmod(remainder, 60)
        if hours:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        return f"{minutes:02d}:{seconds:02d}"


@dataclass(frozen=True, slots=True)
class TranscriptionResult:
    text: str
    model_id: str
    device: str
    dictionary_id: str | None = None
    incomplete: bool = False
    segments: tuple[TranscriptSegment, ...] = ()


@dataclass(frozen=True, slots=True)
class HistoryEntry:
    id: str
    created_at: str
    file_name: str
    duration_seconds: float | None
    model_id: str
    device: str
    dictionary_id: str | None
    text: str
    preview: str
    title: str = ""
    edited_text: str | None = None
    segments: tuple[TranscriptSegment, ...] = ()

    @property
    def display_title(self) -> str:
        trimmed = self.title.strip() if self.title else ""
        return trimmed or self.file_name

    @property
    def current_text(self) -> str:
        return self.edited_text if self.edited_text is not None else self.text

    @property
    def has_edits(self) -> bool:
        return self.edited_text is not None and self.edited_text != self.text

    @property
    def duration_formatted(self) -> str:
        if self.duration_seconds is None or self.duration_seconds <= 0:
            return "—"
        total = max(0, round(self.duration_seconds))
        hours, remainder = divmod(total, 3600)
        minutes, seconds = divmod(remainder, 60)
        if hours:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        return f"{minutes}:{seconds:02d}"
