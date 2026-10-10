"""
FastAPI Analytics & Summary Server (Dev 4).
Exposes:
- GET /api/nightly-summary: AI morning recap from Gemini & Tiger Data (Task 4.3)
- GET /api/sleep-timeline: Chronological state transitions for Dev 2 timeline
- GET /api/vitals-trend: Downsampled time-series vitals for Dev 2 sparklines
- POST /api/soothe-events: Logs auto-soothe intervention events from Dev 3
- GET /api/health: Service and database status check
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import datetime
from backend.db.connection import get_db_connection, is_postgres, test_connection
from backend.services.gemini_summary import (
    fetch_nightly_metrics,
    generate_morning_brief,
    answer_nightly_question,
    get_night_window,
    parse_dt_safe,
)

app = FastAPI(
    title="Cribby Analytics & Summary API",
    description="Time-series telemetry storage with Tiger Data and Gemini morning recaps",
    version="1.0.0"
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class NightlyQAQuery(BaseModel):
    question: str
    baby_name: Optional[str] = "Baby"
    bedtime: Optional[str] = "20:00"
    wake_time: Optional[str] = "07:00"

class SootheEventCreate(BaseModel):
    triggered_at: Optional[str] = None
    resolved_at: Optional[str] = None
    voice_snippet_used: str
    was_successful: bool = True

@app.get("/api/health")
def health_check():
    """Health check endpoint showing database connectivity and sample stats."""
    db_ok = test_connection()
    if not db_ok:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT count(*) as vitals_count FROM baby_vitals;")
            vitals_count = cur.fetchone()["vitals_count"]
            cur.execute("SELECT count(*) as soothe_count FROM soothe_events;")
            soothe_count = cur.fetchone()["soothe_count"]
        finally:
            cur.close()

    return {
        "status": "healthy",
        "database": "Tiger Data PostgreSQL" if is_postgres() else "Local SQLite Fallback",
        "vitals_records": vitals_count,
        "soothe_records": soothe_count,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

@app.get("/api/nightly-summary")
def get_nightly_summary(
    baby_name: str = "Baby",
    bedtime: str = "20:00",
    wake_time: str = "07:00",
    hours: Optional[int] = None
):
    """Task 4.3: Aggregates night vitals from Tiger Data scoped to parent bedtime window and prompts Gemini."""
    try:
        metrics = fetch_nightly_metrics(bedtime=bedtime, wake_time=wake_time, hours=hours)
        summary = generate_morning_brief(metrics, baby_name=baby_name)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/nightly-qa")
def ask_nightly_qa(query: NightlyQAQuery):
    """Answers parent questions about sleep vitals using Gemini and Tiger Data."""
    try:
        res = answer_nightly_question(
            query.question,
            baby_name=query.baby_name or "Baby",
            bedtime=query.bedtime or "20:00",
            wake_time=query.wake_time or "07:00",
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def downsample_rows(rows: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    """Downsamples a list of time-series dictionaries evenly across the entire duration."""
    if not rows:
        return []
    n = len(rows)
    if n <= limit:
        return rows
    step = (n - 1) / (limit - 1)
    return [rows[int(round(i * step))] for i in range(limit)]

@app.get("/api/sleep-timeline")
def get_sleep_timeline(
    limit: int = 120,
    bedtime: Optional[str] = "20:00",
    wake_time: Optional[str] = "07:00"
):
    """Returns chronological timeline segments for Dev 2's sleep status block chart."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            if bedtime and wake_time:
                cur.execute("SELECT MAX(time) as max_time FROM baby_vitals;")
                time_row = cur.fetchone()
                latest_time = parse_dt_safe(time_row["max_time"]) if time_row and time_row["max_time"] else datetime.datetime.now(datetime.timezone.utc)
                window_start, window_end = get_night_window(bedtime, wake_time, as_of=latest_time)

                cur.execute(
                    """
                    SELECT time, state, breathing_rate, heart_rate, motion_index
                    FROM baby_vitals
                    WHERE time >= %s AND time <= %s
                    ORDER BY time ASC;
                    """ if is_postgres(conn) else """
                    SELECT time, state, breathing_rate, heart_rate, motion_index
                    FROM baby_vitals
                    WHERE time >= ? AND time <= ?
                    ORDER BY time ASC;
                    """,
                    (window_start, window_end)
                )
                rows = cur.fetchall()
                if rows:
                    return {"timeline": downsample_rows([dict(r) for r in rows], limit)}

            # Fallback if window empty
            cur.execute(
                """
                SELECT time, state, breathing_rate, heart_rate, motion_index
                FROM baby_vitals
                ORDER BY time DESC
                LIMIT 1000;
                """ if is_postgres(conn) else """
                SELECT time, state, breathing_rate, heart_rate, motion_index
                FROM baby_vitals
                ORDER BY time DESC
                LIMIT 1000;
                """
            )
            rows = cur.fetchall()
            return {"timeline": downsample_rows(list(reversed([dict(r) for r in rows])), limit)}
        finally:
            cur.close()

