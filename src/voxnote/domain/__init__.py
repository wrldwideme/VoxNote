"""Domain types and state transitions for VoxNote."""

from voxnote.domain.models import (
    DeviceCapabilities,
    DeviceSelection,
    ProgressSnapshot,
    TranscriptionJob,
    TranscriptionResult,
)
from voxnote.domain.state import AppState, AppStateMachine, InvalidStateTransition

__all__ = [
    "AppState",
    "AppStateMachine",
    "DeviceCapabilities",
    "DeviceSelection",
    "InvalidStateTransition",
    "ProgressSnapshot",
    "TranscriptionJob",
    "TranscriptionResult",
]
