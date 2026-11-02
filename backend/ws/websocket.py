"""
Realtime audio/location WebSocket endpoint.

Audio binary chunks are buffered and periodically transcribed server-side
via OpenAI (every TRANSCRIBE_EVERY_N_CHUNKS chunks). This is the primary
transcript path — it works regardless of whether the browser's Web Speech
API is functional. Browser-sent transcript events are also accepted and
evaluated immediately as a fast path.
"""

import json
import os
import tempfile
import asyncio
from contextlib import suppress
from json import JSONDecodeError

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from auth import decode_user_id_from_token
from openai_service import transcribe_audio
from services.notification_service import send_emergency_alert
from services.session_manager import session_manager
from services.threat_engine import evaluate_transcript

router = APIRouter()

# Transcribe server-side every N audio chunks (MediaRecorder fires every 1s,
# so N=5 means ~5-second analysis windows).
TRANSCRIBE_EVERY_N_CHUNKS = 5
ALARM_COUNTDOWN_SECONDS = 15
alarm_tasks: dict[int, asyncio.Task] = {}
SAFE_CANCEL_PHRASES = (
    "i'm safe",
    "im safe",
    "i am safe",
    "false alarm",
    "cancel sos",
    "cancel emergency",
    "everything is okay",
    "everything is ok",
)


def _extract_token(websocket: WebSocket) -> str | None:
    token = websocket.query_params.get("token")
    if token:
        return token

    authorization = websocket.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return None


async def _send_error(websocket: WebSocket, code: str, message: str) -> None:
    await websocket.send_json({
        "type": "error",
        "code": code,
        "message": message,
    })


async def _run_threat_and_send(
    websocket: WebSocket,
    user_id: int,
    text: str,
    is_final: bool,
    source: str = "browser",
) -> None:
    """Shared helper: append transcript, run threat engine, push threat_update."""
    active_session = session_manager.get_session(user_id)
    lowered = text.lower()
    if (
        active_session
        and active_session.alarm_started_at
        and any(phrase in lowered for phrase in SAFE_CANCEL_PHRASES)
    ):
        await _cancel_alarm(websocket, user_id, "Voice safe phrase detected")
        return

    session = session_manager.append_transcript(
        user_id=user_id,
        text=text,
        is_final=is_final,
    )
    if not session:
        return
    await websocket.send_json({
        "type": "transcript_ack",
        "session_id": session.session_id,
        "transcript": session.transcript,
        "source": source,
    })

    threat = await evaluate_transcript(
        text=text,
        session_transcript=session.transcript,
        is_final=is_final,
    )
    session = session_manager.update_threat(user_id, threat)
    if not session:
        return
    print(
        f"Threat update user={user_id} source={source} level={threat['level']} "
        f"score={threat['score']} state={threat['state']} signals={threat['signals']}"
    )
    await websocket.send_json({
        "type": "threat_update",
        "session_id": session.session_id,
        "threat": threat,
        "session_state": session.state.value,
    })

    if threat.get("state") == "ALARM" and threat.get("requires_sos"):
        await _start_alarm_if_needed(websocket, user_id, threat)


async def _start_alarm_if_needed(websocket: WebSocket, user_id: int, threat: dict) -> None:
    session = session_manager.get_session(user_id)
    if not session or session.sos_sent or session.alarm_started_at:
        return

    session = session_manager.start_alarm(user_id, ALARM_COUNTDOWN_SECONDS)
    await websocket.send_json({
        "type": "alarm_started",
        "session_id": session.session_id,
        "countdown_seconds": ALARM_COUNTDOWN_SECONDS,
        "threat": threat,
    })

    task = asyncio.create_task(_alarm_countdown(websocket, user_id, threat))
    alarm_tasks[user_id] = task


async def _alarm_countdown(websocket: WebSocket, user_id: int, threat: dict) -> None:
    try:
        for remaining in range(ALARM_COUNTDOWN_SECONDS, 0, -1):
            session = session_manager.get_session(user_id)
            if not session or not session.alarm_started_at or session.sos_sent:
                return
            with suppress(Exception):
                await websocket.send_json({
                    "type": "alarm_tick",
                    "remaining_seconds": remaining,
                })
            await asyncio.sleep(1)

        session = session_manager.get_session(user_id)
        if not session or not session.alarm_started_at or session.sos_sent:
            return

        location = session.current_location
        result = send_emergency_alert(
            user_id=user_id,
            summary=threat.get("summary", "Realtime danger detected"),
            severity=threat.get("level", "DANGER"),
            latitude=location.latitude if location else None,
            longitude=location.longitude if location else None,
            transcript=session.transcript,
        )
        session = session_manager.mark_sos_sent(user_id)
        with suppress(Exception):
            await websocket.send_json({
                "type": "sos_sent",
                "session_id": session.session_id if session else None,
                "notification": result,
            })
        print(f"Realtime SOS sent user={user_id} success={result.get('success')} sms={result.get('sms_results')}")
    except Exception as exc:
        print(f"Alarm countdown error user={user_id}: {exc}")
        with suppress(Exception):
            await websocket.send_json({
                "type": "sos_error",
                "message": str(exc),
            })
    finally:
        alarm_tasks.pop(user_id, None)


