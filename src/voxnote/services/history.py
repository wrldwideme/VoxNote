from __future__ import annotations

import json
import uuid
from contextlib import suppress
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path

from voxnote.domain.models import HistoryEntry, TranscriptSegment

MAX_HISTORY_ENTRIES = 50


class LocalHistoryStore:
    """Locally manage past transcription sessions without sending any data over the network."""

    def __init__(self, history_file: Path, max_entries: int = MAX_HISTORY_ENTRIES) -> None:
        self._history_file = history_file
        self._max_entries = max_entries
        self._cache: list[HistoryEntry] | None = None

    def add_entry(
        self,
        *,
        file_name: str,
        duration_seconds: float | None,
        model_id: str,
        device: str,
        dictionary_id: str | None,
        text: str,
        title: str = "",
        edited_text: str | None = None,
        segments: tuple[TranscriptSegment, ...] = (),
    ) -> HistoryEntry:
        """Record a completed transcription in the history."""
        cleaned_text = text.strip()
        effective_text = (edited_text if edited_text is not None else cleaned_text).strip()
        preview = effective_text[:120].replace("\n", " ").strip()
        if len(effective_text) > 120:
            preview += "…"

        entry = HistoryEntry(
            id=uuid.uuid4().hex[:12],
            created_at=datetime.now().strftime("%d.%m.%Y %H:%M"),
            file_name=file_name,
            duration_seconds=duration_seconds,
            model_id=model_id,
            device=device,
            dictionary_id=dictionary_id,
            text=cleaned_text,
            preview=preview,
            title=title.strip(),
            edited_text=edited_text,
            segments=segments,
        )

        entries = self.get_entries()
        updated_entries = [entry] + [item for item in entries if item.id != entry.id]
        capped_entries = self._cap_entries(updated_entries)

        self._save(capped_entries)
        return entry

    def _cap_entries(self, entries: list[HistoryEntry]) -> list[HistoryEntry]:
        """Safely cap history without silently deleting user-edited entries."""
        if len(entries) <= self._max_entries:
            return entries

        to_remove_count = len(entries) - self._max_entries
        result = list(entries)

        # Remove oldest unedited entries first (scanning backwards)
        i = len(result) - 1
        while i >= 0 and to_remove_count > 0:
            entry = result[i]
            is_protected = entry.has_edits or bool(entry.title and entry.title != entry.file_name)
            if not is_protected:
                result.pop(i)
                to_remove_count -= 1
            i -= 1

        # If all entries are user-edited notes, preserve them safely
        return result

    def get_entries(self) -> list[HistoryEntry]:
        """Return all recorded sessions ordered from newest to oldest."""
        if self._cache is not None:
            return list(self._cache)

        if not self._history_file.is_file():
            self._cache = []
            return []

        try:
            payload = json.loads(self._history_file.read_text(encoding="utf-8"))
            if not isinstance(payload, list):
                self._cache = []
                return []

            entries: list[HistoryEntry] = []
            for item in payload:
                if isinstance(item, dict) and "id" in item and "text" in item:
                    edited_val = item.get("edited_text")
                    edited_text = str(edited_val) if edited_val is not None else None
                    raw_segments = item.get("segments")
                    parsed_segments: list[TranscriptSegment] = []
                    if isinstance(raw_segments, list):
                        for seg in raw_segments:
                            if isinstance(seg, dict) and "text" in seg:
                                parsed_segments.append(
                                    TranscriptSegment(
                                        start=float(seg.get("start", 0.0)),
                                        end=float(seg.get("end", 0.0)),
                                        text=str(seg.get("text", "")),
                                    )
                                )
                    entries.append(
                        HistoryEntry(
                            id=str(item["id"]),
                            created_at=str(item.get("created_at", "")),
                            file_name=str(item.get("file_name", "Запись")),
                            duration_seconds=item.get("duration_seconds"),
                            model_id=str(item.get("model_id", "small")),
                            device=str(item.get("device", "CPU")),
                            dictionary_id=item.get("dictionary_id"),
                            text=str(item["text"]),
                            preview=str(item.get("preview", "")),
                            title=str(item.get("title", "")),
                            edited_text=edited_text,
                            segments=tuple(parsed_segments),
                        )
                    )
            self._cache = entries
            return list(entries)
        except (OSError, json.JSONDecodeError, ValueError):
            self._cache = []
            return []

    def get_entry(self, entry_id: str) -> HistoryEntry | None:
        """Find an entry by its unique identifier."""
        for item in self.get_entries():
            if item.id == entry_id:
                return item
        return None

    def update_entry_text(self, entry_id: str, edited_text: str) -> bool:
        """Update the edited text of a note without modifying the raw original transcript."""
        entries = self.get_entries()
        updated: list[HistoryEntry] = []
        found = False

        for item in entries:
            if item.id == entry_id:
                cleaned = edited_text.strip()
                preview = cleaned[:120].replace("\n", " ").strip()
                if len(cleaned) > 120:
                    preview += "…"
                item = HistoryEntry(
                    id=item.id,
                    created_at=item.created_at,
                    file_name=item.file_name,
                    duration_seconds=item.duration_seconds,
                    model_id=item.model_id,
                    device=item.device,
                    dictionary_id=item.dictionary_id,
                    text=item.text,  # Original transcript stays intact
                    preview=preview,
                    title=item.title,
                    edited_text=edited_text,
                )
                found = True
            updated.append(item)

        if found:
            self._save(updated)
        return found

    def update_entry_title(self, entry_id: str, title: str) -> bool:
        """Update the custom lecture title for an entry."""
        entries = self.get_entries()
        updated: list[HistoryEntry] = []
        found = False

        for item in entries:
            if item.id == entry_id:
                item = HistoryEntry(
                    id=item.id,
                    created_at=item.created_at,
                    file_name=item.file_name,
                    duration_seconds=item.duration_seconds,
                    model_id=item.model_id,
                    device=item.device,
                    dictionary_id=item.dictionary_id,
                    text=item.text,
                    preview=item.preview,
                    title=title.strip(),
                    edited_text=item.edited_text,
                )
                found = True
            updated.append(item)

        if found:
            self._save(updated)
        return found

    def get_grouped_entries(self, search_query: str = "") -> list[tuple[str, list[HistoryEntry]]]:
        """Return history entries grouped by date."""
        all_entries = self.get_entries()
        query = search_query.strip().lower()

        filtered: list[HistoryEntry] = []
        for e in all_entries:
            if not query:
                filtered.append(e)
            else:
                matches_title = query in e.display_title.lower()
                matches_file = query in e.file_name.lower()
                matches_text = query in e.current_text.lower()
                if matches_title or matches_file or matches_text:
                    filtered.append(e)

        today = datetime.now().date()
        week_ago = today - timedelta(days=7)

        today_items: list[HistoryEntry] = []
        week_items: list[HistoryEntry] = []
        earlier_items: list[HistoryEntry] = []

        for e in filtered:
            entry_date = None
            with suppress(ValueError):
                entry_date = datetime.strptime(e.created_at, "%d.%m.%Y %H:%M").date()

            if entry_date is not None:
                if entry_date == today:
                    today_items.append(e)
                elif entry_date >= week_ago:
                    week_items.append(e)
                else:
                    earlier_items.append(e)
            else:
                earlier_items.append(e)

        groups: list[tuple[str, list[HistoryEntry]]] = []
        if today_items:
            groups.append(("Сегодня", today_items))
        if week_items:
            groups.append(("На этой неделе", week_items))  # noqa: RUF001
        if earlier_items:
            groups.append(("Ранее", earlier_items))
        return groups

    def remove_entry(self, entry_id: str) -> bool:
        """Remove a single history entry by its ID."""
        entries = self.get_entries()
        filtered = [item for item in entries if item.id != entry_id]
        if len(filtered) == len(entries):
            return False
        self._save(filtered)
        return True

    def clear(self) -> None:
        """Clear all transcription history."""
        self._cache = []
        if self._history_file.is_file():
            with suppress(OSError):
                self._history_file.unlink()

    def _save(self, entries: list[HistoryEntry]) -> None:
        self._cache = list(entries)
        self._history_file.parent.mkdir(parents=True, exist_ok=True)
        temp_file = self._history_file.with_suffix(".tmp")
        payload = [asdict(e) for e in entries]
        temp_file.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temp_file.replace(self._history_file)
