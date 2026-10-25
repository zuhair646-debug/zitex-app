"""
Translation router — v1.17.0 (June 2026)
Persistent MongoDB cache + Emergent LLM (Claude Haiku 4.5).

Architecture:
  - Dynamic DB content (product/customer/category names, descriptions)
    is translated ON-DEMAND when the user taps a 🌐 button in the UI.
  - The first translation hits Claude Haiku 4.5 and is PERMANENTLY
    cached in MongoDB `translations_cache` collection, keyed by a
    SHA-1 hash of the source text + target language.
  - Subsequent requests for the same text + language hit the DB
    cache INSTANTLY (sub-ms), with ZERO LLM cost.
  - A thin in-process LRU further removes DB round-trips.

Endpoints:
  POST /api/translate       — single text
  POST /api/translate/bulk  — up to 1000 texts in one call
"""
import os
import hashlib
import logging
from datetime import datetime
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

LANG_NAMES = {
    'ar': 'Arabic', 'en': 'English', 'ur': 'Urdu', 'fa': 'Persian', 'he': 'Hebrew',
    'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian', 'pt': 'Portuguese',
    'ru': 'Russian', 'tr': 'Turkish', 'zh': 'Chinese (Simplified)', 'ja': 'Japanese',
    'ko': 'Korean', 'hi': 'Hindi', 'bn': 'Bengali', 'id': 'Indonesian', 'ms': 'Malay',
    'th': 'Thai',
}

# In-process LRU to avoid DB round-trips on hot keys. Keyed by sha1+lang.
_MEM_CACHE: Dict[str, str] = {}
_MEM_CACHE_MAX = 10000


def _hash(text: str) -> str:
    return hashlib.sha1(text.strip().encode('utf-8')).hexdigest()


