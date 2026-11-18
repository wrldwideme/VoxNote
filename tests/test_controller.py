from pathlib import Path

import pytest

from voxnote.application.controller import ApplicationController
from voxnote.domain.state import AppState
from voxnote.services.settings import SettingsStore


def make_controller(tmp_path: Path) -> ApplicationController:
    return ApplicationController(SettingsStore(tmp_path / "settings.json"))


def test_startup_without_model_enters_onboarding(tmp_path: Path) -> None:
    controller = make_controller(tmp_path)
    controller.finish_startup(model_available=False)

    assert controller.state_machine.state is AppState.ONBOARDING
    controller.shutdown()


def test_startup_with_model_enters_idle(tmp_path: Path) -> None:
    controller = make_controller(tmp_path)
    controller.finish_startup(model_available=True)

    assert controller.state_machine.state is AppState.IDLE
    controller.shutdown()


def test_file_selection_and_clear(tmp_path: Path) -> None:
    controller = make_controller(tmp_path)
    controller.finish_startup(model_available=True)
    source = tmp_path / "лекция.m4a"

    controller.select_file(source)
    assert controller.selected_file == source
    assert controller.state_machine.state is AppState.FILE_SELECTED

    controller.clear_file()
    assert controller.selected_file is None
    assert controller.state_machine.state is AppState.IDLE
    controller.shutdown()


def test_file_selection_is_rejected_during_transcription(tmp_path: Path) -> None:
    controller = make_controller(tmp_path)
    controller.state_machine = controller.state_machine.__class__(AppState.TRANSCRIBING)

    with pytest.raises(RuntimeError, match="cannot be selected"):
        controller.select_file(tmp_path / "other.ogg")

    controller.shutdown()


def test_settings_update_is_persisted(tmp_path: Path) -> None:
    controller = make_controller(tmp_path)

    updated = controller.update_settings(theme="dark", reduce_motion=True)

    assert updated.theme == "dark"
    assert updated.reduce_motion is True
    assert controller.settings_store.load() == updated
    controller.shutdown()


def test_unknown_setting_is_rejected(tmp_path: Path) -> None:
    controller = make_controller(tmp_path)

    with pytest.raises(ValueError, match="Unknown setting"):
        controller.update_settings(cloud_mode=True)

    controller.shutdown()
