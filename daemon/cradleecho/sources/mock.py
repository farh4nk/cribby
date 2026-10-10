"""Mock vitals source: replays a short fixed sample of infant readings in a loop."""

import time
from typing import Optional

from cradleecho.sources.base import Reading

# (brpm, bpm, confidence, motion_index). Read at 2 Hz, so each loop lasts a few seconds. Calm values
# sit inside the sleeping range (22-40 breaths/min, low motion), so the classifier settles on ASLEEP.
CALM_SAMPLE: tuple[tuple[float, float, float, float], ...] = (
    (25.8, 119.0, 0.91, 0.04),
    (26.1, 120.0, 0.90, 0.03),
    (26.4, 121.0, 0.92, 0.04),
    (26.0, 120.0, 0.91, 0.05),
    (25.6, 118.0, 0.90, 0.04),
    (25.9, 119.0, 0.91, 0.03),
    (26.3, 121.0, 0.92, 0.04),
    (26.6, 122.0, 0.91, 0.05),
    (26.2, 120.0, 0.90, 0.04),
    (25.7, 119.0, 0.91, 0.03),
    (25.5, 118.0, 0.92, 0.04),
    (25.9, 119.0, 0.91, 0.04),
)
RESTLESS_SAMPLE: tuple[tuple[float, float, float, float], ...] = (
    (34.2, 138.0, 0.88, 0.30),
    (35.1, 141.0, 0.87, 0.33),
    (35.8, 144.0, 0.88, 0.34),
    (35.0, 142.0, 0.89, 0.31),
    (34.4, 139.0, 0.88, 0.29),
    (35.5, 143.0, 0.87, 0.32),
)


class MockVitalsSource:
    """Simulated infant vitals: the same small sample, cycled, so every demo looks the same."""

    def __init__(self, seed: Optional[int] = None) -> None:
        # `seed` is accepted for compatibility; the sample is fixed, so there is nothing to seed.
        self._mode: Optional[str] = None
        self._index = 0
        self._running: bool = False

    async def start(self) -> None:
        self._running = True

    async def stop(self) -> None:
        self._running = False

    def set_forced_mode(self, mode: Optional[str]) -> None:
        """Set simulation mode: 'RESTLESS' or None (normal)."""
        self._mode = mode.upper() if mode else None

    def read(self) -> Reading:
        sample = RESTLESS_SAMPLE if self._mode == "RESTLESS" else CALM_SAMPLE
        brpm, bpm, confidence, motion = sample[self._index % len(sample)]
        self._index += 1
        return Reading(brpm=brpm, bpm=bpm, confidence=confidence, motion_index=motion, timestamp=time.time())
