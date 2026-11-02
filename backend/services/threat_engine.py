"""
Realtime threat detection and fusion.

Keyword detection is a fast path, not the only path. Contextual LLM
analysis still runs for non-keyword threats such as stalking or fear.
"""

import re
from dataclasses import dataclass

from openai_service import analyze_safety_context

EMERGENCY_THRESHOLD = 80
SUSPICIOUS_THRESHOLD = 40

KEYWORD_PATTERNS = {
    "help": r"\bhelp\b",
    "need help": r"\bneed help\b",
    "save me": r"\bsave me\b",
    "danger": r"\bdanger\b",
    "please help": r"\bplease help\b",
    "leave me": r"\bleave me\b",
    "call police": r"\bcall (the )?police\b",
    "don't touch me": r"\bdon'?t touch me\b",
    "stop following me": r"\bstop following me\b",
}

URGENT_KEYWORDS = {
    "need help",
    "save me",
    "danger",
    "please help",
    "call police",
    "don't touch me",
    "stop following me",
}


@dataclass
class DetectorSignal:
    name: str
    score: int
    details: dict

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "score": self.score,
            "details": self.details,
        }


def detect_keywords(text: str) -> DetectorSignal:
    lowered = text.lower()
    matches = []
    total_hits = 0

    for label, pattern in KEYWORD_PATTERNS.items():
        hits = re.findall(pattern, lowered)
        if hits:
            matches.append(label)
            total_hits += len(hits)

    if not matches:
        return DetectorSignal("keyword", 0, {"matches": []})

    score = 80 if any(match in URGENT_KEYWORDS for match in matches) else 70
    if total_hits > 1:
        score += min(20, (total_hits - 1) * 10)

    return DetectorSignal("keyword", min(score, 90), {"matches": matches})


def _score_llm_result(result: dict) -> int:
    level = result.get("level", "SAFE")
    confidence = float(result.get("confidence", 0.0))

    if level == "DANGER":
        return round(90 * confidence)
    if level == "SUSPICIOUS":
        return round(45 * confidence)
    return 0


def _fuse(signals: list[DetectorSignal], llm_result: dict | None) -> dict:
    score = sum(signal.score for signal in signals)
    score = max(0, min(120, score))

    if score >= EMERGENCY_THRESHOLD:
        level = "DANGER"
        state = "ALARM"
    elif score >= SUSPICIOUS_THRESHOLD:
        level = "SUSPICIOUS"
        state = "VERIFYING"
    else:
        level = "SAFE"
        state = "LISTENING"

    summary = "No immediate safety threat detected."
    reason = "No concerning signals detected."
    requires_sos = level == "DANGER"

    keyword_signal = next((signal for signal in signals if signal.name == "keyword"), None)
    if keyword_signal and keyword_signal.score:
        reason = f"Emergency keyword fast path matched: {', '.join(keyword_signal.details['matches'])}."
        summary = "Possible urgent distress from spoken keywords."

    if llm_result:
        llm_level = llm_result.get("level")
        if llm_result.get("level") == "DANGER" and llm_result.get("requires_sos"):
            score = max(score, EMERGENCY_THRESHOLD)
            level = "DANGER"
            state = "ALARM"
        if llm_level != "SAFE" and llm_result.get("summary"):
            summary = llm_result["summary"]
        if llm_level != "SAFE" and llm_result.get("reason"):
            reason = llm_result["reason"]
        requires_sos = bool(llm_result.get("requires_sos")) or level == "DANGER"

    return {
        "level": level,
        "score": score,
        "state": state,
        "summary": summary,
        "reason": reason,
        "requires_sos": requires_sos,
        "signals": [signal.to_dict() for signal in signals],
        "llm": llm_result,
        "thresholds": {
            "suspicious": SUSPICIOUS_THRESHOLD,
            "emergency": EMERGENCY_THRESHOLD,
        },
    }


async def evaluate_transcript(text: str, session_transcript: str, is_final: bool) -> dict:
    keyword_signal = detect_keywords(text)
    signals = [keyword_signal]

    context = session_transcript or text
    llm_result = await analyze_safety_context(context)
    signals.append(DetectorSignal("llm_context", _score_llm_result(llm_result), llm_result))

    return _fuse(signals, llm_result)
