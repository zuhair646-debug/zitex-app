from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import secrets
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional
import re

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'techstore')]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── Helpers ───
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def serialize_doc(doc):
    if doc is None:
        return None
    doc["id"] = str(doc.pop("_id"))
    return doc

def serialize_docs(docs):
    return [serialize_doc(d) for d in docs if d is not None]

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    else:
        # Fallback: allow token in query string (for browser-opened endpoints like PDF export)
        token = request.query_params.get("token", "")
        if not token:
            raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user.pop("_id"))
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

# ─── Models ───
class RegisterInput(BaseModel):
    phone: str
    password: str
    name: str

class LoginInput(BaseModel):
    phone: str
    password: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    gender: Optional[str] = None

class CartItemInput(BaseModel):
    product_id: str
    quantity: int = 1
    color: Optional[str] = None
    storage: Optional[str] = None

class OrderInput(BaseModel):
    address: str
    phone: str
    delivery_type: str = "standard"  # standard | same_day | scheduled
    payment_method: str = "cash"
    notes: Optional[str] = None
    coupon_code: Optional[str] = None
    dest_lat: Optional[float] = None
    dest_lng: Optional[float] = None
    branch_id: Optional[str] = None
    branch_lat: Optional[float] = None
    branch_lng: Optional[float] = None
    scheduled_slot: Optional[dict] = None  # {label, start, end}
    referral_code: Optional[str] = None    # affiliate/marketer referral code

# ─── Auth Routes ───
@api_router.post("/auth/register")
async def register(data: RegisterInput):
    existing = await db.users.find_one({"phone": data.phone})
    if existing:
        raise HTTPException(status_code=400, detail="رقم الهاتف مسجل مسبقاً")
    user_doc = {
        "phone": data.phone,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "email": "",
        "city": "",
        "gender": "",
        "role": "user",
        "points": 0,
        "wallet_balance": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_doc["id"] = str(result.inserted_id)
    user_doc.pop("_id", None)
    user_doc.pop("password_hash")
    token = create_access_token(user_doc["id"])
    return {"user": user_doc, "token": token}

@api_router.post("/auth/login")
async def login(data: LoginInput):
    phone = (data.phone or "").strip()
    password = (data.password or "").strip()
    user = await db.users.find_one({"phone": phone})
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="رقم الهاتف أو كلمة المرور غير صحيحة")
    user["id"] = str(user.pop("_id"))
    user.pop("password_hash")
    token = create_access_token(user["id"])
    return {"user": user, "token": token}

@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {"user": user}

# ─── Categories ───
@api_router.get("/categories")
async def get_categories():
    cats = await db.categories.find({"published": True}).to_list(100)
    return [serialize_doc(c) for c in cats]

# ─── Brands ───
@api_router.get("/brands")
async def get_brands():
    brands = await db.brands.find({"published": True}).to_list(100)
    return [serialize_doc(b) for b in brands]

