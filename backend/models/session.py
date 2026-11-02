"""
Realtime monitoring session models.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import uuid4


class SessionState(str, Enum):
    LISTENING = "LISTENING"
    VERIFYING = "VERIFYING"
    ALARM = "ALARM"
    SOS_SENT = "SOS_SENT"


@dataclass
class LocationSnapshot:
    latitude: float
    longitude: float
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class RealtimeSession:
    user_id: int
    session_id: str = field(default_factory=lambda: uuid4().hex)
    state: SessionState = SessionState.LISTENING
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    current_location: Optional[LocationSnapshot] = None
    transcript: str = ""
    audio_bytes_received: int = 0
    audio_chunks_received: int = 0
    threat_score: int = 0
    last_threat: Optional[dict] = None
    alarm_started_at: Optional[datetime] = None
    alarm_deadline_at: Optional[datetime] = None
    sos_sent: bool = False
    # Raw audio buffer — concatenation of all chunks (valid WebM/Opus file)
    audio_buffer: list = field(default_factory=list)
    last_transcribed_chunk: int = 0  # chunk index when we last ran transcription

    def touch(self) -> None:
        self.last_seen_at = datetime.now(timezone.utc)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "state": self.state.value,
            "connected_at": self.connected_at.isoformat(),
            "last_seen_at": self.last_seen_at.isoformat(),
            "current_location": self.current_location.to_dict() if self.current_location else None,
            "transcript": self.transcript,
            "audio_bytes_received": self.audio_bytes_received,
            "audio_chunks_received": self.audio_chunks_received,
            "threat_score": self.threat_score,
            "last_threat": self.last_threat,
            "alarm_started_at": self.alarm_started_at.isoformat() if self.alarm_started_at else None,
            "alarm_deadline_at": self.alarm_deadline_at.isoformat() if self.alarm_deadline_at else None,
            "sos_sent": self.sos_sent,
        }
