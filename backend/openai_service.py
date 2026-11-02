"""
ShieldHer OpenAI service.
Analyzes transcripts and uploaded audio for potential safety threats.
"""

import json
import os
from typing import Any

from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_ANALYSIS_MODEL = os.getenv("OPENAI_ANALYSIS_MODEL", "gpt-4o-mini").strip()
OPENAI_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe").strip()

client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

SAFETY_ANALYSIS_SYSTEM_PROMPT = """You are a women's safety classifier.

Analyze the transcript for potential safety threats:
- Threatening language, aggression, intimidation, weapons, or violence
- Someone being followed or stalked
- Harassment, catcalling, coercion, or forced compliance
- Distress, screaming, crying, fear, or calls for help
- Suspicious approaches by strangers

Return JSON only with this shape:
{
  "threat_level": "SAFE" | "SUSPICIOUS" | "DANGER",
  "confidence": 0.0,
  "reason": "Brief explanation",
  "recommended_action": "What the user should do"
}

Rules:
- Empty, unclear, or normal conversation is SAFE.
- Mild concern is SUSPICIOUS.
- Clear danger is DANGER.
- Err on the side of caution for women's safety.
- Keep reason concise."""

CONTEXT_ANALYSIS_SYSTEM_PROMPT = """You are a safety context classifier.

You receive only the user's transcript from a live safety monitoring session.
You do not send messages, access contacts, call tools, or decide delivery.
Your job is structured reasoning only.

Detect danger even when there are no explicit emergency keywords. Examples:
- Being followed or stalked
- User says they are scared, trapped, coerced, threatened, or unsafe
- Harassment, intimidation, unwanted touching, weapons, violence
- Escalating suspicious behavior across multiple sentences

Return JSON only:
{
  "level": "SAFE" | "SUSPICIOUS" | "DANGER",
  "confidence": 0.0,
  "summary": "Short incident summary",
  "reason": "Why this level was assigned",
  "requires_sos": true
}

Rules:
- Normal conversation is SAFE.
- Ambiguous concern is SUSPICIOUS.
- Stalking, direct fear, coercion, assault, threats, or urgent distress is DANGER.
- Keep summary and reason concise."""


def _demo_response(reason: str, action: str) -> dict[str, Any]:
    return {
        "threat_level": "SAFE",
        "confidence": 0.5,
        "reason": reason,
        "recommended_action": action,
    }


