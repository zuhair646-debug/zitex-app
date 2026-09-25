"""
Saudi Loyalty Programs adapter framework (single-tenant).
- Merchant enables/disables individual programs and enters legal + credential details.
- Customer sees only enabled programs and can authorize / earn / redeem.
- Actual API calls are STUBBED — merchant must complete legal partnership to activate real flows.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from bson import ObjectId


SAUDI_LOYALTY_PROGRAMS = [
    {
        "code": "qitaf", "name_ar": "قطاف", "name_en": "Qitaf",
        "logo": "🌾", "brand_color": "#8E1B3F", "operator": "stc",
        "type": "telco", "requires_otp": True,
        "description_ar": "برنامج ولاء STC — يكسب العميل نقاط قطاف على مشترياته",
        "legal_docs_required": ["عقد الشراكة مع STC", "شهادة السجل التجاري", "الإفصاح للنقاط"],
        "credential_fields": ["merchant_id", "api_key", "secret_key", "endpoint"],
        "conversion_rate": 0.01,   # 1 point ≈ 0.01 SAR (illustrative)
        "kb_url": "https://www.stc.com.sa/content/stc/sa/ar/personal/loyalty/qitaf.html",
    },
    {
        "code": "mokafaa", "name_ar": "مكافآت الراجحي", "name_en": "Mokafaa",
        "logo": "💎", "brand_color": "#00743E", "operator": "alrajhi",
        "type": "bank", "requires_otp": True,
        "description_ar": "برنامج مكافآت مصرف الراجحي — استبدال النقاط عند التاجر",
        "legal_docs_required": ["عقد الشراكة مع مصرف الراجحي", "السجل التجاري"],
        "credential_fields": ["client_id", "client_secret", "endpoint", "merchant_code"],
        "conversion_rate": 0.008,
        "kb_url": "https://www.mokafaa.com.sa/",
    },
    {
        "code": "alfursan", "name_ar": "الفرسان", "name_en": "AlFursan",
        "logo": "✈️", "brand_color": "#005EB8", "operator": "saudia",
        "type": "airline", "requires_otp": True,
        "description_ar": "برنامج الفرسان للخطوط السعودية — كسب أميال على المشتريات",
        "legal_docs_required": ["عقد شراكة الفرسان", "السجل التجاري"],
        "credential_fields": ["partner_id", "api_key", "endpoint"],
        "conversion_rate": 0.05,   # miles → SAR value
        "kb_url": "https://www.saudia.com/alfursan",
    },
    {
        "code": "white", "name_ar": "وايت بوينتس", "name_en": "White Points",
        "logo": "⚪", "brand_color": "#111827", "operator": "white",
        "type": "coalition", "requires_otp": False,
        "description_ar": "برنامج ولاء موحّد بين عدة تجار — نقاط قابلة للاستبدال",
        "legal_docs_required": ["عقد الشراكة مع وايت", "السجل التجاري"],
        "credential_fields": ["merchant_id", "api_key"],
        "conversion_rate": 0.05,
        "kb_url": "",
    },
    {
        "code": "riyad_rewards", "name_ar": "ريّاض ريواردز", "name_en": "Riyad Rewards",
        "logo": "🏦", "brand_color": "#003F7F", "operator": "riyadbank",
        "type": "bank", "requires_otp": True,
        "description_ar": "برنامج ولاء بنك الرياض",
        "legal_docs_required": ["عقد الشراكة مع بنك الرياض", "السجل التجاري"],
        "credential_fields": ["client_id", "client_secret", "endpoint"],
        "conversion_rate": 0.01,
        "kb_url": "https://www.riyadbank.com/",
    },
    {
        "code": "snb_wow", "name_ar": "برنامج WOW من الأهلي", "name_en": "SNB WOW",
        "logo": "🌟", "brand_color": "#00A651", "operator": "snb",
        "type": "bank", "requires_otp": True,
        "description_ar": "برنامج ولاء البنك الأهلي السعودي",
        "legal_docs_required": ["عقد الشراكة مع البنك الأهلي", "السجل التجاري"],
        "credential_fields": ["client_id", "client_secret"],
        "conversion_rate": 0.01,
        "kb_url": "",
    },
    {
        "code": "urpay_points", "name_ar": "نقاط urpay", "name_en": "urpay Points",
        "logo": "📲", "brand_color": "#1F5FDD", "operator": "urpay",
        "type": "wallet", "requires_otp": True,
        "description_ar": "برنامج ولاء محفظة urpay",
        "legal_docs_required": ["عقد الشراكة مع urpay", "السجل التجاري"],
        "credential_fields": ["merchant_id", "api_key"],
        "conversion_rate": 0.01,
        "kb_url": "",
    },
    {
        "code": "internal", "name_ar": "نقاط المتجر (داخلية)", "name_en": "Internal Store Points",
        "logo": "🏪", "brand_color": "#F5C518", "operator": "self",
        "type": "internal", "requires_otp": False, "auto_enabled": True,
        "description_ar": "نقاط ولاء داخلية للمتجر — لا تحتاج شراكة خارجية",
        "legal_docs_required": [],
        "credential_fields": [],
        "conversion_rate": 0.10,
        "kb_url": "",
    },
]


class ProgramConfigBody(BaseModel):
    enabled: bool
    credentials: Optional[dict] = None
    legal_docs: Optional[List[dict]] = None    # [{name, url, uploaded_at}]
    conversion_rate: Optional[float] = None
    merchant_note: str = ""


class AuthorizeBody(BaseModel):
    program_code: str
    member_id: str          # phone / customer number / membership id
    otp: Optional[str] = ""


class RedeemBody(BaseModel):
    program_code: str
    points: int
    order_id: Optional[str] = None
    otp: Optional[str] = ""


def build_router(db, get_current_user, require_merchant):
    router = APIRouter(prefix="/api")

    async def _ensure_seed():
        for p in SAUDI_LOYALTY_PROGRAMS:
            existing = await db.loyalty_programs.find_one({"code": p["code"]})
            if not existing:
                doc = {**p,
                       "enabled": bool(p.get("auto_enabled", False)),
                       "credentials": {},
                       "legal_docs": [],
                       "merchant_note": "",
                       "created_at": datetime.now(timezone.utc).isoformat()}
                await db.loyalty_programs.insert_one(doc)

    # ─── Merchant: list programs (all with metadata + config) ───
    @router.get("/merchant/loyalty/programs")
    async def merchant_list_programs(user=Depends(get_current_user)):
        require_merchant(user)
        await _ensure_seed()
        rows = await db.loyalty_programs.find({}).to_list(50)
        for r in rows:
            r["id"] = str(r.pop("_id"))
        return {"programs": rows}

    # ─── Merchant: update program config ───
    @router.put("/merchant/loyalty/programs/{code}")
    async def merchant_update_program(code: str, body: ProgramConfigBody, user=Depends(get_current_user)):
        require_merchant(user)
        await _ensure_seed()
        prog = await db.loyalty_programs.find_one({"code": code})
        if not prog:
            raise HTTPException(404, "Program not found")

        update = {"enabled": bool(body.enabled), "merchant_note": body.merchant_note,
                  "updated_at": datetime.now(timezone.utc).isoformat()}
        if body.credentials is not None:
            update["credentials"] = body.credentials
        if body.legal_docs is not None:
            update["legal_docs"] = body.legal_docs
        if body.conversion_rate is not None:
            update["conversion_rate"] = float(body.conversion_rate)

        # Enabling without legal docs is allowed (marked as pending in UI)
        await db.loyalty_programs.update_one({"code": code}, {"$set": update})

        # If enabling & credentials empty → mark as "sandbox_pending"
        if body.enabled and not update.get("credentials"):
            await db.loyalty_programs.update_one({"code": code}, {"$set": {"status": "sandbox_pending"}})
        elif body.enabled:
            await db.loyalty_programs.update_one({"code": code}, {"$set": {"status": "ready"}})
        else:
            await db.loyalty_programs.update_one({"code": code}, {"$set": {"status": "disabled"}})

        return {"code": code, "enabled": body.enabled}

    # ─── Customer: list available (enabled) programs ───
    @router.get("/loyalty/available")
    async def list_available(user=Depends(get_current_user)):
        await _ensure_seed()
        rows = await db.loyalty_programs.find({"enabled": True}).to_list(50)
        for r in rows:
            r["id"] = str(r.pop("_id"))
            # Don't leak credentials to customers
            r.pop("credentials", None)
        return {"programs": rows}

    # ─── Customer: authorize (link membership) ───
    @router.post("/loyalty/authorize")
    async def authorize(body: AuthorizeBody, user=Depends(get_current_user)):
        prog = await db.loyalty_programs.find_one({"code": body.program_code, "enabled": True})
        if not prog:
            raise HTTPException(400, "البرنامج غير مفعّل")
        uid = str(user.get("id") or user.get("_id"))
        # NOTE: STUBBED — real integration would call the program API with OTP
        member_ref = {
            "user_id": uid, "program_code": body.program_code,
            "member_id": body.member_id, "status": "linked",
            "linked_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.loyalty_memberships.update_one(
            {"user_id": uid, "program_code": body.program_code},
            {"$set": member_ref}, upsert=True,
        )
        return {"status": "linked", "program": body.program_code, "member_id": body.member_id[-4:].rjust(len(body.member_id), "*")}

    # ─── Customer: my memberships ───
    @router.get("/my/loyalty/memberships")
    async def my_memberships(user=Depends(get_current_user)):
        uid = str(user.get("id") or user.get("_id"))
        rows = await db.loyalty_memberships.find({"user_id": uid}).to_list(50)
        for r in rows:
            r["id"] = str(r.pop("_id"))
            # Mask member id
            mid = r.get("member_id", "")
            if len(mid) > 4:
                r["member_id_masked"] = "•" * (len(mid) - 4) + mid[-4:]
            else:
                r["member_id_masked"] = mid
            r.pop("member_id", None)
        return {"memberships": rows}

    # ─── Customer: redeem points (stub) ───
    @router.post("/loyalty/programs/{program_code}/redeem")
    async def redeem(program_code: str, body: RedeemBody, user=Depends(get_current_user)):
        prog = await db.loyalty_programs.find_one({"code": program_code, "enabled": True})
        if not prog:
            raise HTTPException(400, "البرنامج غير مفعّل")
        uid = str(user.get("id") or user.get("_id"))
        rate = float(prog.get("conversion_rate", 0.01))
        discount = round(body.points * rate, 2)

        # Record transaction (STUB — no real API call)
        await db.loyalty_transactions.insert_one({
            "user_id": uid, "program_code": program_code,
            "points": -int(body.points), "kind": "redeem", "source": "external_program",
            "ref_id": body.order_id or "",
            "description": f"استبدال {body.points} نقطة {prog.get('name_ar')} بخصم {discount} ر.س",
            "balance_after": 0,   # external — not tracked internally
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "simulated",   # marker so merchant knows this is stub
        })
        return {"discount_sar": discount, "status": "simulated", "message": "تم تسجيل الاستبدال (وضع الاختبار)"}

    return router
