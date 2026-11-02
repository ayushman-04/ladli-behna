"""
In-memory realtime session manager.

This is intentionally process-local for the hackathon version. A later
production phase should move active session state to Redis.
"""

from threading import RLock
from datetime import datetime, timezone, timedelta
from typing import Optional

from models.session import LocationSnapshot, RealtimeSession, SessionState


class SessionManager:
    def __init__(self):
        self._sessions_by_user: dict[int, RealtimeSession] = {}
        self._lock = RLock()

    def start_session(self, user_id: int) -> RealtimeSession:
        with self._lock:
            session = RealtimeSession(user_id=user_id)
            self._sessions_by_user[user_id] = session
            return session

    def end_session(self, user_id: int) -> Optional[RealtimeSession]:
        with self._lock:
            return self._sessions_by_user.pop(user_id, None)

    def get_session(self, user_id: int) -> Optional[RealtimeSession]:
        with self._lock:
            return self._sessions_by_user.get(user_id)

    def update_location(self, user_id: int, latitude: float, longitude: float) -> Optional[RealtimeSession]:
        with self._lock:
            session = self._sessions_by_user.get(user_id)
            if not session:
                return None
            session.current_location = LocationSnapshot(latitude=latitude, longitude=longitude)
            session.touch()
            return session

    def append_transcript(self, user_id: int, text: str, is_final: bool = True) -> Optional[RealtimeSession]:
        with self._lock:
            session = self._sessions_by_user.get(user_id)
            if not session:
                return None
            if is_final:
                session.transcript = f"{session.transcript} {text}".strip()
            else:
                session.transcript = text.strip()
            session.touch()
            return session

    def record_audio_chunk(self, user_id: int, chunk_size: int, chunk_bytes: bytes = b"") -> Optional[RealtimeSession]:
        with self._lock:
            session = self._sessions_by_user.get(user_id)
            if not session:
                return None
            session.audio_chunks_received += 1
            session.audio_bytes_received += chunk_size
            if chunk_bytes:
                session.audio_buffer.append(chunk_bytes)
                # Keep the first WebM header chunk plus the latest chunks.
                # Dropping the first chunk corrupts later concatenated WebM files.
                if len(session.audio_buffer) > 60:
                    session.audio_buffer = [session.audio_buffer[0]] + session.audio_buffer[-59:]
            session.touch()
            return session

    def set_state(self, user_id: int, state: SessionState) -> Optional[RealtimeSession]:
        with self._lock:
            session = self._sessions_by_user.get(user_id)
            if not session:
                return None
            session.state = state
            session.touch()
            return session

    def update_threat(self, user_id: int, threat_result: dict) -> Optional[RealtimeSession]:
        with self._lock:
            session = self._sessions_by_user.get(user_id)
            if not session:
                return None
            session.threat_score = int(threat_result.get("score", 0))
            session.last_threat = threat_result
            state = threat_result.get("state")
            if state:
                session.state = SessionState(state)
            session.touch()
            return session

    def start_alarm(self, user_id: int, duration_seconds: int) -> Optional[RealtimeSession]:
        with self._lock:
            session = self._sessions_by_user.get(user_id)
            if not session:
                return None
            now = datetime.now(timezone.utc)
            session.state = SessionState.ALARM
            session.alarm_started_at = now
            session.alarm_deadline_at = now + timedelta(seconds=duration_seconds)
            session.touch()
            return session

    def cancel_alarm(self, user_id: int) -> Optional[RealtimeSession]:
        with self._lock:
            session = self._sessions_by_user.get(user_id)
            if not session:
                return None
            session.state = SessionState.LISTENING
            session.threat_score = 0
            session.alarm_started_at = None
            session.alarm_deadline_at = None
            session.last_threat = None
            session.touch()
            return session

    def mark_sos_sent(self, user_id: int) -> Optional[RealtimeSession]:
        with self._lock:
            session = self._sessions_by_user.get(user_id)
            if not session:
                return None
            session.state = SessionState.SOS_SENT
            session.sos_sent = True
            session.touch()
            return session

    def list_sessions(self) -> list[dict]:
        with self._lock:
            return [session.to_dict() for session in self._sessions_by_user.values()]


session_manager = SessionManager()
