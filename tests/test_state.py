import pytest

from voxnote.domain.state import AppState, AppStateMachine, InvalidStateTransition


def test_happy_path_reaches_completed() -> None:
    machine = AppStateMachine()

    for state in (
        AppState.IDLE,
        AppState.FILE_SELECTED,
        AppState.PREPARING_AUDIO,
        AppState.TRANSCRIBING,
        AppState.FINALIZING,
        AppState.COMPLETED,
    ):
        machine.transition(state)

    assert machine.state is AppState.COMPLETED


def test_invalid_transition_preserves_current_state() -> None:
    machine = AppStateMachine(AppState.IDLE)

    with pytest.raises(InvalidStateTransition):
        machine.transition(AppState.TRANSCRIBING)

    assert machine.state is AppState.IDLE


def test_listener_receives_state_changes_and_can_unsubscribe() -> None:
    machine = AppStateMachine(AppState.IDLE)
    changes: list[tuple[AppState, AppState]] = []
    unsubscribe = machine.subscribe(lambda old, new: changes.append((old, new)))

    machine.transition(AppState.FILE_SELECTED)
    unsubscribe()
    machine.transition(AppState.IDLE)

    assert changes == [(AppState.IDLE, AppState.FILE_SELECTED)]
