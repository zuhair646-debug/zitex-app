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

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
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
    user = await db.users.find_one({"phone": data.phone})
    if not user or not verify_password(data.password, user["password_hash"]):
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
    existing = await db.competition_entries.find_one({"competition_id": comp_id, "user_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already joined")
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

@api_router.post("/competitions/{comp_id}/answer")
async def answer_quiz(comp_id: str, request: Request, user=Depends(get_current_user)):
    body = await request.json()
    answers = body.get("answers", [])
    comp = await db.competitions.find_one({"_id": ObjectId(comp_id)})
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    questions = comp.get("questions", [])
    correct = sum(1 for i, a in enumerate(answers) if i < len(questions) and a == questions[i].get("correct"))
    score = correct / max(len(questions), 1) * 100
    passed = score >= 70
    if passed:
        existing = await db.competition_entries.find_one({"competition_id": comp_id, "user_id": user["id"]})
        if not existing:
            await db.competition_entries.insert_one({
                "competition_id": comp_id, "user_id": user["id"], "user_name": user["name"],
                "user_phone": user["phone"], "score": score, "joined_at": datetime.now(timezone.utc).isoformat()
            })
            await db.competitions.update_one({"_id": ObjectId(comp_id)}, {"$inc": {"joined_count": 1}})
    return {"score": score, "correct": correct, "total": len(questions), "passed": passed}

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
    service_name: str
    device_model: str = ""
    issue_desc: str = ""
    delivery_type: str = "store"  # store, delivery, home_pickup
    address: str = ""
    phone: str = ""

@api_router.get("/services")
async def get_services():
    services = await db.services.find({"published": True}).to_list(20)
    return [serialize_doc(s) for s in services]

@api_router.get("/services/{svc_id}")
async def get_service(svc_id: str):
    svc = await db.services.find_one({"_id": ObjectId(svc_id)})
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    return serialize_doc(svc)

@api_router.post("/services/book")
async def book_service(data: ServiceBookInput, user=Depends(get_current_user)):
    result = await db.service_bookings.insert_one({
        "user_id": user["id"], "service_name": data.service_name,
        "device_model": data.device_model, "issue_desc": data.issue_desc,
        "delivery_type": data.delivery_type, "address": data.address, "phone": data.phone,
        "status": "pending", "warranty": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"id": str(result.inserted_id), "message": "Service booked successfully"}

@api_router.get("/services/bookings/my")
async def my_service_bookings(user=Depends(get_current_user)):
    bookings = await db.service_bookings.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    return [serialize_doc(b) for b in bookings]

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
    await db.cart_items.delete_many({"user_id": user["id"]})
    order_doc["id"] = str(result.inserted_id)
    order_doc.pop("_id", None)

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
    posts = await db.social_posts.find(query).sort("created_at", -1).to_list(30)
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
                  "branches", "drivers", "delivery", "banners", "customers", "settings", "support"]

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
    storage_options: List[str] = []
    colors: List[dict] = []
    specs: dict = {}
    in_stock: bool = True
    featured: bool = False
    published: bool = True

@api_router.post("/merchant/products")
async def merchant_create_product(data: ProductInput, user=Depends(get_current_user)):
    require_merchant(user)
    doc = data.model_dump()
    doc.update({"rating": 0, "review_count": 0, "sold_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat()})
    r = await db.products.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "Product created"}

@api_router.put("/merchant/products/{pid}")
async def merchant_update_product(pid: str, data: ProductInput, user=Depends(get_current_user)):
    require_merchant(user)
    await db.products.update_one({"_id": ObjectId(pid)}, {"$set": data.model_dump()})
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
    icon: str = "construct"
    color: str = "#8833FF"
    price: float
    inspection_price: float = 0
    turnaround: str = "1-2 Days"
    delivery_available: bool = True
    home_pickup: bool = True
    warranty_available: bool = True
    warranty_days: int = 90
    published: bool = True

@api_router.post("/merchant/services")
async def merchant_create_service(data: ServiceInput, user=Depends(get_current_user)):
    require_merchant(user)
    doc = data.model_dump()
    doc.update({"total_requests": 0, "rating": 0, "review_count": 0})
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
    await db.service_bookings.update_one({"_id": ObjectId(bid)}, {"$set": {"status": body.get("status", "")}})
    return {"message": "Updated"}

# ─── Merchant: Social Posts CRUD ───
class SocialPostInput(BaseModel):
    text: str = ""
    image: str = ""  # url or base64 data URI
    images: List[str] = []  # for multi-image posts
    type: str = "post"  # post | poll | question | event | story
    poll_options: List[dict] = []  # [{text, votes}]
    question: str = ""  # for type=question
    event_date: str = ""  # ISO for type=event
    event_location: str = ""

@api_router.post("/merchant/social/posts")
async def merchant_create_post(data: SocialPostInput, user=Depends(get_current_user)):
    require_merchant(user)
    if not data.text and not data.image and not data.images and data.type == "post":
        raise HTTPException(status_code=400, detail="Post must have text or image")
    doc = {
        "author": user.get("name", "Store"),
        "author_id": user["id"],
        "text": data.text,
        "image": data.image,
        "images": data.images or ([data.image] if data.image else []),
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
    # NEW: "qa" | "purchase" | "signup" | "general"
    competition_type: str = "general"
    question: str = ""
    correct_answer: str = ""
    required_product_id: str = ""
    spend_requirement: float = 0
    start_date: str = ""
    end_date: str = ""
    draw_date: str = ""
    max_participants: int = 1000
    # Chamber supervision (NO approval needed - just permit + assigned employee)
    chamber_supervised: bool = False
    permit_number: str = ""
    assigned_chamber_employee_id: str = ""
    cover_image: str = ""

@api_router.post("/merchant/competitions")
async def merchant_create_competition(data: CompetitionInput, user=Depends(get_current_user)):
    require_merchant(user)
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

@api_router.post("/competitions/{cid}/join")
async def join_competition(cid: str, user=Depends(get_current_user)):
    comp = await db.competitions.find_one({"_id": ObjectId(cid)})
    if not comp:
        raise HTTPException(status_code=404, detail="Not found")
    if comp.get("competition_type") not in ["signup", "general"]:
        raise HTTPException(status_code=400, detail="Not joinable directly")
    existing = await db.competition_entries.find_one({"competition_id": cid, "user_id": user["id"]})
    if existing:
        return {"message": "Already joined"}
    await db.competition_entries.insert_one({
        "competition_id": cid, "user_id": user["id"], "user_name": user.get("name", ""),
        "user_phone": user.get("phone", ""), "entry_type": "direct",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    await db.competitions.update_one({"_id": ObjectId(cid)}, {"$inc": {"joined_count": 1}})
    return {"message": "Joined"}

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
@api_router.get("/merchant/branches/{bid}/inventory")
async def branch_inventory(bid: str, user=Depends(get_current_user)):
    require_merchant(user)
    inventory = await db.branch_inventory.find({"branch_id": bid}).to_list(500)
    # Enrich with product info
    result = []
    for inv in inventory:
        p = await db.products.find_one({"_id": ObjectId(inv["product_id"])}) if ObjectId.is_valid(inv.get("product_id", "")) else None
        if p:
            result.append({
                "id": str(inv["_id"]),
                "product_id": inv["product_id"],
                "product_name": p.get("name_ar") or p.get("name_en"),
                "product_image": (p.get("images") or [None])[0],
                "quantity": inv.get("quantity", 0),
                "min_alert": inv.get("min_alert", 5),
                "inventory_type": inv.get("inventory_type", "both"),  # store/app/both
                "last_updated": inv.get("last_updated"),
            })
    return result

@api_router.put("/merchant/branches/{bid}/inventory/{pid}")
async def set_branch_inventory(bid: str, pid: str, request: Request, user=Depends(get_current_user)):
    require_merchant(user)
    body = await request.json()
    from datetime import datetime
    await db.branch_inventory.update_one(
        {"branch_id": bid, "product_id": pid},
        {"$set": {
            "branch_id": bid, "product_id": pid,
            "quantity": int(body.get("quantity", 0)),
            "min_alert": int(body.get("min_alert", 5)),
            "inventory_type": body.get("inventory_type", "both"),
            "last_updated": datetime.utcnow().isoformat(),
        }},
        upsert=True,
    )
    return {"message": "Updated"}

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
            "name": "Zitex Store", "email": "owner@zitex.sa",
            "city": "Riyadh", "gender": "", "role": "merchant",
            "points": 0, "wallet_balance": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info("Seeded Merchant account")

    # Seed Driver account
    driver_user = await db.users.find_one({"phone": "0540001111"})
    if not driver_user:
        res = await db.users.insert_one({
            "phone": "0540001111", "password_hash": hash_password("driver1234"),
            "name": "محمد السائق", "email": "driver@zitex.sa",
            "city": "Riyadh", "gender": "M", "role": "driver",
            "points": 0, "wallet_balance": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        uid = str(res.inserted_id)
        await db.drivers.insert_one({
            "user_id": uid, "name": "محمد السائق", "phone": "0540001111",
            "vehicle_info": "Toyota Hilux 2022", "payment_model": "commission",
            "commission_type": "fixed", "merchant_commission_value": 5,
            "salary_monthly": 0, "bonus_threshold_orders": 20, "bonus_per_extra_order": 2,
            "online": False, "current_lat": 0, "current_lng": 0,
            "wallet_balance": 0, "total_deliveries": 0, "today_deliveries": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info("Seeded Driver account: 0540001111/driver1234")
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
        await db.competitions.insert_many(comps)
        logger.info("Seeded competitions")

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
            {"name": "Screen Repair", "desc": "Professional screen replacement for all phone models", "icon": "phone-portrait", "color": "#8833FF",
             "price": 199, "inspection_price": 11, "total_requests": 423, "turnaround": "1-2 Days",
             "delivery_available": True, "home_pickup": True, "warranty_available": True, "warranty_days": 90,
             "rating": 4.7, "review_count": 134, "published": True},
            {"name": "Battery Replacement", "desc": "Genuine battery replacement with warranty", "icon": "battery-charging", "color": "#10B981",
             "price": 149, "inspection_price": 11, "total_requests": 312, "turnaround": "1 Day",
             "delivery_available": True, "home_pickup": True, "warranty_available": True, "warranty_days": 180,
             "rating": 4.8, "review_count": 98, "published": True},
            {"name": "Water Damage Repair", "desc": "Advanced water damage recovery service", "icon": "water", "color": "#3B82F6",
             "price": 299, "inspection_price": 25, "total_requests": 187, "turnaround": "2-3 Days",
             "delivery_available": True, "home_pickup": False, "warranty_available": True, "warranty_days": 30,
             "rating": 4.3, "review_count": 67, "published": True},
            {"name": "Software Fix", "desc": "OS updates, virus removal, data recovery", "icon": "code-slash", "color": "#F59E0B",
             "price": 99, "inspection_price": 0, "total_requests": 256, "turnaround": "Same Day",
             "delivery_available": False, "home_pickup": False, "warranty_available": False, "warranty_days": 0,
             "rating": 4.6, "review_count": 89, "published": True},
            {"name": "Device Inspection", "desc": "Full device health check and diagnostic report", "icon": "search", "color": "#EC4899",
             "price": 49, "inspection_price": 0, "total_requests": 145, "turnaround": "Same Day",
             "delivery_available": False, "home_pickup": False, "warranty_available": False, "warranty_days": 0,
             "rating": 4.9, "review_count": 156, "published": True},
            {"name": "Charging Port Fix", "desc": "Repair or replace damaged charging ports", "icon": "flash", "color": "#EF4444",
             "price": 129, "inspection_price": 11, "total_requests": 198, "turnaround": "1 Day",
             "delivery_available": True, "home_pickup": True, "warranty_available": True, "warranty_days": 60,
             "rating": 4.5, "review_count": 78, "published": True},
        ]
        await db.services.insert_many(services)
        logger.info("Seeded services")

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

    # Indexes
    await db.users.create_index("phone", unique=True)
    await db.products.create_index([("name_ar", "text"), ("name_en", "text")])

app.include_router(api_router)

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
        "author": p.get("author", "Zitex"),
        "likes": p.get("likes", 0),
        "comments": p.get("comments", 0),
        "views": p.get("views", 0),
        "poll_options": p.get("poll_options", []),
        "event_date": p.get("event_date"),
        "event_location": p.get("event_location"),
        "created_at": p.get("created_at", ""),
    } for p in posts]

# Need to re-include router so new endpoint is registered
app.include_router(api_router)

@app.on_event("startup")
async def startup():
    await seed_data()
    logger.info("Tech Store API started")

@app.on_event("shutdown")
async def shutdown():
    client.close()
