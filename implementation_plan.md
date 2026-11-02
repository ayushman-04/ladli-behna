# 🛡️ ShieldHer — Women Safety App (Hackathon Edition)

A student-friendly, hackathon-ready safety app that looks premium but is simple to build and understand.

## Tech Stack (Simplified)

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Vite + React | Fast dev, hot reload, component-based |
| **Backend** | FastAPI (Python) | Auto docs, async, easy to learn |
| **Database** | SQLite | Zero config, just a file |
| **AI/LLM** | Google Gemini API (free tier) | Free, generous limits |
| **Maps** | Leaflet.js + OpenStreetMap | Free, no API key needed |
| **Auth** | JWT (python-jose) | Simple token-based auth |
| **Audio Storage** | Local filesystem (`/uploads/`) | Simple for demo, mention "cloud-ready" to judges |

> [!TIP]
> **Hackathon strategy**: Keep the backend dead simple, put all the effort into making the UI look incredible and the demo flow smooth. Judges remember the wow factor!

---

## Features (Prioritized for Hackathon)

### 🏆 Must-Have (Build These First)
1. **🎙️ Shield Mode** — Audio → Gemini AI → threat detection → disguised alarm
2. **📳 Shake Detection** — Phone shake → "Are you okay?" → emergency
3. **🚨 Emergency Protocol** — Alert contacts, share location, find nearest police station
4. **👤 Auth + Onboarding** — Sign up, set emergency contacts, permissions

### ⭐ Nice-to-Have (If Time Permits)
5. **🗺️ Safety Heatmap** — Community-reported unsafe zones
6. **👩‍👩‍👧 SafeWalk** — Virtual walking companion with ETA
7. **📚 Empowerment Hub** — Resources, helplines, self-defense tips
8. **🆘 Stealth SOS** — Triple-tap silent emergency

---

## Project Structure (Flat & Simple)

```
women-safety/
├── backend/
│   ├── main.py              # FastAPI app — ALL routes in one file
│   ├── database.py          # SQLite setup + helper functions
│   ├── auth.py              # JWT create/verify (small helper)
│   ├── gemini_service.py    # Gemini API calls
│   ├── requirements.txt     # Python deps
│   ├── .env                 # API keys (gitignored)
│   └── uploads/             # Audio files stored here
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── public/
│   │   ├── alarm.mp3        # Disguised alarm sound
│   │   └── manifest.json    # PWA manifest
│   └── src/
│       ├── main.jsx          # React entry point
│       ├── App.jsx           # Main app + router
│       ├── App.css           # ALL styles in one file (design system)
│       ├── pages/
│       │   ├── Landing.jsx       # Hero page + login/register
│       │   ├── Dashboard.jsx     # Main hub with Shield button
│       │   ├── ShieldMode.jsx    # Active audio monitoring view
│       │   ├── MapView.jsx       # Location + police stations
│       │   ├── Contacts.jsx      # Manage emergency contacts
│       │   ├── SafeWalk.jsx      # Virtual companion
│       │   └── Hub.jsx           # Empowerment resources
│       └── components/
│           ├── Navbar.jsx        # Bottom navigation bar
│           ├── EmergencyPopup.jsx # "Are you okay?" countdown modal
│           ├── SOSButton.jsx     # Big pulsing SOS/Shield button
│           └── ProtectedRoute.jsx # Auth guard wrapper
│
└── README.md
```

> [!NOTE]
> **~15 files total** for the whole backend + frontend. No over-engineering!

---

## Backend Design (Keep It Simple)

### [NEW] [main.py](file:///c:/Users/hanis/Downloads/PY_PROJS/women%20safety/women-safety/backend/main.py)
**Everything in one file** — all API routes grouped with comments:
```
# --- Auth Routes ---
POST /api/register          → Create account
POST /api/login             → Get JWT token
GET  /api/me                → Get current user profile

# --- Emergency Contacts ---
GET  /api/contacts           → List contacts
POST /api/contacts           → Add contact
DELETE /api/contacts/{id}    → Remove contact

# --- Shield Mode ---
POST /api/audio/analyze      → Upload audio chunk → Gemini analysis → threat level
GET  /api/audio/history      → Past analyses (incident log)

# --- Emergency ---
POST /api/emergency/trigger  → Log incident, return contact info for alerts
POST /api/location/update    → Store latest GPS coords
GET  /api/location/police    → Find nearest police stations (Overpass API)

# --- Community (if time) ---
POST /api/reports            → Report unsafe area
GET  /api/reports/heatmap    → Get all reports for heatmap
```

### [NEW] [database.py](file:///c:/Users/hanis/Downloads/PY_PROJS/women%20safety/women-safety/backend/database.py)
Simple SQLite with raw SQL — 4 tables:
- **users**: id, name, email, password_hash, phone, created_at
- **emergency_contacts**: id, user_id, name, phone, relationship
- **incidents**: id, user_id, type, threat_level, transcript, lat, lng, timestamp
- **safety_reports**: id, lat, lng, description, category, timestamp

### [NEW] [auth.py](file:///c:/Users/hanis/Downloads/PY_PROJS/women%20safety/women-safety/backend/auth.py)
~30 lines: `create_token(user_id)` and `get_current_user(token)` using `python-jose`.

