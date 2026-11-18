from __future__ import annotations

import json
from pathlib import Path

from voxnote.domain.models import HistoryEntry
from voxnote.services.history import LocalHistoryStore


def test_history_empty_on_missing_file(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file)
    assert store.get_entries() == []
    assert store.get_entry("non_existent") is None


def test_add_entry_saves_and_retrieves(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file)

    entry = store.add_entry(
        file_name="lecture.mp3",
        duration_seconds=125.4,
        model_id="turbo",
        device="NVIDIA GeForce RTX 4060",
        dictionary_id="builtin-medical-ru",
        text="Пациенту назначен амоксициллин внутривенно.",
    )

    assert entry.file_name == "lecture.mp3"
    assert entry.duration_formatted == "2:05"
    assert entry.preview == "Пациенту назначен амоксициллин внутривенно."
    assert history_file.is_file()

    entries = store.get_entries()
    assert len(entries) == 1
    assert entries[0].id == entry.id
    assert entries[0].text == "Пациенту назначен амоксициллин внутривенно."

    fetched = store.get_entry(entry.id)
    assert fetched is not None
    assert fetched.id == entry.id
    assert fetched.model_id == "turbo"


def test_add_entry_preview_truncation(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file)

    long_text = "Слово " * 40  # > 120 chars
    entry = store.add_entry(
        file_name="test.wav",
        duration_seconds=None,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text=long_text,
    )

    assert len(entry.preview) <= 125
    assert entry.preview.endswith("…")
    assert entry.duration_formatted == "—"


def test_history_capped_at_max(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file, max_entries=3)

    for i in range(5):
        store.add_entry(
            file_name=f"file_{i}.mp3",
            duration_seconds=float(i),
            model_id="small",
            device="CPU",
            dictionary_id=None,
            text=f"Текст номер {i}",
        )

    entries = store.get_entries()
    assert len(entries) == 3
    # Newest entries should be first: file_4, file_3, file_2
    assert [e.file_name for e in entries] == ["file_4.mp3", "file_3.mp3", "file_2.mp3"]


def test_remove_entry(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file)

    e1 = store.add_entry(
        file_name="1.mp3",
        duration_seconds=10.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Раз",
    )
    e2 = store.add_entry(
        file_name="2.mp3",
        duration_seconds=20.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Два",
    )

    assert len(store.get_entries()) == 2
    assert store.remove_entry(e1.id) is True
    assert store.remove_entry("unknown_id") is False

    remaining = store.get_entries()
    assert len(remaining) == 1
    assert remaining[0].id == e2.id


def test_clear_history(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file)

    store.add_entry(
        file_name="test.mp3",
        duration_seconds=10.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Запись",
    )
    assert history_file.is_file()
    assert len(store.get_entries()) == 1

    store.clear()
    assert store.get_entries() == []
    assert not history_file.is_file()


def test_corrupt_history_file_recovery(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    history_file.write_text("{not valid json", encoding="utf-8")

    store = LocalHistoryStore(history_file)
    assert store.get_entries() == []

    # Writing new entry should overwrite corrupted file cleanly
    store.add_entry(
        file_name="new.mp3",
        duration_seconds=5.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Новый текст",
    )
    payload = json.loads(history_file.read_text(encoding="utf-8"))
    assert len(payload) == 1
    assert payload[0]["text"] == "Новый текст"


def test_history_entry_duration_formatting() -> None:
    entry_short = HistoryEntry(
        id="1",
        created_at="",
        file_name="a.wav",
        duration_seconds=45.2,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="t",
        preview="t",
    )
    assert entry_short.duration_formatted == "0:45"

    entry_hours = HistoryEntry(
        id="2",
        created_at="",
        file_name="b.wav",
        duration_seconds=3665.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="t",
        preview="t",
    )
    assert entry_hours.duration_formatted == "1:01:05"

    entry_none = HistoryEntry(
        id="3",
        created_at="",
        file_name="c.wav",
        duration_seconds=None,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="t",
        preview="t",
    )
    assert entry_none.duration_formatted == "—"


def test_update_entry_text_and_title(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file)

    entry = store.add_entry(
        file_name="lecture.mp3",
        duration_seconds=100.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Исходный распознанный транскрипт.",
    )

    assert entry.display_title == "lecture.mp3"
    assert entry.current_text == "Исходный распознанный транскрипт."
    assert entry.has_edits is False

    # Update title
    assert store.update_entry_title(entry.id, "Фармакология лекция 1") is True
    updated = store.get_entry(entry.id)
    assert updated is not None
    assert updated.display_title == "Фармакология лекция 1"
    assert updated.title == "Фармакология лекция 1"

    # Update edited text
    assert store.update_entry_text(entry.id, "Отредактированный конспект лекции.") is True
    updated = store.get_entry(entry.id)
    assert updated is not None
    # Crucial: original raw transcript must remain unchanged!
    assert updated.text == "Исходный распознанный транскрипт."
    assert updated.edited_text == "Отредактированный конспект лекции."
    assert updated.current_text == "Отредактированный конспект лекции."
    assert updated.has_edits is True


def test_safe_cap_never_deletes_edited_entries(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file, max_entries=2)

    # 1. Add entry 1 and edit it
    e1 = store.add_entry(
        file_name="important.mp3",
        duration_seconds=10.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Важный текст 1",
    )
    store.update_entry_text(e1.id, "Отредактированный важный текст 1")

    # 2. Add entry 2 (unedited)
    store.add_entry(
        file_name="temp2.mp3",
        duration_seconds=20.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Текст 2",
    )

    # 3. Add entry 3 (unedited) -> exceeds max_entries (2).
    # temp2.mp3 should be removed, while edited important.mp3 must be safely retained!
    store.add_entry(
        file_name="temp3.mp3",
        duration_seconds=30.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Текст 3",
    )

    entries = store.get_entries()
    assert len(entries) == 2
    ids = [e.id for e in entries]
    assert e1.id in ids  # Protected!


def test_get_grouped_entries_and_search(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file)

    store.add_entry(
        file_name="cardiology.mp3",
        duration_seconds=50.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Пациент с фибрилляцией предсердий.",  # noqa: RUF001
        title="Кардиология",
    )
    store.add_entry(
        file_name="neurology.mp3",
        duration_seconds=60.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Обследование рефлексов.",
        title="Неврология",
    )

    # Grouped entries should contain "Сегодня"
    groups = store.get_grouped_entries()
    assert len(groups) == 1
    assert groups[0][0] == "Сегодня"
    assert len(groups[0][1]) == 2

    # Search filter
    search_cardio = store.get_grouped_entries(search_query="фибрилляц")
    assert len(search_cardio) == 1
    assert len(search_cardio[0][1]) == 1
    assert search_cardio[0][1][0].display_title == "Кардиология"

    search_empty = store.get_grouped_entries(search_query="несуществующее")
    assert len(search_empty) == 0


def test_add_entry_stores_and_persists_file_path(tmp_path: Path) -> None:
    history_file = tmp_path / "history.json"
    store = LocalHistoryStore(history_file)

    sample_audio_path = r"C:\Users\wrld alone\Music\sample.m4a"
    entry = store.add_entry(
        file_name="sample.m4a",
        duration_seconds=120.0,
        model_id="small",
        device="CPU",
        dictionary_id=None,
        text="Тестовая расшифровка.",
        file_path=sample_audio_path,
    )

    assert entry.file_path == sample_audio_path

    # Reload from disk to verify serialization and deserialization
    reloaded_store = LocalHistoryStore(history_file)
    entries = reloaded_store.get_entries()
    assert len(entries) == 1
    assert entries[0].file_path == sample_audio_path
