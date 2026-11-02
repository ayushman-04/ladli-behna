# ShieldHer — Backend Architecture

> **Stack:** Python · FastAPI · PostgreSQL (Neon) · Google Gemini 2.0 Flash · Twilio · JWT (HS256) · bcrypt

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File Structure](#2-file-structure)
3. [Module Breakdown](#3-module-breakdown)
4. [Database Schema](#4-database-schema)
5. [Authentication Layer](#5-authentication-layer)
6. [API Reference](#6-api-reference)
7. [LLM Layer — Gemini AI Service](#7-llm-layer--gemini-ai-service)
8. [Audio Analysis Feature](#8-audio-analysis-feature)
9. [SMS & Emergency Notification Layer](#9-sms--emergency-notification-layer)
10. [SafeWalk Feature](#10-safewalk-feature)
11. [Safety Heatmap Feature](#11-safety-heatmap-feature)
12. [Environment Configuration](#12-environment-configuration)
13. [Request Lifecycle — End-to-End Flow](#13-request-lifecycle--end-to-end-flow)
14. [🐛 Identified Bugs & Issues](#14--identified-bugs--issues)

---

## 1. Project Overview

**ShieldHer** is a women's safety web application. The FastAPI backend provides:

- **User auth** — JWT-based, bcrypt password hashing
- **Emergency SOS** — Twilio SMS to all registered contacts
- **AI-powered audio analysis** — Google Gemini 2.0 Flash (text + multimodal)
- **Safe Walk** — virtual escort session tracking
- **Crowd-sourced safety heatmap** — community incident reports
- **Nearest police station lookup** — OpenStreetMap Overpass API

---

## 2. File Structure

```
backend/
├── main.py             # FastAPI app — all 15 routes + Twilio SMS helper
├── gemini_service.py   # LLM layer — transcript & audio file analysis
├── database.py         # PostgreSQL CRUD helpers for all 5 tables
├── auth.py             # JWT + bcrypt utilities
├── .env                # Active secrets (Neon DB, Gemini, Twilio)
├── .envexample         # Template of all required environment variables
└── uploads/            # Temporary local storage for uploaded audio files
```

> All routes are co-located in `main.py` (hackathon flat structure — no routers/blueprints).

---

## 3. Module Breakdown

```
┌─────────────────────────────────────────────────────────┐
│                        main.py                          │
│  FastAPI app · CORS · Pydantic schemas · Route handlers │
│  Twilio SMS helper · Startup hook (init_db)             │
└──────────┬──────────────────┬───────────────────────────┘
           │                  │
   ┌───────▼──────┐   ┌───────▼───────────┐
   │   auth.py    │   │   database.py     │
   │  bcrypt      │   │  psycopg2         │
   │  JWT / jose  │   │  PostgreSQL/Neon  │
   └──────────────┘   └───────────────────┘
           │
   ┌───────▼────────────────┐
   │   gemini_service.py    │
   │   google-generativeai  │
   │   Gemini 2.0 Flash     │
   └────────────────────────┘
```

| Module | Responsibility |
|---|---|
| `main.py` | App init, CORS, Pydantic request/response models, all route handlers, `send_sms()` helper |
| `auth.py` | `hash_password`, `verify_password`, `create_token`, `get_current_user_id` (FastAPI Depends) |
| `database.py` | `init_db()` creates 5 tables; CRUD helpers for users, contacts, incidents, reports, walks |
| `gemini_service.py` | `analyze_transcript()` (text-only) and `analyze_audio_file()` (multimodal) |

---

## 4. Database Schema

**Host:** Neon (serverless PostgreSQL cloud)  
**Driver:** `psycopg2` with `RealDictCursor` (rows returned as Python dicts)  
**Note:** `conn.autocommit = True` — no explicit transactions used anywhere.

### Tables

```sql
-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone         VARCHAR(20),
    safe_word     VARCHAR(50) DEFAULT 'help me',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Emergency Contacts (many-to-one with users)
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    phone        VARCHAR(20) NOT NULL,
    relationship VARCHAR(50),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Incidents (audio threat detections + manual SOS)
CREATE TABLE IF NOT EXISTS incidents (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type         VARCHAR(20) NOT NULL,    -- 'audio' | 'manual' | 'shake'
    threat_level VARCHAR(20) NOT NULL,    -- 'SAFE' | 'SUSPICIOUS' | 'DANGER'
    transcript   TEXT,
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    resolved     BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Safety Reports (feeds the crowd-sourced heatmap)
CREATE TABLE IF NOT EXISTS safety_reports (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    latitude     DOUBLE PRECISION NOT NULL,
    longitude    DOUBLE PRECISION NOT NULL,
    description  TEXT,
    category     VARCHAR(50),  -- harassment|stalking|unsafe_area|poor_lighting|other
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Safe Walks
CREATE TABLE IF NOT EXISTS safe_walks (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    dest_name    VARCHAR(200),
    dest_lat     DOUBLE PRECISION,
    dest_lng     DOUBLE PRECISION,
    eta          TIMESTAMP,
    status       VARCHAR(20) DEFAULT 'active',  -- 'active' | 'completed'
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Entity Relationships
```
users ──< emergency_contacts   (one-to-many, CASCADE delete)
users ──< incidents            (one-to-many, CASCADE delete)
users ──< safety_reports       (one-to-many, CASCADE delete)
users ──< safe_walks           (one-to-many, CASCADE delete)
```

---

## 5. Authentication Layer

**File:** `auth.py`

| Function | Description |
|---|---|
| `hash_password(password)` | bcrypt hash with auto-generated salt |
| `verify_password(plain, hashed)` | bcrypt constant-time comparison |
| `create_token(user_id)` | Encodes `{ sub: str(user_id), exp: now+24h }` as HS256 JWT |
| `get_current_user_id(credentials)` | FastAPI `Depends()` — extracts user_id from Bearer token |

**Token Flow:**
```
POST /api/register  or  POST /api/login
  └─► server issues JWT (24h expiry, HS256)
        └─► client stores token
              └─► protected routes: Authorization: Bearer <token>
                    └─► get_current_user_id() → int user_id injected into handler
```

> **Security note:** Default `JWT_SECRET_KEY` in `.env` is a weak hardcoded string. No refresh tokens — sessions hard-expire at 24h.

---

## 6. API Reference

**Base URL:** `http://localhost:8000`  
**Protected routes** require: `Authorization: Bearer <jwt_token>`

---

### 6.1 Auth Routes

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/register` | ❌ Public | Create account → returns token + user |
| `POST` | `/api/login` | ❌ Public | Login → returns token + user |
| `GET` | `/api/me` | ✅ Protected | Get current user profile |
| `PUT` | `/api/me` | ✅ Protected | Update name / phone / safe_word |

**Request schemas:**
```json
// POST /api/register
{ "name": "string", "email": "string", "password": "string", "phone": "string?" }

// POST /api/login
{ "email": "string", "password": "string" }

// PUT /api/me
{ "name": "string?", "phone": "string?", "safe_word": "string?" }
```

---

### 6.2 Emergency Contact Routes

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/contacts` | ✅ Protected | List all contacts |
| `POST` | `/api/contacts` | ✅ Protected | Add a contact |
| `DELETE` | `/api/contacts/{contact_id}` | ✅ Protected | Remove a contact |

```json
// POST /api/contacts
{ "name": "string", "phone": "string", "relationship": "string?" }
```

---

### 6.3 Audio Analysis Routes

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/audio/analyze` | ✅ Protected | Analyze text transcript via Gemini |
| `POST` | `/api/audio/upload` | ✅ Protected | Upload audio file for multimodal analysis |
| `GET` | `/api/audio/history` | ✅ Protected | Fetch last 20 incident logs |

```json
// POST /api/audio/analyze
{ "transcript": "string", "latitude": 0.0, "longitude": 0.0 }

// POST /api/audio/upload → multipart/form-data
// fields: audio (File), latitude (float?), longitude (float?)

// Analysis response shape:
{
  "analysis": {
    "threat_level": "SAFE | SUSPICIOUS | DANGER",
    "confidence": 0.95,
    "reason": "Brief explanation",
    "recommended_action": "What user should do"
  }
}
```

---

### 6.4 Emergency SOS Routes

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/emergency/trigger` | ✅ Protected | Trigger SOS — SMS all contacts |
| `POST` | `/api/emergency/resolve/{incident_id}` | ✅ Protected | Mark incident resolved |

```json
// POST /api/emergency/trigger
{
  "latitude": 0.0,
  "longitude": 0.0,
  "type": "manual | audio | shake",
  "transcript": "string?",
  "notify_police": false
}

// Response includes:
{
  "incident": {},
  "sos_message": "string",
  "contacts": [{ "name", "phone", "relationship", "whatsapp_link", "tel_link" }],
  "sms_results": [{ "contact", "phone", "sms_sent": true, "sms_error": null }],
  "police_notified": null,
  "emergency_numbers": [
    { "name": "Police (India)", "phone": "100", "tel_link": "tel:100" },
    { "name": "Women Helpline", "phone": "1091", "tel_link": "tel:1091" },
    { "name": "Emergency (US)", "phone": "911", "tel_link": "tel:911" }
  ],
  "maps_link": "https://www.google.com/maps?q=lat,lng"
}
```

---

### 6.5 Police Station Lookup

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/location/police` | ❌ Public | Nearest police stations via OSM Overpass (5km radius, max 10) |

```json
// Request
{ "latitude": 0.0, "longitude": 0.0 }

// Response
{ "stations": [{ "name", "latitude", "longitude", "phone" }] }
```
Uses Overpass API with custom `User-Agent` header to avoid 429 rate-limit drops.

---

### 6.6 Safety Reports & Heatmap

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/reports` | ✅ Protected | Submit a safety report |
| `GET` | `/api/reports/heatmap` | ❌ Public | All reports for heatmap (last 500, no user_id exposed) |

```json
// POST /api/reports
{
  "latitude": 0.0,
  "longitude": 0.0,
  "description": "string?",
  "category": "harassment | stalking | unsafe_area | poor_lighting | other"
}
```

---

### 6.7 SafeWalk Routes

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/safewalk/start` | ✅ Protected | Start a SafeWalk session |
| `GET` | `/api/safewalk/active` | ✅ Protected | Get current active walk |
| `POST` | `/api/safewalk/{walk_id}/end` | ✅ Protected | Complete a walk |

```json
// POST /api/safewalk/start
{ "dest_name": "string", "dest_lat": 0.0, "dest_lng": 0.0, "eta_minutes": 30 }
```

---

### 6.8 Health Check

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | ❌ Public | Returns `{ status: "healthy", app: "ShieldHer", version: "1.0.0" }` |

---

## 7. LLM Layer — Gemini AI Service

**File:** `gemini_service.py`  
**Model:** `gemini-2.0-flash`  
**Library:** `google-generativeai`  
**Config:** `temperature=0.1`, `response_mime_type="application/json"`

### `analyze_transcript(transcript: str) → dict`

Text-only Gemini call. The system prompt (`SAFETY_ANALYSIS_PROMPT`) instructs the model to detect:

| Threat Signal | Examples |
|---|---|
| Threatening language | Aggression, intimidation, weapons |
| Stalking / following | Someone being tailed |
| Harassment | Verbal, physical, sexual, catcalling |
| Distress sounds | Screaming, crying |
| Coercion | Forced compliance |
| Self-reported fear | "I feel unsafe", "help me" |

**Response JSON (enforced schema):**
```json
{
  "threat_level": "SAFE | SUSPICIOUS | DANGER",
  "confidence": 0.0,
  "reason": "1-2 sentence explanation",
  "recommended_action": "What the user should do"
}
```
Falls back to `SAFE` with demo message if `GEMINI_API_KEY` is missing.

---

### `analyze_audio_file(audio_path: str) → dict`

Multimodal Gemini call using the **Files API**:

1. `genai.upload_file(audio_path)` — upload to Gemini
2. Poll `uploaded_file.state` until `ACTIVE` (max 60s, 3s intervals)
3. Raise if state reaches `FAILED`
4. `model.generate_content([prompt, uploaded_file])` — multimodal inference
5. `genai.delete_file(name)` — cleanup in `finally` block

**State machine:**
```
upload_file()
    └─► PROCESSING ──(poll every 3s, max 60s)──► ACTIVE ──► generate_content()
                                                  FAILED ──► raise ValueError
```

Returns same schema as transcript analysis plus a `"transcript"` field containing what Gemini heard in the audio.

---

## 8. Audio Analysis Feature — Full Flow

Two parallel paths exist:

### Path A — Browser Transcript (Primary)
```
Browser (Web Speech API)
  └─► real-time speech-to-text in client
        └─► POST /api/audio/analyze { transcript }
              └─► analyze_transcript(transcript)   [Gemini text call]
                    └─► threat_level in [SUSPICIOUS, DANGER]?
                          YES → create_incident() in DB
                          └─► return { analysis }
```

### Path B — Raw Audio File Upload (Alternative)
```
Client records audio blob
  └─► POST /api/audio/upload  (multipart: audio + lat/lng)
        └─► save to backend/uploads/{user_id}_{uuid8}_{filename}
              └─► analyze_audio_file(filepath)
                    └─► Gemini Files API upload + poll + generate
                          └─► genai.delete_file()   [cleanup]
                                └─► threat_level in [SUSPICIOUS, DANGER]?
                                      YES → create_incident() in DB
                                      └─► return { analysis, audio_file }
```

---

## 9. SMS & Emergency Notification Layer

**Function:** `send_sms(to_phone, message)` in `main.py` — uses raw `requests.post` (no Twilio SDK).

```
POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
  auth   : Basic (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  payload: { From, To, Body }
  timeout: 10s
```

**Full emergency trigger flow:**
```
POST /api/emergency/trigger
  ├─► create_incident() in DB
  ├─► get_contacts(user_id)  → all emergency contacts
  ├─► for each contact:
  │     ├─► send_sms(contact.phone, sos_message)   [Twilio]
  │     └─► build WhatsApp deep link + tel: link
  ├─► if notify_police=True and POLICE_SMS_NUMBER set:
  │     └─► send_sms(POLICE_SMS_NUMBER, police_msg)
  └─► return { incident, sos_message, contacts, sms_results, emergency_numbers, maps_link }
```

**SOS message format:**
```
🚨 EMERGENCY SOS from {name}!
They need immediate help!
📍 Location: https://www.google.com/maps?q={lat},{lng}
Time: {12h time, date}
Type: manual | audio | shake
Please call them or emergency services immediately!
```

---

## 10. SafeWalk Feature

Virtual walking companion — **timer-based, not real-time GPS tracked server-side.**

```
start  → safe_walks row created (status='active', eta=now+N minutes)
active → GET /api/safewalk/active returns current walk
end    → status='completed' on user arrival
```

> ETA is stored but **never enforced server-side** — see Bug #5.

---

## 11. Safety Heatmap Feature

- `POST /api/reports` (authenticated) — stores report with lat/lng + category
- `GET /api/reports/heatmap` (public) — returns last 500 reports without `user_id` (preserves anonymity)

The heatmap endpoint is intentionally public to allow map overlays without requiring login.

---

## 12. Environment Configuration

| Variable | Required | Current State |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL cloud configured |
| `JWT_SECRET_KEY` | ✅ | Set (weak default string) |
| `GEMINI_API_KEY` | ✅ | Set |
| `TWILIO_ACCOUNT_SID` | ✅ for SMS | Set |
| `TWILIO_AUTH_TOKEN` | ✅ for SMS | Set |
| `TWILIO_FROM_NUMBER` | ✅ for SMS | Set — **⚠️ has trailing space (Bug #1)** |
| `POLICE_SMS_NUMBER` | ⚠️ Optional | Empty — police SMS disabled |

---

## 13. Request Lifecycle — End-to-End Flow

### Protected Request (typical)
```
Client  →  HTTP Request + Authorization: Bearer <token>
              ↓
           FastAPI route
              ↓
           get_current_user_id() [Depends]
             jwt.decode(token, SECRET_KEY)
             → user_id: int
              ↓
           Route handler
              ↓
           database.py helper
             psycopg2.connect(DATABASE_URL)  ← new connection per request
             execute SQL → dict
             close connection
              ↓
           JSON response
```

### Emergency SOS with AI Detection
```
Browser continuous audio
  └─► Web Speech API → text
        └─► POST /api/audio/analyze { transcript }
              └─► Gemini 2.0 Flash → { threat_level, confidence, reason, action }
                    └─► DANGER detected?
                          └─► create_incident() in DB
                                └─► Frontend triggers POST /api/emergency/trigger
                                      └─► send_sms() × N contacts via Twilio
                                            └─► return WhatsApp links + emergency numbers
```

---

## 14. 🐛 Identified Bugs & Issues

---

### BUG #1 — SMS Not Sent: Trailing Space in `TWILIO_FROM_NUMBER` 🔴 CRITICAL

**File:** `.env` line 13  
**Affected:** `POST /api/emergency/trigger`

`.env` currently has:
```
TWILIO_FROM_NUMBER=+18153653175 
#                              ^ trailing space
```

`os.getenv()` returns `"+18153653175 "` with a space. Twilio validates E.164 format strictly — any whitespace causes a `400 Bad Request`, silently logging failure but returning HTTP 200 to the client.

**Fix — two parts:**

1. Remove the trailing space in `.env`:
```
TWILIO_FROM_NUMBER=+18153653175
```

2. Add defensive `.strip()` in `main.py` line 25:
```python
# Before (line 25):
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")

# After:
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "").strip()
```

---

### BUG #2 — Audio Upload Analysis Fails: Missing `mime_type` in Gemini Upload 🔴 CRITICAL

**File:** `gemini_service.py` line 139  
**Affected:** `POST /api/audio/upload`

```python
# Current (broken):
uploaded_file = genai.upload_file(audio_path)
```

Without `mime_type`, Gemini treats the file as a generic binary blob — it cannot transcribe or analyse audio. Browser `MediaRecorder` typically outputs `.webm` or `.ogg`, which often have no extension in the uploaded filename (e.g., `blob`). The result is Gemini silently returning `SAFE` with `confidence: 0.0`.

**Fix:**
```python
import mimetypes

# After saving the file, before upload:
mime_type, _ = mimetypes.guess_type(audio_path)
if not mime_type or not mime_type.startswith("audio/"):
    mime_type = "audio/webm"  # default for browser MediaRecorder

uploaded_file = genai.upload_file(audio_path, mime_type=mime_type)
```

---

### BUG #3 — Silent SMS Failure Returns HTTP 200 🟡 MEDIUM

**File:** `main.py` line 383  
**Affected:** `POST /api/emergency/trigger`

When all SMS sends fail, the endpoint still returns `HTTP 200 OK`. The frontend has no programmatic way to know SMS failed — a user in danger may think contacts have been notified when they have not.

**Fix:** Add a top-level `sms_success` field:
```python
any_sms_sent = any(r["sms_sent"] for r in sms_results)
return {
    ...existing fields...,
    "sms_success": any_sms_sent,
    "sms_warning": None if any_sms_sent else "SMS delivery failed — use WhatsApp links below",
}
```

---

### BUG #4 — No Database Connection Pooling 🟡 MEDIUM

**File:** `database.py` line 16

Every DB helper creates a **brand new `psycopg2` connection** (TCP + TLS + auth handshake) and closes it after use. Under any real load this will exhaust Neon's connection limits and degrade response times significantly.

**Fix:** Use `psycopg2`'s `SimpleConnectionPool`:
```python
from psycopg2 import pool as pg_pool

_pool = None

def _get_pool():
    global _pool
    if _pool is None:
        _pool = pg_pool.SimpleConnectionPool(1, 10, DATABASE_URL)
    return _pool

def get_connection():
    return _get_pool().getconn()

# Release connections back to pool after each use instead of conn.close()
```

---

### BUG #5 — SafeWalk ETA Never Enforced Server-Side 🟠 FEATURE GAP

**File:** `main.py`, `start_safewalk()`

The `eta` timestamp is stored in the DB but **nothing checks it**. If a user goes offline or is in danger after starting a SafeWalk, the server never auto-triggers an SOS. The feature provides false safety assurance.

**Fix:** Add a background job (APScheduler):
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

@scheduler.scheduled_job("interval", minutes=1)
async def check_overdue_safewalks():
    # SELECT * FROM safe_walks WHERE status='active' AND eta < NOW()
    # For each: create_incident() + send_sms() to contacts
    pass
```

---

### BUG #6 — Uploaded Audio Files Never Deleted Locally 🟡 MEDIUM

**File:** `main.py`, `upload_and_analyze_audio()`

The Gemini-side file is cleaned up (`genai.delete_file`) but the **local file in `backend/uploads/`** is never removed. Every upload permanently grows disk usage.

**Fix:** Delete local file after analysis:
```python
# After result = analyze_audio_file(filepath):
try:
    os.remove(filepath)
except OSError:
    pass  # non-critical
```

---

### BUG #7 — `update_user` Cannot Clear Fields (Falsiness Check) 🟡 LOW

**File:** `database.py` lines 137–145

```python
if name:      # ← falsy check, not None check
if phone:
if safe_word:
```

Passing `""` (empty string) to clear a field is silently ignored. User cannot delete their phone number.

**Fix:** Check for `None` explicitly:
```python
if name is not None:
    updates.append("name = %s"); values.append(name)
if phone is not None:
    updates.append("phone = %s"); values.append(phone)
if safe_word is not None:
    updates.append("safe_word = %s"); values.append(safe_word)
```

---

## Bug Summary Table

| # | Bug | Severity | File | Line |
|---|---|---|---|---|
| 1 | Trailing space in `TWILIO_FROM_NUMBER` breaks all SMS | 🔴 Critical | `.env` + `main.py` | L13 / L25 |
| 2 | Missing `mime_type` in Gemini audio upload — analysis silent-fails | 🔴 Critical | `gemini_service.py` | L139 |
| 3 | SMS failure returns HTTP 200 — user unaware | 🟡 Medium | `main.py` | L383 |
| 4 | No DB connection pooling — new conn per request | 🟡 Medium | `database.py` | L16 |
| 5 | SafeWalk ETA never server-enforced — no auto-SOS | 🟠 Feature Gap | `main.py` | L473 |
| 6 | Local audio files never deleted from `uploads/` | 🟡 Medium | `main.py` | L272 |
| 7 | `update_user` falsiness check prevents clearing fields | 🟡 Low | `database.py` | L137 |
