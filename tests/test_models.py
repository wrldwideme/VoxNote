import pytest

from voxnote.domain.models import ProgressSnapshot


@pytest.mark.parametrize(
    ("processed", "total", "expected"),
    [
        (0.0, 100.0, 0.0),
        (25.0, 100.0, 25.0),
        (150.0, 100.0, 100.0),
        (-5.0, 100.0, 0.0),
    ],
)
def test_progress_percent_is_clamped(processed: float, total: float, expected: float) -> None:
    snapshot = ProgressSnapshot(
        processed_seconds=processed,
        total_seconds=total,
        elapsed_seconds=1.0,
    )
    assert snapshot.percent == expected
    assert snapshot.remaining_percent == 100.0 - expected


def test_progress_without_duration_is_indeterminate() -> None:
    snapshot = ProgressSnapshot(
        processed_seconds=10.0,
        total_seconds=None,
        elapsed_seconds=1.0,
    )
    assert snapshot.percent is None
    assert snapshot.remaining_percent is None
