"""The ingestion worker records real readings only."""

import json

from backend.services.ingestion_worker import TelemetryIngestionWorker

BASE = {
    "timestamp": "2026-10-10T18:00:00Z",
    "state": "ASLEEP",
    "vitals": {"brpm": 26.0, "bpm": 120.0, "confidence": 0.9},
    "motion_index": 0.04,
    "camera": {"enabled": True},
}


def test_real_reading_is_recorded_and_flagged_real():
    parsed = TelemetryIngestionWorker().parse_payload(json.dumps({**BASE, "simulated": False, "camera": {"enabled": True, "live": True}}))
    assert parsed is not None
    assert parsed[6] is True  # is_real is True


def test_reading_without_flag_is_recorded_as_real():
    parsed = TelemetryIngestionWorker().parse_payload(json.dumps(BASE))
    assert parsed is not None
    assert parsed[6] is True


def test_simulated_reading_is_recorded_and_flagged_synthetic():
    parsed = TelemetryIngestionWorker().parse_payload(json.dumps({**BASE, "simulated": True}))
    assert parsed is not None
    assert parsed[6] is False  # is_real is False


def test_synthetic_camera_feed_is_flagged_synthetic():
    parsed = TelemetryIngestionWorker().parse_payload(json.dumps({**BASE, "simulated": False, "camera": {"enabled": True, "live": False}}))
    assert parsed is not None
    assert parsed[6] is False  # is_real is False


def test_camera_off_is_skipped():
    payload = {**BASE, "camera": {"enabled": False}}
    assert TelemetryIngestionWorker().parse_payload(json.dumps(payload)) is None


def test_zero_vitals_dropout_is_skipped():
    payload = {**BASE, "state": "SIGNAL_UNSTABLE", "vitals": {"brpm": 0.0, "bpm": 0.0, "confidence": 0.0}}
    assert TelemetryIngestionWorker().parse_payload(json.dumps(payload)) is None

