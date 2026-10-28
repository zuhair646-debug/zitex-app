"""
Translation router — v1.17.0 (June 2026)
Persistent MongoDB cache + Emergent LLM (Claude Sonnet 4.6).

Architecture:
  - Dynamic DB content (product/customer/category names, descriptions)
    is translated ON-DEMAND when the user taps a 🌐 button in the UI.
  - The first translation hits Claude Sonnet 4.6 and is PERMANENTLY
    cached in MongoDB `translations_cache` collection, keyed by a
    SHA-1 hash of the source text + target language.
  - Subsequent requests for the same text + language hit the DB
    cache INSTANTLY (sub-ms), with ZERO LLM cost.
  - A thin in-process LRU further removes DB round-trips.

Endpoints:
  POST /api/translate       — single text
  POST /api/translate/bulk  — up to 1000 texts in one call
"""
import re
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
    return hashlib.sha1(f"{_RULES_VERSION}|{text.strip()}".encode('utf-8')).hexdigest()


def _put_mem(key: str, value: str):
    if len(_MEM_CACHE) >= _MEM_CACHE_MAX:
        # drop ~10% oldest
        for k in list(_MEM_CACHE.keys())[: _MEM_CACHE_MAX // 10]:
            _MEM_CACHE.pop(k, None)
    _MEM_CACHE[key] = value


# Rules shared by single + bulk prompts (June 2026 quality pass).
_RULES = (
    "Context: UI text, product names and people's names in 'Zenrex Store', a Saudi electronics store app. "
    "Write ONLY in the target language and its normal script; never leave words in another script. "
    "Keep placeholders like {n} exactly. Keep emoji and numbers. Saudi riyal (ر.س / ريال) => the target-language word or 'SAR' for Latin-script languages. "
    "BRANDS: for targets with a non-Latin script (Arabic, Urdu, Persian, Hebrew, Russian, Chinese, Japanese, Korean, Hindi, Bengali, Thai) "
    "write brand and product-line names in the TARGET script exactly as native speakers usually write them "
    "(Arabic: آيفون، ماك بوك برو، شاومي، سامسونج جالكسي، ديل، لينوفو، هواوي، أنكر، ساعة أبل; Urdu: آئی فون، میک بک; Chinese: 苹果手机/iPhone→苹果, 小米, 戴尔, 联想, 三星, 华为; "
    "Hindi: आईफ़ोन, सैमसंग; Russian: Айфон, Самсунг). Only short model codes that contain digits or are 2-4 capital letters stay as-is "
    "(M3, S3, 15, 128GB, USB-C, 5G). Product-line words like Pro, Max, Ultra, Plus, Mini, Air, Watch, Book MUST be translated/transliterated too. For Latin-script targets (English, French, Spanish, German, Italian, Portuguese, Turkish, Indonesian, Malay) "
    "keep brand names in their normal Latin spelling (iPhone, Xiaomi, Dell). The app name 'Zenrex' always stays 'Zenrex'. "
    "PEOPLE'S NAMES (customers, employees, drivers): transliterate into the target script (e.g. 'محمد العتيبي' → 'Mohammed Al-Otaibi'; 'John Smith' → 'جون سميث'). "
    "Use the standard spelling of Saudi city names in the target language. 'Balance' means money balance. "
    "The source may MIX Arabic and English words and numbers (e.g. 'آيفون 15 Pro Max أسود 256 جيجا'): rewrite it as ONE "
    "natural phrase fully in the target language — translate every common word (colours, storage, condition, descriptions). "
    "If the merchant wrote the SAME thing twice in two languages (e.g. 'آيفون 16 iPhone 16' or 'ساعة أبل Apple Watch' or 'Watch S3 · Xiaomi Watch S3'), "
    "say it ONCE — never repeat a brand, model or word. Keep every extra detail (capacity, colour, condition, warranty) once."
)
# Bump when the rules change so stale cached translations are regenerated.
_AR_RX = __import__('re').compile(r'[\u0600-\u06FF]')
_RULES_VERSION = 'r4'

_SCRIPT_RX = {
    'arab': r'[\u0600-\u06FF]', 'heb': r'[\u0590-\u05FF]', 'cyr': r'[\u0400-\u04FF]', 'cjk': r'[\u4E00-\u9FFF]',
    'kana': r'[\u3040-\u30FF]', 'hangul': r'[\uAC00-\uD7AF]', 'deva': r'[\u0900-\u097F]',
    'beng': r'[\u0980-\u09FF]', 'thai': r'[\u0E00-\u0E7F]', 'geo': r'[\u10A0-\u10FF]',
}
_ALLOWED = {
    'ar': ['arab'], 'ur': ['arab'], 'fa': ['arab'], 'he': ['heb'], 'ru': ['cyr'], 'zh': ['cjk'],
    'ja': ['cjk', 'kana'], 'ko': ['hangul', 'cjk'], 'hi': ['deva'], 'bn': ['beng', 'deva'], 'th': ['thai'],
}


_NATIVE = {'ur': 'arab', 'fa': 'arab', 'he': 'heb', 'ru': 'cyr', 'zh': 'cjk', 'ja': 'kana|cjk', 'ko': 'hangul',
           'hi': 'deva', 'bn': 'beng', 'th': 'thai'}
_BRANDS = ('Zenrex', 'iPhone', 'Samsung', 'Galaxy', 'Huawei', 'Apple', 'POS', 'SAR', 'WhatsApp', 'Tamara', 'Tabby',
           'MacBook', 'iPad', 'AirPods', 'iMac', 'Xiaomi', 'Redmi', 'Dell', 'Lenovo', 'ThinkPad', 'HP', 'Sony',
           'Asus', 'Acer', 'Oppo', 'Honor', 'Nokia', 'PlayStation', 'Xbox', 'Nintendo', 'Anker', 'JBL', 'Beats')


def _clean_ok(target: str, text: str, source: str = '') -> bool:
    """True when the translation only uses scripts valid for the target language and,
    for non-Latin languages, actually contains the target script (unless it's a pure brand/model name)."""
    import re
    # Reject LLM chatter / meta replies instead of a translation.
    if re.search(r"(?i)\b(I need to|I'll translate|translate (it|this|TO)|here is the|translation:|Wait\b|I cannot|I can't|please provide)", text) \
            or re.search(r'ฉันพร้อม|我需要翻译|请提供', text):
        return False
    allowed = _ALLOWED.get(target, [])
    if any(re.search(rx, text) for name, rx in _SCRIPT_RX.items() if name not in allowed):
        return False
    native = _NATIVE.get(target)
    if target == 'ar' or native:
        # Non-Latin target: every Latin word must be a short code (M3, XPS, 128GB, USB-C) or the app name.
        bad = [w for w in re.findall(r'[A-Za-z0-9][A-Za-z0-9\-]*', text)
               if re.search(r'[A-Za-z]', w) and not re.search(r'\d', w) and not (w.replace('-', '').isupper() and len(w.replace('-', '')) <= 4)
               and w.lower() not in ('zenrex', 'store')]
        if bad:
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
    cache_only: bool = False


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
        # Declared Arabic source but no Arabic letters → already translated / brand / number: return as-is
        if req.source_lang == 'ar' and not _AR_RX.search(text):
            return {"translated": text, "source": "ar", "target": req.target_lang, "cached": True}

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
            ).with_model("anthropic", "claude-sonnet-4-6")
            resp = await chat.send_message(UserMessage(text=text))
            translated = (resp or "").strip()
            if translated.startswith('"') and translated.endswith('"'):
                translated = translated[1:-1]
            if not translated:
                translated = text
            if req.target_lang not in ('ar', 'ur', 'fa'):
                translated = translated.replace('ر.س', 'SAR')
            if not _clean_ok(req.target_lang, translated, text):
                retry = await chat.send_message(UserMessage(text=(
                    f"Your answer mixed scripts. Translate again, ONLY in {target_name} script — write brand and product-line "
                    f"names in {target_name} script too; only digit codes like M3 or 20K stay: {text}")))
                retry = (retry or '').strip().strip('"')
                if retry and _clean_ok(req.target_lang, retry, text):
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
            if (req.source_lang and req.source_lang == req.target_lang) or (req.source_lang == 'ar' and not _AR_RX.search(t)):
                results[raw] = t
                continue
            hit = await _cache_get(t, req.target_lang)
            if hit is not None:
                results[raw] = hit
            else:
                remaining.append(raw)

        if not remaining:
            return {"translations": results, "cached": True, "failed": []}
        if req.cache_only:  # fast phase: let the device show cached names instantly
            return {"translations": results, "cached": True, "failed": [], "missing": remaining}

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
        except Exception as e:
            raise HTTPException(500, f"Translation service unavailable: {e}")
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(500, "EMERGENT_LLM_KEY missing")

        CHUNK = 40

        strict_note = (
            f" STRICT: the previous attempt left Latin words. In {target_name} you MUST write every brand and product-line "
            f"name (MacBook, Pro, Max, iPhone, Watch, Anker, PowerCore...) in {target_name} script — e.g. Arabic 'ماك بوك برو 16 M3 ماكس', "
            "Chinese '苹果笔记本电脑 Pro 16 M3 Max' is WRONG — write '苹果笔记本电脑 专业版 16 M3 顶配版'; 'iPhone 15 Pro' → '苹果手机 15 专业版'; 'Samsung Galaxy S24 Ultra' → '三星盖乐世 S24 至尊版'; 'Huawei Mate 60 Pro' → '华为麦特 60 专业版'; "
            "Japanese 'アイフォーン 15 プロ'; Korean '아이폰 15 프로'. Only digit codes like M3, 16, 20K stay."
        )

        _GLOSS = {'zh': {'xiaomi': '小米', 'redmi': '红米', 'note': '笔记版', 'pro': '专业版', 'max': '顶配版', 'ultra': '至尊版',
                         'plus': '增强版', 'mini': '迷你版', 'air': '轻薄版', 'galaxy': '盖乐世', 'mate': '麦特', 'watch': '手表',
                         'iphone': '苹果手机', 'ipad': '苹果平板', 'macbook': '苹果笔记本电脑', 'airpods': '苹果无线耳机',
                         'apple': '苹果', 'samsung': '三星', 'huawei': '华为', 'honor': '荣耀', 'oppo': '欧珀', 'lenovo': '联想',
                         'dell': '戴尔', 'asus': '华硕', 'anker': '安克', 'sony': '索尼', 'magic': '魔术版', 'buds': '耳机'}}

        def _gloss_hint(line: str) -> str:
            g = _GLOSS.get(req.target_lang)
            if not g:
                return ''
            hits = {w: g[w.lower()] for w in re.findall(r'[A-Za-z]+', line) if w.lower() in g}
            return (" Use this glossary: " + ", ".join(f"{k}={v}" for k, v in hits.items()) + ".") if hits else ''

        async def run_chunk(batch: list, tag: str) -> list:
            """Translate one chunk; returns the items that failed validation."""
            numbered = "\n".join(f"{j + 1}. {s}" for j, s in enumerate(batch))
            done = set()
            try:
                chat = LlmChat(
                    api_key=api_key,
                    session_id=f"trb-{req.target_lang}-{tag}-{_hash(numbered)[:10]}",
                    system_message=(
                        f"You are a professional translator. Translate each numbered line into {target_name} "
                        f"(language code '{req.target_lang}'). Output MUST be written in {target_name}. "
                        "Return ONLY the translations in the same order, each on its own line, prefixed with the "
                        "same number and a dot. No explanations, no extra text, no quotes. " + _RULES
                        + (strict_note if tag.startswith('r') and (req.target_lang == 'ar' or req.target_lang in _NATIVE) else '')
                    ),
                ).with_model("anthropic", "claude-sonnet-4-6")
                resp = await chat.send_message(UserMessage(
                    text=f"Translate into {target_name} ({req.target_lang}) — write every line in {target_name}."
                         f"{_gloss_hint(numbered) if tag.startswith('rs') else ''}\n{numbered}"))
                for line in (resp or "").strip().split("\n"):
                    line = line.strip()
                    head, dot, tail = line.partition(".")
                    if not dot or not head.strip().isdigit():
                        continue
                    idx = int(head.strip()) - 1
                    if not (0 <= idx < len(batch)):
                        continue
                    tr = tail.strip().strip('"')
                    src = batch[idx]
                    if tr and _clean_ok(req.target_lang, tr, src):
                        results[src] = tr
                        done.add(idx)
                        await _cache_put(src.strip(), req.target_lang, tr, req.source_lang)
            except Exception as e:
                log.warning(f"bulk translate chunk failed: {e}")
            return [b for j, b in enumerate(batch) if j not in done]

        import asyncio as _asyncio
        chunks = [remaining[i:i + CHUNK] for i in range(0, len(remaining), CHUNK)]
        failed_lists = await _asyncio.gather(*[run_chunk(c, f"c{i}") for i, c in enumerate(chunks)])
        retry = [x for fl in failed_lists for x in fl]
        if retry:  # one retry for lines the model answered in the wrong language
            await _asyncio.gather(*[run_chunk(retry[i:i + 20], f"r{i}") for i in range(0, len(retry), 20)])
            last = [x for x in retry if x not in results][:60]
            if last:  # final pass: one line per request for the stubborn ones
                await _asyncio.gather(*[run_chunk([x], f"rs{i}") for i, x in enumerate(last)])
            # Last resort for Chinese: deterministic glossary substitution of brand/model words.
            g = _GLOSS.get(req.target_lang)
            for x in [x for x in last if x not in results] if (last and g) else []:
                sub = re.sub(r'[A-Za-z]+', lambda m: g.get(m.group(0).lower(), m.group(0)), x)
                sub = re.sub(r'(?<=[\u4e00-\u9fff]) (?=[\u4e00-\u9fff])', '', sub)
                if _clean_ok(req.target_lang, sub, x):
                    results[x] = sub
                    await _cache_put(x.strip(), req.target_lang, sub, req.source_lang)
        failed = [raw for raw in req.texts if raw not in results]

        # Fallback: any text we couldn't translate — return source
        for raw in req.texts:
            results.setdefault(raw, raw)

        return {"translations": results, "cached": False, "failed": failed}

    @router.get("/translate/rules")
    async def translate_rules():
        """Current translation-rules version — devices wipe their local cache when it changes."""
        return {"rules": _RULES_VERSION}

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
