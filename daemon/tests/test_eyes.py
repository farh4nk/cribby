"""Eyes open/closed from the bridge's eye aspect ratio and blink events."""

from cradleecho.eyes import CLOSED, OPEN, UNKNOWN, EyeTracker


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def feed(tracker, clock, ear, seconds, blink=False, hz=10):
    for _ in range(int(seconds * hz)):
        clock.t += 1 / hz
        tracker.update(ear, blink)


def test_unknown_before_any_data_and_when_stale():
    clock = Clock()
    eyes = EyeTracker(closed_ear=0.2, clock=clock)
    assert eyes.state() == UNKNOWN
    feed(eyes, clock, 0.3, 1)
    assert eyes.state() == OPEN
    clock.t += 5  # bridge stopped sending
    assert eyes.state() == UNKNOWN


def test_closed_only_after_low_ear_is_held():
    clock = Clock()
    eyes = EyeTracker(closed_ear=0.2, closed_hold_s=1.5, clock=clock)
    feed(eyes, clock, 0.3, 2)
    feed(eyes, clock, 0.1, 1.5)  # median drops below the threshold partway through
    assert eyes.state() == OPEN  # not held long enough yet
    feed(eyes, clock, 0.1, 2)
    assert eyes.state() == CLOSED
    feed(eyes, clock, 0.3, 1)
    assert eyes.state() == OPEN


def test_a_blink_does_not_read_as_closed():
    clock = Clock()
    eyes = EyeTracker(closed_ear=0.2, clock=clock)
    feed(eyes, clock, 0.3, 2)
    feed(eyes, clock, 0.05, 0.2)  # a 200 ms blink
    feed(eyes, clock, 0.3, 2)
    assert eyes.state() == OPEN


def test_blinks_alone_mean_open_without_landmarks():
    clock = Clock()
    eyes = EyeTracker(clock=clock, blink_open_s=10)
    feed(eyes, clock, None, 0.1, blink=True)
    feed(eyes, clock, None, 2)
    assert eyes.state() == OPEN
    feed(eyes, clock, None, 11)  # no blink for a while and no landmarks: can't tell
    assert eyes.state() == UNKNOWN
