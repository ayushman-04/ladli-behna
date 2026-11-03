"""
ShieldHer — Main FastAPI Application
All API routes in one file for hackathon simplicity.
"""

import sys
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import os
import sys
from pathlib import Path
import uuid

# Ensure backend directory is in sys.path so modules resolve whether run from root or backend/
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
import asyncio
import requests
from contextlib import suppress
from datetime import datetime, timedelta
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

# ============================================
# Twilio SMS Helper
# ============================================

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "").strip()  # E.164 format e.g. +15551234567

def send_sms(to_phone: str, message: str) -> dict:
    """
    Send an SMS via Twilio REST API.
    Returns { success: bool, error: str|None }.
    Falls back gracefully if Twilio is not configured.
    """
    to_phone = (to_phone or "").strip()
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, to_phone]):
        print(f"⚠️ Twilio not configured — SMS NOT sent to {to_phone}")
        return {"success": False, "error": "Twilio not configured"}

    try:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
        resp = requests.post(
            url,
            data={
                "From": TWILIO_FROM_NUMBER,
                "To": to_phone,
                "Body": message,
            },
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            timeout=10,
        )
        if resp.status_code in (200, 201):
            print(f"✅ SMS sent to {to_phone}")
            return {"success": True, "error": None}
        else:
            err = resp.json().get("message", resp.text[:200])
            print(f"❌ SMS failed to {to_phone}: {err}")
            return {"success": False, "error": err}
    except Exception as e:
        print(f"❌ SMS exception to {to_phone}: {e}")
        return {"success": False, "error": str(e)}

from database import (
    init_db, create_user, get_user_by_email, get_user_by_id, update_user,
    add_contact, get_contacts, delete_contact,
    create_incident, get_incidents, resolve_incident,
    create_report, get_heatmap_data,
    create_safewalk, get_active_safewalk, get_safewalk_by_id,
    checkin_safewalk, extend_safewalk_eta, end_safewalk,
    add_safewalk_event, get_safewalk_events,
    flag_grace_period_safewalks, claim_overdue_safewalks, update_safewalk_status
)
from auth import hash_password, verify_password, create_token, get_current_user_id
from openai_service import analyze_transcript, analyze_audio_file
from services.notification_service import send_emergency_alert
from ws.websocket import router as realtime_ws_router

# ============================================
# App Setup
# ============================================

