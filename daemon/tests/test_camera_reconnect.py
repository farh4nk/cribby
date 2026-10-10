"""The camera reopens a source that stops delivering frames, and retries one that won't open."""

import threading
import time

import numpy as np
import pytest

from cradleecho import camera as camera_mod
from cradleecho.camera import Camera
from cradleecho.config import settings

FRAME = np.zeros((48, 64, 3), dtype=np.uint8)


class FakeStream:
    """Stands in for cv2.VideoCapture on a network URL. `state` controls every instance."""

    state = {"up": True, "opens": 0}
    lock = threading.Lock()

    def __init__(self, device):
        with FakeStream.lock:
            FakeStream.state["opens"] += 1
            self._open = FakeStream.state["up"]

    def isOpened(self):
        return self._open

    def set(self, *args):
        return True

    def read(self):
        time.sleep(0.02)
        if self._open and FakeStream.state["up"]:
            return True, FRAME.copy()
        self._open = False  # an ended stream stays ended, like ffmpeg after EOF
        return False, None

    def release(self):
        self._open = False


@pytest.fixture
def fake_stream(monkeypatch):
    FakeStream.state = {"up": True, "opens": 0}
    monkeypatch.setattr(camera_mod.cv2, "VideoCapture", FakeStream)
    monkeypatch.setattr(settings, "camera_reconnect_s", 0.3)
    yield FakeStream.state


def _wait_for(cond, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cond():
            return True
        time.sleep(0.05)
    return False


def test_reconnects_after_the_stream_ends(fake_stream):
    cam = Camera(device="http://pi.example:8000/video_feed")
    cam.start()
    try:
        assert _wait_for(cam.is_live)
        fake_stream["up"] = False  # the Pi restarts: the stream ends
        assert _wait_for(lambda: not cam.is_live())
        fake_stream["up"] = True  # the Pi is back
        assert _wait_for(cam.is_live), "camera did not reconnect"
        assert fake_stream["opens"] >= 2
    finally:
        cam.stop()


def test_retries_a_source_that_was_down_at_start(fake_stream):
    fake_stream["up"] = False  # the Pi is down when the daemon starts
    cam = Camera(device="http://pi.example:8000/video_feed")
    cam.start()
    try:
        assert _wait_for(lambda: fake_stream["opens"] >= 2), "never retried the failed open"
        assert not cam.is_live()
        fake_stream["up"] = True
        assert _wait_for(cam.is_live), "camera did not come up once the source did"
    finally:
        cam.stop()
