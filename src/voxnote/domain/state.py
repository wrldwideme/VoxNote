from __future__ import annotations

from collections.abc import Callable
from enum import StrEnum


class AppState(StrEnum):
    STARTING = "starting"
    ONBOARDING = "onboarding"
    MODEL_REQUIRED = "model_required"
    IDLE = "idle"
    FILE_SELECTED = "file_selected"
    PREPARING_AUDIO = "preparing_audio"
    LOADING_MODEL = "loading_model"
    TRANSCRIBING = "transcribing"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ERROR = "error"


_ALLOWED_TRANSITIONS: dict[AppState, frozenset[AppState]] = {
    AppState.STARTING: frozenset(
        {AppState.ONBOARDING, AppState.MODEL_REQUIRED, AppState.IDLE, AppState.ERROR}
    ),
    AppState.ONBOARDING: frozenset(
        {
            AppState.MODEL_REQUIRED,
            AppState.LOADING_MODEL,
            AppState.IDLE,
            AppState.FILE_SELECTED,
            AppState.ERROR,
        }
    ),
    AppState.MODEL_REQUIRED: frozenset(
        {
            AppState.LOADING_MODEL,
            AppState.ONBOARDING,
            AppState.IDLE,
            AppState.FILE_SELECTED,
            AppState.ERROR,
        }
    ),
    AppState.IDLE: frozenset(
        {AppState.FILE_SELECTED, AppState.MODEL_REQUIRED, AppState.COMPLETED, AppState.ERROR}
    ),
    AppState.FILE_SELECTED: frozenset(
        {
            AppState.IDLE,
            AppState.PREPARING_AUDIO,
            AppState.MODEL_REQUIRED,
            AppState.COMPLETED,
            AppState.ERROR,
        }
    ),
    AppState.PREPARING_AUDIO: frozenset(
        {
            AppState.LOADING_MODEL,
            AppState.TRANSCRIBING,
            AppState.CANCELLED,
            AppState.ERROR,
        }
    ),
    AppState.LOADING_MODEL: frozenset(
        {
            AppState.MODEL_REQUIRED,
            AppState.FILE_SELECTED,
            AppState.TRANSCRIBING,
            AppState.CANCELLED,
            AppState.ERROR,
        }
    ),
    AppState.TRANSCRIBING: frozenset({AppState.FINALIZING, AppState.CANCELLED, AppState.ERROR}),
    AppState.FINALIZING: frozenset({AppState.COMPLETED, AppState.CANCELLED, AppState.ERROR}),
    AppState.COMPLETED: frozenset({AppState.IDLE, AppState.FILE_SELECTED, AppState.ERROR}),
    AppState.CANCELLED: frozenset(
        {AppState.IDLE, AppState.FILE_SELECTED, AppState.COMPLETED, AppState.ERROR}
    ),
    AppState.ERROR: frozenset(
        {
            AppState.IDLE,
            AppState.FILE_SELECTED,
            AppState.MODEL_REQUIRED,
            AppState.COMPLETED,
            AppState.ERROR,
        }
    ),
}


class InvalidStateTransition(ValueError):
    """Raised when the application attempts an unsupported state transition."""


StateListener = Callable[[AppState, AppState], None]


class AppStateMachine:
    def __init__(self, initial: AppState = AppState.STARTING) -> None:
        self._state = initial
        self._listeners: list[StateListener] = []

    @property
    def state(self) -> AppState:
        return self._state

    def subscribe(self, listener: StateListener) -> Callable[[], None]:
        self._listeners.append(listener)

        def unsubscribe() -> None:
            if listener in self._listeners:
                self._listeners.remove(listener)

        return unsubscribe

    def can_transition(self, target: AppState) -> bool:
        return target == self._state or target in _ALLOWED_TRANSITIONS[self._state]

    def transition(self, target: AppState) -> None:
        if target == self._state:
            return
        if not self.can_transition(target):
            raise InvalidStateTransition(f"Cannot transition from {self._state} to {target}")

        previous = self._state
        self._state = target
        for listener in tuple(self._listeners):
            listener(previous, target)
