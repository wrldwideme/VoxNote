import json
import math
import struct
import subprocess
import sys
import wave
from pathlib import Path


def write_test_wav(path: Path, *, duration: float = 0.5, sample_rate: int = 16_000) -> None:
    samples = int(duration * sample_rate)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        for index in range(samples):
            value = int(math.sin(index / sample_rate * 440 * math.tau) * 12_000)
            output.writeframesraw(struct.pack("<h", value))


def test_sidecar_process_e2e(tmp_path: Path) -> None:
    """End-to-end test verifying that `python -m voxnote.sidecar` spawns,

    exchanges JSON-RPC requests/responses over stdin/stdout, and exits cleanly.
    """
    proc = subprocess.Popen(
        [sys.executable, "-m", "voxnote.sidecar"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )

    try:
        assert proc.stdin is not None
        assert proc.stdout is not None

        def send_and_receive(request_dict: dict) -> dict:
            line = json.dumps(request_dict, ensure_ascii=False)
            proc.stdin.write(line + "\n")
            proc.stdin.flush()
            out_line = proc.stdout.readline()
            assert out_line, "Expected JSON-RPC response from sidecar stdout"
            return json.loads(out_line)

        # 1. Ping
        res = send_and_receive({"jsonrpc": "2.0", "id": 1, "method": "ping"})
        assert res["id"] == 1
        assert res["result"]["status"] == "pong"
        assert "0.1.0" in res["result"]["version"]

        # 2. Get system info
        res = send_and_receive({"jsonrpc": "2.0", "id": 2, "method": "get_system_info"})
        assert res["id"] == 2
        assert "device_capabilities" in res["result"]
        assert "version" in res["result"]

        # 3. Get models
        res = send_and_receive({"jsonrpc": "2.0", "id": 3, "method": "get_models"})
        assert res["id"] == 3
        models = res["result"]
        assert len(models) >= 3
        model_ids = [m["model_id"] for m in models]
        assert "small" in model_ids
        assert "turbo" in model_ids
        assert "large-v3" in model_ids

        # 4. Get dictionaries
        res = send_and_receive({"jsonrpc": "2.0", "id": 4, "method": "get_dictionaries"})
        assert res["id"] == 4
        dicts = res["result"]
        assert len(dicts) >= 2
        dict_ids = [d["id"] for d in dicts]
        assert "none" in dict_ids
        assert "medical-ru" in dict_ids

        # 5. Audio Inspection with Cyrillic path
        test_audio = tmp_path / "лекция_фармакология_тест.wav"
        write_test_wav(test_audio, duration=1.0)
        res = send_and_receive(
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "inspect_audio",
                "params": {"file_path": str(test_audio)},
            }
        )
        assert res["id"] == 5
        assert res["result"]["status"] == "inspecting"

        # Read streaming notifications until audio_inspected is received
        audio_meta = None
        for _ in range(5):
            notification_line = proc.stdout.readline()
            notification = json.loads(notification_line)
            if notification.get("method") == "audio_inspected":
                audio_meta = notification["params"]
                break

        assert audio_meta is not None, "Did not receive audio_inspected notification"
        assert audio_meta["file_name"] == "лекция_фармакология_тест.wav"
        assert len(audio_meta["waveform"]) > 0
        assert audio_meta["duration_seconds"] > 0.8

        # 6. Get history
        res = send_and_receive({"jsonrpc": "2.0", "id": 6, "method": "get_history"})
        assert res["id"] == 6
        assert "entries" in res["result"]
        assert "groups" in res["result"]

        # 7. Shutdown
        res = send_and_receive({"jsonrpc": "2.0", "id": 7, "method": "shutdown"})
        assert res["id"] == 7
        assert res["result"]["status"] == "shutdown"

        # Process should terminate within 2 seconds
        exit_code = proc.wait(timeout=2.0)
        assert exit_code == 0

    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
