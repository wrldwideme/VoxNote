from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from voxnote.application.background import BackgroundTaskRunner
from voxnote.domain.state import AppState, AppStateMachine
from voxnote.services.settings import AppSettings, SettingsStore


class ApplicationController:
    """Coordinate application state without depending on QML or inference code."""

    def __init__(
        self,
        settings_store: SettingsStore,
        task_runner: BackgroundTaskRunner | None = None,
    ) -> None:
        self.state_machine = AppStateMachine()
        self.settings_store = settings_store
        self.settings = settings_store.load()
        self.task_runner = task_runner or BackgroundTaskRunner(max_workers=1)
        self.selected_file: Path | None = None

    def finish_startup(self, *, model_available: bool) -> None:
        target = AppState.IDLE if model_available else AppState.ONBOARDING
        self.state_machine.transition(target)

    def finish_onboarding(self, *, model_available: bool) -> None:
        target = AppState.IDLE if model_available else AppState.MODEL_REQUIRED
        self.state_machine.transition(target)

    def select_file(self, path: Path) -> None:
        if self.state_machine.state not in {
            AppState.IDLE,
            AppState.FILE_SELECTED,
            AppState.COMPLETED,
            AppState.CANCELLED,
            AppState.ERROR,
        }:
            raise RuntimeError("A file cannot be selected in the current application state")
        self.selected_file = path
        self.state_machine.transition(AppState.FILE_SELECTED)

    def clear_file(self) -> None:
        self.selected_file = None
        if self.state_machine.state is not AppState.IDLE:
            self.state_machine.transition(AppState.IDLE)

    def update_settings(self, **changes: object) -> AppSettings:
        allowed = set(AppSettings.__dataclass_fields__)
        unknown = set(changes) - allowed
        if unknown:
            names = ", ".join(sorted(unknown))
            raise ValueError(f"Unknown setting fields: {names}")
        values = asdict(self.settings)
        values.update(changes)
        updated = AppSettings.from_mapping(values)
        self.settings_store.save(updated)
        self.settings = updated
        return updated

    def shutdown(self) -> None:
        self.task_runner.shutdown()
