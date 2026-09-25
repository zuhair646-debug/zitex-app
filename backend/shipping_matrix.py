"""
Shipping Coverage Matrix module (single-tenant).
- Merchant defines rules: which carrier serves which city, from which branch.
- Rules include: priority, service level, weight limits, fallback base+per_kg pricing.
- Customer checkout uses these rules + destination (lat/lng/city/postal) to compute options.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from bson import ObjectId

# Saudi major cities normalized keys (matches customer checkout dropdowns)
SAUDI_CITIES = [
    {"code": "riyadh",   "name_ar": "الرياض",     "region": "central"},
    {"code": "jeddah",   "name_ar": "جدة",        "region": "western"},
    {"code": "makkah",   "name_ar": "مكة المكرمة", "region": "western"},
    {"code": "madinah",  "name_ar": "المدينة المنورة", "region": "western"},
    {"code": "dammam",   "name_ar": "الدمام",      "region": "eastern"},
    {"code": "khobar",   "name_ar": "الخبر",       "region": "eastern"},
    {"code": "dhahran",  "name_ar": "الظهران",     "region": "eastern"},
    {"code": "taif",     "name_ar": "الطائف",      "region": "western"},
    {"code": "tabuk",    "name_ar": "تبوك",        "region": "northern"},
    {"code": "abha",     "name_ar": "أبها",        "region": "southern"},
    {"code": "khamis",   "name_ar": "خميس مشيط",   "region": "southern"},
    {"code": "hail",     "name_ar": "حائل",        "region": "northern"},
    {"code": "jazan",    "name_ar": "جازان",       "region": "southern"},
    {"code": "najran",   "name_ar": "نجران",       "region": "southern"},
    {"code": "buraydah", "name_ar": "بريدة",       "region": "central"},
    {"code": "unaizah",  "name_ar": "عنيزة",       "region": "central"},
    {"code": "hafr",     "name_ar": "حفر الباطن",  "region": "eastern"},
    {"code": "arar",     "name_ar": "عرعر",        "region": "northern"},
    {"code": "jubail",   "name_ar": "الجبيل",      "region": "eastern"},
    {"code": "yanbu",    "name_ar": "ينبع",        "region": "western"},
]

# Simple city center coordinates for lat/lng → city inference (fallback when postal/city missing)
CITY_CENTERS = {
    "riyadh":   (24.7136, 46.6753),
    "jeddah":   (21.4858, 39.1925),
    "makkah":   (21.3891, 39.8579),
    "madinah":  (24.4686, 39.6142),
    "dammam":   (26.4207, 50.0888),
    "khobar":   (26.2172, 50.1971),
    "dhahran":  (26.2361, 50.0393),
    "taif":     (21.2854, 40.4183),
    "tabuk":    (28.3835, 36.5662),
    "abha":     (18.2164, 42.5053),
    "khamis":   (18.3060, 42.7290),
    "hail":     (27.5219, 41.6906),
    "jazan":    (16.8892, 42.5511),
    "najran":   (17.4917, 44.1277),
    "buraydah": (26.3260, 43.9750),
    "unaizah":  (26.0906, 43.9930),
    "hafr":     (28.4326, 45.9636),
    "arar":     (30.9753, 41.0381),
    "jubail":   (27.0174, 49.6225),
    "yanbu":    (24.0895, 38.0618),
}


def haversine_km(lat1, lon1, lat2, lon2):
    import math
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def infer_city_from_coords(lat: float, lng: float) -> Optional[str]:
    if not lat or not lng:
        return None
    best = None
    best_d = 999999
    for code, (clat, clng) in CITY_CENTERS.items():
        d = haversine_km(lat, lng, clat, clng)
        if d < best_d:
            best_d = d
            best = code
    # Only accept if within 150km of a known center
    return best if best_d <= 150 else None


class ShippingRule(BaseModel):
    carrier_code: str
    branch_id: str = ""          # empty = applies to all branches
    city_code: str = ""          # empty = applies to all cities
    enabled: bool = True
    priority: int = 5            # lower = higher priority in checkout
    service_level: str = "standard"  # "standard" | "express" | "same_day"
    base_price: float = 25.0     # fallback SAR
    per_kg_price: float = 5.0
    included_kg: float = 1.0
    min_days: int = 1
    max_days: int = 3
    max_weight_kg: float = 30.0
    cod_supported: bool = True
    notes: str = ""


class ShippingMatrixSave(BaseModel):
    rules: List[ShippingRule]


class QuoteRequest(BaseModel):
    branch_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    city_code: Optional[str] = None
    postal_code: Optional[str] = None
    weight_kg: float = 1.0
    cod: bool = False


def build_router(db, get_current_user, require_merchant):
    router = APIRouter(prefix="/api")

    async def _seed_defaults():
        """Seed a few sensible default rules on first access."""
        existing = await db.shipping_matrix.count_documents({})
        if existing > 0:
            return
        # Fetch main branch
        main_branch = await db.branches.find_one({"is_main": True})
        main_bid = str(main_branch["_id"]) if main_branch else ""
        defaults = [
            # SMSA — domestic all cities
            {"carrier_code": "smsa", "branch_id": "", "city_code": "", "enabled": True,
             "priority": 3, "service_level": "standard", "base_price": 25.0,
             "per_kg_price": 5.0, "included_kg": 1.0, "min_days": 1, "max_days": 3,
             "max_weight_kg": 30, "cod_supported": True, "notes": ""},
            # Aramex — domestic + international
            {"carrier_code": "aramex", "branch_id": "", "city_code": "", "enabled": True,
             "priority": 5, "service_level": "standard", "base_price": 30.0,
             "per_kg_price": 6.0, "included_kg": 1.0, "min_days": 1, "max_days": 4,
             "max_weight_kg": 25, "cod_supported": True, "notes": ""},
            # Saudi Post — cheapest, slower
            {"carrier_code": "saudi_post", "branch_id": "", "city_code": "", "enabled": True,
             "priority": 8, "service_level": "standard", "base_price": 15.0,
             "per_kg_price": 3.0, "included_kg": 1.0, "min_days": 2, "max_days": 5,
             "max_weight_kg": 20, "cod_supported": True, "notes": ""},
        ]
        for r in defaults:
            r.update({
                "created_at": datetime.now(timezone.utc).isoformat(),
                "main_branch_hint": main_bid,
            })
            await db.shipping_matrix.insert_one(r)

    # ─── Merchant: cities catalog ───
    @router.get("/merchant/shipping/cities")
    async def list_cities(user=Depends(get_current_user)):
        require_merchant(user)
        return {"cities": SAUDI_CITIES}

    # ─── Merchant: read matrix ───
    @router.get("/merchant/shipping/matrix")
    async def get_matrix(user=Depends(get_current_user)):
        require_merchant(user)
        await _seed_defaults()
        rules = await db.shipping_matrix.find({}).sort("priority", 1).to_list(500)
        for r in rules:
            r["id"] = str(r.pop("_id"))
            r.pop("main_branch_hint", None)
        return {"rules": rules, "cities": SAUDI_CITIES}

    # ─── Merchant: add or update a rule ───
    @router.post("/merchant/shipping/matrix")
    async def create_rule(rule: ShippingRule, user=Depends(get_current_user)):
        require_merchant(user)
        doc = rule.model_dump()
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        r = await db.shipping_matrix.insert_one(doc)
        return {"id": str(r.inserted_id), "message": "Rule created"}

    @router.put("/merchant/shipping/matrix/{rule_id}")
    async def update_rule(rule_id: str, rule: ShippingRule, user=Depends(get_current_user)):
        require_merchant(user)
        try:
            oid = ObjectId(rule_id)
        except Exception:
            raise HTTPException(400, "Invalid rule id")
        r = await db.shipping_matrix.update_one({"_id": oid}, {"$set": rule.model_dump()})
        if r.matched_count == 0:
            raise HTTPException(404, "Rule not found")
        return {"message": "Rule updated"}

    @router.delete("/merchant/shipping/matrix/{rule_id}")
    async def delete_rule(rule_id: str, user=Depends(get_current_user)):
        require_merchant(user)
        try:
            oid = ObjectId(rule_id)
        except Exception:
            raise HTTPException(400, "Invalid rule id")
        r = await db.shipping_matrix.delete_one({"_id": oid})
        if r.deleted_count == 0:
            raise HTTPException(404, "Rule not found")
        return {"message": "Rule deleted"}

    # ─── Merchant: bulk save ───
    @router.put("/merchant/shipping/matrix")
    async def bulk_save(body: ShippingMatrixSave, user=Depends(get_current_user)):
        require_merchant(user)
        await db.shipping_matrix.delete_many({})
        for r in body.rules:
            d = r.model_dump()
            d["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.shipping_matrix.insert_one(d)
        return {"saved": len(body.rules)}

    # ─── Customer: shipping options for a destination ───
    @router.post("/checkout/shipping-options")
    async def shipping_options(req: QuoteRequest, user=Depends(get_current_user)):
        """Live-compute available shipping options for the customer's destination.
        Reads merchant shipping_matrix rules + carrier metadata + branch selection.
        """
        await _seed_defaults()

        # 1. Infer city if not provided
        city_code = (req.city_code or "").lower().strip()
        if not city_code and req.lat and req.lng:
            city_code = infer_city_from_coords(req.lat, req.lng) or ""

        # 2. Load matching rules — priority order:
        #    (a) rules matching both branch AND city
        #    (b) rules matching city (any branch)
        #    (c) rules matching branch (any city)
        #    (d) global rules (both empty)
        branch_id = req.branch_id or ""

        all_rules = await db.shipping_matrix.find({"enabled": True}).sort("priority", 1).to_list(500)

        # 3. Deduplicate per carrier, most-specific wins
        chosen: dict = {}  # carrier_code -> (specificity, rule)
        for r in all_rules:
            match_score = 0
            if r.get("branch_id") == branch_id and r.get("city_code") == city_code and branch_id and city_code:
                match_score = 4
            elif r.get("city_code") == city_code and city_code and not r.get("branch_id"):
                match_score = 3
            elif r.get("branch_id") == branch_id and branch_id and not r.get("city_code"):
                match_score = 2
            elif not r.get("branch_id") and not r.get("city_code"):
                match_score = 1
            else:
                continue

            # Weight limit
            if r.get("max_weight_kg", 30) < req.weight_kg:
                continue
            # COD support
            if req.cod and not r.get("cod_supported", True):
                continue

            cc = r["carrier_code"]
            if cc not in chosen or chosen[cc][0] < match_score:
                chosen[cc] = (match_score, r)

        # 4. Fetch merchant_settings for carrier metadata (name/logo/color)
        settings = await db.merchant_settings.find_one({"key": "global"}) or {}
        carrier_meta = {p["code"]: p for p in settings.get("shipping_providers", [])}

        # 5. Build response
        options = []
        for cc, (_, rule) in chosen.items():
            meta = carrier_meta.get(cc, {})
            # Skip carriers globally disabled in merchant_settings
            if meta and not meta.get("enabled", True):
                continue
            # Compute price
            over_kg = max(0.0, req.weight_kg - rule.get("included_kg", 1.0))
            price = rule.get("base_price", 25) + over_kg * rule.get("per_kg_price", 5)
            options.append({
                "carrier_code": cc,
                "name_ar": meta.get("name_ar", cc),
                "name_en": meta.get("name_en", cc),
                "logo": meta.get("logo", "📦"),
                "brand_color": meta.get("brand_color", "#0EA5E9"),
                "service_level": rule.get("service_level", "standard"),
                "price_sar": round(price, 2),
                "min_days": rule.get("min_days", 1),
                "max_days": rule.get("max_days", 3),
                "eta_days": f"{rule.get('min_days',1)}-{rule.get('max_days',3)}",
                "cod_supported": rule.get("cod_supported", True),
                "notes": rule.get("notes", ""),
                "priority": rule.get("priority", 5),
            })

        options.sort(key=lambda x: (x["priority"], x["price_sar"]))

        return {
            "destination": {
                "city_code": city_code,
                "city_name_ar": next((c["name_ar"] for c in SAUDI_CITIES if c["code"] == city_code), ""),
                "postal_code": req.postal_code or "",
                "lat": req.lat, "lng": req.lng,
                "inferred": bool(req.lat and req.lng and not req.city_code),
            },
            "branch_id": branch_id,
            "weight_kg": req.weight_kg,
            "options": options,
            "count": len(options),
        }

    return router