@app.get("/api/vitals-trend")
def get_vitals_trend(
    limit: int = 60,
    bedtime: Optional[str] = "20:00",
    wake_time: Optional[str] = "07:00"
):
    """Returns downsampled vitals for Dev 2 sparkline charts (breathing and pulse rates)."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            if bedtime and wake_time:
                cur.execute("SELECT MAX(time) as max_time FROM baby_vitals WHERE breathing_rate > 0 OR heart_rate > 0;")
                time_row = cur.fetchone()
                latest_time = parse_dt_safe(time_row["max_time"]) if time_row and time_row["max_time"] else datetime.datetime.now(datetime.timezone.utc)
                window_start, window_end = get_night_window(bedtime, wake_time, as_of=latest_time)

                cur.execute(
                    """
                    SELECT time, breathing_rate, heart_rate, state
                    FROM baby_vitals
                    WHERE time >= %s AND time <= %s AND (breathing_rate > 0 OR heart_rate > 0)
                    ORDER BY time ASC;
                    """ if is_postgres(conn) else """
                    SELECT time, breathing_rate, heart_rate, state
                    FROM baby_vitals
                    WHERE time >= ? AND time <= ? AND (breathing_rate > 0 OR heart_rate > 0)
                    ORDER BY time ASC;
                    """,
                    (window_start, window_end)
                )
                rows = cur.fetchall()
                if rows:
                    return {"trend": downsample_rows([dict(r) for r in rows], limit)}

            cur.execute(
                """
                SELECT time, breathing_rate, heart_rate, state
                FROM baby_vitals
                WHERE breathing_rate > 0 OR heart_rate > 0
                ORDER BY time DESC
                LIMIT 1000;
                """ if is_postgres(conn) else """
                SELECT time, breathing_rate, heart_rate, state
                FROM baby_vitals
                WHERE breathing_rate > 0 OR heart_rate > 0
                ORDER BY time DESC
                LIMIT 1000;
                """
            )
            rows = cur.fetchall()
            trend_data = downsample_rows(list(reversed([dict(r) for r in rows])), limit)
            return {"trend": trend_data}
        finally:
            cur.close()

@app.post("/api/soothe-events")
def record_soothe_event(event: SootheEventCreate):
    """Task 3/4 integration: records auto-soothe intervention events from Dev 3's audio engine."""
    triggered_at = event.triggered_at or datetime.datetime.now(datetime.timezone.utc).isoformat()
    resolved_at = event.resolved_at or datetime.datetime.now(datetime.timezone.utc).isoformat()

    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            if is_postgres(conn):
                cur.execute(
                    """
                    INSERT INTO soothe_events (triggered_at, resolved_at, voice_snippet_used, was_successful)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id;
                    """,
                    (triggered_at, resolved_at, event.voice_snippet_used, event.was_successful)
                )
                event_id = cur.fetchone()["id"]
            else:
                cur.execute(
                    """
                    INSERT INTO soothe_events (triggered_at, resolved_at, voice_snippet_used, was_successful)
                    VALUES (?, ?, ?, ?);
                    """,
                    (triggered_at, resolved_at, event.voice_snippet_used, event.was_successful)
                )
                event_id = cur.lastrowid
        finally:
            cur.close()

    return {
        "status": "recorded",
        "id": event_id,
        "triggered_at": triggered_at,
        "resolved_at": resolved_at,
        "voice_snippet_used": event.voice_snippet_used,
        "was_successful": event.was_successful
    }

