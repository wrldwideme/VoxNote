import os
import shutil
import subprocess
import threading
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 4173
DIST_DIR = os.path.abspath("dist")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def log_message(self, format, *args):
        pass


def run_server():
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()


server_thread = threading.Thread(target=run_server, daemon=True)
server_thread.start()
time.sleep(1)

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
out_dir = os.path.abspath("output_screenshots")
os.makedirs(out_dir, exist_ok=True)
artifact_dir = r"C:\Users\wrld alone\.gemini\antigravity\brain\4520e9ab-0ab7-4542-8964-7393b62f3174"

scenarios = [
    # 1. Concept A Light Main View
    ("screen_concept_a_light_1440.png", "1440,900", f"http://127.0.0.1:{PORT}/"),
    # 2. Concept A Dark Main View
    ("screen_concept_a_dark_1440.png", "1440,900", f"http://127.0.0.1:{PORT}/?theme=dark"),
    # 3. Responsive 1024x768 verification (no clipping, no horizontal scroll)
    ("screen_concept_a_1024.png", "1024,768", f"http://127.0.0.1:{PORT}/"),
    # 4. New Transcription: Empty dropzone
    ("screen_concept_a_new_empty.png", "1440,900", f"http://127.0.0.1:{PORT}/?view=new"),
    # 5. New Transcription: With file selected
    (
        "screen_concept_a_new_file.png",
        "1440,900",
        f"http://127.0.0.1:{PORT}/?view=new&withFile=true",
    ),
    # 6. Models Modal
    ("screen_concept_a_models_modal.png", "1440,900", f"http://127.0.0.1:{PORT}/?modal=models"),
    # 7. Dictionary Modal
    ("screen_concept_a_dict_modal.png", "1440,900", f"http://127.0.0.1:{PORT}/?modal=dict"),
]

for filename, res, url in scenarios:
    out_path = os.path.join(out_dir, filename)
    cmd = [
        chrome_path,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=2000",
        f"--window-size={res}",
        f"--screenshot={out_path}",
        url,
    ]
    subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(out_path):
        print(f"Captured: {filename} ({res})")
        if os.path.exists(artifact_dir):
            shutil.copy2(out_path, os.path.join(artifact_dir, filename))
    else:
        print(f"Failed to capture: {filename}")

print("All screenshots generated and copied to artifact directory.")
