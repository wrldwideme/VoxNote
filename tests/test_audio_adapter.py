from __future__ import annotations

import math
import struct
import wave
from pathlib import Path
from typing import Any, cast

import av
import numpy as np
import pytest

from voxnote.application.background import CancellationToken
from voxnote.infrastructure.audio_adapter import AudioInspectionError, PyAVAudioService


def write_test_wav(path: Path, *, duration: float = 0.25, sample_rate: int = 16_000) -> None:
    samples = int(duration * sample_rate)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        for index in range(samples):
            value = int(math.sin(index / sample_rate * 440 * math.tau) * 12_000)
            output.writeframesraw(struct.pack("<h", value))


def write_encoded_audio(path: Path, codec: str, *, sample_rate: int = 48_000) -> None:
    sample_count = sample_rate // 10
    time = np.arange(sample_count, dtype=np.float32) / sample_rate
    samples = (np.sin(time * 440 * math.tau) * 12_000).astype(np.int16)[None, :]
    with av.open(str(path), mode="w") as container:
        stream = cast(Any, container.add_stream(codec, rate=sample_rate))
        stream.layout = "mono"
        frame = av.AudioFrame.from_ndarray(samples, format="s16", layout="mono")
        frame.sample_rate = sample_rate
        for packet in stream.encode(frame):
            container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)


def test_inspect_reads_metadata_and_waveform(tmp_path: Path) -> None:
    audio = tmp_path / "лекция с пробелами.wav"  # noqa: RUF001
    write_test_wav(audio)

    metadata = PyAVAudioService(waveform_points=32).inspect(audio, CancellationToken())

    assert metadata is not None
    assert metadata.duration_seconds == pytest.approx(0.25, abs=0.02)
    assert metadata.sample_rate == 16_000
    assert metadata.channels == 1
    assert metadata.codec == "pcm_s16le"
    assert len(metadata.waveform) == 32
    assert max(metadata.waveform) > 0.3


def test_inspect_rejects_empty_file(tmp_path: Path) -> None:
    audio = tmp_path / "empty.ogg"
    audio.touch()

    with pytest.raises(AudioInspectionError, match="пустой"):
        PyAVAudioService().inspect(audio, CancellationToken())


def test_inspect_rejects_corrupt_file(tmp_path: Path) -> None:
    audio = tmp_path / "broken.m4a"
    audio.write_bytes(b"not an audio container")

    with pytest.raises(AudioInspectionError, match="повреждён"):
        PyAVAudioService().inspect(audio, CancellationToken())


def test_inspect_honors_cancellation(tmp_path: Path) -> None:
    audio = tmp_path / "cancel.wav"
    write_test_wav(audio)
    cancellation = CancellationToken()
    cancellation.cancel()

    assert PyAVAudioService().inspect(audio, cancellation) is None


@pytest.mark.parametrize(
    ("extension", "codec"),
    (("m4a", "aac"), ("mp3", "mp3"), ("flac", "flac"), ("ogg", "libopus")),
)
def test_inspect_supported_encoded_formats(tmp_path: Path, extension: str, codec: str) -> None:
    audio = tmp_path / f"sample.{extension}"
    write_encoded_audio(audio, codec)

    metadata = PyAVAudioService(waveform_points=24).inspect(audio, CancellationToken())

    assert metadata is not None
    assert metadata.duration_seconds > 0
    assert len(metadata.waveform) == 24
