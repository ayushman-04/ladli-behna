Updated Architecture (V2)
                    Browser
                       │
     ┌─────────────────┴──────────────────┐
     │                                     │
 Location Stream                    Audio Stream
 (2-5 sec interval)               WebSocket (PCM)
     │                                     │
     └──────────────┬──────────────────────┘
                    │
             FastAPI WebSocket
                    │
          Session Manager
                    │
      Continuous Audio Buffer
                    │
          Voice Activity Detection
                    │
      Speech-to-Text (streaming)
                    │
             Transcript Events
                    │
             Threat Engine
     ┌──────────────┼───────────────┐
     │              │               │
 Keyword Rule   Audio Rules     LLM Analysis
     │              │               │
     └──────────────┴───────────────┘
                    │
           Threat Score Engine
                    │
      score > emergency threshold?
                    │
             YES ───────────────┐
                                │
                      Start Alarm Timer
                                │
                         15 second timer
                                │
      ┌─────────────────────────┴────────────────────────┐
      │                                                  │
User says "I'm safe"                             Timer expires
or presses cancel                                      │
      │                                                 │
Cancel Incident                              Execute SOS Workflow
                                                        │
                                         Notification Service
                                                        │
                                     Contact Repository
                                                        │
                     SMS + AI Summary + GPS Location + Timestamp

Notice something important:

The LLM never sends SMS.

The LLM never knows phone numbers.

The LLM never accesses the database.

Instead it only produces structured reasoning.

WebSocket Pipeline

Instead of

POST /audio/analyze

use

WebSocket

Client
↓

continuous audio chunks

↓

Backend
↓

real-time processing

Every session becomes

Session {
    websocket
    user_id
    current_location
    audio_buffer
    transcript
    threat_score
    alarm_state
}

No repeated HTTP requests.

AI Workflow

The LLM should become one detector among several detectors.

Instead of

LLM decides everything

use

Speech Detector

↓

Keyword Detector

↓

Audio Emotion Detector

↓

LLM Context Analyzer

↓

Threat Fusion Engine
1. Keyword Detection (Immediate)

If transcript contains

help

save me

danger

please help

leave me

call police

don't touch me

Immediately raise

Threat Score +70

No need to wait for long reasoning.

Latency

~20 ms

2. Audio Pattern Detection

Detect

scream
crying
panic
heavy breathing
multiple people shouting
impact sounds

Raise

Threat Score +40
3. LLM Analysis

Send only transcript.

Prompt

You are a safety classifier.

Return JSON only.

{
 "level":SAFE|SUSPICIOUS|DANGER,
 "confidence":0-1,
 "summary":"",
 "reason":"",
 "requires_sos":true|false
}

No contact names.

No phone numbers.

No tools.

Just reasoning.

Threat Fusion

Instead of trusting Gemini completely

calculate

Threat Score

keyword score

+

audio score

+

LLM confidence

+

history score

Example

Keyword

HELP!

+70

LLM

Danger

+25

Scream detected

+20

Total

115

Threshold

80

↓

Emergency

Much more reliable.

Alarm Workflow

Once threshold exceeded

Threat Score > 80

↓

Alarm State

↓

15 second countdown

↓

Phone vibrates

↓

Loud alarm

↓

Popup

"Emergency detected"

"I'm Safe"

"Cancel SOS"


During these 15 seconds the AI continues listening.

If it hears

I'm safe

false alarm

cancel

everything is okay

Cancel.

Or if user presses

Cancel

Cancel.

Otherwise

Timer expires.

SOS Workflow

The LLM should now call one tool only.

Example

send_emergency_alert(
incident_summary,
severity
)

Notice

No phone numbers.

No contacts.

No SMS.

No Twilio.

Backend tool implementation

send_emergency_alert(
summary,
severity
)

↓

Load user

↓

Load emergency contacts

↓

Load latest GPS

↓

Generate Maps link

↓

Send SMS

↓

Log incident

↓

Return success

The LLM doesn't know

who contacts are
how SMS works
Twilio credentials
database schema

Exactly how agent tools should be designed.

Notification Message

Example

🚨 EMERGENCY ALERT

Pratik may be in danger.

AI detected possible distress.

Summary

The user repeatedly shouted
"HELP" and sounds of screaming
were detected.

Location

https://maps.google.com/?q=...

Time

8:17 PM

Please contact them immediately.
Location Handling

Never ask the LLM for coordinates.

Maintain

Current GPS

↓

updated every

2–5 seconds

↓

Session Manager

↓

Notification Service

When SOS occurs

latest coordinates

are used automatically.

Session State Machine
LISTENING

↓

Possible threat

↓

VERIFYING

↓

Threat confirmed

↓

ALARM

↓

15 second countdown

↓

Cancelled
        │
        └────────► LISTENING

or

Countdown expires

↓

SOS SENT

↓

Monitoring continues

↓

Resolved

↓

LISTENING
Suggested Backend Services
app/

ws/
    websocket.py

services/
    session_manager.py
    speech_service.py
    threat_engine.py
    alarm_service.py
    notification_service.py
    location_service.py
    llm_service.py

tools/
    send_emergency_alert.py

workers/
    websocket_worker.py

models/
    session.py

Each service has a single responsibility, making the system easier to test and extend.

Implementation Plan
Phase 1 — Real-Time Communication
Replace POST /api/audio/analyze with a persistent WebSocket for audio streaming.
Send periodic GPS updates over the same WebSocket or a lightweight companion channel.
Implement a SessionManager to maintain per-user state.
Phase 2 — Detection Pipeline
Integrate Voice Activity Detection (VAD) to process only speech segments.
Add a fast keyword detector for immediate escalation.
Add audio event detection (screams, crying, impacts).
Invoke the LLM only for contextual analysis of transcripts, not for raw audio.
Phase 3 — Threat Fusion Engine
Combine keyword, acoustic, and LLM signals into a unified threat score.
Trigger a state transition to VERIFYING or ALARM based on configurable thresholds.
Phase 4 — Alarm & Verification
Start a 15-second countdown with vibration and audible alarm.
Accept cancellation through UI ("I'm Safe") or voice commands ("I'm safe", "Cancel", "False alarm").
Continue monitoring during the countdown.
Phase 5 — Emergency Tool Invocation
If the countdown expires, the LLM invokes a single send_emergency_alert(summary, severity) tool.
The backend resolves emergency contacts, retrieves the latest location, formats the AI summary, sends SMS via Twilio, and records the incident.
Phase 6 — Reliability & Production Hardening
Persist active sessions in Redis for recovery.
Add WebSocket reconnection and heartbeat handling.
Queue SMS delivery with retries.
Store incidents and audit logs.
Expose Prometheus metrics and alerting for failed notifications and connection health.