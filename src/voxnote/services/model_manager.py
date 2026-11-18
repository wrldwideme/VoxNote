from __future__ import annotations

import hashlib
import json
import shutil
from collections.abc import Callable, Iterator, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Protocol
from urllib.request import Request, urlopen

from voxnote.application.background import CancellationToken


@dataclass(frozen=True, slots=True)
class ModelDescriptor:
    model_id: str
    display_name: str
    summary: str
    repository: str
    revision: str
    files: tuple[str, ...]
    model_sha256: str
    advertised_bytes: int
    recommended: bool = False

    def file_url(self, filename: str) -> str:
        return (
            f"https://huggingface.co/{self.repository}/resolve/"
            f"{self.revision}/{filename}?download=true"
        )


MODEL_CATALOG: tuple[ModelDescriptor, ...] = (
    ModelDescriptor(
        model_id="small",
        display_name="Быстрая",
        summary="Быстрее на CPU и требует меньше памяти. Точность ниже на сложной речи.",
        repository="Systran/faster-whisper-small",
        revision="536b0662742c02347bc0e980a01041f333bce120",
        files=("config.json", "model.bin", "tokenizer.json", "vocabulary.txt"),
        model_sha256="3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671",
        advertised_bytes=486_000_000,
    ),
    ModelDescriptor(
        model_id="turbo",
        display_name="Сбалансированная",
        summary="Хороший баланс скорости и точности для большинства русских записей.",
        repository="dropbox-dash/faster-whisper-large-v3-turbo",
        revision="0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf",
        files=(
            "config.json",
            "model.bin",
            "preprocessor_config.json",
            "tokenizer.json",
            "vocabulary.json",
        ),
        model_sha256="e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da",
        advertised_bytes=1_625_000_000,
        recommended=True,
    ),
    ModelDescriptor(
        model_id="large-v3",
        display_name="Максимальная точность",
        summary="Лучшая точность, но заметно медленнее на CPU и требует больше памяти.",
        repository="Systran/faster-whisper-large-v3",
        revision="edaa852ec7e145841d8ffdb056a99866b5f0a478",
        files=(
            "config.json",
            "model.bin",
            "preprocessor_config.json",
            "tokenizer.json",
            "vocabulary.json",
        ),
        model_sha256="69f74147e3334731bc3a76048724833325d2ec74642fb52620eda87352e3d4f1",
        advertised_bytes=3_095_000_000,
    ),
)


@dataclass(frozen=True, slots=True)
class DownloadStream:
    total_bytes: int
    resumed: bool
    chunks: Iterator[bytes]


class DownloadClient(Protocol):
    def content_length(self, url: str) -> int: ...

    def stream(self, url: str, start: int) -> DownloadStream: ...


class HttpDownloadClient:
    """Small HTTP adapter kept outside domain and UI code."""

    def content_length(self, url: str) -> int:
        request = Request(url, method="HEAD", headers={"User-Agent": "VoxNote/0.1"})
        with urlopen(request, timeout=30) as response:
            value = response.headers.get("Content-Length")
        if value is None or not value.isdigit():
            raise ModelInstallError("Сервер не сообщил размер файла модели.")
        return int(value)

    def stream(self, url: str, start: int) -> DownloadStream:
        headers = {"User-Agent": "VoxNote/0.1"}
        if start:
            headers["Range"] = f"bytes={start}-"
        response: Any = urlopen(Request(url, headers=headers), timeout=60)
        resumed = start > 0 and getattr(response, "status", 200) == 206
        content_range = response.headers.get("Content-Range", "")
        if resumed and "/" in content_range:
            total_bytes = int(content_range.rsplit("/", 1)[1])
        else:
            length = response.headers.get("Content-Length")
            if length is None or not length.isdigit():
                response.close()
                raise ModelInstallError("Сервер не сообщил размер файла модели.")
            total_bytes = int(length) + (start if resumed else 0)

        def chunks() -> Iterator[bytes]:
            with response:
                while data := response.read(1024 * 1024):
                    yield data

        return DownloadStream(total_bytes=total_bytes, resumed=resumed, chunks=chunks())


@dataclass(frozen=True, slots=True)
class ModelDownloadProgress:
    received_bytes: int
    total_bytes: int
    phase: str

    @property
    def percent(self) -> float:
        if self.total_bytes <= 0:
            return 0.0
        return max(0.0, min(self.received_bytes / self.total_bytes * 100, 100.0))


ModelProgressCallback = Callable[[ModelDownloadProgress], None]


class ModelInstallError(RuntimeError):
    """A recoverable model download, verification, or installation failure."""