class UserSyncRequest(BaseModel):
    id: str  # Google Sub ID
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None

class UserOnboardingRequest(BaseModel):
    baby_name: str
    bedtime: Optional[str] = "20:00"
    wake_time: Optional[str] = "07:00"

class BabyProfileUpdate(BaseModel):
    name: Optional[str] = None
    bedtime: Optional[str] = None
    wake_time: Optional[str] = None
    voice_id: Optional[str] = None

@app.post("/api/users/sync")
def sync_user(req: UserSyncRequest):
    """Upserts Google authenticated user into database and matches to baby profile."""
    import uuid
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            # Check if this user already exists prior to upsert
            cur.execute(
                "SELECT id, onboarded FROM users WHERE id = %s;" if is_postgres(conn) else "SELECT id, onboarded FROM users WHERE id = ?;",
                (req.id,)
            )
            existing_user = cur.fetchone()
            is_first_time = existing_user is None

            if is_postgres(conn):
                cur.execute(
                    """
                    INSERT INTO users (id, email, name, avatar_url, last_login_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        avatar_url = EXCLUDED.avatar_url,
                        last_login_at = NOW()
                    RETURNING id, email, name, avatar_url, onboarded, created_at;
                    """,
                    (req.id, req.email, req.name, req.avatar_url)
                )
                user_row = dict(cur.fetchone())

                cur.execute("SELECT * FROM babies WHERE parent_id = %s ORDER BY created_at ASC;", (req.id,))
                babies = [dict(r) for r in cur.fetchall()]
                if not babies:
                    baby_id = str(uuid.uuid4())
                    cur.execute(
                        """
                        INSERT INTO babies (id, parent_id, name, bedtime, wake_time)
                        VALUES (%s, %s, %s, %s, %s)
                        RETURNING id, parent_id, name, bedtime, wake_time, voice_id, created_at;
                        """,
                        (baby_id, req.id, "", "20:00", "07:00")
                    )
                    baby = dict(cur.fetchone())
                    babies = [baby]
                else:
                    baby = babies[0]
            else:
                cur.execute(
                    """
                    INSERT INTO users (id, email, name, avatar_url, last_login_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        avatar_url = excluded.avatar_url,
                        last_login_at = CURRENT_TIMESTAMP;
                    """,
                    (req.id, req.email, req.name, req.avatar_url)
                )
                cur.execute("SELECT id, email, name, avatar_url, onboarded, created_at FROM users WHERE id = ?;", (req.id,))
                user_row = dict(cur.fetchone())

                cur.execute("SELECT * FROM babies WHERE parent_id = ? ORDER BY created_at ASC;", (req.id,))
                babies = [dict(r) for r in cur.fetchall()]
                if not babies:
                    baby_id = str(uuid.uuid4())
                    cur.execute(
                        """
                        INSERT INTO babies (id, parent_id, name, bedtime, wake_time)
                        VALUES (?, ?, ?, ?, ?);
                        """,
                        (baby_id, req.id, "", "20:00", "07:00")
                    )
                    cur.execute("SELECT id, parent_id, name, bedtime, wake_time, voice_id, created_at FROM babies WHERE id = ?;", (baby_id,))
                    baby = dict(cur.fetchone())
                    babies = [baby]
                else:
                    baby = babies[0]

            user_onboarded = bool(user_row.get("onboarded", False))
            # Needs onboarding if not marked onboarded OR if baby name is still empty
            needs_onboarding = is_first_time or not user_onboarded or not bool(baby.get("name", "").strip())

            return {
                "user": user_row,
                "baby": baby,
                "babies": babies,
                "is_first_time": is_first_time,
                "needs_onboarding": needs_onboarding,
            }
        finally:
            cur.close()