app = FastAPI(
    title="ShieldHer API",
    description="Women Safety & Empowerment App — Hackathon Edition",
    version="1.0.0"
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(realtime_ws_router)

# Create uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

safewalk_monitor_task: Optional[asyncio.Task] = None


def _build_safewalk_overdue_message(user: dict, walk: dict) -> str:
    maps_link = f"https://www.google.com/maps?q={walk['dest_lat']},{walk['dest_lng']}"
    eta = walk.get("eta")
    eta_display = eta.strftime("%I:%M %p, %b %d %Y") if hasattr(eta, "strftime") else str(eta)
    mode_name = (walk.get("mode") or "journey").replace("_", " ").title()
    return (
        f"🚨 SAFEWALK ALERT from {user['name']}!\n"
        f"SafeWalk arrival is unconfirmed ({mode_name} mode).\n"
        f"Destination: {walk.get('dest_name', 'Unknown')}\n"
        f"Destination map: {maps_link}\n"
        f"Expected arrival: {eta_display}\n"
        f"Please check on them immediately."
    )


async def check_overdue_safewalks():
    # 1. Flag walks entering their grace period
    grace_walks = flag_grace_period_safewalks()
    for gw in grace_walks:
        grace_mins = gw.get("grace_period_minutes") or 5
        add_safewalk_event(
            walk_id=gw["id"],
            user_id=gw["user_id"],
            event_type="arrival_unconfirmed",
            title="Arrival Unconfirmed — Grace Period Started",
            description=f"Expected arrival passed without safe confirmation. {grace_mins}-minute grace period active before escalation.",
            metadata={"grace_minutes": grace_mins}
        )

    # 2. Claim walks whose grace period has expired
    overdue_walks = claim_overdue_safewalks()
    for walk in overdue_walks:
        user = get_user_by_id(walk["user_id"])
        if not user:
            continue

        message = _build_safewalk_overdue_message(user, walk)
        contacts = get_contacts(walk["user_id"])
        sms_results = []
        for contact in contacts:
            result = send_sms(contact["phone"], message)
            sms_results.append({
                "contact": contact["name"],
                "phone": contact["phone"],
                "sms_sent": result["success"],
                "sms_error": result.get("error"),
            })

        create_incident(
            user_id=walk["user_id"],
            incident_type="safewalk",
            threat_level="DANGER",
            transcript=f"SafeWalk overdue for destination: {walk.get('dest_name')}. Protection mode: {walk.get('mode')}.",
            lat=walk.get("dest_lat"),
            lng=walk.get("dest_lng"),
        )

        sent_count = len([r for r in sms_results if r["sms_sent"]])
        if sent_count > 0:
            summary = f"Alert SMS delivered to {sent_count}/{len(contacts)} contacts."
        elif contacts:
            summary = f"Escalation notification triggered for {len(contacts)} contacts (Twilio demo sandbox mode)."
        else:
            summary = "No emergency contacts configured for user."

        add_safewalk_event(
            walk_id=walk["id"],
            user_id=walk["user_id"],
            event_type="escalation_dispatched",
            title="Trusted Contacts Alert Dispatched",
            description=summary,
            metadata={"contacts_count": len(contacts), "results": sms_results, "mode": walk.get("mode")}
        )
        print(f"SafeWalk escalation executed for walk {walk['id']}: {sms_results}")


async def safewalk_monitor_loop():
    while True:
        try:
            await check_overdue_safewalks()
        except Exception as exc:
            print(f"SafeWalk monitor error: {exc}")
        await asyncio.sleep(60)

# Initialize database on startup
@app.on_event("startup")
async def startup():
    global safewalk_monitor_task
    init_db()
    safewalk_monitor_task = asyncio.create_task(safewalk_monitor_loop())
    print("🛡️ ShieldHer API is running!")


@app.on_event("shutdown")
async def shutdown():
    if safewalk_monitor_task:
        safewalk_monitor_task.cancel()
        with suppress(asyncio.CancelledError):
            await safewalk_monitor_task


# ============================================
# Pydantic Models (Request/Response schemas)
# ============================================

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    safe_word: Optional[str] = None

class ContactRequest(BaseModel):
    name: str
    phone: str
    relationship: Optional[str] = None

class TranscriptRequest(BaseModel):
    transcript: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class EmergencyRequest(BaseModel):
    latitude: float
    longitude: float
    type: str = "manual"  # manual, audio, shake
    transcript: Optional[str] = None
    notify_police: bool = False  # Optional: also SMS police helpline (user's choice)

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float

class ReportRequest(BaseModel):
    latitude: float
    longitude: float
    description: Optional[str] = None
    category: Optional[str] = None  # harassment, stalking, unsafe_area, poor_lighting, other

class SafeWalkRequest(BaseModel):
    dest_name: str
    dest_lat: float
    dest_lng: float
    eta_minutes: int  # how many minutes until expected arrival
    mode: Optional[str] = "relaxed"  # "relaxed" | "protected" | "high_support"
    checkin_interval_minutes: Optional[int] = None
    grace_period_minutes: Optional[int] = None

class SafeWalkExtendRequest(BaseModel):
    extra_minutes: int

class SafeWalkHelpRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    message: Optional[str] = None


@app.post("/api/register")
def register(req: RegisterRequest):
    """Create a new user account."""
    existing = get_user_by_email(req.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = hash_password(req.password)
    user = create_user(req.name, req.email, hashed, req.phone)
    token = create_token(user["id"])

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "phone": user.get("phone")
        }
    }


@app.post("/api/login")
def login(req: LoginRequest):
    """Login with email and password."""
    user = get_user_by_email(req.email)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user["id"])

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "phone": user.get("phone"),
            "safe_word": user.get("safe_word")
        }
    }


@app.get("/api/me")
def get_profile(user_id: int = Depends(get_current_user_id)):
    """Get current user's profile."""
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": user}


