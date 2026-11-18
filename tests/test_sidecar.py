# ruff: noqa: RUF001
from __future__ import annotations

import io
import json
from contextlib import suppress
from pathlib import Path
from typing import Any

import pytest

from voxnote import __version__
from voxnote.application.background import CancellationToken
from voxnote.application.controller import ApplicationController
from voxnote.domain.models import (
    AudioMetadata,
    ProgressSnapshot,
    TranscriptionJob,
    TranscriptionResult,
    TranscriptSegment,
)
from voxnote.services.device import DeviceError
from voxnote.services.dictionary import LocalDictionaryManager
from voxnote.services.history import LocalHistoryStore
from voxnote.services.model_manager import LocalModelManager, ModelDescriptor
from voxnote.services.settings import SettingsStore
from voxnote.sidecar.protocol import (
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    format_error,
    format_notification,
    format_response,
    parse_message,
)
from voxnote.sidecar.server import SidecarServer
from voxnote.sidecar.service import SidecarService, SidecarServiceError


class FakePreparedService:
    def __init__(
        self,
        *,
        result_text: str = "Тестовая расшифровка лекции",
        device_label: str = "CPU",
        fail: bool = False,
        fail_device: bool = False,
    ) -> None:
        self.result_text = result_text
        self.device_label = device_label
        self.fail = fail
        self.fail_device = fail_device

    def prepare(self, cancellation: CancellationToken) -> bool:
        return not cancellation.is_cancelled

    def transcribe(
        self,
        job: TranscriptionJob,
        cancellation: CancellationToken,
        on_progress: Any,
    ) -> TranscriptionResult:
        if self.fail_device:
            raise DeviceError("CUDA out of memory")
        if self.fail:
            raise RuntimeError("Ошибка инференса")

        on_progress(
            ProgressSnapshot(
                processed_seconds=10.0,
                total_seconds=20.0,
                elapsed_seconds=1.0,
            )
        )
        if cancellation.is_cancelled:
            return TranscriptionResult(
                text="",
                model_id=job.model_id,
                device=self.device_label,
                incomplete=True,
            )

        on_progress(
            ProgressSnapshot(
                processed_seconds=20.0,
                total_seconds=20.0,
                elapsed_seconds=2.0,
            )
        )
        return TranscriptionResult(
            text=self.result_text,
            model_id=job.model_id,
            device=self.device_label,
            dictionary_id=job.dictionary_id,
            incomplete=False,
            segments=(
                TranscriptSegment(start=0.0, end=10.0, text="Первая часть"),
                TranscriptSegment(start=10.0, end=20.0, text="Вторая часть"),
            ),
        )


class FakeAudioService:
    def inspect(self, path: Path, cancellation: CancellationToken) -> AudioMetadata:
        return AudioMetadata(
            duration_seconds=20.0,
            sample_rate=16000,
            channels=1,
            codec="pcm_s16le",
            waveform=(0.1, 0.4, 0.9, 0.2),
        )


@pytest.fixture
def temp_environment(tmp_path: Path) -> dict[str, Any]:
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    small_dir = models_dir / "small"
    small_dir.mkdir()
    (small_dir / "model.bin").write_bytes(b"dummy")
    manifest = {
        "model_id": "small",
        "revision": "main",
        "model_sha256": "fake_hash",
        "model_size": 5,
    }
    (small_dir / "voxnote-model.json").write_text(json.dumps(manifest), encoding="utf-8")

    dict_dir = tmp_path / "dictionaries"
    dict_dir.mkdir()

    history_file = tmp_path / "history.json"
    audio_file = tmp_path / "sample.wav"
    audio_file.write_bytes(b"RIFFdummydataWAVE")

    catalog = (
        ModelDescriptor(
            model_id="small",
            display_name="Быстрая",
            summary="Компактная",
            advertised_bytes=500_000_000,
            repository="test/small",
            revision="main",
            files=("model.bin",),
            model_sha256="fake_hash",
            recommended=False,
        ),
    )

    settings = SettingsStore(tmp_path / "settings.json")
    controller = ApplicationController(settings)
    model_manager = LocalModelManager(models_dir, catalog=catalog)
    dict_manager = LocalDictionaryManager(dict_dir)
    history_store = LocalHistoryStore(history_file)
    audio_service = FakeAudioService()

    return {
        "controller": controller,
        "model_dir": small_dir,
        "model_manager": model_manager,
        "dict_manager": dict_manager,
        "history_store": history_store,
        "audio_service": audio_service,
        "audio_file": audio_file,
    }


