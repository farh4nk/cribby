"""
Comprehensive overnight telemetry and soothe events seeder for Cribby (Task 4.1/4.2).
Seeds BOTH Tiger Data PostgreSQL (Timescale) and local SQLite fallbacks.
Only earlier seed rows (is_real = false) are replaced; real readings are never deleted.
Generates the most recent completed night (never future rows) with:
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
            "voice_snippet_used": "Lullaby",
            "was_successful": True,
            "is_real": False,
        },
        {
            "triggered_at": restless_2_soothe.isoformat(),
            "resolved_at": restless_2_end.isoformat(),
            "voice_snippet_used": "Lullaby",
            "was_successful": True,
            "is_real": False,
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
            motion,
            False  # is_real: False (synthetic / seeded demo data)
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
            motion_index REAL DEFAULT 0.0,
            is_real BOOLEAN DEFAULT 1
        );
        """)
        # Backward compatibility alters if table already existed without is_real
        try:
            cur.execute("ALTER TABLE baby_vitals ADD COLUMN is_real BOOLEAN DEFAULT 1;")
        except Exception:
            pass
        try:
            cur.execute("ALTER TABLE soothe_events ADD COLUMN is_real BOOLEAN DEFAULT 1;")
        except Exception:
            pass

        cur.execute("CREATE INDEX IF NOT EXISTS idx_baby_vitals_time ON baby_vitals (time DESC);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_baby_vitals_is_real ON baby_vitals (is_real);")

        cur.execute("""
        CREATE TABLE IF NOT EXISTS soothe_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            triggered_at TEXT NOT NULL,
            resolved_at TEXT,
            voice_snippet_used TEXT,
            was_successful BOOLEAN DEFAULT 0,
            is_real BOOLEAN DEFAULT 1
        );
        """)

        # Replace only earlier seed data; real readings stay.
        cur.execute("DELETE FROM baby_vitals WHERE is_real = 0;")
        cur.execute("DELETE FROM soothe_events WHERE is_real = 0;")

        # Insert vitals
        cur.executemany(
            """
            INSERT INTO baby_vitals (time, state, breathing_rate, heart_rate, confidence, motion_index, is_real)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            vitals
        )

        for event in soothe_events:
            cur.execute(
                """
                INSERT INTO soothe_events (triggered_at, resolved_at, voice_snippet_used, was_successful, is_real)
                VALUES (?, ?, ?, ?, ?);
                """,
                (event["triggered_at"], event["resolved_at"], event["voice_snippet_used"], event["was_successful"], event.get("is_real", False))
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
        try:
            cur = conn.cursor()
            # Ensure is_real column exists
            try:
                cur.execute("ALTER TABLE baby_vitals ADD COLUMN IF NOT EXISTS is_real BOOLEAN DEFAULT TRUE;")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_baby_vitals_is_real ON baby_vitals (is_real);")
                cur.execute("ALTER TABLE soothe_events ADD COLUMN IF NOT EXISTS is_real BOOLEAN DEFAULT TRUE;")
            except Exception:
                pass

            # Replace only earlier seed data; real readings stay.
            cur.execute("DELETE FROM baby_vitals WHERE is_real = FALSE;")
            cur.execute("DELETE FROM soothe_events WHERE is_real = FALSE;")

            # Insert vitals in batch
            cur.executemany(
                """
                INSERT INTO baby_vitals (time, state, breathing_rate, heart_rate, confidence, motion_index, is_real)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
                """,
                vitals
            )

            for event in soothe_events:
                cur.execute(
                    """
                    INSERT INTO soothe_events (triggered_at, resolved_at, voice_snippet_used, was_successful, is_real)
                    VALUES (%s, %s, %s, %s, %s);
                    """,
                    (event["triggered_at"], event["resolved_at"], event["voice_snippet_used"], event["was_successful"], event.get("is_real", False))
                )

            conn.commit()
            print(f"     [OK] Seeded {len(vitals)} vitals and {len(soothe_events)} soothe events in Tiger Data.")
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        print(f"     [WARN] Could not seed Tiger Data directly: {e}")


def last_completed_night(bedtime: str, wake_time: str, now: datetime.datetime) -> datetime.datetime:
    """An anchor inside the most recent night that has already ended, so no seeded row is in the future."""
    _, end = get_night_window(bedtime, wake_time, as_of=now)
    return now if end <= now else now - datetime.timedelta(days=1)


def seed_all_databases(bedtime: str = "20:00", wake_time: str = "07:00"):
    """Seeds one completed night (sample data for the dashboard) into every database tier."""
    now = datetime.datetime.now(datetime.timezone.utc)
    print("============================================================")
    print("Cribby Telemetry Seeder: Populating Database Tiers")
    print("============================================================")

    all_vitals, all_soothe = generate_night_session(last_completed_night(bedtime, wake_time, now), bedtime, wake_time)

    print(f"Generated {len(all_vitals)} biometric readings for the last completed night.")
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
