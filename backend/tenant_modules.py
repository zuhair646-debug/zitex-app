"""
Feature Modules Toggle system (single-tenant).
- List every optional module in the app.
- Merchant enables/disables from a single "Services Catalog" screen.
- Frontend reads /api/tenant/modules to hide/show routes and menus.

We DO NOT enforce toggles server-side on protected routes (business logic keeps running);
we return them for the frontend to hide navigation entries. This keeps the app clonable —
copy the repo, flip flags, brand and go.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone


APP_MODULES = [
    # code, name_ar, icon, category, default_enabled
    {"code": "products",     "name_ar": "المتجر (المنتجات)",       "icon": "cart",       "category": "core",     "default": True,  "description_ar": "عرض وبيع المنتجات"},
    {"code": "services",     "name_ar": "الخدمات (الصيانة)",       "icon": "construct",  "category": "core",     "default": True,  "description_ar": "خدمات الصيانة والدعم الفني"},
    {"code": "competitions", "name_ar": "المسابقات والقرعات",      "icon": "trophy",     "category": "engagement","default": True,  "description_ar": "قرعات مجانية ومسابقات"},
    {"code": "social_feed",  "name_ar": "الحائط الاجتماعي",         "icon": "chatbubbles","category": "engagement","default": True,  "description_ar": "منشورات، صور، فيديوهات وتفاعل"},
    {"code": "wallet",       "name_ar": "المحفظة",                 "icon": "wallet",     "category": "core",     "default": True,  "description_ar": "رصيد داخلي للعملاء"},
    {"code": "loyalty",      "name_ar": "نقاط الولاء الداخلية",    "icon": "medal",      "category": "engagement","default": True,  "description_ar": "نظام نقاط داخلي"},
    {"code": "external_loyalty","name_ar": "برامج ولاء خارجية",     "icon": "ribbon",     "category": "integration","default": False,"description_ar": "قطاف، مكافآت، الفرسان..."},
    {"code": "delivery",     "name_ar": "التوصيل الداخلي",         "icon": "bicycle",    "category": "logistics","default": True,  "description_ar": "أسطول التاجر الخاص"},
    {"code": "external_shipping","name_ar": "شحن خارجي (شركات)",    "icon": "airplane",   "category": "logistics","default": True,  "description_ar": "SMSA / أرامكس / سبل..."},
    {"code": "returns",      "name_ar": "الإرجاع والضمان",         "icon": "return-up-back","category": "service", "default": True,  "description_ar": "طلبات الإرجاع والاستبدال"},
    {"code": "chamber",      "name_ar": "غرفة التجارة",             "icon": "business",   "category": "b2b",      "default": False, "description_ar": "بوابة الغرفة التجارية والشركات"},
    {"code": "affiliate",    "name_ar": "المسوّقون بالعمولة",      "icon": "people",     "category": "growth",   "default": True,  "description_ar": "عمولات على البيع"},
    {"code": "referrals",    "name_ar": "دعوة الأصدقاء",           "icon": "gift",       "category": "growth",   "default": True,  "description_ar": "مكافآت الدعوة"},
    {"code": "support",      "name_ar": "الدعم الفني (تذاكر)",     "icon": "help-buoy",  "category": "service",  "default": True,  "description_ar": "تذاكر الدعم للعملاء"},
    {"code": "live_preview", "name_ar": "البث المباشر للتاجر",    "icon": "eye",        "category": "analytics","default": True,  "description_ar": "لوحة تحليلات وتتبع لحظي"},
    {"code": "analytics",    "name_ar": "التحليلات المتقدمة",       "icon": "stats-chart","category": "analytics","default": True,  "description_ar": "رسوم بيانية وتقارير"},
    {"code": "branches",     "name_ar": "الفروع",                  "icon": "storefront", "category": "core",     "default": True,  "description_ar": "إدارة فروع متعددة"},
    {"code": "drivers",      "name_ar": "السائقون",                "icon": "car",        "category": "logistics","default": True,  "description_ar": "إدارة الأسطول والسائقين"},
    {"code": "employees",    "name_ar": "الموظفون والصلاحيات",    "icon": "person",     "category": "core",     "default": True,  "description_ar": "إدارة الموظفين"},
    {"code": "reviews",      "name_ar": "التقييمات والمراجعات",   "icon": "star",       "category": "engagement","default": True,  "description_ar": "مراجعات العملاء"},
    {"code": "pos",          "name_ar": "نقطة البيع (POS)",         "icon": "calculator", "category": "core",     "default": True,  "description_ar": "بيع داخل المتجر"},
]


class ModuleToggleBody(BaseModel):
    enabled: bool


def build_router(db, get_current_user, require_merchant):
    router = APIRouter(prefix="/api")

    async def _ensure_seed():
        existing = {m["code"] for m in await db.tenant_modules.find({}).to_list(200)}
        for m in APP_MODULES:
            if m["code"] not in existing:
                await db.tenant_modules.insert_one({
                    **m, "enabled": m["default"],
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

    # ─── Public: modules state (used by frontend to hide/show UI) ───
    @router.get("/tenant/modules")
    async def public_modules():
        await _ensure_seed()
        rows = await db.tenant_modules.find({}).to_list(200)
        # Return simple mapping code → enabled
        enabled_map = {r["code"]: bool(r.get("enabled", r.get("default", True))) for r in rows}
        return {"modules": enabled_map}

    # ─── Merchant: full modules catalog ───
    @router.get("/merchant/modules")
    async def merchant_modules(user=Depends(get_current_user)):
        require_merchant(user)
        await _ensure_seed()
        rows = await db.tenant_modules.find({}).to_list(200)
        for r in rows:
            r["id"] = str(r.pop("_id"))
        # group by category
        cats = {}
        for r in rows:
            c = r.get("category", "core")
            cats.setdefault(c, []).append(r)
        # ordered
        order = ["core", "engagement", "logistics", "service", "growth", "b2b", "analytics", "integration"]
        grouped = [{"category": c, "modules": cats.get(c, [])} for c in order if c in cats]
        return {"grouped": grouped, "flat": rows}

    @router.put("/merchant/modules/{code}")
    async def toggle_module(code: str, body: ModuleToggleBody, user=Depends(get_current_user)):
        require_merchant(user)
        await _ensure_seed()
        r = await db.tenant_modules.update_one({"code": code}, {"$set": {"enabled": bool(body.enabled), "updated_at": datetime.now(timezone.utc).isoformat()}})
        if r.matched_count == 0:
            raise HTTPException(404, "Module not found")
        return {"code": code, "enabled": body.enabled}

    return router
