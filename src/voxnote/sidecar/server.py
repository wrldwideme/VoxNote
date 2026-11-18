from __future__ import annotations

import logging
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, TextIO

from voxnote.sidecar.protocol import (
    INTERNAL_ERROR,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    JsonRpcRequest,
    format_error,
    format_notification,
    format_response,
    parse_message,
)
from voxnote.sidecar.service import SidecarService, SidecarServiceError

logger = logging.getLogger("voxnote.sidecar.server")


class SidecarServer:
    """Line-delimited JSON-RPC 2.0 server operating over stdin/stdout."""

    def __init__(
        self,
        service: SidecarService,
        *,
        input_stream: TextIO | None = None,
        output_stream: TextIO | None = None,
        worker_threads: int = 4,
    ) -> None:
        self._service = service
        self._input_stream = input_stream or sys.stdin
        self._output_stream = output_stream or sys.stdout
        self._executor = ThreadPoolExecutor(
            max_workers=worker_threads,
            thread_name_prefix="sidecar_worker",
        )
        self._write_lock = threading.Lock()
        self._running = threading.Event()

        # Connect the service's event sink to output formatting
        self._service.set_event_sink(self._send_notification)

    def _write_line(self, line: str) -> None:
        with self._write_lock:
            try:
                self._output_stream.write(line + "\n")
                self._output_stream.flush()
            except (BrokenPipeError, OSError) as err:
                logger.warning("Failed to write to output stream: %s", err)

    def _send_notification(self, method: str, params: dict[str, Any]) -> None:
        payload = format_notification(method, params)
        self._write_line(payload)

    def run(self) -> None:
        """Main loop: continuously read JSON-RPC lines from input_stream."""
        self._running.set()
        logger.info("Sidecar server started reading from input stream")

        try:
            while self._running.is_set():
                line = self._input_stream.readline()
                if not line:
                    # EOF reached on input stream
                    logger.info("Input stream closed (EOF). Stopping sidecar server.")
                    break

                cleaned = line.strip()
                if not cleaned:
                    continue

                try:
                    request = parse_message(cleaned)
                except ValueError as err:
                    logger.warning("Invalid incoming message: %s", err)
                    self._write_line(format_error(None, PARSE_ERROR, str(err)))
                    continue

                if request.method == "shutdown":
                    # Handle shutdown directly on main loop
                    res = self._service.shutdown()
                    self._write_line(format_response(request.id, res))
                    break

                # Dispatch request to background thread pool
                self._executor.submit(self._dispatch_request, request)

        except KeyboardInterrupt:
            logger.info("KeyboardInterrupt received in sidecar server.")
        finally:
            self.stop()

    def _dispatch_request(self, request: JsonRpcRequest) -> None:
        method_name = request.method
        handler = getattr(self._service, method_name, None)
        if handler is None or not callable(handler) or method_name.startswith("_"):
            self._write_line(
                format_error(
                    request.id,
                    METHOD_NOT_FOUND,
                    f"Метод не найден: {method_name}",
                )
            )
            return

        try:
            result = handler(**request.params)
            self._write_line(format_response(request.id, result))
        except TypeError as err:
            logger.warning("Parameter mismatch for %s: %s", method_name, err)
            self._write_line(
                format_error(
                    request.id,
                    INVALID_REQUEST,
                    f"Неверные параметры для метода {method_name}: {err}",
                )
            )
        except SidecarServiceError as err:
            self._write_line(format_error(request.id, err.code, err.message, err.data))
        except Exception as err:
            logger.exception("Error executing %s", method_name)
            self._write_line(format_error(request.id, INTERNAL_ERROR, str(err)))

    def stop(self) -> None:
        """Stop the server, shut down executor and flush streams."""
        if not self._running.is_set():
            return
        self._running.clear()
        self._service.shutdown()
        self._executor.shutdown(wait=False, cancel_futures=True)
        logger.info("Sidecar server stopped.")
