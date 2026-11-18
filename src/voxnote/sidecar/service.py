# ruff: noqa: RUF001
from __future__ import annotations

import logging
from collections.abc import Callable
from concurrent.futures import Future
from contextlib import suppress
from dataclasses import asdict
from pathlib import Path
from time import monotonic
from typing import Any

from voxnote import __version__
from voxnote.application.background import CancellationToken, TaskHandle
from voxnote.application.controller import ApplicationController
from voxnote.application.ports import AudioService, DictionaryManager, ServiceFactory
from voxnote.domain.models import (
    AudioMetadata,
    DeviceCapabilities,
    ProgressSnapshot,
    TranscriptionJob,
    TranscriptionResult,
)
from voxnote.domain.state import AppState
from voxnote.services.diagnostics import TechnicalDiagnostics
from voxnote.services.dictionary import (
    CUSTOM_ID,
    NONE_ID,
    DictionaryError,
    LocalDictionaryManager,
)
from voxnote.services.export import save_text
from voxnote.services.history import LocalHistoryStore
from voxnote.services.model_manager import (
    LocalModelManager,
    ModelDownloadProgress,
    ModelInstallError,
)
from voxnote.services.progress import ProgressEstimator
from voxnote.sidecar.protocol import (
    BUSY_ERROR,
    DICTIONARY_ERROR,
    FILE_ERROR,
    INVALID_PARAMS,
    MODEL_ERROR,
)

logger = logging.getLogger("voxnote.sidecar")

SUPPORTED_AUDIO_SUFFIXES = frozenset({".m4a", ".mp3", ".wav", ".flac", ".ogg"})


class SidecarServiceError(Exception):
    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


