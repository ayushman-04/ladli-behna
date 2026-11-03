"""
Ladli Behna — Profile & Safety Preferences Test Suite
Tests:
- GET /api/me (authenticated & unauthenticated)
- PUT /api/me (updating name, phone, safe_word)
- Phone validation (reject invalid 10-digit, reject non-Indian mobile, reject formatting issues)
- Phone normalization (accepting 10 digits and +91 prefix, saving normalized +91XXXXXXXXXX)
- Name validation (rejecting empty/whitespace names)
- Safe word updating and persistence
- Intentionally clearing phone number (empty string / null -> sets to NULL in DB)
- Intentionally clearing safe word (empty string / null -> sets to NULL in DB)
- Partial updates preserving unmentioned fields
- Security verification: safe_word NOT leaked in /api/login or /api/register
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
    print("\n[1/10] Testing Unauthenticated Access Guards (401)...")
    get_unauth = client.get("/api/me")
    assert get_unauth.status_code == 401, f"Expected 401, got {get_unauth.status_code}"
    put_unauth = client.put("/api/me", json={"name": "Attacker"})
    assert put_unauth.status_code == 401, f"Expected 401, got {put_unauth.status_code}"
    print("  ✅ GET and PUT /api/me strictly reject unauthenticated requests with 401")

    # 2. Register fresh user & Security check: no safe_word in auth response
    print("\n[2/10] Testing User Registration & Safe Word Privacy Guard...")
    unique_id = uuid.uuid4().hex[:6]
    test_email = f"profile.test.{unique_id}@ladlibehna.org"
    reg_payload = {
        "email": test_email,
        "password": "SecurePassword123!",
        "name": f"Ritika Test {unique_id}",
        "phone": "+919876543210"
    }
    reg_res = client.post("/api/register", json=reg_payload)
    assert reg_res.status_code == 200, f"Registration failed: {reg_res.text}"
    reg_data = reg_res.json()
    token = reg_data["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert "safe_word" not in reg_data.get("user", {}), "Security violation: safe_word returned in register payload!"
    print(f"  ✅ Registered test user {test_email} (safe_word verified absent from register response)")

    # 3. Login Security check: safe_word not returned
    print("\n[3/10] Testing Login Response Safe Word Privacy Guard...")
    login_res = client.post("/api/login", json={"email": test_email, "password": "SecurePassword123!"})
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "safe_word" not in login_data.get("user", {}), "Security violation: safe_word returned in login payload!"
    print("  ✅ Verified safe_word is strictly excluded from /api/login response")

    # 4. GET /api/me verification
    print("\n[4/10] Testing GET /api/me (Profile Retrieval)...")
    me_res = client.get("/api/me", headers=headers)
    assert me_res.status_code == 200, f"GET /api/me failed: {me_res.text}"
    profile_data = me_res.json()
    profile = profile_data.get("user", profile_data)
    assert profile["email"] == test_email
    assert profile["name"] == reg_payload["name"]
    assert profile["phone"] == "+919876543210"
    assert "created_at" in profile and profile["created_at"] is not None
    print(f"  ✅ Retrieved profile: Name='{profile['name']}', Phone='{profile['phone']}', SafeWord={profile.get('safe_word')}, Created='{profile['created_at']}'")

    # 5. PUT /api/me Validation: Invalid Phone Numbers (422)
    print("\n[5/10] Testing Mobile Number Validation (422 Rejections)...")
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

    # 6. PUT /api/me Validation: Empty Name (422)
    print("\n[6/10] Testing Name Validation (422 Rejection on Empty/Whitespace)...")
    empty_names = ["", "   ", "\t\n"]
    for empty_n in empty_names:
        res = client.put("/api/me", headers=headers, json={"name": empty_n})
        assert res.status_code == 422, f"Expected 422 for empty name, got {res.status_code}: {res.text}"
    print("  ✅ Correctly rejected empty/whitespace names with 422")

    # 7. PUT /api/me Valid Updates and Normalization
    print("\n[7/10] Testing Valid Profile & Safe Word Updates...")
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

    # 8. Testing Intentionally Clearing Phone Number
    print("\n[8/10] Testing Intentionally Clearing Phone Number...")
    clear_phone_res = client.put("/api/me", headers=headers, json={"phone": ""})
    assert clear_phone_res.status_code == 200, f"Failed clearing phone: {clear_phone_res.text}"
    cleared_user = clear_phone_res.json().get("user", clear_phone_res.json())
    assert cleared_user["phone"] is None, f"Expected phone to be None, got: {cleared_user['phone']}"
    # Verify in DB via subsequent GET /api/me
    check_get_1 = client.get("/api/me", headers=headers).json().get("user")
    assert check_get_1["phone"] is None, "Phone was not cleared in database!"
    assert check_get_1["name"] == "Ritika Professional", "Unmodified name was unexpectedly changed!"
    assert check_get_1["safe_word"] == "BLUE-SHIELD", "Unmodified safe_word was unexpectedly wiped!"
    print("  ✅ Intentionally clearing phone with '' succeeded and set database column to NULL")

    # Reset phone for next test
    client.put("/api/me", headers=headers, json={"phone": "9876543210"})

    # 9. Testing Intentionally Clearing Safe Word
    print("\n[9/10] Testing Intentionally Clearing Safe Word...")
    clear_safe_word_res = client.put("/api/me", headers=headers, json={"safe_word": ""})
    assert clear_safe_word_res.status_code == 200, f"Failed clearing safe_word: {clear_safe_word_res.text}"
    cleared_sw_user = clear_safe_word_res.json().get("user", clear_safe_word_res.json())
    assert cleared_sw_user["safe_word"] is None, f"Expected safe_word to be None, got: {cleared_sw_user['safe_word']}"
    # Verify in DB via subsequent GET /api/me
    check_get_2 = client.get("/api/me", headers=headers).json().get("user")
    assert check_get_2["safe_word"] is None, "Safe word was not cleared in database!"
    assert check_get_2["phone"] == "+919876543210", "Unmodified phone was unexpectedly changed!"
    print("  ✅ Intentionally clearing safe word with '' succeeded and set database column to NULL")

    # 10. Testing Partial Updates (Updating Name only does not wipe other fields)
    print("\n[10/10] Testing Partial Updates Preserving Existing Fields...")
    client.put("/api/me", headers=headers, json={"phone": "9988776655", "safe_word": "GUARDIAN-PHOENIX"})
    partial_res = client.put("/api/me", headers=headers, json={"name": "Ritika Senior Lead"})
    assert partial_res.status_code == 200
    partial_data = client.get("/api/me", headers=headers).json().get("user")
    assert partial_data["name"] == "Ritika Senior Lead"
    assert partial_data["phone"] == "+919988776655"
    assert partial_data["safe_word"] == "GUARDIAN-PHOENIX"
    print("  ✅ Partial updates cleanly preserve unmentioned fields (name updated while phone & safe_word kept intact)")

    print("\n" + "=" * 65)
    print("🎉 ALL 10 PROFILE & SAFETY PREFERENCES TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 65)

if __name__ == "__main__":
    run_profile_tests()
