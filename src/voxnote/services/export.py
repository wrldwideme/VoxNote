from __future__ import annotations

import contextlib
import os
import tempfile
from pathlib import Path

from voxnote.domain.models import TranscriptionResult


def save_transcript(result: TranscriptionResult, target: Path) -> None:
    """Atomically save exactly the text shown to the user."""
    save_text(result.text, target)


def save_text(text: str, target: Path) -> None:
    """Atomically save UTF-8 text without damaging an existing target on failure."""
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=target.parent,
        prefix=f".{target.name}.",
        suffix=".tmp",
        text=True,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(target)
    except BaseException:
        with contextlib.suppress(OSError):
            os.close(descriptor)
        temporary.unlink(missing_ok=True)
        raise
