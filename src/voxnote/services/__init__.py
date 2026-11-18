"""Infrastructure-independent services used by VoxNote."""

from voxnote.services.device import DeviceError, DeviceSelector
from voxnote.services.diagnostics import TechnicalDiagnostics
from voxnote.services.dictionary import (
    BUILTIN_MEDICAL_ID,
    CUSTOM_ID,
    NONE_ID,
    DictionaryDecodeError,
    DictionaryEmptyError,
    DictionaryError,
    LocalDictionaryManager,
)
from voxnote.services.history import LocalHistoryStore
from voxnote.services.paths import AppPaths
from voxnote.services.progress import ProgressEstimator, ProgressUpdate
from voxnote.services.settings import AppSettings, SettingsStore

__all__ = [
    "BUILTIN_MEDICAL_ID",
    "CUSTOM_ID",
    "NONE_ID",
    "AppPaths",
    "AppSettings",
    "DeviceError",
    "DeviceSelector",
    "DictionaryDecodeError",
    "DictionaryEmptyError",
    "DictionaryError",
    "LocalDictionaryManager",
    "LocalHistoryStore",
    "ProgressEstimator",
    "ProgressUpdate",
    "SettingsStore",
    "TechnicalDiagnostics",
]
