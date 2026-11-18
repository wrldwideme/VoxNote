from pathlib import Path

import pytest

from voxnote.domain.models import TranscriptionResult
from voxnote.services.export import save_text, save_transcript


def test_transcript_is_saved_as_exact_utf8_text(tmp_path: Path) -> None:
    target = tmp_path / "лекция.txt"
    result = TranscriptionResult(
        text="Привет, мир!",
        model_id="small",
        device="cpu",
    )

    save_transcript(result, target)

    assert target.read_text(encoding="utf-8") == result.text
    assert not list(tmp_path.glob("*.tmp"))


def test_text_export_replaces_existing_file_atomically(tmp_path: Path) -> None:
    target = tmp_path / "лекция.txt"
    target.write_text("Старый текст", encoding="utf-8")

    save_text("Новый текст", target)

    assert target.read_text(encoding="utf-8") == "Новый текст"
    assert not list(tmp_path.glob("*.tmp"))


def test_failed_replace_keeps_existing_file_and_removes_temporary_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = tmp_path / "лекция.txt"
    target.write_text("Исходный текст", encoding="utf-8")
    original_replace = Path.replace

    def fail_for_target(path: Path, replacement: Path) -> Path:
        if replacement == target:
            raise PermissionError("read only")
        return original_replace(path, replacement)

    monkeypatch.setattr(Path, "replace", fail_for_target)

    with pytest.raises(PermissionError):
        save_text("Новый текст", target)

    assert target.read_text(encoding="utf-8") == "Исходный текст"
    assert not list(tmp_path.glob("*.tmp"))