async def _cancel_alarm(websocket: WebSocket, user_id: int, reason: str) -> None:
    task = alarm_tasks.pop(user_id, None)
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    session = session_manager.cancel_alarm(user_id)
    await websocket.send_json({
        "type": "alarm_cancelled",
        "session_id": session.session_id if session else None,
        "reason": reason,
    })


async def _server_side_transcribe(websocket: WebSocket, user_id: int) -> None:
    """
    Concatenate buffered audio chunks into a temp .webm file and transcribe
    via OpenAI. The concatenation of all chunks from the start is always a
    valid WebM file (first chunk carries the EBML header + codec tracks).
    """
    session = session_manager.get_session(user_id)
    if not session or not session.audio_buffer:
        return

    audio_bytes = b"".join(session.audio_buffer)
    if len(audio_bytes) < 1024:
        # Too small to be meaningful audio
        return

    tmp_path = None
    try:
        # Write to a named temp file with .webm extension so OpenAI
        # recognises the format correctly.
        with tempfile.NamedTemporaryFile(
            suffix=".webm", delete=False, dir=tempfile.gettempdir()
        ) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        print(f"Server-side transcribing user={user_id} "
              f"chunks={session.audio_chunks_received} bytes={len(audio_bytes)}")

        transcript = await transcribe_audio(tmp_path)
        if not transcript:
            print(f"Server-side transcription returned empty for user={user_id}")
            return

        print(f"Server-side transcript user={user_id}: {transcript[:120]}")

        # Only send the delta — the new words since last transcription.
        # We compare the new full transcript against what the session already holds.
        existing = session.transcript.strip()
        if existing and transcript.startswith(existing):
            delta = transcript[len(existing):].strip()
        else:
            delta = transcript

        if delta:
            await _run_threat_and_send(
                websocket=websocket,
                user_id=user_id,
                text=delta,
                is_final=True,
                source="server",
            )

    except Exception as exc:
        print(f"Server-side transcription error user={user_id}: {exc}")
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass


@router.websocket("/api/ws/audio")
async def audio_stream(websocket: WebSocket):
    token = _extract_token(websocket)
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        user_id = decode_user_id_from_token(token)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    session = session_manager.start_session(user_id)
    await websocket.send_json({
        "type": "session_started",
        "session": session.to_dict(),
    })

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            # ── Binary audio chunk ──────────────────────────────────────────
            if message.get("bytes") is not None:
                current_session = session_manager.get_session(user_id)
                if not current_session or current_session.sos_sent:
                    break

                chunk = message["bytes"]
                session = session_manager.record_audio_chunk(
                    user_id, len(chunk), chunk
                )
                if not session:
                    break
                await websocket.send_json({
                    "type": "audio_ack",
                    "session_id": session.session_id,
                    "audio_chunks_received": session.audio_chunks_received,
                    "audio_bytes_received": session.audio_bytes_received,
                })

                # Every N chunks trigger server-side transcription
                if session.audio_chunks_received % TRANSCRIBE_EVERY_N_CHUNKS == 0:
                    await _server_side_transcribe(websocket, user_id)

                continue

            # ── JSON text message ───────────────────────────────────────────
            raw_text = message.get("text")
            if raw_text is None:
                await _send_error(
                    websocket, "unsupported_message",
                    "Send JSON text or binary audio chunks"
                )
                continue

            try:
                payload = json.loads(raw_text)
            except JSONDecodeError:
                await _send_error(
                    websocket, "invalid_json",
                    "Text messages must be valid JSON"
                )
                continue

            event_type = payload.get("type")

            if event_type == "location":
                current_session = session_manager.get_session(user_id)
                if not current_session or current_session.sos_sent:
                    break

                latitude = payload.get("latitude")
                longitude = payload.get("longitude")
                if latitude is None or longitude is None:
                    await _send_error(
                        websocket, "invalid_location",
                        "latitude and longitude are required"
                    )
                    continue

                session = session_manager.update_location(
                    user_id, float(latitude), float(longitude)
                )
                await websocket.send_json({
                    "type": "location_ack",
                    "session_id": session.session_id,
                    "current_location": session.current_location.to_dict(),
                })

            elif event_type == "transcript":
                current_session = session_manager.get_session(user_id)
                if not current_session or current_session.sos_sent:
                    break

                # Fast path: browser Web Speech API sent us pre-transcribed text
                text = str(payload.get("text", "")).strip()
                if not text:
                    await _send_error(
                        websocket, "invalid_transcript", "text is required"
                    )
                    continue

                is_final = bool(payload.get("is_final", True))
                print(f"Browser transcript user={user_id} final={is_final}: {text[:120]}")
                await _run_threat_and_send(
                    websocket=websocket,
                    user_id=user_id,
                    text=text,
                    is_final=is_final,
                    source="browser",
                )

            elif event_type == "ping":
                session = session_manager.get_session(user_id)
                if session:
                    session.touch()
                await websocket.send_json({
                    "type": "pong",
                    "session": session.to_dict() if session else None,
                })

            elif event_type in ("cancel_sos", "im_safe"):
                await _cancel_alarm(
                    websocket=websocket,
                    user_id=user_id,
                    reason=str(payload.get("reason", event_type)),
                )

            else:
                await _send_error(
                    websocket, "unknown_event",
                    f"Unsupported event type: {event_type}"
                )

    except WebSocketDisconnect:
        pass
    finally:
        if user_id not in alarm_tasks:
            session_manager.end_session(user_id)
