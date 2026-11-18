from __future__ import annotations

import os
from pathlib import Path

from voxnote.application.controller import ApplicationController
from voxnote.application.ports import DictionaryManager, PreparedTranscriptionService
from voxnote.domain.models import DeviceCapabilities
from voxnote.infrastructure import (
    CTranslate2DeviceDetector,
    DeviceRoutingTranscriptionService,
    FasterWhisperTranscriptionService,
    PyAVAudioService,
)
from voxnote.services.device import DeviceSelector
from voxnote.services.diagnostics import TechnicalDiagnostics
from voxnote.services.dictionary import LocalDictionaryManager
from voxnote.services.history import LocalHistoryStore
from voxnote.services.model_manager import LocalModelManager
from voxnote.services.paths import AppPaths
from voxnote.services.settings import DevicePreference, SettingsStore
from voxnote.sidecar.protocol import (
    JsonRpcError,
    JsonRpcErrorResponse,
    JsonRpcNotification,
    JsonRpcRequest,
    JsonRpcResponse,
    format_error,
    format_notification,
    format_response,
    parse_message,
)
from voxnote.sidecar.server import SidecarServer
from voxnote.sidecar.service import SidecarService, SidecarServiceError


def _configured_model_path() -> Path | None:
    value = os.environ.get("VOXNOTE_MODEL_PATH")
    if not value:
        return None
    path = Path(value).expanduser()
    return path if path.is_dir() else None


def _build_whisper_service(
    model_path: Path,
    device: str,
    compute_type: str,
    dictionary_manager: DictionaryManager | None = None,
) -> PreparedTranscriptionService:
    return FasterWhisperTranscriptionService.from_model_path(
        model_path,
        device=device,
        compute_type=compute_type,
        dictionary_manager=dictionary_manager,
    )


def create_transcription_service(
    model_path: Path,
    preference: DevicePreference,
    capabilities: DeviceCapabilities,
    dictionary_manager: DictionaryManager | None = None,
) -> PreparedTranscriptionService:
    return DeviceRoutingTranscriptionService(
        model_path,
        preference,
        DeviceSelector(capabilities),
        lambda path, dev, ct: _build_whisper_service(path, dev, ct, dictionary_manager),
    )


def create_default_sidecar_service(paths: AppPaths | None = None) -> SidecarService:
    """Create a fully configured SidecarService wired to standard persistent storage."""
    effective_paths = paths or AppPaths.from_environment()
    controller = ApplicationController(SettingsStore(effective_paths.settings_file))
    custom_dir = controller.settings.custom_models_dir
    models_dir = Path(custom_dir) if custom_dir else effective_paths.models_dir
    model_manager = LocalModelManager(models_dir)
    dictionary_manager = LocalDictionaryManager(effective_paths.dictionaries_dir)
    history_store = LocalHistoryStore(effective_paths.history_file)
    diagnostics = TechnicalDiagnostics(effective_paths.logs_dir / "voxnote.jsonl")
    device_capabilities = CTranslate2DeviceDetector().detect()
    audio_service = PyAVAudioService()

    return SidecarService(
        controller=controller,
        model_path=_configured_model_path(),
        service_factory=lambda path, preference: create_transcription_service(
            path,
            preference,
            device_capabilities,
            dictionary_manager,
        ),
        model_manager=model_manager,
        dictionary_manager=dictionary_manager,
        history_store=history_store,
        audio_service=audio_service,
        device_capabilities=device_capabilities,
        diagnostics=diagnostics,
    )


__all__ = [
    "JsonRpcError",
    "JsonRpcErrorResponse",
    "JsonRpcNotification",
    "JsonRpcRequest",
    "JsonRpcResponse",
    "SidecarServer",
    "SidecarService",
    "SidecarServiceError",
    "create_default_sidecar_service",
    "create_transcription_service",
    "format_error",
    "format_notification",
    "format_response",
    "parse_message",
]
