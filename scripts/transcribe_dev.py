from __future__ import annotations

import argparse
from pathlib import Path

from voxnote.application.background import CancellationToken
from voxnote.domain.models import ProgressSnapshot, TranscriptionJob
from voxnote.infrastructure import (
    FasterWhisperTranscriptionService,
    register_nvidia_dll_directories,
)
from voxnote.services.export import save_transcript


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local VoxNote transcription smoke test")
    parser.add_argument("audio", type=Path)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--compute-type", default="int8")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.device == "cuda":
        register_nvidia_dll_directories()
    service = FasterWhisperTranscriptionService.from_model_path(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
    )
    job = TranscriptionJob(
        source_path=args.audio,
        model_id=args.model.name,
        device_preference=args.device,
    )

    def show_progress(snapshot: ProgressSnapshot) -> None:
        percent = snapshot.percent
        label = "?" if percent is None else f"{percent:5.1f}%"
        print(f"\r{label} · {snapshot.processed_seconds:7.1f}s", end="", flush=True)

    cancellation = CancellationToken()
    if not service.prepare(cancellation):
        raise RuntimeError("Model preparation was cancelled")
    result = service.transcribe(job, cancellation, show_progress)
    print()
    save_transcript(result, args.output)
    print(f"Saved: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
