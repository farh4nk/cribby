"""Eyes open/closed from Presage face metrics (the bridge's "ear", "blink" and "lm" fields).

EAR (eye aspect ratio) is eyelid gap / eye width from the face-mesh landmarks: measured on our camera
at 0.18-0.27 with eyes open and 0.06-0.12 closed (threshold 0.15). A blink is a dip of ~0.1-0.3 s, so the state
uses the median over `window_s` and only reports CLOSED once that median has stayed low for
`closed_hold_s`. Without EAR (no landmarks), a recent blink still proves the eyes are open.
"""

import collections
import statistics
import time
from typing import Callable, Deque, Optional, Tuple

from cradleecho.config import settings

OPEN = "OPEN"
CLOSED = "CLOSED"
UNKNOWN = "UNKNOWN"


class EyeTracker:
    def __init__(
        self,
        closed_ear: Optional[float] = None,
        window_s: float = 1.0,
        closed_hold_s: float = 1.5,
        blink_open_s: float = 10.0,
        stale_s: float = 3.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.closed_ear = settings.eyes_closed_ear if closed_ear is None else closed_ear
        self.window_s = window_s
        self.closed_hold_s = closed_hold_s
        self.blink_open_s = blink_open_s
        self.stale_s = stale_s
        self._clock = clock
        self._ears: Deque[Tuple[float, float]] = collections.deque()
        self._last_blink: Optional[float] = None
        self._last_update: Optional[float] = None
        self._low_since: Optional[float] = None

    def reset(self) -> None:
        self._ears.clear()
        self._last_blink = self._last_update = self._low_since = None

    def update(self, ear: Optional[float], blink: bool) -> None:
        now = self._clock()
        self._last_update = now
        if blink:
            self._last_blink = now
        if ear is not None and ear >= 0:
            self._ears.append((now, ear))
        while self._ears and self._ears[0][0] < now - self.window_s:
            self._ears.popleft()
        med = self.openness()
        if med is not None and med < self.closed_ear:
            if self._low_since is None:
                self._low_since = now
        else:
            self._low_since = None

    def openness(self) -> Optional[float]:
        """Median EAR over the recent window, or None without landmark data."""
        return statistics.median(e for _, e in self._ears) if self._ears else None

    def state(self) -> str:
        now = self._clock()
        if self._last_update is None or now - self._last_update > self.stale_s:
            return UNKNOWN
        if self._ears:
            if self._low_since is not None and now - self._low_since >= self.closed_hold_s:
                return CLOSED
            return OPEN
        if self._last_blink is not None and now - self._last_blink <= self.blink_open_s:
            return OPEN
        return UNKNOWN