### [NEW] [gemini_service.py](file:///c:/Users/hanis/Downloads/PY_PROJS/women%20safety/women-safety/backend/gemini_service.py)
~40 lines: Takes audio transcript text → sends to Gemini with a safety-analysis prompt → returns `{threat_level: "SAFE"|"SUSPICIOUS"|"DANGER", reason: "..."}`.

### [NEW] [requirements.txt](file:///c:/Users/hanis/Downloads/PY_PROJS/women%20safety/women-safety/backend/requirements.txt)
```
fastapi
uvicorn
python-jose[cryptography]
passlib[bcrypt]
python-multipart
python-dotenv
google-generativeai
requests
```

---

## Frontend Design (The WOW Factor)

### UI Screens

| Screen | Description |
|---|---|
| **Landing** | Beautiful hero with gradient bg, app pitch, login/register forms |
| **Dashboard** | Large pulsing Shield button center, quick action cards, status |
| **Shield Mode** | Full-screen dark view, live audio waveform, threat level indicator |
| **Map** | Full-screen map with location, police stations, safety heatmap |
| **Contacts** | Clean card list, add/remove with animations |
| **Emergency Popup** | Overlay modal with countdown, large "I'm OK" button |

### Design System

**Color Palette:**
- Background: `#0A0A1A` (rich dark) with subtle gradient
- Primary: `#7C3AED` (purple) → `#EC4899` (pink) gradient
- Safe: `#10B981` (emerald green)
- Danger: `#EF4444` (red) with pulsing glow
- Cards: `rgba(255,255,255,0.06)` with `backdrop-filter: blur(20px)`
- Text: `#F5F0FF` (warm white)

**Typography:** Inter (body) + Outfit (headings) from Google Fonts

**Key Animations:**
- Shield button: Infinite pulse + ripple on tap
- Page transitions: Smooth fade/slide
- Threat level: Color transitions (green → yellow → red)
- Emergency popup: Dramatic zoom-in with backdrop blur
- Waveform: Canvas-based real-time audio visualization

---

## How Key Features Work (Simple Explanation)

### 🎙️ Shield Mode Flow
```
User taps Shield → Browser asks mic permission → Recording starts
    ↓
Every 5 seconds: audio chunk saved as blob
    ↓
Blob sent to /api/audio/analyze
    ↓
Backend: Gemini transcribes + analyzes for threats
    ↓
Response: { threat_level: "SAFE" | "SUSPICIOUS" | "DANGER" }
    ↓
If DANGER → Play alarm.mp3 (sounds like phone alarm)
         → Show "Are you okay?" popup with 15-sec countdown
         → No response = NOT okay → Emergency Protocol
```

### 📳 Shake Detection Flow
```
JavaScript listens to DeviceMotionEvent
    ↓
Calculate: magnitude = sqrt(x² + y² + z²)
    ↓
If magnitude > threshold (configurable, ~25-30)
    ↓
Show "Are you okay?" popup with 15-sec countdown
    ↓
No response = NOT okay → Emergency Protocol
```

### 🚨 Emergency Protocol
```
1. Get user's live GPS location
2. POST /api/emergency/trigger with location
3. Frontend: Show emergency contacts with tel: links for one-tap calling
4. Frontend: Open WhatsApp deep links with pre-filled SOS message + location
5. Show nearest police station on map with directions
6. Keep updating location every 10 seconds
```

---

## Open Questions

> [!IMPORTANT]
> **Gemini API Key**: Do you have one? If not, get it free at [aistudio.google.com](https://aistudio.google.com). Takes 2 minutes!

> [!IMPORTANT]
> **Audio transcription**: Gemini can analyze audio directly (multimodal). Should we:
> - Send **raw audio** to Gemini (simpler, but uses more API quota)
> - Use **Web Speech API** (browser-built-in, free) to transcribe first, then send text to Gemini (saves API calls)
> 
> I recommend the second option — it's free and keeps Gemini calls light.

---

## Verification Plan

### Manual Testing (Hackathon Style)
1. Register → Login → See dashboard ✓
2. Add emergency contacts ✓
3. Press Shield → Allow mic → See waveform → Speak threatening words → See DANGER response ✓
4. Shake phone/simulate → See popup → Let countdown expire → See emergency triggered ✓
5. Check map → See location → See nearest police stations ✓
6. Test on mobile browser → Check PWA install prompt ✓

### Quick Smoke Test
```bash
# Backend
cd backend && uvicorn main:app --reload
# Visit http://localhost:8000/docs → Swagger UI auto-generated!

# Frontend
cd frontend && npm run dev
# Visit http://localhost:5173
```

---

## Build Order (Hackathon Sprint)

| Phase | What | Time Estimate |
|---|---|---|
| **1** | Backend skeleton (FastAPI + SQLite + Auth) | ~30 min |
| **2** | Frontend setup (Vite + React + Design system + Router) | ~30 min |
| **3** | Landing page + Auth UI (register/login) | ~30 min |
| **4** | Dashboard + Emergency Contacts page | ~30 min |
| **5** | Shield Mode (audio capture + Gemini + threat UI) | ~45 min |
| **6** | Emergency Popup + Protocol | ~30 min |
| **7** | Shake Detection | ~20 min |
| **8** | Map + Police station finder | ~30 min |
| **9** | SafeWalk + Hub (if time) | ~30 min |
| **10** | Polish, animations, PWA manifest | ~20 min |
| | **Total** | **~5 hours** |