def test_protocol_parsing_valid() -> None:
    req = parse_message('{"jsonrpc": "2.0", "id": 1, "method": "ping", "params": {}}')
    assert req.id == 1
    assert req.method == "ping"
    assert req.params == {}

    req_str_id = parse_message('{"jsonrpc": "2.0", "id": "abc", "method": "test"}')
    assert req_str_id.id == "abc"
    assert req_str_id.params == {}


def test_protocol_parsing_errors() -> None:
    with pytest.raises(ValueError, match="Empty request line"):
        parse_message("")

    with pytest.raises(ValueError, match="JSON parse error"):
        parse_message("{invalid json}")

    with pytest.raises(ValueError, match="JSON-RPC message must be an object"):
        parse_message("[]")

    with pytest.raises(ValueError, match=r"Only JSON-RPC 2\.0 is supported"):
        parse_message('{"jsonrpc": "1.0", "id": 1, "method": "ping"}')

    with pytest.raises(ValueError, match="Request must contain a non-empty string method"):
        parse_message('{"jsonrpc": "2.0", "id": 1}')

    with pytest.raises(ValueError, match="Request must contain an id"):
        parse_message('{"jsonrpc": "2.0", "method": "ping"}')


def test_protocol_formatting() -> None:
    res = format_response(1, {"status": "ok"})
    data = json.loads(res)
    assert data["jsonrpc"] == "2.0"
    assert data["id"] == 1
    assert data["result"] == {"status": "ok"}

    err = format_error(2, PARSE_ERROR, "Parse error")
    err_data = json.loads(err)
    assert err_data["error"]["code"] == PARSE_ERROR
    assert err_data["error"]["message"] == "Parse error"

    notif = format_notification("progress", {"percent": 50})
    notif_data = json.loads(notif)
    assert notif_data["method"] == "progress"
    assert notif_data["params"] == {"percent": 50}
    assert "id" not in notif_data


def test_sidecar_ping_and_system_info(temp_environment: dict[str, Any]) -> None:
    events: list[tuple[str, dict[str, Any]]] = []
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        model_manager=temp_environment["model_manager"],
        dictionary_manager=temp_environment["dict_manager"],
        history_store=temp_environment["history_store"],
        audio_service=temp_environment["audio_service"],
        event_sink=lambda m, p: events.append((m, p)),
    )

    ping_res = service.ping()
    assert ping_res["status"] == "pong"
    assert ping_res["version"] == __version__

    info = service.get_system_info()
    assert info["version"] == __version__
    assert "device_capabilities" in info
    assert info["installed_models"] == ["small"]
    assert info["model_available"] is True


def test_sidecar_settings_management(temp_environment: dict[str, Any]) -> None:
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        model_manager=temp_environment["model_manager"],
    )

    settings = service.get_settings()
    assert settings["device_preference"] == "auto"

    updated = service.update_settings(device_preference="cpu", appearance="dark")
    assert updated["device_preference"] == "cpu"
    assert updated["appearance"] == "dark"

    with pytest.raises(SidecarServiceError) as exc_info:
        service.update_settings(device_preference="quantum")
    assert exc_info.value.code == INVALID_PARAMS


def test_sidecar_audio_inspection(temp_environment: dict[str, Any]) -> None:
    events: list[tuple[str, dict[str, Any]]] = []
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        audio_service=temp_environment["audio_service"],
        event_sink=lambda m, p: events.append((m, p)),
    )

    res = service.inspect_audio(str(temp_environment["audio_file"]))
    assert res["status"] == "inspecting"

    # Wait for background task to complete
    if service._audio_task is not None:
        service._audio_task.future.result(timeout=2.0)

    # Check that audio_inspected event was emitted
    inspected_events = [e for e in events if e[0] == "audio_inspected"]
    assert len(inspected_events) == 1
    payload = inspected_events[0][1]
    assert payload["duration_seconds"] == 20.0
    assert payload["channels"] == 1
    assert payload["waveform"] == [0.1, 0.4, 0.9, 0.2]


