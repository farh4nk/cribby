import uuid
import pytest
from fastapi.testclient import TestClient
from backend.api.app import app

client = TestClient(app)

def test_sync_new_user_and_auto_seed_baby():
    test_sub = f"google_test_{uuid.uuid4()}"
    user_payload = {
        "id": test_sub,
        "email": f"{test_sub}@example.com",
        "name": "Alex Smith",
        "avatar_url": "https://lh3.googleusercontent.com/test-pic"
    }

    # First sync: creates user and seeds primary baby
    response = client.post("/api/users/sync", json=user_payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user"]["id"] == test_sub
    assert data["user"]["email"] == f"{test_sub}@example.com"
    assert data["user"]["name"] == "Alex Smith"
    assert data["baby"]["parent_id"] == test_sub
    assert data["baby"]["name"] == ""
    assert data["is_first_time"] is True
    assert data["needs_onboarding"] is True
    baby_id = data["baby"]["id"]

    # Fetch baby via parent user ID
    get_res = client.get(f"/api/users/{test_sub}/baby")
    assert get_res.status_code == 200
    assert get_res.json()["baby"]["id"] == baby_id

    # Update baby profile
    update_res = client.put(f"/api/babies/{baby_id}", json={
        "name": "Test Baby",
        "bedtime": "19:30",
        "wake_time": "06:30",
        "voice_id": "test_elevenlabs_voice_123"
    })
    assert update_res.status_code == 200
    updated_baby = update_res.json()["baby"]
    assert updated_baby["name"] == "Test Baby"
    assert updated_baby["bedtime"] == "19:30"
    assert updated_baby["voice_id"] == "test_elevenlabs_voice_123"

    # Second sync for same user: should retain updated baby
    resync_response = client.post("/api/users/sync", json={
        "id": test_sub,
        "email": f"{test_sub}@example.com",
        "name": "Alex Smith Updated",
        "avatar_url": "https://lh3.googleusercontent.com/test-pic"
    })
    assert resync_response.status_code == 200
    resync_data = resync_response.json()
    assert resync_data["user"]["name"] == "Alex Smith Updated"
    assert resync_data["baby"]["id"] == baby_id
    assert resync_data["baby"]["name"] == "Test Baby"
    assert resync_data["is_first_time"] is False


def test_first_time_user_onboarding_flow():
    test_sub = f"google_parent_{uuid.uuid4()}"
    user_payload = {
        "id": test_sub,
        "email": f"{test_sub}@example.com",
        "name": "Emma Watson",
        "avatar_url": "https://lh3.googleusercontent.com/test-emma"
    }

    # 1. First-time sign in: user added to database, flagged as needing onboarding
    sync_res = client.post("/api/users/sync", json=user_payload)
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert sync_data["is_first_time"] is True
    assert sync_data["needs_onboarding"] is True
    assert sync_data["user"]["id"] == test_sub
    assert sync_data["baby"]["name"] == ""

    # 2. Parent completes onboarding: answers baby name and sleep schedule
    onboard_res = client.post(f"/api/users/{test_sub}/onboarding", json={
        "baby_name": "Maya",
        "bedtime": "20:30",
        "wake_time": "07:30"
    })
    assert onboard_res.status_code == 200
    onboard_data = onboard_res.json()
    assert onboard_data["status"] == "onboarded"
    assert onboard_data["needs_onboarding"] is False
    assert onboard_data["user"]["onboarded"] in (True, 1)
    assert onboard_data["baby"]["name"] == "Maya"
    assert onboard_data["baby"]["bedtime"] == "20:30"
    assert onboard_data["baby"]["wake_time"] == "07:30"

    # 3. Returning user signs in: automatically loads saved baby data, no onboarding needed
    returning_sync_res = client.post("/api/users/sync", json=user_payload)
    assert returning_sync_res.status_code == 200
    returning_data = returning_sync_res.json()
    assert returning_data["is_first_time"] is False
    assert returning_data["needs_onboarding"] is False
    assert returning_data["baby"]["name"] == "Maya"
    assert returning_data["baby"]["bedtime"] == "20:30"
    assert returning_data["baby"]["wake_time"] == "07:30"

    # 4. GET /api/users/{id}/baby also reflects the saved baby profile
    get_baby_res = client.get(f"/api/users/{test_sub}/baby")
    assert get_baby_res.status_code == 200
    assert get_baby_res.json()["baby"]["name"] == "Maya"
    assert get_baby_res.json()["baby"]["bedtime"] == "20:30"
