from __future__ import annotations

from voxnote.domain.models import DeviceCapabilities, DeviceSelection
from voxnote.services.settings import DevicePreference

MODEL_VRAM_GUIDANCE_MB = {
    "small": 2_048,
    "turbo": 4_096,
    "large-v3": 6_144,
}


class DeviceError(RuntimeError):
    """A device problem already translated into a safe user-facing message."""


class DeviceUnavailableError(DeviceError):
    pass


class DeviceExecutionError(DeviceError):
    pass


class DeviceSelector:
    def __init__(self, capabilities: DeviceCapabilities) -> None:
        self.capabilities = capabilities

    def select(self, preference: DevicePreference, model_id: str) -> DeviceSelection:
        if preference == "cpu":
            return self.cpu_selection()
        if not self.capabilities.cuda_available:
            if preference == "cuda":
                reason = self.capabilities.unavailable_reason or "CUDA недоступна"
                raise DeviceUnavailableError(
                    f"NVIDIA GPU сейчас недоступна: {reason}. Выберите режим «Процессор»."
                )
            return DeviceSelection(
                device="cpu",
                compute_type="int8",
                label="CPU",
                notice="NVIDIA GPU недоступна — используем процессор.",
            )

        compute_type = self._cuda_compute_type()
        notice = self._memory_notice(model_id)
        return DeviceSelection(
            device="cuda",
            compute_type=compute_type,
            label=self.capabilities.gpu_label,
            notice=notice,
        )

    @staticmethod
    def cpu_selection() -> DeviceSelection:
        return DeviceSelection(device="cpu", compute_type="int8", label="CPU")

    def _cuda_compute_type(self) -> str:
        supported = self.capabilities.compute_types
        for compute_type in ("float16", "int8_float16", "int8"):
            if compute_type in supported:
                return compute_type
        raise DeviceUnavailableError(
            "CUDA обнаружена, но подходящий режим вычислений не поддерживается. "
            "Выберите режим «Процессор»."
        )

    def _memory_notice(self, model_id: str) -> str:
        available = self.capabilities.total_memory_mb
        normalized_id = model_id.lower()
        required = next(
            (memory for name, memory in MODEL_VRAM_GUIDANCE_MB.items() if name in normalized_id),
            None,
        )
        if available is None or required is None or available >= required:
            return ""
        available_gb = available / 1024
        required_gb = required / 1024
        return (
            f"Доступно около {available_gb:.1f} ГБ VRAM; для этой модели рекомендуется "
            f"от {required_gb:.0f} ГБ. При ошибке выберите меньшую модель или CPU."
        )
