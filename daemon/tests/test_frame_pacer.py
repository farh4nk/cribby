"""The paced frame writer turns bursty input into a steady stream for the Presage bridge."""

import os
import threading
import time

from cradleecho.sources.presage import _FrameWriter

FRAME = 64  # bytes per fake frame


def _reader(fd: int, out: list[tuple[float, bytes]], stop: threading.Event) -> None:
    buf = b""
    while not stop.is_set():
        chunk = os.read(fd, 4096)
        if not chunk:
            return
        buf += chunk
        while len(buf) >= FRAME:
            out.append((time.monotonic(), buf[:FRAME]))
            buf = buf[FRAME:]


def _run(pace_fps: float, feed) -> list[tuple[float, bytes]]:
    r, w = os.pipe()
    got: list[tuple[float, bytes]] = []
    stop = threading.Event()
    t = threading.Thread(target=_reader, args=(r, got, stop), daemon=True)
    t.start()
    writer = _FrameWriter(w, pace_fps)
    try:
        feed(writer)
    finally:
        writer.close()  # closes the write end, so the reader sees EOF
        stop.set()
        t.join(timeout=1.0)
        os.close(r)
    return got


def test_paced_writer_spreads_a_burst_evenly():
    def feed(writer):
        # Three frames at once (a network burst), then nothing for a while.
        for i in range(3):
            writer.submit(bytes([i]) * FRAME)
        time.sleep(0.25)

    got = _run(20.0, feed)  # one frame every 50 ms
    assert [d[0] for _, d in got[:3]] == [0, 1, 2]  # in order, none dropped
    gaps = [b - a for (a, _), (b, _) in zip(got, got[1:])][:3]
    assert all(0.03 < g < 0.08 for g in gaps), gaps  # evenly spaced, not back to back


def test_paced_writer_repeats_last_frame_when_input_stalls():
    def feed(writer):
        writer.submit(b"\x07" * FRAME)
        time.sleep(0.3)  # no new frames: the writer keeps the rate up by repeating

    got = _run(20.0, feed)
    assert len(got) >= 4
    assert all(d == b"\x07" * FRAME for _, d in got)


def test_unpaced_writer_keeps_only_the_newest_frame():
    def feed(writer):
        writer.submit(b"\x01" * FRAME)
        time.sleep(0.1)
        writer.submit(b"\x02" * FRAME)
        time.sleep(0.1)

    got = _run(0.0, feed)
    assert [d[0] for _, d in got] == [1, 2]  # no repeats when unpaced
