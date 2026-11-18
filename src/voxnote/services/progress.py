from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from statistics import median

from voxnote.domain.models import ProgressSnapshot


@dataclass(frozen=True, slots=True)
class ProgressUpdate:
    snapshot: ProgressSnapshot
    notify_ui: bool


class ProgressEstimator:
    """Normalize backend progress and derive a conservative, smoothed ETA."""

    def __init__(
        self,
        *,
        minimum_eta_elapsed: float = 30.0,
        minimum_eta_percent: float = 3.0,
        ui_interval: float = 0.1,
        sample_count: int = 7,
    ) -> None:
        self._minimum_eta_elapsed = minimum_eta_elapsed
        self._minimum_eta_percent = minimum_eta_percent
        self._ui_interval = ui_interval
        self._samples: deque[tuple[float, float]] = deque(maxlen=max(4, sample_count))
        self._last_processed = 0.0
        self._last_elapsed = 0.0
        self._last_notified_elapsed: float | None = None

    def reset(self) -> None:
        self._samples.clear()
        self._last_processed = 0.0
        self._last_elapsed = 0.0
        self._last_notified_elapsed = None

    def observe(self, snapshot: ProgressSnapshot) -> ProgressUpdate:
        elapsed = max(self._last_elapsed, snapshot.elapsed_seconds, 0.0)
        processed = max(self._last_processed, snapshot.processed_seconds, 0.0)
        total = (
            snapshot.total_seconds
            if snapshot.total_seconds and snapshot.total_seconds > 0
            else None
        )
        if total is not None:
            processed = min(processed, total)

        if self._samples and elapsed - self._samples[-1][0] > 60.0:
            self._samples.clear()
        self._append_sample(elapsed, processed)

        normalized = ProgressSnapshot(
            processed_seconds=processed,
            total_seconds=total,
            elapsed_seconds=elapsed,
            eta_seconds=self._estimate_eta(processed, total, elapsed),
        )
        notify = self._should_notify(normalized)
        self._last_processed = processed
        self._last_elapsed = elapsed
        if notify:
            self._last_notified_elapsed = elapsed
        return ProgressUpdate(normalized, notify)

    def _append_sample(self, elapsed: float, processed: float) -> None:
        if self._samples and elapsed <= self._samples[-1][0]:
            return
        if self._samples and processed < self._samples[-1][1]:
            processed = self._samples[-1][1]

        if len(self._samples) >= 3:
            rates = self._rates()
            delta_elapsed = elapsed - self._samples[-1][0]
            delta_processed = processed - self._samples[-1][1]
            if rates and delta_elapsed > 0 and delta_processed > 0:
                current_rate = delta_processed / delta_elapsed
                typical_rate = median(rates)
                ratio = current_rate / typical_rate if typical_rate > 0 else 1.0
                if ratio > 4.0 or ratio < 0.25:
                    previous = self._samples[-1]
                    self._samples.clear()
                    self._samples.append(previous)
        self._samples.append((elapsed, processed))

    def _estimate_eta(self, processed: float, total: float | None, elapsed: float) -> float | None:
        if total is None or elapsed < self._minimum_eta_elapsed:
            return None
        percent = processed / total * 100
        if percent < self._minimum_eta_percent:
            return None
        rates = self._rates()
        if len(rates) < 3:
            return None
        rate = median(rates)
        if rate <= 0:
            return None
        return max(0.0, (total - processed) / rate)

    def _rates(self) -> list[float]:
        rates: list[float] = []
        for previous, current in zip(self._samples, list(self._samples)[1:], strict=False):
            elapsed_delta = current[0] - previous[0]
            processed_delta = current[1] - previous[1]
            if elapsed_delta > 0 and processed_delta > 0:
                rates.append(processed_delta / elapsed_delta)
        return rates

    def _should_notify(self, snapshot: ProgressSnapshot) -> bool:
        if self._last_notified_elapsed is None:
            return True
        if (
            snapshot.total_seconds is not None
            and snapshot.processed_seconds >= snapshot.total_seconds
        ):
            return True
        return snapshot.elapsed_seconds - self._last_notified_elapsed >= self._ui_interval
