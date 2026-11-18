from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import av
import numpy as np
from av.audio.stream import AudioStream

from voxnote.application.background import CancellationToken
from voxnote.domain.models import AudioMetadata


class AudioInspectionError(ValueError):
    """The selected file does not contain a readable audio stream."""


class PyAVAudioService:
    def __init__(self, waveform_points: int = 144) -> None:
        if waveform_points < 16:
            raise ValueError("waveform_points must be at least 16")
        self._waveform_points = waveform_points

    def inspect(self, path: Path, cancellation: CancellationToken) -> AudioMetadata | None:
        if not path.is_file():
            raise AudioInspectionError("Аудиофайл недоступен.")
        try:
            if path.stat().st_size == 0:
                raise AudioInspectionError("Выбран пустой аудиофайл.")
        except OSError as error:
            raise AudioInspectionError("Нет доступа к выбранному аудиофайлу.") from error

        try:
            with av.open(str(path), mode="r") as container:
                stream = next(
                    (
                        cast(AudioStream, candidate)
                        for candidate in container.streams
                        if candidate.type == "audio"
                    ),
                    None,
                )
                if stream is None:
                    raise AudioInspectionError("В файле не найден аудиопоток.")  # noqa: RUF001

                declared_duration = 0.0
                if stream.duration is not None and stream.time_base is not None:
                    declared_duration = float(stream.duration * stream.time_base)
                elif container.duration is not None:
                    declared_duration = float(container.duration / av.time_base)

                timed_peaks: list[tuple[float, float]] = []
                decoded_duration = 0.0
                for frame in container.decode(stream):
                    if not isinstance(frame, av.AudioFrame):
                        continue
                    if cancellation.is_cancelled:
                        return None
                    frame_duration = frame.samples / frame.sample_rate if frame.sample_rate else 0.0
                    timestamp = float(frame.time) if frame.time is not None else decoded_duration
                    decoded_duration = max(decoded_duration, timestamp + frame_duration)
                    timed_peaks.append((timestamp, self._frame_peak(frame.to_ndarray())))
        except AudioInspectionError:
            raise
        except (av.FFmpegError, OSError, ValueError) as error:
            raise AudioInspectionError(
                "Не удалось прочитать аудио. Файл может быть повреждён или иметь неверный формат."  # noqa: RUF001
            ) from error

        duration = max(declared_duration, decoded_duration)
        if duration <= 0 or not timed_peaks:
            raise AudioInspectionError("В файле не обнаружено звука.")  # noqa: RUF001

        waveform = self._build_waveform(timed_peaks, duration)
        codec_context = stream.codec_context
        codec = codec_context.name or "audio"
        channels = codec_context.layout.nb_channels
        return AudioMetadata(
            duration_seconds=duration,
            sample_rate=codec_context.sample_rate,
            channels=channels,
            codec=codec,
            waveform=waveform,
        )

    @staticmethod
    def _frame_peak(array: np.ndarray[Any, Any]) -> float:
        if array.size == 0:
            return 0.0
        values = array.astype(np.float32)
        if np.issubdtype(array.dtype, np.unsignedinteger):
            midpoint = float(2 ** (array.itemsize * 8 - 1))
            values -= midpoint
            scale = midpoint
        elif np.issubdtype(array.dtype, np.signedinteger):
            scale = float(2 ** (array.itemsize * 8 - 1))
        else:
            scale = 1.0
        peak = float(np.max(np.abs(values))) / scale
        return max(0.0, min(peak, 1.0))

    def _build_waveform(
        self, timed_peaks: list[tuple[float, float]], duration: float
    ) -> tuple[float, ...]:
        buckets = [0.0] * self._waveform_points
        for timestamp, peak in timed_peaks:
            index = min(
                int(timestamp / duration * self._waveform_points), self._waveform_points - 1
            )
            buckets[index] = max(buckets[index], peak)
        return tuple(buckets)
