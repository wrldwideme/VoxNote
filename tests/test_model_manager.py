from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from voxnote.application.background import CancellationToken
from voxnote.services.model_manager import (
    DownloadStream,
    LocalModelManager,
    ModelDescriptor,
    ModelDownloadProgress,
    ModelInstallError,
)


class FakeDownloadClient:
    def __init__(self, files: dict[str, bytes]) -> None:
        self.files = files
        self.starts: list[tuple[str, int]] = []

    @staticmethod
    def _filename(url: str) -> str:
        return url.split("?", 1)[0].rsplit("/", 1)[1]

    def content_length(self, url: str) -> int:
        return len(self.files[self._filename(url)])

    def stream(self, url: str, start: int) -> DownloadStream:
        filename = self._filename(url)
        self.starts.append((filename, start))
        data = self.files[filename]
        chunks = iter((data[start : start + 3], data[start + 3 :]))
        return DownloadStream(total_bytes=len(data), resumed=start > 0, chunks=chunks)


def make_descriptor(model_data: bytes, *, digest: str | None = None) -> ModelDescriptor:
    return ModelDescriptor(
        model_id="test-model",
        display_name="Тестовая",
        summary="Тест",
        repository="example/model",
        revision="abc123",
        files=("config.json", "model.bin"),
        model_sha256=digest or hashlib.sha256(model_data).hexdigest(),
        advertised_bytes=len(model_data) + 2,
    )


def test_model_install_is_verified_and_atomic(tmp_path: Path) -> None:
    model_data = b"model payload"
    client = FakeDownloadClient({"config.json": b"{}", "model.bin": model_data})
    descriptor = make_descriptor(model_data)
    manager = LocalModelManager(tmp_path / "models", catalog=(descriptor,), client=client)
    snapshots: list[ModelDownloadProgress] = []

    installed = manager.install("test-model", CancellationToken(), snapshots.append)

    assert installed == tmp_path / "models" / "test-model"
    assert manager.model_path("test-model") == installed
    assert manager.installed_models() == ("test-model",)
    assert snapshots[-1].phase == "installed"
    assert snapshots[-1].percent == 100.0
    assert not (tmp_path / "models" / ".downloads" / "test-model").exists()


def test_model_install_rejects_wrong_checksum(tmp_path: Path) -> None:
    model_data = b"corrupted"
    client = FakeDownloadClient({"config.json": b"{}", "model.bin": model_data})
    descriptor = make_descriptor(model_data, digest="0" * 64)
    manager = LocalModelManager(tmp_path / "models", catalog=(descriptor,), client=client)

    with pytest.raises(ModelInstallError, match="Контрольная сумма"):
        manager.install("test-model", CancellationToken(), lambda _progress: None)

    assert manager.model_path("test-model") is None
    assert not (tmp_path / "models" / "test-model").exists()


def test_cancelled_download_never_becomes_installed(tmp_path: Path) -> None:
    model_data = b"model payload"
    client = FakeDownloadClient({"config.json": b"{}", "model.bin": model_data})
    descriptor = make_descriptor(model_data)
    manager = LocalModelManager(tmp_path / "models", catalog=(descriptor,), client=client)
    cancellation = CancellationToken()

    def cancel_after_first_bytes(progress: ModelDownloadProgress) -> None:
        if progress.received_bytes:
            cancellation.cancel()

    installed = manager.install("test-model", cancellation, cancel_after_first_bytes)

    assert installed is None
    assert manager.model_path("test-model") is None


def test_installed_model_can_be_removed(tmp_path: Path) -> None:
    model_data = b"model payload"
    client = FakeDownloadClient({"config.json": b"{}", "model.bin": model_data})
    descriptor = make_descriptor(model_data)
    manager = LocalModelManager(tmp_path / "models", catalog=(descriptor,), client=client)
    manager.install("test-model", CancellationToken(), lambda _progress: None)

    assert manager.remove("test-model") is True
    assert manager.is_installed("test-model") is False


def test_cancelled_download_resumes_partial_file(tmp_path: Path) -> None:
    model_data = b"long model payload"
    client = FakeDownloadClient({"config.json": b"{}", "model.bin": model_data})
    base = make_descriptor(model_data)
    descriptor = ModelDescriptor(
        model_id=base.model_id,
        display_name=base.display_name,
        summary=base.summary,
        repository=base.repository,
        revision=base.revision,
        files=("model.bin", "config.json"),
        model_sha256=base.model_sha256,
        advertised_bytes=base.advertised_bytes,
    )
    manager = LocalModelManager(tmp_path / "models", catalog=(descriptor,), client=client)
    cancellation = CancellationToken()

    def cancel_after_first_chunk(progress: ModelDownloadProgress) -> None:
        if progress.received_bytes >= 3:
            cancellation.cancel()

    assert manager.install("test-model", cancellation, cancel_after_first_chunk) is None
    installed = manager.install("test-model", CancellationToken(), lambda _progress: None)

    assert installed is not None
    assert ("model.bin", 3) in client.starts
