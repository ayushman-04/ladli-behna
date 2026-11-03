"""
Ladli Behna — End-to-End Integration Verification Suite
Tests backend health, database connectivity, auth (register/login/me),
safety reports & heatmap, nearest police query, and emergency features.
"""

import sys
import uuid
from pathlib import Path

# Ensure UTF-8 output on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Ensure backend directory and root in sys.path
BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from starlette.testclient import TestClient
from backend.main import app
from backend.database import get_connection

def run_tests():
    print("=" * 60)
    print("🚀 LADLI BEHNA — INTEGRATION TEST SUITE")
    print("=" * 60)
    client = TestClient(app)

    # 1. Database Connectivity
    print("\n[1/8] Testing Database Connectivity...")
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT current_database(), version()")
        db_info = cur.fetchone()
        conn.close()
        print(f"  ✅ Connected to PostgreSQL database: {db_info['current_database']}")
        print(f"  ℹ️ Version: {db_info['version'][:45]}...")
    except Exception as e:
        print(f"  ❌ Database connection failed: {e}")
        return False

    # 2. Backend Health Check
    print("\n[2/8] Testing Backend Health Check (/api/health)...")
    res = client.get("/api/health")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.json()
    assert data["status"] == "healthy", f"Status not healthy: {data}"
    print(f"  ✅ Backend health verified: {data}")

    # 3. User Registration
    test_id = uuid.uuid4().hex[:6]
    test_email = f"lead.tester.{test_id}@ladlibehna.org"
    test_password = "SecurePassword@123"
    test_name = f"Pooja Sharma {test_id}"
    print(f"\n[3/8] Testing User Registration ({test_email})...")
    reg_res = client.post("/api/register", json={
        "name": test_name,
        "email": test_email,
        "password": test_password,
        "phone": "+919876543210"
    })
    assert reg_res.status_code == 200, f"Register failed: {reg_res.text}"
    reg_data = reg_res.json()
    assert "token" in reg_data, "No JWT token in registration response"
    token = reg_data["token"]
    user_id = reg_data["user"]["id"]
    print(f"  ✅ Registration successful: user_id={user_id}, name='{reg_data['user']['name']}'")

    headers = {"Authorization": f"Bearer {token}"}

    # 4. User Login & Profile Authentication
    print("\n[4/8] Testing Login & Profile Fetch (/api/login & /api/me)...")
    login_res = client.post("/api/login", json={
        "email": test_email,
        "password": test_password
    })
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    assert "token" in login_res.json(), "Token missing from login"
    print("  ✅ Login successful with valid credentials")

    profile_res = client.get("/api/me", headers=headers)
    assert profile_res.status_code == 200, f"Profile fetch failed: {profile_res.text}"
    assert profile_res.json()["user"]["email"] == test_email
    print(f"  ✅ Profile authenticated via JWT: {profile_res.json()['user']['name']}")

    # 5. Emergency Contacts
    print("\n[5/8] Testing Emergency Contacts (/api/contacts)...")
    add_contact_res = client.post("/api/contacts", headers=headers, json={
        "name": "Sister Priya",
        "phone": "+919811122233",
        "relationship": "Sister"
    })
    assert add_contact_res.status_code == 200, f"Add contact failed: {add_contact_res.text}"
    contact = add_contact_res.json()["contact"]
    contact_id = contact["id"]
    print(f"  ✅ Contact added: {contact['name']} ({contact['phone']}) [ID: {contact_id}]")

    list_contacts_res = client.get("/api/contacts", headers=headers)
    assert list_contacts_res.status_code == 200
    contacts = list_contacts_res.json()["contacts"]
    assert any(c["id"] == contact_id for c in contacts), "Contact not in list"
    print(f"  ✅ Contacts list retrieved ({len(contacts)} contacts)")

    # 6. Safety Reports & Heatmap Integration
    print("\n[6/8] Testing Safety Reports & Heatmap (/api/reports & /api/reports/heatmap)...")
    report_res = client.post("/api/reports", headers=headers, json={
        "latitude": 28.6139,
        "longitude": 77.2090,
        "category": "poor_lighting",
        "description": "Street lights broken along service road near metro gate"
    })
    assert report_res.status_code == 200, f"Report submission failed: {report_res.text}"
    report_data = report_res.json()["report"]
    print(f"  ✅ Safety hazard reported: [ID: {report_data['id']}] Category: {report_data['category']}")

    heatmap_res = client.get("/api/reports/heatmap")
    assert heatmap_res.status_code == 200, f"Heatmap fetch failed: {heatmap_res.text}"
    heatmap_data = heatmap_res.json()["reports"]
    assert len(heatmap_data) > 0, "No heatmap reports returned"
    print(f"  ✅ Heatmap telemetry retrieved: {len(heatmap_data)} total community reports active")

    # 7. Police Station Spatial Lookup
    print("\n[7/8] Testing Spatial Police Station Lookup (/api/location/police)...")
    police_res = client.post("/api/location/police", json={
        "latitude": 28.6139,
        "longitude": 77.2090
    })
    assert police_res.status_code == 200, f"Police endpoint failed: {police_res.text}"
    police_data = police_res.json()
    assert "stations" in police_data, "No 'stations' key in response"
    print(f"  ✅ Police station spatial query response received: {len(police_data['stations'])} stations returned")

    # 8. SafeWalk & Emergency SOS Trigger
    print("\n[8/8] Testing SafeWalk & Emergency SOS Protocol...")
    walk_res = client.post("/api/safewalk/start", headers=headers, json={
        "dest_name": "Connaught Place Metro Station",
        "dest_lat": 28.6328,
        "dest_lng": 77.2197,
        "eta_minutes": 25
    })
    assert walk_res.status_code == 200, f"SafeWalk start failed: {walk_res.text}"
    walk_id = walk_res.json()["safewalk"]["id"]
    print(f"  ✅ SafeWalk started: [ID: {walk_id}] Destination: Connaught Place")

    active_walk_res = client.get("/api/safewalk/active", headers=headers)
    assert active_walk_res.status_code == 200
    assert active_walk_res.json()["safewalk"]["id"] == walk_id
    print("  ✅ Active SafeWalk verified")

    end_walk_res = client.post(f"/api/safewalk/{walk_id}/end", headers=headers)
    assert end_walk_res.status_code == 200
    print("  ✅ SafeWalk completed successfully")

    # Emergency SOS trigger
    sos_res = client.post("/api/emergency/trigger", headers=headers, json={
        "latitude": 28.6139,
        "longitude": 77.2090,
        "type": "manual",
        "transcript": "Test manual SOS trigger",
        "notify_police": False
    })
    assert sos_res.status_code == 200, f"SOS trigger failed: {sos_res.text}"
    sos_data = sos_res.json()
    assert "contacts" in sos_data and "maps_link" in sos_data
    print(f"  ✅ Emergency SOS protocol executed successfully: Maps link: {sos_data['maps_link']}")

    print("\n" + "=" * 60)
    print("🎉 ALL 8 INTEGRATION TESTS PASSED CLEANLY!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
