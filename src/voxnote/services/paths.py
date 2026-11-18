from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class AppPaths:
    root: Path

    @classmethod
    def from_environment(cls, environment: Mapping[str, str] | None = None) -> AppPaths:
        values = os.environ if environment is None else environment
        local_app_data = values.get("LOCALAPPDATA")
        if local_app_data:
            return cls(Path(local_app_data) / "VoxNote")
        return cls(Path.home() / "AppData" / "Local" / "VoxNote")

    @property
    def settings_file(self) -> Path:
        return self.root / "settings.json"

    @property
    def models_dir(self) -> Path:
        return self.root / "models"

    @property
    def dictionaries_dir(self) -> Path:
        return self.root / "dictionaries"

    @property
    def history_file(self) -> Path:
        return self.root / "history.json"

    @property
    def logs_dir(self) -> Path:
        return self.root / "logs"