# ─── Products ───
@api_router.get("/products")
async def get_products(category: Optional[str] = None, brand: Optional[str] = None,
                       search: Optional[str] = None, min_price: Optional[float] = None,
                       max_price: Optional[float] = None, condition: Optional[str] = None,
                       sort: Optional[str] = "newest", page: int = 1, limit: int = 20):
    query = {"published": True}
    if category:
        query["category_id"] = category
    if brand:
        query["brand_id"] = brand
    if condition:
        # "used" matches any used variant (used, used_3months, used_6months, etc.)
        if condition == "used":
            query["condition"] = {"$regex": "^used", "$options": "i"}
        elif condition == "new":
            query["condition"] = "new"
        else:
            query["condition"] = condition
    if search:
        query["$or"] = [
            {"name_ar": {"$regex": search, "$options": "i"}},
            {"name_en": {"$regex": search, "$options": "i"}}
        ]
    if min_price is not None or max_price is not None:
        price_q = {}
        if min_price is not None:
            price_q["$gte"] = min_price
        if max_price is not None:
            price_q["$lte"] = max_price
        query["price"] = price_q

    sort_field = {"newest": [("created_at", -1)], "oldest": [("created_at", 1)],
                  "price_asc": [("price", 1)], "price_desc": [("price", -1)],
                  "popular": [("sold_count", -1)]}.get(sort, [("created_at", -1)])

    skip = (page - 1) * limit
    products = await db.products.find(query).sort(sort_field).skip(skip).limit(limit).to_list(limit)
    total = await db.products.count_documents(query)
    return {"products": [serialize_doc(p) for p in products], "total": total, "page": page, "pages": (total + limit - 1) // limit}

@api_router.get("/products/featured")
async def get_featured_products():
    products = await db.products.find({"published": True, "featured": True}).limit(10).to_list(10)
    return [serialize_doc(p) for p in products]

@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    product = await db.products.find_one({"_id": ObjectId(product_id)})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    return serialize_doc(product)

# ─── Cart ───
@api_router.get("/cart")
async def get_cart(user=Depends(get_current_user)):
    items = await db.cart_items.find({"user_id": user["id"]}).to_list(100)
    result = []
    for item in items:
        product = await db.products.find_one({"_id": ObjectId(item["product_id"])})
        item_data = serialize_doc(item)
        if product:
            item_data["product"] = serialize_doc(product)
        result.append(item_data)
    return result

@api_router.post("/cart")
async def add_to_cart(data: CartItemInput, user=Depends(get_current_user)):
    existing = await db.cart_items.find_one({
        "user_id": user["id"], "product_id": data.product_id,
        "color": data.color, "storage": data.storage
    })
    if existing:
        await db.cart_items.update_one({"_id": existing["_id"]}, {"$inc": {"quantity": data.quantity}})
    else:
        await db.cart_items.insert_one({
            "user_id": user["id"], "product_id": data.product_id,
            "quantity": data.quantity, "color": data.color, "storage": data.storage,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    return {"message": "تمت الإضافة إلى السلة"}

@api_router.put("/cart/{item_id}")
async def update_cart_item(item_id: str, quantity: int, user=Depends(get_current_user)):
    if quantity <= 0:
        await db.cart_items.delete_one({"_id": ObjectId(item_id), "user_id": user["id"]})
    else:
        await db.cart_items.update_one({"_id": ObjectId(item_id), "user_id": user["id"]}, {"$set": {"quantity": quantity}})
    return {"message": "Updated"}

# ─── Competitions ───
@api_router.get("/competitions")
async def get_competitions():
    # Show all open competitions (approval workflow removed - merchant decides directly)
    comps = await db.competitions.find({"status": "open"}).sort("created_at", -1).to_list(50)
    return [serialize_doc(c) for c in comps]

@api_router.get("/competitions/live-summary")
async def competitions_live_summary():
    """Real-time snapshot for Live Preview: active + ended competitions with countdowns."""
    from datetime import datetime as _dt
    now_iso = _dt.now(timezone.utc).isoformat()
    all_comps = await db.competitions.find({}).sort("created_at", -1).to_list(200)
    summary = []
    for c in all_comps:
        c = serialize_doc(c)
        starts_at = c.get("starts_at") or c.get("created_at", "")
        ends_at = c.get("ends_at") or c.get("draw_at", "")
        remaining_ms = None
        if ends_at:
            try:
                remaining_ms = max(0, int((_dt.fromisoformat(ends_at.replace('Z', '+00:00')) - _dt.now(timezone.utc)).total_seconds() * 1000))
            except Exception:
                remaining_ms = None
        # Live status
        status = c.get("status", "open")
        if status == "open" and ends_at and remaining_ms == 0:
            status = "ended"
        winners = c.get("winners") or []
        summary.append({
            "id": c["id"],
            "title": c.get("title", ""),
            "prize": c.get("prize", ""),
            "prize_count": c.get("prize_count", 1),
            "competition_type": c.get("competition_type", "general"),
            "starts_at": starts_at, "ends_at": ends_at,
            "remaining_ms": remaining_ms,
            "joined_count": c.get("joined_count", 0),
            "winners": winners,
            "status": status,
            "image": c.get("image", ""),
        })
    return {"generated_at": now_iso, "competitions": summary}

@api_router.get("/competitions/{comp_id}")
async def get_competition(comp_id: str):
    comp = await db.competitions.find_one({"_id": ObjectId(comp_id)})
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    return serialize_doc(comp)

@api_router.post("/competitions/{comp_id}/join")
async def join_competition(comp_id: str, user=Depends(get_current_user)):
    comp = await db.competitions.find_one({"_id": ObjectId(comp_id)})
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    # Only signup / general competitions can be joined directly. Others require
    # answering a QA, hitting a purchase threshold, or submitting a UGC video.
    ctype = comp.get("competition_type", "general")
    if ctype not in ("signup", "general"):
        raise HTTPException(status_code=400, detail="هذي المسابقة لا تدعم الانضمام المباشر")
    existing = await db.competition_entries.find_one({"competition_id": comp_id, "user_id": user["id"]})
    if existing:
        # graceful — return success instead of hard 400
        return {"message": "أنت مشترك بالفعل", "already": True}
    await db.competition_entries.insert_one({
        "competition_id": comp_id, "user_id": user["id"], "user_name": user["name"],
        "user_phone": user["phone"], "joined_at": datetime.now(timezone.utc).isoformat()
    })
    await db.competitions.update_one({"_id": ObjectId(comp_id)}, {"$inc": {"joined_count": 1}})
    return {"message": "Joined successfully"}

@api_router.get("/competitions/{comp_id}/participants")
async def get_participants(comp_id: str):
    entries = await db.competition_entries.find({"competition_id": comp_id}).to_list(1000)
    return [serialize_doc(e) for e in entries]

@api_router.post("/competitions/{comp_id}/draw")
async def do_draw(comp_id: str):
    import random
    comp = await db.competitions.find_one({"_id": ObjectId(comp_id)})
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    entries = await db.competition_entries.find({"competition_id": comp_id}).to_list(1000)
    if len(entries) < 1:
        raise HTTPException(status_code=400, detail="Not enough participants")
    prize_count = comp.get("prize_count", 1)
    winners = random.sample(entries, min(prize_count, len(entries)))
    winner_list = []
    for w in winners:
        winner_list.append({"user_id": w["user_id"], "user_name": w["user_name"], "user_phone": w["user_phone"]})
    draw_record = {
        "competition_id": comp_id, "draw_number": len(comp.get("draw_history", [])) + 1,
        "winners": winner_list, "drawn_at": datetime.now(timezone.utc).isoformat(),
        "drawn_by": "system"
    }
    await db.competitions.update_one({"_id": ObjectId(comp_id)}, {
        "$set": {"winners": winner_list, "status": "ended"},
        "$push": {"draw_history": draw_record}
    })
    return {"winners": winner_list, "draw_number": draw_record["draw_number"]}

# ─── Chamber Draw (with auth tracking) ───
@api_router.post("/chamber/competitions/{comp_id}/draw")
async def chamber_draw(comp_id: str, user=Depends(get_current_user)):
    if user.get("role") != "chamber":
        raise HTTPException(status_code=403, detail="Chamber access only")
    import random
    comp = await db.competitions.find_one({"_id": ObjectId(comp_id)})
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    entries = await db.competition_entries.find({"competition_id": comp_id}).to_list(1000)
    if len(entries) < 1:
        raise HTTPException(status_code=400, detail="Not enough participants")
    prize_count = comp.get("prize_count", 1)
    winners = random.sample(entries, min(prize_count, len(entries)))
    winner_list = []
    for w in winners:
        winner_list.append({"user_id": w["user_id"], "user_name": w["user_name"], "user_phone": w["user_phone"]})
    draw_record = {
        "competition_id": comp_id, "draw_number": len(comp.get("draw_history", [])) + 1,
        "winners": winner_list, "drawn_at": datetime.now(timezone.utc).isoformat(),
        "drawn_by": user["name"], "drawn_by_role": "chamber"
    }
    await db.competitions.update_one({"_id": ObjectId(comp_id)}, {
        "$set": {"winners": winner_list},
        "$push": {"draw_history": draw_record}
    })
    return {"winners": winner_list, "draw_number": draw_record["draw_number"], "drawn_by": user["name"]}

@api_router.get("/chamber/competitions")
async def chamber_get_competitions(user=Depends(get_current_user)):
    if user.get("role") != "chamber":
        raise HTTPException(status_code=403, detail="Chamber access only")
    comps = await db.competitions.find({}).sort("created_at", -1).to_list(50)
    result = []
    for c in comps:
        c["id"] = str(c.pop("_id"))
        entries_count = await db.competition_entries.count_documents({"competition_id": c["id"]})
        c["total_participants"] = entries_count
        result.append(c)
    return result

@api_router.get("/chamber/competitions/{comp_id}/full")
async def chamber_competition_full(comp_id: str, user=Depends(get_current_user)):
    if user.get("role") != "chamber":
        raise HTTPException(status_code=403, detail="Chamber access only")
    comp = await db.competitions.find_one({"_id": ObjectId(comp_id)})
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    comp["id"] = str(comp.pop("_id"))
    entries = await db.competition_entries.find({"competition_id": comp_id}).to_list(1000)
    comp["participants"] = [serialize_doc(e) for e in entries]
    return comp

# Note: legacy answer_quiz handler removed. The active QA handler is defined at
# /api/competitions/{cid}/answer below (see submit_answer) which uses the new
# `question`/`correct_answer` schema.

# ─── Wallet ───
@api_router.get("/wallet")
async def get_wallet(user=Depends(get_current_user)):
    transactions = await db.wallet_transactions.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    return {"balance": user.get("wallet_balance", 0), "points": user.get("points", 0), "transactions": [serialize_doc(t) for t in transactions]}

# ─── Addresses ───
@api_router.get("/addresses")
async def get_addresses(user=Depends(get_current_user)):
    addrs = await db.addresses.find({"user_id": user["id"]}).to_list(20)
    return [serialize_doc(a) for a in addrs]

class AddressInput(BaseModel):
    label: str = "My home"
    address: str
    city: str = ""
    is_default: bool = False

@api_router.post("/addresses")
async def add_address(data: AddressInput, user=Depends(get_current_user)):
    if data.is_default:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    result = await db.addresses.insert_one({
        "user_id": user["id"], "label": data.label, "address": data.address,
        "city": data.city, "is_default": data.is_default, "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"id": str(result.inserted_id), "message": "Address added"}

@api_router.delete("/addresses/{addr_id}")
async def delete_address(addr_id: str, user=Depends(get_current_user)):
    await db.addresses.delete_one({"_id": ObjectId(addr_id), "user_id": user["id"]})
    return {"message": "Address deleted"}

# ─── Paid Ads ───
@api_router.get("/ads")
async def get_ads():
    ads = await db.ads.find({"status": "active"}).sort("created_at", -1).to_list(20)
    return [serialize_doc(a) for a in ads]

class AdInput(BaseModel):
    title: str
    description: str
    image: str = ""
    ad_type: str = "banner"
    duration_days: int = 7
    budget: float = 0

@api_router.post("/ads")
async def create_ad(data: AdInput, user=Depends(get_current_user)):
    result = await db.ads.insert_one({
        "user_id": user["id"], "title": data.title, "description": data.description,
        "image": data.image, "ad_type": data.ad_type, "duration_days": data.duration_days,
        "budget": data.budget, "status": "pending", "views": 0, "clicks": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"id": str(result.inserted_id), "message": "Ad submitted for review"}

@api_router.get("/ads/my")
async def my_ads(user=Depends(get_current_user)):
    ads = await db.ads.find({"user_id": user["id"]}).sort("created_at", -1).to_list(20)
    return [serialize_doc(a) for a in ads]


# ─── Services Booking ───
class ServiceBookInput(BaseModel):
    service_id: str = ""
    service_name: str
    device_model: str = ""
    issue_desc: str = ""
    delivery_type: str = "store"  # store, home_pickup
    address: str = ""
    phone: str = ""
    dest_lat: float | None = None
    dest_lng: float | None = None

def _haversine_km(lat1, lng1, lat2, lng2):
    """Great-circle distance in km."""
    from math import radians, sin, cos, asin, sqrt
    R = 6371.0
    dlat = radians(lat2 - lat1); dlng = radians(lng2 - lng1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng/2)**2
    return 2 * R * asin(sqrt(a))

async def _calc_pickup_fee(svc: dict, dest_lat, dest_lng):
    """Compute round-trip pickup fee: distance × 2 × price_per_km, capped/floored."""
    if not svc.get("home_pickup"): return 0.0, 0.0
    price_km = float(svc.get("pickup_price_per_km", 3.0))
    base = float(svc.get("pickup_base_fee", 10.0))
    shop_lat = svc.get("shop_lat"); shop_lng = svc.get("shop_lng")
    if dest_lat is None or dest_lng is None or shop_lat is None or shop_lng is None:
        return base, 0.0
    d = _haversine_km(shop_lat, shop_lng, dest_lat, dest_lng)
    fee = round(base + d * 2 * price_km, 2)
    return fee, round(d, 2)

@api_router.get("/services")
async def get_services():
    services = await db.services.find({"published": True}).to_list(50)
    return [serialize_doc(s) for s in services]

@api_router.get("/merchant/services/live-summary")
async def merchant_services_live_summary(user=Depends(get_current_user)):
    """Aggregated services with images, reviews, avg rating for Live Preview."""
    require_merchant(user)
    all_svcs = await db.services.find({}).sort("created_at", -1).to_list(200)
    result = []
    for s in all_svcs:
        svc = serialize_doc(s)
        # Attach top reviews (with merchant replies) — those without update_id are final overall reviews
        revs = await db.service_reviews.find({"service_id": svc["id"], "update_id": ""}).sort("created_at", -1).to_list(10)
        booking_count = await db.service_bookings.count_documents({"service_id": svc["id"]})
        avg = svc.get("rating", 0)
        if not avg and revs:
            avg = round(sum(r.get("stars", 0) for r in revs) / len(revs), 2)
        result.append({
            **svc,
            "reviews": [serialize_doc(r) for r in revs],
            "review_count": len(revs),
            "avg_rating": avg,
            "booking_count": booking_count,
        })
    return result

@api_router.get("/services/{svc_id}")
async def get_service(svc_id: str):
    svc = await db.services.find_one({"_id": ObjectId(svc_id)})
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    return serialize_doc(svc)

@api_router.post("/services/{svc_id}/quote")
async def quote_service(svc_id: str, request: Request):
    """Return quote incl. dynamic pickup fee based on destination coords."""
    body = await request.json()
    svc = await db.services.find_one({"_id": ObjectId(svc_id)})
    if not svc: raise HTTPException(status_code=404, detail="Service not found")
    fee, dist = await _calc_pickup_fee(svc, body.get("dest_lat"), body.get("dest_lng"))
    return {
        "service_price": float(svc.get("price", 0)),
        "inspection_price": float(svc.get("inspection_price", 0)),
        "pickup_fee": fee, "distance_km": dist,
        "home_pickup_supported": bool(svc.get("home_pickup", False)),
    }

@api_router.post("/services/book")
async def book_service(data: ServiceBookInput, user=Depends(get_current_user)):
    pickup_fee = 0.0; distance_km = 0.0; svc = None
    if data.service_id and ObjectId.is_valid(data.service_id):
        svc = await db.services.find_one({"_id": ObjectId(data.service_id)})
    if svc and data.delivery_type == "home_pickup":
        pickup_fee, distance_km = await _calc_pickup_fee(svc, data.dest_lat, data.dest_lng)
    total = float(svc.get("price", 0)) if svc else 0.0
    total += pickup_fee
    doc = {
        "user_id": user["id"],
        "service_id": data.service_id,
        "service_name": data.service_name,
        "device_model": data.device_model, "issue_desc": data.issue_desc,
        "delivery_type": data.delivery_type, "address": data.address, "phone": data.phone,
        "dest_lat": data.dest_lat, "dest_lng": data.dest_lng,
        "pickup_fee": pickup_fee, "distance_km": distance_km,
        "service_price": float(svc.get("price", 0)) if svc else 0.0,
        "total_amount": total,
        "status": "pending", "warranty": bool(svc.get("warranty_available", True)) if svc else True,
        "warranty_days": int(svc.get("warranty_days", 90)) if svc else 90,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.service_bookings.insert_one(doc)
    bid = str(result.inserted_id)
    # notify the merchant who owns this service (fallback: any merchant)
    merchant_id = svc.get("merchant_id") if svc else None
    if not merchant_id:
        m = await db.users.find_one({"role": "merchant"})
        merchant_id = str(m["_id"]) if m else None
    if merchant_id:
        try: await create_notification(merchant_id, "🔔 حجز خدمة جديد", f"{user.get('name','')} حجز {data.service_name}", {"type":"booking","booking_id":bid})
        except Exception: pass
    return {"id": bid, "message": "Service booked", "total_amount": total, "pickup_fee": pickup_fee, "distance_km": distance_km}

@api_router.get("/services/bookings/my")
async def my_service_bookings(user=Depends(get_current_user)):
    bookings = await db.service_bookings.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    return [serialize_doc(b) for b in bookings]

@api_router.get("/services/bookings/{bid}")
async def get_service_booking(bid: str, user=Depends(get_current_user)):
    b = await db.service_bookings.find_one({"_id": ObjectId(bid)})
    if not b: raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("user_id") != user["id"] and user.get("role") not in ("merchant","chamber"):
        raise HTTPException(status_code=403, detail="Not allowed")
    b = serialize_doc(b)
    # attach updates + reviews inline
    ups = await db.service_updates.find({"booking_id": bid}).sort("created_at", 1).to_list(50)
    b["updates"] = [serialize_doc(u) for u in ups]
    revs = await db.service_reviews.find({"booking_id": bid}).to_list(50)
    b["reviews"] = [serialize_doc(r) for r in revs]
    return b

# ─── Service updates (merchant → customer videos) ───
class ServiceUpdateInput(BaseModel):
    booking_id: str
    video_url: str = ""
    image_url: str = ""
    caption: str = ""
    is_public_experience: bool = False
    crosspost_to_social: bool = False

@api_router.post("/services/updates")
async def create_service_update(data: ServiceUpdateInput, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant","chamber"):
        raise HTTPException(status_code=403, detail="Merchants only")
    b = await db.service_bookings.find_one({"_id": ObjectId(data.booking_id)})
    if not b: raise HTTPException(status_code=404, detail="Booking not found")
    doc = data.model_dump()
    doc.update({
        "merchant_id": user["id"],
        "service_id": b.get("service_id", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "avg_rating": 0, "review_count": 0,
    })
    r = await db.service_updates.insert_one(doc)
    uid = str(r.inserted_id)
    # notify the customer
    if b.get("user_id"):
        try:
            await create_notification(b["user_id"], "🎥 تحديث جديد على جوالك",
                                       data.caption or "شاهد تحديث الصيانة",
                                       {"type": "service_update", "booking_id": data.booking_id, "update_id": uid})
        except Exception: pass
    # cross-post to social if requested
    if data.crosspost_to_social and data.video_url:
        try:
            svc_name = b.get("service_name", "خدمة صيانة")
            await db.social_posts.insert_one({
                "user_id": user["id"], "author_name": user.get("name",""), "author_role": "merchant",
                "text": f"🛠️ {svc_name}\n{data.caption}".strip(),
                "images": [], "video": data.video_url,
                "badge": "خدمة صيانة", "linked_service_id": b.get("service_id",""),
                "likes": 0, "liked_by": [], "comments": [], "views": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning(f"cross-post failed: {e}")
    return {"id": uid, "message": "Update posted"}

@api_router.put("/services/updates/{uid}")
async def edit_service_update(uid: str, request: Request, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant","chamber"): raise HTTPException(status_code=403, detail="Merchants only")
    body = await request.json()
    allow = {k: v for k, v in body.items() if k in {"caption","is_public_experience","crosspost_to_social"}}
    if not allow: raise HTTPException(status_code=400, detail="Nothing to update")
    await db.service_updates.update_one({"_id": ObjectId(uid)}, {"$set": allow})
    return {"message": "Updated"}

@api_router.delete("/services/updates/{uid}")
async def delete_service_update(uid: str, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant","chamber"): raise HTTPException(status_code=403, detail="Merchants only")
    await db.service_updates.delete_one({"_id": ObjectId(uid)})
    await db.service_reviews.delete_many({"update_id": uid})
    return {"message": "Deleted"}

# ─── Service reviews (customer ratings on videos + final rating) ───
class ServiceReviewInput(BaseModel):
    booking_id: str
    update_id: str = ""  # empty = final overall rating
    stars: int
    comment: str = ""

@api_router.post("/services/reviews")
async def submit_service_review(data: ServiceReviewInput, user=Depends(get_current_user)):
    if data.stars < 1 or data.stars > 5: raise HTTPException(status_code=400, detail="التقييم من 1 إلى 5 نجوم")
    b = await db.service_bookings.find_one({"_id": ObjectId(data.booking_id)})
    if not b: raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("user_id") != user["id"]: raise HTTPException(status_code=403, detail="فقط صاحب الحجز يقيّم")
    # upsert (one review per user per update, or one final per user per booking)
    q = {"user_id": user["id"], "booking_id": data.booking_id, "update_id": data.update_id}
    doc = {**q, "stars": data.stars, "comment": data.comment, "user_name": user.get("name",""),
           "service_id": b.get("service_id",""), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.service_reviews.update_one(q, {"$set": doc}, upsert=True)
    # recompute aggregate on the target (update or service)
    if data.update_id:
        revs = await db.service_reviews.find({"update_id": data.update_id}).to_list(500)
        avg = round(sum(r["stars"] for r in revs) / len(revs), 2) if revs else 0
        await db.service_updates.update_one({"_id": ObjectId(data.update_id)},
            {"$set": {"avg_rating": avg, "review_count": len(revs)}})
    else:
        revs = await db.service_reviews.find({"service_id": b.get("service_id",""), "update_id": ""}).to_list(2000)
        if b.get("service_id") and ObjectId.is_valid(b["service_id"]):
            avg = round(sum(r["stars"] for r in revs) / len(revs), 2) if revs else 0
            await db.services.update_one({"_id": ObjectId(b["service_id"])},
                {"$set": {"rating": avg, "review_count": len(revs)}})
    return {"message": "Review submitted"}

@api_router.get("/services/{svc_id}/reviews")
async def service_reviews(svc_id: str):
    revs = await db.service_reviews.find({"service_id": svc_id, "update_id": ""}).sort("created_at", -1).to_list(200)
    return [serialize_doc(r) for r in revs]

@api_router.post("/services/reviews/{review_id}/reply")
async def merchant_reply_service_review(review_id: str, request: Request, user=Depends(get_current_user)):
    """Merchant can reply to a service review by ID."""
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(status_code=403, detail="Merchants only")
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="نص الرد مطلوب")
    await db.service_reviews.update_one(
        {"_id": ObjectId(review_id)},
        {"$set": {
            "merchant_reply": text,
            "merchant_reply_at": datetime.now(timezone.utc).isoformat(),
            "merchant_reply_by": user.get("name", ""),
        }},
    )
    return {"message": "Reply saved"}

@api_router.get("/services/updates/{uid}/reviews")
async def update_reviews(uid: str):
    """Public reviews (stars + comment) for a specific service_update (experience video)."""
    revs = await db.service_reviews.find({"update_id": uid}).sort("created_at", -1).to_list(200)
    return [serialize_doc(r) for r in revs]

@api_router.get("/services/{svc_id}/experiences")
async def service_experiences(svc_id: str):
    """Public gallery of merchant-approved experience videos for this service."""
    ups = await db.service_updates.find({"service_id": svc_id, "is_public_experience": True, "video_url": {"$ne": ""}}).sort("created_at", -1).to_list(100)
    return [serialize_doc(u) for u in ups]


# ─── Support Tickets ───
class TicketInput(BaseModel):
    subject: str
    message: str
    category: str = "general"

@api_router.get("/support/tickets")
async def get_tickets(user=Depends(get_current_user)):
    tickets = await db.support_tickets.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    return [serialize_doc(t) for t in tickets]

@api_router.post("/support/tickets")
async def create_ticket(data: TicketInput, user=Depends(get_current_user)):
    result = await db.support_tickets.insert_one({
        "user_id": user["id"], "subject": data.subject, "message": data.message,
        "category": data.category, "status": "open",
        "replies": [], "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"id": str(result.inserted_id), "message": "Ticket created"}

@api_router.post("/support/tickets/{ticket_id}/reply")
async def reply_ticket(ticket_id: str, request: Request, user=Depends(get_current_user)):
    body = await request.json()
    await db.support_tickets.update_one({"_id": ObjectId(ticket_id)}, {"$push": {"replies": {
        "user_id": user["id"], "user_name": user["name"], "message": body.get("message", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }}})
    return {"message": "Reply sent"}

# ─── Warranties ───
@api_router.get("/warranties")
async def get_warranties(user=Depends(get_current_user)):
    warranties = await db.warranties.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    return [serialize_doc(w) for w in warranties]

# ─── Invoices ───
@api_router.get("/invoices")
async def get_invoices(user=Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    invoices = []
    for o in orders:
        o["id"] = str(o.pop("_id"))
        invoices.append({
            "id": o["id"], "invoice_no": f"INV-{o['id'][-8:].upper()}",
            "date": o.get("created_at", ""), "total": o.get("total", 0),
            "tax": o.get("tax", 0), "subtotal": o.get("subtotal", 0),
            "items": o.get("items", []), "status": o.get("status", "")
        })
    return invoices



@api_router.delete("/cart/{item_id}")
async def remove_from_cart(item_id: str, user=Depends(get_current_user)):
    await db.cart_items.delete_one({"_id": ObjectId(item_id), "user_id": user["id"]})
    return {"message": "Deleted"}

# ─── Orders ───
@api_router.get("/orders")
async def get_orders(user=Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    return [serialize_doc(o) for o in orders]

@api_router.post("/orders")
async def create_order(data: OrderInput, user=Depends(get_current_user)):
    cart_items = await db.cart_items.find({"user_id": user["id"]}).to_list(100)
    if not cart_items:
        raise HTTPException(status_code=400, detail="السلة فارغة")
    items = []
    subtotal = 0
    for ci in cart_items:
        product = await db.products.find_one({"_id": ObjectId(ci["product_id"])})
        if product:
            price = product.get("discount_price") or product["price"]
            item_total = price * ci["quantity"]
            subtotal += item_total
            items.append({
                "product_id": ci["product_id"],
                "name": product.get("name_ar", product.get("name_en", "")),
                "image": product.get("images", [""])[0] if product.get("images") else "",
                "price": price,
                "quantity": ci["quantity"],
                "color": ci.get("color"),
                "storage": ci.get("storage"),
                "total": item_total
            })
    tax = round(subtotal * 0.15, 2)

    # Calculate delivery cost using the new dynamic system
    delivery_cost = 0
    fee_info = {}
    branch_id = data.branch_id or ""
    branch_lat = data.branch_lat or 0
    branch_lng = data.branch_lng or 0
    if data.dest_lat and data.dest_lng:
        try:
            item_ids = [it["product_id"] for it in items]

            class FakeReq:
                async def json(self):
                    return {"lat": data.dest_lat, "lng": data.dest_lng,
                            "delivery_type": data.delivery_type, "item_ids": item_ids}
            q = await delivery_quote(FakeReq())  # type: ignore
            delivery_cost = q.get("fee", {}).get("delivery_fee", 0)
            fee_info = q.get("fee", {})
            if not branch_id and q.get("branch"):
                branch_id = q["branch"].get("id", "")
                branch_lat = q["branch"].get("lat", 0)
                branch_lng = q["branch"].get("lng", 0)
        except HTTPException as ex:
            raise ex
        except Exception:
            delivery_cost = 15  # fallback
    else:
        # Legacy fallback
        delivery_cost = 25 if data.delivery_type in ("express", "same_day") else 15

    total = round(subtotal + tax + delivery_cost, 2)
    order_doc = {
        "user_id": user["id"],
        "items": items,
        "subtotal": subtotal,
        "tax": tax,
        "delivery_cost": delivery_cost,
        "delivery_fee": delivery_cost,
        "delivery_info": fee_info,
        "total": total,
        "address": data.address,
        "phone": data.phone,
        "delivery_type": data.delivery_type,
        "payment_method": data.payment_method,
        "notes": data.notes,
        "scheduled_slot": data.scheduled_slot,
        "dest_lat": data.dest_lat,
        "dest_lng": data.dest_lng,
        "branch_id": branch_id,
        "branch_lat": branch_lat,
        "branch_lng": branch_lng,
        "status": "processing",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.orders.insert_one(order_doc)
    # Auto-award loyalty points on order creation
    try:
        settings = await _ensure_merchant_settings()
        if settings["loyalty"]["enabled"]:
            uid = str(user.get("id") or user.get("_id"))
            last = await db.loyalty_transactions.find_one({"user_id": uid}, sort=[("created_at", -1)])
            balance = last.get("balance_after", 0) if last else 0
            tier = _user_tier(balance, settings["loyalty"]["tier_thresholds"])
            multiplier = settings["loyalty"]["tier_perks"].get(tier, {}).get("earn_multiplier", 1.0)
            points = int(round(total * settings["loyalty"]["earn_rate"] * multiplier))
            if points > 0:
                new_balance = balance + points
                await db.loyalty_transactions.insert_one({
                    "user_id": uid, "points": points, "kind": "earn", "source": "order",
                    "description": f"طلب بقيمة {total} ر.س", "ref_id": str(result.inserted_id),
                    "balance_after": new_balance,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                order_doc["points_earned"] = points
                await db.orders.update_one({"_id": result.inserted_id}, {"$set": {"points_earned": points}})
    except Exception as e:
        logger.warning(f"Loyalty award failed: {e}")
    # Decrement `stock_app` for online orders
    if branch_id:
        for it in items:
            pid = it.get("product_id") or it.get("id")
            qty = int(it.get("quantity") or it.get("qty") or 1)
            if pid:
                await decrement_channel_stock(branch_id, pid, qty, channel="app")
    await db.cart_items.delete_many({"user_id": user["id"]})
    order_doc["id"] = str(result.inserted_id)
    order_doc.pop("_id", None)

    # ─── Affiliate/Marketer attribution ───
    if data.referral_code:
        try:
            aff = await db.affiliates.find_one({
                "referral_code": data.referral_code.upper(), "active": True,
            })
            # Do NOT credit self-referral
            if aff and aff.get("user_id") != user["id"]:
                commission_pct = float(aff.get("commission_percent", 5))
                earning = round(subtotal * commission_pct / 100.0, 2)
                await db.affiliate_conversions.insert_one({
                    "affiliate_id": str(aff["_id"]),
                    "marketer_id": aff.get("user_id"),
                    "marketer_name": aff.get("user_name", ""),
                    "merchant_id": aff.get("merchant_id"),
                    "customer_id": user["id"],
                    "customer_name": user.get("name", ""),
                    "order_id": order_doc["id"],
                    "referral_code": aff["referral_code"],
                    "order_subtotal": subtotal,
                    "commission_percent": commission_pct,
                    "earning": earning,
                    "status": "confirmed",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                await db.affiliates.update_one({"_id": aff["_id"]}, {
                    "$inc": {
                        "total_conversions": 1,
                        "total_sales": subtotal,
                        "total_earnings": earning,
                    },
                    "$set": {"last_activity": datetime.now(timezone.utc).isoformat()},
                })
                # notify marketer
                try:
                    await create_notification(aff["user_id"], "🎉 عمولة جديدة",
                        f"طلب بقيمة {subtotal:.0f} ر.س عبر رمزك — عمولتك {earning:.2f} ر.س",
                        {"type": "affiliate_conversion", "affiliate_id": str(aff["_id"]), "order_id": order_doc["id"]})
                except Exception: pass
                order_doc["referral_credited"] = True
                order_doc["referral_code"] = aff["referral_code"]
        except Exception as e:
            logger.warning(f"Affiliate attribution failed: {e}")

    # ─── Loyalty: award points (1 point per 10 SAR spent) ───
    points_earned = int(subtotal / 10)
    if points_earned > 0:
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$inc": {"points": points_earned}})
        await db.points_history.insert_one({
            "user_id": user["id"], "delta": points_earned,
            "reason": f"طلب #{order_doc['id'][-8:]}", "order_id": order_doc["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        order_doc["points_earned"] = points_earned

    # ─── Push Notification: order received ───
    try:
        await create_notification(user["id"], "تم استلام طلبك ✅",
                                   f"طلب #{order_doc['id'][-8:]} قيد التحضير الآن",
                                   {"type": "order", "order_id": order_doc["id"], "status": "processing"})
    except Exception as e:
        logger.warning(f"Notification failed: {e}")

    return order_doc

# ─── Profile ───
@api_router.put("/profile")
async def update_profile(data: ProfileUpdate, user=Depends(get_current_user)):
    update = {k: v for k, v in data.dict().items() if v is not None}
    if update:
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": update})
    updated = await db.users.find_one({"_id": ObjectId(user["id"])})
    updated["id"] = str(updated.pop("_id"))
    updated.pop("password_hash", None)
    return updated

# ─── Favorites ───
@api_router.get("/favorites")
async def get_favorites(user=Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": user["id"]}).to_list(100)
    result = []
    for f in favs:
        product = await db.products.find_one({"_id": ObjectId(f["product_id"])})
        if product:
            p = serialize_doc(product)
            p["fav_id"] = str(f["_id"])
            result.append(p)
    return result

@api_router.post("/favorites/{product_id}")
async def toggle_favorite(product_id: str, user=Depends(get_current_user)):
    existing = await db.favorites.find_one({"user_id": user["id"], "product_id": product_id})
    if existing:
        await db.favorites.delete_one({"_id": existing["_id"]})
        return {"favorited": False}
    await db.favorites.insert_one({"user_id": user["id"], "product_id": product_id, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"favorited": True}

# ─── Banners ───
@api_router.get("/banners")
async def get_banners():
    banners = await db.banners.find({"published": True}).to_list(20)
    return [serialize_doc(b) for b in banners]

# ─── Seed Data ───

# ─── Coupons ───
@api_router.get("/coupons/validate/{code}")
async def validate_coupon(code: str):
    coupon = await db.coupons.find_one({"code": code.upper(), "active": True})
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon code")
    return serialize_doc(coupon)

# ─── Reviews ───
@api_router.get("/products/{product_id}/reviews")
async def get_reviews(product_id: str):
    reviews = await db.reviews.find({"product_id": product_id}).sort("created_at", -1).to_list(50)
    return [serialize_doc(r) for r in reviews]

class ReviewInput(BaseModel):
    rating: int = 5
    comment: str = ""

@api_router.post("/products/{product_id}/reviews")
async def add_review(product_id: str, data: ReviewInput, user=Depends(get_current_user)):
    await db.reviews.insert_one({
        "product_id": product_id, "user_id": user["id"], "user_name": user["name"],
        "rating": data.rating, "comment": data.comment,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    reviews = await db.reviews.find({"product_id": product_id}).to_list(1000)
    avg = sum(r["rating"] for r in reviews) / len(reviews) if reviews else 0
    await db.products.update_one({"_id": ObjectId(product_id)}, {"$set": {"rating": round(avg, 1), "review_count": len(reviews)}})
    return {"message": "Review added", "avg_rating": round(avg, 1)}

# ─── Order Tracking ───
@api_router.get("/orders/{order_id}")
async def get_order_detail(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"_id": ObjectId(order_id), "user_id": user["id"]})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return serialize_doc(order)

@api_router.get("/orders/{order_id}/tracking")
async def get_order_tracking(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # Authorize: customer owns it, OR assigned driver, OR merchant
    role = user.get("role")
    uid = user.get("id")
    if role not in ("merchant", "chamber") and order.get("user_id") != uid and order.get("driver_id") != uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    out = {
        "id": str(order["_id"]),
        "status": order.get("status", "processing"),
        "total": order.get("total", 0),
        "address": order.get("address", ""),
        "dest_lat": order.get("dest_lat") or order.get("delivery_lat"),
        "dest_lng": order.get("dest_lng") or order.get("delivery_lng"),
        "branch_lat": order.get("branch_lat"),
        "branch_lng": order.get("branch_lng"),
        "tracking": order.get("tracking", {}),
    }
    # Attach driver info if assigned
    if order.get("driver_id"):
        try:
            d = await db.drivers.find_one({"user_id": order["driver_id"]})
            u = await db.users.find_one({"_id": ObjectId(order["driver_id"])}) if order["driver_id"] else None
            if d:
                out["driver_lat"] = d.get("current_lat", 0)
                out["driver_lng"] = d.get("current_lng", 0)
                out["driver_last_seen"] = d.get("last_location_at", "")
            if u:
                out["driver_name"] = u.get("name", order.get("driver_name", ""))
                out["driver_phone"] = u.get("phone", "")
        except Exception:
            pass
    else:
        out["driver_name"] = order.get("driver_name", "")
    return out

# ─── Delivery Integration Webhooks ───
@api_router.post("/webhooks/delivery/update")
async def delivery_webhook(request: Request):
    body = await request.json()
    order_id = body.get("order_id")
    status = body.get("status")
    driver_name = body.get("driver_name", "")
    driver_phone = body.get("driver_phone", "")
    location = body.get("location", {})
    eta = body.get("eta", "")
    if order_id:
        await db.orders.update_one({"_id": ObjectId(order_id)}, {"$set": {
            "status": status, "tracking": {
                "driver_name": driver_name, "driver_phone": driver_phone,
                "location": location, "eta": eta, "last_update": datetime.now(timezone.utc).isoformat()
            }
        }})
    return {"received": True}

@api_router.post("/webhooks/delivery/assigned")
async def delivery_assigned_webhook(request: Request):
    body = await request.json()
    order_id = body.get("order_id")
    if order_id:
        await db.orders.update_one({"_id": ObjectId(order_id)}, {"$set": {
            "status": "out_for_delivery", "tracking.driver_name": body.get("driver_name", ""),
            "tracking.driver_phone": body.get("driver_phone", ""),
            "tracking.assigned_at": datetime.now(timezone.utc).isoformat()
        }})
    return {"received": True}

# ─── Payment Integration Points ───
@api_router.post("/payments/create-intent")
async def create_payment_intent(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    amount = body.get("amount", 0)
    method = body.get("method", "card")
    return {
        "payment_id": f"pay_{secrets.token_hex(12)}",
        "amount": amount, "currency": "SAR", "method": method,
        "status": "pending",
        "message": "Payment gateway not yet configured. Connect Stripe/Tamara/Apple Pay via webhook.",
        "integration_required": True,
        "supported_methods": ["card", "apple_pay", "mada", "tamara_installments", "cash_on_delivery"]
    }

@api_router.post("/webhooks/payment/confirm")
async def payment_webhook(request: Request):
    body = await request.json()
    order_id = body.get("order_id")
    payment_status = body.get("status")
    if order_id and payment_status == "paid":
        await db.orders.update_one({"_id": ObjectId(order_id)}, {"$set": {"payment_status": "paid"}})
    return {"received": True}

# ─── Social Posts ───
@api_router.get("/social/posts")
async def get_social_posts():
    now = datetime.now(timezone.utc).isoformat()
    # Filter out expired stories from main feed
    query = {"$or": [
        {"type": {"$ne": "story"}},
        {"type": "story", "$or": [{"expires_at": {"$gt": now}}, {"expires_at": {"$exists": False}}]}
    ]}
    posts = await db.social_posts.find(query).sort("created_at", -1).to_list(100)
    return [serialize_doc(p) for p in posts]

@api_router.post("/social/posts/{post_id}/like")
async def like_post(post_id: str, user=Depends(get_current_user)):
    existing = await db.social_likes.find_one({"post_id": post_id, "user_id": user["id"]})
    if existing:
        await db.social_likes.delete_one({"_id": existing["_id"]})
        await db.social_posts.update_one({"_id": ObjectId(post_id)}, {"$inc": {"likes": -1}})
        return {"liked": False}
    await db.social_likes.insert_one({"post_id": post_id, "user_id": user["id"]})
    await db.social_posts.update_one({"_id": ObjectId(post_id)}, {"$inc": {"likes": 1}})
    return {"liked": True}

@api_router.get("/social/posts/{post_id}/comments")
async def get_comments(post_id: str):
    comments = await db.social_comments.find({"post_id": post_id}).sort("created_at", -1).to_list(50)
    return [serialize_doc(c) for c in comments]

@api_router.post("/social/posts/{post_id}/comments")
async def add_comment(post_id: str, request: Request, user=Depends(get_current_user)):
    body = await request.json()
    is_merchant = user.get("role") == "merchant"
    await db.social_comments.insert_one({
        "post_id": post_id, "user_id": user["id"], "user_name": user["name"],
        "text": body.get("text", ""), "is_merchant_reply": is_merchant,
        "reply_to": body.get("reply_to"),  # optional parent comment id
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    await db.social_posts.update_one({"_id": ObjectId(post_id)}, {"$inc": {"comments": 1}})
    return {"message": "Comment added"}

@api_router.delete("/merchant/social/comments/{cid}")
async def merchant_delete_comment(cid: str, user=Depends(get_current_user)):
    require_merchant(user)
    c = await db.social_comments.find_one({"_id": ObjectId(cid)})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    await db.social_comments.delete_one({"_id": ObjectId(cid)})
    await db.social_posts.update_one({"_id": ObjectId(c["post_id"])}, {"$inc": {"comments": -1}})
    return {"message": "Deleted"}

@api_router.get("/merchant/social/comments")
async def merchant_recent_comments(user=Depends(get_current_user)):
    """All recent customer comments across all posts for the merchant inbox."""
    require_merchant(user)
    comments = await db.social_comments.find({}).sort("created_at", -1).to_list(100)
    # attach post info
    post_ids = list({c["post_id"] for c in comments})
    posts = {}
    for pid in post_ids:
        try:
            p = await db.social_posts.find_one({"_id": ObjectId(pid)})
            if p: posts[pid] = {"id": str(p["_id"]), "content": p.get("content", ""), "image_url": p.get("image_url", "")}
        except Exception:
            pass
    out = []
    for c in comments:
        cd = serialize_doc(c)
        cd["post"] = posts.get(c["post_id"], {"id": c["post_id"], "content": "(deleted post)"})
        out.append(cd)
    return out

@api_router.post("/social/posts/{post_id}/bookmark")
async def bookmark_post(post_id: str, user=Depends(get_current_user)):
    existing = await db.social_bookmarks.find_one({"post_id": post_id, "user_id": user["id"]})
    if existing:
        await db.social_bookmarks.delete_one({"_id": existing["_id"]})
        return {"bookmarked": False}
    await db.social_bookmarks.insert_one({"post_id": post_id, "user_id": user["id"]})
    return {"bookmarked": True}

# ═══════════════════════════════════════════════════
# MERCHANT / ADMIN PANEL  (role = "merchant")
# ═══════════════════════════════════════════════════
def require_merchant(user):
    if user.get("role") not in ("merchant", "employee"):
        raise HTTPException(status_code=403, detail="Merchant access only")

def require_employee_perm(user, perm: str):
    """Check if user (merchant or employee) has the given permission."""
    if user.get("role") == "merchant":
        return True
    if user.get("role") == "employee":
        perms = user.get("permissions", [])
        if "all" in perms or perm in perms:
            return True
    raise HTTPException(status_code=403, detail=f"يتطلب صلاحية: {perm}")

def require_chamber(user):
    if user.get("role") != "chamber":
        raise HTTPException(status_code=403, detail="Chamber access only")

# ─── Support / Store Contact Info (public) ───
SUPPORT_DEFAULTS = {
    "phone": "0500000000",
    "whatsapp": "966500000000",
    "email": "support@zitex.sa",
    "instagram": "zitex_official",
    "twitter": "zitex_official",
    "tiktok": "",
    "snapchat": "",
    "telegram": "",
    "address": "الرياض، المملكة العربية السعودية",
    "working_hours": "السبت - الخميس: 9 ص - 11 م",
    "contact_via_social_first": True,
}

@api_router.get("/store/support")
async def get_support_info():
    s = await db.settings.find_one({"key": "support"}) or {}
    s.pop("_id", None); s.pop("key", None)
    # Merge stored values over defaults so every field is always present
    merged = {**SUPPORT_DEFAULTS, **s}
    return merged

@api_router.put("/merchant/store/support")
async def update_support_info(request: Request, user=Depends(get_current_user)):
    require_merchant(user)
    require_employee_perm(user, "settings")
    body = await request.json()
    await db.settings.update_one({"key": "support"}, {"$set": {**body, "key": "support"}}, upsert=True)
    return {"message": "Updated"}

# ─── Employee Management ───
# Available permission keys (used by merchant when assigning):
EMPLOYEE_PERMS = ["all", "products", "orders", "social", "competitions", "services",
                  "branches", "drivers", "delivery", "banners", "customers", "settings", "support",
                  "pos", "inventory", "invoices", "tasks", "tickets_reply", "roles_manage"]

PERM_LABELS = {
    "all": "كل الصلاحيات (Admin)",
    "products": "المنتجات", "orders": "الطلبات", "social": "السوشال ميديا",
    "competitions": "المسابقات", "services": "الخدمات", "branches": "الفروع",
    "drivers": "السائقون", "delivery": "التوصيل", "banners": "البانرات",
    "customers": "العملاء", "settings": "إعدادات المتجر", "support": "الدعم الفني",
    "pos": "نقاط البيع POS", "inventory": "المخزون", "invoices": "الفواتير",
    "tasks": "المهام", "tickets_reply": "الرد على التذاكر", "roles_manage": "إدارة الأدوار",
}

# ─── Roles (Custom + Preset) ───
class RoleInput(BaseModel):
    name: str
    description: str = ""
    permissions: List[str]
    color: str = "#D4AF37"

@api_router.get("/merchant/roles")
async def list_roles(user=Depends(get_current_user)):
    require_merchant(user)
    roles = await db.roles.find({"merchant_id": user["id"]}).to_list(100)
    result = [{
        "id": str(r["_id"]), "name": r.get("name"),
        "description": r.get("description", ""), "permissions": r.get("permissions", []),
        "color": r.get("color", "#D4AF37"), "employees_count": r.get("employees_count", 0),
        "is_preset": r.get("is_preset", False),
    } for r in roles]
    # Add preset roles if not created yet
    preset_names = {r["name"] for r in result}
    presets = [
        {"id": "preset_social", "name": "موظف سوشال ميديا", "description": "منشورات فقط", "permissions": ["social"], "color": "#3B82F6", "is_preset": True, "employees_count": 0},
        {"id": "preset_marketing", "name": "مسؤول تسويق", "description": "سوشال + مسابقات + بانرات", "permissions": ["social", "competitions", "banners"], "color": "#EC4899", "is_preset": True, "employees_count": 0},
        {"id": "preset_inventory", "name": "أمين مخزون", "description": "المخزون فقط", "permissions": ["inventory", "products"], "color": "#10B981", "is_preset": True, "employees_count": 0},
        {"id": "preset_cashier", "name": "كاشير", "description": "نقاط البيع والفواتير", "permissions": ["pos", "invoices", "orders"], "color": "#F59E0B", "is_preset": True, "employees_count": 0},
        {"id": "preset_manager", "name": "مدير فرع", "description": "إدارة فرع كاملة", "permissions": ["orders", "products", "inventory", "customers", "invoices", "pos"], "color": "#8B5CF6", "is_preset": True, "employees_count": 0},
    ]
    for p in presets:
        if p["name"] not in preset_names: result.append(p)
    return result

@api_router.post("/merchant/roles")
async def create_role(data: RoleInput, user=Depends(get_current_user)):
    require_merchant(user)
    doc = {**data.model_dump(), "merchant_id": user["id"], "employees_count": 0, "is_preset": False,
           "created_at": datetime.now(timezone.utc).isoformat()}
    r = await db.roles.insert_one(doc)
    return {"id": str(r.inserted_id)}

@api_router.put("/merchant/roles/{rid}")
async def update_role(rid: str, data: RoleInput, user=Depends(get_current_user)):
    require_merchant(user)
    if not ObjectId.is_valid(rid): raise HTTPException(status_code=400, detail="Invalid role id")
    await db.roles.update_one({"_id": ObjectId(rid), "merchant_id": user["id"]}, {"$set": data.model_dump()})
    return {"message": "Updated"}

@api_router.delete("/merchant/roles/{rid}")
async def delete_role(rid: str, user=Depends(get_current_user)):
    require_merchant(user)
    if not ObjectId.is_valid(rid): raise HTTPException(status_code=400, detail="Invalid role id")
    await db.roles.delete_one({"_id": ObjectId(rid), "merchant_id": user["id"]})
    return {"message": "Deleted"}

# ─── Time Tracking (Check-in / Check-out) ───
@api_router.post("/employee/check-in")
async def check_in(user=Depends(get_current_user)):
    if user.get("role") not in ("employee", "merchant"):
        raise HTTPException(status_code=403, detail="Employees or merchant only")
    # Prevent double check-in
    open_log = await db.time_logs.find_one({"employee_id": user["id"], "check_out": None})
    if open_log:
        return {"message": "أنت مسجّل حضورك بالفعل", "log_id": str(open_log["_id"]),
                "check_in": open_log.get("check_in")}
    doc = {"employee_id": user["id"], "employee_name": user.get("name", ""),
           "merchant_id": user.get("merchant_id", user["id"]),
           "check_in": datetime.now(timezone.utc).isoformat(), "check_out": None,
           "duration_minutes": 0}
    r = await db.time_logs.insert_one(doc)
    await log_activity(user, "check_in", None, None)
    return {"message": "تم تسجيل الحضور", "log_id": str(r.inserted_id), "check_in": doc["check_in"]}

@api_router.post("/employee/check-out")
async def check_out(user=Depends(get_current_user)):
    if user.get("role") not in ("employee", "merchant"):
        raise HTTPException(status_code=403)
    log = await db.time_logs.find_one({"employee_id": user["id"], "check_out": None})
    if not log:
        raise HTTPException(status_code=400, detail="لا يوجد تسجيل حضور مفتوح")
    now = datetime.now(timezone.utc)
    ci = datetime.fromisoformat(log["check_in"].replace("Z", "+00:00")) if isinstance(log["check_in"], str) else log["check_in"]
    dur_min = int((now - ci).total_seconds() / 60)
    await db.time_logs.update_one({"_id": log["_id"]},
                                  {"$set": {"check_out": now.isoformat(), "duration_minutes": dur_min}})
    await log_activity(user, "check_out", None, None)
    return {"message": "تم تسجيل الانصراف", "duration_minutes": dur_min}

@api_router.get("/employee/attendance-status")
async def attendance_status(user=Depends(get_current_user)):
    open_log = await db.time_logs.find_one({"employee_id": user["id"], "check_out": None})
    if not open_log: return {"checked_in": False}
    ci = datetime.fromisoformat(open_log["check_in"].replace("Z", "+00:00")) if isinstance(open_log["check_in"], str) else open_log["check_in"]
    now = datetime.now(timezone.utc)
    dur = int((now - ci).total_seconds() / 60)
    return {"checked_in": True, "check_in": open_log["check_in"], "duration_minutes": dur}

# ─── Activity Logging Helper ───
async def log_activity(user, action: str, entity: str = None, entity_id: str = None, meta: dict = None):
    try:
        doc = {
            "employee_id": user["id"], "employee_name": user.get("name", ""),
            "merchant_id": user.get("merchant_id", user["id"]),
            "action": action, "entity": entity, "entity_id": entity_id,
            "meta": meta or {}, "at": datetime.now(timezone.utc).isoformat(),
        }
        await db.activity_logs.insert_one(doc)
    except Exception:
        pass

# ─── Merchant: Team Overview (Attendance + Activity) ───
@api_router.get("/merchant/team/overview")
async def team_overview(user=Depends(get_current_user)):
    require_merchant(user)
    if user.get("role") != "merchant":
        raise HTTPException(status_code=403, detail="Owner only")

    employees = await db.users.find({"role": "employee", "merchant_id": user["id"]}).to_list(200)
    result = []
    now = datetime.now(timezone.utc)
    for emp in employees:
        eid = str(emp["_id"])
        open_log = await db.time_logs.find_one({"employee_id": eid, "check_out": None})
        online = bool(open_log)
        current_session = 0
        if open_log:
            ci = datetime.fromisoformat(open_log["check_in"].replace("Z", "+00:00")) if isinstance(open_log["check_in"], str) else open_log["check_in"]
            current_session = int((now - ci).total_seconds() / 60)
        # Total hours today
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        total_today = 0
        async for log in db.time_logs.find({"employee_id": eid, "check_in": {"$gte": today_start}}):
            total_today += log.get("duration_minutes", 0) or current_session
        # Last activity
        last_act = await db.activity_logs.find_one({"employee_id": eid}, sort=[("at", -1)])
        result.append({
            "id": eid, "name": emp.get("name"), "phone": emp.get("phone"),
            "job_title": emp.get("job_title", ""), "department": emp.get("department"),
            "branch_ids": emp.get("branch_ids", []),
            "online": online, "current_session_minutes": current_session,
            "total_today_minutes": total_today,
            "last_action": last_act.get("action") if last_act else None,
            "last_action_at": last_act.get("at") if last_act else None,
        })
    return result

@api_router.get("/merchant/employees/{eid}/activity")
async def employee_activity(eid: str, limit: int = 50, user=Depends(get_current_user)):
    require_merchant(user)
    if user.get("role") != "merchant":
        raise HTTPException(status_code=403)
    logs = await db.activity_logs.find({"employee_id": eid}).sort("at", -1).to_list(limit)
    return [{"id": str(l["_id"]), "action": l.get("action"), "entity": l.get("entity"),
             "at": l.get("at"), "meta": l.get("meta", {})} for l in logs]

class EmployeeInput(BaseModel):
    phone: str
    name: str
    password: str
    department: str = "general"
    permissions: List[str] = []
    salary_monthly: float = 0
    branch_ids: List[str] = []       # branches assigned to this employee
    role_id: str = ""                # optional custom role reference
    job_title: str = ""              # e.g. "كاشير", "مسؤول تسويق"

@api_router.get("/merchant/employees")
async def list_employees(user=Depends(get_current_user)):
    require_merchant(user)
    if user.get("role") != "merchant":
        raise HTTPException(status_code=403, detail="Owner only")
    employees = await db.users.find({"role": "employee", "merchant_id": user["id"]}).to_list(200)
    return [{
        "id": str(e["_id"]),
        "name": e.get("name", ""),
        "phone": e.get("phone", ""),
        "department": e.get("department", ""),
        "permissions": e.get("permissions", []),
        "salary_monthly": e.get("salary_monthly", 0),
        "branch_ids": e.get("branch_ids", []),
        "job_title": e.get("job_title", ""),
        "role_id": e.get("role_id", ""),
        "active": e.get("active", True),
        "created_at": e.get("created_at", ""),
    } for e in employees]

@api_router.post("/merchant/employees")
async def create_employee(data: EmployeeInput, user=Depends(get_current_user)):
    require_merchant(user)
    if user.get("role") != "merchant":
        raise HTTPException(status_code=403, detail="Owner only")
    if await db.users.count_documents({"phone": data.phone}) > 0:
        raise HTTPException(status_code=400, detail="رقم الجوال مسجل مسبقاً")
    # Validate perms
    invalid = [p for p in data.permissions if p not in EMPLOYEE_PERMS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"صلاحيات غير صالحة: {invalid}")
    doc = {
        "phone": data.phone, "name": data.name,
        "password_hash": hash_password(data.password),
        "role": "employee", "merchant_id": user["id"],
        "department": data.department, "permissions": data.permissions,
        "salary_monthly": data.salary_monthly,
        "branch_ids": data.branch_ids,
        "role_id": data.role_id,
        "job_title": data.job_title,
        "active": True, "points": 0, "wallet_balance": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    r = await db.users.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "تم إنشاء الموظف", "available_perms": EMPLOYEE_PERMS}

@api_router.put("/merchant/employees/{eid}")
async def update_employee(eid: str, request: Request, user=Depends(get_current_user)):
    require_merchant(user)
    if user.get("role") != "merchant":
        raise HTTPException(status_code=403, detail="Owner only")
    body = await request.json()
    update = {}
    if "name" in body: update["name"] = body["name"]
    if "department" in body: update["department"] = body["department"]
    if "permissions" in body:
        invalid = [p for p in body["permissions"] if p not in EMPLOYEE_PERMS]
        if invalid: raise HTTPException(status_code=400, detail=f"Invalid perms: {invalid}")
        update["permissions"] = body["permissions"]
    if "salary_monthly" in body: update["salary_monthly"] = body["salary_monthly"]
    if "active" in body: update["active"] = body["active"]
    if "password" in body and body["password"]:
        update["password_hash"] = hash_password(body["password"])
    await db.users.update_one({"_id": ObjectId(eid), "merchant_id": user["id"]}, {"$set": update})
    return {"message": "تم التحديث"}

@api_router.delete("/merchant/employees/{eid}")
async def delete_employee(eid: str, user=Depends(get_current_user)):
    require_merchant(user)
    if user.get("role") != "merchant":
        raise HTTPException(status_code=403, detail="Owner only")
    await db.users.delete_one({"_id": ObjectId(eid), "merchant_id": user["id"]})
    return {"message": "تم الحذف"}

@api_router.get("/merchant/employee-perms")
async def list_available_perms(user=Depends(get_current_user)):
    require_merchant(user)
    return {
        "permissions": EMPLOYEE_PERMS,
        "labels": {
            "all": "كل الصلاحيات",
            "products": "المنتجات",
            "orders": "الطلبات",
            "social": "السوشال ميديا",
            "competitions": "المسابقات",
            "services": "الخدمات والصيانة",
            "branches": "الفروع",
            "drivers": "السائقون",
            "delivery": "إعدادات التوصيل",
            "banners": "البانرات",
            "customers": "العملاء",
            "settings": "الإعدادات",
            "support": "الدعم الفني",
        }
    }


# ─── Merchant: Dashboard Stats ───
@api_router.get("/merchant/stats")
async def merchant_stats(user=Depends(get_current_user)):
    require_merchant(user)
    today = datetime.now(timezone.utc).date().isoformat()
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": {"$in": ["pending", "processing"]}})
    total_products = await db.products.count_documents({})
    total_customers = await db.users.count_documents({"role": "user"})
    pending_bookings = await db.service_bookings.count_documents({"status": "pending"})
    pending_competitions = await db.competitions.count_documents({"approval_status": "pending"})
    rejected_competitions = await db.competitions.count_documents({"approval_status": "rejected"})
    # Revenue calc
    orders = await db.orders.find({"status": {"$nin": ["cancelled"]}}).to_list(1000)
    total_revenue = sum(o.get("total", 0) for o in orders)
    today_revenue = sum(o.get("total", 0) for o in orders if o.get("created_at", "").startswith(today))
    return {
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "total_products": total_products,
        "total_customers": total_customers,
        "total_revenue": total_revenue,
        "today_revenue": today_revenue,
        "pending_bookings": pending_bookings,
        "pending_competitions_approval": pending_competitions,
        "rejected_competitions": rejected_competitions,
    }

# ─── Merchant: Products CRUD ───
class ProductInput(BaseModel):
    name_ar: str
    name_en: str = ""
    description_ar: str = ""
    description_en: str = ""
    category_id: str = ""
    brand_id: str = ""
    price: float
    discount_price: Optional[float] = None
    condition: str = "new"
    images: List[str] = []
    video: str = ""
    storage_options: List[str] = []
    colors: List[dict] = []
    specs: dict = {}
    variants: List[dict] = []
    branch_stock: List[dict] = []
    sku: str = ""
    tags: List[str] = []
    in_stock: bool = True
    featured: bool = False
    published: bool = True
    # ─── Dual Warranty (product) ───
    warranty_type: str = "none"          # "none" | "shop" | "manufacturer" | "both"
    shop_warranty_days: int = 0
    shop_warranty_terms: str = ""
    manufacturer_name: str = ""
    manufacturer_days: int = 0
    manufacturer_url: str = ""            # web / support portal
    manufacturer_phone: str = ""
    manufacturer_terms: str = ""
    # ─── Return Policy (per-product, merchant-defined) ───
    allow_return: bool = True
    return_days: int = 15                 # customer return window in days
    manufacturing_defect_days: int = 365  # defect claim window
    return_conditions: str = ""           # merchant-defined terms shown to customer

@api_router.post("/merchant/products")
async def merchant_create_product(data: ProductInput, user=Depends(get_current_user)):
    require_merchant(user)
    doc = data.model_dump()
    doc.update({"rating": 0, "review_count": 0, "sold_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat()})
    r = await db.products.insert_one(doc)
    # Sync branch inventory
    pid = str(r.inserted_id)
    for bs in data.branch_stock:
        if bs.get("branch_id") and bs.get("quantity") is not None:
            await db.branch_inventory.update_one(
                {"branch_id": bs["branch_id"], "product_id": pid},
                {"$set": {"quantity": int(bs["quantity"]),
                          "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True,
            )
    return {"id": pid, "message": "Product created"}

@api_router.put("/merchant/products/{pid}")
async def merchant_update_product(pid: str, data: ProductInput, user=Depends(get_current_user)):
    require_merchant(user)
    await db.products.update_one({"_id": ObjectId(pid)}, {"$set": data.model_dump()})
    for bs in data.branch_stock:
        if bs.get("branch_id") and bs.get("quantity") is not None:
            await db.branch_inventory.update_one(
                {"branch_id": bs["branch_id"], "product_id": pid},
                {"$set": {"quantity": int(bs["quantity"]),
                          "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True,
            )
    return {"message": "Product updated"}

@api_router.delete("/merchant/products/{pid}")
async def merchant_delete_product(pid: str, user=Depends(get_current_user)):
    require_merchant(user)
    await db.products.delete_one({"_id": ObjectId(pid)})
    return {"message": "Product deleted"}

@api_router.get("/merchant/products")
async def merchant_list_products(user=Depends(get_current_user)):
    require_merchant(user)
    products = await db.products.find({}).sort("created_at", -1).to_list(500)
    return [serialize_doc(p) for p in products]

# ─── Merchant: Categories CRUD ───
class CategoryInput(BaseModel):
    name_ar: str
    name_en: str = ""
    image: str = "📦"
    color1: str = "#8833FF"
    color2: str = "#AA66FF"
    published: bool = True
    order: int = 100

@api_router.post("/merchant/categories")
async def merchant_create_category(data: CategoryInput, user=Depends(get_current_user)):
    require_merchant(user)
    r = await db.categories.insert_one(data.model_dump())
    return {"id": str(r.inserted_id), "message": "Category created"}

@api_router.put("/merchant/categories/{cid}")
async def merchant_update_category(cid: str, data: CategoryInput, user=Depends(get_current_user)):
    require_merchant(user)
    await db.categories.update_one({"_id": ObjectId(cid)}, {"$set": data.model_dump()})
    return {"message": "Updated"}

@api_router.delete("/merchant/categories/{cid}")
async def merchant_delete_category(cid: str, user=Depends(get_current_user)):
    require_merchant(user)
    await db.categories.delete_one({"_id": ObjectId(cid)})
    return {"message": "Deleted"}

# ─── Merchant: Banners CRUD ───
class BannerInput(BaseModel):
    image: str
    title_ar: str = ""
    title_en: str = ""
    type: str = "normal"
    published: bool = True
    order: int = 100

@api_router.post("/merchant/banners")
async def merchant_create_banner(data: BannerInput, user=Depends(get_current_user)):
    require_merchant(user)
    r = await db.banners.insert_one(data.model_dump())
    return {"id": str(r.inserted_id), "message": "Banner created"}

@api_router.put("/merchant/banners/{bid}")
async def merchant_update_banner(bid: str, data: BannerInput, user=Depends(get_current_user)):
    require_merchant(user)
    await db.banners.update_one({"_id": ObjectId(bid)}, {"$set": data.model_dump()})
    return {"message": "Updated"}

@api_router.delete("/merchant/banners/{bid}")
async def merchant_delete_banner(bid: str, user=Depends(get_current_user)):
    require_merchant(user)
    await db.banners.delete_one({"_id": ObjectId(bid)})
    return {"message": "Deleted"}

# ─── Merchant: Services CRUD ───
class ServiceInput(BaseModel):
    name: str
    desc: str = ""
    long_description: str = ""
    icon: str = "construct"
    color: str = "#8833FF"
    category: str = "repair"   # repair | replacement | installation | diagnostic | other
    images: List[str] = []      # object-storage paths
    price: float
    inspection_price: float = 0
    turnaround: str = "1-2 Days"
    delivery_available: bool = True
    home_pickup: bool = True
    pickup_base_fee: float = 10.0
    pickup_price_per_km: float = 3.0
    shop_lat: float | None = None
    shop_lng: float | None = None
    warranty_available: bool = True
    warranty_days: int = 90
    warranty_terms: str = ""
    published: bool = True

@api_router.post("/merchant/services")
async def merchant_create_service(data: ServiceInput, user=Depends(get_current_user)):
    require_merchant(user)
    doc = data.model_dump()
    doc.update({"total_requests": 0, "rating": 0, "review_count": 0,
                "merchant_id": user["id"],
                "created_at": datetime.now(timezone.utc).isoformat()})
    r = await db.services.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "Service created"}

@api_router.put("/merchant/services/{sid}")
async def merchant_update_service(sid: str, data: ServiceInput, user=Depends(get_current_user)):
    require_merchant(user)
    await db.services.update_one({"_id": ObjectId(sid)}, {"$set": data.model_dump()})
    return {"message": "Updated"}

@api_router.delete("/merchant/services/{sid}")
async def merchant_delete_service(sid: str, user=Depends(get_current_user)):
    require_merchant(user)
    await db.services.delete_one({"_id": ObjectId(sid)})
    return {"message": "Deleted"}

@api_router.get("/merchant/services")
async def merchant_list_services(user=Depends(get_current_user)):
    require_merchant(user)
    services = await db.services.find({}).sort("created_at", -1).to_list(200)
    return [serialize_doc(s) for s in services]

# ─── Merchant: Orders Management ───
@api_router.get("/merchant/orders")
async def merchant_list_orders(user=Depends(get_current_user)):
    require_merchant(user)
    orders = await db.orders.find({}).sort("created_at", -1).to_list(500)
    result = []
    for o in orders:
        o["id"] = str(o.pop("_id"))
        cust = await db.users.find_one({"_id": ObjectId(o["user_id"])}) if ObjectId.is_valid(o.get("user_id", "")) else None
        if cust:
            o["customer_name"] = cust.get("name", "")
            o["customer_phone"] = cust.get("phone", "")
        result.append(o)
    return result

@api_router.put("/merchant/orders/{oid}/status")
async def merchant_update_order_status(oid: str, request: Request, user=Depends(get_current_user)):
    require_merchant(user)
    body = await request.json()
    new_status = body.get("status", "")
    if new_status not in ["pending", "processing", "ready_for_pickup", "shipped", "assigned", "picked_up", "delivered", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    order = await db.orders.find_one({"_id": ObjectId(oid)})
    if not order: raise HTTPException(status_code=404, detail="Order not found")
    await db.orders.update_one({"_id": ObjectId(oid)}, {"$set": {"status": new_status,
                                                                   "status_updated_at": datetime.now(timezone.utc).isoformat()}})
    # Notify customer about status change
    STATUS_MSG = {
        "processing":       ("⏳ جاري تحضير طلبك",      "Your order is being prepared"),
        "ready_for_pickup": ("📦 طلبك جاهز للاستلام",   "Your order is ready for pickup"),
        "shipped":          ("🚚 تم شحن طلبك",          "Your order has been shipped"),
        "assigned":         ("🛵 تم تعيين سائق لطلبك",  "A driver has been assigned"),
        "picked_up":        ("🛵 السائق في طريقه إليك", "The driver is on the way"),
        "delivered":        ("✅ تم توصيل طلبك",         "Your order was delivered"),
        "cancelled":        ("❌ تم إلغاء طلبك",         "Your order was cancelled"),
    }
    if new_status in STATUS_MSG and order.get("user_id"):
        title_ar, _ = STATUS_MSG[new_status]
        try:
            await create_notification(order["user_id"], title_ar,
                                       f"طلب #{oid[-8:]} - الحالة: {new_status}",
                                       {"type": "order", "order_id": oid, "status": new_status})
        except Exception as e:
            logger.warning(f"Notification failed: {e}")
    return {"message": "Status updated"}

# ─── Merchant: Service Bookings Management ───
@api_router.get("/merchant/bookings")
async def merchant_list_bookings(user=Depends(get_current_user)):
    require_merchant(user)
    bookings = await db.service_bookings.find({}).sort("created_at", -1).to_list(500)
    result = []
    for b in bookings:
        b["id"] = str(b.pop("_id"))
        cust = await db.users.find_one({"_id": ObjectId(b["user_id"])}) if ObjectId.is_valid(b.get("user_id", "")) else None
        if cust:
            b["customer_name"] = cust.get("name", "")
            b["customer_phone"] = cust.get("phone", "")
        result.append(b)
    return result

@api_router.put("/merchant/bookings/{bid}/status")
async def merchant_update_booking_status(bid: str, request: Request, user=Depends(get_current_user)):
    require_merchant(user)
    body = await request.json()
    new_status = body.get("status", "")
    if new_status not in ["pending","received","in_progress","ready","completed","cancelled"]:
        raise HTTPException(status_code=400, detail="حالة غير صحيحة")
    b = await db.service_bookings.find_one({"_id": ObjectId(bid)})
    if not b: raise HTTPException(status_code=404, detail="Booking not found")
    await db.service_bookings.update_one({"_id": ObjectId(bid)},
        {"$set": {"status": new_status, "status_updated_at": datetime.now(timezone.utc).isoformat()}})
    BOOKING_MSG_AR = {
        "received":     ("📥 تم استلام جهازك",       "الفني بدأ العمل على جهازك"),
        "in_progress":  ("🔧 قيد الإصلاح",            "جهازك تحت الفحص والإصلاح"),
        "ready":        ("✅ جهازك جاهز",              "يمكنك استلامه أو انتظار التوصيل"),
        "completed":    ("🎉 مكتمل",                   "تم تسليم جهازك — قيّم تجربتك"),
        "cancelled":    ("❌ تم إلغاء الحجز",           ""),
    }
    if new_status in BOOKING_MSG_AR and b.get("user_id"):
        t, m = BOOKING_MSG_AR[new_status]
        try: await create_notification(b["user_id"], t, m or b.get("service_name",""),
                                       {"type":"booking","booking_id":bid,"status":new_status})
        except Exception: pass
    return {"message": "Updated"}

# ─── Merchant: Social Posts CRUD ───
class SocialPostInput(BaseModel):
    text: str = ""
    image: str = ""  # url or storage path
    images: List[str] = []  # for multi-image posts
    video: str = ""  # storage path
    location_tag: str = ""
    scheduled_at: str = ""
    type: str = "post"  # post | poll | question | event | story
    poll_options: List[dict] = []  # [{text, votes}]
    question: str = ""  # for type=question
    event_date: str = ""  # ISO for type=event
    event_location: str = ""

@api_router.post("/merchant/social/posts")
async def merchant_create_post(data: SocialPostInput, user=Depends(get_current_user)):
    require_merchant(user)
    if not data.text and not data.image and not data.images and not data.video and data.type == "post":
        raise HTTPException(status_code=400, detail="المنشور يحتاج نص أو وسائط")
    doc = {
        "author": user.get("name", "Store"),
        "author_id": user["id"],
        "text": data.text,
        "image": data.image,
        "images": data.images or ([data.image] if data.image else []),
        "video": data.video,
        "location_tag": data.location_tag,
        "scheduled_at": data.scheduled_at,
        "type": data.type,
        "likes": 0, "comments": 0, "views": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.type == "poll":
        if not data.poll_options or len(data.poll_options) < 2:
            raise HTTPException(status_code=400, detail="Poll must have at least 2 options")
        doc["poll_options"] = [{"text": o.get("text", ""), "votes": 0} for o in data.poll_options]
    if data.type == "question":
        doc["question"] = data.question or data.text
    if data.type == "event":
        doc["event_date"] = data.event_date
        doc["event_location"] = data.event_location
    if data.type == "story":
        # Stories expire after 24h
        doc["expires_at"] = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    r = await db.social_posts.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "Post published"}

@api_router.delete("/merchant/social/posts/{pid}")
async def merchant_delete_post(pid: str, user=Depends(get_current_user)):
    require_merchant(user)
    await db.social_posts.delete_one({"_id": ObjectId(pid)})
    await db.social_comments.delete_many({"post_id": pid})
    await db.social_likes.delete_many({"post_id": pid})
    return {"message": "Deleted"}

# Poll voting
@api_router.post("/social/posts/{pid}/vote")
async def vote_poll(pid: str, request: Request, user=Depends(get_current_user)):
    body = await request.json()
    option_index = body.get("option_index", 0)
    # Validate bounds
    post = await db.social_posts.find_one({"_id": ObjectId(pid)})
    if not post or post.get("type") != "poll":
        raise HTTPException(status_code=404, detail="Poll not found")
    options = post.get("poll_options", [])
    if not isinstance(option_index, int) or option_index < 0 or option_index >= len(options):
        raise HTTPException(status_code=400, detail="Invalid option_index")
    # Prevent double voting
    existing = await db.social_votes.find_one({"post_id": pid, "user_id": user["id"]})
    if existing:
        if existing.get("option_index") == option_index:
            return {"message": "Already voted", "option_index": option_index}
        # Switch vote
        old_idx = existing.get("option_index", 0)
        await db.social_posts.update_one(
            {"_id": ObjectId(pid)},
            {"$inc": {f"poll_options.{old_idx}.votes": -1, f"poll_options.{option_index}.votes": 1}}
        )
        await db.social_votes.update_one({"_id": existing["_id"]}, {"$set": {"option_index": option_index}})
    else:
        await db.social_votes.insert_one({"post_id": pid, "user_id": user["id"], "option_index": option_index})
        await db.social_posts.update_one(
            {"_id": ObjectId(pid)},
            {"$inc": {f"poll_options.{option_index}.votes": 1}}
        )
    return {"message": "Vote recorded", "option_index": option_index}

# Get stories (non-expired)
@api_router.get("/social/stories")
async def get_stories():
    now = datetime.now(timezone.utc).isoformat()
    stories = await db.social_posts.find({
        "type": "story",
        "$or": [{"expires_at": {"$gt": now}}, {"expires_at": {"$exists": False}}]
    }).sort("created_at", -1).to_list(20)
    return [serialize_doc(s) for s in stories]

# ─── Merchant: Customers list ───
@api_router.get("/merchant/customers")
async def merchant_list_customers(user=Depends(get_current_user)):
    require_merchant(user)
    customers = await db.users.find({"role": "user"}).sort("created_at", -1).to_list(500)
    result = []
    for c in customers:
        c["id"] = str(c.pop("_id"))
        c.pop("password_hash", None)
        orders_count = await db.orders.count_documents({"user_id": c["id"]})
        c["orders_count"] = orders_count
        result.append(c)
    return result

# ─── Merchant: Competitions CRUD (NEW: types + permit + assigned employee) ───
async def create_notification(user_id: str, title: str, body: str, data: dict = None):
    """Save in-app notification + optionally trigger push."""
    doc = {
        "user_id": user_id, "title": title, "body": body,
        "data": data or {}, "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notifications.insert_one(doc)
    # Future: send to Expo push token if user has registered one
    # token = await db.push_tokens.find_one({"user_id": user_id})
    # if token: await send_expo_push(token["token"], title, body, data)
    return True

@api_router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    return [serialize_doc(n) for n in items]

@api_router.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str, user=Depends(get_current_user)):
    await db.notifications.update_one({"_id": ObjectId(nid), "user_id": user["id"]}, {"$set": {"read": True}})
    return {"message": "Marked read"}

@api_router.post("/notifications/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"message": "All marked read"}

@api_router.post("/push-tokens/register")
async def register_push_token(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    token = body.get("token", "")
    if not token: raise HTTPException(status_code=400, detail="Token required")
    await db.push_tokens.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "token": token, "platform": body.get("platform", "expo"),
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Push token registered"}

# ─── Loyalty Points ───
@api_router.get("/points/me")
async def my_points(user=Depends(get_current_user)):
    u = await db.users.find_one({"_id": ObjectId(user["id"])}) or {}
    history = await db.points_history.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    return {
        "balance": u.get("points", 0),
        "tier": "ذهبي" if u.get("points", 0) >= 500 else "فضي" if u.get("points", 0) >= 100 else "برونزي",
        "next_tier_at": 500 if u.get("points", 0) < 500 else None,
        "history": [serialize_doc(h) for h in history],
        "value_sar": round(u.get("points", 0) * 0.1, 2),  # 10 points = 1 SAR
        "earn_rate": "1 نقطة لكل 10 ر.س",
    }

@api_router.post("/points/redeem")
async def redeem_points(request: Request, user=Depends(get_current_user)):
    """Redeem points for wallet balance: 10 points = 1 SAR"""
    body = await request.json()
    points = int(body.get("points", 0))
    if points <= 0: raise HTTPException(status_code=400, detail="Invalid amount")
    u = await db.users.find_one({"_id": ObjectId(user["id"])}) or {}
    if u.get("points", 0) < points:
        raise HTTPException(status_code=400, detail="رصيد النقاط غير كافٍ")
    sar = round(points * 0.1, 2)
    await db.users.update_one({"_id": ObjectId(user["id"])},
        {"$inc": {"points": -points, "wallet_balance": sar}})
    await db.points_history.insert_one({
        "user_id": user["id"], "delta": -points,
        "reason": f"استبدال بـ {sar} ر.س للمحفظة",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Redeemed", "sar_credited": sar}

# ─── Group Buy ───
class GroupBuyInput(BaseModel):
    product_id: str
    title: str
    description: str = ""
    min_participants: int = 10
    max_participants: int = 100
    group_price: float  # the discounted price when min is reached
    end_date: str  # ISO

@api_router.get("/group-buys")
async def list_group_buys():
    """Public: list active group buys."""
    now = datetime.now(timezone.utc).isoformat()
    items = await db.group_buys.find({
        "status": "active",
        "end_date": {"$gt": now}
    }).sort("created_at", -1).to_list(50)
    out = []
    for g in items:
        g = serialize_doc(g)
        try:
            p = await db.products.find_one({"_id": ObjectId(g["product_id"])})
            if p:
                g["product"] = {"id": str(p["_id"]), "name_ar": p.get("name_ar", ""), "name_en": p.get("name_en", ""),
                                "image": (p.get("images") or [None])[0], "original_price": p.get("price", 0)}
        except Exception:
            pass
        g["participant_count"] = await db.group_buy_participants.count_documents({"group_buy_id": g["id"]})
        g["progress_pct"] = min(100, int(g["participant_count"] / max(1, g["min_participants"]) * 100))
        out.append(g)
    return out

@api_router.post("/merchant/group-buys")
async def create_group_buy(data: GroupBuyInput, user=Depends(get_current_user)):
    require_merchant(user)
    doc = {
        "product_id": data.product_id,
        "title": data.title, "description": data.description,
        "min_participants": data.min_participants, "max_participants": data.max_participants,
        "group_price": data.group_price, "end_date": data.end_date,
        "status": "active",
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.group_buys.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "Group buy created"}

@api_router.delete("/merchant/group-buys/{gid}")
async def delete_group_buy(gid: str, user=Depends(get_current_user)):
    require_merchant(user)
    await db.group_buys.delete_one({"_id": ObjectId(gid)})
    await db.group_buy_participants.delete_many({"group_buy_id": gid})
    return {"message": "Deleted"}

@api_router.post("/group-buys/{gid}/join")
async def join_group_buy(gid: str, user=Depends(get_current_user)):
    g = await db.group_buys.find_one({"_id": ObjectId(gid)})
    if not g: raise HTTPException(status_code=404, detail="غير موجود")
    if g.get("status") != "active": raise HTTPException(status_code=400, detail="انتهى التسوق الجماعي")
    # Check if already joined
    existing = await db.group_buy_participants.find_one({"group_buy_id": gid, "user_id": user["id"]})
    if existing: raise HTTPException(status_code=400, detail="انضممت مسبقاً")
    count = await db.group_buy_participants.count_documents({"group_buy_id": gid})
    if count >= g.get("max_participants", 100):
        raise HTTPException(status_code=400, detail="اكتمل العدد القصوى")
    await db.group_buy_participants.insert_one({
        "group_buy_id": gid, "user_id": user["id"], "user_name": user.get("name", ""),
        "joined_at": datetime.now(timezone.utc).isoformat()
    })
    new_count = count + 1
    # Notify when min reached
    if new_count == g.get("min_participants", 10):
        participants = await db.group_buy_participants.find({"group_buy_id": gid}).to_list(200)
        for p in participants:
            try:
                await create_notification(p["user_id"], "🎉 وصل التسوق الجماعي للحد الأدنى!",
                                           f"{g['title']} - السعر {g['group_price']} ر.س متاح الآن!",
                                           {"type": "group_buy", "group_buy_id": gid})
            except Exception:
                pass
    return {"message": "تم الانضمام", "participant_count": new_count,
            "min_reached": new_count >= g.get("min_participants", 10)}

@api_router.get("/group-buys/{gid}/participants")
async def gb_participants(gid: str):
    items = await db.group_buy_participants.find({"group_buy_id": gid}).to_list(200)
    return [serialize_doc(p) for p in items]


class CompetitionInput(BaseModel):
    title: str
    description: str = ""
    prize: str
    prize_count: int = 1
    # NEW: "qa" | "purchase" | "signup" | "general" | "ugc_video"
    competition_type: str = "general"
    question: str = ""
    correct_answer: str = ""
    options: List[str] = []           # For qa multiple choice
    required_product_id: str = ""
    spend_requirement: float = 0
    purchase_mode: str = "single"     # "single" | "accumulated"
    max_submissions_per_user: int = 1  # UGC only
    ugc_hashtag: str = ""
    start_date: str = ""
    end_date: str = ""
    draw_date: str = ""
    max_participants: int = 1000
    chamber_supervised: bool = False
    permit_number: str = ""
    assigned_chamber_employee_id: str = ""
    cover_image: str = ""
    prize_image: str = ""

@api_router.post("/merchant/competitions")
async def merchant_create_competition(data: CompetitionInput, user=Depends(get_current_user)):
    require_merchant(user)
    # Validation: qa competitions must have correct_answer and ≥2 options
    if data.competition_type == "qa":
        clean_opts = [o for o in (data.options or []) if o and o.strip()]
        if len(clean_opts) < 2:
            raise HTTPException(status_code=422, detail="مسابقة سؤال وجواب تحتاج خيارين على الأقل")
        if not data.correct_answer or not data.correct_answer.strip():
            raise HTTPException(status_code=422, detail="حدّد الإجابة الصحيحة")
        if data.correct_answer not in clean_opts:
            raise HTTPException(status_code=422, detail="الإجابة الصحيحة يجب أن تكون من ضمن الخيارات")
    doc = data.model_dump()
    doc.update({
        "status": "open",
        "joined_count": 0, "winners": [], "draw_history": [], "draw_video_url": "",
        "created_by_merchant": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    r = await db.competitions.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "Competition published"}

@api_router.put("/merchant/competitions/{cid}")
async def merchant_update_competition(cid: str, data: CompetitionInput, user=Depends(get_current_user)):
    require_merchant(user)
    await db.competitions.update_one({"_id": ObjectId(cid)}, {"$set": data.model_dump()})
    return {"message": "Updated"}

@api_router.delete("/merchant/competitions/{cid}")
async def merchant_delete_competition(cid: str, user=Depends(get_current_user)):
    require_merchant(user)
    await db.competitions.delete_one({"_id": ObjectId(cid)})
    await db.competition_entries.delete_many({"competition_id": cid})
    return {"message": "Deleted"}

@api_router.get("/merchant/competitions")
async def merchant_list_competitions(user=Depends(get_current_user)):
    require_merchant(user)
    comps = await db.competitions.find({}).sort("created_at", -1).to_list(100)
    return [serialize_doc(c) for c in comps]

# ─── Merchant: Chamber employees list (for assigning supervisor) ───
@api_router.get("/merchant/chamber-employees")
async def merchant_list_chamber_employees(user=Depends(get_current_user)):
    require_merchant(user)
    emps = await db.users.find({"role": "chamber"}).to_list(50)
    result = []
    for e in emps:
        e["id"] = str(e.pop("_id"))
        e.pop("password_hash", None)
        result.append({"id": e["id"], "name": e.get("name", ""), "phone": e.get("phone", ""), "email": e.get("email", "")})
    return result

class ChamberEmployeeInput(BaseModel):
    name: str
    phone: str
    password: str
    email: str = ""

@api_router.post("/merchant/chamber-employees")
async def merchant_create_chamber_employee(data: ChamberEmployeeInput, user=Depends(get_current_user)):
    require_merchant(user)
    if await db.users.count_documents({"phone": data.phone}) > 0:
        raise HTTPException(status_code=400, detail="Phone already registered")
    doc = {
        "phone": data.phone, "password_hash": hash_password(data.password),
        "name": data.name, "email": data.email, "city": "", "gender": "", "role": "chamber",
        "points": 0, "wallet_balance": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    r = await db.users.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "Chamber employee created"}

# ─── Q&A Answer Submission ───
@api_router.post("/competitions/{cid}/answer")
async def submit_answer(cid: str, request: Request, user=Depends(get_current_user)):
    body = await request.json()
    answer = (body.get("answer") or "").strip().lower()
    comp = await db.competitions.find_one({"_id": ObjectId(cid)})
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    if comp.get("competition_type") != "qa":
        raise HTTPException(status_code=400, detail="Not a Q&A competition")
    correct = (comp.get("correct_answer") or "").strip().lower()
    is_correct = answer == correct
    if is_correct:
        existing = await db.competition_entries.find_one({"competition_id": cid, "user_id": user["id"]})
        if not existing:
            await db.competition_entries.insert_one({
                "competition_id": cid, "user_id": user["id"], "user_name": user.get("name", ""),
                "user_phone": user.get("phone", ""), "entry_type": "qa_answer",
                "answer": answer, "created_at": datetime.now(timezone.utc).isoformat()
            })
            await db.competitions.update_one({"_id": ObjectId(cid)}, {"$inc": {"joined_count": 1}})
    return {"correct": is_correct, "entered": is_correct}

# NOTE: /competitions/{id}/join is defined once at the top of this file (~L266).

@api_router.post("/competitions/{cid}/draw-video")
async def save_draw_video(cid: str, request: Request, user=Depends(get_current_user)):
    if user.get("role") not in ["chamber", "merchant"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    video_url = body.get("video_url", "")
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url required")
    await db.competitions.update_one({"_id": ObjectId(cid)}, {"$set": {"draw_video_url": video_url}})
    return {"message": "Video saved"}


# ═══════════════════════════════════════════════════════════════════════════
# ─── UGC Video Competition endpoints ───
# ═══════════════════════════════════════════════════════════════════════════

class UGCSubmitInput(BaseModel):
    video: str          # storage path
    thumbnail: str = ""
    caption: str = ""
    hashtags: List[str] = []

@api_router.post("/competitions/{cid}/videos")
async def submit_ugc_video(cid: str, data: UGCSubmitInput, request: Request, user=Depends(get_current_user)):
    if not ObjectId.is_valid(cid): raise HTTPException(400)
    comp = await db.competitions.find_one({"_id": ObjectId(cid)})
    if not comp: raise HTTPException(404, "المسابقة غير موجودة")
    if comp.get("competition_type") != "ugc_video":
        raise HTTPException(400, "هذه المسابقة ليست من نوع UGC")
    cap = int(comp.get("max_submissions_per_user") or 1)
    existing = await db.competition_videos.count_documents({
        "competition_id": cid, "user_id": user["id"]
    })
    if existing >= cap:
        raise HTTPException(400, f"وصلت الحد الأقصى ({cap} فيديو)")
    # Anti-fraud: limit 5 submissions from same IP per competition
    client_ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    if client_ip:
        ip_subs = await db.competition_videos.count_documents({"competition_id": cid, "client_ip": client_ip})
        if ip_subs >= 5:
            raise HTTPException(429, "تم تجاوز الحد المسموح من نفس الشبكة (5)")
    doc = {
        "competition_id": cid,
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "user_avatar": user.get("avatar", ""),
        "client_ip": client_ip,
        "video": data.video,
        "thumbnail": data.thumbnail,
        "caption": data.caption,
        "hashtags": data.hashtags,
        "likes": 0, "comments": 0, "views": 0, "shares": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.competition_videos.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "تم رفع الفيديو"}

@api_router.get("/competitions/{cid}/videos")
async def list_ugc_videos(cid: str, user=Depends(get_current_user)):
    """Returns all videos for a competition sorted by likes DESC (leaderboard)."""
    videos = await db.competition_videos.find({"competition_id": cid}).sort("likes", -1).to_list(200)
    # Attach current user's like state
    my_likes = set()
    if user and user.get("id"):
        liked = await db.competition_video_likes.find({"user_id": user["id"]}).to_list(500)
        my_likes = {l["video_id"] for l in liked}
    result = []
    for i, v in enumerate(videos):
        v["id"] = str(v.pop("_id"))
        v["rank"] = i + 1
        v["liked_by_me"] = v["id"] in my_likes
        result.append(v)
    return result

@api_router.post("/competitions/{cid}/videos/{vid}/like")
async def toggle_like_ugc_video(cid: str, vid: str, request: Request, user=Depends(get_current_user)):
    """1 like per user per video. Toggle. Anti-fraud: max 5 unique liking accounts per IP per competition."""
    existing = await db.competition_video_likes.find_one({
        "video_id": vid, "user_id": user["id"]
    })
    if existing:
        await db.competition_video_likes.delete_one({"_id": existing["_id"]})
        await db.competition_videos.update_one({"_id": ObjectId(vid)}, {"$inc": {"likes": -1}})
        return {"liked": False}
    # Anti-fraud: check distinct users from same IP for this competition
    client_ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    if client_ip:
        # Count distinct user_ids that have liked ANY video in this competition from this IP
        pipeline = [
            {"$match": {"competition_id": cid, "client_ip": client_ip}},
            {"$group": {"_id": "$user_id"}},
            {"$count": "n"},
        ]
        agg = await db.competition_video_likes.aggregate(pipeline).to_list(1)
        distinct_users = (agg[0]["n"] if agg else 0)
        # If this is a new user_id from this IP AND we already have 5, block
        if distinct_users >= 5:
            already_from_ip = await db.competition_video_likes.find_one({"user_id": user["id"], "client_ip": client_ip, "competition_id": cid})
            if not already_from_ip:
                raise HTTPException(429, "تم تجاوز الحد المسموح من الحسابات من نفس الشبكة (5) — حماية من الغش")
    await db.competition_video_likes.insert_one({
        "video_id": vid, "user_id": user["id"],
        "competition_id": cid,
        "client_ip": client_ip,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.competition_videos.update_one({"_id": ObjectId(vid)}, {"$inc": {"likes": 1}})
    return {"liked": True}

class UGCCommentInput(BaseModel):
    text: str

@api_router.post("/competitions/{cid}/videos/{vid}/comment")
async def comment_ugc_video(cid: str, vid: str, data: UGCCommentInput, user=Depends(get_current_user)):
    if not data.text.strip():
        raise HTTPException(400, "التعليق فارغ")
    await db.competition_video_comments.insert_one({
        "video_id": vid,
        "competition_id": cid,
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "text": data.text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.competition_videos.update_one({"_id": ObjectId(vid)}, {"$inc": {"comments": 1}})
    return {"message": "تم إضافة التعليق"}

@api_router.get("/competitions/{cid}/videos/{vid}/comments")
async def list_ugc_comments(cid: str, vid: str):
    comms = await db.competition_video_comments.find({"video_id": vid}).sort("created_at", -1).to_list(200)
    return serialize_docs(comms)

@api_router.post("/competitions/{cid}/videos/{vid}/share")
async def share_ugc_video(cid: str, vid: str, user=Depends(get_current_user)):
    await db.competition_videos.update_one({"_id": ObjectId(vid)}, {"$inc": {"shares": 1}})
    return {"ok": True}

@api_router.post("/competitions/{cid}/videos/{vid}/view")
async def view_ugc_video(cid: str, vid: str):
    await db.competition_videos.update_one({"_id": ObjectId(vid)}, {"$inc": {"views": 1}})
    return {"ok": True}

@api_router.post("/competitions/{cid}/auto-finalize")
async def auto_finalize_ugc(cid: str, user=Depends(get_current_user)):
    """Auto-select UGC winners by like count. Callable by merchant, chamber, or system."""
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403)
    if not ObjectId.is_valid(cid): raise HTTPException(400)
    comp = await db.competitions.find_one({"_id": ObjectId(cid)})
    if not comp: raise HTTPException(404)
    if comp.get("competition_type") != "ugc_video":
        raise HTTPException(400, "ليست UGC")
    prize_count = int(comp.get("prize_count") or 1)
    top = await db.competition_videos.find({"competition_id": cid}).sort("likes", -1).limit(prize_count).to_list(prize_count)
    winners = [{
        "user_id": v.get("user_id"),
        "user_name": v.get("user_name"),
        "video_id": str(v["_id"]),
        "likes": v.get("likes", 0),
        "rank": i + 1,
    } for i, v in enumerate(top)]
    await db.competitions.update_one(
        {"_id": ObjectId(cid)},
        {"$set": {"winners": winners, "status": "ended",
                  "finalized_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"winners": winners}


# ─── Social: Reply to comment ───
@api_router.post("/social/posts/{post_id}/comments/{comment_id}/reply")
async def reply_to_comment(post_id: str, comment_id: str, request: Request, user=Depends(get_current_user)):
    body = await request.json()
    await db.social_comments.insert_one({
        "post_id": post_id,
        "parent_comment_id": comment_id,
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "is_merchant": user.get("role") == "merchant",
        "text": body.get("text", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    await db.social_posts.update_one({"_id": ObjectId(post_id)}, {"$inc": {"comments": 1}})
    return {"message": "Reply added"}

# ─── Cloudinary Setup ───
import cloudinary
import cloudinary.uploader
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME", "dyujjjvb2"),
    api_key=os.getenv("CLOUDINARY_API_KEY", "481658855999211"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET", "PcLD2c2kSvdDvefY36aeKX3tfac"),
    secure=True,
)

@api_router.post("/upload/signature")
async def get_upload_signature(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    folder = body.get("folder", "zitex/general")
    resource_type = body.get("resource_type", "auto")
    import time
    timestamp = int(time.time())
    params_to_sign = {"timestamp": timestamp, "folder": folder}
    signature = cloudinary.utils.api_sign_request(params_to_sign, cloudinary.config().api_secret)
    return {"signature": signature, "timestamp": timestamp,
            "api_key": cloudinary.config().api_key, "cloud_name": cloudinary.config().cloud_name,
            "folder": folder, "resource_type": resource_type}

# ═══════════════════════════════════════════════════
# DELIVERY SYSTEM (branches + drivers + assignments + tracking)
# ═══════════════════════════════════════════════════
import math

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "AIzaSyDEQ58ECgaiL1XXWguUecTRKsPMxO6wMZE")

def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two GPS points."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def point_in_polygon(lat, lng, polygon):
    """Ray-casting point-in-polygon. polygon = [[lat,lng], ...]"""
    if not polygon or len(polygon) < 3:
        return False
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i][0], polygon[i][1]
        yj, xj = polygon[j][0], polygon[j][1]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside

def require_driver(user):
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver access only")

# ─── Branches CRUD (merchant) ───
class BranchInput(BaseModel):
    name: str
    address: str
    lat: float
    lng: float
    phone: str = ""
    open_hours: str = "9:00 AM - 11:00 PM"
    published: bool = True
    # Advanced
    email: str = ""
    manager_id: str = ""      # employee_id of branch manager
    city: str = ""
    district: str = ""
    is_main: bool = False     # Main branch (headquarters)
    working_days: List[str] = ["sat", "sun", "mon", "tue", "wed", "thu"]  # closed = fri by default
    branch_code: str = ""     # e.g. "RUH-01" for internal reference

# ─── Merchant list branches (all, not just published) ───
@api_router.get("/merchant/branches")
async def merchant_list_branches(user=Depends(get_current_user)):
    require_merchant(user)
    bs = await db.branches.find({}).sort("is_main", -1).to_list(200)
    return [serialize_doc(b) for b in bs]

# ─── Branch statistics (aggregated) ───
@api_router.get("/merchant/branches/{bid}/stats")
async def branch_stats(bid: str, user=Depends(get_current_user)):
    require_merchant(user)
    # Employees assigned
    emp_count = await db.users.count_documents({"role": "employee", "branch_ids": bid})
    # Orders in this branch
    total_orders = await db.orders.count_documents({"branch_id": bid})
    pending_orders = await db.orders.count_documents({"branch_id": bid, "status": {"$in": ["pending", "processing", "ready"]}})
    # Revenue this month
    from datetime import datetime, timedelta
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    revenue_cursor = db.orders.aggregate([
        {"$match": {"branch_id": bid, "status": "delivered", "created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ])
    revenue = 0
    async for r in revenue_cursor: revenue = r.get("total", 0)
    return {
        "employees": emp_count,
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "revenue_month": revenue,
    }

# ─── Branch inventory (products with branch-specific stock) ───
def _normalize_inventory_doc(inv: dict) -> dict:
    """Ensure inventory doc has both legacy and new channel fields.

    Modes:
      - "combined" (default): single pool `quantity` used for both store & app sales.
      - "separate": `stock_store` and `stock_app` are tracked independently.
    """
    mode = inv.get("inventory_mode") or "combined"
    total = int(inv.get("quantity", 0) or 0)
    store = inv.get("stock_store")
    apps = inv.get("stock_app")
    if mode == "separate":
        store = int(store if store is not None else total)
        apps = int(apps if apps is not None else 0)
        total = store + apps
    else:
        store = int(store if store is not None else total)
        apps = int(apps if apps is not None else total)
    return {
        "inventory_mode": mode,
        "quantity": total,
        "stock_store": store,
        "stock_app": apps,
        "min_alert": int(inv.get("min_alert", 5) or 5),
        "inventory_type": inv.get("inventory_type", "both"),
    }

async def decrement_channel_stock(branch_id: str, product_id: str, qty: int, channel: str = "store"):
    """Decrement stock for a given channel (`store` for POS, `app` for online orders).

    - In `combined` mode: decrement `quantity`, `stock_store`, `stock_app` together.
    - In `separate` mode: decrement only the channel's dedicated pool and mirror to `quantity`.
    Also emits a low-stock alert record when threshold is crossed.
    """
    if not branch_id or not product_id or qty <= 0:
        return
    inv = await db.branch_inventory.find_one({"branch_id": branch_id, "product_id": product_id})
    if not inv:
        # No branch stock configured — fall back to global product decrement (legacy)
        return
    normalized = _normalize_inventory_doc(inv)
    mode = normalized["inventory_mode"]
    if mode == "separate":
        field = "stock_store" if channel == "store" else "stock_app"
        new_val = max(0, normalized[field] - qty)
        await db.branch_inventory.update_one(
            {"branch_id": branch_id, "product_id": product_id},
            {"$set": {field: new_val, "quantity": (normalized["stock_store"] if field != "stock_store" else new_val) + (normalized["stock_app"] if field != "stock_app" else new_val), "last_updated": datetime.now(timezone.utc).isoformat()}},
        )
        remaining = new_val
    else:
        new_val = max(0, normalized["quantity"] - qty)
        await db.branch_inventory.update_one(
            {"branch_id": branch_id, "product_id": product_id},
            {"$set": {"quantity": new_val, "stock_store": new_val, "stock_app": new_val, "last_updated": datetime.now(timezone.utc).isoformat()}},
        )
        remaining = new_val
    # Log low-stock alert
    if remaining <= normalized["min_alert"]:
        await db.stock_alerts.insert_one({
            "branch_id": branch_id, "product_id": product_id,
            "channel": channel, "remaining": remaining,
            "min_alert": normalized["min_alert"],
            "resolved": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

@api_router.get("/merchant/branches/{bid}/inventory")
async def branch_inventory(bid: str, user=Depends(get_current_user)):
    require_merchant(user)
    inventory = await db.branch_inventory.find({"branch_id": bid}).to_list(500)
    # Enrich with product info
    result = []
    for inv in inventory:
        p = await db.products.find_one({"_id": ObjectId(inv["product_id"])}) if ObjectId.is_valid(inv.get("product_id", "")) else None
        if p:
            norm = _normalize_inventory_doc(inv)
            result.append({
                "id": str(inv["_id"]),
                "product_id": inv["product_id"],
                "product_name": p.get("name_ar") or p.get("name_en"),
                "product_image": (p.get("images") or [None])[0],
                "quantity": norm["quantity"],
                "stock_store": norm["stock_store"],
                "stock_app": norm["stock_app"],
                "inventory_mode": norm["inventory_mode"],
                "min_alert": norm["min_alert"],
                "inventory_type": norm["inventory_type"],
                "is_low": (norm["stock_store"] <= norm["min_alert"]) or (norm["stock_app"] <= norm["min_alert"]) if norm["inventory_mode"] == "separate" else (norm["quantity"] <= norm["min_alert"]),
                "last_updated": inv.get("last_updated"),
            })
    return result

@api_router.put("/merchant/branches/{bid}/inventory/{pid}")
async def set_branch_inventory(bid: str, pid: str, request: Request, user=Depends(get_current_user)):
    require_merchant(user)
    body = await request.json()
    mode = body.get("inventory_mode") or ("separate" if ("stock_store" in body or "stock_app" in body) else "combined")
    if mode == "separate":
        store = int(body.get("stock_store", 0) or 0)
        apps = int(body.get("stock_app", 0) or 0)
        total = store + apps
    else:
        total = int(body.get("quantity", 0) or 0)
        store = total
        apps = total
    await db.branch_inventory.update_one(
        {"branch_id": bid, "product_id": pid},
        {"$set": {
            "branch_id": bid, "product_id": pid,
            "quantity": total,
            "stock_store": store,
            "stock_app": apps,
            "inventory_mode": mode,
            "min_alert": int(body.get("min_alert", 5) or 5),
            "inventory_type": body.get("inventory_type", "both"),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "Updated", "quantity": total, "stock_store": store, "stock_app": apps, "inventory_mode": mode}

# ─── Unified inventory dashboard (across all branches) ───
@api_router.get("/merchant/inventory")
async def merchant_inventory_overview(user=Depends(get_current_user), channel: Optional[str] = None):
    """Aggregate view of inventory across every branch.
    Optional `channel` filter: 'store' | 'app' | 'both'.
    """
    require_merchant(user)
    branches = {str(b["_id"]): b for b in await db.branches.find({}).to_list(200)}
    invs = await db.branch_inventory.find({}).to_list(2000)
    items = []
    totals = {"total_units": 0, "store_units": 0, "app_units": 0, "low_stock": 0, "out_of_stock": 0}
    for inv in invs:
        norm = _normalize_inventory_doc(inv)
        if channel == "store" and norm["inventory_type"] not in ("store", "both"):
            continue
        if channel == "app" and norm["inventory_type"] not in ("app", "both"):
            continue
        p = await db.products.find_one({"_id": ObjectId(inv["product_id"])}) if ObjectId.is_valid(inv.get("product_id", "")) else None
        if not p:
            continue
        b = branches.get(inv.get("branch_id"))
        low = (norm["stock_store"] <= norm["min_alert"]) or (norm["stock_app"] <= norm["min_alert"]) if norm["inventory_mode"] == "separate" else (norm["quantity"] <= norm["min_alert"])
        out = norm["quantity"] == 0
        totals["total_units"] += norm["quantity"]
        totals["store_units"] += norm["stock_store"] if norm["inventory_mode"] == "separate" else norm["quantity"]
        totals["app_units"] += norm["stock_app"] if norm["inventory_mode"] == "separate" else norm["quantity"]
        if low: totals["low_stock"] += 1
        if out: totals["out_of_stock"] += 1
        items.append({
            "product_id": inv["product_id"],
            "product_name": p.get("name_ar") or p.get("name_en"),
            "product_image": (p.get("images") or [None])[0],
            "price": p.get("price", 0),
            "branch_id": inv.get("branch_id"),
            "branch_name": (b.get("name") or b.get("name_ar") or b.get("name_en") or "—") if b else "—",
            "quantity": norm["quantity"],
            "stock_store": norm["stock_store"],
            "stock_app": norm["stock_app"],
            "inventory_mode": norm["inventory_mode"],
            "min_alert": norm["min_alert"],
            "inventory_type": norm["inventory_type"],
            "is_low": low,
            "is_out": out,
        })
    items.sort(key=lambda x: (0 if x["is_out"] else (1 if x["is_low"] else 2), x["product_name"]))
    return {"totals": totals, "items": items}

@api_router.get("/merchant/inventory/alerts")
async def merchant_inventory_alerts(user=Depends(get_current_user), limit: int = 100):
    """Only low-stock / out-of-stock rows, ordered by severity."""
    require_merchant(user)
    result = await merchant_inventory_overview(user=user)
    alerts = [it for it in result["items"] if it["is_low"] or it["is_out"]]
    return {"totals": result["totals"], "alerts": alerts[:limit]}

@api_router.post("/merchant/inventory/{bid}/{pid}/adjust")
async def merchant_inventory_adjust(bid: str, pid: str, request: Request, user=Depends(get_current_user)):
    """Quick +/- adjustment for a specific channel or combined pool.
    Body: { delta: int, channel: 'store'|'app'|'combined', reason?: str }
    """
    require_merchant(user)
    body = await request.json()
    delta = int(body.get("delta", 0))
    channel = body.get("channel", "combined")
    reason = body.get("reason", "")
    inv = await db.branch_inventory.find_one({"branch_id": bid, "product_id": pid})
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    norm = _normalize_inventory_doc(inv)
    if norm["inventory_mode"] == "separate" and channel in ("store", "app"):
        field = "stock_store" if channel == "store" else "stock_app"
        new_val = max(0, norm[field] + delta)
        other_val = norm["stock_app"] if field == "stock_store" else norm["stock_store"]
        await db.branch_inventory.update_one(
            {"branch_id": bid, "product_id": pid},
            {"$set": {field: new_val, "quantity": new_val + other_val, "last_updated": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        new_val = max(0, norm["quantity"] + delta)
        await db.branch_inventory.update_one(
            {"branch_id": bid, "product_id": pid},
            {"$set": {"quantity": new_val, "stock_store": new_val, "stock_app": new_val, "last_updated": datetime.now(timezone.utc).isoformat()}},
        )
    await db.stock_movements.insert_one({
        "branch_id": bid, "product_id": pid, "channel": channel,
        "delta": delta, "reason": reason, "by_user": user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"message": "Adjusted", "delta": delta, "channel": channel}

@api_router.get("/merchant/inventory/movements")
async def merchant_inventory_movements(user=Depends(get_current_user), limit: int = 50):
    require_merchant(user)
    movs = await db.stock_movements.find({}).sort("created_at", -1).to_list(limit)
    return [serialize_doc(m) for m in movs]

@api_router.get("/branches")
async def list_branches():
    bs = await db.branches.find({"published": True}).to_list(50)
    return [serialize_doc(b) for b in bs]

@api_router.get("/branches/nearest")
async def nearest_branch(lat: float, lng: float):
    bs = await db.branches.find({"published": True}).to_list(50)
    if not bs: return {"branch": None, "distance_km": 0}
    sorted_bs = sorted(bs, key=lambda b: haversine_km(lat, lng, b.get("lat", 0), b.get("lng", 0)))
    nearest = sorted_bs[0]
    nearest["id"] = str(nearest.pop("_id"))
    nearest["distance_km"] = round(haversine_km(lat, lng, nearest.get("lat", 0), nearest.get("lng", 0)), 2)
    return {"branch": nearest, "distance_km": nearest["distance_km"]}

@api_router.post("/merchant/branches")
async def create_branch(data: BranchInput, user=Depends(get_current_user)):
    require_merchant(user)
    doc = data.model_dump()
    # Auto-generate branch code if empty
    if not doc.get("branch_code"):
        count = await db.branches.count_documents({})
        doc["branch_code"] = f"BR-{count+1:03d}"
    # If this is set as main, unset others
    if doc.get("is_main"):
        await db.branches.update_many({"is_main": True}, {"$set": {"is_main": False}})
    r = await db.branches.insert_one(doc)
    return {"id": str(r.inserted_id), "branch_code": doc["branch_code"]}

@api_router.put("/merchant/branches/{bid}")
async def update_branch(bid: str, data: BranchInput, user=Depends(get_current_user)):
    require_merchant(user)
    doc = data.model_dump()
    if doc.get("is_main"):
        await db.branches.update_many({"_id": {"$ne": ObjectId(bid)}, "is_main": True}, {"$set": {"is_main": False}})
    await db.branches.update_one({"_id": ObjectId(bid)}, {"$set": doc})
    return {"message": "Updated"}

@api_router.delete("/merchant/branches/{bid}")
async def delete_branch(bid: str, user=Depends(get_current_user)):
    require_merchant(user)
    await db.branches.delete_one({"_id": ObjectId(bid)})
    return {"message": "Deleted"}

# ─── Delivery Settings (merchant) ───
@api_router.get("/delivery/settings")
async def get_delivery_settings():
    s = await db.settings.find_one({"key": "delivery"})
    if not s:
        s = {"base_fee": 10, "base_distance_km": 10, "per_km_rate": 1.2,
             "free_delivery_threshold": 0, "max_distance_km": 50,
             "same_day_enabled": True, "same_day_flat_price": 30,
             "scheduled_enabled": True, "scheduled_flat_price": 20,
             "scheduled_slots": [
                 {"label": "صباحاً 9 - 12", "start": "09:00", "end": "12:00"},
                 {"label": "ظهراً 12 - 4", "start": "12:00", "end": "16:00"},
                 {"label": "مساءً 4 - 8", "start": "16:00", "end": "20:00"},
                 {"label": "ليلاً 8 - 11", "start": "20:00", "end": "23:00"},
             ],
             "zones": []}
    s.pop("_id", None); s.pop("key", None)
    return s

@api_router.put("/merchant/delivery/settings")
async def update_delivery_settings(request: Request, user=Depends(get_current_user)):
    require_merchant(user)
    body = await request.json()
    await db.settings.update_one({"key": "delivery"}, {"$set": {**body, "key": "delivery"}}, upsert=True)
    return {"message": "Updated"}

@api_router.post("/delivery/calculate-fee")
async def calculate_delivery_fee(request: Request):
    body = await request.json()
    distance_km = body.get("distance_km", 0)
    customer_lat = body.get("lat", 0)
    customer_lng = body.get("lng", 0)
    delivery_type = body.get("delivery_type", "standard")  # "same_day" | "scheduled" | "standard"
    s = await db.settings.find_one({"key": "delivery"}) or {}

    # Check zones — polygon first, then circle, only if delivery_type matches (or zone allows all)
    zones = s.get("zones", [])
    for z in zones:
        z_type = z.get("delivery_type", "any")
        if z_type != "any" and z_type != delivery_type:
            continue
        matched = False
        polygon = z.get("polygon", [])  # [[lat,lng], ...]
        if polygon and len(polygon) >= 3 and customer_lat and customer_lng:
            if point_in_polygon(customer_lat, customer_lng, polygon):
                matched = True
        elif customer_lat and customer_lng and z.get("center_lat"):
            d = haversine_km(customer_lat, customer_lng, z.get("center_lat", 0), z.get("center_lng", 0))
            if d <= z.get("radius_km", 0):
                matched = True
        if matched:
            return {
                "distance_km": round(distance_km, 2) if distance_km else 0,
                "delivery_fee": z.get("fixed_price", 0),
                "zone_name": z.get("name", ""),
                "delivery_type": delivery_type,
                "in_zone": True,
                "estimated_minutes": z.get("eta_minutes", 60 if delivery_type == "same_day" else 30),
            }

    # Same-day flat rate if no zone match
    if delivery_type == "same_day":
        if not s.get("same_day_enabled", True):
            raise HTTPException(status_code=400, detail="Same-day delivery is not available")
        fee = s.get("same_day_flat_price", 30)
        return {"distance_km": distance_km, "delivery_fee": fee, "delivery_type": "same_day",
                "in_zone": False, "estimated_minutes": 90}

    # Scheduled flat rate if no zone match
    if delivery_type == "scheduled":
        if not s.get("scheduled_enabled", True):
            raise HTTPException(status_code=400, detail="Scheduled delivery is not available")
        fee = s.get("scheduled_flat_price", 20)
        return {"distance_km": distance_km, "delivery_fee": fee, "delivery_type": "scheduled",
                "in_zone": False, "scheduled_slots": s.get("scheduled_slots", [])}

    # Standard: distance-based
    base_fee = s.get("base_fee", 10)
    base_dist = s.get("base_distance_km", 10)
    per_km = s.get("per_km_rate", 1.2)
    max_dist = s.get("max_distance_km", 50)
    if distance_km > max_dist:
        raise HTTPException(status_code=400, detail=f"Out of delivery range (max {max_dist} km)")
    if distance_km <= base_dist:
        fee = base_fee
    else:
        fee = base_fee + (distance_km - base_dist) * per_km
    return {"distance_km": distance_km, "delivery_fee": round(fee, 2),
            "base_fee": base_fee, "base_distance_km": base_dist, "per_km_rate": per_km,
            "delivery_type": "standard", "in_zone": False, "estimated_minutes": 45}

# ─── Smart delivery quote (handles items, branch availability, alternative branch) ───
@api_router.post("/delivery/quote")
async def delivery_quote(request: Request):
    """Compute full quote: nearest branch, fee, branch-fallback if out-of-stock."""
    body = await request.json()
    lat = body.get("lat", 0)
    lng = body.get("lng", 0)
    delivery_type = body.get("delivery_type", "standard")
    item_ids = body.get("item_ids", [])  # list of product ids needed in branch stock

    # 1. Get all branches sorted by distance
    bs = await db.branches.find({"published": True}).to_list(50)
    if not bs:
        raise HTTPException(status_code=400, detail="No branches available")
    for b in bs:
        b["_dist"] = haversine_km(lat, lng, b.get("lat", 0), b.get("lng", 0))
    bs.sort(key=lambda x: x["_dist"])

    # 2. Find first branch that has ALL requested items in stock
    chosen = None
    alternative = None
    if item_ids:
        for b in bs:
            stock_map = b.get("stock", {}) or {}
            all_available = all(stock_map.get(str(iid), 1) > 0 for iid in item_ids)
            if all_available:
                chosen = b
                break
        if not chosen:
            # No branch has all items — pick the one with most items in stock
            def avail_count(b):
                sm = b.get("stock", {}) or {}
                return sum(1 for iid in item_ids if sm.get(str(iid), 1) > 0)
            bs.sort(key=lambda x: (-avail_count(x), x["_dist"]))
            chosen = bs[0]
            alternative = {
                "reason": "Some items not available in nearest branch",
                "available_count": avail_count(chosen),
                "total_requested": len(item_ids),
            }
    else:
        chosen = bs[0]

    # 3. Calculate fee from chosen branch
    distance_km = chosen["_dist"]
    fake_request_body = {"distance_km": distance_km, "lat": lat, "lng": lng, "delivery_type": delivery_type}

    class FakeReq:
        async def json(self): return fake_request_body
    fee_result = await calculate_delivery_fee(FakeReq())  # type: ignore

    chosen["id"] = str(chosen.pop("_id"))
    chosen["distance_km"] = round(distance_km, 2)
    chosen.pop("_dist", None)

    return {
        "branch": chosen,
        "fee": fee_result,
        "alternative_note": alternative,
    }

# ─── Drivers CRUD (merchant) ───
class DriverInput(BaseModel):
    name: str
    phone: str
    password: str = ""
    vehicle_info: str = ""
    payment_model: str = "commission"  # "salary" | "commission"
    salary_monthly: float = 0
    bonus_threshold_orders: int = 20
    bonus_per_extra_order: float = 2
    commission_type: str = "fixed"  # "fixed" | "percentage"
    merchant_commission_value: float = 5  # SAR (fixed) or % of delivery fee

@api_router.post("/merchant/drivers")
async def create_driver(data: DriverInput, user=Depends(get_current_user)):
    require_merchant(user)
    if await db.users.count_documents({"phone": data.phone}) > 0:
        raise HTTPException(status_code=400, detail="Phone already exists")
    user_doc = {"phone": data.phone, "password_hash": hash_password(data.password or "driver1234"),
                "name": data.name, "email": "", "city": "", "gender": "", "role": "driver",
                "points": 0, "wallet_balance": 0,
                "created_at": datetime.now(timezone.utc).isoformat()}
    u = await db.users.insert_one(user_doc)
    driver_doc = {"user_id": str(u.inserted_id), "vehicle_info": data.vehicle_info,
                  "payment_model": data.payment_model, "salary_monthly": data.salary_monthly,
                  "bonus_threshold_orders": data.bonus_threshold_orders, "bonus_per_extra_order": data.bonus_per_extra_order,
                  "commission_type": data.commission_type, "merchant_commission_value": data.merchant_commission_value,
                  "online": False, "current_lat": 0, "current_lng": 0, "last_location_at": "",
                  "total_deliveries": 0, "today_deliveries": 0, "today_earnings": 0,
                  "created_at": datetime.now(timezone.utc).isoformat()}
    await db.drivers.insert_one(driver_doc)
    return {"id": str(u.inserted_id), "message": "Driver created"}

@api_router.get("/merchant/drivers")
async def list_drivers(user=Depends(get_current_user)):
    require_merchant(user)
    drivers = await db.drivers.find({}).to_list(100)
    result = []
    for d in drivers:
        d["id"] = str(d.pop("_id"))
        u = await db.users.find_one({"_id": ObjectId(d["user_id"])}) if ObjectId.is_valid(d.get("user_id", "")) else None
        if u:
            d["name"] = u.get("name", "")
            d["phone"] = u.get("phone", "")
            d["wallet_balance"] = u.get("wallet_balance", 0)
        result.append(d)
    return result

@api_router.put("/merchant/drivers/{did}")
async def update_driver(did: str, data: DriverInput, user=Depends(get_current_user)):
    require_merchant(user)
    upd = data.model_dump(); upd.pop("phone", None); upd.pop("password", None)
    await db.drivers.update_one({"_id": ObjectId(did)}, {"$set": upd})
    return {"message": "Updated"}

@api_router.delete("/merchant/drivers/{did}")
async def delete_driver(did: str, user=Depends(get_current_user)):
    require_merchant(user)
    d = await db.drivers.find_one({"_id": ObjectId(did)})
    if d and d.get("user_id"):
        await db.users.delete_one({"_id": ObjectId(d["user_id"])})
    await db.drivers.delete_one({"_id": ObjectId(did)})
    return {"message": "Deleted"}

# ─── Driver Endpoints (driver-only) ───
@api_router.get("/driver/profile")
async def driver_profile(user=Depends(get_current_user)):
    require_driver(user)
    d = await db.drivers.find_one({"user_id": user["id"]})
    if not d: raise HTTPException(status_code=404, detail="Driver profile not found")
    d["id"] = str(d.pop("_id"))
    d["name"] = user.get("name", ""); d["phone"] = user.get("phone", "")
    d["wallet_balance"] = user.get("wallet_balance", 0)
    return d

@api_router.post("/driver/online")
async def set_driver_online(request: Request, user=Depends(get_current_user)):
    require_driver(user)
    body = await request.json()
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"online": bool(body.get("online", True))}})
    return {"message": "Status updated"}

@api_router.post("/driver/location")
async def update_driver_location(request: Request, user=Depends(get_current_user)):
    require_driver(user)
    body = await request.json()
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {
        "current_lat": body.get("lat", 0), "current_lng": body.get("lng", 0),
        "last_location_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Location updated"}

@api_router.get("/driver/active-orders")
async def driver_active_orders(user=Depends(get_current_user)):
    require_driver(user)
    orders = await db.orders.find({"driver_id": user["id"], "status": {"$in": ["assigned", "picked_up"]}}).to_list(20)
    return [serialize_doc(o) for o in orders]

@api_router.get("/driver/available-orders")
async def driver_available_orders(user=Depends(get_current_user)):
    require_driver(user)
    orders = await db.orders.find({"status": "ready_for_pickup", "driver_id": {"$in": [None, ""]}}).sort("created_at", 1).to_list(20)
    return [serialize_doc(o) for o in orders]

@api_router.post("/driver/orders/{oid}/accept")
async def driver_accept_order(oid: str, user=Depends(get_current_user)):
    require_driver(user)
    o = await db.orders.find_one({"_id": ObjectId(oid)})
    if not o: raise HTTPException(status_code=404, detail="Not found")
    if o.get("driver_id"): raise HTTPException(status_code=400, detail="Already assigned")
    await db.orders.update_one({"_id": ObjectId(oid)}, {"$set": {
        "driver_id": user["id"], "driver_name": user.get("name", ""),
        "driver_phone": user.get("phone", ""), "status": "assigned",
        "accepted_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Accepted"}

@api_router.post("/driver/orders/{oid}/pickup")
async def driver_pickup_order(oid: str, user=Depends(get_current_user)):
    require_driver(user)
    await db.orders.update_one({"_id": ObjectId(oid), "driver_id": user["id"]},
        {"$set": {"status": "picked_up", "picked_up_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Picked up"}

@api_router.post("/driver/orders/{oid}/deliver")
async def driver_deliver_order(oid: str, user=Depends(get_current_user)):
    require_driver(user)
    o = await db.orders.find_one({"_id": ObjectId(oid), "driver_id": user["id"]})
    if not o: raise HTTPException(status_code=404, detail="Not found")
    # Calculate earnings
    d = await db.drivers.find_one({"user_id": user["id"]})
    delivery_fee = o.get("delivery_fee", 0)
    earnings = 0
    merchant_cut = 0
    if d and d.get("payment_model") == "commission":
        if d.get("commission_type") == "percentage":
            merchant_cut = delivery_fee * (d.get("merchant_commission_value", 0) / 100)
        else:
            merchant_cut = d.get("merchant_commission_value", 0)
        earnings = max(delivery_fee - merchant_cut, 0)
    # Update order
    await db.orders.update_one({"_id": ObjectId(oid)}, {"$set": {
        "status": "delivered", "delivered_at": datetime.now(timezone.utc).isoformat(),
        "driver_earnings": earnings, "merchant_cut": merchant_cut}})
    # Add earnings to driver wallet
    if earnings > 0:
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$inc": {"wallet_balance": earnings}})
        await db.driver_transactions.insert_one({
            "driver_id": user["id"], "order_id": oid, "amount": earnings,
            "type": "delivery_earnings", "created_at": datetime.now(timezone.utc).isoformat()})
    # Update driver stats
    today = datetime.now(timezone.utc).date().isoformat()
    await db.drivers.update_one({"user_id": user["id"]}, {"$inc": {"total_deliveries": 1, "today_deliveries": 1, "today_earnings": earnings}})
    return {"message": "Delivered", "earnings": earnings}

@api_router.get("/driver/history")
async def driver_history(user=Depends(get_current_user)):
    require_driver(user)
    orders = await db.orders.find({"driver_id": user["id"], "status": "delivered"}).sort("delivered_at", -1).limit(50).to_list(50)
    return [serialize_doc(o) for o in orders]

@api_router.get("/driver/transactions")
async def driver_transactions(user=Depends(get_current_user)):
    require_driver(user)
    txs = await db.driver_transactions.find({"driver_id": user["id"]}).sort("created_at", -1).limit(100).to_list(100)
    return [serialize_doc(t) for t in txs]

# ─── Customer Location & Order Tracking ───
@api_router.put("/users/me/location")
async def save_user_location(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {
        "default_lat": body.get("lat", 0), "default_lng": body.get("lng", 0),
        "default_address": body.get("address", "")}})
    return {"message": "Location saved"}

@api_router.get("/orders/{oid}/tracking-driver")
async def order_tracking_driver(oid: str, user=Depends(get_current_user)):
    """Lightweight: just driver coords. Used internally if needed."""
    o = await db.orders.find_one({"_id": ObjectId(oid)})
    if not o: raise HTTPException(status_code=404, detail="Not found")
    if o.get("driver_id"):
        d = await db.drivers.find_one({"user_id": o["driver_id"]})
        if d:
            return {"driver_lat": d.get("current_lat", 0), "driver_lng": d.get("current_lng", 0),
                    "last_seen": d.get("last_location_at", "")}
    return {"driver_lat": None, "driver_lng": None}

# ─── Auto-assign order to nearest driver ───
@api_router.post("/merchant/orders/{oid}/mark-ready")
async def mark_order_ready(oid: str, user=Depends(get_current_user)):
    """Mark order as ready for pickup. Drivers will see it in available orders."""
    require_merchant(user)
    o = await db.orders.find_one({"_id": ObjectId(oid)})
    if not o: raise HTTPException(status_code=404, detail="Not found")
    await db.orders.update_one({"_id": ObjectId(oid)}, {"$set": {"status": "ready_for_pickup",
        "marked_ready_at": datetime.now(timezone.utc).isoformat()}})
    # Try to auto-assign to nearest online driver
    branch_lat = o.get("branch_lat", 0); branch_lng = o.get("branch_lng", 0)
    drivers = await db.drivers.find({"online": True}).to_list(100)
    if drivers and branch_lat:
        # Find drivers with no active order
        free_drivers = []
        for d in drivers:
            active = await db.orders.count_documents({"driver_id": d.get("user_id"), "status": {"$in": ["assigned", "picked_up"]}})
            if active < 5:  # allow up to 5 simultaneous
                d["_dist"] = haversine_km(branch_lat, branch_lng, d.get("current_lat", 0), d.get("current_lng", 0)) if d.get("current_lat") else 999
                free_drivers.append(d)
        free_drivers.sort(key=lambda x: x["_dist"])
        if free_drivers:
            nearest = free_drivers[0]
            u = await db.users.find_one({"_id": ObjectId(nearest["user_id"])})
            if u:
                await db.orders.update_one({"_id": ObjectId(oid)}, {"$set": {
                    "driver_id": nearest["user_id"], "driver_name": u.get("name", ""),
                    "driver_phone": u.get("phone", ""), "status": "assigned",
                    "auto_assigned_at": datetime.now(timezone.utc).isoformat()}})
                return {"message": "Order assigned to nearest driver", "driver_name": u.get("name", "")}
    return {"message": "Order ready, waiting for driver to accept"}

async def seed_data():
    # Categories
    if await db.categories.count_documents({}) == 0:
        categories = [
            {"name_ar": "هواتف", "name_en": "Phones", "image": "📱", "color1": "#8833FF", "color2": "#AA66FF", "published": True, "order": 1},
            {"name_ar": "أجهزة لوحية", "name_en": "Tablets", "image": "📲", "color1": "#3366FF", "color2": "#6699FF", "published": True, "order": 2},
            {"name_ar": "حواسيب", "name_en": "Laptops", "image": "💻", "color1": "#FF6633", "color2": "#FF9966", "published": True, "order": 3},
            {"name_ar": "اكسسوارات", "name_en": "Accessories", "image": "🎧", "color1": "#33CC66", "color2": "#66FF99", "published": True, "order": 4},
            {"name_ar": "ساعات ذكية", "name_en": "Smartwatches", "image": "⌚", "color1": "#FF3366", "color2": "#FF6699", "published": True, "order": 5},
            {"name_ar": "ألعاب", "name_en": "Gaming", "image": "🎮", "color1": "#9933FF", "color2": "#CC66FF", "published": True, "order": 6},
        ]
        await db.categories.insert_many(categories)
        logger.info("Seeded categories")

    # Brands
    if await db.brands.count_documents({}) == 0:
        brands = [
            {"name_ar": "أبل", "name_en": "Apple", "image": "", "published": True},
            {"name_ar": "سامسونج", "name_en": "Samsung", "image": "", "published": True},
            {"name_ar": "هواوي", "name_en": "Huawei", "image": "", "published": True},
            {"name_ar": "شاومي", "name_en": "Xiaomi", "image": "", "published": True},
            {"name_ar": "سوني", "name_en": "Sony", "image": "", "published": True},
        ]
        await db.brands.insert_many(brands)
        logger.info("Seeded brands")

    # Get category and brand IDs
    cats = {c["name_en"]: str(c["_id"]) async for c in db.categories.find()}
    brds = {b["name_en"]: str(b["_id"]) async for b in db.brands.find()}

    # Products
    if await db.products.count_documents({}) == 0:
        DEFAULT_NEW_WARRANTY = {"warranty_days": 365, "warranty_type": "الوكيل الرسمي"}
        DEFAULT_USED_WARRANTY = {"warranty_days": 90, "warranty_type": "ضمان المتجر"}
        products = [
            {
                "name_ar": "آيفون 15 برو ماكس", "name_en": "iPhone 15 Pro Max",
                "description_ar": "أحدث هاتف من أبل بمعالج A17 Pro وكاميرا 48 ميغابيكسل",
                "description_en": "Latest Apple phone with A17 Pro chip and 48MP camera",
                "category_id": cats.get("Phones", ""), "brand_id": brds.get("Apple", ""),
                "price": 4999, "discount_price": 4499, "condition": "new",
                "colors": [{"name": "تيتانيوم طبيعي", "hex": "#A0A0A0"}, {"name": "تيتانيوم أزرق", "hex": "#3D4F7C"}, {"name": "تيتانيوم أسود", "hex": "#2C2C2C"}],
                "storage_options": ["256GB", "512GB", "1TB"],
                "images": ["https://images.unsplash.com/photo-1615655406736-b37c4fabf923?w=400"],
                "specs": {"screen": "6.7 بوصة", "camera": "48 MP", "battery": "4441 mAh", "os": "iOS 17", "processor": "A17 Pro"},
                "rating": 4.8, "review_count": 234, "sold_count": 1520,
                "in_stock": True, "featured": True, "published": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "name_ar": "سامسونج جالكسي S24 ألترا", "name_en": "Samsung Galaxy S24 Ultra",
                "description_ar": "هاتف رائد بقلم S Pen ومعالج Snapdragon 8 Gen 3",
                "description_en": "Flagship phone with S Pen and Snapdragon 8 Gen 3",
                "category_id": cats.get("Phones", ""), "brand_id": brds.get("Samsung", ""),
                "price": 4799, "discount_price": None, "condition": "new",
                "colors": [{"name": "رمادي تيتانيوم", "hex": "#A0A0A0"}, {"name": "بنفسجي", "hex": "#8833FF"}],
                "storage_options": ["256GB", "512GB"],
                "images": ["https://images.pexels.com/photos/6373185/pexels-photo-6373185.jpeg?w=400"],
                "specs": {"screen": "6.8 بوصة", "camera": "200 MP", "battery": "5000 mAh", "os": "Android 14", "processor": "Snapdragon 8 Gen 3"},
                "rating": 4.7, "review_count": 189, "sold_count": 980,
                "in_stock": True, "featured": True, "published": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "name_ar": "ماك بوك برو 16", "name_en": "MacBook Pro 16",
                "description_ar": "لابتوب احترافي بمعالج M3 Max وشاشة Liquid Retina XDR",
                "description_en": "Professional laptop with M3 Max chip",
                "category_id": cats.get("Laptops", ""), "brand_id": brds.get("Apple", ""),
                "price": 12999, "discount_price": 11999, "condition": "new",
                "colors": [{"name": "فضي", "hex": "#C0C0C0"}, {"name": "رمادي فلكي", "hex": "#52525B"}],
                "storage_options": ["512GB", "1TB", "2TB"],
                "images": ["https://images.unsplash.com/photo-1622131815526-eaae1e615381?w=400"],
                "specs": {"screen": "16.2 بوصة", "processor": "M3 Max", "ram": "36GB", "battery": "22 ساعة"},
                "rating": 4.9, "review_count": 156, "sold_count": 450,
                "in_stock": True, "featured": True, "published": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "name_ar": "سماعات سوني WH-1000XM5", "name_en": "Sony WH-1000XM5",
                "description_ar": "أفضل سماعات لاسلكية مع إلغاء الضوضاء",
                "description_en": "Best noise cancelling wireless headphones",
                "category_id": cats.get("Accessories", ""), "brand_id": brds.get("Sony", ""),
                "price": 1499, "discount_price": 1299, "condition": "new",
                "colors": [{"name": "أسود", "hex": "#1A1A1A"}, {"name": "فضي", "hex": "#D4D4D4"}],
                "storage_options": [],
                "images": ["https://images.unsplash.com/photo-1584585696759-1df9872e1eca?w=400"],
                "specs": {"type": "Over-ear", "battery": "30 ساعة", "noise_cancelling": "نعم"},
                "rating": 4.6, "review_count": 312, "sold_count": 2100,
                "in_stock": True, "featured": True, "published": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "name_ar": "آيباد برو 12.9", "name_en": "iPad Pro 12.9",
                "description_ar": "جهاز لوحي احترافي بمعالج M2 وشاشة Liquid Retina XDR",
                "description_en": "Professional tablet with M2 chip",
                "category_id": cats.get("Tablets", ""), "brand_id": brds.get("Apple", ""),
                "price": 5499, "discount_price": 4999, "condition": "new",
                "colors": [{"name": "فضي", "hex": "#C0C0C0"}, {"name": "رمادي فلكي", "hex": "#52525B"}],
                "storage_options": ["128GB", "256GB", "512GB"],
                "images": ["https://images.unsplash.com/photo-1615655406736-b37c4fabf923?w=400"],
                "specs": {"screen": "12.9 بوصة", "processor": "M2", "camera": "12 MP"},
                "rating": 4.8, "review_count": 98, "sold_count": 670,
                "in_stock": True, "featured": True, "published": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "name_ar": "آيفون 14 (مستعمل)", "name_en": "iPhone 14 (Used)",
                "description_ar": "آيفون 14 بحالة ممتازة - مستعمل 3 أشهر",
                "description_en": "iPhone 14 excellent condition - used 3 months",
                "category_id": cats.get("Phones", ""), "brand_id": brds.get("Apple", ""),
                "price": 2499, "discount_price": None, "condition": "used_3months",
                "colors": [{"name": "أزرق", "hex": "#007AFF"}],
                "storage_options": ["128GB"],
                "images": ["https://images.unsplash.com/photo-1615655406736-b37c4fabf923?w=400"],
                "specs": {"screen": "6.1 بوصة", "camera": "12 MP", "battery": "3279 mAh", "os": "iOS 16"},
                "rating": 4.3, "review_count": 45, "sold_count": 89,
                "in_stock": True, "featured": False, "published": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
        ]
        await db.products.insert_many(products)
        logger.info("Seeded products")

    # Banners
    if await db.banners.count_documents({}) == 0:
        banners = [
            {"image": "https://static.prod-images.emergentagent.com/jobs/1b8cc0c8-b963-4a1c-bce2-669eb6f422fe/images/e874d8f809b3aaef7868dce4ab57f3c50ea7e11c675912acf52fd5c8d55aa860.png", "title_ar": "أحدث الهواتف الذكية", "title_en": "Latest Smartphones", "published": True, "type": "normal", "order": 1},
            {"image": "https://static.prod-images.emergentagent.com/jobs/1b8cc0c8-b963-4a1c-bce2-669eb6f422fe/images/0286d868506d9e717ac406005d8b87d3400d9c4ab4f6359abe8041f602b223fa.png", "title_ar": "عروض الساعات والسماعات", "title_en": "Watch & Earbuds Deals", "published": True, "type": "normal", "order": 2},
        ]
        await db.banners.insert_many(banners)
        logger.info("Seeded banners")

    # Seed test user
    if await db.users.count_documents({"phone": "0500000000"}) == 0:
        await db.users.insert_one({
            "phone": "0500000000", "password_hash": hash_password("test1234"),
            "name": "Maxwell Anderson", "email": "maxwell.anderson@example.com",
            "city": "Riyadh", "gender": "male", "role": "user",
            "points": 199, "wallet_balance": 50,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info("Seeded test user")

    # Seed Chamber of Commerce account
    if await db.users.count_documents({"phone": "0550000000"}) == 0:
        await db.users.insert_one({
            "phone": "0550000000", "password_hash": hash_password("chamber2025"),
            "name": "Chamber of Commerce", "email": "chamber@commerce.gov.sa",
            "city": "Riyadh", "gender": "", "role": "chamber",
            "points": 0, "wallet_balance": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info("Seeded Chamber of Commerce account")

    # Seed Merchant account (the single store owner)
    if await db.users.count_documents({"phone": "0509999999"}) == 0:
        await db.users.insert_one({
            "phone": "0509999999", "password_hash": hash_password("merchant2025"),
            "name": "Zenrex Store", "email": "owner@zenrex.ai",
            "city": "Riyadh", "gender": "", "role": "merchant",
            "points": 0, "wallet_balance": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info("Seeded Merchant account")

    # Fetch merchant id for use in seeded branches/employees below
    merchant_user = await db.users.find_one({"phone": "0509999999"})
    merchant_id = str(merchant_user["_id"]) if merchant_user else None

    # Seed default Branches (only if none exist for this merchant)
    if merchant_id and await db.branches.count_documents({}) == 0:
        await db.branches.insert_many([
            {
                "name": "الفرع الرئيسي - الرياض العليا", "address": "شارع الملك فهد، حي العليا",
                "lat": 24.7136, "lng": 46.6753, "phone": "0114000001",
                "open_hours": "9:00 AM - 11:00 PM", "opens_at": "09:00", "closes_at": "23:00",
                "published": True,
                "email": "riyadh@zenrex.ai", "manager_id": "", "city": "الرياض",
                "district": "العليا", "is_main": True,
                "working_days": ["sat", "sun", "mon", "tue", "wed", "thu"],
                "branch_code": "RUH-01", "merchant_id": merchant_id,
                "image": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800",
                "in_store_revenue": 187500, "app_revenue": 92300,
                "total_orders_today": 42, "total_orders_month": 967,
                "monthly_target": 250000,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "name": "فرع جدة - التحلية", "address": "شارع التحلية، حي الروضة",
                "lat": 21.5433, "lng": 39.1728, "phone": "0126000002",
                "open_hours": "10:00 AM - 12:00 AM", "opens_at": "10:00", "closes_at": "00:00",
                "published": True,
                "email": "jeddah@zenrex.ai", "manager_id": "", "city": "جدة",
                "district": "الروضة", "is_main": False,
                "working_days": ["sat", "sun", "mon", "tue", "wed", "thu"],
                "branch_code": "JED-01", "merchant_id": merchant_id,
                "image": "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800",
                "in_store_revenue": 143200, "app_revenue": 68900,
                "total_orders_today": 31, "total_orders_month": 745,
                "monthly_target": 200000,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "name": "فرع الدمام - الشاطئ", "address": "شارع الأمير محمد بن فهد",
                "lat": 26.4207, "lng": 50.0888, "phone": "0138000003",
                "open_hours": "9:00 AM - 11:00 PM", "opens_at": "09:00", "closes_at": "23:00",
                "published": True,
                "email": "dammam@zenrex.ai", "manager_id": "", "city": "الدمام",
                "district": "الشاطئ", "is_main": False,
                "working_days": ["sat", "sun", "mon", "tue", "wed", "thu"],
                "branch_code": "DMM-01", "merchant_id": merchant_id,
                "image": "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800",
                "in_store_revenue": 98400, "app_revenue": 41200,
                "total_orders_today": 18, "total_orders_month": 423,
                "monthly_target": 150000,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        ])
        logger.info("Seeded 3 default branches (Riyadh, Jeddah, Dammam)")

    # Seed default Employees (only if none exist for this merchant)
    if merchant_id and await db.users.count_documents({"role": "employee", "merchant_id": merchant_id}) == 0:
        # Get branch IDs to link employees
        branches_all = await db.branches.find({}).to_list(50)
        b_ids = [str(b["_id"]) for b in branches_all]
        default_employees = [
            {
                "phone": "0530000001", "name": "أحمد الكاشير",
                "password_hash": hash_password("emp1234"),
                "role": "employee", "merchant_id": merchant_id,
                "department": "sales", "permissions": ["pos", "invoices", "orders", "customers"],
                "salary_monthly": 4500, "salary_type": "monthly",
                "hourly_rate": 0, "shift_hours_per_day": 8,
                "shift_start": "09:00", "shift_end": "17:00",
                "hire_date": "2025-06-15",
                "branch_ids": b_ids[:1] if b_ids else [],
                "role_id": "preset_cashier", "job_title": "كاشير رئيسي",
                "avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
                "active": True, "points": 0, "wallet_balance": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "phone": "0530000002", "name": "سارة مسؤولة التسويق",
                "password_hash": hash_password("emp1234"),
                "role": "employee", "merchant_id": merchant_id,
                "department": "marketing", "permissions": ["social", "competitions", "banners"],
                "salary_monthly": 6500, "salary_type": "monthly",
                "hourly_rate": 0, "shift_hours_per_day": 8,
                "shift_start": "10:00", "shift_end": "18:00",
                "hire_date": "2025-03-01",
                "branch_ids": b_ids[:2] if len(b_ids) >= 2 else b_ids,
                "role_id": "preset_marketing", "job_title": "مسؤول تسويق",
                "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200",
                "active": True, "points": 0, "wallet_balance": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "phone": "0530000003", "name": "خالد مدير الفرع",
                "password_hash": hash_password("emp1234"),
                "role": "employee", "merchant_id": merchant_id,
                "department": "management", "permissions": ["orders", "products", "inventory", "customers", "invoices", "pos"],
                "salary_monthly": 9000, "salary_type": "monthly",
                "hourly_rate": 0, "shift_hours_per_day": 9,
                "shift_start": "09:00", "shift_end": "18:00",
                "hire_date": "2024-11-10",
                "branch_ids": [b_ids[1]] if len(b_ids) >= 2 else b_ids,
                "role_id": "preset_manager", "job_title": "مدير فرع جدة",
                "avatar": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200",
                "active": True, "points": 0, "wallet_balance": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "phone": "0530000004", "name": "فاطمة موظفة المبيعات",
                "password_hash": hash_password("emp1234"),
                "role": "employee", "merchant_id": merchant_id,
                "department": "sales", "permissions": ["pos", "invoices"],
                "salary_monthly": 0, "salary_type": "hourly",
                "hourly_rate": 35, "shift_hours_per_day": 6,
                "shift_start": "16:00", "shift_end": "22:00",
                "hire_date": "2026-01-15",
                "branch_ids": [b_ids[2]] if len(b_ids) >= 3 else b_ids,
                "role_id": "preset_cashier", "job_title": "موظفة مبيعات (بالساعة)",
                "avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200",
                "active": True, "points": 0, "wallet_balance": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "phone": "0530000005", "name": "علي فني الصيانة",
                "password_hash": hash_password("emp1234"),
                "role": "employee", "merchant_id": merchant_id,
                "department": "service", "permissions": ["services", "orders"],
                "salary_monthly": 5500, "salary_type": "monthly",
                "hourly_rate": 0, "shift_hours_per_day": 8,
                "shift_start": "09:00", "shift_end": "17:00",
                "hire_date": "2025-08-20",
                "branch_ids": b_ids[:1] if b_ids else [],
                "role_id": "preset_technician", "job_title": "فني صيانة أول",
                "avatar": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200",
                "active": True, "points": 0, "wallet_balance": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        ]
        await db.users.insert_many(default_employees)
        logger.info("Seeded 3 default employees (Cashier, Marketing, Branch Manager)")

    # Seed Driver account
    driver_user = await db.users.find_one({"phone": "0540001111"})
    if not driver_user:
        res = await db.users.insert_one({
            "phone": "0540001111", "password_hash": hash_password("driver1234"),
            "name": "محمد السائق", "email": "driver@zenrex.ai",
            "city": "Riyadh", "gender": "M", "role": "driver",
            "points": 0, "wallet_balance": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        uid = str(res.inserted_id)
        await db.drivers.insert_one({
            "user_id": uid, "name": "محمد السائق", "phone": "0540001111",
            "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
            "vehicle_info": "Toyota Hilux 2022", "vehicle_plate": "أ ب ج 1234",
            "payment_model": "commission", "commission_type": "fixed",
            "merchant_commission_value": 5,
            "salary_monthly": 0, "salary_type": "commission",
            "hourly_rate": 0,
            "shift_start": "07:00", "shift_end": "19:00", "shift_hours_per_day": 12,
            "hire_date": "2025-04-10",
            "bonus_threshold_orders": 20, "bonus_per_extra_order": 2,
            "online": True, "current_lat": 24.7136, "current_lng": 46.6753,
            "wallet_balance": 425.50,
            "total_deliveries": 187, "today_deliveries": 8,
            "week_deliveries": 42, "month_deliveries": 156, "year_deliveries": 187,
            "week_earnings": 210, "month_earnings": 780, "year_earnings": 935,
            "avg_rating": 4.7, "total_ratings": 156, "rating": 4.7,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        # Add 3 more sample drivers
        for spec in [
            {"phone": "0540002222", "name": "عبدالله السريع", "vehicle": "Nissan Sunny 2021", "plate": "س ه ر 5678",
             "payment_model": "hourly", "hourly_rate": 25, "salary_monthly": 0, "salary_type": "hourly",
             "total": 145, "today": 4, "week": 28, "month": 118, "year": 145,
             "earnings_week": 175, "earnings_month": 650, "earnings_year": 780, "rating": 4.5, "ratings_count": 98,
             "online": True, "avatar": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200"},
            {"phone": "0540003333", "name": "خالد الشمري", "vehicle": "Honda Civic 2023", "plate": "ك م ن 9012",
             "payment_model": "salary", "hourly_rate": 0, "salary_monthly": 4200, "salary_type": "monthly",
             "total": 98, "today": 6, "week": 35, "month": 89, "year": 98,
             "earnings_week": 950, "earnings_month": 4200, "earnings_year": 8400, "rating": 4.9, "ratings_count": 82,
             "online": False, "avatar": "https://images.unsplash.com/photo-1552058544-f2b08422138a?w=200"},
            {"phone": "0540004444", "name": "أحمد الغامدي", "vehicle": "Kia Cerato 2020", "plate": "ب ص و 3456",
             "payment_model": "commission", "hourly_rate": 0, "salary_monthly": 0, "salary_type": "commission",
             "total": 76, "today": 2, "week": 18, "month": 65, "year": 76,
             "earnings_week": 90, "earnings_month": 325, "earnings_year": 380, "rating": 4.3, "ratings_count": 54,
             "online": True, "avatar": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200"},
        ]:
            rr = await db.users.insert_one({
                "phone": spec["phone"], "password_hash": hash_password("driver1234"),
                "name": spec["name"], "role": "driver",
                "city": "Riyadh", "gender": "M",
                "points": 0, "wallet_balance": 0,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            await db.drivers.insert_one({
                "user_id": str(rr.inserted_id), "name": spec["name"], "phone": spec["phone"],
                "avatar": spec["avatar"],
                "vehicle_info": spec["vehicle"], "vehicle_plate": spec["plate"],
                "payment_model": spec["payment_model"],
                "commission_type": "fixed", "merchant_commission_value": 5,
                "salary_monthly": spec["salary_monthly"], "salary_type": spec["salary_type"],
                "hourly_rate": spec["hourly_rate"],
                "shift_start": "08:00", "shift_end": "20:00", "shift_hours_per_day": 12,
                "hire_date": "2025-09-01",
                "online": spec["online"], "current_lat": 24.7 + 0.02, "current_lng": 46.7 + 0.02,
                "wallet_balance": 0,
                "total_deliveries": spec["total"], "today_deliveries": spec["today"],
                "week_deliveries": spec["week"], "month_deliveries": spec["month"], "year_deliveries": spec["year"],
                "week_earnings": spec["earnings_week"], "month_earnings": spec["earnings_month"], "year_earnings": spec["earnings_year"],
                "avg_rating": spec["rating"], "total_ratings": spec["ratings_count"], "rating": spec["rating"],
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        logger.info("Seeded 4 drivers with full details")
    else:
        # Ensure password is correct (idempotent)
        await db.users.update_one({"_id": driver_user["_id"]},
            {"$set": {"password_hash": hash_password("driver1234"), "role": "driver"}})
        # Ensure driver doc exists
        if await db.drivers.count_documents({"user_id": str(driver_user["_id"])}) == 0:
            await db.drivers.insert_one({
                "user_id": str(driver_user["_id"]), "name": driver_user.get("name", "محمد السائق"),
                "phone": "0540001111", "vehicle_info": "Toyota Hilux 2022",
                "payment_model": "commission", "commission_type": "fixed",
                "merchant_commission_value": 5, "online": False, "wallet_balance": 0,
                "total_deliveries": 0, "today_deliveries": 0,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        logger.info("Driver account verified: 0540001111/driver1234")

    # Seed competitions
    if await db.competitions.count_documents({}) == 0:
        comps = [
            {
                "title": "Spend & Win: Eid Special Draw", "type": "spend_win",
                "description": "Spend $100 or more between April 15-May 10 and enter our Eid prize draw to win amazing gifts!",
                "prize": "Win 1 of 5 iPhone 15s", "prize_count": 5,
                "status": "open", "spend_requirement": 100,
                "start_date": "2025-04-15", "end_date": "2025-05-10", "draw_date": "2025-05-11",
                "max_participants": 1000, "joined_count": 237,
                "questions": [
                    {"q": "What day is the iPhone 14 release date?", "options": ["September 16, 2022", "September 16, 2020", "September 16, 2019"], "correct": 0},
                    {"q": "Which company makes Galaxy phones?", "options": ["Apple", "Samsung", "Huawei"], "correct": 1},
                    {"q": "What is the latest iPhone model?", "options": ["iPhone 15", "iPhone 16", "iPhone 14"], "correct": 1},
                    {"q": "How much RAM does iPhone 16 Pro have?", "options": ["6GB", "8GB", "12GB"], "correct": 1},
                    {"q": "What chip does MacBook Pro 2024 use?", "options": ["M2", "M3", "M4"], "correct": 2},
                ],
                "winners": [],
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "title": "Summer Tech Giveaway", "type": "spend_win",
                "description": "Purchase any laptop and get a chance to win a MacBook Pro!",
                "prize": "Win MacBook Pro 16\"", "prize_count": 1,
                "status": "coming_soon", "spend_requirement": 500,
                "start_date": "2025-06-01", "end_date": "2025-06-30", "draw_date": "2025-07-01",
                "max_participants": 500, "joined_count": 0,
                "questions": [], "winners": [],
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "title": "Accessories Bundle Draw", "type": "spend_win",
                "description": "Buy 3 accessories and enter the draw for a complete Apple ecosystem bundle",
                "prize": "Win Apple Ecosystem Bundle", "prize_count": 3,
                "status": "ended", "spend_requirement": 200,
                "start_date": "2025-01-01", "end_date": "2025-01-31", "draw_date": "2025-02-01",
                "max_participants": 500, "joined_count": 500,
                "questions": [],
                "winners": [
                    {"user_name": "Bader Alhariri", "user_phone": "(555) 123-****"},
                    {"user_name": "Sophia Anderson", "user_phone": "(555) 456-****"},
                    {"user_name": "Ethan Smith", "user_phone": "(555) 789-****"},
                ],
                "created_at": datetime.now(timezone.utc).isoformat()
            },
        ]
        # Add richer image + banner fields
        for c in comps:
            c.setdefault("image", "")
            c.setdefault("banner_image", "")
            c.setdefault("category", c.get("type", "general"))
        # Enrich existing 3 with images
        img_by_title = {
            "Spend & Win: Eid Special Draw": "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800",
            "Summer Tech Giveaway": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800",
            "Accessories Bundle Draw": "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800",
        }
        for c in comps:
            if c["title"] in img_by_title:
                c["image"] = img_by_title[c["title"]]
                c["banner_image"] = img_by_title[c["title"]]
        # Extra rich competitions with images (7 more, total 10)
        extra_comps = [
            {"title": "Ramadan Mega Draw 🌙", "type": "spend_win", "description": "أكبر سحوبات رمضان! اشتري بأي مبلغ خلال الشهر الفضيل واربح فرصة الفوز بجائزتنا الكبرى.",
             "prize": "سيارة تسلا Model 3 + iPhone 15 Pro", "prize_count": 2, "status": "open", "spend_requirement": 200,
             "start_date": "2026-02-25", "end_date": "2026-03-25", "draw_date": "2026-03-26",
             "max_participants": 5000, "joined_count": 3812,
             "questions": [], "winners": [], "category": "general",
             "image": "https://images.unsplash.com/photo-1541963463532-d68292c34b19?w=800",
             "banner_image": "https://images.unsplash.com/photo-1541963463532-d68292c34b19?w=800",
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"title": "اليوم الوطني السعودي 🇸🇦", "type": "spend_win", "description": "احتفل بحب الوطن! سحب خاص باليوم الوطني على أفضل الأجهزة السعودية.",
             "prize": "MacBook Pro M3 + AirPods Pro", "prize_count": 3, "status": "open", "spend_requirement": 150,
             "start_date": "2026-09-15", "end_date": "2026-09-30", "draw_date": "2026-10-01",
             "max_participants": 3000, "joined_count": 1876,
             "questions": [], "winners": [], "category": "national",
             "image": "https://images.unsplash.com/photo-1591370409347-2fd43b7842ec?w=800",
             "banner_image": "https://images.unsplash.com/photo-1591370409347-2fd43b7842ec?w=800",
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"title": "تحدي فيديو UGC: احسن مراجعة! 🎬", "type": "ugc_video", "description": "شارك فيديو مراجعة لأحدث المنتجات وربما تفوز! كل الفيديوهات يعرضها الجمهور ويصوّت.",
             "prize": "PlayStation 5 + متحف من الألعاب", "prize_count": 1, "status": "open", "spend_requirement": 0,
             "start_date": "2026-09-01", "end_date": "2026-10-15", "draw_date": "2026-10-16",
             "max_participants": 500, "joined_count": 89,
             "questions": [], "winners": [], "category": "ugc",
             "image": "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800",
             "banner_image": "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800",
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"title": "مسابقة الأسئلة التقنية 🧠", "type": "quiz", "description": "اختبر معلوماتك في التقنية وأجب على 10 أسئلة بشكل صحيح لتربح!",
             "prize": "iPad Pro 12.9 + Apple Pencil", "prize_count": 2, "status": "open", "spend_requirement": 0,
             "start_date": "2026-09-10", "end_date": "2026-09-30", "draw_date": "2026-10-01",
             "max_participants": 2000, "joined_count": 1234,
             "questions": [
                 {"q": "أي شركة أنتجت أول iPhone؟", "options": ["Samsung", "Apple", "Nokia"], "correct": 1},
                 {"q": "ما هو نظام تشغيل ماك؟", "options": ["Windows", "macOS", "Linux"], "correct": 1},
             ],
             "winners": [], "category": "quiz",
             "image": "https://images.unsplash.com/photo-1516110833967-0b5716ca1387?w=800",
             "banner_image": "https://images.unsplash.com/photo-1516110833967-0b5716ca1387?w=800",
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"title": "دعوة صديق واربح 🎁", "type": "referral", "description": "ادعُ 5 أصدقاء إلى Zenrex Store واحصل على فرصة مضمونة للفوز!",
             "prize": "Samsung Galaxy S24 Ultra", "prize_count": 5, "status": "open", "spend_requirement": 0,
             "start_date": "2026-09-01", "end_date": "2026-12-31", "draw_date": "2027-01-01",
             "max_participants": 10000, "joined_count": 2456,
             "questions": [], "winners": [], "category": "referral",
             "image": "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800",
             "banner_image": "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800",
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"title": "مسابقة الجمعة البيضاء ⚡", "type": "spend_win", "description": "أعظم عروض الجمعة البيضاء + سحوبات فورية على منتجات مميزة.",
             "prize": "خصومات تصل إلى 70% + جوائز فورية", "prize_count": 100, "status": "coming_soon", "spend_requirement": 100,
             "start_date": "2026-11-24", "end_date": "2026-11-30", "draw_date": "2026-12-01",
             "max_participants": 15000, "joined_count": 0,
             "questions": [], "winners": [], "category": "seasonal",
             "image": "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=800",
             "banner_image": "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=800",
             "created_at": datetime.now(timezone.utc).isoformat()},
            {"title": "المتسوق الأول 🥇", "type": "spend_win", "description": "كن أول 100 عميل خلال الأسبوع الأول من الإطلاق واحصل على مكافأة حصرية!",
             "prize": "قسيمة شرائية 500 ريال + شحن مجاني للسنة", "prize_count": 100, "status": "ended", "spend_requirement": 50,
             "start_date": "2026-01-01", "end_date": "2026-01-07", "draw_date": "2026-01-08",
             "max_participants": 100, "joined_count": 100,
             "questions": [],
             "winners": [
                 {"user_name": "أحمد المطيري", "user_phone": "(555) 111-****"},
                 {"user_name": "نورة السعد", "user_phone": "(555) 222-****"},
                 {"user_name": "عبدالله القحطاني", "user_phone": "(555) 333-****"},
             ],
             "category": "launch",
             "image": "https://images.unsplash.com/photo-1607082349566-187342175e2f?w=800",
             "banner_image": "https://images.unsplash.com/photo-1607082349566-187342175e2f?w=800",
             "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        comps.extend(extra_comps)
        await db.competitions.insert_many(comps)
        logger.info(f"Seeded {len(comps)} competitions with images")

        # Seed participants for Eid draw
        comp_eid = await db.competitions.find_one({"title": "Spend & Win: Eid Special Draw"})
        if comp_eid:
            participants = [
                {"competition_id": str(comp_eid["_id"]), "user_id": "fake1", "user_name": "Bader Alhariri", "user_phone": "(555) 123-****", "joined_at": datetime.now(timezone.utc).isoformat()},
                {"competition_id": str(comp_eid["_id"]), "user_id": "fake2", "user_name": "Sophia Anderson", "user_phone": "(555) 456-****", "joined_at": datetime.now(timezone.utc).isoformat()},
                {"competition_id": str(comp_eid["_id"]), "user_id": "fake3", "user_name": "Ethan Smith", "user_phone": "(555) 789-****", "joined_at": datetime.now(timezone.utc).isoformat()},
                {"competition_id": str(comp_eid["_id"]), "user_id": "fake4", "user_name": "Ahmed Al-Rashid", "user_phone": "(555) 321-****", "joined_at": datetime.now(timezone.utc).isoformat()},
                {"competition_id": str(comp_eid["_id"]), "user_id": "fake5", "user_name": "Fatima Hassan", "user_phone": "(555) 654-****", "joined_at": datetime.now(timezone.utc).isoformat()},
            ]
            await db.competition_entries.insert_many(participants)

    # Seed ads
    if await db.ads.count_documents({}) == 0:
        ads = [
            {"user_id": "store", "title": "iPhone 16 Pro - Limited Offer!", "description": "Get the new iPhone 16 Pro at special launch price. Limited stock!", "image": "https://images.unsplash.com/photo-1615655406736-b37c4fabf923?w=400", "ad_type": "banner", "duration_days": 30, "budget": 500, "status": "active", "views": 12450, "clicks": 892, "created_at": datetime.now(timezone.utc).isoformat()},
            {"user_id": "store", "title": "Screen Repair 50% OFF", "description": "Professional screen repair service now 50% off for all models!", "image": "", "ad_type": "feed", "duration_days": 14, "budget": 200, "status": "active", "views": 8320, "clicks": 534, "created_at": datetime.now(timezone.utc).isoformat()},
            {"user_id": "store", "title": "Trade-in Your Old Phone", "description": "Get up to 2000 SAR for your old device when you upgrade", "image": "", "ad_type": "story", "duration_days": 7, "budget": 150, "status": "active", "views": 5670, "clicks": 321, "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db.ads.insert_many(ads)
        logger.info("Seeded ads")

    # Seed wallet transactions
    if await db.wallet_transactions.count_documents({}) == 0:
        test_user = await db.users.find_one({"phone": "0500000000"})
        if test_user:
            uid = str(test_user["_id"])
            txns = [
                {"user_id": uid, "type": "credit", "amount": 50, "description": "Welcome bonus", "created_at": "2025-03-01T10:00:00Z"},
                {"user_id": uid, "type": "points", "amount": 100, "description": "Purchase reward - iPhone case", "created_at": "2025-03-15T14:00:00Z"},
                {"user_id": uid, "type": "points", "amount": 99, "description": "Competition entry reward", "created_at": "2025-04-01T09:00:00Z"},
            ]
            await db.wallet_transactions.insert_many(txns)

    # Seed addresses
    if await db.addresses.count_documents({}) == 0:
        test_user = await db.users.find_one({"phone": "0500000000"})
        if test_user:
            uid = str(test_user["_id"])
            await db.addresses.insert_many([
                {"user_id": uid, "label": "My home", "address": "65, Ar Rahmaniyyah, Riyadh 12215, Saudi Arabia", "city": "Riyadh", "is_default": True, "created_at": datetime.now(timezone.utc).isoformat()},
                {"user_id": uid, "label": "Office", "address": "King Fahad Road, Al Olaya, Riyadh", "city": "Riyadh", "is_default": False, "created_at": datetime.now(timezone.utc).isoformat()},
            ])

    # Seed services
    if await db.services.count_documents({}) == 0:
        services = [
            {"name": "Screen Repair", "name_ar": "إصلاح الشاشة", "desc": "Professional screen replacement for all phone models", "desc_ar": "استبدال احترافي للشاشة لجميع أنواع الجوالات", "icon": "phone-portrait", "color": "#8833FF",
             "image": "https://images.unsplash.com/photo-1601972602288-3be527b4f18d?w=600",
             "price": 199, "inspection_price": 11, "total_requests": 423, "turnaround": "1-2 Days",
             "delivery_available": True, "home_pickup": True, "warranty_available": True, "warranty_days": 90,
             "rating": 4.7, "review_count": 134, "published": True, "category": "repair"},
            {"name": "Battery Replacement", "name_ar": "استبدال البطارية", "desc": "Genuine battery replacement with warranty", "desc_ar": "استبدال البطارية بقطعة أصلية مع ضمان", "icon": "battery-charging", "color": "#10B981",
             "image": "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600",
             "price": 149, "inspection_price": 11, "total_requests": 312, "turnaround": "1 Day",
             "delivery_available": True, "home_pickup": True, "warranty_available": True, "warranty_days": 180,
             "rating": 4.8, "review_count": 98, "published": True, "category": "repair"},
            {"name": "Water Damage Repair", "name_ar": "إصلاح أضرار الماء", "desc": "Advanced water damage recovery service", "desc_ar": "خدمة استعادة متقدمة لأضرار الماء", "icon": "water", "color": "#3B82F6",
             "image": "https://images.unsplash.com/photo-1580901368919-7738efb0f87e?w=600",
             "price": 299, "inspection_price": 25, "total_requests": 187, "turnaround": "2-3 Days",
             "delivery_available": True, "home_pickup": False, "warranty_available": True, "warranty_days": 30,
             "rating": 4.3, "review_count": 67, "published": True, "category": "repair"},
            {"name": "Software Fix", "name_ar": "إصلاح البرامج", "desc": "OS updates, virus removal, data recovery", "desc_ar": "تحديث النظام، إزالة الفيروسات، استعادة البيانات", "icon": "code-slash", "color": "#F59E0B",
             "image": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600",
             "price": 99, "inspection_price": 0, "total_requests": 256, "turnaround": "Same Day",
             "delivery_available": False, "home_pickup": False, "warranty_available": False, "warranty_days": 0,
             "rating": 4.6, "review_count": 89, "published": True, "category": "software"},
            {"name": "Device Inspection", "name_ar": "فحص الجهاز", "desc": "Full device health check and diagnostic report", "desc_ar": "فحص شامل لصحة الجهاز مع تقرير تشخيصي", "icon": "search", "color": "#EC4899",
             "image": "https://images.unsplash.com/photo-1585298723682-7115561c51b7?w=600",
             "price": 49, "inspection_price": 0, "total_requests": 145, "turnaround": "Same Day",
             "delivery_available": False, "home_pickup": False, "warranty_available": False, "warranty_days": 0,
             "rating": 4.9, "review_count": 156, "published": True, "category": "diagnostic"},
            {"name": "Charging Port Fix", "name_ar": "إصلاح منفذ الشحن", "desc": "Repair or replace damaged charging ports", "desc_ar": "إصلاح أو استبدال منافذ الشحن التالفة", "icon": "flash", "color": "#EF4444",
             "image": "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600",
             "price": 129, "inspection_price": 11, "total_requests": 198, "turnaround": "1 Day",
             "delivery_available": True, "home_pickup": True, "warranty_available": True, "warranty_days": 60,
             "rating": 4.5, "review_count": 78, "published": True, "category": "repair"},
            # NEW enriched services
            {"name": "Camera Lens Replacement", "name_ar": "استبدال عدسة الكاميرا", "desc": "Professional camera lens repair for all smartphones", "desc_ar": "إصلاح احترافي لعدسة الكاميرا لجميع الجوالات", "icon": "camera", "color": "#06B6D4",
             "image": "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600",
             "price": 249, "inspection_price": 15, "total_requests": 156, "turnaround": "1-2 Days",
             "delivery_available": True, "home_pickup": True, "warranty_available": True, "warranty_days": 60,
             "rating": 4.6, "review_count": 92, "published": True, "category": "repair"},
            {"name": "Data Recovery", "name_ar": "استعادة البيانات", "desc": "Recover lost files, photos and contacts from damaged devices", "desc_ar": "استعادة الملفات والصور وجهات الاتصال من الأجهزة التالفة", "icon": "cloud-download", "color": "#7C3AED",
             "image": "https://images.unsplash.com/photo-1614332287897-cdc485fa562d?w=600",
             "price": 179, "inspection_price": 20, "total_requests": 87, "turnaround": "2-4 Days",
             "delivery_available": False, "home_pickup": False, "warranty_available": False, "warranty_days": 0,
             "rating": 4.7, "review_count": 43, "published": True, "category": "software"},
            {"name": "Speaker & Microphone Fix", "name_ar": "إصلاح السماعة والميكرفون", "desc": "Fix speaker and microphone issues on any device", "desc_ar": "إصلاح مشاكل السماعة والميكرفون في أي جهاز", "icon": "volume-high", "color": "#F97316",
             "image": "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600",
             "price": 99, "inspection_price": 11, "total_requests": 134, "turnaround": "Same Day",
             "delivery_available": True, "home_pickup": True, "warranty_available": True, "warranty_days": 60,
             "rating": 4.5, "review_count": 61, "published": True, "category": "repair"},
            {"name": "Motherboard Repair", "name_ar": "إصلاح اللوحة الأم", "desc": "Advanced motherboard repair by certified technicians", "desc_ar": "إصلاح متقدم للوحة الأم بواسطة فنيين معتمدين", "icon": "hardware-chip", "color": "#DC2626",
             "image": "https://images.unsplash.com/photo-1601731317945-68e6a5a4c8d1?w=600",
             "price": 499, "inspection_price": 30, "total_requests": 45, "turnaround": "3-5 Days",
             "delivery_available": False, "home_pickup": False, "warranty_available": True, "warranty_days": 90,
             "rating": 4.4, "review_count": 22, "published": True, "category": "repair"},
            {"name": "Screen Protector Installation", "name_ar": "تركيب واقي الشاشة", "desc": "Premium glass screen protector installation", "desc_ar": "تركيب واقي شاشة زجاجي فاخر", "icon": "shield-checkmark", "color": "#059669",
             "image": "https://images.unsplash.com/photo-1616348436168-de43ad0db179?w=600",
             "price": 49, "inspection_price": 0, "total_requests": 289, "turnaround": "15 Minutes",
             "delivery_available": True, "home_pickup": False, "warranty_available": True, "warranty_days": 30,
             "rating": 4.9, "review_count": 187, "published": True, "category": "accessory"},
            {"name": "Home Service Visit", "name_ar": "زيارة الفنيّ المنزلية", "desc": "Certified technician visits your home for on-site repair", "desc_ar": "فنّي معتمد يزور منزلك لإصلاح فوري", "icon": "home", "color": "#0EA5E9",
             "image": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600",
             "price": 199, "inspection_price": 50, "total_requests": 76, "turnaround": "2-4 Hours",
             "delivery_available": True, "home_pickup": True, "warranty_available": True, "warranty_days": 30,
             "rating": 4.8, "review_count": 45, "published": True, "category": "home"},
        ]
        await db.services.insert_many(services)
        logger.info(f"Seeded {len(services)} services with images")

    # Seed warranties for test user
    if await db.warranties.count_documents({}) == 0:
        test_user = await db.users.find_one({"phone": "0500000000"})
        if test_user:
            uid = str(test_user["_id"])
            await db.warranties.insert_many([
                {"user_id": uid, "product_name": "iPhone 15 Pro Max Screen", "service_name": "Screen Repair",
                 "warranty_days": 90, "start_date": "2025-03-01", "end_date": "2025-05-30",
                 "status": "active", "order_id": "ORD-001", "created_at": datetime.now(timezone.utc).isoformat()},
                {"user_id": uid, "product_name": "Samsung S24 Battery", "service_name": "Battery Replacement",
                 "warranty_days": 180, "start_date": "2025-01-15", "end_date": "2025-07-14",
                 "status": "active", "order_id": "ORD-002", "created_at": datetime.now(timezone.utc).isoformat()},
            ])
            logger.info("Seeded warranties")

    # Seed support tickets
    if await db.support_tickets.count_documents({}) == 0:
        test_user = await db.users.find_one({"phone": "0500000000"})
        if test_user:
            uid = str(test_user["_id"])
            await db.support_tickets.insert_many([
                {"user_id": uid, "subject": "Order delivery delay", "message": "My order has been processing for 3 days",
                 "category": "orders", "status": "open", "replies": [
                    {"user_name": "Support Team", "message": "We're looking into this. Your order will be shipped today.", "created_at": "2025-04-10T10:00:00Z"}
                 ], "created_at": "2025-04-09T14:00:00Z"},
                {"user_id": uid, "subject": "Screen repair warranty", "message": "Screen has issues after repair",
                 "category": "services", "status": "resolved", "replies": [
                    {"user_name": "Support Team", "message": "Please bring the device to the store for free inspection under warranty.", "created_at": "2025-03-20T09:00:00Z"}
                 ], "created_at": "2025-03-19T16:00:00Z"},
            ])
            logger.info("Seeded support tickets")

    # Seed coupons
    if await db.coupons.count_documents({}) == 0:
        await db.coupons.insert_many([
            {"code": "WELCOME10", "discount_type": "percent", "discount_value": 10, "min_order": 100, "max_discount": 50, "active": True},
            {"code": "FLAT50", "discount_type": "fixed", "discount_value": 50, "min_order": 200, "max_discount": 50, "active": True},
            {"code": "EID25", "discount_type": "percent", "discount_value": 25, "min_order": 500, "max_discount": 200, "active": True},
        ])
        logger.info("Seeded coupons")

    # Seed social posts
    if await db.social_posts.count_documents({}) == 0:
        await db.social_posts.insert_many([
            {"author": "Tech Store", "text": "Welcome to our new store! We are excited to serve you with the latest technology products.", "image": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400", "likes": 78000, "comments": 201, "views": 1345, "type": "post", "created_at": datetime.now(timezone.utc).isoformat()},
            {"author": "Tech Store", "text": "Check out our latest collection of iPhone 16 cases and accessories!", "image": "https://images.unsplash.com/photo-1615655406736-b37c4fabf923?w=400", "likes": 12400, "comments": 87, "views": 892, "type": "post", "created_at": datetime.now(timezone.utc).isoformat()},
            {"author": "Tech Store", "text": "What is the best Phone this year!", "type": "poll", "poll_options": [{"text": "iPhone 16 Pro", "votes": 45}, {"text": "Samsung S25 Ultra", "votes": 32}, {"text": "Google Pixel 9 Pro", "votes": 18}, {"text": "Other", "votes": 5}], "likes": 5200, "comments": 156, "views": 2156, "created_at": datetime.now(timezone.utc).isoformat()},
            {"author": "Tech Store", "text": "Big sale this weekend! Amazing deals on all Samsung products.", "image": "https://images.pexels.com/photos/6373185/pexels-photo-6373185.jpeg?w=400", "likes": 23100, "comments": 342, "views": 3420, "type": "post", "is_ad": True, "ad_label": "Sponsored", "created_at": datetime.now(timezone.utc).isoformat()},
        ])
        logger.info("Seeded social posts")

    # Seed sample Marketers/Affiliates
    if await db.affiliates.count_documents({}) == 0 and merchant_id:
        # Create 5 marketer user accounts first
        marketer_specs = [
            {"phone": "0550100001", "name": "نواف المسوّق", "code": "NAWAF25", "clicks": 1245, "conv": 89, "sales": 34580, "commission": 3458, "avatar": "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200"},
            {"phone": "0550100002", "name": "ريم المسوّقة", "code": "REEM99", "clicks": 987, "conv": 67, "sales": 28400, "commission": 2840, "avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200"},
            {"phone": "0550100003", "name": "بندر السوشيال", "code": "BANDER1", "clicks": 2340, "conv": 156, "sales": 62100, "commission": 6210, "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200"},
            {"phone": "0550100004", "name": "لينا الإنستقرام", "code": "LEENA_INSTA", "clicks": 4523, "conv": 289, "sales": 118900, "commission": 11890, "avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200"},
            {"phone": "0550100005", "name": "سعود التيك توك", "code": "SAUD_TT", "clicks": 8945, "conv": 512, "sales": 231400, "commission": 23140, "avatar": "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=200"},
        ]
        for m in marketer_specs:
            existing = await db.users.find_one({"phone": m["phone"]})
            uid_m = str(existing["_id"]) if existing else str((await db.users.insert_one({
                "phone": m["phone"], "password_hash": hash_password("aff1234"),
                "name": m["name"], "role": "user", "is_affiliate": True,
                "city": "الرياض", "created_at": datetime.now(timezone.utc).isoformat(),
            })).inserted_id)
            await db.affiliates.insert_one({
                "user_id": uid_m, "merchant_id": merchant_id,
                "name": m["name"], "phone": m["phone"], "avatar": m["avatar"],
                "referral_code": m["code"], "commission_rate": 10,
                "status": "approved", "active": True,
                "clicks": m["clicks"], "unique_clicks": int(m["clicks"] * 0.7),
                "conversions": m["conv"], "sales_total": m["sales"],
                "commission_earned": m["commission"],
                "commission_pending": round(m["commission"] * 0.15, 2),
                "commission_paid": round(m["commission"] * 0.85, 2),
                "posts_shared": max(5, int(m["clicks"] / 50)),
                "top_platform": "instagram" if "insta" in m["code"].lower() else ("tiktok" if "tt" in m["code"].lower() else "twitter"),
                "joined_at": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        logger.info(f"Seeded {len(marketer_specs)} marketers/affiliates")

    # Indexes
    await db.users.create_index("phone", unique=True)
    await db.products.create_index([("name_ar", "text"), ("name_en", "text")])

# NOTE: app.include_router(api_router) intentionally lives ONLY at the bottom
# of this file (after ALL route definitions). Do not add it here.

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Employee Permission Enforcement Middleware ───
# Maps URL path segments to permission keys. Owner (role="merchant") always allowed.
# Employees must have either "all" or the specific perm to access /api/merchant/* routes.
_PERM_MAP = [
    ("/api/merchant/products",      "products"),
    ("/api/merchant/orders",        "orders"),
    ("/api/merchant/social",        "social"),
    ("/api/merchant/competitions",  "competitions"),
    ("/api/merchant/services",      "services"),
    ("/api/merchant/bookings",      "services"),
    ("/api/merchant/branches",      "branches"),
    ("/api/merchant/drivers",       "drivers"),
    ("/api/merchant/delivery",      "delivery"),
    ("/api/merchant/banners",       "banners"),
    ("/api/merchant/customers",     "customers"),
    ("/api/merchant/store/support", "settings"),
    ("/api/merchant/support",       "support"),
    ("/api/merchant/employees",     "_owner_only"),  # only owner
    ("/api/merchant/employee-perms","_owner_only"),
    ("/api/merchant/chamber-employees","_owner_only"),
]

@app.middleware("http")
async def enforce_employee_perms(request: Request, call_next):
    path = request.url.path
    # Only enforce on /api/merchant/* paths
    if not path.startswith("/api/merchant/") and path != "/api/merchant":
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return await call_next(request)  # let endpoint handle 401
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        return await call_next(request)  # let endpoint handle invalid auth
    if not user or user.get("role") != "employee":
        return await call_next(request)
    # Resolve required perm (longest prefix match)
    required = None
    best_len = 0
    for prefix, perm in _PERM_MAP:
        if path.startswith(prefix) and len(prefix) > best_len:
            required = perm
            best_len = len(prefix)
    perms = user.get("permissions", [])
    if required == "_owner_only":
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"detail": "هذه العملية للمالك فقط"})
    if required and "all" not in perms and required not in perms:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"detail": f"يتطلب صلاحية: {required}"})
    return await call_next(request)


# ─── Add GET endpoint for merchant social posts (gated by 'social' perm via middleware) ───
@api_router.get("/merchant/social/posts")
async def merchant_list_posts(user=Depends(get_current_user)):
    require_merchant(user)
    posts = await db.social_posts.find({}).sort("created_at", -1).to_list(200)
    return [{
        "id": str(p["_id"]),
        "type": p.get("type", "post"),
        "text": p.get("text", ""),
        "image": p.get("image"),
        "images": p.get("images", []),
        "media": p.get("media", []),
        "video": p.get("video"),
        "author": p.get("author", "Zitex"),
        "likes": p.get("likes", 0),
        "comments": p.get("comments", 0),
        "shares": p.get("shares", 0),
        "views": p.get("views", 0),
        "liked_by": p.get("liked_by", []),
        "shared_by": p.get("shared_by", []),
        "poll_options": p.get("poll_options", []),
        "event_date": p.get("event_date"),
        "event_location": p.get("event_location"),
        "created_at": p.get("created_at", ""),
    } for p in posts]

# Need to re-include router so new endpoint is registered

# ─── Invoices & POS ───
class InvoiceItem(BaseModel):
    product_id: str
    name: str
    price: float
    quantity: int
    discount: float = 0

class InvoiceInput(BaseModel):
    items: List[InvoiceItem]
    customer_name: str = ""
    customer_phone: str = ""
    payment_method: str = "cash"    # cash / card / stc_pay / bank_transfer
    branch_id: str = ""
    discount: float = 0
    vat_percent: float = 15
    notes: str = ""
    send_via: str = "whatsapp"      # whatsapp / email / none

@api_router.post("/pos/invoice")
async def create_invoice(data: InvoiceInput, user=Depends(get_current_user)):
    from datetime import datetime, timezone
    if user.get("role") not in ("merchant", "employee"):
        raise HTTPException(status_code=403)
    if not data.items:
        raise HTTPException(status_code=400, detail="لا توجد منتجات")
    subtotal = sum((it.price * it.quantity) - it.discount for it in data.items)
    vat = subtotal * (data.vat_percent / 100) if data.vat_percent else 0
    total = subtotal + vat - data.discount
    count = await db.invoices.count_documents({})
    inv_number = f"INV-{count+1:06d}"
    doc = {
        "invoice_number": inv_number,
        "items": [it.model_dump() for it in data.items],
        "customer_name": data.customer_name, "customer_phone": data.customer_phone,
        "payment_method": data.payment_method, "branch_id": data.branch_id,
        "subtotal": subtotal, "discount": data.discount,
        "vat_percent": data.vat_percent, "vat_amount": vat, "total": total,
        "notes": data.notes, "send_via": data.send_via,
        "employee_id": user["id"], "employee_name": user.get("name", ""),
        "merchant_id": user.get("merchant_id", user["id"]),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "paid",
    }
    r = await db.invoices.insert_one(doc)
    # Reduce branch inventory (POS = store channel)
    if data.branch_id:
        for it in data.items:
            await decrement_channel_stock(data.branch_id, it.product_id, it.quantity, channel="store")
    await log_activity(user, "pos_sale", "invoice", str(r.inserted_id),
                       {"total": total, "items_count": len(data.items)})
    return {"id": str(r.inserted_id), "invoice_number": inv_number, "total": total, "vat_amount": vat}

@api_router.get("/pos/invoices")
async def list_invoices(user=Depends(get_current_user), limit: int = 100):
    if user.get("role") not in ("merchant", "employee"):
        raise HTTPException(status_code=403)
    mid = user.get("merchant_id", user["id"])
    q = {"merchant_id": mid}
    # Employees see only their own invoices unless they have all permission
    if user.get("role") == "employee" and "all" not in user.get("permissions", []) and "invoices_view_all" not in user.get("permissions", []):
        q["employee_id"] = user["id"]
    invs = await db.invoices.find(q).sort("created_at", -1).to_list(limit)
    return [{
        "id": str(i["_id"]), "invoice_number": i.get("invoice_number"),
        "customer_name": i.get("customer_name"), "customer_phone": i.get("customer_phone"),
        "total": i.get("total"), "payment_method": i.get("payment_method"),
        "items_count": len(i.get("items", [])), "created_at": i.get("created_at"),
        "employee_name": i.get("employee_name"), "branch_id": i.get("branch_id"),
    } for i in invs]

@api_router.get("/pos/invoice/{iid}")
async def get_invoice(iid: str, user=Depends(get_current_user)):
    if not ObjectId.is_valid(iid): raise HTTPException(400)
    if user.get("role") not in ("merchant", "employee"):
        raise HTTPException(status_code=403)
    inv = await db.invoices.find_one({"_id": ObjectId(iid)})
    if not inv: raise HTTPException(404)
    # Ownership check: merchant/employee can only see their tenant's invoices
    mid = user.get("merchant_id", user["id"])
    if inv.get("merchant_id") != mid:
        raise HTTPException(status_code=403, detail="ليست فاتورتك")
    # Employees see only own invoices unless they have all/invoices_view_all
    if user.get("role") == "employee":
        perms = user.get("permissions", [])
        if "all" not in perms and "invoices_view_all" not in perms and inv.get("employee_id") != user["id"]:
            raise HTTPException(status_code=403, detail="غير مصرح لك بعرض هذه الفاتورة")
    return serialize_doc(inv)


# ═══════════════════════════════════════════════════════════════════════════
# ─── MARKETING & AFFILIATE MODULE ───
# ═══════════════════════════════════════════════════════════════════════════

class MarketingAdInput(BaseModel):
    # Campaign kind: "ad" (regular targeted ad) or "affiliate" (affiliate program)
    campaign_type: str = "ad"
    title: str
    description: str = ""
    image: str = ""
    cta_label: str = "تسوّق الآن"
    cta_link: str = ""
    # Targeting
    target_cities: List[str] = []
    target_genders: List[str] = []          # ["male", "female"]
    target_interest_tags: List[str] = []    # ["phones","laptops","gaming","accessories","home"]
    target_age_min: int = 18
    target_age_max: int = 65
    # Affiliate-only
    commission_percent: float = 0.0
    incentives: str = ""
    # Duration
    starts_at: str = ""
    ends_at: str = ""
    active: bool = True

@api_router.post("/merchant/marketing/ads")
async def create_ad(data: MarketingAdInput, user=Depends(get_current_user)):
    require_merchant(user)
    mid = user.get("merchant_id", user["id"])
    doc = data.model_dump()
    doc.update({
        "merchant_id": mid,
        "merchant_name": user.get("name", "Store"),
        "views": 0, "clicks": 0, "conversions": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r = await db.marketing_ads.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "تم إنشاء الحملة"}

@api_router.get("/merchant/marketing/ads")
async def list_ads(user=Depends(get_current_user)):
    require_merchant(user)
    mid = user.get("merchant_id", user["id"])
    ads = await db.marketing_ads.find({"merchant_id": mid}).sort("created_at", -1).to_list(200)
    return serialize_docs(ads)

@api_router.delete("/merchant/marketing/ads/{aid}")
async def delete_ad(aid: str, user=Depends(get_current_user)):
    require_merchant(user)
    if not ObjectId.is_valid(aid): raise HTTPException(400)
    mid = user.get("merchant_id", user["id"])
    r = await db.marketing_ads.delete_one({"_id": ObjectId(aid), "merchant_id": mid})
    if r.deleted_count == 0: raise HTTPException(404)
    return {"message": "تم الحذف"}

@api_router.get("/marketing/ads/active")
async def active_ads_for_customer(campaign_type: str = "", user=Depends(get_current_user)):
    """Returns active campaigns visible to this customer with targeting applied."""
    now_iso = datetime.now(timezone.utc).isoformat()
    q: dict = {"active": True}
    if campaign_type in ("ad", "affiliate"):
        q["campaign_type"] = campaign_type
    ads = await db.marketing_ads.find(q).sort("created_at", -1).to_list(100)
    user_city = (user.get("city") or "").strip()
    user_gender = (user.get("gender") or "").strip().lower()
    filtered = []
    for a in ads:
        # If starts_at/ends_at set — check window
        if a.get("ends_at") and a["ends_at"] < now_iso[:10]:
            continue
        if a.get("starts_at") and a["starts_at"] > now_iso[:10]:
            continue
        # City filter (empty = all)
        tcities = [c.strip() for c in (a.get("target_cities") or []) if c.strip()]
        if tcities and user_city and user_city not in tcities:
            continue
        # Gender filter (empty = all)
        tgend = [g.strip().lower() for g in (a.get("target_genders") or []) if g.strip()]
        if tgend and user_gender and user_gender not in tgend:
            continue
        filtered.append(a)
    return serialize_docs(filtered)

@api_router.post("/marketing/ads/{aid}/track")
async def track_ad_event(aid: str, event: str, user=Depends(get_current_user)):
    """event: view | click"""
    if not ObjectId.is_valid(aid): raise HTTPException(400)
    if event not in ("view", "click"):
        raise HTTPException(400, "invalid event")
    key = "views" if event == "view" else "clicks"
    await db.marketing_ads.update_one({"_id": ObjectId(aid)}, {"$inc": {key: 1}})
    return {"ok": True}


class AffiliateApplyInput(BaseModel):
    merchant_id: str  # target merchant to be affiliate for
    campaign_id: str = ""  # optional — which affiliate campaign
    full_name: str
    social_handle: str = ""  # instagram/twitter link
    audience_size: int = 0
    note: str = ""

@api_router.post("/affiliate/apply")
async def apply_affiliate(data: AffiliateApplyInput, user=Depends(get_current_user)):
    if user.get("role") not in ("customer", "user"):
        raise HTTPException(status_code=403, detail="فقط العملاء يمكنهم التقديم")
    # Prevent duplicate pending applications
    existing = await db.affiliate_applications.find_one({
        "merchant_id": data.merchant_id,
        "applicant_id": user["id"],
        "status": "pending",
    })
    if existing:
        raise HTTPException(status_code=400, detail="لديك طلب معلق مسبقاً")
    # Also prevent duplicate if already active affiliate
    already = await db.affiliates.find_one({"merchant_id": data.merchant_id, "user_id": user["id"], "active": True})
    if already:
        raise HTTPException(status_code=400, detail="أنت مسوّق نشط لدى هذا التاجر بالفعل")
    doc = {
        "merchant_id": data.merchant_id,
        "campaign_id": data.campaign_id,
        "applicant_id": user["id"],
        "applicant_name": data.full_name or user.get("name", ""),
        "applicant_phone": user.get("phone", ""),
        "applicant_city": user.get("city", ""),
        "applicant_email": user.get("email", ""),
        "social_handle": data.social_handle,
        "audience_size": data.audience_size,
        "note": data.note,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.affiliate_applications.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "تم إرسال الطلب"}

@api_router.get("/merchant/affiliate/applications")
async def list_affiliate_applications(user=Depends(get_current_user)):
    require_merchant(user)
    mid = user.get("merchant_id", user["id"])
    apps = await db.affiliate_applications.find({"merchant_id": mid}).sort("created_at", -1).to_list(200)
    return serialize_docs(apps)

@api_router.post("/merchant/affiliate/applications/{aid}/approve")
async def approve_affiliate(aid: str, user=Depends(get_current_user)):
    require_merchant(user)
    if not ObjectId.is_valid(aid): raise HTTPException(400)
    mid = user.get("merchant_id", user["id"])
    appn = await db.affiliate_applications.find_one({"_id": ObjectId(aid), "merchant_id": mid})
    if not appn: raise HTTPException(404)
    if appn["status"] != "pending":
        raise HTTPException(status_code=400, detail="تمت المعالجة مسبقاً")
    # Pull commission from linked affiliate campaign if any, else default 5%
    commission = 5.0
    incentives = ""
    campaign_id = appn.get("campaign_id") or ""
    if campaign_id and ObjectId.is_valid(campaign_id):
        camp = await db.marketing_ads.find_one({"_id": ObjectId(campaign_id)})
        if camp:
            commission = float(camp.get("commission_percent") or 5.0)
            incentives = camp.get("incentives") or ""
    # Generate unique referral code
    ref_code = secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10].upper()
    while await db.affiliates.find_one({"referral_code": ref_code}):
        ref_code = secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10].upper()
    aff_doc = {
        "merchant_id": mid,
        "merchant_name": user.get("name", "Store"),
        "campaign_id": campaign_id,
        "user_id": appn["applicant_id"],
        "name": appn["applicant_name"],
        "phone": appn["applicant_phone"],
        "referral_code": ref_code,
        "commission_percent": commission,
        "incentives": incentives,
        "total_earnings": 0.0,
        "total_conversions": 0,
        "total_clicks": 0,
        "unique_visitors": 0,
        "wallet_balance": 0.0,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.affiliates.insert_one(aff_doc)
    await db.affiliate_applications.update_one(
        {"_id": ObjectId(aid)},
        {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc).isoformat(),
                  "referral_code": ref_code}},
    )
    # Flag user to have "affiliate" capability
    try:
        await db.users.update_one(
            {"_id": ObjectId(appn["applicant_id"])},
            {"$addToSet": {"affiliate_of": mid}},
        )
    except Exception:
        pass
    return {"referral_code": ref_code, "commission_percent": commission, "message": "تمت الموافقة وإنشاء الحساب"}


@api_router.get("/affiliate/dashboard")
async def affiliate_dashboard(user=Depends(get_current_user)):
    """Full dashboard for the customer showing all their affiliate accounts + analytics."""
    if user.get("role") not in ("customer", "user"):
        raise HTTPException(status_code=403)
    affs = await db.affiliates.find({"user_id": user["id"], "active": True}).to_list(50)
    result = []
    for a in affs:
        # Get recent conversions from a simple activity/conversions collection
        recent = await db.affiliate_conversions.find({"affiliate_id": str(a["_id"])}).sort("created_at", -1).limit(20).to_list(20)
        a["id"] = str(a.pop("_id"))
        a["recent_conversions"] = serialize_docs(recent)
        # Compute this-month earnings
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        this_month = 0.0
        for c in recent:
            if c.get("created_at", "") >= month_start:
                this_month += float(c.get("commission_amount") or 0)
        a["this_month_earnings"] = this_month
        result.append(a)
    return result

@api_router.post("/affiliate/{code}/click")
async def track_affiliate_click(code: str):
    """Public endpoint — tracks a click on a referral link (from anywhere)."""
    aff = await db.affiliates.find_one({"referral_code": code.upper()})
    if not aff:
        raise HTTPException(404, "رمز إحالة غير صالح")
    await db.affiliates.update_one({"_id": aff["_id"]}, {"$inc": {"total_clicks": 1}})
    return {"ok": True, "merchant_id": aff["merchant_id"]}

@api_router.post("/merchant/affiliate/applications/{aid}/reject")
async def reject_affiliate(aid: str, user=Depends(get_current_user)):
    require_merchant(user)
    if not ObjectId.is_valid(aid): raise HTTPException(400)
    mid = user.get("merchant_id", user["id"])
    r = await db.affiliate_applications.update_one(
        {"_id": ObjectId(aid), "merchant_id": mid, "status": "pending"},
        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat()}},
    )
    if r.matched_count == 0: raise HTTPException(404)
    return {"message": "تم الرفض"}

@api_router.get("/merchant/affiliate/list")
async def merchant_affiliates(user=Depends(get_current_user)):
    require_merchant(user)
    mid = user.get("merchant_id", user["id"])
    affs = await db.affiliates.find({"merchant_id": mid}).sort("total_earnings", -1).to_list(200)
    return serialize_docs(affs)

@api_router.get("/affiliate/my")
async def my_affiliate_accounts(user=Depends(get_current_user)):
    """Customer sees all the affiliate accounts they own."""
    if user.get("role") not in ("customer", "user"):
        raise HTTPException(status_code=403)
    affs = await db.affiliates.find({"user_id": user["id"]}).to_list(50)
    return serialize_docs(affs)

# ─── Marketer / Affiliate detailed statistics ───
@api_router.get("/affiliate/{aid}/stats")
async def affiliate_stats(aid: str, user=Depends(get_current_user)):
    """Detailed statistics + recent activity for a single affiliate account.
    Accessible by the owning marketer OR the owning merchant."""
    if not ObjectId.is_valid(aid): raise HTTPException(400)
    aff = await db.affiliates.find_one({"_id": ObjectId(aid)})
    if not aff: raise HTTPException(404, "الحساب غير موجود")
    is_owner = aff.get("user_id") == user["id"]
    mid = user.get("merchant_id", user["id"])
    is_merchant = user.get("role") == "merchant" and aff.get("merchant_id") == mid
    if not (is_owner or is_merchant):
        raise HTTPException(403, "لا صلاحية")
    # last 20 conversions
    convs = await db.affiliate_conversions.find({"affiliate_id": aid}).sort("created_at", -1).limit(20).to_list(20)
    # last 30-day daily sales
    from collections import defaultdict
    daily = defaultdict(lambda: {"sales": 0, "earnings": 0, "count": 0})
    all_convs = await db.affiliate_conversions.find({"affiliate_id": aid}).to_list(2000)
    for c in all_convs:
        day = (c.get("created_at") or "")[:10]
        if not day: continue
        daily[day]["sales"] += float(c.get("order_subtotal", 0))
        daily[day]["earnings"] += float(c.get("earning", 0))
        daily[day]["count"] += 1
    daily_series = [{"date": d, **v} for d, v in sorted(daily.items())][-30:]
    conversion_rate = 0.0
    clicks = int(aff.get("total_clicks", 0)) or 0
    if clicks > 0:
        conversion_rate = round(int(aff.get("total_conversions", 0)) * 100.0 / clicks, 2)
    return {
        "affiliate": serialize_doc(aff),
        "recent_conversions": [serialize_doc(c) for c in convs],
        "daily_series": daily_series,
        "conversion_rate": conversion_rate,
        "avg_order_value": round(
            float(aff.get("total_sales", 0)) / max(int(aff.get("total_conversions", 1)), 1), 2)
                            if aff.get("total_conversions", 0) else 0,
    }

@api_router.get("/merchant/affiliate/summary")
async def merchant_marketer_summary(user=Depends(get_current_user)):
    """Global summary + leaderboard for the merchant."""
    require_merchant(user)
    mid = user.get("merchant_id", user["id"])
    affs = await db.affiliates.find({"merchant_id": mid}).to_list(500)
    pending = await db.affiliate_applications.count_documents({"merchant_id": mid, "status": "pending"})
    active = sum(1 for a in affs if a.get("active"))
    total_conv = sum(int(a.get("total_conversions", 0)) for a in affs)
    total_sales = sum(float(a.get("total_sales", 0)) for a in affs)
    total_earn = sum(float(a.get("total_earnings", 0)) for a in affs)
    top = sorted(affs, key=lambda a: -float(a.get("total_earnings", 0)))[:5]
    return {
        "pending_applications": pending,
        "active_marketers": active,
        "total_marketers": len(affs),
        "total_conversions": total_conv,
        "total_sales": total_sales,
        "total_commission_paid": total_earn,
        "top_marketers": [serialize_doc(a) for a in top],
    }


@api_router.get("/merchant/products/live-viewers")
async def live_viewers_summary(user=Depends(get_current_user)):
    """Returns per-product count of visitors active in the last 5 minutes."""
    require_merchant(user)
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff}}},
        {"$group": {"_id": {"pid": "$product_id"},
                     "count": {"$sum": 1},
                     "sample_names": {"$addToSet": "$user_name"}}},
    ]
    docs = await db.product_views.aggregate(pipeline).to_list(200)
    result: dict = {}
    for d in docs:
        pid = (d.get("_id") or {}).get("pid")
        if not pid: continue
        result[pid] = {"count": int(d.get("count", 0)),
                       "sample_names": [n for n in (d.get("sample_names") or []) if n][:5]}
    return result

@api_router.post("/merchant/products/compare")
async def compare_products(request: Request, user=Depends(get_current_user)):
    """Side-by-side compare 2-4 products (KPI + monthly sales)."""
    require_merchant(user)
    body = await request.json()
    ids = [i for i in (body.get("product_ids") or []) if ObjectId.is_valid(i)][:4]
    if len(ids) < 2: raise HTTPException(400, "اختر منتجين على الأقل")
    out = []
    for pid in ids:
        p = await db.products.find_one({"_id": ObjectId(pid)})
        if not p: continue
        views_count = await db.product_views.count_documents({"product_id": pid})
        cart_count = await db.product_views.count_documents({"product_id": pid, "added_to_cart": True})
        orders_count = await db.orders.count_documents({"items.product_id": pid})
        out.append({
            "id": pid, "name_ar": p.get("name_ar"), "image": (p.get("images") or [None])[0],
            "price": p.get("price"), "sold_count": p.get("sold_count", 0),
            "views_count": views_count, "cart_count": cart_count, "orders_count": orders_count,
            "rating": p.get("rating", 0),
            "conversion_rate": round(orders_count * 100.0 / max(views_count, 1), 2),
        })
    return out


# ─── Product Analytics: track visits + abandoned checkouts ───────────────
class ProductViewInput(BaseModel):
    product_id: str
    session_id: str = ""
    duration_seconds: int = 0
    added_to_cart: bool = False
    reached_checkout: bool = False

@api_router.post("/products/{pid}/view")
async def record_product_view(pid: str, data: ProductViewInput, request: Request):
    """Anonymous or authenticated tracking of a product visit."""
    try:
        u = None
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        if token:
            try: u = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            except Exception: pass
        uid = u.get("id") if u else ""
        uname = ""
        if uid and ObjectId.is_valid(uid):
            udoc = await db.users.find_one({"_id": ObjectId(uid)})
            if udoc: uname = udoc.get("name", "")
        await db.product_views.insert_one({
            "product_id": pid, "user_id": uid, "user_name": uname,
            "session_id": data.session_id or f"anon_{datetime.now(timezone.utc).timestamp()}",
            "duration_seconds": max(0, int(data.duration_seconds)),
            "added_to_cart": bool(data.added_to_cart),
            "reached_checkout": bool(data.reached_checkout),
            "ip": request.client.host if request.client else "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        if ObjectId.is_valid(pid):
            await db.products.update_one({"_id": ObjectId(pid)}, {"$inc": {"views": 1}})
        return {"ok": True}
    except Exception as e:
        logger.warning(f"product view tracking failed: {e}")
        return {"ok": False}

@api_router.get("/merchant/products/{pid}/analytics")
async def product_analytics(pid: str, user=Depends(get_current_user)):
    """Detailed analytics for a product: visitors, cart adds, abandoned checkouts, sales trend.

    Now aggregates BOTH online orders AND POS invoices for accurate totals.
    """
    require_merchant(user)
    prod = await db.products.find_one({"_id": ObjectId(pid)}) if ObjectId.is_valid(pid) else None
    if not prod: raise HTTPException(404, "Product not found")
    views = await db.product_views.find({"product_id": pid}).sort("created_at", -1).to_list(500)
    total_views = len(views)
    unique_users = len({v.get("user_id") for v in views if v.get("user_id")})
    add_to_cart = sum(1 for v in views if v.get("added_to_cart"))
    reached_checkout = sum(1 for v in views if v.get("reached_checkout"))
    abandoned = []
    for v in views:
        if v.get("reached_checkout") and v.get("user_id"):
            has_order = await db.orders.find_one({
                "user_id": v["user_id"], "items.product_id": pid,
                "created_at": {"$gt": v.get("created_at", "")},
            })
            if not has_order:
                abandoned.append(v)
    from collections import defaultdict
    monthly = defaultdict(lambda: {"sales": 0.0, "orders": 0, "units": 0, "pos_sales": 0.0, "app_sales": 0.0})
    orders_list = await db.orders.find({"items.product_id": pid}).to_list(5000)
    buyers_list = []
    for o in orders_list:
        month = (o.get("created_at") or "")[:7]
        for it in o.get("items", []):
            if it.get("product_id") == pid:
                qty = int(it.get("quantity") or it.get("qty", 1))
                price = float(it.get("price", 0))
                monthly[month]["sales"] += price * qty
                monthly[month]["app_sales"] += price * qty
                monthly[month]["units"] += qty
                monthly[month]["orders"] += 1
                buyers_list.append({
                    "user_name": o.get("user_name") or o.get("customer_name") or "عميل",
                    "quantity": qty,
                    "total": round(price * qty, 2),
                    "source": "app",
                    "channel": o.get("source", "التطبيق"),
                    "created_at": o.get("created_at", ""),
                    "branch": o.get("branch_name", ""),
                })
    invoices_list = await db.invoices.find({"items.product_id": pid}).to_list(5000)
    branch_stats = defaultdict(lambda: {"revenue": 0.0, "units": 0, "orders": 0, "name": "", "city": "", "image": ""})
    for inv in invoices_list:
        month = (inv.get("created_at") or "")[:7]
        bid = inv.get("branch_id", "")
        for it in inv.get("items", []):
            if it.get("product_id") == pid:
                qty = int(it.get("quantity") or 1)
                price = float(it.get("price", 0))
                monthly[month]["sales"] += price * qty
                monthly[month]["pos_sales"] += price * qty
                monthly[month]["units"] += qty
                monthly[month]["orders"] += 1
                buyers_list.append({
                    "user_name": inv.get("customer_name") or "زبون فرع",
                    "quantity": qty,
                    "total": round(price * qty, 2),
                    "source": "pos",
                    "channel": "الفرع",
                    "created_at": inv.get("created_at", ""),
                    "branch": inv.get("branch_name", ""),
                })
                if bid:
                    branch_stats[bid]["revenue"] += price * qty
                    branch_stats[bid]["units"] += qty
                    branch_stats[bid]["orders"] += 1
    # Enrich branch stats with actual names/images
    top_branches = []
    for bid, agg in branch_stats.items():
        try:
            b = await db.branches.find_one({"_id": ObjectId(bid)})
            if b:
                top_branches.append({
                    "id": bid,
                    "name": b.get("name"),
                    "city": b.get("city"),
                    "image": b.get("image", ""),
                    "revenue": round(agg["revenue"], 2),
                    "units": agg["units"],
                    "orders": agg["orders"],
                })
        except Exception: pass
    top_branches.sort(key=lambda x: x["revenue"], reverse=True)
    # Sort buyers newest first
    buyers_list.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    monthly_series = [{"month": m, **v} for m, v in sorted(monthly.items())][-12:]
    total_sales = sum(v["sales"] for v in monthly.values())
    total_units = sum(v["units"] for v in monthly.values())
    total_orders_count = sum(v["orders"] for v in monthly.values())
    pos_share = sum(v["pos_sales"] for v in monthly.values())
    app_share = sum(v["app_sales"] for v in monthly.values())

    # Purchase source breakdown (referral / social / direct)
    from collections import Counter as _C
    src_counter = _C(v.get("source", "direct") for v in views if v.get("source"))
    purchase_sources = [{"source": k, "count": v} for k, v in src_counter.most_common()]

    visitors = [{
        "user_name": v.get("user_name") or "زائر",
        "duration_seconds": v.get("duration_seconds", 0),
        "added_to_cart": v.get("added_to_cart", False),
        "reached_checkout": v.get("reached_checkout", False),
        "created_at": v.get("created_at", ""),
    } for v in views[:20]]
    avg_duration = round(sum(v.get("duration_seconds", 0) for v in views) / max(total_views, 1))
    conv_rate = round(reached_checkout * 100.0 / max(total_views, 1), 2)
    return {
        "product": {"id": pid, "name_ar": prod.get("name_ar"), "images": prod.get("images", []),
                    "price": prod.get("price"), "sold_count": prod.get("sold_count", 0)},
        "kpis": {
            "total_views": total_views, "unique_users": unique_users,
            "add_to_cart": add_to_cart, "reached_checkout": reached_checkout,
            "abandoned_count": len(abandoned), "conversion_rate": conv_rate,
            "avg_duration_seconds": avg_duration,
            "total_sales": round(total_sales, 2),
            "total_units_sold": total_units,
            "total_orders": total_orders_count,
            "pos_sales": round(pos_share, 2),
            "app_sales": round(app_share, 2),
        },
        "monthly_series": monthly_series,
        "visitors": visitors,
        "buyers": buyers_list[:30],
        "top_branches": top_branches[:10],
        "purchase_sources": purchase_sources,
        "abandoned_cart_users": [{
            "user_id": a.get("user_id"), "user_name": a.get("user_name") or "زائر",
            "created_at": a.get("created_at", ""),
        } for a in abandoned[:20]],
    }

# ─── Merchant overview / leaderboards ───
@api_router.get("/merchant/products/{pid}/deep-analytics")
async def product_deep_analytics(pid: str, user=Depends(get_current_user)):
    """Rich in-app analytics for a single product: KPIs, visitors, buyers, cart-abandonments,
    shares by platform + who shared with whom, reviews & questions, similar products for comparison.
    """
    require_merchant(user)
    if not ObjectId.is_valid(pid):
        raise HTTPException(400, "Invalid product id")
    prod = await db.products.find_one({"_id": ObjectId(pid)})
    if not prod:
        raise HTTPException(404, "Product not found")

    from collections import Counter, defaultdict
    now = datetime.now(timezone.utc)
    today_cutoff = (now - timedelta(days=1)).isoformat()
    week_cutoff = (now - timedelta(days=7)).isoformat()
    month_cutoff = (now - timedelta(days=30)).isoformat()

    # ── Views ──
    views = await db.product_views.find({"product_id": pid}).sort("created_at", -1).to_list(2000)
    total_views = len(views)
    views_today = sum(1 for v in views if v.get("created_at", "") >= today_cutoff)
    views_week = sum(1 for v in views if v.get("created_at", "") >= week_cutoff)
    views_month = sum(1 for v in views if v.get("created_at", "") >= month_cutoff)
    unique_users_ids = {v.get("user_id") for v in views if v.get("user_id")}
    unique_visitors = len(unique_users_ids)
    add_to_cart = sum(1 for v in views if v.get("added_to_cart"))
    reached_checkout = sum(1 for v in views if v.get("reached_checkout"))
    avg_duration = round(sum(v.get("duration_seconds", 0) for v in views) / max(total_views, 1))

    # Traffic source breakdown
    src_c = Counter(v.get("source", "direct") for v in views)
    traffic_sources = [{"source": k, "count": v, "pct": round(v * 100 / max(total_views, 1), 1)}
                       for k, v in src_c.most_common()]

    # ── Visitor per-user aggregation ──
    per_user_views = defaultdict(lambda: {"count": 0, "cart_adds": 0, "last_seen": ""})
    for v in views:
        uid = v.get("user_id") or "anon"
        per_user_views[uid]["count"] += 1
        per_user_views[uid]["last_seen"] = max(per_user_views[uid]["last_seen"], v.get("created_at", ""))
        per_user_views[uid]["user_name"] = v.get("user_name") or "زائر"
        if v.get("added_to_cart"):
            per_user_views[uid]["cart_adds"] += 1

    # ── Orders (app + POS invoices) ──
    orders_list = await db.orders.find({"items.product_id": pid}).sort("created_at", -1).to_list(2000)
    buyers = []
    monthly = defaultdict(lambda: {"sales": 0.0, "units": 0, "orders": 0})
    for o in orders_list:
        month = (o.get("created_at") or "")[:7]
        for it in o.get("items", []):
            if it.get("product_id") == pid:
                qty = int(it.get("quantity") or it.get("qty", 1))
                price = float(it.get("price", 0))
                monthly[month]["sales"] += price * qty
                monthly[month]["units"] += qty
                monthly[month]["orders"] += 1
                buyers.append({
                    "user_id": o.get("user_id"),
                    "user_name": o.get("user_name") or o.get("customer_name") or "عميل",
                    "phone": o.get("phone", ""),
                    "quantity": qty,
                    "total": round(price * qty, 2),
                    "payment_method": o.get("payment_method", ""),
                    "status": o.get("status", ""),
                    "created_at": o.get("created_at", ""),
                    "address": o.get("address", ""),
                    "source": "app",
                })
    invoices_list = await db.invoices.find({"items.product_id": pid}).sort("created_at", -1).to_list(2000)
    for inv in invoices_list:
        month = (inv.get("created_at") or "")[:7]
        for it in inv.get("items", []):
            if it.get("product_id") == pid:
                qty = int(it.get("quantity") or 1)
                price = float(it.get("price", 0))
                monthly[month]["sales"] += price * qty
                monthly[month]["units"] += qty
                monthly[month]["orders"] += 1
                buyers.append({
                    "user_name": inv.get("customer_name") or "زبون فرع",
                    "quantity": qty,
                    "total": round(price * qty, 2),
                    "payment_method": inv.get("payment_method", "نقدي"),
                    "status": "مكتمل",
                    "created_at": inv.get("created_at", ""),
                    "address": inv.get("branch_name", ""),
                    "source": "pos",
                })
    total_revenue = sum(m["sales"] for m in monthly.values())
    total_units = sum(m["units"] for m in monthly.values())
    total_orders = sum(m["orders"] for m in monthly.values())

    # Buyer set for identifying users who added-to-cart but didn't buy
    buyer_ids = {o.get("user_id") for o in orders_list if o.get("user_id")}
    cart_abandonments = []
    seen_abandon = set()
    for v in views:
        uid = v.get("user_id")
        if v.get("added_to_cart") and uid and uid not in buyer_ids and uid not in seen_abandon:
            cart_abandonments.append({
                "user_id": uid, "user_name": v.get("user_name") or "زائر",
                "added_at": v.get("created_at", ""),
                "reached_checkout": v.get("reached_checkout", False),
            })
            seen_abandon.add(uid)
    cart_abandonments.sort(key=lambda x: x["added_at"], reverse=True)

    # Top visitors (by count)
    top_visitors = sorted(
        [{"user_id": uid, **v} for uid, v in per_user_views.items()],
        key=lambda x: x["count"], reverse=True
    )[:20]

    # ── Shares ──
    shares = await db.share_events.find({"product_id": pid}).sort("created_at", -1).to_list(500)
    plat_c = Counter(s.get("platform", "غير محدد") for s in shares)
    shares_by_platform = [{"platform": p, "count": c} for p, c in plat_c.most_common()]
    recent_shares = [{
        "user_name": s.get("user_name", "زائر"),
        "platform": s.get("platform", ""),
        "shared_to": s.get("shared_to", ""),
        "created_at": s.get("created_at", ""),
    } for s in shares[:30]]

    # ── Reviews + Questions ──
    reviews = await db.product_reviews.find({"product_id": pid}).sort("created_at", -1).to_list(200)
    reviews_only = [r for r in reviews if r.get("type") != "question" and r.get("rating", 0) > 0]
    questions = [r for r in reviews if r.get("type") == "question"]
    avg_rating = round(sum(r.get("rating", 0) for r in reviews_only) / max(len(reviews_only), 1), 2)

    def _clean_review(r):
        return {
            "user_name": r.get("user_name", "زائر"),
            "rating": r.get("rating", 0),
            "text": r.get("text", ""),
            "created_at": r.get("created_at", ""),
        }

    # ── Similar products for comparison ──
    similar = await db.products.find({
        "_id": {"$ne": ObjectId(pid)},
        "category_id": prod.get("category_id"),
    }).limit(3).to_list(3)

    comparison = []
    for sp in similar:
        spid = str(sp["_id"])
        s_views = await db.product_views.count_documents({"product_id": spid})
        s_cart = await db.product_views.count_documents({"product_id": spid, "added_to_cart": True})
        s_orders = await db.orders.count_documents({"items.product_id": spid})
        comparison.append({
            "id": spid,
            "name_ar": sp.get("name_ar"),
            "image": (sp.get("images") or [""])[0] if sp.get("images") else "",
            "price": sp.get("price"),
            "views": s_views,
            "cart_adds": s_cart,
            "orders": s_orders,
            "rating": sp.get("rating", 0),
            "sold_count": sp.get("sold_count", 0),
        })

    # Rankings within category
    cat_id = prod.get("category_id", "")
    cat_ranking = None
    if cat_id:
        cat_products = await db.products.find({"category_id": cat_id}).to_list(100)
        scored = []
        for cp in cat_products:
            cpid = str(cp["_id"])
            v = await db.product_views.count_documents({"product_id": cpid})
            o = await db.orders.count_documents({"items.product_id": cpid})
            scored.append({"pid": cpid, "score": v + o * 3})
        scored.sort(key=lambda x: x["score"], reverse=True)
        for i, s in enumerate(scored, 1):
            if s["pid"] == pid:
                cat_ranking = {"rank": i, "total": len(scored)}
                break

    conv_rate = round(reached_checkout * 100.0 / max(total_views, 1), 2)
    cart_conv = round(add_to_cart * 100.0 / max(total_views, 1), 2)
    purchase_conv = round(total_orders * 100.0 / max(total_views, 1), 2)

    return {
        "product": {
            "id": pid, "name_ar": prod.get("name_ar"), "name_en": prod.get("name_en"),
            "images": prod.get("images", []),
            "price": prod.get("price"), "discount_price": prod.get("discount_price"),
            "sold_count": prod.get("sold_count", 0),
            "stock": prod.get("stock", 0), "in_stock": prod.get("in_stock", True),
            "rating": prod.get("rating", 0),
            "review_count": prod.get("review_count", 0),
            "condition": prod.get("condition", "new"),
            "warranty_days": prod.get("warranty_days", 0),
            "warranty_type": prod.get("warranty_type", ""),
        },
        "kpis": {
            "total_views": total_views,
            "views_today": views_today,
            "views_week": views_week,
            "views_month": views_month,
            "unique_visitors": unique_visitors,
            "add_to_cart": add_to_cart,
            "reached_checkout": reached_checkout,
            "cart_abandonments": len(cart_abandonments),
            "total_orders": total_orders,
            "total_units": total_units,
            "total_revenue": round(total_revenue, 2),
            "conversion_rate": conv_rate,
            "cart_conversion_rate": cart_conv,
            "purchase_conversion_rate": purchase_conv,
            "avg_duration_seconds": avg_duration,
            "avg_rating": avg_rating,
            "review_count_real": len(reviews_only),
            "questions_count": len(questions),
            "shares_total": len(shares),
        },
        "monthly_series": [{"month": m, **v} for m, v in sorted(monthly.items())][-12:],
        "traffic_sources": traffic_sources,
        "top_visitors": top_visitors,
        "cart_abandonments": cart_abandonments[:30],
        "buyers": buyers[:50],
        "shares_by_platform": shares_by_platform,
        "recent_shares": recent_shares,
        "reviews": [_clean_review(r) for r in reviews_only[:30]],
        "questions": [_clean_review(r) for r in questions[:20]],
        "comparison": comparison,
        "category_ranking": cat_ranking,
    }


@api_router.get("/merchant/analytics/top-products")
async def top_products_analytics(user=Depends(get_current_user), limit: int = 20):
    """Top products by revenue (from orders + invoices combined)."""
    require_merchant(user)
    from collections import defaultdict
    stats = defaultdict(lambda: {"revenue": 0.0, "units": 0, "orders": 0, "pos_orders": 0, "app_orders": 0})
    async for o in db.orders.find({}):
        for it in o.get("items", []):
            pid = it.get("product_id")
            if not pid: continue
            qty = int(it.get("quantity") or it.get("qty", 1))
            price = float(it.get("price", 0))
            stats[pid]["revenue"] += price * qty
            stats[pid]["units"] += qty
            stats[pid]["orders"] += 1
            stats[pid]["app_orders"] += 1
    async for inv in db.invoices.find({}):
        for it in inv.get("items", []):
            pid = it.get("product_id")
            if not pid: continue
            qty = int(it.get("quantity") or 1)
            price = float(it.get("price", 0))
            stats[pid]["revenue"] += price * qty
            stats[pid]["units"] += qty
            stats[pid]["orders"] += 1
            stats[pid]["pos_orders"] += 1
    # Enrich with product info
    rows = []
    for pid, agg in stats.items():
        if not ObjectId.is_valid(pid): continue
        p = await db.products.find_one({"_id": ObjectId(pid)})
        if not p: continue
        rows.append({
            "product_id": pid,
            "name": p.get("name_ar") or p.get("name_en"),
            "image": (p.get("images") or [None])[0],
            "price": p.get("price", 0),
            "revenue": round(agg["revenue"], 2),
            "units": agg["units"],
            "orders": agg["orders"],
            "pos_orders": agg["pos_orders"],
            "app_orders": agg["app_orders"],
        })
    rows.sort(key=lambda r: r["revenue"], reverse=True)
    return {"generated_at": datetime.now(timezone.utc).isoformat(), "top": rows[:limit]}

@api_router.get("/merchant/analytics/sales-overview")
async def sales_overview(user=Depends(get_current_user)):
    """Combined POS + Online sales overview: today, week, month, channel split."""
    require_merchant(user)
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    week_start = (now - timedelta(days=7)).isoformat()
    month_start = (now - timedelta(days=30)).isoformat()
    def total(items):
        s = 0.0
        for x in items:
            if x.get("total"):
                s += float(x["total"])
            elif x.get("items"):
                for it in x["items"]:
                    qty = int(it.get("quantity") or it.get("qty", 1))
                    s += float(it.get("price", 0)) * qty
        return s
    orders_all = await db.orders.find({}).to_list(5000)
    invoices_all = await db.invoices.find({}).to_list(5000)
    orders_today = [o for o in orders_all if (o.get("created_at") or "").startswith(today)]
    orders_week = [o for o in orders_all if (o.get("created_at") or "") >= week_start]
    orders_month = [o for o in orders_all if (o.get("created_at") or "") >= month_start]
    invoices_today = [o for o in invoices_all if (o.get("created_at") or "").startswith(today)]
    invoices_week = [o for o in invoices_all if (o.get("created_at") or "") >= week_start]
    invoices_month = [o for o in invoices_all if (o.get("created_at") or "") >= month_start]
    # Daily breakdown for last 30 days
    from collections import defaultdict
    daily = defaultdict(lambda: {"pos": 0.0, "app": 0.0})
    for inv in invoices_month:
        d = (inv.get("created_at") or "")[:10]
        daily[d]["pos"] += float(inv.get("total", 0))
    for o in orders_month:
        d = (o.get("created_at") or "")[:10]
        for it in o.get("items", []):
            qty = int(it.get("quantity") or it.get("qty", 1))
            daily[d]["app"] += float(it.get("price", 0)) * qty
    daily_series = [{"date": d, **v} for d, v in sorted(daily.items())][-30:]
    return {
        "today":  {"pos_sales": round(total(invoices_today), 2), "app_sales": round(total(orders_today), 2), "count": len(invoices_today) + len(orders_today)},
        "week":   {"pos_sales": round(total(invoices_week), 2),  "app_sales": round(total(orders_week), 2),  "count": len(invoices_week) + len(orders_week)},
        "month":  {"pos_sales": round(total(invoices_month), 2), "app_sales": round(total(orders_month), 2), "count": len(invoices_month) + len(orders_month)},
        "daily_series": daily_series,
    }

# ─── Service analytics ───
@api_router.get("/merchant/services/{svc_id}/analytics")
async def service_analytics(svc_id: str, user=Depends(get_current_user)):
    """Deep analytics for a service: bookings by status, revenue, reviews, weekly trend, technicians."""
    require_merchant(user)
    svc = await db.services.find_one({"_id": ObjectId(svc_id)}) if ObjectId.is_valid(svc_id) else None
    if not svc:
        raise HTTPException(404, "Service not found")
    bookings = await db.service_bookings.find({"service_id": svc_id}).to_list(2000)
    from collections import Counter, defaultdict
    status_counts = Counter(b.get("status", "pending") for b in bookings)
    revenue = sum(float(b.get("total_fee", 0) or 0) for b in bookings if b.get("status") in ("completed", "delivered", "in_progress"))
    reviews = await db.service_reviews.find({"service_id": svc_id, "update_id": ""}).to_list(500)
    avg_rating = round(sum(r.get("stars", 0) for r in reviews) / max(len(reviews), 1), 2) if reviews else 0
    star_dist = Counter(r.get("stars", 0) for r in reviews)
    # Weekly bookings
    weekly = defaultdict(int)
    for b in bookings:
        d = (b.get("created_at") or "")[:10]
        if d: weekly[d[:7]] += 1
    weekly_series = [{"period": p, "count": c} for p, c in sorted(weekly.items())][-12:]

    # Technician stats
    tech_stats = defaultdict(lambda: {"count": 0, "completed": 0, "revenue": 0.0, "total_duration_hours": 0.0, "avg_rating": 0.0, "rating_count": 0, "name": "", "avatar": ""})
    for b in bookings:
        tid = b.get("technician_id") or b.get("assigned_to") or ""
        if not tid: continue
        tech_stats[tid]["count"] += 1
        if b.get("status") in ("completed", "delivered"):
            tech_stats[tid]["completed"] += 1
            tech_stats[tid]["revenue"] += float(b.get("total_fee", 0) or 0)
            # duration: completed_at - created_at
            try:
                if b.get("completed_at") and b.get("created_at"):
                    dt_a = datetime.fromisoformat(str(b["created_at"]).replace("Z", "+00:00"))
                    dt_b = datetime.fromisoformat(str(b["completed_at"]).replace("Z", "+00:00"))
                    tech_stats[tid]["total_duration_hours"] += (dt_b - dt_a).total_seconds() / 3600
            except Exception: pass
    technicians = []
    for tid, agg in tech_stats.items():
        try:
            u = await db.users.find_one({"_id": ObjectId(tid)})
            if u:
                # Get rating from reviews mentioning this tech
                tech_reviews = [r for r in reviews if r.get("technician_id") == tid or r.get("assigned_to") == tid]
                avg = round(sum(r.get("stars", 0) for r in tech_reviews) / max(len(tech_reviews), 1), 2) if tech_reviews else 0
                technicians.append({
                    "id": tid,
                    "name": u.get("name") or "فني",
                    "avatar": u.get("avatar", ""),
                    "phone": u.get("phone", ""),
                    "count": agg["count"],
                    "completed": agg["completed"],
                    "revenue": round(agg["revenue"], 2),
                    "avg_duration_hours": round(agg["total_duration_hours"] / max(agg["completed"], 1), 2),
                    "avg_rating": avg,
                    "rating_count": len(tech_reviews),
                })
        except Exception: pass
    technicians.sort(key=lambda x: x["completed"], reverse=True)

    # Average duration overall
    total_completed = 0
    total_dur_h = 0.0
    for b in bookings:
        if b.get("status") in ("completed", "delivered") and b.get("completed_at") and b.get("created_at"):
            try:
                dt_a = datetime.fromisoformat(str(b["created_at"]).replace("Z", "+00:00"))
                dt_b = datetime.fromisoformat(str(b["completed_at"]).replace("Z", "+00:00"))
                total_dur_h += (dt_b - dt_a).total_seconds() / 3600
                total_completed += 1
            except Exception: pass
    avg_dur_h = round(total_dur_h / max(total_completed, 1), 2)

    # Hourly heatmap (day-of-week × hour)
    hourly = defaultdict(int)
    for b in bookings:
        try:
            dt = datetime.fromisoformat(str(b.get("created_at", "")).replace("Z", "+00:00"))
            hourly[f"{dt.weekday()}_{dt.hour}"] += 1
        except Exception: pass

    return {
        "service": {"id": svc_id, "title": svc.get("title") or svc.get("name"), "base_price": svc.get("base_price", 0)},
        "kpis": {
            "total_bookings": len(bookings),
            "revenue": round(revenue, 2),
            "avg_rating": avg_rating,
            "review_count": len(reviews),
            "avg_duration_hours": avg_dur_h,
        },
        "status_breakdown": [{"status": k, "count": v} for k, v in status_counts.items()],
        "star_distribution": [{"stars": s, "count": star_dist.get(s, 0)} for s in [5, 4, 3, 2, 1]],
        "weekly_series": weekly_series,
        "recent_reviews": [serialize_doc(r) for r in reviews[:5]],
        "technicians": technicians,
        "hourly_heatmap": hourly,
    }

# ─── Competition analytics with source tracking ───
@api_router.get("/merchant/competitions/{comp_id}/analytics")
async def competition_analytics(comp_id: str, user=Depends(get_current_user)):
    """Deep analytics for a competition: sources, cities, followers gained, hourly trend."""
    require_merchant(user)
    comp = await db.competitions.find_one({"_id": ObjectId(comp_id)}) if ObjectId.is_valid(comp_id) else None
    if not comp:
        raise HTTPException(404, "Competition not found")
    entries = await db.competition_entries.find({"competition_id": comp_id}).to_list(5000)
    from collections import Counter, defaultdict
    sources = Counter(e.get("source", "organic") for e in entries)
    cities = Counter(e.get("user_city", "غير محدد") for e in entries).most_common(10)
    # Daily entries trend
    daily = defaultdict(int)
    hourly_dist = defaultdict(int)
    dow_dist = defaultdict(int)
    for e in entries:
        d = (e.get("created_at") or "")[:10]
        if d: daily[d] += 1
        try:
            dt = datetime.fromisoformat(str(e.get("created_at", "")).replace("Z", "+00:00"))
            hourly_dist[dt.hour] += 1
            dow_dist[dt.weekday()] += 1
        except Exception: pass
    daily_series = [{"date": d, "count": c} for d, c in sorted(daily.items())]
    peak_hour = max(hourly_dist.items(), key=lambda x: x[1])[0] if hourly_dist else 0
    peak_dow = max(dow_dist.items(), key=lambda x: x[1])[0] if dow_dist else 0
    # Estimate followers gained (unique user_ids)
    unique_users = len({e.get("user_id") for e in entries if e.get("user_id")})
    return {
        "competition": {
            "id": comp_id,
            "title": comp.get("title"),
            "description": comp.get("description", ""),
            "prize": comp.get("prize"),
            "prize_details": comp.get("prize_details", ""),
            "image": comp.get("image") or comp.get("banner_image", ""),
            "competition_type": comp.get("competition_type"),
            "status": comp.get("status"),
            "starts_at": comp.get("starts_at", comp.get("start_at", "")),
            "ends_at": comp.get("ends_at", comp.get("end_at", "")),
            "rules": comp.get("rules", ["اتّباع شروط المسابقة", "المشاركة متاحة للمقيمين في المملكة", "قرار اللجنة نهائي"]),
            "max_winners": comp.get("max_winners", comp.get("winners_count", 1)),
            "created_at": comp.get("created_at", ""),
        },
        "kpis": {
            "total_participants": len(entries),
            "unique_users": unique_users,
            "followers_gained": unique_users,
            "engagement_rate": round(unique_users * 100.0 / max(len(entries), 1), 2),
        },
        "sources": [{"source": k, "count": v} for k, v in sources.most_common()],
        "top_cities": [{"city": c, "count": n} for c, n in cities],
        "daily_series": daily_series,
        "hourly_distribution": [{"hour": h, "count": hourly_dist.get(h, 0)} for h in range(24)],
        "peak_hour": peak_hour,
        "peak_day_of_week": peak_dow,
        "recent_participants": [{
            "user_name": e.get("user_name"),
            "user_phone": e.get("user_phone", ""),
            "user_city": e.get("user_city"),
            "source": e.get("source"),
            "created_at": e.get("created_at"),
        } for e in entries[-15:]],
        "all_participants": [{
            "user_name": e.get("user_name"),
            "user_phone": e.get("user_phone", ""),
            "user_city": e.get("user_city", ""),
            "source": e.get("source", ""),
            "created_at": e.get("created_at", ""),
        } for e in entries][-100:],
        "winner_details": [
            {"user_name": w.get("user_name"), "user_phone": w.get("user_phone", ""),
             "user_city": w.get("user_city", ""), "prize_position": w.get("prize_position", 0),
             "prize_awarded": w.get("prize_awarded", comp.get("prize", "")),
             "picked_at": w.get("picked_at", "")}
            for w in (comp.get("winners") or [])[:20]
        ],
    }

@api_router.get("/merchant/competitions/analytics-overview")
async def competitions_overview(user=Depends(get_current_user)):
    """Compare competition types — which attracts more people."""
    require_merchant(user)
    comps = await db.competitions.find({}).to_list(500)
    from collections import defaultdict
    by_type = defaultdict(lambda: {"count": 0, "total_participants": 0})
    for c in comps:
        t = c.get("competition_type") or "general"
        by_type[t]["count"] += 1
        # count from entries
        n = await db.competition_entries.count_documents({"competition_id": str(c["_id"])})
        by_type[t]["total_participants"] += n
    return {"by_type": [{"type": k, **v} for k, v in sorted(by_type.items(), key=lambda x: -x[1]["total_participants"])]}

# ─── Social post detail (merchant super-view) ───
@api_router.get("/merchant/social/posts/{pid}/detail")
async def merchant_post_detail(pid: str, user=Depends(get_current_user)):
    """Full detail of a post — viewers, likers, sharers, comments with replies, poll voters."""
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    post = await db.social_posts.find_one({"_id": ObjectId(pid)}) if ObjectId.is_valid(pid) else None
    if not post:
        raise HTTPException(404, "Post not found")
    post = serialize_doc(post)
    viewers = post.get("viewers", []) or []
    # Support both "likers" and "liked_by" for backward-compat
    likers = (post.get("likers") or post.get("liked_by") or [])
    # Sharers can be stored as "sharers" or "shared_by"
    sharers = (post.get("sharers") or post.get("shared_by") or [])
    comments = post.get("comments", []) if isinstance(post.get("comments"), list) else []
    poll = post.get("poll") or {}
    if poll.get("options") and poll.get("voters"):
        for i, opt in enumerate(poll["options"]):
            opt["voter_list"] = poll["voters"].get(str(i), [])[:100]
    # Normalize sharer records to have created_at from possible aliases
    for sh in sharers:
        if not sh.get("created_at"):
            sh["created_at"] = sh.get("shared_at", "")
    for lk in likers:
        if not lk.get("created_at"):
            lk["created_at"] = lk.get("liked_at", "")
    return {
        "post": {
            "id": post.get("id"),
            "author_name": post.get("author_name") or post.get("author"),
            "text": post.get("text"),
            "images": post.get("images", []),
            "image": post.get("image"),
            "created_at": post.get("created_at"),
            "likes": post.get("likes", len(likers)),
            "views": post.get("views", 0),
            "shares": post.get("shares", len(sharers)),
        },
        "kpis": {
            "views": post.get("views", len(viewers)),
            "unique_viewers": len({v.get("user_id") for v in viewers if v.get("user_id")}),
            "likes": post.get("likes", len(likers)),
            "shares": post.get("shares", len(sharers)),
            "comment_count": len(comments),
            "reply_count": sum(len(c.get("replies", []) or []) for c in comments),
            "answered_comments": sum(1 for c in comments if c.get("store_reply")),
        },
        "viewers": sorted(viewers, key=lambda x: x.get("viewed_at", ""), reverse=True)[:100],
        "likers": sorted(likers, key=lambda x: x.get("created_at", ""), reverse=True)[:100],
        "sharers": sorted(sharers, key=lambda x: x.get("created_at", ""), reverse=True)[:100],
        "comments": sorted(comments, key=lambda x: x.get("created_at", ""), reverse=True),
        "poll": poll,
    }

@api_router.post("/merchant/social/posts/{pid}/like-as-store")
async def like_as_store(pid: str, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    if not ObjectId.is_valid(pid): raise HTTPException(400, "Bad id")
    # Idempotent: only $inc when merchant wasn't in store_likes
    r = await db.social_posts.update_one(
        {"_id": ObjectId(pid), "store_likes": {"$ne": user.get("id")}},
        {"$addToSet": {"store_likes": user.get("id")}, "$inc": {"likes": 1}},
    )
    return {"ok": True, "changed": bool(r.modified_count)}

@api_router.post("/merchant/social/posts/{pid}/comments/{cid}/replies")
async def reply_to_comment_as_store(pid: str, cid: str, request: Request, user=Depends(get_current_user)):
    """Store reply that appears as a threaded reply under a comment."""
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text: raise HTTPException(400, "text required")
    reply = {
        "id": str(ObjectId()),
        "user_id": user.get("id"),
        "user_name": f"🏪 {user.get('name', 'المتجر')}",
        "is_store": True,
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.social_posts.update_one(
        {"_id": ObjectId(pid), "comments.id": cid},
        {"$push": {"comments.$.replies": reply}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Post or comment not found")
    return {"ok": True, "reply": reply}


@api_router.post("/merchant/abandoned-carts/{user_id}/send-offer")
async def send_abandoned_offer(user_id: str, request: Request, user=Depends(get_current_user)):
    """Send a discount notification to a user who abandoned their cart."""
    require_merchant(user)
    body = await request.json()
    percent = int(body.get("discount_percent", 10))
    product_name = body.get("product_name", "")
    try:
        await create_notification(
            user_id,
            f"🎁 خصم {percent}% خاص لك!",
            f"عرض حصري على {product_name} — لا تفوّت الفرصة",
            {"type": "abandoned_offer", "discount_percent": percent, "product_name": product_name},
        )
        return {"ok": True, "message": "تم إرسال العرض"}
    except Exception as e:
        raise HTTPException(500, str(e))

# ─── Social: merchant reply AS the store ────────────────────────────────
@api_router.post("/social/posts/{pid}/comments/{cid}/store-reply")
async def store_reply_to_comment(pid: str, cid: str, request: Request, user=Depends(get_current_user)):
    if user.get("role") != "merchant":
        raise HTTPException(403, "المتاجر فقط")
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text: raise HTTPException(400, "النص مطلوب")
    reply = {
        "id": str(ObjectId()), "user_id": user["id"],
        "user_name": user.get("store_name") or user.get("name") or "المتجر",
        "text": text, "is_store": True, "verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.social_posts.update_one(
        {"_id": ObjectId(pid), "comments.id": cid},
        {"$push": {"comments.$.replies": reply}},
    )
    return {"ok": True, "reply": reply}


# ─── Social share tracking (customer) + merchant view (agent-only) ────────
@api_router.post("/social/posts/{pid}/share")
async def track_share(pid: str, request: Request, user=Depends(get_current_user)):
    """Customer clicked share on a post. Records where they shared to."""
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    platform = (body.get("platform") or "unknown").lower()
    entry = {
        "user_id": user.get("id"),
        "user_name": user.get("name") or "مستخدم",
        "user_phone": user.get("phone"),
        "user_city": user.get("city") or "غير محدد",
        "platform": platform,
        "shared_at": datetime.now(timezone.utc).isoformat(),
    }
    if not ObjectId.is_valid(pid): raise HTTPException(400, "Bad id")
    await db.social_posts.update_one(
        {"_id": ObjectId(pid)},
        {"$push": {"sharers": entry}, "$inc": {"shares": 1, f"share_by_platform.{platform}": 1}},
    )
    return {"ok": True}

@api_router.get("/merchant/social/posts/{pid}/sharers")
async def merchant_post_sharers(pid: str, user=Depends(get_current_user)):
    """Merchant: full list of users who shared this post + where."""
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    if not ObjectId.is_valid(pid): raise HTTPException(400, "Bad id")
    post = await db.social_posts.find_one({"_id": ObjectId(pid)}, {"sharers": 1, "share_by_platform": 1, "shares": 1})
    if not post: raise HTTPException(404, "Not found")
    sharers = post.get("sharers", []) or []
    return {
        "total": len(sharers),
        "by_platform": post.get("share_by_platform", {}),
        "sharers": sorted(sharers, key=lambda x: x.get("shared_at", ""), reverse=True)[:200],
    }

@api_router.get("/merchant/social/posts/{pid}/viewers")
async def merchant_post_viewers(pid: str, user=Depends(get_current_user)):
    """Merchant: full list of users who viewed post but didn't interact."""
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    if not ObjectId.is_valid(pid): raise HTTPException(400, "Bad id")
    post = await db.social_posts.find_one({"_id": ObjectId(pid)})
    if not post: raise HTTPException(404, "Not found")
    viewers = post.get("viewers", []) or []
    likers = post.get("likers", []) or []
    liker_ids = {l.get("user_id") for l in likers}
    comment_ids = {c.get("user_id") for c in (post.get("comments") or []) if c.get("user_id")}
    engaged_ids = liker_ids | comment_ids
    # Split into engaged vs silent viewers
    silent = [v for v in viewers if v.get("user_id") not in engaged_ids]
    engaged = [v for v in viewers if v.get("user_id") in engaged_ids]
    return {
        "total_views": len(viewers),
        "silent_viewers": sorted(silent, key=lambda x: x.get("viewed_at", ""), reverse=True)[:200],
        "engaged_viewers": sorted(engaged, key=lambda x: x.get("viewed_at", ""), reverse=True)[:200],
    }

# ─── Live Preview - Overview / General tab (drivers, branches, marketers) ─────
@api_router.get("/merchant/live-preview/overview")
async def live_preview_overview(user=Depends(get_current_user)):
    """General/Overview tab: aggregated stats for drivers, branches, marketers, employees."""
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")

    # Drivers
    drivers_docs = await db.drivers.find({}).to_list(500)
    drivers = []
    for d in drivers_docs:
        drivers.append({
            "id": str(d.get("_id", "")),
            "name": d.get("name", "سائق"),
            "phone": d.get("phone", ""),
            "avatar": d.get("avatar", ""),
            "vehicle": d.get("vehicle_info", ""),
            "online": bool(d.get("online", False)),
            "total_deliveries": d.get("total_deliveries", 0),
            "today_deliveries": d.get("today_deliveries", 0),
            "week_deliveries": d.get("week_deliveries", 0),
            "month_deliveries": d.get("month_deliveries", 0),
            "year_deliveries": d.get("year_deliveries", 0),
            "rating": d.get("avg_rating", d.get("rating", 4.5)),
            "wallet_balance": d.get("wallet_balance", 0),
            "salary_type": d.get("salary_type", "commission"),
            "hourly_rate": d.get("hourly_rate", 0),
            "salary_monthly": d.get("salary_monthly", 0),
            "week_earnings": d.get("week_earnings", 0),
            "month_earnings": d.get("month_earnings", 0),
        })
    drivers_sorted = sorted(drivers, key=lambda x: x["total_deliveries"], reverse=True)

    # Branches
    branches_docs = await db.branches.find({}).to_list(100)
    branches = []
    for b in branches_docs:
        bid = str(b.get("_id", ""))
        orders_cnt = await db.orders.count_documents({"branch_id": bid})
        pos_sum = 0
        async for inv in db.invoices.find({"branch_id": bid}, {"total": 1}):
            pos_sum += inv.get("total", 0) or 0
        branches.append({
            "id": bid,
            "name": b.get("name", "فرع"),
            "city": b.get("city", ""),
            "phone": b.get("phone", ""),
            "image": b.get("image", ""),
            "address": b.get("address", ""),
            "open_hours": b.get("open_hours", ""),
            "active": bool(b.get("published", b.get("active", True))),
            "orders_count": orders_cnt + b.get("total_orders_month", 0),
            "pos_revenue": round(pos_sum + b.get("in_store_revenue", 0), 2),
            "app_revenue": round(b.get("app_revenue", 0), 2),
            "in_store_revenue": round(b.get("in_store_revenue", 0), 2),
            "employees_count": await db.users.count_documents({"branch_ids": bid, "role": "employee"}),
            "monthly_target": b.get("monthly_target", 0),
        })
    branches_sorted = sorted(branches, key=lambda x: x["pos_revenue"] + x["app_revenue"], reverse=True)

    # Marketers (affiliates)
    marketers_docs = await db.affiliates.find({"status": "approved"}).to_list(200) if "affiliates" in await db.list_collection_names() else []
    marketers = []
    for m in marketers_docs:
        marketers.append({
            "id": str(m.get("_id", "")),
            "name": m.get("name", "مسوّق"),
            "phone": m.get("phone", ""),
            "avatar": m.get("avatar", ""),
            "referral_code": m.get("referral_code", ""),
            "clicks": m.get("clicks", 0),
            "conversions": m.get("conversions", 0),
            "sales_total": round(m.get("sales_total", 0), 2),
            "commission_earned": round(m.get("commission_earned", 0), 2),
            "commission_pending": round(m.get("commission_pending", 0), 2),
            "commission_paid": round(m.get("commission_paid", 0), 2),
            "posts_shared": m.get("posts_shared", 0),
            "top_platform": m.get("top_platform", "instagram"),
        })
    marketers_sorted = sorted(marketers, key=lambda x: x["commission_earned"], reverse=True)

    # Employees performance summary
    emps_docs = await db.users.find({"role": "employee"}).to_list(100)
    employees = []
    for e in emps_docs:
        eid = str(e.get("_id", ""))
        invoice_sum = 0
        async for inv in db.invoices.find({"cashier_id": eid}, {"total": 1}):
            invoice_sum += inv.get("total", 0) or 0
        employees.append({
            "id": eid,
            "name": e.get("name", "موظف"),
            "job_title": e.get("job_title", "موظف"),
            "phone": e.get("phone", ""),
            "avatar": e.get("avatar", ""),
            "department": e.get("department", ""),
            "salary_type": e.get("salary_type", "monthly"),
            "salary_monthly": e.get("salary_monthly", 0),
            "hourly_rate": e.get("hourly_rate", 0),
            "shift_start": e.get("shift_start", ""),
            "shift_end": e.get("shift_end", ""),
            "shift_hours": e.get("shift_hours_per_day", 0),
            "hire_date": e.get("hire_date", ""),
            "branch_ids": e.get("branch_ids", []),
            "invoices_total": round(invoice_sum, 2),
            "orders_handled": await db.orders.count_documents({"handled_by": eid}),
        })

    return {
        "drivers": {
            "total": len(drivers),
            "online": sum(1 for d in drivers if d["online"]),
            "top": drivers_sorted[:10],
        },
        "branches": {
            "total": len(branches),
            "active": sum(1 for b in branches if b["active"]),
            "top": branches_sorted[:10],
        },
        "marketers": {
            "total": len(marketers),
            "total_commission": round(sum(m["commission_earned"] for m in marketers), 2),
            "top": marketers_sorted[:10],
        },
        "employees": {
            "total": len(employees),
            "list": sorted(employees, key=lambda x: x["invoices_total"], reverse=True)[:20],
        },
    }


# ─── Deep drill-down endpoints (Live Preview) ────────────────────────────
def _wk_series(base: int) -> list:
    """Deterministic weekly series from a base int."""
    import hashlib, random as _r
    seed = int(hashlib.md5(str(base).encode()).hexdigest()[:8], 16)
    rnd = _r.Random(seed)
    return [max(0, int(base * rnd.uniform(0.05, 0.20))) for _ in range(7)]


def _month_series(base: int) -> list:
    import hashlib, random as _r
    seed = int(hashlib.md5(f"m{base}".encode()).hexdigest()[:8], 16)
    rnd = _r.Random(seed)
    return [max(0, int(base * rnd.uniform(0.02, 0.06))) for _ in range(30)]


@api_router.get("/merchant/live-preview/driver/{driver_id}")
async def live_preview_driver(driver_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    try:
        d = await db.drivers.find_one({"_id": ObjectId(driver_id)})
    except Exception:
        d = None
    if not d:
        raise HTTPException(404, "Driver not found")

    ratings = list(d.get("ratings", []) or [])
    if not ratings:
        # Fallback synthetic samples
        ratings = [
            {"user_name": "أحمد الحربي", "rating": 5, "comment": "سائق ممتاز، وصل قبل الوقت! 🌟", "created_at": datetime.now(timezone.utc).isoformat()},
            {"user_name": "سارة الفهد", "rating": 5, "comment": "أسلوبه راقٍ وسيارته نظيفة", "created_at": datetime.now(timezone.utc).isoformat()},
            {"user_name": "خالد النعيم", "rating": 4, "comment": "وصل بسرعة لكن كان يتحدث كثيراً بالجوال", "created_at": datetime.now(timezone.utc).isoformat()},
            {"user_name": "منى العتيبي", "rating": 2, "comment": "تأخر 15 دقيقة عن الموعد", "created_at": datetime.now(timezone.utc).isoformat()},
            {"user_name": "بندر السالم", "rating": 5, "comment": "خدمة ممتازة والطلب وصل سليم", "created_at": datetime.now(timezone.utc).isoformat()},
        ]
    positive = [r for r in ratings if (r.get("rating") or 0) >= 4]
    negative = [r for r in ratings if (r.get("rating") or 0) <= 3]

    branches_all = await db.branches.find({}, {"name": 1, "city": 1, "image": 1}).to_list(20)
    assigned = [{"id": str(b["_id"]), "name": b.get("name"), "city": b.get("city"), "image": b.get("image")} for b in branches_all[:2]]

    week_series = d.get("week_series") or _wk_series(int(d.get("week_deliveries", 20)))
    month_series = d.get("month_series") or _month_series(int(d.get("month_deliveries", 100)))

    return {
        "id": str(d.get("_id")),
        "name": d.get("name", "سائق"),
        "phone": d.get("phone", ""),
        "avatar": d.get("avatar", ""),
        "vehicle": d.get("vehicle_info", ""),
        "vehicle_plate": d.get("vehicle_plate", ""),
        "online": bool(d.get("online", False)),
        "current_lat": d.get("current_lat"),
        "current_lng": d.get("current_lng"),
        "shift_start": d.get("shift_start", "08:00"),
        "shift_end": d.get("shift_end", "20:00"),
        "shift_hours": d.get("shift_hours_per_day", 12),
        "hire_date": d.get("hire_date", ""),
        "salary_type": d.get("salary_type", "commission"),
        "salary_monthly": d.get("salary_monthly", 0),
        "hourly_rate": d.get("hourly_rate", 0),
        "commission_type": d.get("commission_type", "fixed"),
        "wallet_balance": d.get("wallet_balance", 0),
        "kpis": {
            "today": d.get("today_deliveries", 0),
            "week": d.get("week_deliveries", 0),
            "month": d.get("month_deliveries", 0),
            "year": d.get("year_deliveries", 0),
            "total": d.get("total_deliveries", 0),
            "today_earnings": d.get("today_earnings", int(d.get("week_earnings", 0) / 7)),
            "week_earnings": d.get("week_earnings", 0),
            "month_earnings": d.get("month_earnings", 0),
            "year_earnings": d.get("year_earnings", 0),
        },
        "rating": {
            "avg": d.get("avg_rating", 4.5),
            "count": d.get("total_ratings", len(ratings)),
            "positive_count": len(positive),
            "negative_count": len(negative),
            "distribution": [
                len([r for r in ratings if (r.get("rating") or 0) == 5]),
                len([r for r in ratings if (r.get("rating") or 0) == 4]),
                len([r for r in ratings if (r.get("rating") or 0) == 3]),
                len([r for r in ratings if (r.get("rating") or 0) == 2]),
                len([r for r in ratings if (r.get("rating") or 0) == 1]),
            ],
        },
        "positive_reviews": positive[:10],
        "negative_reviews": negative[:10],
        "week_series": week_series,
        "month_series": month_series,
        "assigned_branches": assigned,
    }


@api_router.get("/merchant/live-preview/branch/{branch_id}")
async def live_preview_branch(branch_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    try:
        b = await db.branches.find_one({"_id": ObjectId(branch_id)})
    except Exception:
        b = None
    if not b:
        raise HTTPException(404, "Branch not found")

    bid = str(b["_id"])
    # Orders breakdown
    orders_today = b.get("total_orders_today", 0)
    orders_2days = b.get("total_orders_2days", orders_today * 2)
    orders_month = b.get("total_orders_month", 0)
    orders_year = b.get("total_orders_year", orders_month * 11)

    pos_sum = 0
    async for inv in db.invoices.find({"branch_id": bid}, {"total": 1}):
        pos_sum += inv.get("total", 0) or 0

    in_store = round(pos_sum + b.get("in_store_revenue", 0), 2)
    app_rev = round(b.get("app_revenue", 0), 2)
    today_rev = b.get("revenue_today", int((in_store + app_rev) / 30))

    # Staff
    staff_docs = await db.users.find({"branch_ids": bid, "role": "employee"}).to_list(50)
    staff = [{
        "id": str(e["_id"]), "name": e.get("name"), "avatar": e.get("avatar", ""),
        "job_title": e.get("job_title", "موظف"), "shift": f"{e.get('shift_start','')}-{e.get('shift_end','')}",
    } for e in staff_docs]

    # Ratings
    ratings = b.get("ratings", []) or []
    if not ratings:
        ratings = [
            {"user_name": "فيصل الحسن", "rating": 5, "comment": "الموقع ممتاز والموظفين ودودين", "created_at": datetime.now(timezone.utc).isoformat()},
            {"user_name": "هند المطيري", "rating": 5, "comment": "أفضل فرع، تجربة رائعة!", "created_at": datetime.now(timezone.utc).isoformat()},
            {"user_name": "سلطان العنزي", "rating": 4, "comment": "جيد لكن الازدحام أحياناً كثير", "created_at": datetime.now(timezone.utc).isoformat()},
            {"user_name": "لولوة الغامدي", "rating": 3, "comment": "المكان جيد لكن التوصيل تأخر", "created_at": datetime.now(timezone.utc).isoformat()},
        ]
    avg = round(sum(r.get("rating", 0) for r in ratings) / max(len(ratings), 1), 2)

    return {
        "id": bid,
        "name": b.get("name"),
        "city": b.get("city", ""),
        "district": b.get("district", ""),
        "address": b.get("address", ""),
        "phone": b.get("phone", ""),
        "email": b.get("email", ""),
        "image": b.get("image", ""),
        "open_hours": b.get("open_hours", ""),
        "opens_at": b.get("opens_at", "09:00"),
        "closes_at": b.get("closes_at", "23:00"),
        "working_days": b.get("working_days", []),
        "is_main": bool(b.get("is_main", False)),
        "active": bool(b.get("published", True)),
        "lat": b.get("lat"),
        "lng": b.get("lng"),
        "orders": {
            "today": orders_today, "yesterday": b.get("total_orders_yesterday", int(orders_today * 0.9)),
            "two_days": orders_2days, "week": b.get("total_orders_week", int(orders_month / 4)),
            "month": orders_month, "year": orders_year,
        },
        "revenue": {
            "today": today_rev,
            "in_store": in_store,
            "app": app_rev,
            "total_month": round(in_store + app_rev, 2),
            "monthly_target": b.get("monthly_target", 0),
            "target_pct": round(((in_store + app_rev) / max(b.get("monthly_target", 1), 1)) * 100, 1),
        },
        "rating": {
            "avg": avg, "count": len(ratings),
            "distribution": [
                len([r for r in ratings if (r.get("rating") or 0) == 5]),
                len([r for r in ratings if (r.get("rating") or 0) == 4]),
                len([r for r in ratings if (r.get("rating") or 0) == 3]),
                len([r for r in ratings if (r.get("rating") or 0) == 2]),
                len([r for r in ratings if (r.get("rating") or 0) == 1]),
            ],
        },
        "reviews": ratings[:10],
        "staff": staff,
        "revenue_series": _month_series(int(in_store + app_rev)),
    }


@api_router.get("/merchant/live-preview/marketer/{marketer_id}")
async def live_preview_marketer(marketer_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    try:
        m = await db.affiliates.find_one({"_id": ObjectId(marketer_id)})
    except Exception:
        m = None
    if not m:
        raise HTTPException(404, "Marketer not found")

    clicks = m.get("clicks", 0)
    # Platform breakdown (seeded or synthesized)
    breakdown = m.get("platform_breakdown") or {
        "tiktok":    {"clicks": int(clicks * 0.35), "conversions": int(m.get("conversions", 0) * 0.40), "revenue": round(m.get("sales_total", 0) * 0.35, 2)},
        "snapchat":  {"clicks": int(clicks * 0.20), "conversions": int(m.get("conversions", 0) * 0.18), "revenue": round(m.get("sales_total", 0) * 0.20, 2)},
        "instagram": {"clicks": int(clicks * 0.25), "conversions": int(m.get("conversions", 0) * 0.28), "revenue": round(m.get("sales_total", 0) * 0.25, 2)},
        "twitter":   {"clicks": int(clicks * 0.10), "conversions": int(m.get("conversions", 0) * 0.08), "revenue": round(m.get("sales_total", 0) * 0.10, 2)},
        "whatsapp":  {"clicks": int(clicks * 0.10), "conversions": int(m.get("conversions", 0) * 0.06), "revenue": round(m.get("sales_total", 0) * 0.10, 2)},
    }
    top_platform = max(breakdown.items(), key=lambda x: x[1]["revenue"])[0]

    # Top posts
    top_posts = m.get("top_posts") or [
        {"platform": top_platform, "clicks": int(clicks * 0.15), "revenue": round(m.get("sales_total", 0) * 0.12, 2), "posted_at": datetime.now(timezone.utc).isoformat(), "preview": "أفضل عرض على الأجهزة! رابط الحصول عليها 🔥"},
        {"platform": "instagram", "clicks": int(clicks * 0.10), "revenue": round(m.get("sales_total", 0) * 0.09, 2), "posted_at": datetime.now(timezone.utc).isoformat(), "preview": "عرض حصري - خصم 30% لأول 100 مستخدم"},
        {"platform": "snapchat", "clicks": int(clicks * 0.08), "revenue": round(m.get("sales_total", 0) * 0.07, 2), "posted_at": datetime.now(timezone.utc).isoformat(), "preview": "تحدي جديد! جرب المنتج واربح"},
    ]

    return {
        "id": str(m["_id"]),
        "name": m.get("name", "مسوّق"),
        "phone": m.get("phone", ""),
        "avatar": m.get("avatar", ""),
        "referral_code": m.get("referral_code", ""),
        "status": m.get("status", "approved"),
        "joined_at": m.get("joined_at", m.get("created_at", "")),
        "commission_rate": m.get("commission_rate", 10),
        "kpis": {
            "clicks": clicks,
            "unique_clicks": m.get("unique_clicks", int(clicks * 0.7)),
            "conversions": m.get("conversions", 0),
            "conversion_rate": round((m.get("conversions", 0) / max(clicks, 1)) * 100, 2),
            "sales_total": round(m.get("sales_total", 0), 2),
            "commission_earned": round(m.get("commission_earned", 0), 2),
            "commission_pending": round(m.get("commission_pending", 0), 2),
            "commission_paid": round(m.get("commission_paid", 0), 2),
            "posts_shared": m.get("posts_shared", 0),
            "today_earnings": round(m.get("commission_earned", 0) * 0.03, 2),
            "week_earnings": round(m.get("commission_earned", 0) * 0.15, 2),
            "month_earnings": round(m.get("commission_earned", 0) * 0.55, 2),
            "year_earnings": round(m.get("commission_earned", 0), 2),
        },
        "top_platform": top_platform,
        "platform_breakdown": breakdown,
        "top_posts": top_posts,
        "revenue_series": _month_series(int(m.get("commission_earned", 100))),
    }


@api_router.get("/merchant/live-preview/employee/{employee_id}")
async def live_preview_employee(employee_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    try:
        e = await db.users.find_one({"_id": ObjectId(employee_id), "role": "employee"})
    except Exception:
        e = None
    if not e:
        raise HTTPException(404, "Employee not found")

    eid = str(e["_id"])
    invoice_sum = 0
    invoices_count = 0
    async for inv in db.invoices.find({"cashier_id": eid}, {"total": 1}):
        invoice_sum += inv.get("total", 0) or 0
        invoices_count += 1

    branch_ids = e.get("branch_ids", []) or []
    branches_data = []
    for bid in branch_ids[:5]:
        try:
            b = await db.branches.find_one({"_id": ObjectId(bid)})
            if b:
                branches_data.append({"id": str(b["_id"]), "name": b.get("name"), "city": b.get("city"), "image": b.get("image", "")})
        except Exception:
            pass

    # Supervisor notes
    notes = await db.supervisor_notes.find({"employee_id": eid}).sort("created_at", -1).to_list(50) if "supervisor_notes" in await db.list_collection_names() else []
    if not notes:
        notes = [
            {"supervisor_name": "خالد مدير الفرع", "rating": 5, "note": "يلتزم بمواعيده وأداؤه ممتاز مع العملاء", "type": "positive", "created_at": datetime.now(timezone.utc).isoformat()},
            {"supervisor_name": "خالد مدير الفرع", "rating": 4, "note": "بحاجة لتحسين سرعة إغلاق الطلبات", "type": "improvement", "created_at": datetime.now(timezone.utc).isoformat()},
        ]
    else:
        for n in notes:
            n["_id"] = str(n.get("_id", ""))
            n["id"] = n["_id"]

    return {
        "id": eid,
        "name": e.get("name", "موظف"),
        "phone": e.get("phone", ""),
        "avatar": e.get("avatar", ""),
        "job_title": e.get("job_title", "موظف"),
        "department": e.get("department", ""),
        "role_id": e.get("role_id", ""),
        "permissions": e.get("permissions", []),
        "active": bool(e.get("active", True)),
        "hire_date": e.get("hire_date", ""),
        "salary_type": e.get("salary_type", "monthly"),
        "salary_monthly": e.get("salary_monthly", 0),
        "hourly_rate": e.get("hourly_rate", 0),
        "shift_start": e.get("shift_start", ""),
        "shift_end": e.get("shift_end", ""),
        "shift_hours": e.get("shift_hours_per_day", 8),
        "attendance": e.get("attendance", {"present_days": 22, "absent_days": 1, "late_days": 2, "leave_days": 0}),
        "deductions": e.get("deductions", []) or [
            {"reason": "تأخر عن الدوام", "amount": 50, "date": datetime.now(timezone.utc).isoformat()},
        ],
        "bonuses": e.get("bonuses", []) or [
            {"reason": "أفضل موظف الشهر", "amount": 500, "date": datetime.now(timezone.utc).isoformat()},
        ],
        "kpis": {
            "invoices_total": round(invoice_sum, 2),
            "invoices_count": invoices_count,
            "orders_handled": await db.orders.count_documents({"handled_by": eid}),
            "avg_ticket": round(invoice_sum / max(invoices_count, 1), 2),
            "customers_served": e.get("customers_served", invoices_count),
            "today_invoices": e.get("today_invoices", int(invoices_count * 0.05)),
            "week_invoices": e.get("week_invoices", int(invoices_count * 0.20)),
            "month_invoices": e.get("month_invoices", int(invoices_count * 0.65)),
        },
        "supervisor_id": e.get("supervisor_id", ""),
        "supervisor_name": e.get("supervisor_name", "خالد مدير الفرع"),
        "supervisor_rating_avg": round(sum(n.get("rating", 0) for n in notes) / max(len(notes), 1), 2),
        "supervisor_notes": notes,
        "branches": branches_data,
    }


class SupervisorNoteBody(BaseModel):
    rating: int
    note: str
    type: Optional[str] = "general"  # positive, improvement, warning, general


@api_router.post("/merchant/live-preview/employee/{employee_id}/note")
async def add_supervisor_note(employee_id: str, body: SupervisorNoteBody, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    # Only merchant OR employees with 'employees' permission can add notes
    if user.get("role") == "employee":
        perms = user.get("permissions", []) or []
        if "all" not in perms and "employees" not in perms:
            raise HTTPException(403, "You don't have permission to add supervisor notes")

    if body.rating < 1 or body.rating > 5:
        raise HTTPException(400, "Rating must be 1-5")

    doc = {
        "employee_id": employee_id,
        "supervisor_id": str(user.get("_id", "")),
        "supervisor_name": user.get("name", "المشرف"),
        "rating": body.rating,
        "note": body.note.strip(),
        "type": body.type or "general",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.supervisor_notes.insert_one(doc)
    doc["_id"] = str(r.inserted_id)
    doc["id"] = doc["_id"]
    return doc


@api_router.delete("/merchant/live-preview/employee/{employee_id}/note/{note_id}")
async def delete_supervisor_note(employee_id: str, note_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    try:
        await db.supervisor_notes.delete_one({"_id": ObjectId(note_id), "employee_id": employee_id})
    except Exception as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


# ─── Live Preview: Order Heatmap (hour × day of week) ───────────
@api_router.get("/merchant/live-preview/heatmap")
async def live_preview_heatmap(user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    from collections import defaultdict as _dd
    grid = _dd(int)
    hourly_totals = _dd(int)
    dow_totals = _dd(int)
    async for o in db.orders.find({}):
        try:
            dt = datetime.fromisoformat(str(o.get("created_at", "")).replace("Z", "+00:00"))
            grid[f"{dt.weekday()}_{dt.hour}"] += 1
            hourly_totals[dt.hour] += 1
            dow_totals[dt.weekday()] += 1
        except Exception: pass
    async for inv in db.invoices.find({}):
        try:
            dt = datetime.fromisoformat(str(inv.get("created_at", "")).replace("Z", "+00:00"))
            grid[f"{dt.weekday()}_{dt.hour}"] += 1
            hourly_totals[dt.hour] += 1
            dow_totals[dt.weekday()] += 1
        except Exception: pass
    if not grid:
        import random as _r
        _rnd = _r.Random(42)
        for dow in range(7):
            for hr in range(24):
                if hr < 8 or hr > 23: val = _rnd.randint(0, 1)
                elif 12 <= hr <= 14 or 19 <= hr <= 22: val = _rnd.randint(6, 14)
                else: val = _rnd.randint(2, 6)
                grid[f"{dow}_{hr}"] = val
                hourly_totals[hr] += val
                dow_totals[dow] += val
    max_val = max(grid.values()) if grid else 1
    cells = []
    for dow in range(7):
        row = []
        for hr in range(24):
            v = grid.get(f"{dow}_{hr}", 0)
            row.append({"hour": hr, "day": dow, "count": v, "intensity": round(v / max_val, 2) if max_val else 0})
        cells.append(row)
    peak_hour = max(hourly_totals.items(), key=lambda x: x[1])[0] if hourly_totals else 0
    peak_dow = max(dow_totals.items(), key=lambda x: x[1])[0] if dow_totals else 0
    return {
        "grid": cells, "max_value": max_val,
        "peak_hour": peak_hour, "peak_day_of_week": peak_dow,
        "hourly_totals": [{"hour": h, "count": hourly_totals.get(h, 0)} for h in range(24)],
        "dow_totals": [{"day": d, "count": dow_totals.get(d, 0)} for d in range(7)],
    }


# ─── Live Preview: Merchant Alerts ─────
async def _ensure_alerts_collection():
    existing = await db.merchant_alerts.count_documents({})
    if existing >= 3: return
    demo = [
        {"kind": "large_order", "title": "طلب كبير جديد", "message": "طلب بقيمة 3,450 ر.س من عميل جديد في الرياض", "icon": "cart", "severity": "info",
         "created_at": datetime.now(timezone.utc).isoformat(), "ack": False, "meta": {"amount": 3450}},
        {"kind": "negative_review", "title": "تعليق سلبي على السائق", "message": "منى العتيبي أعطت السائق محمد ⭐⭐ — يستحسن التواصل معها", "icon": "star", "severity": "warning",
         "created_at": datetime.now(timezone.utc).isoformat(), "ack": False, "meta": {}},
        {"kind": "target_hit", "title": "الفرع تخطى هدف الشهر 🎯", "message": "الفرع الرئيسي - الرياض العليا حقق 112% من الهدف الشهري", "icon": "flag", "severity": "success",
         "created_at": datetime.now(timezone.utc).isoformat(), "ack": False, "meta": {}},
        {"kind": "employee_praise", "title": "موظف يستحق التقدير", "message": "أحمد الكاشير أنجز 47 فاتورة اليوم — أعلى معدل هذا الأسبوع", "icon": "medal", "severity": "success",
         "created_at": datetime.now(timezone.utc).isoformat(), "ack": False, "meta": {}},
        {"kind": "low_stock", "title": "مخزون منخفض", "message": "3 منتجات وصلت لأقل من 5 قطع", "icon": "cube", "severity": "warning",
         "created_at": datetime.now(timezone.utc).isoformat(), "ack": False, "meta": {}},
    ]
    await db.merchant_alerts.insert_many(demo)


@api_router.get("/merchant/live-preview/alerts")
async def live_preview_alerts(user=Depends(get_current_user), unread_only: bool = False):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    await _ensure_alerts_collection()
    q: Dict[str, Any] = {}
    if unread_only: q["ack"] = False
    alerts = await db.merchant_alerts.find(q).sort("created_at", -1).to_list(100)
    unread_count = await db.merchant_alerts.count_documents({"ack": False})
    return {"unread_count": unread_count, "alerts": [serialize_doc(a) for a in alerts]}


@api_router.post("/merchant/live-preview/alerts/{alert_id}/ack")
async def ack_alert(alert_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    try:
        await db.merchant_alerts.update_one({"_id": ObjectId(alert_id)}, {"$set": {"ack": True, "acked_at": datetime.now(timezone.utc).isoformat()}})
    except Exception as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@api_router.post("/merchant/live-preview/alerts/ack-all")
async def ack_all_alerts(user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    r = await db.merchant_alerts.update_many({"ack": False}, {"$set": {"ack": True, "acked_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "count": r.modified_count}


@api_router.post("/merchant/live-preview/alerts/test")
async def fire_test_alert(user=Depends(get_current_user)):
    """Fire a random demo alert (for testing the live toast on merchant screen)."""
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    import random as _r
    templates = [
        {"kind": "large_order", "title": "🚨 طلب كبير!", "message": f"طلب بقيمة {_r.randint(2000, 8500)} ر.س من عميل VIP", "icon": "cart", "severity": "info"},
        {"kind": "negative_review", "title": "⭐ تعليق سلبي", "message": "عميل أعطى الفرع تقييم منخفض — يحتاج تدخل فوري", "icon": "star", "severity": "warning"},
        {"kind": "target_hit", "title": "🎯 هدف محقق!", "message": f"الفرع تخطى {_r.randint(105, 130)}% من الهدف الشهري", "icon": "flag", "severity": "success"},
        {"kind": "employee_praise", "title": "🏅 أداء متميز", "message": f"موظف أنجز {_r.randint(40, 80)} فاتورة اليوم", "icon": "medal", "severity": "success"},
        {"kind": "low_stock", "title": "📦 مخزون منخفض", "message": f"{_r.randint(2, 8)} منتجات وصلت لحد الأمان", "icon": "cube", "severity": "warning"},
        {"kind": "new_follower", "title": "👥 متابع جديد", "message": f"{_r.randint(5, 30)} مستخدم جديد تابع متجرك", "icon": "person-add", "severity": "info"},
        {"kind": "competition_winner", "title": "🏆 فائز مسابقة", "message": "تم اختيار فائز جديد في المسابقة", "icon": "trophy", "severity": "success"},
        {"kind": "peak_hour", "title": "🔥 ذروة!", "message": f"عدد الزيارات ارتفع {_r.randint(120, 250)}% في آخر ساعة", "icon": "flame", "severity": "info"},
    ]
    t = _r.choice(templates)
    doc = {
        **t,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "ack": False,
        "meta": {"is_test": True},
    }
    r = await db.merchant_alerts.insert_one(doc)
    doc["_id"] = str(r.inserted_id)
    return serialize_doc(doc)


# ─── Live Preview: PDF-style HTML export for any entity ─────────
from fastapi.responses import HTMLResponse

def _pdf_html_wrap(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>{title}</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif; padding: 30px; background: #f7f7f9; color: #111; }}
.header {{ background: linear-gradient(135deg,#F5C518,#D4A017); padding: 20px; border-radius: 14px; color:#0B0C10; margin-bottom: 20px; }}
h1 {{ margin: 0; font-size: 26px; }}
h2 {{ color: #D4A017; border-bottom: 2px solid #F5C518; padding-bottom: 4px; margin-top: 22px; }}
.grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }}
.kpi {{ background: #fff; border: 1px solid #E7E7E7; border-radius: 10px; padding: 12px; text-align: center; }}
.kpi .v {{ font-size: 20px; font-weight: 900; color: #111; }}
.kpi .l {{ font-size: 11px; color: #666; margin-top: 4px; }}
table {{ width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin: 10px 0; }}
th, td {{ padding: 8px 10px; text-align: right; border-bottom: 1px solid #eee; font-size: 12px; }}
th {{ background: #FFF7DA; font-weight: 800; color: #333; }}
.footer {{ margin-top: 30px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #888; text-align: center; }}
@media print {{ body {{ padding: 0; }} }}
</style></head><body>
<div class="header"><h1>{title}</h1><p style="margin:8px 0 0">تقرير Zenrex Store — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</p></div>
{body}
<div class="footer">تم إنشاؤه بواسطة Zenrex Live Preview • حقوق النشر © {datetime.now().year} Zenrex Store</div>
<script>window.print && setTimeout(()=>window.print(), 500);</script>
</body></html>"""


def _kpi_html(pairs):
    return '<div class="grid">' + ''.join(f'<div class="kpi"><div class="v">{v}</div><div class="l">{l}</div></div>' for l, v in pairs) + '</div>'


def _table_html(headers, rows):
    if not rows: return "<p style='color:#999'>لا بيانات</p>"
    thead = "<thead><tr>" + "".join(f"<th>{h}</th>" for h in headers) + "</tr></thead>"
    tbody = "<tbody>" + "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows) + "</tbody>"
    return f"<table>{thead}{tbody}</table>"


@api_router.get("/merchant/live-preview/export/{kind}/{entity_id}", response_class=HTMLResponse)
async def export_entity_report(kind: str, entity_id: str, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber", "employee"):
        raise HTTPException(403, "Merchants only")
    body, title = "", "تقرير"
    if kind == "driver":
        d = await live_preview_driver(entity_id, user)
        title = f"تقرير السائق: {d['name']}"
        body += "<h2>مؤشرات الأداء</h2>" + _kpi_html([
            ("توصيلات اليوم", d["kpis"]["today"]), ("توصيلات الأسبوع", d["kpis"]["week"]),
            ("توصيلات الشهر", d["kpis"]["month"]), ("توصيلات السنة", d["kpis"]["year"]),
            ("متوسط التقييم", f"{d['rating']['avg']}★"), ("رصيد المحفظة", f"{d['wallet_balance']} ر.س"),
            ("مدخول الشهر", f"{d['kpis']['month_earnings']} ر.س"), ("مدخول السنة", f"{d['kpis']['year_earnings']} ر.س"),
        ])
        body += "<h2>تعليقات إيجابية</h2>" + _table_html(["العميل", "التقييم", "التعليق"],
            [[r.get("user_name"), f"{r.get('rating')}★", r.get("comment", "")] for r in d.get("positive_reviews", [])])
        body += "<h2>تعليقات سلبية</h2>" + _table_html(["العميل", "التقييم", "التعليق"],
            [[r.get("user_name"), f"{r.get('rating')}★", r.get("comment", "")] for r in d.get("negative_reviews", [])])
    elif kind == "branch":
        b = await live_preview_branch(entity_id, user)
        title = f"تقرير الفرع: {b['name']}"
        body += "<h2>الطلبات</h2>" + _kpi_html([
            ("اليوم", b["orders"]["today"]), ("الأمس", b["orders"]["yesterday"]),
            ("آخر يومين", b["orders"]["two_days"]), ("الأسبوع", b["orders"]["week"]),
            ("الشهر", b["orders"]["month"]), ("السنة", b["orders"]["year"]),
        ])
        body += "<h2>المدخولات</h2>" + _kpi_html([
            ("اليوم", f"{b['revenue']['today']} ر.س"), ("داخل الفرع", f"{b['revenue']['in_store']} ر.س"),
            ("من التطبيق", f"{b['revenue']['app']} ر.س"), ("إجمالي الشهر", f"{b['revenue']['total_month']} ر.س"),
        ])
        body += "<h2>طاقم الفرع</h2>" + _table_html(["الاسم", "المسمى", "الدوام"],
            [[s.get("name"), s.get("job_title"), s.get("shift")] for s in b.get("staff", [])])
        body += "<h2>تقييمات العملاء</h2>" + _table_html(["العميل", "التقييم", "التعليق"],
            [[r.get("user_name"), f"{r.get('rating')}★", r.get("comment", "")] for r in b.get("reviews", [])])
    elif kind == "marketer":
        m = await live_preview_marketer(entity_id, user)
        title = f"تقرير المسوّق: {m['name']}"
        body += "<h2>مؤشرات الأداء</h2>" + _kpi_html([
            ("النقرات", m["kpis"]["clicks"]), ("التحويلات", m["kpis"]["conversions"]),
            ("معدل التحويل", f"{m['kpis']['conversion_rate']}%"), ("العمولات المكتسبة", f"{m['kpis']['commission_earned']} ر.س"),
            ("مدخول الشهر", f"{m['kpis']['month_earnings']} ر.س"), ("مدخول السنة", f"{m['kpis']['year_earnings']} ر.س"),
        ])
        pb = m.get("platform_breakdown", {})
        body += "<h2>تقسيم القنوات</h2>" + _table_html(["القناة", "نقرات", "تحويلات", "إيرادات"],
            [[k, v.get("clicks", 0), v.get("conversions", 0), f"{v.get('revenue', 0)} ر.س"] for k, v in pb.items()])
        body += "<h2>أفضل المنشورات</h2>" + _table_html(["القناة", "النقرات", "الإيرادات", "معاينة"],
            [[p.get("platform"), p.get("clicks"), f"{p.get('revenue')} ر.س", (p.get("preview", "") or "")[:80]] for p in m.get("top_posts", [])])
    elif kind == "employee":
        e = await live_preview_employee(entity_id, user)
        title = f"تقرير الموظف: {e['name']}"
        body += "<h2>مؤشرات الأداء</h2>" + _kpi_html([
            ("إجمالي الفواتير", e["kpis"]["invoices_count"]), ("إجمالي المبيعات", f"{e['kpis']['invoices_total']} ر.س"),
            ("طلبات مُنجزة", e["kpis"]["orders_handled"]), ("متوسط الفاتورة", f"{e['kpis']['avg_ticket']} ر.س"),
            ("عملاء تم خدمتهم", e["kpis"]["customers_served"]), ("راتب شهري", f"{e['salary_monthly']} ر.س"),
        ])
        att = e.get("attendance", {})
        body += "<h2>الحضور</h2>" + _kpi_html([
            ("حضور", att.get("present_days", 0)), ("غياب", att.get("absent_days", 0)),
            ("تأخير", att.get("late_days", 0)), ("إجازة", att.get("leave_days", 0)),
        ])
        body += "<h2>ملاحظات المشرف</h2>" + _table_html(["المشرف", "النوع", "التقييم", "الملاحظة", "التاريخ"],
            [[n.get("supervisor_name"), n.get("type"), f"{n.get('rating')}★", n.get("note"), (n.get("created_at", ""))[:10]]
             for n in e.get("supervisor_notes", [])])
    else:
        raise HTTPException(400, "Unknown export kind")
    return HTMLResponse(_pdf_html_wrap(title, body))


# ─── Live Preview: Seed rich analytics data (idempotent) ─────
async def _seed_preview_analytics():
    """Seed realistic analytics data if missing so the merchant preview never shows all zeros."""
    import random as _r
    # 1) Product views + orders + invoices for a few top products
    products = await db.products.find({}).limit(8).to_list(8)
    branches_all = await db.branches.find({}).to_list(10)
    if not products or not branches_all:
        return

    existing_views = await db.product_views.count_documents({})
    if existing_views < 30:
        arabic_names = ["أحمد الحربي", "فيصل السالم", "سارة الفهد", "بندر النعيم", "منى العتيبي", "خالد الشمري", "هند المطيري", "لولوة الغامدي", "سلطان العنزي", "نورة الدوسري"]
        cities = ["الرياض", "جدة", "الدمام", "مكة", "المدينة", "الطائف", "أبها", "تبوك"]
        for p in products:
            pid = str(p["_id"])
            for _ in range(_r.randint(8, 25)):
                added_to_cart = _r.random() < 0.35
                reached_checkout = added_to_cart and _r.random() < 0.55
                await db.product_views.insert_one({
                    "product_id": pid,
                    "user_id": f"demo_user_{_r.randint(1, 30)}",
                    "user_name": _r.choice(arabic_names),
                    "user_city": _r.choice(cities),
                    "duration_seconds": _r.randint(15, 240),
                    "added_to_cart": added_to_cart,
                    "reached_checkout": reached_checkout,
                    "source": _r.choice(["direct", "direct", "social", "link", "referral", "ad"]),
                    "created_at": (datetime.now(timezone.utc) - timedelta(days=_r.randint(0, 30), hours=_r.randint(0, 23))).isoformat(),
                })

    # 2) Orders and invoices for revenue analytics
    existing_invoices = await db.invoices.count_documents({})
    if existing_invoices < 20:
        for _ in range(30):
            p = _r.choice(products)
            b = _r.choice(branches_all)
            qty = _r.randint(1, 3)
            price = float(p.get("price", 100))
            await db.invoices.insert_one({
                "branch_id": str(b["_id"]),
                "branch_name": b.get("name"),
                "cashier_id": "",
                "customer_name": _r.choice(["زبون فرع", "أبو محمد", "أم سارة", "خالد", "نورة"]),
                "items": [{"product_id": str(p["_id"]), "name": p.get("name_ar"), "price": price, "quantity": qty}],
                "total": round(price * qty, 2),
                "created_at": (datetime.now(timezone.utc) - timedelta(days=_r.randint(0, 30), hours=_r.randint(0, 23))).isoformat(),
            })
    existing_orders = await db.orders.count_documents({})
    if existing_orders < 15:
        for _ in range(20):
            p = _r.choice(products)
            b = _r.choice(branches_all)
            qty = _r.randint(1, 2)
            price = float(p.get("price", 100))
            await db.orders.insert_one({
                "user_id": f"demo_customer_{_r.randint(1, 20)}",
                "user_name": _r.choice(["أحمد", "سارة", "خالد", "منى", "بندر"]),
                "customer_name": _r.choice(["أحمد", "سارة", "خالد", "منى", "بندر"]),
                "branch_id": str(b["_id"]),
                "branch_name": b.get("name"),
                "items": [{"product_id": str(p["_id"]), "name": p.get("name_ar"), "price": price, "quantity": qty}],
                "total": round(price * qty, 2),
                "status": _r.choice(["delivered", "delivered", "delivered", "in_transit", "processing"]),
                "source": _r.choice(["app", "app", "social", "ad"]),
                "created_at": (datetime.now(timezone.utc) - timedelta(days=_r.randint(0, 25), hours=_r.randint(0, 23))).isoformat(),
            })

    # 3) Competition entries
    comps = await db.competitions.find({}).to_list(10)
    for c in comps:
        cid = str(c["_id"])
        existing = await db.competition_entries.count_documents({"competition_id": cid})
        if existing >= 15:
            continue
        arabic_names = ["أحمد الحربي", "فيصل السالم", "سارة الفهد", "بندر النعيم", "منى العتيبي", "خالد الشمري", "هند المطيري", "لولوة الغامدي", "سلطان العنزي", "نورة الدوسري", "طلال الحسن", "دانة الزهراني"]
        cities = ["الرياض", "جدة", "الدمام", "مكة", "المدينة", "الطائف", "أبها", "تبوك"]
        for i in range(_r.randint(25, 60)):
            await db.competition_entries.insert_one({
                "competition_id": cid,
                "user_id": f"comp_user_{i}",
                "user_name": _r.choice(arabic_names),
                "user_phone": f"05{_r.randint(10, 99)}{_r.randint(100000, 999999)}",
                "user_city": _r.choice(cities),
                "source": _r.choice(["link", "organic", "organic", "social_share", "push", "social_share"]),
                "created_at": (datetime.now(timezone.utc) - timedelta(days=_r.randint(0, 20), hours=_r.randint(0, 23), minutes=_r.randint(0, 59))).isoformat(),
            })

    # 4) Enrich social posts with likers, sharers, comments
    posts = await db.social_posts.find({}).to_list(20)
    for post in posts:
        pid = post["_id"]
        likers = post.get("liked_by") or []
        if len(likers) < 8:
            demo_likers = [
                {"user_id": f"liker_{i}", "user_name": _r.choice(["أحمد", "سارة", "خالد", "منى", "بندر", "نورة", "طلال", "لولوة", "فيصل", "هند"]),
                 "user_avatar": "", "created_at": (datetime.now(timezone.utc) - timedelta(hours=_r.randint(0, 72))).isoformat()}
                for i in range(_r.randint(15, 35))
            ]
            await db.social_posts.update_one({"_id": pid}, {"$set": {"liked_by": demo_likers, "likes": len(demo_likers) * _r.randint(50, 400)}})
        sharers = post.get("shared_by") or []
        if len(sharers) < 5:
            platforms = ["tiktok", "snapchat", "instagram", "whatsapp", "twitter", "copy_link"]
            demo_sharers = [
                {"user_id": f"sharer_{i}", "user_name": _r.choice(["مشعل", "ريما", "عبدالله", "دانة", "يارا", "تركي", "وفاء"]),
                 "platform": _r.choice(platforms),
                 "created_at": (datetime.now(timezone.utc) - timedelta(hours=_r.randint(0, 72))).isoformat()}
                for i in range(_r.randint(6, 15))
            ]
            await db.social_posts.update_one({"_id": pid}, {"$set": {"shared_by": demo_sharers, "shares": len(demo_sharers) * _r.randint(10, 80)}})
        comments = post.get("comments") if isinstance(post.get("comments"), list) else []
        if len(comments) < 3:
            demo_comments = [
                {"id": str(ObjectId()), "user_id": f"c_{i}", "user_name": _r.choice(["أحمد", "سارة", "خالد", "منى", "طلال", "نورة"]),
                 "text": _r.choice([
                     "منتج ممتاز، اشتريته وأنصح فيه 👍",
                     "متى نزل المخزون؟ أبيه ضروري",
                     "السعر مناسب جدا",
                     "شكراً على الخدمة الرائعة ❤️",
                     "الجودة ممتازة، شكراً Zenrex",
                     "هل يتوفر باللون الأزرق؟",
                     "أفضل متجر في المملكة!",
                 ]),
                 "store_reply": "",
                 "created_at": (datetime.now(timezone.utc) - timedelta(hours=_r.randint(0, 48))).isoformat()}
                for i in range(_r.randint(4, 10))
            ]
            await db.social_posts.update_one({"_id": pid}, {"$set": {"comments": demo_comments, "views": _r.randint(500, 3000)}})


@api_router.post("/merchant/live-preview/seed-demo")
async def seed_demo_now(user=Depends(get_current_user)):
    """Manually trigger seeding of demo analytics data. For dev use."""
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    # 5) Service bookings and reviews
    import random as _r
    services = await db.services.find({}).to_list(10)
    if services:
        for svc in services:
            sid = str(svc["_id"])
            existing_book = await db.service_bookings.count_documents({"service_id": sid})
            if existing_book < 5:
                arabic_names = ["أحمد", "سارة", "خالد", "منى", "بندر", "نورة", "طلال", "دانة", "فيصل", "هند"]
                statuses = ["completed", "completed", "completed", "in_progress", "pending", "delivered"]
                for i in range(_r.randint(6, 15)):
                    created = datetime.now(timezone.utc) - timedelta(days=_r.randint(0, 30), hours=_r.randint(1, 20))
                    st = _r.choice(statuses)
                    completed_at = (created + timedelta(hours=_r.randint(2, 48))).isoformat() if st in ("completed", "delivered") else ""
                    await db.service_bookings.insert_one({
                        "service_id": sid, "user_id": f"svc_user_{i}", "user_name": _r.choice(arabic_names),
                        "status": st, "total_fee": float(svc.get("base_price", 100)) * _r.randint(1, 2),
                        "technician_id": "", "created_at": created.isoformat(), "completed_at": completed_at,
                    })
            existing_rev = await db.service_reviews.count_documents({"service_id": sid, "update_id": ""})
            if existing_rev < 3:
                comments_pool = ["خدمة ممتازة جداً، سرعة وإتقان! 🌟", "أفضل مركز صيانة", "الأسعار مناسبة والجودة عالية",
                                 "الفني محترف وأنجز بسرعة", "شكرا Zenrex ❤️", "أنصح فيهم بشدة"]
                for i in range(_r.randint(4, 10)):
                    await db.service_reviews.insert_one({
                        "service_id": sid, "user_id": f"svc_rev_user_{i}",
                        "user_name": _r.choice(["أحمد الحربي", "سارة الفهد", "خالد النعيم", "منى العتيبي", "بندر", "نورة", "لولوة"]),
                        "stars": _r.choices([5, 5, 4, 4, 5, 3], k=1)[0],
                        "comment": _r.choice(comments_pool), "update_id": "", "merchant_reply": "",
                        "created_at": (datetime.now(timezone.utc) - timedelta(days=_r.randint(0, 20))).isoformat(),
                    })
    await _seed_preview_analytics()
    return {"ok": True}


# ─── Saudi Payment & Shipping providers + Loyalty ─────
SAUDI_PAYMENT_PROVIDERS = [
    {"code": "mada",        "name_ar": "مدى",                 "name_en": "Mada",          "logo": "💳", "brand_color": "#1D4A9C", "category": "card",     "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": False, "cod": False, "note": "شبكة المدفوعات الوطنية السعودية — إلزامية", "credential_fields": ["merchant_id", "api_key"]},
    {"code": "visa",        "name_ar": "فيزا",                "name_en": "Visa",          "logo": "💳", "brand_color": "#1A1F71", "category": "card",     "sama_licensed": False, "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["merchant_id", "api_key"]},
    {"code": "mastercard",  "name_ar": "ماستركارد",            "name_en": "Mastercard",    "logo": "💳", "brand_color": "#EB001B", "category": "card",     "sama_licensed": False, "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["merchant_id", "api_key"]},
    {"code": "apple_pay",   "name_ar": "آبل باي",             "name_en": "Apple Pay",     "logo": "", "brand_color": "#000000", "category": "wallet",   "sama_licensed": False, "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["merchant_id"]},
    {"code": "stc_pay",     "name_ar": "STC Pay",             "name_en": "STC Pay",       "logo": "📱", "brand_color": "#4F0080", "category": "wallet",   "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["merchant_id", "api_key"]},
    {"code": "urpay",       "name_ar": "urpay",               "name_en": "urpay",         "logo": "📲", "brand_color": "#1F5FDD", "category": "wallet",   "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["merchant_id", "api_key"]},
    {"code": "tabby",       "name_ar": "تابي",                "name_en": "Tabby",         "logo": "🟢", "brand_color": "#3BFFC1", "category": "bnpl",     "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": True,  "cod": False, "installments": 4,  "max_amount": 50000, "note": "قسّمها على ٤ دفعات بدون فوائد", "credential_fields": ["merchant_id", "api_key", "secret_key"]},
    {"code": "tamara",      "name_ar": "تمارا",               "name_en": "Tamara",        "logo": "🌸", "brand_color": "#FFB6E1", "category": "bnpl",     "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": True,  "cod": False, "installments": 3,  "max_amount": 30000, "note": "متوافقة مع الشريعة — ادفع لاحقاً", "credential_fields": ["merchant_id", "api_key"]},
    {"code": "sadad",       "name_ar": "سداد",                "name_en": "SADAD",         "logo": "🏦", "brand_color": "#0A6E30", "category": "transfer", "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["biller_code"]},
    {"code": "bank_transfer","name_ar": "تحويل بنكي",         "name_en": "Bank Transfer", "logo": "🏛️", "brand_color": "#6B7280", "category": "transfer", "sama_licensed": False, "requires_kyc": False, "is_bnpl": False, "cod": False, "credential_fields": ["iban", "bank_name", "account_name"]},
    {"code": "cod",         "name_ar": "الدفع عند الاستلام",  "name_en": "Cash on Delivery","logo": "💵","brand_color": "#059669", "category": "cash",     "sama_licensed": False, "requires_kyc": False, "is_bnpl": False, "cod": True,  "credential_fields": []},
    # Gateway providers (merchant chooses one to process cards)
    {"code": "hyperpay",    "name_ar": "HyperPay",            "name_en": "HyperPay",      "logo": "⚡", "brand_color": "#003F7F", "category": "gateway",  "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["entity_id", "access_token"]},
    {"code": "moyasar",     "name_ar": "ميسر",                "name_en": "Moyasar",       "logo": "🔷", "brand_color": "#3EB6DE", "category": "gateway",  "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["publishable_key", "secret_key"]},
    {"code": "paytabs",     "name_ar": "PayTabs",             "name_en": "PayTabs",       "logo": "🔵", "brand_color": "#0066CC", "category": "gateway",  "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["profile_id", "server_key"]},
    {"code": "myfatoorah",  "name_ar": "MyFatoorah",          "name_en": "MyFatoorah",    "logo": "🧾", "brand_color": "#00A651", "category": "gateway",  "sama_licensed": True,  "requires_kyc": True,  "is_bnpl": False, "cod": False, "credential_fields": ["api_token"]},
]

SAUDI_SHIPPING_PROVIDERS = [
    {"code": "smsa",        "name_ar": "SMSA اكسبرس",     "name_en": "SMSA Express", "logo": "🚚", "brand_color": "#E31E24", "coverage": "domestic",     "cod_supported": True,  "avg_days": "1-3", "base_price": 25.0, "per_kg_price": 5.0, "credential_fields": ["account_number", "password", "passkey"]},
    {"code": "aramex",      "name_ar": "أرامكس",           "name_en": "Aramex",       "logo": "📦", "brand_color": "#DD1B23", "coverage": "international","cod_supported": True,  "avg_days": "1-4", "base_price": 30.0, "per_kg_price": 6.0, "credential_fields": ["username", "password", "account_number", "account_pin", "account_country_code"]},
    {"code": "naqel",       "name_ar": "ناقل اكسبرس",       "name_en": "Naqel Express","logo": "🛻", "brand_color": "#F58220", "coverage": "domestic",     "cod_supported": True,  "avg_days": "1-3", "base_price": 22.0, "per_kg_price": 4.5, "credential_fields": ["client_id", "password"]},
    {"code": "jt_express",  "name_ar": "J&T اكسبرس",       "name_en": "J&T Express",  "logo": "🚛", "brand_color": "#E30613", "coverage": "domestic",     "cod_supported": True,  "avg_days": "1-2", "base_price": 20.0, "per_kg_price": 4.0, "credential_fields": ["api_token"]},
    {"code": "zajil",       "name_ar": "زاجل اكسبرس",       "name_en": "Zajil Express","logo": "🚐", "brand_color": "#00A859", "coverage": "domestic",     "cod_supported": True,  "avg_days": "1-3", "base_price": 22.0, "per_kg_price": 4.5, "credential_fields": ["api_key"]},
    {"code": "aymakan",     "name_ar": "أي مكان",           "name_en": "Aymakan",      "logo": "🗺️","brand_color": "#0067AC", "coverage": "domestic",     "cod_supported": True,  "avg_days": "1-2", "base_price": 25.0, "per_kg_price": 5.0, "credential_fields": ["api_key"]},
    {"code": "saudi_post",  "name_ar": "البريد السعودي (سبل)","name_en": "Saudi Post SPL","logo": "📮","brand_color": "#005826", "coverage": "domestic",     "cod_supported": True,  "avg_days": "2-5", "base_price": 15.0, "per_kg_price": 3.0, "credential_fields": ["client_id", "client_secret"]},
    {"code": "dhl",         "name_ar": "DHL",              "name_en": "DHL",          "logo": "✈️", "brand_color": "#FFCC00", "coverage": "international","cod_supported": False, "avg_days": "1-3", "base_price": 45.0, "per_kg_price": 8.0, "credential_fields": ["site_id", "password", "account_number"]},
    {"code": "fetchr",      "name_ar": "فيتشر",             "name_en": "Fetchr",       "logo": "📍", "brand_color": "#EB2929", "coverage": "domestic",     "cod_supported": True,  "avg_days": "1-2", "base_price": 20.0, "per_kg_price": 4.0, "credential_fields": ["api_key"]},
    {"code": "torod",       "name_ar": "طرود",              "name_en": "Torod",        "logo": "🔀", "brand_color": "#0EA5E9", "coverage": "domestic",     "cod_supported": True,  "avg_days": "1-3", "base_price": 22.0, "per_kg_price": 4.5, "note": "منصّة موحّدة للعديد من الشركات",  "credential_fields": ["api_key"]},
]


async def _ensure_merchant_settings():
    """Seed default merchant_settings doc with all Saudi providers (disabled by default)."""
    existing = await db.merchant_settings.find_one({"key": "global"})
    if existing:
        return existing
    doc = {
        "key": "global",
        "payment_providers": [{
            **p,
            "enabled": p["code"] in ("mada", "cod", "bank_transfer"),  # legal minimum enabled by default
            "credentials": {},
        } for p in SAUDI_PAYMENT_PROVIDERS],
        "shipping_providers": [{
            **s,
            "enabled": s["code"] in ("smsa", "aramex", "saudi_post"),
            "credentials": {},
        } for s in SAUDI_SHIPPING_PROVIDERS],
        "loyalty": {
            "enabled": True,
            "earn_rate": 1,               # 1 point per 1 SAR
            "redeem_rate": 0.10,          # 1 point = 0.10 SAR discount
            "service_multiplier": 1.5,
            "competition_bonus": 50,
            "review_bonus": 20,
            "referral_bonus": 200,
            "birthday_bonus": 500,
            "tier_thresholds": {"bronze": 0, "silver": 500, "gold": 2000, "platinum": 5000},
            "tier_perks": {
                "bronze":   {"earn_multiplier": 1.0, "free_shipping_over": 500, "extra_warranty_days": 0},
                "silver":   {"earn_multiplier": 1.2, "free_shipping_over": 300, "extra_warranty_days": 15},
                "gold":     {"earn_multiplier": 1.5, "free_shipping_over": 200, "extra_warranty_days": 30, "priority_shipping": True},
                "platinum": {"earn_multiplier": 2.0, "free_shipping_over": 0,   "extra_warranty_days": 60, "priority_shipping": True, "vip_support": True},
            },
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.merchant_settings.insert_one(doc)
    return doc


def _user_tier(balance: int, thresholds: dict) -> str:
    if balance >= thresholds.get("platinum", 5000): return "platinum"
    if balance >= thresholds.get("gold", 2000): return "gold"
    if balance >= thresholds.get("silver", 500): return "silver"
    return "bronze"


@api_router.get("/checkout/options")
async def checkout_options(user=Depends(get_current_user)):
    """Return enabled payment methods + shipping carriers + loyalty context for checkout UI."""
    settings = await _ensure_merchant_settings()
    payments = [p for p in settings["payment_providers"] if p.get("enabled")]
    shipping = [s for s in settings["shipping_providers"] if s.get("enabled")]
    # User's loyalty balance
    uid = str(user.get("id") or user.get("_id"))
    balance_doc = await db.loyalty_transactions.find_one({"user_id": uid}, sort=[("created_at", -1)])
    balance = balance_doc.get("balance_after", 0) if balance_doc else 0
    tier = _user_tier(balance, settings["loyalty"]["tier_thresholds"])
    return {
        "payments": payments,
        "shipping": shipping,
        "loyalty": {
            "enabled": settings["loyalty"]["enabled"],
            "balance": balance,
            "tier": tier,
            "perks": settings["loyalty"]["tier_perks"].get(tier, {}),
            "earn_rate": settings["loyalty"]["earn_rate"],
            "redeem_rate": settings["loyalty"]["redeem_rate"],
        },
    }


@api_router.get("/merchant/settings/payments")
async def get_payment_settings(user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    settings = await _ensure_merchant_settings()
    return {"providers": settings["payment_providers"]}


class ProviderToggleBody(BaseModel):
    code: str
    enabled: bool
    credentials: Optional[dict] = None


@api_router.put("/merchant/settings/payments")
async def toggle_payment(body: ProviderToggleBody, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    settings = await _ensure_merchant_settings()
    for p in settings["payment_providers"]:
        if p["code"] == body.code:
            p["enabled"] = body.enabled
            if body.credentials is not None:
                p["credentials"] = body.credentials
            break
    await db.merchant_settings.update_one({"key": "global"}, {"$set": {"payment_providers": settings["payment_providers"]}})
    return {"ok": True}


@api_router.get("/merchant/settings/shipping")
async def get_shipping_settings(user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    settings = await _ensure_merchant_settings()
    return {"providers": settings["shipping_providers"]}


@api_router.put("/merchant/settings/shipping")
async def toggle_shipping(body: ProviderToggleBody, user=Depends(get_current_user)):
    if user.get("role") not in ("merchant", "chamber"):
        raise HTTPException(403, "Merchants only")
    settings = await _ensure_merchant_settings()
    for s in settings["shipping_providers"]:
        if s["code"] == body.code:
            s["enabled"] = body.enabled
            if body.credentials is not None:
                s["credentials"] = body.credentials
            break
    await db.merchant_settings.update_one({"key": "global"}, {"$set": {"shipping_providers": settings["shipping_providers"]}})
    return {"ok": True}


@api_router.get("/loyalty/balance")
async def loyalty_balance(user=Depends(get_current_user)):
    uid = str(user.get("id") or user.get("_id"))
    settings = await _ensure_merchant_settings()
    last = await db.loyalty_transactions.find_one({"user_id": uid}, sort=[("created_at", -1)])
    balance = last.get("balance_after", 0) if last else 0
    thresholds = settings["loyalty"]["tier_thresholds"]
    tier = _user_tier(balance, thresholds)
    # Find next tier
    tier_order = ["bronze", "silver", "gold", "platinum"]
    idx = tier_order.index(tier)
    next_tier = tier_order[idx + 1] if idx < 3 else None
    to_next = thresholds.get(next_tier, balance) - balance if next_tier else 0
    return {
        "balance": balance,
        "tier": tier,
        "next_tier": next_tier,
        "points_to_next": max(0, to_next),
        "perks": settings["loyalty"]["tier_perks"].get(tier, {}),
        "redeem_rate": settings["loyalty"]["redeem_rate"],
    }


@api_router.get("/loyalty/history")
async def loyalty_history(user=Depends(get_current_user), limit: int = 50):
    uid = str(user.get("id") or user.get("_id"))
    txs = await db.loyalty_transactions.find({"user_id": uid}).sort("created_at", -1).to_list(limit)
    # Auto-seed a few demo transactions if empty
    if not txs:
        import random as _r
        settings = await _ensure_merchant_settings()
        balance = 0
        demo = []
        sources = [
            ("earn", "order", "طلب #1024 - ايفون 14", _r.randint(80, 240)),
            ("earn", "service", "حجز صيانة شاشة", _r.randint(30, 90)),
            ("earn", "competition", "المشاركة في مسابقة", 50),
            ("earn", "review", "تقييم منتج", 20),
            ("earn", "birthday", "🎂 هدية عيد الميلاد", 500),
            ("redeem", "checkout", "خصم على طلب #1030", -_r.randint(50, 150)),
            ("earn", "order", "طلب #1035 - سماعات", _r.randint(60, 180)),
            ("earn", "referral", "دعوة صديق نجحت", 200),
        ]
        for kind, source, desc, pts in sources:
            balance += pts
            doc = {
                "user_id": uid, "points": pts, "kind": kind, "source": source,
                "description": desc, "balance_after": balance,
                "created_at": (datetime.now(timezone.utc) - timedelta(days=_r.randint(0, 60))).isoformat(),
            }
            await db.loyalty_transactions.insert_one(doc)
            demo.append(doc)
        txs = sorted(demo, key=lambda x: x["created_at"], reverse=True)
    return {"transactions": [serialize_doc(t) if "_id" in t else t for t in txs]}


class LoyaltyEarnBody(BaseModel):
    points: int
    source: str
    description: Optional[str] = ""
    ref_id: Optional[str] = ""


@api_router.post("/loyalty/earn")
async def loyalty_earn(body: LoyaltyEarnBody, user=Depends(get_current_user)):
    """Award loyalty points to current user."""
    uid = str(user.get("id") or user.get("_id"))
    last = await db.loyalty_transactions.find_one({"user_id": uid}, sort=[("created_at", -1)])
    balance = (last.get("balance_after", 0) if last else 0) + int(body.points)
    doc = {
        "user_id": uid, "points": int(body.points), "kind": "earn", "source": body.source,
        "description": body.description, "ref_id": body.ref_id, "balance_after": balance,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.loyalty_transactions.insert_one(doc)
    return {"balance": balance, "earned": int(body.points)}


class LoyaltyRedeemBody(BaseModel):
    points: int
    order_id: Optional[str] = ""


@api_router.post("/loyalty/redeem")
async def loyalty_redeem(body: LoyaltyRedeemBody, user=Depends(get_current_user)):
    uid = str(user.get("id") or user.get("_id"))
    last = await db.loyalty_transactions.find_one({"user_id": uid}, sort=[("created_at", -1)])
    balance = last.get("balance_after", 0) if last else 0
    if balance < body.points:
        raise HTTPException(400, "رصيد النقاط غير كافٍ")
    settings = await _ensure_merchant_settings()
    discount = round(body.points * settings["loyalty"]["redeem_rate"], 2)
    new_balance = balance - body.points
    await db.loyalty_transactions.insert_one({
        "user_id": uid, "points": -int(body.points), "kind": "redeem", "source": "checkout",
        "description": f"استبدال نقاط بخصم {discount} ر.س",
        "ref_id": body.order_id or "", "balance_after": new_balance,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"discount": discount, "new_balance": new_balance}


app.include_router(api_router)

# ─── Object Storage router (Emergent Managed) ───
try:
    from object_storage import build_router as _build_storage_router, init_storage as _init_storage
    app.include_router(_build_storage_router(get_current_user, JWT_SECRET, JWT_ALGORITHM))
except Exception as _e:
    logger.error(f"Failed to mount object_storage router: {_e}")

# ─── Shipping Matrix (Phase A) ───
try:
    from shipping_matrix import build_router as _build_shipping_router
    app.include_router(_build_shipping_router(db, get_current_user, require_merchant))
    logger.info("Shipping matrix router mounted")
except Exception as _e:
    logger.error(f"Failed to mount shipping_matrix router: {_e}")

# ─── RMA / Returns (Phase B) ───
try:
    from rma import build_router as _build_rma_router
    app.include_router(_build_rma_router(db, get_current_user, require_merchant))
    logger.info("RMA router mounted")
except Exception as _e:
    logger.error(f"Failed to mount rma router: {_e}")

# ─── Saudi Loyalty Programs (Phase C) ───
try:
    from loyalty_programs import build_router as _build_loyalty_router
    app.include_router(_build_loyalty_router(db, get_current_user, require_merchant))
    logger.info("Loyalty programs router mounted")
except Exception as _e:
    logger.error(f"Failed to mount loyalty_programs router: {_e}")

# ─── Tenant Feature Modules (Phase D) ───
try:
    from tenant_modules import build_router as _build_modules_router
    app.include_router(_build_modules_router(db, get_current_user, require_merchant))
    logger.info("Tenant modules router mounted")
except Exception as _e:
    logger.error(f"Failed to mount tenant_modules router: {_e}")

# ─── Deep Analytics for Services/Competitions/Posts (v1.13.13) ───
try:
    from deep_analytics import build_router as _build_deep_router
    app.include_router(_build_deep_router(db, get_current_user, require_merchant))
    logger.info("Deep analytics router mounted")
except Exception as _e:
    logger.error(f"Failed to mount deep_analytics router: {_e}")

@app.on_event("startup")
async def startup():
    await seed_data()
    try:
        await _seed_preview_analytics()
    except Exception as e:
        logger.warning(f"Preview analytics seed failed (non-fatal): {e}")
    try:
        _init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed (non-fatal): {e}")
    logger.info("Tech Store API started")

@app.on_event("shutdown")
async def shutdown():
    client.close()
