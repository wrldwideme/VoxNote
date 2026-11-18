from __future__ import annotations

import json
import platform
import re
from datetime import UTC, datetime
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Final

_SAFE_TOKEN: Final = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")
_ALLOWED_FIELDS: Final = frozenset(
    {
        "cuda_available",
        "device",
        "dictionary_id",
        "duration_seconds",
        "elapsed_ms",
        "error_type",
        "model_id",
        "result",
    }
)


class TechnicalDiagnostics:
    """Write a minimal local event journal and build a privacy-safe report."""

    def __init__(self, log_file: Path, *, max_bytes: int = 512 * 1024) -> None:
        self._log_file = log_file
        self._max_bytes = max(1024, max_bytes)

    def record(self, event: str, **fields: object) -> None:
        """Record an event without accepting free-form user content."""
        if not _SAFE_TOKEN.fullmatch(event):
            raise ValueError("Diagnostic event must be a fixed technical token")
        unknown = fields.keys() - _ALLOWED_FIELDS
        if unknown:
            raise ValueError(f"Unsupported diagnostic fields: {', '.join(sorted(unknown))}")

        payload: dict[str, object] = {
            "timestamp_utc": datetime.now(UTC).isoformat(timespec="seconds"),
            "event": event,
        }
        payload.update({key: self._safe_value(value) for key, value in fields.items()})
        line = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"

        try:
            self._log_file.parent.mkdir(parents=True, exist_ok=True)
            self._rotate_if_needed(len(line.encode("utf-8")))
            with self._log_file.open("a", encoding="utf-8", newline="") as stream:
                stream.write(line)
        except OSError:
            # Diagnostics must never prevent transcription or export.
            return

    def build_report(
        self,
        *,
        app_version: str,
        selected_model: str,
        device_preference: str,
        selected_dictionary: str,
        theme: str,
        reduce_motion: bool,
        cuda_available: bool,
    ) -> str:
        """Return a copyable report that deliberately excludes paths and user content."""
        values = {
            "VoxNote": app_version,
            "Windows": f"{platform.release()} ({platform.machine()})",
            "Python": platform.python_version(),
            "PySide6": self._package_version("PySide6"),
            "faster-whisper": self._package_version("faster-whisper"),
            "CTranslate2": self._package_version("ctranslate2"),
            "Модель": self._safe_report_token(selected_model),
            "Устройство": self._safe_report_token(device_preference),
            "CUDA доступна": "да" if cuda_available else "нет",
            "Словарь": self._safe_report_token(selected_dictionary),
            "Тема": self._safe_report_token(theme),
            "Уменьшение анимаций": "да" if reduce_motion else "нет",
            "Телеметрия": "отсутствует",
        }
        return "Диагностика VoxNote\n" + "\n".join(
            f"{label}: {value}" for label, value in values.items()
        )

    def _rotate_if_needed(self, incoming_bytes: int) -> None:
        if not self._log_file.exists():
            return
        try:
            current_size = self._log_file.stat().st_size
        except OSError:
            return
        if current_size + incoming_bytes <= self._max_bytes:
            return
        backup = self._log_file.with_suffix(f"{self._log_file.suffix}.1")
        backup.unlink(missing_ok=True)
        self._log_file.replace(backup)

    @staticmethod
    def _safe_value(value: object) -> object:
        if value is None or isinstance(value, (bool, int, float)):
            return value
        if isinstance(value, str) and _SAFE_TOKEN.fullmatch(value):
            return value
        return "redacted"

    @staticmethod
    def _safe_report_token(value: str) -> str:
        return value if _SAFE_TOKEN.fullmatch(value) else "скрыто"

    @staticmethod
    def _package_version(package: str) -> str:
        try:
            return version(package)
        except PackageNotFoundError:
            return "не установлено"
