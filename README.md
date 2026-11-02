<p align="center">
  <img src="https://img.shields.io/badge/ShieldHer-🛡️-7C3AED?style=for-the-badge&labelColor=0A0A1A" alt="ShieldHer" />
</p>

<h1 align="center">🛡️ ShieldHer</h1>
<h3 align="center">AI-Powered Women Safety & Empowerment App</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Track-Women%20Empowerment%20%26%20Social%20Inclusion-EC4899?style=flat-square" />
  <img src="https://img.shields.io/badge/Status-Hackathon%20Ready-10B981?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-7C3AED?style=flat-square" />
</p>

<p align="center">
  <em>A comprehensive safety companion that uses AI to detect threats in real-time, automatically alerts emergency contacts, and empowers women with resources for safety, legal rights, and financial inclusion.</em>
</p>

---

## 📋 Table of Contents

- [Problem Statement](#-problem-statement)
- [Our Solution](#-our-solution)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Documentation](#-api-documentation)
- [How It Works](#-how-it-works)
- [Screenshots](#-screenshots)
- [Future Scope](#-future-scope)
- [Contributing](#-contributing)
- [Team](#-team)

---

## 🎯 Problem Statement

**Track 6: Open Innovation** — *Financial inclusion, safety, education, skill development*

Women's safety remains one of the most pressing social challenges. According to the National Crime Records Bureau (NCRB), India reported over **4 lakh cases** of crimes against women in a single year. Many of these incidents could have been mitigated or prevented with timely intervention.

**Key challenges we address:**
- Women often can't make a phone call or send a message when they're in danger
- Traditional SOS apps require deliberate interaction, which may not be possible during an actual threat
- There's no AI-driven, *passive* safety system that monitors the environment autonomously
- Existing apps lack integration with real community safety data and empowerment resources

---

## 💡 Our Solution

**ShieldHer** is a Progressive Web App (PWA) that acts as an always-on, AI-powered safety companion. It doesn't just wait for the user to press a button — it **listens, detects, and responds** to threats automatically.

### What makes ShieldHer different?

| Traditional Safety Apps | ShieldHer |
|---|---|
| User must manually press SOS | AI detects threats from audio *automatically* |
| Loud alarm alerts the attacker | **Disguised alarm** sounds like a normal phone ringtone |
| Requires user to confirm danger | **Defaults to NOT okay** — auto-triggers if user doesn't respond |
| Only sends location | Sends location + audio transcript + WhatsApp messages + auto-dials |
| No passive monitoring | Shake detection + audio monitoring run in the background |
| Safety only | **Safety + Empowerment** — legal rights, financial schemes, skill development |

---

## ✨ Features

### 🎙️ AI Shield Mode (Audio Threat Detection)
The core innovation. When activated:
1. The browser captures audio via the **MediaRecorder API**
2. **Web Speech API** transcribes the audio in real-time (free, runs locally)
3. Every **5 seconds**, the transcript is sent to **Google Gemini AI** for threat analysis
4. Gemini classifies the environment as: `SAFE` | `SUSPICIOUS` | `DANGER`
5. On `DANGER`:
   - A **disguised alarm** plays (sounds like a normal phone alarm — the attacker won't suspect it)
   - An "Are you okay?" popup appears with a **15-second countdown**
   - If the user doesn't respond → **automatic Emergency Protocol**
6. Real-time **audio waveform visualization** on screen using Canvas API

### 📳 Motion Guardian (Shake/Impact Detection)
- Uses the `DeviceMotionEvent` API to detect sudden physical impacts
- Calculates acceleration magnitude: `√(x² + y² + z²)`
- If magnitude exceeds threshold (~25-30g) → triggers the same "Are you okay?" safety check
- Works even when the screen is off on supported devices
- Designed to detect: being pushed, phone being knocked from hand, falls

### 🚨 Emergency Protocol
When triggered (manually, by AI, or by shake detection):
1. **Captures live GPS location** (updated every 10 seconds)
2. **Logs the incident** with full transcript, location, and timestamp
3. **Generates WhatsApp deep links** with pre-filled SOS message for each emergency contact
4. **Provides one-tap call buttons** for each contact
5. **Shows emergency service numbers**: Police (100), Women Helpline (1091), Ambulance (102)
6. **Finds nearest police station** via Overpass API and shows directions
7. **Vibrates the phone** as a haptic alert

### 🗺️ Safety Map
- Full-screen **Leaflet.js** map with **dark CartoDB tiles** (matching the app's aesthetic)
- Shows **user's live location** with real-time GPS tracking
- Finds **nearest police stations** within 5km radius using **OpenStreetMap Overpass API**
- One-tap **Google Maps directions** to each police station
- Police station phone numbers (when available) for instant calling

### 🚶‍♀️ SafeWalk — Virtual Walking Companion
- Set your **destination** and **expected arrival time**
- A countdown timer tracks your journey
- **If you don't check in by the ETA** → your emergency contacts are automatically alerted
- "I Reached Safely" button to end the session
- Designed for: walking home late at night, taking an unfamiliar route, traveling alone

### 📚 Empowerment Hub
Curated resources across all hackathon sub-themes:
- **🚔 Emergency Helplines**: Police (100), Women Helpline (1091), Child Helpline (1098), National Emergency (112)
- **🥋 Self-Defense**: Video tutorials for basic self-defense, escape techniques, situational awareness
- **⚖️ Legal Rights**: Protection of Women from Domestic Violence Act, POSH Act, how to file an FIR, cyber crime reporting
- **💰 Financial Empowerment**: Pradhan Mantri Jan Dhan Yojana, Mudra Loans, Stand Up India, Skill India

### 👥 Emergency Contacts Management
- Add unlimited trusted contacts with name, phone, and relationship
- Contacts are alerted with **live location + SOS message** during emergencies
- WhatsApp integration for instant messaging
- Default emergency numbers are always included

### 🔐 Secure Authentication
- JWT-based token authentication
- Passwords hashed with **bcrypt**
- 24-hour token expiry
- Protected API routes

---

## 🛠️ Tech Stack

| Layer | Technology | Why We Chose It |
|---|---|---|
| **Frontend** | Vite + React | Lightning-fast HMR, component-based architecture |
| **Styling** | Vanilla CSS | Full control, premium glassmorphism design system |
| **Backend** | FastAPI (Python) | Async support, auto-generated Swagger docs, easy to learn |
| **Database** | PostgreSQL | Robust, relational, production-grade |
| **AI/LLM** | Google Gemini 2.0 Flash | Free tier, fast inference, multimodal (text + audio) |
| **Maps** | Leaflet.js + OpenStreetMap | Free, no API key required, dark theme tiles |
| **Auth** | JWT (python-jose + bcrypt) | Stateless, secure, industry standard |
| **Speech-to-Text** | Web Speech API (browser) | Free, runs locally, no API calls needed |
| **Police Data** | Overpass API (OpenStreetMap) | Free, global coverage, no registration |
| **Audio Visualization** | Canvas API + Web Audio API | Real-time waveform rendering |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React PWA)                   │
│                                                           │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Dashboard│  │Shield Mode│  │ Map View │  │ SafeWalk  │ │
│  └────┬─────┘  └────┬──────┘  └────┬──────┘  └────┬──────┘ │
│       │              │              │              │       │
│  ┌────┴──────────────┴──────────────┴──────────────┴────┐ │
│  │              API Client (apiFetch)                    │ │
│  └──────────────────────┬────────────────────────────────┘ │
│                         │                                   │
│  Browser APIs Used:     │                                   │
│  • MediaRecorder        │                                   │
│  • Web Speech API       │                                   │
│  • DeviceMotion         │                                   │
│  • Geolocation          │                                   │
│  • Web Audio API        │                                   │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP (REST API)
┌─────────────────────────┼───────────────────────────────────┐
│                    Backend (FastAPI)                         │
│                         │                                   │
│  ┌──────────────────────┴────────────────────────────────┐ │
│  │                    API Routes                          │ │
│  │  /api/register  /api/login  /api/contacts              │ │
│  │  /api/audio/analyze  /api/emergency/trigger            │ │
│  │  /api/location/police  /api/safewalk/start             │ │
│  └───────┬──────────────┬─────────────────┬──────────────┘ │
│          │              │                 │                 │
│  ┌───────┴───┐  ┌───────┴──────┐  ┌──────┴────────┐       │
│  │ PostgreSQL │  │ Gemini AI    │  │ Overpass API  │       │
│  │ (Database) │  │ (Threat      │  │ (Police       │       │
│  │            │  │  Analysis)   │  │  Stations)    │       │
│  └────────────┘  └──────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
women-safety/
│
├── backend/                          # FastAPI Backend
│   ├── main.py                       # All API routes (auth, contacts, audio, emergency, etc.)
│   ├── database.py                   # PostgreSQL tables + CRUD operations
│   ├── auth.py                       # JWT token creation/verification + bcrypt
│   ├── gemini_service.py             # Gemini AI threat analysis (text + audio)
│   ├── requirements.txt              # Python dependencies
│   ├── .env                          # Environment variables (DB, JWT, Gemini key)
│   └── uploads/                      # Audio file storage
│
├── frontend/                         # Vite + React Frontend
│   ├── index.html                    # SPA entry point with PWA meta tags
│   ├── vite.config.js                # Vite configuration
│   ├── package.json                  # Node dependencies
│   └── src/
│       ├── main.jsx                  # React entry point
│       ├── App.jsx                   # Router, auth/toast/emergency contexts
│       ├── App.css                   # Complete design system (~900 lines)
│       ├── pages/
│       │   ├── Landing.jsx           # Hero + login/register
│       │   ├── Dashboard.jsx         # Shield button, quick actions, incident log
│       │   ├── ShieldMode.jsx        # Audio monitoring, waveform, AI analysis
│       │   ├── MapView.jsx           # Leaflet map, police stations
│       │   ├── Contacts.jsx          # Emergency contacts CRUD
│       │   ├── SafeWalk.jsx          # Virtual walking companion
│       │   └── Hub.jsx               # Empowerment resources
│       └── components/
│           ├── Navbar.jsx            # Bottom navigation bar
│           └── EmergencyPopup.jsx    # "Are you okay?" countdown modal
│
└── README.md                         # This file
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+** ([python.org](https://www.python.org/downloads/))
- **Node.js 18+** ([nodejs.org](https://nodejs.org/))
- **PostgreSQL** ([postgresql.org](https://www.postgresql.org/download/))
- **Google Gemini API Key** (free at [aistudio.google.com](https://aistudio.google.com/))

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/women-safety.git
cd women-safety
```

### 2. Setup PostgreSQL Database

Make sure PostgreSQL is running, then create the database:

```sql
CREATE DATABASE shieldher;
```

### 3. Configure Backend Environment

Edit `backend/.env` with your credentials:

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/shieldher
JWT_SECRET_KEY=your-random-secret-key-here
GEMINI_API_KEY=your-gemini-api-key-here
```

> 💡 **Get a free Gemini API key**: Visit [aistudio.google.com](https://aistudio.google.com) → Get API Key → Create in new project

### 4. Install & Run Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The backend will start at `http://localhost:8000`
- **Swagger UI**: `http://localhost:8000/docs` (interactive API documentation)
- **Health Check**: `http://localhost:8000/api/health`

### 5. Install & Run Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will start at `http://localhost:5173`

### 6. Open in Browser

Navigate to `http://localhost:5173` — register an account, add emergency contacts, and start using ShieldHer! 🛡️

> 💡 **For mobile testing**: Open the URL on your phone's browser (both devices must be on the same WiFi). Use `http://<your-laptop-ip>:5173`.

---

## 📡 API Documentation

FastAPI automatically generates interactive API docs. After starting the backend, visit:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Key Endpoints

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/register` | Create new user account | ❌ |
| `POST` | `/api/login` | Login and get JWT token | ❌ |
| `GET` | `/api/me` | Get current user profile | ✅ |
| `PUT` | `/api/me` | Update user profile | ✅ |
| `GET` | `/api/contacts` | List emergency contacts | ✅ |
| `POST` | `/api/contacts` | Add emergency contact | ✅ |
| `DELETE` | `/api/contacts/{id}` | Delete emergency contact | ✅ |
| `POST` | `/api/audio/analyze` | Analyze audio transcript for threats | ✅ |
| `POST` | `/api/audio/upload` | Upload & analyze audio file directly | ✅ |
| `GET` | `/api/audio/history` | Get incident history | ✅ |
| `POST` | `/api/emergency/trigger` | Trigger emergency protocol | ✅ |
| `POST` | `/api/location/police` | Find nearest police stations | ❌ |
| `POST` | `/api/reports` | Submit safety report | ✅ |
| `GET` | `/api/reports/heatmap` | Get safety heatmap data | ❌ |
| `POST` | `/api/safewalk/start` | Start a SafeWalk session | ✅ |
| `GET` | `/api/safewalk/active` | Get current SafeWalk | ✅ |
| `POST` | `/api/safewalk/{id}/end` | Mark SafeWalk as completed | ✅ |

---

## ⚙️ How It Works

### AI Shield Mode — Technical Flow

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Microphone   │────▶│  Web Speech API  │────▶│  Transcript  │
│  (Browser)    │     │  (Transcription) │     │  Buffer      │
└──────────────┘     └─────────────────┘     └──────┬───────┘
                                                      │ Every 5 seconds
                                                      ▼
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Emergency   │◀────│  Threat Level   │◀────│  Gemini AI   │
│  Protocol    │     │  SAFE/SUSPICIOUS│     │  Analysis    │
│  (if DANGER) │     │  /DANGER        │     │              │
└──────────────┘     └─────────────────┘     └──────────────┘
```

### Gemini AI Threat Analysis Prompt

The AI is prompted to look for:
- Threatening language, aggression, intimidation
- Stalking or following behavior
- Verbal, physical, or sexual harassment
- Sounds of distress, screaming, or crying
- Coercion or forced compliance
- Mentions of weapons or violence
- Catcalling or verbal abuse

It returns a structured JSON response:
```json
{
  "threat_level": "DANGER",
  "confidence": 0.92,
  "reason": "Aggressive threatening language detected with mentions of physical harm",
  "recommended_action": "Activate emergency protocol immediately"
}
```

### Emergency Protocol — Sequence

```
User Doesn't Respond (15s countdown)
        │
        ▼
  ┌─────────────────┐
  │ Get GPS Location │
  └────────┬─────────┘
           ▼
  ┌─────────────────────────────┐
  │ POST /api/emergency/trigger │
  └────────┬────────────────────┘
           ▼
  ┌─────────────────────────────┐
  │ • Log incident to database  │
  │ • Generate WhatsApp links   │
  │ • Build SOS message         │
  │ • Return contact details    │
  └────────┬────────────────────┘
           ▼
  ┌─────────────────────────────┐
  │ Frontend shows:             │
  │ • One-tap call buttons      │
  │ • WhatsApp message buttons  │
  │ • Nearest police station    │
  │ • Emergency numbers (100)   │
  └─────────────────────────────┘
```

---

## 🎨 Design Philosophy

ShieldHer uses a **premium dark glassmorphism** design language:

- **Color Palette**: Deep purple (`#7C3AED`) → Rose (`#EC4899`) gradient on rich dark (`#0A0A1A`)
- **Typography**: Inter (body) + Outfit (headings) from Google Fonts
- **Effects**: Frosted glass cards (`backdrop-filter: blur`), pulsing animations, smooth transitions
- **Accessibility**: High contrast text, large touch targets, clear visual hierarchy
- **Mobile-first**: Designed for phones first — bottom navigation, thumb-friendly layout

---

## 🔮 Future Scope

- [ ] **Real SMS Integration** — Twilio or similar for actual SMS delivery
- [ ] **Push Notifications** — Service Worker-based background alerts
- [ ] **Community Safety Heatmap** — Crowdsourced danger zone visualization
- [ ] **Voice Command Activation** — Wake word detection ("Hey Sakhi")
- [ ] **Stealth SOS** — Triple-tap silent emergency trigger
- [ ] **Offline Support** — PWA caching for critical features
- [ ] **Multi-language Support** — Hindi, Tamil, Bengali, and more
- [ ] **Wearable Integration** — Smartwatch companion app
- [ ] **AI Learning** — Personalized threat detection based on user's environment
- [ ] **Cloud Audio Storage** — Firebase/Supabase for evidence preservation

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 👩‍💻 Team

Built with 💜 for **Women Empowerment & Social Inclusion**

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>🛡️ ShieldHer — Because every woman deserves to feel safe.</strong>
</p>
