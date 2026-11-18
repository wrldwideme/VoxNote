from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

Theme = Literal["system", "light", "dark"]
DevicePreference = Literal["auto", "cuda", "cpu"]


@dataclass(frozen=True, slots=True)
class AppSettings:
    theme: Theme = "system"
    reduce_motion: bool = False
    selected_model: str = "turbo"
    selected_dictionary: str | None = None
    device_preference: DevicePreference = "auto"
    custom_models_dir: str | None = None

    @classmethod
    def from_mapping(cls, raw: dict[str, Any]) -> AppSettings:
        theme = raw.get("theme", "system")
        device = raw.get("device_preference", "auto")
        if theme not in {"system", "light", "dark"}:
            theme = "system"
        if device not in {"auto", "cuda", "cpu"}:
            device = "auto"

        model = raw.get("selected_model", "turbo")
        dictionary = raw.get("selected_dictionary")
        custom_dir = raw.get("custom_models_dir")
        return cls(
            theme=theme,
            reduce_motion=bool(raw.get("reduce_motion", False)),
            selected_model=model if isinstance(model, str) else "turbo",
            selected_dictionary=dictionary if isinstance(dictionary, str) else None,
            device_preference=device,
            custom_models_dir=str(custom_dir) if custom_dir else None,
        )


class SettingsStore:
    def __init__(self, path: Path) -> None:
        self._path = path

    def load(self) -> AppSettings:
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            return AppSettings()
        if not isinstance(raw, dict):
            return AppSettings()
        return AppSettings.from_mapping(raw)

    def save(self, settings: AppSettings) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._path.with_suffix(f"{self._path.suffix}.tmp")
        payload = json.dumps(asdict(settings), ensure_ascii=False, indent=2) + "\n"
        temporary.write_text(payload, encoding="utf-8")
        temporary.replace(self._path)
