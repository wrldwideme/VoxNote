"""External adapters used by VoxNote."""

from voxnote.infrastructure.audio_adapter import AudioInspectionError, PyAVAudioService
from voxnote.infrastructure.device_adapter import CTranslate2DeviceDetector
from voxnote.infrastructure.device_routing import DeviceRoutingTranscriptionService
from voxnote.infrastructure.faster_whisper_adapter import FasterWhisperTranscriptionService
from voxnote.infrastructure.nvidia_runtime import register_nvidia_dll_directories

__all__ = [
    "AudioInspectionError",
    "CTranslate2DeviceDetector",
    "DeviceRoutingTranscriptionService",
    "FasterWhisperTranscriptionService",
    "PyAVAudioService",
    "register_nvidia_dll_directories",
]
