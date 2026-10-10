"""Night window in local time, seeding that never touches real rows or the future, timeline downsampling."""

import datetime
import sqlite3

from backend.api.app import downsample_rows
from backend.scripts.seed_demo_data import generate_night_session, last_completed_night, seed_sqlite_database
from backend.services.gemini_summary import get_night_window

UTC = datetime.timezone.utc


def test_night_window_uses_eastern_time():
    # 6 PM EDT on Oct 10 is 22:00 UTC: the night is Oct 9 8 PM to Oct 10 7 AM Eastern.
    start, end = get_night_window("20:00", "07:00", as_of=datetime.datetime(2026, 10, 10, 22, 0, tzinfo=UTC))
    assert start == datetime.datetime(2026, 10, 10, 0, 0, tzinfo=UTC)
    assert end == datetime.datetime(2026, 10, 10, 11, 0, tzinfo=UTC)


def test_seed_never_writes_future_rows():
    for hour in (0, 3, 12, 22):  # UTC: before, during and after an Eastern night
        now = datetime.datetime(2026, 10, 11, hour, 30, tzinfo=UTC)
        vitals, events = generate_night_session(last_completed_night("20:00", "07:00", now), "20:00", "07:00")
        assert vitals
        assert max(datetime.datetime.fromisoformat(v[0]) for v in vitals) <= now
        assert all(e["voice_snippet_used"] == "Lullaby" for e in events)


def test_seed_replaces_only_seed_rows(tmp_path):
    db = str(tmp_path / "seed.db")
    vitals, events = generate_night_session(datetime.datetime(2026, 10, 10, 12, tzinfo=UTC), "20:00", "07:00")
    seed_sqlite_database(db, vitals, events)
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO baby_vitals (time, state, breathing_rate, heart_rate, confidence, motion_index, is_real)"
                 " VALUES ('2026-10-10T18:00:00Z', 'AWAKE', 15, 70, 0.9, 0.3, 1)")
    conn.commit()
    seed_sqlite_database(db, vitals, events)  # run it again
    assert conn.execute("SELECT COUNT(*) FROM baby_vitals WHERE is_real = 1").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM baby_vitals WHERE is_real = 0").fetchone()[0] == len(vitals)


def test_downsampling_keeps_a_short_restless_episode():
    rows = [{"state": "ASLEEP"} for _ in range(4000)]
    for i in range(2051, 2055):  # 40 s at 10 s steps, between the evenly spaced samples
        rows[i] = {"state": "RESTLESS"}
    out = downsample_rows(rows, 120)
    assert any(r["state"] == "RESTLESS" for r in out)
    assert len(out) <= 124
