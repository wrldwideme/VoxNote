from __future__ import annotations

import shutil
import subprocess
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = PROJECT_ROOT / "dist"
OUTPUT_DIR = PROJECT_ROOT / "docs" / "images"
HOST = "127.0.0.1"
PORT = 4173


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def log_message(self, format: str, *args: object) -> None:
        return


def find_browser() -> Path:
    candidates = (
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    executable = shutil.which("chrome") or shutil.which("msedge")
    if executable:
        return Path(executable)
    raise FileNotFoundError("Chrome or Microsoft Edge is required to capture screenshots")


def main() -> None:
    if not (DIST_DIR / "index.html").is_file():
        raise FileNotFoundError("Frontend build is missing. Run `pnpm build` first.")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    browser = find_browser()
    server = ThreadingHTTPServer((HOST, PORT), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    scenarios = (
        ("voxnote-light.png", "?preview=documentation"),
        ("voxnote-dark.png", "?preview=documentation&theme=dark"),
        ("voxnote-models-modal.png", "?preview=documentation&modal=models"),
    )

    try:
        for filename, query in scenarios:
            output = OUTPUT_DIR / filename
            command = [
                str(browser),
                "--headless",
                "--disable-gpu",
                "--hide-scrollbars",
                "--no-sandbox",
                "--virtual-time-budget=2500",
                "--window-size=1440,900",
                f"--screenshot={output}",
                f"http://{HOST}:{PORT}/{query}",
            ]
            subprocess.run(command, check=True, capture_output=True, text=True)
            print(f"Saved {output.relative_to(PROJECT_ROOT)}")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    main()
