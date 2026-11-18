from __future__ import annotations

import json
from pathlib import Path

import pytest

from voxnote.domain.models import DictionaryProfile
from voxnote.services.dictionary import (
    BUILTIN_MEDICAL_ID,
    CUSTOM_ID,
    NONE_ID,
    DictionaryDecodeError,
    DictionaryEmptyError,
    DictionaryError,
    LocalDictionaryManager,
)


def test_builtin_medical_dictionary_file_is_valid() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    medical_file = repo_root / "resources" / "dictionaries" / "medical_ru.json"
    assert medical_file.is_file()

    payload = json.loads(medical_file.read_text(encoding="utf-8"))
    assert payload["id"] == "medical-ru"
    assert payload["language"] == "ru"
    assert payload["version"] >= 1
    assert "source" in payload and len(payload["source"]) > 5
    assert "license" in payload

    terms = payload["terms"]
    assert isinstance(terms, list)
    assert len(terms) >= 100

    lower_seen: set[str] = set()
    for term in terms:
        assert isinstance(term, str)
        assert 2 <= len(term.strip()) <= 100
        normalized = term.lower().strip()
        assert normalized not in lower_seen, f"Duplicate term found: {term}"
        lower_seen.add(normalized)


def test_local_dictionary_manager_builtins_and_descriptors(tmp_path: Path) -> None:
    dict_dir = tmp_path / "dictionaries"
    manager = LocalDictionaryManager(dict_dir)

    descriptors = manager.descriptors()
    assert len(descriptors) == 3

    ids = [d.id for d in descriptors]
    assert ids == [NONE_ID, BUILTIN_MEDICAL_ID, CUSTOM_ID]

    none_desc = descriptors[0]
    assert none_desc.available is True
    assert none_desc.term_count == 0

    med_desc = descriptors[1]
    assert med_desc.available is True
    assert med_desc.term_count >= 100

    custom_desc = descriptors[2]
    assert custom_desc.available is False
    assert custom_desc.term_count == 0


def test_import_custom_dictionary_utf8_success(tmp_path: Path) -> None:
    dict_dir = tmp_path / "dictionaries"
    manager = LocalDictionaryManager(dict_dir)

    source_txt = tmp_path / "terms.txt"
    source_txt.write_text(
        "ацетилхолин\n"
        "\n"
        "  электрокардиография  \n"
        "Ацетилхолин\n"  # duplicate case-insensitive
        "  \n"
        "аритмия\n",
        encoding="utf-8",
    )

    profile = manager.import_custom_dictionary(source_txt)
    assert isinstance(profile, DictionaryProfile)
    assert profile.id == CUSTOM_ID
    assert profile.term_count == 3
    assert profile.terms == ("ацетилхолин", "электрокардиография", "аритмия")

    assert manager.has_custom_dictionary() is True
    custom_loaded = manager.get_profile(CUSTOM_ID)
    assert custom_loaded is not None
    assert custom_loaded.terms == profile.terms

    descriptors = manager.descriptors()
    custom_desc = next(d for d in descriptors if d.id == CUSTOM_ID)
    assert custom_desc.available is True
    assert custom_desc.term_count == 3
    assert "terms.txt" in custom_desc.source


def test_import_custom_dictionary_rejects_non_utf8(tmp_path: Path) -> None:
    dict_dir = tmp_path / "dictionaries"
    manager = LocalDictionaryManager(dict_dir)

    source_txt = tmp_path / "win1251.txt"
    # Write Windows-1251 text that is invalid in UTF-8
    source_txt.write_bytes("аритмия".encode("windows-1251"))

    with pytest.raises(DictionaryDecodeError, match="UTF-8"):
        manager.import_custom_dictionary(source_txt)

    assert manager.has_custom_dictionary() is False


def test_import_custom_dictionary_rejects_empty_file(tmp_path: Path) -> None:
    dict_dir = tmp_path / "dictionaries"
    manager = LocalDictionaryManager(dict_dir)

    source_txt = tmp_path / "empty.txt"
    source_txt.write_text("   \n\n a \n", encoding="utf-8")  # "a" has length 1 (< min 2)

    with pytest.raises(DictionaryEmptyError, match="допустимых терминов"):
        manager.import_custom_dictionary(source_txt)


def test_import_custom_dictionary_filters_oversized_terms_and_caps(tmp_path: Path) -> None:
    dict_dir = tmp_path / "dictionaries"
    manager = LocalDictionaryManager(dict_dir)

    source_txt = tmp_path / "large.txt"
    long_term = "x" * 105
    lines = [f"термин_{i}" for i in range(1200)]
    lines.append(long_term)
    source_txt.write_text("\n".join(lines), encoding="utf-8")

    profile = manager.import_custom_dictionary(source_txt)
    # Must cap at MAX_TERMS_LIMIT (1000)
    assert profile.term_count == 1000
    assert long_term not in profile.terms


def test_import_missing_file_raises_error(tmp_path: Path) -> None:
    dict_dir = tmp_path / "dictionaries"
    manager = LocalDictionaryManager(dict_dir)

    with pytest.raises(DictionaryError, match="не найден"):
        manager.import_custom_dictionary(tmp_path / "missing.txt")


def test_remove_custom_dictionary(tmp_path: Path) -> None:
    dict_dir = tmp_path / "dictionaries"
    manager = LocalDictionaryManager(dict_dir)

    source_txt = tmp_path / "my_terms.txt"
    source_txt.write_text("миокардит\nперикардит\n", encoding="utf-8")  # noqa: RUF001
    manager.import_custom_dictionary(source_txt)
    assert manager.has_custom_dictionary() is True

    removed = manager.remove_custom_dictionary()
    assert removed is True
    assert manager.has_custom_dictionary() is False
    assert manager.get_profile(CUSTOM_ID) is None

    # Repeated removal returns False cleanly
    assert manager.remove_custom_dictionary() is False


def test_build_hints(tmp_path: Path) -> None:
    dict_dir = tmp_path / "dictionaries"
    manager = LocalDictionaryManager(dict_dir)

    assert manager.build_hints(None) == ()
    assert manager.build_hints(NONE_ID) == ()

    med_hints = manager.build_hints(BUILTIN_MEDICAL_ID)
    assert len(med_hints) >= 100
    assert "ацетилхолин" in med_hints

    # Before custom is imported
    assert manager.build_hints(CUSTOM_ID) == ()

    source_txt = tmp_path / "custom.txt"
    source_txt.write_text("синдром\nсимптом\n", encoding="utf-8")  # noqa: RUF001
    manager.import_custom_dictionary(source_txt)

    custom_hints = manager.build_hints(CUSTOM_ID)
    assert custom_hints == ("синдром", "симптом")
