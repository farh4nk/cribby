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


def test_real_reading_is_recorded():
    assert TelemetryIngestionWorker().parse_payload(json.dumps({**BASE, "simulated": False})) is not None


def test_reading_without_flag_is_recorded():  # older daemons don't send the flag
    assert TelemetryIngestionWorker().parse_payload(json.dumps(BASE)) is not None


def test_simulated_reading_is_skipped():
    assert TelemetryIngestionWorker().parse_payload(json.dumps({**BASE, "simulated": True})) is None


def test_camera_off_is_skipped():
    payload = {**BASE, "camera": {"enabled": False}}
    assert TelemetryIngestionWorker().parse_payload(json.dumps(payload)) is None
