from __future__ import annotations

import json
import sys
from collections.abc import Sequence
from pathlib import Path

from voxnote.domain.models import DictionaryDescriptor, DictionaryProfile

BUILTIN_MEDICAL_ID = "medical-ru"
CUSTOM_ID = "custom"
NONE_ID = "none"

MIN_TERM_LENGTH = 2
MAX_TERM_LENGTH = 100
MAX_TERMS_LIMIT = 1000


class DictionaryError(Exception):
    """Base exception for dictionary-related errors."""


class DictionaryDecodeError(DictionaryError):
    """Raised when an imported dictionary file cannot be decoded as UTF-8."""


class DictionaryEmptyError(DictionaryError):
    """Raised when an imported dictionary file has no valid terms."""


class LocalDictionaryManager:
    """Manage built-in and user-imported terminology dictionaries locally."""

    def __init__(
        self,
        dictionaries_dir: Path,
        builtin_dir: Path | None = None,
    ) -> None:
        self._dictionaries_dir = dictionaries_dir
        self._builtin_dir = builtin_dir or self._default_builtin_dir()
        self._builtin_medical: DictionaryProfile | None = None
        self._custom_profile: DictionaryProfile | None = None
        self._custom_loaded = False

    @staticmethod
    def _default_builtin_dir() -> Path:
        """Find the built-in dictionaries directory."""
        candidates: list[Path] = []
        if getattr(sys, "frozen", False):
            meipass = getattr(sys, "_MEIPASS", None)
            if meipass:
                candidates.append(Path(meipass) / "resources" / "dictionaries")
            candidates.append(Path(sys.executable).resolve().parent / "resources" / "dictionaries")
        candidates.extend(
            [
                Path(__file__).resolve().parents[3] / "resources" / "dictionaries",
                Path(__file__).resolve().parents[2] / "resources" / "dictionaries",
                Path.cwd() / "resources" / "dictionaries",
            ]
        )
        for candidate in candidates:
            if candidate.is_dir() and (candidate / "medical_ru.json").is_file():
                return candidate
        return candidates[0]

    @property
    def custom_file_path(self) -> Path:
        return self._dictionaries_dir / "custom.json"

    def descriptors(self) -> list[DictionaryDescriptor]:
        """Return available dictionary profiles without loading heavy contents."""
        custom_exists = self.has_custom_dictionary()
        custom_count = 0
        custom_source = ""
        if custom_exists:
            custom = self.get_profile(CUSTOM_ID)
            if custom is not None:
                custom_count = custom.term_count
                custom_source = custom.source

        medical = self.get_profile(BUILTIN_MEDICAL_ID)
        medical_count = medical.term_count if medical is not None else 0

        return [
            DictionaryDescriptor(
                id=NONE_ID,
                name="Без словаря",
                description="Стандартное распознавание без терминологических подсказок",
                term_count=0,
                available=True,
            ),
            DictionaryDescriptor(
                id=BUILTIN_MEDICAL_ID,
                name="Медицинская лекция",
                description="Встроенные медицинские и анатомические термины",
                term_count=medical_count,
                available=medical is not None,
                source="CC-BY-SA 4.0 / Public Domain",
            ),
            DictionaryDescriptor(
                id=CUSTOM_ID,
                name="Свой словарь",
                description=(
                    f"Импортировано: {custom_source} ({custom_count} терминов)"
                    if custom_exists
                    else "Импорт собственного списка терминов из файла .txt"
                ),
                term_count=custom_count,
                available=custom_exists,
                source=custom_source,
            ),
        ]

    def has_custom_dictionary(self) -> bool:
        """Check if a custom dictionary file is present on disk."""
        return self.custom_file_path.is_file()

    def get_profile(self, dictionary_id: str | None) -> DictionaryProfile | None:
        """Retrieve the dictionary profile by identifier."""
        if not dictionary_id or dictionary_id == NONE_ID:
            return None
        if dictionary_id == BUILTIN_MEDICAL_ID:
            return self._load_builtin_medical()
        if dictionary_id == CUSTOM_ID:
            return self._load_custom()
        return None

    def _load_builtin_medical(self) -> DictionaryProfile | None:
        if self._builtin_medical is not None:
            return self._builtin_medical
        medical_file = self._builtin_dir / "medical_ru.json"
        if not medical_file.is_file():
            return None
        try:
            payload = json.loads(medical_file.read_text(encoding="utf-8"))
            terms = tuple(str(term).strip() for term in payload.get("terms", []) if term)
            self._builtin_medical = DictionaryProfile(
                id=BUILTIN_MEDICAL_ID,
                name=payload.get("name", "Медицинская лекция"),
                description=payload.get("description", "Русские медицинские термины"),
                terms=terms,
                source=payload.get("source", ""),
                version=int(payload.get("version", 1)),
            )
            return self._builtin_medical
        except (OSError, json.JSONDecodeError, ValueError):
            return None

    def _load_custom(self) -> DictionaryProfile | None:
        if self._custom_loaded and self._custom_profile is not None:
            return self._custom_profile
        if not self.custom_file_path.is_file():
            self._custom_profile = None
            self._custom_loaded = True
            return None
        try:
            payload = json.loads(self.custom_file_path.read_text(encoding="utf-8"))
            terms = tuple(str(term).strip() for term in payload.get("terms", []) if term)
            self._custom_profile = DictionaryProfile(
                id=CUSTOM_ID,
                name=payload.get("name", "Свой словарь"),
                description=payload.get("description", "Пользовательский словарь терминов"),
                terms=terms,
                source=payload.get("source", ""),
                version=int(payload.get("version", 1)),
            )
            self._custom_loaded = True
            return self._custom_profile
        except (OSError, json.JSONDecodeError, ValueError):
            self._custom_profile = None
            self._custom_loaded = True
            return None

    def import_custom_dictionary(self, source_path: Path) -> DictionaryProfile:
        """Import a user .txt file encoded in UTF-8 into a local custom dictionary."""
        if not source_path.is_file():
            raise DictionaryError(f"Файл не найден: {source_path.name}")

        try:
            raw_text = source_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise DictionaryDecodeError(
                "Файл словаря должен быть сохранён в кодировке UTF-8."
            ) from error
        except OSError as error:
            raise DictionaryError(f"Не удалось прочитать файл: {error}") from error  # noqa: RUF001

        seen_normalized: set[str] = set()
        valid_terms: list[str] = []

        for line in raw_text.splitlines():
            cleaned = line.strip()
            if not cleaned:
                continue
            if len(cleaned) < MIN_TERM_LENGTH or len(cleaned) > MAX_TERM_LENGTH:
                continue
            normalized = cleaned.lower()
            if normalized in seen_normalized:
                continue
            seen_normalized.add(normalized)
            valid_terms.append(cleaned)
            if len(valid_terms) >= MAX_TERMS_LIMIT:
                break

        if not valid_terms:
            raise DictionaryEmptyError(
                "Файл не содержит допустимых терминов (длина от 2 до 100 символов)."
            )

        self._dictionaries_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "id": CUSTOM_ID,
            "name": "Свой словарь",
            "description": f"Импортировано из {source_path.name}",
            "language": "ru",
            "version": 1,
            "source": source_path.name,
            "terms": valid_terms,
        }

        temp_target = self.custom_file_path.with_suffix(".tmp")
        temp_target.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temp_target.replace(self.custom_file_path)

        profile = DictionaryProfile(
            id=CUSTOM_ID,
            name="Свой словарь",
            description=f"Импортировано из {source_path.name}",
            terms=tuple(valid_terms),
            source=source_path.name,
            version=1,
        )
        self._custom_profile = profile
        self._custom_loaded = True
        return profile

    def remove_custom_dictionary(self) -> bool:
        """Remove the local custom dictionary from disk."""
        self._custom_profile = None
        self._custom_loaded = True
        if self.custom_file_path.is_file():
            try:
                self.custom_file_path.unlink()
                return True
            except OSError:
                return False
        return False

    def build_hints(self, dictionary_id: str | None) -> Sequence[str]:
        """Build terms sequence for transcription engine hints."""
        profile = self.get_profile(dictionary_id)
        if profile is None:
            return ()
        return profile.terms