@app.post("/api/users/{user_id}/onboarding")
def complete_onboarding(user_id: str, req: UserOnboardingRequest):
    """Completes initial onboarding: sets baby's name and sleep schedule, marks user as onboarded."""
    import uuid
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            clean_name = req.baby_name.strip()
            if not clean_name:
                raise HTTPException(status_code=400, detail="Baby name is required")

            cur.execute(
                "SELECT * FROM babies WHERE parent_id = %s ORDER BY created_at ASC;" if is_postgres(conn) else "SELECT * FROM babies WHERE parent_id = ? ORDER BY created_at ASC;",
                (user_id,)
            )
            babies = [dict(r) for r in cur.fetchall()]
            if babies:
                baby_id = babies[0]["id"]
                cur.execute(
                    """
                    UPDATE babies SET name = %s, bedtime = %s, wake_time = %s WHERE id = %s;
                    """ if is_postgres(conn) else """
                    UPDATE babies SET name = ?, bedtime = ?, wake_time = ? WHERE id = ?;
                    """,
                    (clean_name, req.bedtime or "20:00", req.wake_time or "07:00", baby_id)
                )
            else:
                baby_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO babies (id, parent_id, name, bedtime, wake_time)
                    VALUES (%s, %s, %s, %s, %s);
                    """ if is_postgres(conn) else """
                    INSERT INTO babies (id, parent_id, name, bedtime, wake_time)
                    VALUES (?, ?, ?, ?, ?);
                    """,
                    (baby_id, user_id, clean_name, req.bedtime or "20:00", req.wake_time or "07:00")
                )

            # Mark parent as onboarded
            cur.execute(
                "UPDATE users SET onboarded = TRUE WHERE id = %s;" if is_postgres(conn) else "UPDATE users SET onboarded = 1 WHERE id = ?;",
                (user_id,)
            )

            cur.execute(
                "SELECT * FROM babies WHERE id = %s;" if is_postgres(conn) else "SELECT * FROM babies WHERE id = ?;",
                (baby_id,)
            )
            baby = dict(cur.fetchone())

            cur.execute(
                "SELECT id, email, name, avatar_url, onboarded, created_at FROM users WHERE id = %s;" if is_postgres(conn) else "SELECT id, email, name, avatar_url, onboarded, created_at FROM users WHERE id = ?;",
                (user_id,)
            )
            user_row = dict(cur.fetchone())

            return {
                "status": "onboarded",
                "user": user_row,
                "baby": baby,
                "needs_onboarding": False
            }
        finally:
            cur.close()

@app.get("/api/users/{user_id}/baby")
def get_user_baby(user_id: str):
    """Returns primary baby profile for authenticated parent."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT * FROM babies WHERE parent_id = %s ORDER BY created_at ASC;" if is_postgres(conn) else "SELECT * FROM babies WHERE parent_id = ? ORDER BY created_at ASC;", (user_id,))
            rows = cur.fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail="No baby profile found for user")
            return {"baby": dict(rows[0]), "babies": [dict(r) for r in rows]}
        finally:
            cur.close()

@app.put("/api/babies/{baby_id}")
def update_baby_profile(baby_id: str, update: BabyProfileUpdate):
    """Updates child's name, bedtime schedule, or stored voice ID (unused since voice cloning was dropped)."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        try:
            fields = []
            values = []
            if update.name is not None:
                fields.append("name = %s" if is_postgres(conn) else "name = ?")
                values.append(update.name)
            if update.bedtime is not None:
                fields.append("bedtime = %s" if is_postgres(conn) else "bedtime = ?")
                values.append(update.bedtime)
            if update.wake_time is not None:
                fields.append("wake_time = %s" if is_postgres(conn) else "wake_time = ?")
                values.append(update.wake_time)
            if update.voice_id is not None:
                fields.append("voice_id = %s" if is_postgres(conn) else "voice_id = ?")
                values.append(update.voice_id)

            if not fields:
                raise HTTPException(status_code=400, detail="No fields provided for update")

            values.append(baby_id)
            query = f"UPDATE babies SET {', '.join(fields)} WHERE id = {'%s' if is_postgres(conn) else '?'};"
            cur.execute(query, tuple(values))

            cur.execute("SELECT * FROM babies WHERE id = %s;" if is_postgres(conn) else "SELECT * FROM babies WHERE id = ?;", (baby_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Baby profile not found")
            return {"status": "updated", "baby": dict(row)}
        finally:
            cur.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.api.app:app", host="0.0.0.0", port=8001, reload=True)
