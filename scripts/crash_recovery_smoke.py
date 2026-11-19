from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from voxnote.application.controller import ApplicationController
from voxnote.infrastructure import CTranslate2DeviceDetector, PyAVAudioService
from voxnote.services.dictionary import LocalDictionaryManager
from voxnote.services.history import LocalHistoryStore
from voxnote.services.paths import AppPaths
from voxnote.services.settings import AppSettings, SettingsStore
from voxnote.sidecar import SidecarService, create_transcription_service


def run_worker(audio_path: Path, model_path: Path, profile_root: Path, device: str) -> int:
    paths = AppPaths(profile_root)
    settings_store = SettingsStore(paths.settings_file)
    settings_store.save(
        AppSettings(
            selected_model=model_path.name,
            device_preference=device,  # type: ignore[arg-type]
        )
    )
    controller = ApplicationController(settings_store)
    dictionaries = LocalDictionaryManager(paths.dictionaries_dir)
    capabilities = CTranslate2DeviceDetector().detect()
    history = LocalHistoryStore(paths.history_file)
    service = SidecarService(
        controller,
        model_path=model_path,
        service_factory=lambda path, preference: create_transcription_service(
            path,
            preference,
            capabilities,
            dictionaries,
        ),
        dictionary_manager=dictionaries,
        history_store=history,
        audio_service=PyAVAudioService(),
        device_capabilities=capabilities,
    )
    service.start_transcription(file_path=str(audio_path), device_preference=device)
    while service._transcription_task is not None:
        time.sleep(0.1)
    return 0


def read_checkpoint(history_file: Path) -> dict[str, object] | None:
    try:
        payload = json.loads(history_file.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
        return None
    return payload[0]


def run_parent(audio_path: Path, model_path: Path, device: str, timeout: float) -> int:
    with tempfile.TemporaryDirectory(prefix="voxnote-crash-smoke-") as raw_root:
        profile_root = Path(raw_root)
        command = [
            sys.executable,
            str(Path(__file__).resolve()),
            "--worker",
            "--audio",
            str(audio_path),
            "--model-path",
            str(model_path),
            "--profile-root",
            str(profile_root),
            "--device",
            device,
        ]
        process = subprocess.Popen(command)
        deadline = time.monotonic() + timeout
        checkpoint: dict[str, object] | None = None
        try:
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(
                        f"Worker exited before a checkpoint (code {process.returncode})."
                    )
                checkpoint = read_checkpoint(profile_root / "history.json")
                if (
                    checkpoint
                    and checkpoint.get("status") == "in_progress"
                    and float(checkpoint.get("resume_from_seconds", 0.0)) > 0
                    and str(checkpoint.get("text", "")).strip()
                ):
                    break
                time.sleep(0.2)
            else:
                raise TimeoutError("No real transcription checkpoint appeared before timeout.")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)

        store = LocalHistoryStore(profile_root / "history.json")
        recovered_count = store.recover_interrupted_entries()
        entries = store.get_entries()
        if recovered_count != 1 or len(entries) != 1:
            raise RuntimeError("Interrupted checkpoint was not recovered exactly once.")
        recovered = entries[0]
        if recovered.status != "interrupted" or not recovered.text.strip():
            raise RuntimeError("Recovered entry has no partial text or wrong status.")
        if recovered.resume_from_seconds <= 0:
            raise RuntimeError("Recovered entry has no valid resume position.")
        print(
            "Crash recovery smoke passed: "
            f"status={recovered.status}, segments={len(recovered.segments)}, "
            f"resume_from_seconds={recovered.resume_from_seconds:.1f}"
        )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Real-process VoxNote crash recovery smoke test")
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--model-path", type=Path, required=True)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cuda")
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--profile-root", type=Path, help=argparse.SUPPRESS)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audio_path = args.audio.resolve()
    model_path = args.model_path.resolve()
    if not audio_path.is_file():
        raise FileNotFoundError("Audio fixture does not exist.")
    if not model_path.is_dir():
        raise FileNotFoundError("Model directory does not exist.")
    if args.worker:
        if args.profile_root is None:
            raise ValueError("Worker requires an isolated profile root.")
        return run_worker(audio_path, model_path, args.profile_root.resolve(), args.device)
    return run_parent(audio_path, model_path, args.device, args.timeout)


if __name__ == "__main__":
    raise SystemExit(main())