def test_sidecar_transcription_full_lifecycle(temp_environment: dict[str, Any]) -> None:
    events: list[tuple[str, dict[str, Any]]] = []
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        history_store=temp_environment["history_store"],
        audio_service=temp_environment["audio_service"],
        event_sink=lambda m, p: events.append((m, p)),
    )

    # Inspect audio first
    service.inspect_audio(str(temp_environment["audio_file"]))
    if service._audio_task is not None:
        service._audio_task.future.result(timeout=2.0)

    # Start transcription
    res = service.start_transcription()
    assert res["status"] == "started"

    # Wait for transcription task to complete
    assert service._transcription_task is not None
    service._transcription_task.future.result(timeout=3.0)

    # Check emitted events: state_changed, transcription_progress, transcription_completed
    completed_events = [e for e in events if e[0] == "transcription_completed"]
    assert len(completed_events) == 1
    comp_payload = completed_events[0][1]
    assert comp_payload["text"] == "Тестовая расшифровка лекции"
    assert len(comp_payload["segments"]) == 2
    assert comp_payload["segments"][0]["text"] == "Первая часть"

    # Verify history entry was created
    history = service.get_history()
    assert history["total_count"] == 1
    assert history["entries"][0]["text"] == "Тестовая расшифровка лекции"
    assert len(history["entries"][0]["segments"]) == 2


def test_sidecar_transcription_accepts_device_parameter(temp_environment: dict[str, Any]) -> None:
    events: list[tuple[str, dict[str, Any]]] = []
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        audio_service=temp_environment["audio_service"],
        event_sink=lambda m, p: events.append((m, p)),
    )
    res = service.start_transcription(
        file_path=str(temp_environment["audio_file"]),
        model_id="small",
        device="cpu",
        dictionary_id=None,
    )
    assert res["status"] == "started"
    if service._transcription_task is not None:
        service._transcription_task.future.result(timeout=3.0)
    assert len([e for e in events if e[0] == "transcription_completed"]) == 1


def test_sidecar_transcription_error_and_retry(temp_environment: dict[str, Any]) -> None:
    events: list[tuple[str, dict[str, Any]]] = []
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(fail_device=True),
        audio_service=temp_environment["audio_service"],
        event_sink=lambda m, p: events.append((m, p)),
    )

    service.inspect_audio(str(temp_environment["audio_file"]))
    if service._audio_task is not None:
        service._audio_task.future.result(timeout=2.0)

    service.start_transcription()
    assert service._transcription_task is not None
    # Wait for failure
    with pytest.raises(DeviceError):
        service._transcription_task.future.result(timeout=2.0)

    err_events = [e for e in events if e[0] == "transcription_error"]
    assert len(err_events) == 1
    assert err_events[0][1]["recoverable_on_cpu"] is True


def test_sidecar_server_stream_execution(temp_environment: dict[str, Any]) -> None:
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        history_store=temp_environment["history_store"],
    )

    input_lines = (
        '{"jsonrpc": "2.0", "id": 1, "method": "ping"}\n'
        '{"jsonrpc": "2.0", "id": 2, "method": "get_settings"}\n'
        '{"jsonrpc": "2.0", "id": 3, "method": "non_existent_method"}\n'
        '{"jsonrpc": "2.0", "id": 4, "method": "shutdown"}\n'
    )
    in_stream = io.StringIO(input_lines)
    out_stream = io.StringIO()

    server = SidecarServer(
        service,
        input_stream=in_stream,
        output_stream=out_stream,
    )
    server.run()

    output = out_stream.getvalue().strip().split("\n")
    responses = [json.loads(line) for line in output if line.strip()]

    # Ping response
    ping_resp = next(r for r in responses if r.get("id") == 1)
    assert ping_resp["result"]["status"] == "pong"

    # Get settings response
    settings_resp = next(r for r in responses if r.get("id") == 2)
    assert "device_preference" in settings_resp["result"]

    # Method not found response
    not_found_resp = next(r for r in responses if r.get("id") == 3)
    assert not_found_resp["error"]["code"] == METHOD_NOT_FOUND

    # Shutdown response
    shutdown_resp = next(r for r in responses if r.get("id") == 4)
    assert shutdown_resp["result"]["status"] == "shutdown"