def _put_mem(key: str, value: str):
    if len(_MEM_CACHE) >= _MEM_CACHE_MAX:
        # drop ~10% oldest
        for k in list(_MEM_CACHE.keys())[: _MEM_CACHE_MAX // 10]:
            _MEM_CACHE.pop(k, None)
    _MEM_CACHE[key] = value


# Rules shared by single + bulk prompts (June 2026 quality pass).
_RULES = (
    "Context: UI text and product/branch/service names in 'Zenrex Store', a Saudi electronics store app. "
    "Write ONLY in the target language and its normal script; never leave Arabic words and never mix in another "
    "script. Keep placeholders like {n} exactly. Keep emoji and numbers. Saudi riyal (ر.س / ريال) => 'SAR'. "
    "Keep brand/model names in Latin (iPhone, Samsung, Galaxy, Huawei, Zenrex Store, WhatsApp, POS). "
    "Use the standard spelling of Saudi city names in the target language. 'Balance' means money balance."
)

_SCRIPT_RX = {
    'arab': r'[\u0600-\u06FF]', 'heb': r'[\u0590-\u05FF]', 'cyr': r'[\u0400-\u04FF]', 'cjk': r'[\u4E00-\u9FFF]',
    'kana': r'[\u3040-\u30FF]', 'hangul': r'[\uAC00-\uD7AF]', 'deva': r'[\u0900-\u097F]',
    'beng': r'[\u0980-\u09FF]', 'thai': r'[\u0E00-\u0E7F]', 'geo': r'[\u10A0-\u10FF]',
}
_ALLOWED = {
    'ar': ['arab'], 'ur': ['arab'], 'fa': ['arab'], 'he': ['heb'], 'ru': ['cyr'], 'zh': ['cjk'],
    'ja': ['cjk', 'kana'], 'ko': ['hangul', 'cjk'], 'hi': ['deva'], 'bn': ['beng'], 'th': ['thai'],
}


_NATIVE = {'ur': 'arab', 'fa': 'arab', 'he': 'heb', 'ru': 'cyr', 'zh': 'cjk', 'ja': 'kana|cjk', 'ko': 'hangul',
           'hi': 'deva', 'bn': 'beng', 'th': 'thai'}
_BRANDS = ('Zenrex', 'iPhone', 'Samsung', 'Galaxy', 'Huawei', 'Apple', 'POS', 'SAR', 'WhatsApp', 'Tamara', 'Tabby')


def _clean_ok(target: str, text: str) -> bool:
    """True when the translation only uses scripts valid for the target language and,
    for non-Latin languages, actually contains the target script (unless it's a pure brand/model name)."""
    import re
    allowed = _ALLOWED.get(target, [])
    if any(re.search(rx, text) for name, rx in _SCRIPT_RX.items() if name not in allowed):
        return False
    native = _NATIVE.get(target)
    if native and re.search(r'[A-Za-z]{4,}', text):
        has_native = any(re.search(_SCRIPT_RX[n], text) for n in native.split('|'))
        if not has_native and not any(b in text for b in _BRANDS):
            return False
    return True


class TranslateReq(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    target_lang: str = Field(..., min_length=2, max_length=5)
    source_lang: Optional[str] = None


class BulkTranslateReq(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=1000)
    target_lang: str = Field(..., min_length=2, max_length=5)
    source_lang: Optional[str] = None


def build_router(db=None):
    """
    Builds the translation router.

    db: optional AsyncIOMotorDatabase. If provided, enables persistent
        MongoDB cache in `translations_cache` collection.
    """
    router = APIRouter(prefix="/api")
    coll = db["translations_cache"] if db is not None else None

    async def _ensure_indexes():
        if coll is None:
            return
        try:
            await coll.create_index([("hash", 1), ("target", 1)], unique=True, name="hash_target_unique")
            await coll.create_index("target", name="by_target")
        except Exception as e:
            log.warning(f"translations_cache index bootstrap failed: {e}")

    async def _cache_get(text: str, target: str) -> Optional[str]:
        h = _hash(text)
        mem_key = f"{target}::{h}"
        if mem_key in _MEM_CACHE:
            return _MEM_CACHE[mem_key]
        if coll is None:
            return None
        try:
            doc = await coll.find_one({"hash": h, "target": target}, {"translated": 1})
            if doc and doc.get("translated"):
                _put_mem(mem_key, doc["translated"])
                return doc["translated"]
        except Exception as e:
            log.warning(f"cache_get failed: {e}")
        return None

    async def _cache_put(text: str, target: str, translated: str, source_lang: Optional[str] = None):
        h = _hash(text)
        mem_key = f"{target}::{h}"
        _put_mem(mem_key, translated)
        if coll is None:
            return
        try:
            await coll.update_one(
                {"hash": h, "target": target},
                {
                    "$set": {
                        "hash": h,
                        "target": target,
                        "source_lang": source_lang or "auto",
                        "source_preview": text[:120],
                        "translated": translated,
                        "updated_at": datetime.utcnow(),
                    },
                    "$setOnInsert": {"created_at": datetime.utcnow()},
                },
                upsert=True,
            )
        except Exception as e:
            log.warning(f"cache_put failed: {e}")

    @router.on_event("startup")
    async def _startup_hook():
        await _ensure_indexes()

    @router.post("/translate")
    async def translate(req: TranslateReq):
        """Single text translation. Persistent cache + LLM fallback."""
        text = (req.text or "").strip()
        if not text:
            return {"translated": "", "source": req.source_lang or "auto", "target": req.target_lang, "cached": True}

        # Same language — no-op
        if req.source_lang and req.source_lang == req.target_lang:
            return {"translated": text, "source": req.source_lang, "target": req.target_lang, "cached": True}

        # 1) cache
        hit = await _cache_get(text, req.target_lang)
        if hit is not None:
            return {"translated": hit, "source": req.source_lang or "auto", "target": req.target_lang, "cached": True}

        # 2) LLM
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except Exception as e:
            raise HTTPException(500, f"Translation service unavailable: {e}")
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(500, "EMERGENT_LLM_KEY missing")

        target_name = LANG_NAMES.get(req.target_lang, req.target_lang)
        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"tr-{_hash(text)[:16]}-{req.target_lang}",
                system_message=(
                    f"You are a professional translator. Translate the user's text to {target_name}. "
                    "Return ONLY the translation — no explanation, no quotes, no metadata. "
                    "Preserve line breaks. " + _RULES
                ),
            ).with_model("anthropic", "claude-haiku-4-5")
            resp = await chat.send_message(UserMessage(text=text))
            translated = (resp or "").strip()
            if translated.startswith('"') and translated.endswith('"'):
                translated = translated[1:-1]
            if not translated:
                translated = text
            translated = translated.replace('ر.س', 'SAR')
            if not _clean_ok(req.target_lang, translated):
                retry = await chat.send_message(UserMessage(text=(
                    f"Your answer mixed scripts or kept Arabic. Translate again, ONLY in {target_name}: {text}")))
                retry = (retry or '').strip().strip('"').replace('ر.س', 'SAR')
                if retry and _clean_ok(req.target_lang, retry):
                    translated = retry
                else:
                    return {"translated": translated, "source": req.source_lang or "auto", "target": req.target_lang, "cached": False}
            await _cache_put(text, req.target_lang, translated, req.source_lang)
            return {"translated": translated, "source": req.source_lang or "auto", "target": req.target_lang, "cached": False}
        except Exception as e:
            log.error(f"translate LLM error: {e}")
            raise HTTPException(500, f"Translation failed: {str(e)[:120]}")

    @router.post("/translate/bulk")
    async def translate_bulk(req: BulkTranslateReq):
        """Translate up to 1000 strings. Uses persistent cache + batched LLM calls."""
        target_name = LANG_NAMES.get(req.target_lang, req.target_lang)
        results: Dict[str, str] = {}
        remaining: list[str] = []

        for raw in req.texts:
            t = (raw or "").strip()
            if not t:
                results[raw] = raw
                continue
            if req.source_lang and req.source_lang == req.target_lang:
                results[raw] = t
                continue
            hit = await _cache_get(t, req.target_lang)
            if hit is not None:
                results[raw] = hit
            else:
                remaining.append(raw)

        if not remaining:
            return {"translations": results, "cached": True}

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except Exception as e:
            raise HTTPException(500, f"Translation service unavailable: {e}")
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(500, "EMERGENT_LLM_KEY missing")

        CHUNK = 40
        for i in range(0, len(remaining), CHUNK):
            batch = remaining[i:i + CHUNK]
            numbered = "\n".join(f"{j + 1}. {s}" for j, s in enumerate(batch))
            try:
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"trb-{req.target_lang}-{i}",
                    system_message=(
                        f"You are a professional translator. Translate each numbered line to {target_name}. "
                        "Return ONLY the translations in the same order, each on its own line, prefixed with the "
                        "same number and a dot. No explanations, no extra text, no quotes. " + _RULES
                    ),
                ).with_model("anthropic", "claude-haiku-4-5")
                resp = await chat.send_message(UserMessage(text=numbered))
                raw_lines = (resp or "").strip().split("\n")
                for line in raw_lines:
                    line = line.strip()
                    if not line:
                        continue
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
                                    tr = tr.replace('ر.س', 'SAR')
                                    if not _clean_ok(req.target_lang, tr):
                                        break
                                    results[src] = tr
                                    await _cache_put(src.strip(), req.target_lang, tr, req.source_lang)
                                break
            except Exception as e:
                log.warning(f"bulk translate chunk failed: {e}")
                continue

        # Fallback: any text we couldn't translate — return source
        for raw in req.texts:
            results.setdefault(raw, raw)

        return {"translations": results, "cached": False}

    @router.get("/translate/cache/stats")
    async def cache_stats():
        """Observability for the translation cache."""
        if coll is None:
            return {"persistent": False, "mem_cache_size": len(_MEM_CACHE)}
        try:
            total = await coll.count_documents({})
            by_lang_cursor = coll.aggregate([{"$group": {"_id": "$target", "n": {"$sum": 1}}}])
            by_lang = {d["_id"]: d["n"] async for d in by_lang_cursor}
            return {
                "persistent": True,
                "total_cached": total,
                "by_language": by_lang,
                "mem_cache_size": len(_MEM_CACHE),
            }
        except Exception as e:
            return {"persistent": True, "error": str(e)[:200]}

    return router
