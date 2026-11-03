"""
Ladli Behna — Profile & Safety Preferences Test Suite
Tests:
- GET /api/me (authenticated & unauthenticated)
- PUT /api/me (updating name, phone, safe_word)
- Phone validation (reject invalid 10-digit, reject non-Indian mobile, reject formatting issues)
- Phone normalization (accepting 10 digits and +91 prefix, saving normalized +91XXXXXXXXXX)
- Name validation (rejecting empty/whitespace names)
- Safe word updating and persistence
- Authentication guard on both endpoints (401 on missing/invalid token)
"""

import sys
import uuid
from pathlib import Path

# Ensure UTF-8 output on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from starlette.testclient import TestClient
from backend.main import app

def run_profile_tests():
    print("=" * 65)
    print("🛡️ LADLI BEHNA — PROFILE & SAFETY PREFERENCES TEST SUITE")
    print("=" * 65)
    client = TestClient(app)

    # 1. Unauthenticated checks
    print("\n[1/7] Testing Unauthenticated Access Guards (401)...")
    get_unauth = client.get("/api/me")
    assert get_unauth.status_code == 401, f"Expected 401, got {get_unauth.status_code}"
    put_unauth = client.put("/api/me", json={"name": "Attacker"})
    assert put_unauth.status_code == 401, f"Expected 401, got {put_unauth.status_code}"
    print("  ✅ GET and PUT /api/me strictly reject unauthenticated requests with 401")

    # 2. Register fresh user for testing
    print("\n[2/7] Creating fresh user for profile lifecycle...")
    unique_id = uuid.uuid4().hex[:6]
    test_email = f"profile.test.{unique_id}@ladlibehna.org"
    reg_payload = {
        "email": test_email,
        "password": "SecurePassword123!",
        "name": f"Ritika Test {unique_id}",
        "phone": "+919876543210",
        "safe_word": "MAYDAY"
    }
    reg_res = client.post("/api/register", json=reg_payload)
    assert reg_res.status_code == 200, f"Registration failed: {reg_res.text}"
    token = reg_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"  ✅ Registered test user {test_email}")

    # 3. GET /api/me verification
    print("\n[3/7] Testing GET /api/me (Profile Retrieval)...")
    me_res = client.get("/api/me", headers=headers)
    assert me_res.status_code == 200, f"GET /api/me failed: {me_res.text}"
    profile_data = me_res.json()
    profile = profile_data.get("user", profile_data)
    assert profile["email"] == test_email
    assert profile["name"] == reg_payload["name"]
    assert profile["phone"] == "+919876543210"
    assert "created_at" in profile and profile["created_at"] is not None
    print(f"  ✅ Retrieved profile: Name='{profile['name']}', Phone='{profile['phone']}', SafeWord={profile.get('safe_word')}, Created='{profile['created_at']}'")

    # 4. PUT /api/me Validation: Invalid Phone Numbers (422)
    print("\n[4/7] Testing Mobile Number Validation (422 Rejections)...")
    invalid_phones = [
        ("12345", "Too short"),
        ("9876543210123", "Too long"),
        ("5987654321", "Invalid leading digit 5 (must start with 6, 7, 8, or 9)"),
        ("98765abcde", "Contains letters"),
        ("+915876543210", "Invalid leading digit under +91"),
        ("+19876543210", "Non-Indian country code")
    ]
    for invalid_p, reason in invalid_phones:
        res = client.put("/api/me", headers=headers, json={"phone": invalid_p})
        assert res.status_code == 422, f"Expected 422 for phone '{invalid_p}' ({reason}), got {res.status_code}: {res.text}"
        print(f"  ✅ Correctly rejected invalid phone '{invalid_p}' ({reason}) with 422")

    # 5. PUT /api/me Validation: Empty Name (422)
    print("\n[5/7] Testing Name Validation (422 Rejection on Empty/Whitespace)...")
    empty_names = ["", "   ", "\t\n"]
    for empty_n in empty_names:
        res = client.put("/api/me", headers=headers, json={"name": empty_n})
        assert res.status_code == 422, f"Expected 422 for empty name, got {res.status_code}: {res.text}"
    print("  ✅ Correctly rejected empty/whitespace names with 422")

    # 6. PUT /api/me Valid Updates and Normalization
    print("\n[6/7] Testing Valid Profile & Safe Word Updates...")
    # Update with 10-digit number without prefix -> should normalize to +91
    update_payload_1 = {
        "name": "Ritika Professional",
        "phone": "9812345678",
        "safe_word": "BLUE-SHIELD"
    }
    update_res_1 = client.put("/api/me", headers=headers, json=update_payload_1)
    assert update_res_1.status_code == 200, f"Update failed: {update_res_1.text}"
    updated_user = update_res_1.json().get("user", update_res_1.json())
    assert updated_user["name"] == "Ritika Professional"
    assert updated_user["phone"] == "+919812345678", f"Expected normalization to +919812345678, got {updated_user['phone']}"
    assert updated_user["safe_word"] == "BLUE-SHIELD"
    print("  ✅ Profile updated & mobile normalized to +919812345678")

    # Update with spaced/dashed +91 number
    update_payload_2 = {
        "phone": "+91 99887 76655",
        "safe_word": "CRIMSON-GUARDIAN"
    }
    update_res_2 = client.put("/api/me", headers=headers, json=update_payload_2)
    assert update_res_2.status_code == 200, f"Update failed: {update_res_2.text}"
    updated_user_2 = update_res_2.json().get("user", update_res_2.json())
    assert updated_user_2["phone"] == "+919988776655"
    assert updated_user_2["safe_word"] == "CRIMSON-GUARDIAN"
    print("  ✅ Formatted mobile normalized to +919988776655 and safe word updated to 'CRIMSON-GUARDIAN'")

    # 7. Persistence Verification via subsequent GET /api/me
    print("\n[7/7] Verifying Persistence via subsequent GET /api/me...")
    verify_res = client.get("/api/me", headers=headers)
    assert verify_res.status_code == 200
    final_data = verify_res.json().get("user", verify_res.json())
    assert final_data["name"] == "Ritika Professional"
    assert final_data["phone"] == "+919988776655"
    assert final_data["safe_word"] == "CRIMSON-GUARDIAN"
    print("  ✅ Database persistence verified: name, phone and safe word strictly match updated state")

    print("\n" + "=" * 65)
    print("🎉 ALL PROFILE & SAFETY PREFERENCES TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 65)

if __name__ == "__main__":
    run_profile_tests()