def test_sidecar_history_mutations_and_export(
    temp_environment: dict[str, Any], tmp_path: Path
) -> None:
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        history_store=temp_environment["history_store"],
    )

    entry = temp_environment["history_store"].add_entry(
        file_name="test.mp3",
        duration_seconds=120.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Исходный распознанный текст",
        title="Исходный заголовок",
    )

    # Fetch entry
    fetched = service.get_history_entry(entry.id)
    assert fetched["title"] == "Исходный заголовок"
    assert fetched["current_text"] == "Исходный распознанный текст"
    assert fetched["has_edits"] is False

    # Update title and edited text
    updated = service.update_history_entry(
        entry_id=entry.id,
        title="Отредактированный заголовок",
        edited_text="Отредактированный текст лекции",
    )
    assert updated["title"] == "Отредактированный заголовок"
    assert updated["current_text"] == "Отредактированный текст лекции"
    assert updated["has_edits"] is True

    # Export text
    export_path = tmp_path / "exported.txt"
    export_res = service.export_text(entry.id, str(export_path))
    assert export_res["status"] == "exported"
    assert export_path.read_text(encoding="utf-8") == "Отредактированный текст лекции"

    # Remove entry
    remove_res = service.remove_history_entry(entry.id)
    assert remove_res["status"] == "removed"
    assert service.get_history()["total_count"] == 0


def test_sidecar_dictionary_import_and_selection(
    temp_environment: dict[str, Any], tmp_path: Path
) -> None:
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        dictionary_manager=temp_environment["dict_manager"],
    )

    dict_file = tmp_path / "custom_dict.txt"
    dict_file.write_text("миокард\nкардиомиопатия\nэндокардит\n", encoding="utf-8")

    import_res = service.import_custom_dictionary(str(dict_file))
    assert import_res["status"] == "imported"
    assert import_res["term_count"] == 3

    dicts = service.get_dictionaries()
    custom_desc = next(d for d in dicts if d["id"] == "custom")
    assert custom_desc["term_count"] == 3
    assert custom_desc["selected"] is True

    # Deselect and remove
    service.select_dictionary("none")
    assert service.get_settings()["selected_dictionary"] is None

    rem_res = service.remove_custom_dictionary()
    assert rem_res["status"] == "removed"


def test_sidecar_transcription_cancellation(temp_environment: dict[str, Any]) -> None:
    events: list[tuple[str, dict[str, Any]]] = []
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        audio_service=temp_environment["audio_service"],
        event_sink=lambda m, p: events.append((m, p)),
    )

    service.inspect_audio(str(temp_environment["audio_file"]))
    if service._audio_task is not None:
        service._audio_task.future.result(timeout=2.0)

    service.start_transcription()
    cancel_res = service.cancel_transcription()
    assert cancel_res["status"] == "cancelling"

    if service._transcription_task is not None:
        with suppress(Exception):
            service._transcription_task.future.result(timeout=2.0)

    cancelled_events = [e for e in events if e[0] == "transcription_cancelled"]
    assert len(cancelled_events) == 1


def test_sidecar_models_directory_configuration(
    temp_environment: dict[str, Any], tmp_path: Path
) -> None:
    service = SidecarService(
        temp_environment["controller"],
        model_path=temp_environment["model_dir"],
        service_factory=lambda p, pref: FakePreparedService(),
        model_manager=temp_environment["model_manager"],
    )

    info = service.get_models_directory()
    assert info["is_custom"] is False
    assert info["path"] == str(temp_environment["model_manager"].models_dir)

    new_custom = tmp_path / "custom_models_storage"
    update_res = service.set_models_directory(str(new_custom))
    assert update_res["status"] == "updated"
    assert update_res["path"] == str(new_custom)

    info_after = service.get_models_directory()
    assert info_after["is_custom"] is True
    assert info_after["path"] == str(new_custom)
    assert new_custom.is_dir()
