from voxnote.domain.models import ProgressSnapshot
from voxnote.services.progress import ProgressEstimator


def snapshot(processed: float, total: float | None, elapsed: float) -> ProgressSnapshot:
    return ProgressSnapshot(processed, total, elapsed)


def test_progress_never_moves_backwards() -> None:
    estimator = ProgressEstimator()

    first = estimator.observe(snapshot(40.0, 100.0, 5.0)).snapshot
    second = estimator.observe(snapshot(35.0, 100.0, 6.0)).snapshot

    assert first.processed_seconds == 40.0
    assert second.processed_seconds == 40.0
    assert second.percent == 40.0


def test_eta_waits_for_enough_time_progress_and_samples() -> None:
    estimator = ProgressEstimator()

    for elapsed, processed in ((10.0, 10.0), (20.0, 20.0), (29.0, 29.0)):
        assert estimator.observe(snapshot(processed, 100.0, elapsed)).snapshot.eta_seconds is None

    update = estimator.observe(snapshot(40.0, 100.0, 40.0)).snapshot

    assert update.eta_seconds == 60.0


def test_eta_is_smoothed_against_single_speed_spike() -> None:
    estimator = ProgressEstimator()
    for elapsed, processed in ((10.0, 10.0), (20.0, 20.0), (30.0, 30.0), (40.0, 80.0)):
        update = estimator.observe(snapshot(processed, 200.0, elapsed)).snapshot

    assert update.eta_seconds is None
    for elapsed, processed in ((50.0, 90.0), (60.0, 100.0), (70.0, 110.0)):
        update = estimator.observe(snapshot(processed, 200.0, elapsed)).snapshot
    assert update.eta_seconds == 90.0


def test_progress_updates_are_limited_to_ten_per_second() -> None:
    estimator = ProgressEstimator(ui_interval=0.1)

    notifications = [
        estimator.observe(snapshot(index, 100.0, index / 100)).notify_ui for index in range(20)
    ]

    assert notifications[0] is True
    assert sum(notifications) == 2


def test_unknown_duration_never_invents_percent_or_eta() -> None:
    estimator = ProgressEstimator()

    update = estimator.observe(snapshot(80.0, None, 40.0)).snapshot

    assert update.percent is None
    assert update.eta_seconds is None