def _normalize_analysis(result: dict[str, Any]) -> dict[str, Any]:
    valid_levels = {"SAFE", "SUSPICIOUS", "DANGER"}
    threat_level = str(result.get("threat_level", "SAFE")).upper()
    if threat_level not in valid_levels:
        threat_level = "SAFE"

    try:
        confidence = float(result.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5

    return {
        "threat_level": threat_level,
        "confidence": max(0.0, min(1.0, confidence)),
        "reason": result.get("reason", "Analysis complete"),
        "recommended_action": result.get("recommended_action", "Stay alert"),
    }


def _normalize_context_analysis(result: dict[str, Any]) -> dict[str, Any]:
    valid_levels = {"SAFE", "SUSPICIOUS", "DANGER"}
    level = str(result.get("level", result.get("threat_level", "SAFE"))).upper()
    if level not in valid_levels:
        level = "SAFE"

    try:
        confidence = float(result.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5

    return {
        "level": level,
        "confidence": max(0.0, min(1.0, confidence)),
        "summary": result.get("summary", "No immediate safety threat detected"),
        "reason": result.get("reason", "Context analysis complete"),
        "requires_sos": bool(result.get("requires_sos", level == "DANGER")),
    }


async def transcribe_audio(audio_path: str) -> str:
    """
    Transcribe an audio file to text using OpenAI's transcription model.
    Returns the transcript string, or empty string on failure/no key.
    """
    if not client:
        return ""
    try:
        with open(audio_path, "rb") as audio_file:
            result = await client.audio.transcriptions.create(
                model=OPENAI_TRANSCRIPTION_MODEL,
                file=audio_file,
            )
        return (getattr(result, "text", "") or "").strip()
    except Exception as exc:
        print(f"OpenAI transcription error: {exc}")
        return ""


async def analyze_transcript(transcript: str) -> dict[str, Any]:
    """
    Analyze an audio transcript for safety threats using AsyncOpenAI.
    Returns: { threat_level, confidence, reason, recommended_action }.
    """
    if not client:
        return _demo_response(
            "OpenAI API key not configured - running in demo mode",
            "Configure OPENAI_API_KEY for real analysis",
        )

    if not transcript or transcript.strip() == "":
        return {
            "threat_level": "SAFE",
            "confidence": 1.0,
            "reason": "No speech detected in audio",
            "recommended_action": "Continue monitoring",
        }

    try:
        response = await client.chat.completions.create(
            model=OPENAI_ANALYSIS_MODEL,
            response_format={"type": "json_object"},
            temperature=0.1,
            messages=[
                {"role": "system", "content": SAFETY_ANALYSIS_SYSTEM_PROMPT},
                {"role": "user", "content": f'Transcript:\n"""\n{transcript}\n"""'},
            ],
        )
        content = response.choices[0].message.content or "{}"
        return _normalize_analysis(json.loads(content))
    except Exception as exc:
        print(f"OpenAI analysis error: {exc}")
        return {
            "threat_level": "SAFE",
            "confidence": 0.0,
            "reason": f"Analysis error: {str(exc)[:100]}",
            "recommended_action": "Stay alert - AI analysis temporarily unavailable",
        }



async def analyze_safety_context(transcript: str) -> dict[str, Any]:
    """
    Contextual safety analysis for the realtime threat engine.
    Returns: { level, confidence, summary, reason, requires_sos }.
    """
    if not transcript or transcript.strip() == "":
        return {
            "level": "SAFE",
            "confidence": 1.0,
            "summary": "No speech detected",
            "reason": "No transcript available for analysis",
            "requires_sos": False,
        }

    if not client:
        lowered = transcript.lower()
        danger_terms = ["following me", "stalking", "scared", "afraid", "don't touch", "dont touch", "threat"]
        if any(term in lowered for term in danger_terms):
            return {
                "level": "DANGER",
                "confidence": 0.9,
                "summary": "Possible unsafe situation detected from transcript.",
                "reason": "OpenAI is not configured, but local context rules found danger language.",
                "requires_sos": True,
            }
        return {
            "level": "SAFE",
            "confidence": 0.5,
            "summary": "OpenAI API key not configured.",
            "reason": "Context analysis is running in demo mode.",
            "requires_sos": False,
        }

    try:
        response = await client.chat.completions.create(
            model=OPENAI_ANALYSIS_MODEL,
            response_format={"type": "json_object"},
            temperature=0.1,
            messages=[
                {"role": "system", "content": CONTEXT_ANALYSIS_SYSTEM_PROMPT},
                {"role": "user", "content": f'User Transcript:\n"""\n{transcript}\n"""'},
            ],
        )
        content = response.choices[0].message.content or "{}"
        return _normalize_context_analysis(json.loads(content))
    except Exception as exc:
        print(f"OpenAI context analysis error: {exc}")
        return {
            "level": "SAFE",
            "confidence": 0.0,
            "summary": "Context analysis unavailable.",
            "reason": f"Analysis error: {str(exc)[:100]}",
            "requires_sos": False,
        }



async def analyze_audio_file(audio_path: str) -> dict[str, Any]:
    """
    Transcribe an uploaded audio file with OpenAI, then classify the transcript.
    """
    if not client:
        result = _demo_response(
            "OpenAI API key not configured - running in demo mode",
            "Configure OPENAI_API_KEY",
        )
        result["transcript"] = ""
        return result

    try:
        with open(audio_path, "rb") as audio_file:
            transcription = await client.audio.transcriptions.create(
                model=OPENAI_TRANSCRIPTION_MODEL,
                file=audio_file,
            )

        transcript = getattr(transcription, "text", "") or ""
        result = await analyze_transcript(transcript)
        result["transcript"] = transcript
        return result
    except Exception as exc:
        print(f"OpenAI audio analysis error: {exc}")
        return {
            "threat_level": "SAFE",
            "confidence": 0.0,
            "transcript": "",
            "reason": f"Audio analysis error: {str(exc)[:200]}",
            "recommended_action": "Stay alert - AI audio analysis temporarily unavailable",
        }
