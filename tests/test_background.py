from threading import Event

import pytest

from voxnote.application.background import BackgroundTaskRunner, CancellationToken


def test_background_runner_returns_result() -> None:
    with BackgroundTaskRunner() as runner:
        handle = runner.submit(lambda token: "cancelled" if token.is_cancelled else "done")
        assert handle.future.result(timeout=1) == "done"


def test_background_runner_signals_cancellation() -> None:
    started = Event()
    release = Event()

    def operation(token: CancellationToken) -> bool:
        started.set()
        release.wait(timeout=1)
        return token.is_cancelled

    runner = BackgroundTaskRunner()
    handle = runner.submit(operation)
    assert started.wait(timeout=1)
    handle.token.cancel()
    release.set()

    assert handle.future.result(timeout=1) is True
    runner.shutdown()


def test_closed_runner_rejects_new_tasks() -> None:
    runner = BackgroundTaskRunner()
    runner.shutdown()

    with pytest.raises(RuntimeError, match="closed"):
        runner.submit(lambda _token: None)
