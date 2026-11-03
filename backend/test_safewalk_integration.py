import os
import sys
from datetime import datetime, timedelta

# Ensure backend directory is in python path
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from main import app, check_overdue_safewalks
from database import (
    get_connection, init_db, create_user, get_user_by_email,
    add_contact
)
from auth import create_token

client = TestClient(app)

def run_tests():
    print("--- 1. Testing Database Initialization ---")
    init_db()

    conn = get_connection()
    cur = conn.cursor()
    # Clean up test users
    cur.execute("DELETE FROM users WHERE email LIKE 'safewalk_test_%'")
    conn.close()

    print("--- 2. Register Test User & Contact ---")
    email1 = f"safewalk_test_1_{int(datetime.now().timestamp())}@example.com"
    reg1 = client.post("/api/register", json={
        "name": "Priya Sharma",
        "email": email1,
        "password": "Password123!",
        "phone": "+919876543210"
    })
    assert reg1.status_code == 200, f"Register failed: {reg1.text}"
    token1 = reg1.json()["token"]
    user1_id = reg1.json()["user"]["id"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    # Add emergency contact
    c_res = client.post("/api/contacts", json={
        "name": "Rohan (Brother)",
        "phone": "+919123456789",
        "relationship": "Brother"
    }, headers=headers1)
    assert c_res.status_code == 200, f"Add contact failed: {c_res.text}"

    # Register second user for authorization checks
    email2 = f"safewalk_test_2_{int(datetime.now().timestamp())}@example.com"
    reg2 = client.post("/api/register", json={
        "name": "Sneha Patel",
        "email": email2,
        "password": "Password123!",
        "phone": "+919876543211"
    })
    assert reg2.status_code == 200
    token2 = reg2.json()["token"]
    headers2 = {"Authorization": f"Bearer {token2}"}

    print("--- 3. Testing Journey Mode 1: Relaxed Journey ---")
    r_relaxed = client.post("/api/safewalk/start", json={
        "dest_name": "Metro Station",
        "dest_lat": 28.6139,
        "dest_lng": 77.2090,
        "eta_minutes": 20,
        "mode": "relaxed",
        "grace_period_minutes": 10
    }, headers=headers1)
    assert r_relaxed.status_code == 200, f"Start relaxed failed: {r_relaxed.text}"
    walk_relaxed = r_relaxed.json()["safewalk"]
    assert walk_relaxed["mode"] == "relaxed"
    assert walk_relaxed["checkin_interval_minutes"] is None
    assert walk_relaxed["grace_period_minutes"] == 10
    trail_relaxed = r_relaxed.json()["trail"]
    assert len(trail_relaxed) >= 2
    assert any(e["event_type"] == "started" for e in trail_relaxed)
    assert any(e["event_type"] == "mode_selected" for e in trail_relaxed)
    print(" Relaxed Journey creation & trail verified.")

    print("--- 4. Testing Journey Mode 2: Protected Journey ---")
    r_protected = client.post("/api/safewalk/start", json={
        "dest_name": "University Campus",
        "dest_lat": 28.5450,
        "dest_lng": 77.1926,
        "eta_minutes": 45,
        "mode": "protected",
        "checkin_interval_minutes": 15,
        "grace_period_minutes": 5
    }, headers=headers1)
    assert r_protected.status_code == 200
    walk_protected = r_protected.json()["safewalk"]
    assert walk_protected["mode"] == "protected"
    assert walk_protected["checkin_interval_minutes"] == 15
    assert walk_protected["next_checkin_due"] is not None
    assert walk_protected["grace_period_minutes"] == 5
    walk_id = walk_protected["id"]
    print(" Protected Journey creation verified.")

    print("--- 5. Testing Active Journey & Contact Visibility ---")
    active_res = client.get("/api/safewalk/active", headers=headers1)
    assert active_res.status_code == 200
    active_data = active_res.json()
    assert active_data["safewalk"]["id"] == walk_id
    assert len(active_data["contacts"]) >= 1
    assert active_data["contacts"][0]["name"] == "Rohan (Brother)"
    assert len(active_data["trail"]) >= 2
    print(" Active journey, trail and authorized contacts verified.")

    print("--- 6. Testing Safety Confirmation (Check-in) ---")
    checkin_res = client.post(f"/api/safewalk/{walk_id}/checkin", headers=headers1)
    assert checkin_res.status_code == 200, f"Checkin failed: {checkin_res.text}"
    checkin_data = checkin_res.json()
    assert checkin_data["safewalk"]["last_checkin_at"] is not None
    assert any(e["event_type"] == "safety_confirmed" for e in checkin_data["trail"])
    print(" Safety confirmation and trail event verified.")

    print("--- 7. Testing ETA Extension ---")
    extend_res = client.post(f"/api/safewalk/{walk_id}/extend", json={"extra_minutes": 15}, headers=headers1)
    assert extend_res.status_code == 200, f"Extend failed: {extend_res.text}"
    extend_data = extend_res.json()
    assert any(e["event_type"] == "eta_extended" for e in extend_data["trail"])
    print(" ETA extension and trail event verified.")

    print("--- 8. Testing Authorization & Security Bounds ---")
    # User 2 tries to check in User 1's walk
    unauth_checkin = client.post(f"/api/safewalk/{walk_id}/checkin", headers=headers2)
    assert unauth_checkin.status_code == 404
    # User 2 tries to extend User 1's walk
    unauth_extend = client.post(f"/api/safewalk/{walk_id}/extend", json={"extra_minutes": 10}, headers=headers2)
    assert unauth_extend.status_code == 404
    # User 2 tries to view User 1's trail
    unauth_trail = client.get(f"/api/safewalk/{walk_id}/trail", headers=headers2)
    assert unauth_trail.status_code == 404
    print(" User ownership and authorization boundaries enforced.")

    print("--- 9. Testing Journey Mode 3: High-Support Journey ---")
    r_high = client.post("/api/safewalk/start", json={
        "dest_name": "Late Night Bus Terminal",
        "dest_lat": 28.6500,
        "dest_lng": 77.2300,
        "eta_minutes": 25,
        "mode": "high_support",
        "checkin_interval_minutes": 5,
        "grace_period_minutes": 3
    }, headers=headers1)
    assert r_high.status_code == 200
    walk_high = r_high.json()["safewalk"]
    assert walk_high["mode"] == "high_support"
    assert walk_high["checkin_interval_minutes"] == 5
    assert walk_high["grace_period_minutes"] == 3
    walk_high_id = walk_high["id"]
    print(" High-Support Journey creation verified.")

    print("--- 10. Testing Escalation Pipeline (Grace Period -> Alert) ---")
    # Simulate ETA passed
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE safe_walks SET eta = NOW() - INTERVAL '1 minute', next_checkin_due = NOW() - INTERVAL '1 minute' WHERE id = %s",
        (walk_high_id,)
    )
    conn.close()

    # Run background check step 1: enters grace period
    import asyncio
    asyncio.run(check_overdue_safewalks())

    # Verify status transition
    trail_res1 = client.get(f"/api/safewalk/{walk_high_id}/trail", headers=headers1)
    trail1 = trail_res1.json()["trail"]
    assert any(e["event_type"] == "arrival_unconfirmed" for e in trail1), "Expected arrival_unconfirmed event"
    print(" Grace period entered and logged in trail.")

    # Simulate Grace Period expiration
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE safe_walks SET eta = NOW() - INTERVAL '10 minutes', next_checkin_due = NOW() - INTERVAL '10 minutes' WHERE id = %s",
        (walk_high_id,)
    )
    conn.close()

    # Run background check step 2: grace expired -> escalation alert dispatched
    asyncio.run(check_overdue_safewalks())

    trail_res2 = client.get(f"/api/safewalk/{walk_high_id}/trail", headers=headers1)
    trail2 = trail_res2.json()["trail"]
    assert any(e["event_type"] == "escalation_dispatched" for e in trail2), "Expected escalation_dispatched event"
    esc_event = [e for e in trail2 if e["event_type"] == "escalation_dispatched"][0]
    print(f" Escalation dispatched event logged: '{esc_event['title']}' — '{esc_event['description']}'")

    # Run background check step 3: Idempotency check (no duplicate alerts)
    esc_count_before = len([e for e in trail2 if e["event_type"] == "escalation_dispatched"])
    asyncio.run(check_overdue_safewalks())
    trail_res3 = client.get(f"/api/safewalk/{walk_high_id}/trail", headers=headers1)
    trail3 = trail_res3.json()["trail"]
    esc_count_after = len([e for e in trail3 if e["event_type"] == "escalation_dispatched"])
    assert esc_count_before == esc_count_after, "Duplicate escalation event logged!"
    print(" Escalation idempotency verified: no duplicate alerts on re-execution.")

    print("--- 11. Testing SafeWalk Completion ---")
    end_res = client.post(f"/api/safewalk/{walk_high_id}/end", headers=headers1)
    assert end_res.status_code == 200
    assert end_res.json()["safewalk"]["status"] == "completed"
    assert any(e["event_type"] == "completed" for e in end_res.json()["trail"])
    print(" Journey completion verified.")

    print("\n===========================================")
    print("ALL SMART JOURNEY PROTECTION BACKEND TESTS PASSED!")
    print("===========================================")

if __name__ == "__main__":
    run_tests()
