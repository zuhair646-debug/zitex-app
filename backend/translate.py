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


class BulkTranslateReq(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=1000)
    target_lang: str = Field(..., min_length=2, max_length=5)
    source_lang: Optional[str] = None


def build_router():
    router = APIRouter(prefix="/api")

    @router.post("/translate/bulk")
    async def translate_bulk(req: BulkTranslateReq):
        """Translate up to 1000 strings at once. Returns dict {source_text: translated_text}."""
        target_name = LANG_NAMES.get(req.target_lang, req.target_lang)
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except Exception as e:
            raise HTTPException(500, f"Translation service unavailable: {e}")
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(500, "EMERGENT_LLM_KEY missing")
        results: dict[str, str] = {}
        # Cache hits first
        remaining = []
        for t in req.texts:
            key = f"{req.target_lang}::{hash(t)}"
            if key in _CACHE:
                results[t] = _CACHE[key]
            else:
                remaining.append(t)
        if not remaining:
            return {"translations": results, "cached": True}
        # Batch by chunks of 40 lines to stay well under token limits
        CHUNK = 40
        for i in range(0, len(remaining), CHUNK):
            batch = remaining[i:i+CHUNK]
            numbered = "\n".join(f"{j+1}. {s}" for j, s in enumerate(batch))
            try:
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"trb-{req.target_lang}-{i}",
                    system_message=(
                        f"You are a professional translator. Translate each numbered line to {target_name}. "
                        f"Return ONLY the translations in the same order, each on its own line, prefixed with the same number and dot, no explanations, no extra text, no quotes. Preserve emoji."
                    )
                ).with_model("anthropic", "claude-haiku-4-5")
                resp = await chat.send_message(UserMessage(text=numbered))
                raw = (resp or "").strip().split("\n")
                for line in raw:
                    line = line.strip()
                    if not line:
                        continue
                    # Parse "N. translation"
                    m = None
                    for sep in (". ", ".", " "):
                        if sep in line:
                            head, _, tail = line.partition(sep)
                            if head.strip().isdigit():
                                idx = int(head.strip()) - 1
                                if 0 <= idx < len(batch):
                                    tr = tail.strip()
                                    if tr.startswith('"') and tr.endswith('"'):
                                        tr = tr[1:-1]
                                    src = batch[idx]
                                    results[src] = tr
                                    _CACHE[f"{req.target_lang}::{hash(src)}"] = tr
                                    m = True
                                    break
                    if not m:
                        continue
            except Exception as e:
                log.warning(f"bulk translate chunk failed: {e}")
                continue
        # Ensure every requested text has an entry (fallback to source)
        for t in req.texts:
            results.setdefault(t, t)
        return {"translations": results, "cached": False}

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