class LocalModelManager:
    MANIFEST_NAME = "voxnote-model.json"

    def __init__(
        self,
        models_dir: Path,
        *,
        catalog: Sequence[ModelDescriptor] = MODEL_CATALOG,
        client: DownloadClient | None = None,
    ) -> None:
        self._models_dir = models_dir
        self._catalog = {item.model_id: item for item in catalog}
        self._client = client or HttpDownloadClient()

    @property
    def models_dir(self) -> Path:
        return self._models_dir

    @property
    def catalog(self) -> tuple[ModelDescriptor, ...]:
        return tuple(self._catalog.values())

    def descriptor(self, model_id: str) -> ModelDescriptor:
        try:
            return self._catalog[model_id]
        except KeyError as error:
            raise ModelInstallError("Неизвестная модель.") from error

    def model_path(self, model_id: str) -> Path | None:
        descriptor = self._catalog.get(model_id)
        if descriptor is None:
            return None
        path = self._models_dir / model_id
        manifest_path = path / self.MANIFEST_NAME
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            expected_size = int(manifest["model_size"])
        except (FileNotFoundError, OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            return None
        model_file = path / "model.bin"
        if (
            manifest.get("model_id") != model_id
            or manifest.get("revision") != descriptor.revision
            or manifest.get("model_sha256") != descriptor.model_sha256
            or not model_file.is_file()
        ):
            return None
        try:
            return path if model_file.stat().st_size == expected_size else None
        except OSError:
            return None

    def is_installed(self, model_id: str) -> bool:
        return self.model_path(model_id) is not None

    def installed_models(self) -> tuple[str, ...]:
        return tuple(item.model_id for item in self.catalog if self.is_installed(item.model_id))

    def install(
        self,
        model_id: str,
        cancellation: CancellationToken,
        on_progress: ModelProgressCallback,
    ) -> Path | None:
        descriptor = self.descriptor(model_id)
        existing = self.model_path(model_id)
        if existing is not None:
            return existing

        self._models_dir.mkdir(parents=True, exist_ok=True)
        staging = self._models_dir / ".downloads" / model_id
        staging.mkdir(parents=True, exist_ok=True)

        sizes = {
            filename: self._client.content_length(descriptor.file_url(filename))
            for filename in descriptor.files
        }
        total_bytes = sum(sizes.values())
        present_bytes = sum(
            min((staging / filename).stat().st_size, sizes[filename])
            for filename in descriptor.files
            if (staging / filename).is_file()
        )
        remaining = max(0, total_bytes - present_bytes)
        free = shutil.disk_usage(self._models_dir).free
        if free < remaining + 100 * 1024 * 1024:
            raise ModelInstallError("Недостаточно места для загрузки модели.")

        received = present_bytes
        on_progress(ModelDownloadProgress(received, total_bytes, "downloading"))
        for filename in descriptor.files:
            if cancellation.is_cancelled:
                return None
            target = staging / filename
            expected_size = sizes[filename]
            current_size = target.stat().st_size if target.is_file() else 0
            if current_size == expected_size:
                continue
            if current_size > expected_size:
                received -= expected_size
                target.unlink()
                current_size = 0

            stream = self._client.stream(descriptor.file_url(filename), current_size)
            if stream.total_bytes != expected_size:
                raise ModelInstallError("Размер файла модели изменился на сервере.")
            if current_size and not stream.resumed:
                received -= current_size
                current_size = 0
            mode = "ab" if current_size else "wb"
            with target.open(mode) as output:
                for chunk in stream.chunks:
                    if cancellation.is_cancelled:
                        return None
                    output.write(chunk)
                    received += len(chunk)
                    on_progress(ModelDownloadProgress(received, total_bytes, "downloading"))
            if target.stat().st_size != expected_size:
                raise ModelInstallError("Файл модели загрузился не полностью.")

        on_progress(ModelDownloadProgress(total_bytes, total_bytes, "verifying"))
        model_file = staging / "model.bin"
        digest = hashlib.sha256()
        with model_file.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                if cancellation.is_cancelled:
                    return None
                digest.update(chunk)
        if digest.hexdigest() != descriptor.model_sha256:
            model_file.unlink(missing_ok=True)
            raise ModelInstallError("Контрольная сумма модели не совпала.")

        try:
            json.loads((staging / "config.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ModelInstallError("Конфигурация модели повреждена.") from error

        manifest = {
            **asdict(descriptor),
            "model_size": model_file.stat().st_size,
        }
        manifest_path = staging / self.MANIFEST_NAME
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        final_path = self._models_dir / model_id
        if final_path.exists():
            raise ModelInstallError("Папка модели уже существует, но не прошла проверку.")
        staging.replace(final_path)
        on_progress(ModelDownloadProgress(total_bytes, total_bytes, "installed"))
        return final_path

    def remove(self, model_id: str) -> bool:
        path = self.model_path(model_id)
        if path is None:
            return False
        shutil.rmtree(path)
        return True
