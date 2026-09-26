"""
Translation router — v1.15.0
Uses Emergent LLM (Claude Haiku) for fast per-post translation.
POST /api/translate
  body: { text: string, target_lang: str, source_lang?: str }
  returns: { translated: str, source: str, target: str }
"""
import os
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional
import logging

log = logging.getLogger(__name__)

LANG_NAMES = {
    'ar': 'Arabic', 'en': 'English', 'ur': 'Urdu', 'fa': 'Persian', 'he': 'Hebrew',
    'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian', 'pt': 'Portuguese',
    'ru': 'Russian', 'tr': 'Turkish', 'zh': 'Chinese (Simplified)', 'ja': 'Japanese',
    'ko': 'Korean', 'hi': 'Hindi', 'bn': 'Bengali', 'id': 'Indonesian', 'ms': 'Malay',
    'th': 'Thai',
}

# Simple in-memory cache to avoid re-calling for same text+target pair
_CACHE: dict[str, str] = {}


class TranslateReq(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    target_lang: str = Field(..., min_length=2, max_length=5)
    source_lang: Optional[str] = None


def build_router():
    router = APIRouter(prefix="/api")

    @router.post("/translate")
    async def translate(req: TranslateReq):
        key = f"{req.target_lang}::{hash(req.text)}"
        if key in _CACHE:
            return {"translated": _CACHE[key], "source": req.source_lang or "auto", "target": req.target_lang, "cached": True}

        target_name = LANG_NAMES.get(req.target_lang, req.target_lang)
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except Exception as e:
            log.error(f"emergentintegrations import failed: {e}")
            raise HTTPException(500, "Translation service unavailable")

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(500, "EMERGENT_LLM_KEY missing")

        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"tr-{key[:20]}",
                system_message=f"You are a professional translator. Translate the user's text to {target_name}. Return ONLY the translation with no explanation, quotes, or metadata. Preserve line breaks and emoji."
            ).with_model("anthropic", "claude-haiku-4-5")
            resp = await chat.send_message(UserMessage(text=req.text))
            translated = (resp or "").strip()
            # Strip surrounding quotes if any
            if translated.startswith('"') and translated.endswith('"'):
                translated = translated[1:-1]
            _CACHE[key] = translated
            return {"translated": translated, "source": req.source_lang or "auto", "target": req.target_lang, "cached": False}
        except Exception as e:
            log.error(f"translate LLM error: {e}")
            raise HTTPException(500, f"Translation failed: {str(e)[:120]}")

    return router