class SidecarService:
    """Headless application service managing domain logic and emitting JSON-RPC events."""

    def __init__(
        self,
        controller: ApplicationController,
        *,
        model_path: Path | None,
        service_factory: ServiceFactory,
        model_manager: LocalModelManager | None = None,
        dictionary_manager: DictionaryManager | None = None,
        history_store: LocalHistoryStore | None = None,
        audio_service: AudioService | None = None,
        device_capabilities: DeviceCapabilities | None = None,
        diagnostics: TechnicalDiagnostics | None = None,
        event_sink: Callable[[str, dict[str, Any]], None] | None = None,
    ) -> None:
        self._controller = controller
        self._model_manager = model_manager
        self._dictionary_manager = dictionary_manager
        self._history_store = history_store
        self._external_model = self._is_model_directory(model_path)
        self._model_path = model_path if self._external_model else self._selected_installed_path()
        self._service_factory = service_factory
        self._audio_service = audio_service
        self._device_capabilities = device_capabilities or DeviceCapabilities(
            cuda_available=False,
            unavailable_reason="NVIDIA GPU не обнаружена",
        )
        self._diagnostics = diagnostics
        self._event_sink = event_sink or (lambda _m, _p: None)

        self._audio_metadata: AudioMetadata | None = None
        self._audio_task: TaskHandle[AudioMetadata | None] | None = None
        self._download_task: TaskHandle[Path | None] | None = None
        self._transcription_task: TaskHandle[TranscriptionResult] | None = None
        self._transcription_started_at: float | None = None
        self._active_device_label = ""
        self._device_error_recoverable = False

        self._progress_estimator = ProgressEstimator()
        self._last_progress_emit = 0.0

        # Subscribe to state machine transitions to emit state_changed events
        self._unsubscribe_state = self._controller.state_machine.subscribe(self._on_state_changed)

        # Finalize startup
        self._controller.finish_startup(model_available=self._model_path is not None)
        self._record_diagnostic(
            "sidecar_started",
            cuda_available=self._device_capabilities.cuda_available,
            device=self._controller.settings.device_preference,
            model_id=self._controller.settings.selected_model,
            dictionary_id=self._controller.settings.selected_dictionary or "none",
        )

    def set_event_sink(self, event_sink: Callable[[str, dict[str, Any]], None]) -> None:
        self._event_sink = event_sink

    def _emit(self, method: str, params: dict[str, Any]) -> None:
        try:
            self._event_sink(method, params)
        except Exception:
            logger.exception("Failed to emit event %s", method)

    def _on_state_changed(self, previous: AppState, current: AppState) -> None:
        self._emit(
            "state_changed",
            {
                "previous": previous.value,
                "current": current.value,
            },
        )

    @staticmethod
    def _is_model_directory(path: Path | None) -> bool:
        return bool(path and path.is_dir() and (path / "model.bin").is_file())

    def _selected_installed_path(self) -> Path | None:
        if self._model_manager is None:
            return None
        selected = self._model_manager.model_path(self._controller.settings.selected_model)
        if selected is not None:
            return selected
        installed = self._model_manager.installed_models()
        if not installed:
            return None
        fallback = installed[0]
        self._controller.update_settings(selected_model=fallback)
        return self._model_manager.model_path(fallback)

    def _record_diagnostic(self, event: str, **kwargs: object) -> None:
        if self._diagnostics is not None:
            self._diagnostics.record(event, **kwargs)

    # --------------------------------------------------------------------------
    # Ping & System Info
    # --------------------------------------------------------------------------

    def ping(self) -> dict[str, Any]:
        return {
            "status": "pong",
            "version": __version__,
        }

    def get_system_info(self) -> dict[str, Any]:
        capabilities = self._device_capabilities
        installed = self._model_manager.installed_models() if self._model_manager else []
        return {
            "version": __version__,
            "state": self._controller.state_machine.state.value,
            "device_capabilities": {
                "cuda_available": capabilities.cuda_available,
                "gpu_name": capabilities.gpu_name,
                "gpu_label": capabilities.gpu_label,
                "total_memory_mb": capabilities.total_memory_mb,
                "unavailable_reason": capabilities.unavailable_reason,
            },
            "device_preference": self._controller.settings.device_preference,
            "selected_model": self._controller.settings.selected_model,
            "model_available": self._model_path is not None,
            "installed_models": list(installed),
            "selected_dictionary": self._controller.settings.selected_dictionary or NONE_ID,
            "has_custom_dictionary": (
                self._dictionary_manager.has_custom_dictionary()
                if isinstance(self._dictionary_manager, LocalDictionaryManager)
                else False
            ),
            "theme": self._controller.settings.theme,
            "reduce_motion": self._controller.settings.reduce_motion,
            "appearance": self._controller.settings.theme,
            "animations_reduced": self._controller.settings.reduce_motion,
        }

    def get_settings(self) -> dict[str, Any]:
        settings = self._controller.settings
        return {
            "theme": settings.theme,
            "reduce_motion": settings.reduce_motion,
            "appearance": settings.theme,
            "animations_reduced": settings.reduce_motion,
            "device_preference": settings.device_preference,
            "selected_model": settings.selected_model,
            "selected_dictionary": settings.selected_dictionary,
        }

    def update_settings(self, **kwargs: Any) -> dict[str, Any]:
        normalized = dict(kwargs)
        if "appearance" in normalized and "theme" not in normalized:
            normalized["theme"] = normalized["appearance"]
        if "animations_reduced" in normalized and "reduce_motion" not in normalized:
            normalized["reduce_motion"] = normalized["animations_reduced"]

        valid_keys = {
            "theme",
            "device_preference",
            "selected_model",
            "selected_dictionary",
            "reduce_motion",
        }
        filtered = {k: v for k, v in normalized.items() if k in valid_keys}
        if "theme" in filtered and filtered["theme"] not in {"system", "light", "dark"}:
            filtered["theme"] = "system"
        if "device_preference" in filtered:
            val = str(filtered["device_preference"])
            if val not in {"auto", "cuda", "cpu"}:
                raise SidecarServiceError(INVALID_PARAMS, f"Недопустимое устройство: {val}")
        if "selected_dictionary" in filtered and filtered["selected_dictionary"] == NONE_ID:
            filtered["selected_dictionary"] = None

        self._controller.update_settings(**filtered)
        if "selected_model" in filtered and not self._external_model:
            self._model_path = self._selected_installed_path()

        return self.get_settings()

    # --------------------------------------------------------------------------
    # Audio Inspection
    # --------------------------------------------------------------------------

    def inspect_audio(self, file_path: str) -> dict[str, Any]:
        if self._is_busy():
            raise SidecarServiceError(BUSY_ERROR, "Приложение занято другой операцией.")

        path = Path(file_path)
        if path.suffix.lower() not in SUPPORTED_AUDIO_SUFFIXES:
            raise SidecarServiceError(
                FILE_ERROR,
                "Поддерживаются только аудиофайлы M4A, MP3, WAV, FLAC и OGG.",
            )
        if not path.is_file():
            raise SidecarServiceError(FILE_ERROR, f"Файл не найден: {file_path}")

        if self._audio_service is None:
            self._controller.select_file(path)
            return {
                "file_path": str(path),
                "file_name": path.name,
                "file_size": path.stat().st_size,
                "duration_seconds": None,
                "waveform": [],
            }

        service = self._audio_service

        def operation(token: CancellationToken) -> AudioMetadata | None:
            try:
                metadata = service.inspect(path, token)
            except Exception as error:
                logger.warning("Audio inspection error: %s", error)
                self._emit("audio_inspection_failed", {"file_path": str(path), "error": str(error)})
                return None

            if metadata is None:
                return None

            self._audio_metadata = metadata
            with suppress(RuntimeError):
                self._controller.select_file(path)

            self._emit(
                "audio_inspected",
                {
                    "file_path": str(path),
                    "file_name": path.name,
                    "file_size": path.stat().st_size,
                    "duration_seconds": metadata.duration_seconds,
                    "sample_rate": metadata.sample_rate,
                    "channels": metadata.channels,
                    "codec": metadata.codec,
                    "waveform": list(metadata.waveform),
                },
            )
            return metadata

        handle = self._controller.task_runner.submit(operation)
        self._audio_task = handle

        def on_done(_f: Future[AudioMetadata | None]) -> None:
            self._audio_task = None

        handle.future.add_done_callback(on_done)

        return {
            "status": "inspecting",
            "file_path": str(path),
        }

    # --------------------------------------------------------------------------
    # Transcription Lifecycle
    # --------------------------------------------------------------------------

    def _is_busy(self) -> bool:
        return (
            self._transcription_task is not None
            or self._download_task is not None
            or self._audio_task is not None
            or self._controller.state_machine.state
            in {
                AppState.PREPARING_AUDIO,
                AppState.LOADING_MODEL,
                AppState.TRANSCRIBING,
                AppState.FINALIZING,
            }
        )

    def start_transcription(
        self,
        file_path: str | None = None,
        model_id: str | None = None,
        device_preference: str | None = None,
        dictionary_id: str | None = None,
    ) -> dict[str, Any]:
        if self._is_busy():
            raise SidecarServiceError(BUSY_ERROR, "Транскрибация или загрузка уже выполняется.")

        # Update params if explicitly provided
        settings_update: dict[str, Any] = {}
        if model_id is not None:
            settings_update["selected_model"] = model_id
        if device_preference is not None:
            settings_update["device_preference"] = device_preference
        if dictionary_id is not None:
            effective_dict = None if dictionary_id == NONE_ID else dictionary_id
            settings_update["selected_dictionary"] = effective_dict
        if settings_update:
            self._controller.update_settings(**settings_update)
            if "selected_model" in settings_update and not self._external_model:
                self._model_path = self._selected_installed_path()

        # Select file if provided
        if file_path:
            path = Path(file_path)
            if not path.is_file():
                raise SidecarServiceError(FILE_ERROR, f"Аудиофайл не найден: {file_path}")
            if path.suffix.lower() not in SUPPORTED_AUDIO_SUFFIXES:
                raise SidecarServiceError(FILE_ERROR, "Неподдерживаемый аудиоформат.")
            self._controller.select_file(path)

        source = self._controller.selected_file
        if source is None or not source.is_file():
            raise SidecarServiceError(FILE_ERROR, "Выберите аудиофайл перед запуском.")

        model_path = self._model_path
        if model_path is None:
            raise SidecarServiceError(MODEL_ERROR, "Локальная модель не установлена.")

        self._progress_estimator.reset()
        self._last_progress_emit = 0.0
        self._device_error_recoverable = False

        self._controller.state_machine.transition(AppState.PREPARING_AUDIO)
        self._controller.state_machine.transition(AppState.LOADING_MODEL)

        effective_dict_id = self._controller.settings.selected_dictionary
        job = TranscriptionJob(
            source_path=source,
            model_id=model_path.name,
            dictionary_id=effective_dict_id,
            device_preference=self._controller.settings.device_preference,
        )
        self._transcription_started_at = monotonic()
        self._record_diagnostic(
            "transcription_started",
            model_id=job.model_id,
            device=job.device_preference,
            dictionary_id=job.dictionary_id or "none",
            duration_seconds=(
                round(self._audio_metadata.duration_seconds) if self._audio_metadata else None
            ),
        )

        cancelled_emitted = False

        def operation(token: CancellationToken) -> TranscriptionResult:
            nonlocal cancelled_emitted
            try:
                service = self._service_factory(
                    model_path,
                    self._controller.settings.device_preference,
                )
                if not service.prepare(token):
                    return TranscriptionResult(
                        text="",
                        model_id=job.model_id,
                        device="cpu",
                        incomplete=True,
                    )

                self._active_device_label = str(getattr(service, "device_label", "CPU"))
                self._controller.state_machine.transition(AppState.TRANSCRIBING)

                def on_progress(snapshot: ProgressSnapshot) -> None:
                    update = self._progress_estimator.observe(snapshot)
                    if not update.notify_ui and snapshot.percent != 100.0:
                        return
                    normalized = update.snapshot
                    self._emit(
                        "transcription_progress",
                        {
                            "processed_seconds": normalized.processed_seconds,
                            "total_seconds": normalized.total_seconds,
                            "elapsed_seconds": normalized.elapsed_seconds,
                            "percent": normalized.percent,
                            "remaining_percent": normalized.remaining_percent,
                            "eta_seconds": normalized.eta_seconds,
                            "eta_formatted": self._format_duration(normalized.eta_seconds),
                        },
                    )

                result = service.transcribe(job, token, on_progress)
                if token.is_cancelled or result.incomplete:
                    if self._controller.state_machine.state in {
                        AppState.PREPARING_AUDIO,
                        AppState.LOADING_MODEL,
                        AppState.TRANSCRIBING,
                        AppState.FINALIZING,
                    }:
                        self._controller.state_machine.transition(AppState.CANCELLED)
                    self._emit("transcription_cancelled", {})
                    return result

                self._controller.state_machine.transition(AppState.FINALIZING)
                self._controller.state_machine.transition(AppState.COMPLETED)
                self._record_diagnostic(
                    "transcription_completed",
                    text_length=len(result.text),
                    device=result.device,
                )

                # Record in history store
                entry_dict: dict[str, Any] = {}
                if self._history_store is not None:
                    saved_entry = self._history_store.add_entry(
                        file_name=source.name,
                        duration_seconds=(
                            self._audio_metadata.duration_seconds if self._audio_metadata else None
                        ),
                        model_id=result.model_id,
                        device=result.device,
                        dictionary_id=result.dictionary_id,
                        text=result.text,
                        title=source.stem,
                        segments=result.segments,
                        file_path=str(source.resolve()),
                    )
                    entry_dict = self._serialize_history_entry(saved_entry)

                self._emit(
                    "transcription_completed",
                    {
                        "text": result.text,
                        "model_id": result.model_id,
                        "device": result.device,
                        "dictionary_id": result.dictionary_id,
                        "incomplete": result.incomplete,
                        "segments": [asdict(s) for s in result.segments],
                        "history_entry": entry_dict,
                    },
                )
                return result

            except Exception as err:
                err_msg = str(err)
                lowered = err_msg.lower()
                self._device_error_recoverable = (
                    any(marker in lowered for marker in ("gpu", "cuda", "видеопамят"))
                    and self._controller.settings.device_preference != "cpu"
                )
                if self._controller.state_machine.state is not AppState.ERROR:
                    self._controller.state_machine.transition(AppState.ERROR)
                self._record_diagnostic("transcription_failed", error=err_msg)
                self._emit(
                    "transcription_error",
                    {
                        "message": err_msg,
                        "recoverable_on_cpu": self._device_error_recoverable,
                    },
                )
                raise

        handle = self._controller.task_runner.submit(operation)
        self._transcription_task = handle

        def on_done(future: Future[TranscriptionResult]) -> None:
            self._transcription_task = None
            if future.cancelled() and not cancelled_emitted:
                if self._controller.state_machine.state in {
                    AppState.PREPARING_AUDIO,
                    AppState.LOADING_MODEL,
                    AppState.TRANSCRIBING,
                    AppState.FINALIZING,
                }:
                    self._controller.state_machine.transition(AppState.CANCELLED)
                self._emit("transcription_cancelled", {})

        handle.future.add_done_callback(on_done)
        return {
            "status": "started",
            "file_path": str(source),
            "model_id": job.model_id,
            "device": job.device_preference,
        }

    def cancel_transcription(self) -> dict[str, Any]:
        task = self._transcription_task
        if task is None:
            return {"status": "not_running"}
        task.cancel()
        return {"status": "cancelling"}

    def retry_on_cpu(self) -> dict[str, Any]:
        self._controller.update_settings(device_preference="cpu")
        self._device_error_recoverable = False
        return self.start_transcription()

    # --------------------------------------------------------------------------
    # Model Management
    # --------------------------------------------------------------------------

    def get_models(self) -> list[dict[str, Any]]:
        if self._model_manager is None:
            return []
        selected = self._controller.settings.selected_model
        result: list[dict[str, Any]] = []
        for item in self._model_manager.catalog:
            installed = self._model_manager.is_installed(item.model_id)
            result.append(
                {
                    "model_id": item.model_id,
                    "name": item.display_name,
                    "summary": item.summary,
                    "size_bytes": item.advertised_bytes,
                    "size_text": self._format_bytes(item.advertised_bytes),
                    "recommended": item.recommended,
                    "installed": installed,
                    "selected": item.model_id == selected and self._model_path is not None,
                }
            )
        return result

    def get_models_directory(self) -> dict[str, Any]:
        if self._model_manager is None:
            return {"path": "", "is_custom": False}
        custom = self._controller.settings.custom_models_dir
        return {
            "path": str(self._model_manager.models_dir),
            "is_custom": bool(custom),
        }

    def set_models_directory(self, path: str) -> dict[str, Any]:
        cleaned = path.strip()
        if not cleaned:
            raise SidecarServiceError(
                INVALID_PARAMS,
                "Путь к каталогу моделей не может быть пустым.",
            )
        new_path = Path(cleaned)
        try:
            new_path.mkdir(parents=True, exist_ok=True)
        except OSError as err:
            raise SidecarServiceError(
                FILE_ERROR,
                f"Не удалось создать каталог: {err}",
            ) from err

        self._controller.update_settings(custom_models_dir=str(new_path))
        self._model_manager = LocalModelManager(new_path)
        selected = self._controller.settings.selected_model
        if self._model_manager.is_installed(selected):
            self._model_path = self._model_manager.model_path(selected)
        else:
            self._model_path = None
        return {"status": "updated", "path": str(new_path)}

    def select_model(self, model_id: str) -> dict[str, Any]:
        if self._model_manager is None:
            raise SidecarServiceError(MODEL_ERROR, "Менеджер моделей недоступен.")
        if not self._model_manager.is_installed(model_id):
            raise SidecarServiceError(
                MODEL_ERROR,
                f"Модель '{model_id}' не установлена. Сначала скачайте её.",
            )
        self._controller.update_settings(selected_model=model_id)
        self._model_path = self._model_manager.model_path(model_id)
        return {"status": "selected", "model_id": model_id}

    def download_model(self, model_id: str) -> dict[str, Any]:
        if self._model_manager is None:
            raise SidecarServiceError(MODEL_ERROR, "Менеджер моделей недоступен.")
        if self._download_task is not None:
            raise SidecarServiceError(BUSY_ERROR, "Другая модель уже скачивается.")

        manager = self._model_manager

        def operation(token: CancellationToken) -> Path | None:
            def on_progress(p: ModelDownloadProgress) -> None:
                self._emit(
                    "model_download_progress",
                    {
                        "model_id": model_id,
                        "downloaded_bytes": p.received_bytes,
                        "total_bytes": p.total_bytes,
                        "percent": p.percent,
                        "phase": p.phase,
                    },
                )

            try:
                return manager.install(model_id, cancellation=token, on_progress=on_progress)
            except ModelInstallError as err:
                self._emit("model_download_failed", {"model_id": model_id, "error": str(err)})
                raise
            except Exception as err:
                logger.exception("Model download failed")
                self._emit("model_download_failed", {"model_id": model_id, "error": str(err)})
                raise

        handle = self._controller.task_runner.submit(operation)
        self._download_task = handle

        def on_done(future: Future[Path | None]) -> None:
            self._download_task = None
            if future.cancelled():
                self._emit("model_download_cancelled", {"model_id": model_id})
                return
            exc = future.exception()
            if exc is not None:
                return
            path = future.result()
            if path is not None and isinstance(path, Path):
                self._controller.update_settings(selected_model=model_id)
                self._model_path = path
                self._emit(
                    "model_download_finished",
                    {
                        "model_id": model_id,
                        "path": str(path),
                        "status": "installed",
                    },
                )

        handle.future.add_done_callback(on_done)
        return {"status": "downloading", "model_id": model_id}

    def cancel_download(self, model_id: str | None = None) -> dict[str, Any]:
        if self._download_task is None:
            return {"status": "not_downloading"}
        self._download_task.cancel()
        return {"status": "cancelling"}

    def remove_model(self, model_id: str) -> dict[str, Any]:
        if self._model_manager is None:
            raise SidecarServiceError(MODEL_ERROR, "Менеджер моделей недоступен.")
        if self._download_task is not None:
            raise SidecarServiceError(BUSY_ERROR, "Нельзя удалить модель во время скачивания.")

        self._model_manager.remove(model_id)
        if self._controller.settings.selected_model == model_id:
            self._model_path = self._selected_installed_path()
        return {"status": "removed", "model_id": model_id}

    # --------------------------------------------------------------------------
    # Dictionary Management
    # --------------------------------------------------------------------------

    def get_dictionaries(self) -> list[dict[str, Any]]:
        selected = self._controller.settings.selected_dictionary or NONE_ID
        if isinstance(self._dictionary_manager, LocalDictionaryManager):
            return [
                {
                    "id": d.id,
                    "name": d.name,
                    "description": d.description,
                    "term_count": d.term_count,
                    "available": d.available,
                    "selected": d.id == selected,
                    "source": d.source,
                }
                for d in self._dictionary_manager.descriptors()
            ]
        return [
            {
                "id": NONE_ID,
                "name": "Без словаря",
                "description": "Стандартное распознавание",
                "term_count": 0,
                "available": True,
                "selected": selected == NONE_ID,
                "source": "",
            }
        ]

    def select_dictionary(self, dictionary_id: str) -> dict[str, Any]:
        val = None if dictionary_id == NONE_ID else dictionary_id
        self._controller.update_settings(selected_dictionary=val)
        return {"status": "selected", "dictionary_id": dictionary_id}

    def import_custom_dictionary(self, file_path: str) -> dict[str, Any]:
        if not isinstance(self._dictionary_manager, LocalDictionaryManager):
            raise SidecarServiceError(DICTIONARY_ERROR, "Словари не поддерживаются конфигурацией.")

        path = Path(file_path)
        if not path.is_file():
            raise SidecarServiceError(FILE_ERROR, f"Файл словаря не найден: {file_path}")

        try:
            profile = self._dictionary_manager.import_custom_dictionary(path)
            self._controller.update_settings(selected_dictionary=CUSTOM_ID)
            return {
                "status": "imported",
                "dictionary_id": CUSTOM_ID,
                "term_count": profile.term_count,
                "source": profile.source,
            }
        except DictionaryError as err:
            raise SidecarServiceError(DICTIONARY_ERROR, str(err)) from err

    def remove_custom_dictionary(self) -> dict[str, Any]:
        if not isinstance(self._dictionary_manager, LocalDictionaryManager):
            raise SidecarServiceError(DICTIONARY_ERROR, "Словари не поддерживаются конфигурацией.")

        self._dictionary_manager.remove_custom_dictionary()
        if self._controller.settings.selected_dictionary == CUSTOM_ID:
            self._controller.update_settings(selected_dictionary=None)

        return {"status": "removed"}

    # --------------------------------------------------------------------------
    # History & Notes
    # --------------------------------------------------------------------------

    def get_history(self, search_query: str = "") -> dict[str, Any]:
        if self._history_store is None:
            return {"entries": [], "groups": {}}

        query = search_query.strip()
        grouped = self._history_store.get_grouped_entries(query)
        entries = (
            [entry for _, group_entries in grouped for entry in group_entries]
            if query
            else self._history_store.get_entries()
        )
        serialized = [self._serialize_history_entry(e) for e in entries]

        serialized_groups = [
            {
                "group_name": group_name,
                "entries": [self._serialize_history_entry(e) for e in group_entries],
            }
            for group_name, group_entries in grouped
        ]

        return {
            "entries": serialized,
            "groups": serialized_groups,
            "total_count": len(entries),
        }

    def get_history_entry(self, entry_id: str) -> dict[str, Any]:
        if self._history_store is None:
            raise SidecarServiceError(INVALID_PARAMS, "Хранилище истории не инициализировано.")
        entry = self._history_store.get_entry(entry_id)
        if entry is None:
            raise SidecarServiceError(INVALID_PARAMS, f"Заметка '{entry_id}' не найдена.")
        return self._serialize_history_entry(entry)

    def update_history_entry(
        self,
        entry_id: str,
        title: str | None = None,
        edited_text: str | None = None,
    ) -> dict[str, Any]:
        if self._history_store is None:
            raise SidecarServiceError(INVALID_PARAMS, "Хранилище истории не инициализировано.")

        updated = False
        if title is not None:
            updated = self._history_store.update_entry_title(entry_id, title) or updated
        if edited_text is not None:
            updated = self._history_store.update_entry_text(entry_id, edited_text) or updated

        entry = self._history_store.get_entry(entry_id)
        if entry is None:
            raise SidecarServiceError(INVALID_PARAMS, f"Заметка '{entry_id}' не найдена.")

        return self._serialize_history_entry(entry)

    def remove_history_entry(self, entry_id: str) -> dict[str, Any]:
        if self._history_store is None:
            raise SidecarServiceError(INVALID_PARAMS, "Хранилище истории не инициализировано.")
        success = self._history_store.remove_entry(entry_id)
        return {"status": "removed" if success else "not_found", "entry_id": entry_id}

    def clear_history(self) -> dict[str, Any]:
        if self._history_store is None:
            return {"status": "empty"}
        self._history_store.clear()
        return {"status": "cleared"}

    def export_text(self, entry_id: str, target_file_path: str) -> dict[str, Any]:
        if self._history_store is None:
            raise SidecarServiceError(INVALID_PARAMS, "Хранилище истории не инициализировано.")
        entry = self._history_store.get_entry(entry_id)
        if entry is None:
            raise SidecarServiceError(INVALID_PARAMS, f"Заметка '{entry_id}' не найдена.")

        path = Path(target_file_path)
        save_text(entry.current_text, path)
        return {"status": "exported", "path": str(path)}

    def copy_diagnostics(self) -> dict[str, Any]:
        if self._diagnostics is None:
            return {"diagnostics": "Диагностический журнал отключён."}
        report = self._diagnostics.build_report(
            app_version=__version__,
            selected_model=self._controller.settings.selected_model,
            device_preference=self._controller.settings.device_preference,
            selected_dictionary=self._controller.settings.selected_dictionary or "none",
            theme=self._controller.settings.theme,
            reduce_motion=self._controller.settings.reduce_motion,
            cuda_available=self._device_capabilities.cuda_available,
        )
        return {"diagnostics": report}

    # --------------------------------------------------------------------------
    # Shutdown
    # --------------------------------------------------------------------------

    def shutdown(self) -> dict[str, Any]:
        logger.info("Sidecar shutdown requested")
        if self._transcription_task is not None:
            self._transcription_task.cancel()
        if self._download_task is not None:
            self._download_task.cancel()
        if self._audio_task is not None:
            self._audio_task.cancel()
        self._controller.task_runner.shutdown(wait=False)
        return {"status": "shutdown"}

    # --------------------------------------------------------------------------
    # Serialization Helpers
    # --------------------------------------------------------------------------

    @staticmethod
    def _serialize_history_entry(entry: Any) -> dict[str, Any]:
        segments = getattr(entry, "segments", ())
        return {
            "id": entry.id,
            "created_at": entry.created_at,
            "file_name": entry.file_name,
            "title": entry.title,
            "display_title": entry.display_title,
            "duration_seconds": entry.duration_seconds,
            "duration_formatted": entry.duration_formatted,
            "model_id": entry.model_id,
            "device": entry.device,
            "dictionary_id": entry.dictionary_id,
            "text": entry.text,
            "preview": entry.preview,
            "edited_text": entry.edited_text,
            "current_text": entry.current_text,
            "has_edits": entry.has_edits,
            "segments": [asdict(s) for s in segments],
            "file_path": getattr(entry, "file_path", ""),
        }

    @staticmethod
    def _format_bytes(total_bytes: int | None) -> str:
        if total_bytes is None or total_bytes <= 0:
            return "—"
        if total_bytes < 1024 * 1024:
            return f"{total_bytes / 1024:.1f} КБ"
        if total_bytes < 1024 * 1024 * 1024:
            return f"{total_bytes / (1024 * 1024):.1f} МБ"
        return f"{total_bytes / (1024 * 1024 * 1024):.2f} ГБ"

    @staticmethod
    def _format_duration(seconds: float | None) -> str:
        if seconds is None or seconds <= 0:
            return "—"
        total = round(seconds)
        hours, remainder = divmod(total, 3600)
        minutes, secs = divmod(remainder, 60)
        if hours:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        return f"{minutes}:{secs:02d}"