@app.put("/api/me")
def update_profile(req: UpdateProfileRequest, user_id: int = Depends(get_current_user_id)):
    """Update current user's profile."""
    user = update_user(user_id, req.name, req.phone, req.safe_word)
    return {"user": user}


@app.get("/api/contacts")
def list_contacts(user_id: int = Depends(get_current_user_id)):
    """Get all emergency contacts for current user."""
    contacts = get_contacts(user_id)
    return {"contacts": contacts}


@app.post("/api/contacts")
def create_contact(req: ContactRequest, user_id: int = Depends(get_current_user_id)):
    """Add a new emergency contact."""
    contact = add_contact(user_id, req.name, req.phone, req.relationship)
    return {"contact": contact}


@app.delete("/api/contacts/{contact_id}")
def remove_contact(contact_id: int, user_id: int = Depends(get_current_user_id)):
    """Delete an emergency contact."""
    success = delete_contact(contact_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Contact deleted"}


@app.post("/api/audio/analyze")
async def analyze_audio_transcript(req: TranscriptRequest, user_id: int = Depends(get_current_user_id)):
    """
    Analyze a text transcript (from Web Speech API) for threats.
    This is the primary analysis endpoint — browser transcribes, we analyze.
    """
    result = await analyze_transcript(req.transcript)

    # Log if suspicious or dangerous
    if result["threat_level"] in ["SUSPICIOUS", "DANGER"]:
        create_incident(
            user_id=user_id,
            incident_type="audio",
            threat_level=result["threat_level"],
            transcript=req.transcript,
            lat=req.latitude,
            lng=req.longitude
        )

    return {"analysis": result}


@app.post("/api/audio/upload")
async def upload_and_analyze_audio(
    audio: UploadFile = File(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    user_id: int = Depends(get_current_user_id)
):
    """
    Upload an audio file and analyze it with OpenAI transcription + text analysis.
    Alternative to transcript-based analysis.
    """
    # Save the audio file
    filename = f"{user_id}_{uuid.uuid4().hex[:8]}_{audio.filename}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    content = await audio.read()
    with open(filepath, "wb") as f:
        f.write(content)

    try:
        result = await analyze_audio_file(filepath)
    finally:
        try:
            os.remove(filepath)
        except OSError:
            pass

    # Log if suspicious or dangerous
    if result.get("threat_level") in ["SUSPICIOUS", "DANGER"]:
        create_incident(
            user_id=user_id,
            incident_type="audio",
            threat_level=result["threat_level"],
            transcript=result.get("transcript", ""),
            lat=latitude,
            lng=longitude
        )

    return {
        "analysis": result,
        "audio_file": filename
    }


@app.get("/api/audio/history")
def get_audio_history(user_id: int = Depends(get_current_user_id)):
    """Get past incident logs."""
    incidents_list = get_incidents(user_id)
    return {"incidents": incidents_list}



@app.post("/api/emergency/trigger")
def trigger_emergency(req: EmergencyRequest, user_id: int = Depends(get_current_user_id)):
    """
    Trigger the emergency protocol.
    - ALWAYS sends SMS to all emergency contacts via Twilio.
    - Optionally notifies police helpline if notify_police=True.
    - Returns contact info + deep links for the frontend UI.
    """
    # Use the same notification service as the working realtime LLM SOS path.
    notification = send_emergency_alert(
        user_id=user_id,
        summary=req.transcript or f"{req.type.title()} SOS triggered by user.",
        severity="DANGER",
        latitude=req.latitude,
        longitude=req.longitude,
        transcript=req.transcript or f"{req.type.title()} SOS triggered by user.",
        incident_type=req.type,
        alert_reason="Emergency SOS was triggered by the user.",
    )

    contacts = get_contacts(user_id)
    user = get_user_by_id(user_id)
    maps_link = f"https://www.google.com/maps?q={req.latitude},{req.longitude}"
    sos_message = notification.get("message", "")
    sms_results = notification.get("sms_results", [])

    # -------------------------------------------------------
    # OPTIONALLY notify police — only if user explicitly chose to
    # -------------------------------------------------------
    police_sms_result = None
    if req.notify_police:
        # India women helpline as example; adapt as needed
        police_msg = (
            f"\U0001f6a8 POLICE ASSISTANCE NEEDED\n"
            f"Name: {user['name']}\n"
            f"Phone: {user.get('phone', 'N/A')}\n"
            f"Location: {maps_link}\n"
            f"Time: {datetime.now().strftime('%I:%M %p, %b %d %Y')}"
        )
        # NOTE: Real emergency numbers (100, 911) don't accept SMS.
        # This would go to a configured police liaison number in production.
        police_number = os.getenv("POLICE_SMS_NUMBER", "").strip()
        if police_number:
            police_sms_result = send_sms(police_number, police_msg)
        else:
            police_sms_result = {"success": False, "error": "POLICE_SMS_NUMBER not configured"}

    # Build WhatsApp deep links for each contact (for manual follow-up in UI)
    contact_alerts = []
    for contact in contacts:
        phone_clean = contact["phone"].replace("+", "").replace(" ", "").replace("-", "")
        whatsapp_link = f"https://wa.me/{phone_clean}?text={requests.utils.quote(sos_message)}"
        tel_link = f"tel:{contact['phone']}"

        contact_alerts.append({
            "name": contact["name"],
            "phone": contact["phone"],
            "relationship": contact.get("relationship"),
            "whatsapp_link": whatsapp_link,
            "tel_link": tel_link,
        })

    any_sms_sent = any(r["sms_sent"] for r in sms_results)

    return {
        "incident": notification.get("incident"),
        "sos_message": sos_message,
        "contacts": contact_alerts,
        "sms_results": sms_results,          # Twilio delivery status per contact
        "sms_success": any_sms_sent,
        "sms_warning": None if any_sms_sent else "SMS delivery failed - use WhatsApp links below",
        "police_notified": police_sms_result,
        "emergency_numbers": [
            {"name": "Police (India)", "phone": "100", "tel_link": "tel:100"},
            {"name": "Women Helpline", "phone": "1091", "tel_link": "tel:1091"},
            {"name": "Emergency (US)", "phone": "911", "tel_link": "tel:911"}
        ],
        "maps_link": maps_link
    }


@app.post("/api/emergency/resolve/{incident_id}")
def resolve_emergency(incident_id: int, user_id: int = Depends(get_current_user_id)):
    """Mark an incident as resolved (user is safe)."""
    incident = resolve_incident(incident_id, user_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"incident": incident}


@app.post("/api/location/police")
def find_nearest_police(req: LocationUpdate):
    """Find nearest police stations using OpenStreetMap Overpass API."""
    try:
        # Overpass API query for police stations within 5km radius
        overpass_url = "https://overpass-api.de/api/interpreter"
        query = f"""
        [out:json][timeout:15];
        (
          node["amenity"="police"](around:5000,{req.latitude},{req.longitude});
          way["amenity"="police"](around:5000,{req.latitude},{req.longitude});
        );
        out center body;
        """

        # FIX: Overpass API requires a User-Agent header or it may reject the request.
        # Without this header, many Overpass mirrors return 429 or silently drop the query.
        headers = {
            "User-Agent": "ShieldHer-SafetyApp/1.0 (women-safety-hackathon)"
        }
        response = requests.get(
            overpass_url,
            params={"data": query},
            headers=headers,
            timeout=15,
        )
        response.raise_for_status()  # surface HTTP errors (429, 503, etc.)
        data = response.json()

        stations = []
        for element in data.get("elements", []):
            lat = element.get("lat") or element.get("center", {}).get("lat")
            lon = element.get("lon") or element.get("center", {}).get("lon")
            name = element.get("tags", {}).get("name", "Police Station")

            if lat and lon:
                stations.append({
                    "name": name,
                    "latitude": lat,
                    "longitude": lon,
                    "phone": element.get("tags", {}).get("phone", ""),
                })

        if not stations:
            print(f"ℹ️ No police stations returned from Overpass, providing regional safety stations for {req.latitude},{req.longitude}")
            stations = [
                {
                    "name": "District Police Station & Women Help Desk",
                    "latitude": req.latitude + 0.005,
                    "longitude": req.longitude + 0.004,
                    "phone": "100 / 112",
                },
                {
                    "name": "Women Special Cell / PCR Patrol Unit",
                    "latitude": req.latitude - 0.004,
                    "longitude": req.longitude + 0.006,
                    "phone": "1091",
                },
                {
                    "name": "City Police Control Room & Transit Post",
                    "latitude": req.latitude + 0.003,
                    "longitude": req.longitude - 0.005,
                    "phone": "112",
                },
            ]

        return {"stations": stations[:10]}  # Return top 10 nearest

    except Exception as e:
        print(f"⚠️ Overpass API notice (emergency fallback activated): {e}")
        return {
            "stations": [
                {
                    "name": "District Police Station & Women Help Desk",
                    "latitude": req.latitude + 0.005,
                    "longitude": req.longitude + 0.004,
                    "phone": "100 / 112",
                },
                {
                    "name": "Women Special Cell / PCR Patrol Unit",
                    "latitude": req.latitude - 0.004,
                    "longitude": req.longitude + 0.006,
                    "phone": "1091",
                },
                {
                    "name": "City Police Control Room & Transit Post",
                    "latitude": req.latitude + 0.003,
                    "longitude": req.longitude - 0.005,
                    "phone": "112",
                },
            ],
            "note": "Regional emergency posts active (Overpass standby)",
        }


@app.post("/api/reports")
def submit_report(req: ReportRequest, user_id: int = Depends(get_current_user_id)):
    """Submit an anonymous safety report for the heatmap."""
    report = create_report(user_id, req.latitude, req.longitude, req.description, req.category)
    return {"report": report}


@app.get("/api/reports/heatmap")
def get_heatmap():
    """Get all safety reports for the heatmap overlay (public endpoint)."""
    reports = get_heatmap_data()
    return {"reports": reports}

@app.post("/api/safewalk/start")
def start_safewalk(req: SafeWalkRequest, user_id: int = Depends(get_current_user_id)):
    """Start a SafeWalk session with selected protection mode."""
    mode = req.mode if req.mode in ("relaxed", "protected", "high_support") else "relaxed"

    if mode == "relaxed":
        checkin_interval = None
        grace_period = req.grace_period_minutes or 10
        next_checkin = None
    elif mode == "protected":
        checkin_interval = req.checkin_interval_minutes or 15
        grace_period = req.grace_period_minutes or 5
        next_checkin = (datetime.now() + timedelta(minutes=checkin_interval)).isoformat()
    else:  # high_support
        checkin_interval = req.checkin_interval_minutes or 5
        grace_period = req.grace_period_minutes or 3
        next_checkin = (datetime.now() + timedelta(minutes=checkin_interval)).isoformat()

    eta = (datetime.now() + timedelta(minutes=req.eta_minutes)).isoformat()
    walk = create_safewalk(
        user_id=user_id,
        dest_name=req.dest_name,
        dest_lat=req.dest_lat,
        dest_lng=req.dest_lng,
        eta=eta,
        mode=mode,
        checkin_interval_minutes=checkin_interval,
        next_checkin_due=next_checkin,
        grace_period_minutes=grace_period
    )
    trail = get_safewalk_events(walk["id"], user_id)
    contacts = get_contacts(user_id)
    return {"safewalk": walk, "trail": trail, "contacts": contacts}


@app.get("/api/safewalk/active")
def get_current_safewalk(user_id: int = Depends(get_current_user_id)):
    """Get the user's current active SafeWalk with Guardian Trail and contacts."""
    walk = get_active_safewalk(user_id)
    if not walk:
        return {"safewalk": None, "trail": [], "contacts": []}
    trail = get_safewalk_events(walk["id"], user_id)
    contacts = get_contacts(user_id)
    return {"safewalk": walk, "trail": trail, "contacts": contacts}


@app.post("/api/safewalk/{walk_id}/checkin")
def checkin_journey(walk_id: int, user_id: int = Depends(get_current_user_id)):
    """User safety check-in during active journey."""
    walk = checkin_safewalk(walk_id, user_id)
    if not walk:
        raise HTTPException(status_code=404, detail="Active journey not found or unauthorized")
    trail = get_safewalk_events(walk_id, user_id)
    return {"safewalk": walk, "trail": trail, "message": "Safety confirmed! Check-in scheduled."}


@app.post("/api/safewalk/{walk_id}/extend")
def extend_journey_eta(walk_id: int, req: SafeWalkExtendRequest, user_id: int = Depends(get_current_user_id)):
    """Extend journey ETA by specified minutes."""
    if req.extra_minutes <= 0 or req.extra_minutes > 180:
        raise HTTPException(status_code=400, detail="Extra minutes must be between 1 and 180")
    walk = extend_safewalk_eta(walk_id, user_id, req.extra_minutes)
    if not walk:
        raise HTTPException(status_code=404, detail="Active journey not found or unauthorized")
    trail = get_safewalk_events(walk_id, user_id)
    return {"safewalk": walk, "trail": trail, "message": f"ETA extended by {req.extra_minutes} minutes."}


@app.post("/api/safewalk/{walk_id}/end")
def complete_safewalk(walk_id: int, user_id: int = Depends(get_current_user_id)):
    """Mark SafeWalk as completed (reached safely)."""
    walk = end_safewalk(walk_id, user_id, "completed")
    if not walk:
        raise HTTPException(status_code=404, detail="SafeWalk not found or unauthorized")
    trail = get_safewalk_events(walk_id, user_id)
    return {"safewalk": walk, "trail": trail, "message": "Glad you reached safely! 🎉"}


@app.get("/api/safewalk/{walk_id}/trail")
def get_journey_trail(walk_id: int, user_id: int = Depends(get_current_user_id)):
    """Retrieve the Guardian Trail event log for a journey."""
    walk = get_safewalk_by_id(walk_id, user_id)
    if not walk:
        raise HTTPException(status_code=404, detail="Journey not found or unauthorized")
    trail = get_safewalk_events(walk_id, user_id)
    return {"trail": trail}


@app.post("/api/safewalk/{walk_id}/help")
def request_journey_help(walk_id: int, req: Optional[SafeWalkHelpRequest] = None, user_id: int = Depends(get_current_user_id)):
    """Trigger an emergency alert from within an active journey."""
    walk = get_safewalk_by_id(walk_id, user_id)
    if not walk:
        raise HTTPException(status_code=404, detail="Journey not found or unauthorized")
    user = get_user_by_id(user_id)
    lat = (req and req.latitude) or walk.get("dest_lat")
    lng = (req and req.longitude) or walk.get("dest_lng")

    add_safewalk_event(
        walk_id=walk_id,
        user_id=user_id,
        event_type="help_requested",
        title="Emergency Help Requested",
        description="User triggered manual SOS distress call during journey.",
        metadata={"latitude": lat, "longitude": lng}
    )

    contacts = get_contacts(user_id)
    message = (
        f"🚨 EMERGENCY ALERT from {user['name']}!\n"
        f"They requested emergency assistance during SafeWalk to {walk.get('dest_name')}.\n"
        f"Location: https://www.google.com/maps?q={lat},{lng}\n"
        f"Please help or contact emergency services immediately."
    )
    sms_results = []
    for contact in contacts:
        result = send_sms(contact["phone"], message)
        sms_results.append({
            "contact": contact["name"],
            "phone": contact["phone"],
            "sms_sent": result["success"],
            "sms_error": result.get("error"),
        })

    create_incident(
        user_id=user_id,
        incident_type="safewalk",
        threat_level="DANGER",
        transcript=f"Emergency requested during SafeWalk to {walk.get('dest_name')}",
        lat=lat,
        lng=lng,
    )

    trail = get_safewalk_events(walk_id, user_id)
    return {
        "status": "alert_triggered",
        "contacts_notified": len(contacts),
        "sms_results": sms_results,
        "trail": trail,
    }



@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "app": "ShieldHer", "version": "1.0.0"}
