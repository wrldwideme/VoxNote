from __future__ import annotations

import json
from pathlib import Path

import pytest

from voxnote.services.diagnostics import TechnicalDiagnostics


def test_log_contains_only_allowlisted_sanitized_fields(tmp_path: Path) -> None:
    log_file = tmp_path / "logs" / "voxnote.jsonl"
    diagnostics = TechnicalDiagnostics(log_file)

    diagnostics.record(
        "transcription_started",
        model_id="large-v3",
        device="cuda",
        dictionary_id="medical-ru",
        duration_seconds=125,
    )
    diagnostics.record("transcription_failed", error_type="C:\\Users\\name\\lecture.m4a")

    records = [json.loads(line) for line in log_file.read_text(encoding="utf-8").splitlines()]
    assert records[0]["model_id"] == "large-v3"
    assert records[0]["duration_seconds"] == 125
    assert records[1]["error_type"] == "redacted"
    assert "lecture.m4a" not in log_file.read_text(encoding="utf-8")


def test_log_rejects_fields_that_could_accidentally_contain_user_content(
    tmp_path: Path,
) -> None:
    diagnostics = TechnicalDiagnostics(tmp_path / "voxnote.jsonl")

    with pytest.raises(ValueError, match="Unsupported diagnostic fields"):
        diagnostics.record("event", transcript="Секретный текст")

    assert not (tmp_path / "voxnote.jsonl").exists()


def test_report_does_not_include_paths_or_free_form_content(tmp_path: Path) -> None:
    diagnostics = TechnicalDiagnostics(tmp_path / "voxnote.jsonl")

    report = diagnostics.build_report(
        app_version="0.1.0.dev0",
        selected_model="C:\\Users\\name\\private-model",
        device_preference="auto",
        selected_dictionary="термин пациента",
        theme="dark",
        reduce_motion=True,
        cuda_available=True,
    )

    assert "C:\\Users" not in report
    assert "термин пациента" not in report
    assert "скрыто" in report
    assert "Телеметрия: отсутствует" in report


def test_log_rotates_without_interrupting_new_events(tmp_path: Path) -> None:
    log_file = tmp_path / "voxnote.jsonl"
    diagnostics = TechnicalDiagnostics(log_file, max_bytes=1024)

    for _ in range(30):
        diagnostics.record("transcription_completed", elapsed_ms=1234)

    assert log_file.exists()
    assert log_file.with_suffix(".jsonl.1").exists()
    assert "transcription_completed" in log_file.read_text(encoding="utf-8")
