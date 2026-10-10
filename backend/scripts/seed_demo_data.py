"""
Comprehensive overnight telemetry and soothe events seeder for Cribby (Task 4.1/4.2).
Seeds BOTH Tiger Data PostgreSQL (Timescale) and local SQLite fallbacks.
Generates full overnight sleep sessions with:
- Calm restorative sleep (22-26 BrPM, 104-114 BPM)
- Bedtime/morning drowsy wind-down transitions (26-28 BrPM, 116-122 BPM)
- 2 distinct restlessness stirring episodes (32-36 BrPM, 126-135 BPM)
- 2 corresponding auto-soothe intervention events in soothe_events
"""

import os
import sqlite3
import datetime
import random
from typing import List, Tuple, Dict, Any
from dotenv import load_dotenv

load_dotenv()

from backend.db.connection import get_connection_string, is_postgres
from backend.services.gemini_summary import get_night_window

SQLITE_DATABASES = [
    os.getenv("SQLITE_PATH", "cradleecho_local.db"),
    "cribby_local.db"
]

def generate_night_session(
    anchor_dt: datetime.datetime,
    bedtime: str = "20:00",
    wake_time: str = "07:00"
) -> Tuple[List[Tuple[str, str, float, float, float, float]], List[Dict[str, Any]]]:
    """Generates a complete 11-hour overnight sleep session with realistic pediatric vitals."""
    start_time, end_time = get_night_window(bedtime, wake_time, as_of=anchor_dt)

    # Episode 1: ~3.5 hours into sleep
    restless_1_start = start_time + datetime.timedelta(hours=3, minutes=24)
    restless_1_soothe = restless_1_start + datetime.timedelta(seconds=20)
    restless_1_end = restless_1_soothe + datetime.timedelta(seconds=42)

    # Episode 2: ~7.5 hours into sleep
    restless_2_start = start_time + datetime.timedelta(hours=7, minutes=18)
    restless_2_soothe = restless_2_start + datetime.timedelta(seconds=15)
    restless_2_end = restless_2_soothe + datetime.timedelta(seconds=38)

    soothe_events = [
        {
            "triggered_at": restless_1_soothe.isoformat(),
            "resolved_at": restless_1_end.isoformat(),
            "voice_snippet_used": "Shhh, Mommy and Daddy love you.",
            "was_successful": True,
        },
        {
            "triggered_at": restless_2_soothe.isoformat(),
            "resolved_at": restless_2_end.isoformat(),
            "voice_snippet_used": "Go to sleep, sweet dreams.",
            "was_successful": True,
        }
    ]

    vitals = []
    current_time = start_time
    step_seconds = 10  # 10s steps for rich continuous timeline

    while current_time <= end_time:
        # Check if in restlessness stirring episode
        in_r1 = restless_1_start <= current_time <= restless_1_end
        in_r2 = restless_2_start <= current_time <= restless_2_end

        if in_r1 or in_r2:
            state = "RESTLESS"
            brpm = round(random.uniform(33.0, 36.8), 1)
            bpm = round(random.uniform(128.0, 137.0), 1)
            motion = round(random.uniform(0.68, 0.89), 2)
            confidence = round(random.uniform(0.86, 0.94), 2)
        elif current_time < start_time + datetime.timedelta(minutes=25):
            state = "DROWSY"
            brpm = round(random.uniform(26.0, 28.5), 1)
            bpm = round(random.uniform(116.0, 122.0), 1)
            motion = round(random.uniform(0.12, 0.28), 2)
            confidence = round(random.uniform(0.89, 0.96), 2)
        elif current_time > end_time - datetime.timedelta(minutes=15):
            state = "DROWSY"
            brpm = round(random.uniform(25.5, 28.0), 1)
            bpm = round(random.uniform(115.0, 123.0), 1)
            motion = round(random.uniform(0.15, 0.35), 2)
            confidence = round(random.uniform(0.89, 0.95), 2)
        else:
            state = "ASLEEP"
            # Gentle sinus rhythm fluctuation
            minute_idx = int((current_time - start_time).total_seconds() / 60)
            wave = 0.6 * random.random()
            brpm = round(23.8 + wave, 1)
            bpm = round(108.5 + (wave * 4), 1)
            motion = round(random.uniform(0.02, 0.08), 2)
            confidence = round(random.uniform(0.92, 0.98), 2)

        vitals.append((
            current_time.isoformat(),
            state,
            brpm,
            bpm,
            confidence,
            motion
        ))
        current_time += datetime.timedelta(seconds=step_seconds)

    return vitals, soothe_events


