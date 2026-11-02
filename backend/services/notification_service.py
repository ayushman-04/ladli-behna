"""
Emergency notification workflow for realtime sessions.
"""

import os
from datetime import datetime

import requests
from dotenv import load_dotenv

from database import create_incident, get_contacts, get_user_by_id

load_dotenv()

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "").strip()


def send_sms(to_phone: str, message: str) -> dict:
    to_phone = (to_phone or "").strip()
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, to_phone]):
        return {"success": False, "error": "Twilio not configured"}

    try:
        response = requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
            data={
                "From": TWILIO_FROM_NUMBER,
                "To": to_phone,
                "Body": message,
            },
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            timeout=10,
        )
        if response.status_code in (200, 201):
            return {"success": True, "error": None}
        try:
            error = response.json().get("message", response.text[:200])
        except ValueError:
            error = response.text[:200]
        return {"success": False, "error": error}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def send_emergency_alert(
    user_id: int,
    summary: str,
    severity: str,
    latitude: float | None,
    longitude: float | None,
    transcript: str,
    incident_type: str = "audio",
    alert_reason: str = "AI detected possible distress.",
) -> dict:
    user = get_user_by_id(user_id)
    if not user:
        return {"success": False, "error": "User not found"}

    maps_link = None
    if latitude is not None and longitude is not None:
        maps_link = f"https://www.google.com/maps?q={latitude},{longitude}"

    incident = create_incident(
        user_id=user_id,
        incident_type=incident_type,
        threat_level=severity,
        transcript=transcript,
        lat=latitude,
        lng=longitude,
    )

    location_line = f"Location: {maps_link}" if maps_link else "Location: unavailable"
    message = (
        f"EMERGENCY ALERT from {user['name']}!\n"
        f"{alert_reason}\n"
        f"Severity: {severity}\n"
        f"Summary: {summary}\n"
        f"{location_line}\n"
        f"Time: {datetime.now().strftime('%I:%M %p, %b %d %Y')}\n"
        f"Please contact them immediately."
    )

    sms_results = []
    for contact in get_contacts(user_id):
        result = send_sms(contact["phone"], message)
        sms_results.append({
            "contact": contact["name"],
            "phone": contact["phone"],
            "sms_sent": result["success"],
            "sms_error": result.get("error"),
        })

    return {
        "success": any(result["sms_sent"] for result in sms_results),
        "incident": incident,
        "message": message,
        "sms_results": sms_results,
        "maps_link": maps_link,
    }
