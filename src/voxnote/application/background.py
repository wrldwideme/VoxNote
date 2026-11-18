from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from threading import Event, Lock
from typing import Any, Generic, TypeVar

T = TypeVar("T")


class CancellationToken:
    """Thread-safe cooperative cancellation signal."""

    def __init__(self) -> None:
        self._cancelled = Event()

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled.is_set()

    def cancel(self) -> None:
        self._cancelled.set()


@dataclass(frozen=True, slots=True)
class TaskHandle(Generic[T]):
    future: Future[T]
    token: CancellationToken

    def cancel(self) -> None:
        self.token.cancel()
        self.future.cancel()


class BackgroundTaskRunner:
    """Own background workers and stop them cooperatively on shutdown."""

    def __init__(self, max_workers: int = 1) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="voxnote")
        self._handles: set[TaskHandle[Any]] = set()
        self._lock = Lock()
        self._closed = False

    def submit(self, operation: Callable[[CancellationToken], T]) -> TaskHandle[T]:
        with self._lock:
            if self._closed:
                raise RuntimeError("Background task runner is closed")
            token = CancellationToken()
            future = self._executor.submit(operation, token)
            handle = TaskHandle(future=future, token=token)
            self._handles.add(handle)

        future.add_done_callback(lambda _future: self._discard(handle))
        return handle

    def _discard(self, handle: TaskHandle[Any]) -> None:
        with self._lock:
            self._handles.discard(handle)

    def shutdown(self, *, wait: bool = True) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            handles = tuple(self._handles)

        for handle in handles:
            handle.cancel()
        self._executor.shutdown(wait=wait, cancel_futures=True)

        with self._lock:
            self._handles.clear()

    def __enter__(self) -> BackgroundTaskRunner:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.shutdown()