def seed_sqlite_database(db_path: str, vitals: List[Tuple], soothe_events: List[Dict]):
    """Seeds a local SQLite database."""
    print(f"  -> Seeding SQLite: {db_path}...")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    try:
        # Ensure schema tables exist
        cur.execute("""
        CREATE TABLE IF NOT EXISTS baby_vitals (
            time TEXT NOT NULL,
            state VARCHAR(20) NOT NULL,
            breathing_rate REAL,
            heart_rate REAL,
            confidence REAL,
            motion_index REAL DEFAULT 0.0
        );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_baby_vitals_time ON baby_vitals (time DESC);")

        cur.execute("""
        CREATE TABLE IF NOT EXISTS soothe_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            triggered_at TEXT NOT NULL,
            resolved_at TEXT,
            voice_snippet_used TEXT,
            was_successful BOOLEAN DEFAULT 0
        );
        """)

        # Clear existing data
        cur.execute("DELETE FROM baby_vitals;")
        cur.execute("DELETE FROM soothe_events;")

        # Insert vitals
        cur.executemany(
            """
            INSERT INTO baby_vitals (time, state, breathing_rate, heart_rate, confidence, motion_index)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            vitals
        )

        for event in soothe_events:
            cur.execute(
                """
                INSERT INTO soothe_events (triggered_at, resolved_at, voice_snippet_used, was_successful)
                VALUES (?, ?, ?, ?);
                """,
                (event["triggered_at"], event["resolved_at"], event["voice_snippet_used"], event["was_successful"])
            )

        conn.commit()
        print(f"     [OK] Seeded {len(vitals)} vitals and {len(soothe_events)} soothe events in {db_path}.")
    except Exception as e:
        print(f"     [ERROR] Failed to seed SQLite {db_path}: {e}")
    finally:
        cur.close()
        conn.close()


def seed_postgres_database(vitals: List[Tuple], soothe_events: List[Dict]):
    """Seeds Tiger Data Timescale / PostgreSQL."""
    conn_str = get_connection_string()
    if not conn_str or not (conn_str.startswith("postgres://") or conn_str.startswith("postgresql://")):
        print("  -> PostgreSQL not configured, skipping.")
        return

    print("  -> Seeding Tiger Data (PostgreSQL / Timescale)...")
    try:
        import psycopg
        conn = psycopg.connect(conn_str, connect_timeout=5)
        cur = conn.cursor()
        try:
            # Clear old corrupted/zero rows
            cur.execute("DELETE FROM baby_vitals;")
            cur.execute("DELETE FROM soothe_events;")

            # Insert vitals in batch
            cur.executemany(
                """
                INSERT INTO baby_vitals (time, state, breathing_rate, heart_rate, confidence, motion_index)
                VALUES (%s, %s, %s, %s, %s, %s);
                """,
                vitals
            )

            for event in soothe_events:
                cur.execute(
                    """
                    INSERT INTO soothe_events (triggered_at, resolved_at, voice_snippet_used, was_successful)
                    VALUES (%s, %s, %s, %s);
                    """,
                    (event["triggered_at"], event["resolved_at"], event["voice_snippet_used"], event["was_successful"])
                )

            conn.commit()
            print(f"     [OK] Seeded {len(vitals)} vitals and {len(soothe_events)} soothe events in Tiger Data.")
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        print(f"     [WARN] Could not seed Tiger Data directly: {e}")


def seed_all_databases(bedtime: str = "20:00", wake_time: str = "07:00"):
    """Seeds all database tiers with both the most recent completed night and the current session."""
    now = datetime.datetime.now(datetime.timezone.utc)
    print("============================================================")
    print("Cribby Telemetry Seeder: Populating Database Tiers")
    print("============================================================")

    # Night 1: Completed night (anchor: now - 24h)
    yesterday_anchor = now - datetime.timedelta(days=1)
    vitals_y, soothe_y = generate_night_session(yesterday_anchor, bedtime, wake_time)

    # Night 2: Current night session (anchor: now)
    vitals_today, soothe_today = generate_night_session(now, bedtime, wake_time)

    all_vitals = vitals_y + vitals_today
    all_soothe = soothe_y + soothe_today

    print(f"Generated {len(all_vitals)} total biometric readings across 2 full night sessions.")
    print(f"Generated {len(all_soothe)} auto-soothe intervention events.")

    # 1. Seed Tiger Data Cloud PostgreSQL
    seed_postgres_database(all_vitals, all_soothe)

    # 2. Seed all Local SQLite Fallbacks
    for db_path in SQLITE_DATABASES:
        seed_sqlite_database(db_path, all_vitals, all_soothe)

    print("============================================================")
    print("Seeding Complete across all database levels!")
    print("============================================================")


if __name__ == "__main__":
    seed_all_databases()
