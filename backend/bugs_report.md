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