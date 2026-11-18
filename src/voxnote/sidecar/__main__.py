from __future__ import annotations

import logging
import sys

from voxnote.sidecar import SidecarServer, create_default_sidecar_service


def main() -> int:
    """Run the headless VoxNote Python Sidecar over stdin/stdout."""
    # Ensure UTF-8 and line-buffering on standard I/O for clean JSON-RPC communication
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    # Configure logging strictly to sys.stderr so sys.stdout remains 100% valid JSON
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] (%(name)s) %(message)s",
        stream=sys.stderr,
    )
    logger = logging.getLogger("voxnote.sidecar")
    logger.info("Initializing VoxNote headless Python Sidecar...")

    try:
        service = create_default_sidecar_service()
        server = SidecarServer(service)
        logger.info("VoxNote Python Sidecar ready for JSON-RPC requests.")
        server.run()
        logger.info("VoxNote Python Sidecar exiting cleanly.")
        return 0
    except Exception as err:
        logger.exception("Fatal error in VoxNote Python Sidecar: %s", err)
        return 1


if __name__ == "__main__":
    sys.exit(main())
