"""
RMA (Return Merchandise Authorization) module — Noon-style flow.

Data model:
- Product-level return rules live on each Product doc (return_days, allow_return, manufacturing_defect_days, return_conditions).
- Each RMA is created at ORDER-ITEM level (not order-level) so a customer can return one product from a multi-item order.

Reason codes: doa, defective, wrong_item, damaged_transit, not_as_described, changed_mind, warranty_repair.
Types: return | exchange | warranty.
States: pending | approved | rejected | picked_up | inspecting | resolved | refunded | closed.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from bson import ObjectId


RMA_REASONS = [
    {"code": "doa",              "label_ar": "المنتج وصل معطّل (DOA)",      "requires_media": True,  "auto_defect": True},
    {"code": "defective",        "label_ar": "عيب مصنعي",                 "requires_media": True,  "auto_defect": True},
    {"code": "damaged_transit",  "label_ar": "تلف أثناء الشحن",           "requires_media": True,  "auto_defect": False},
    {"code": "wrong_item",       "label_ar": "منتج غير مطابق للطلب",       "requires_media": True,  "auto_defect": False},
    {"code": "missing_item",     "label_ar": "منتج ناقص من الطلب",         "requires_media": False, "auto_defect": False},
    {"code": "accessory_missing","label_ar": "ملحقات ناقصة",              "requires_media": False, "auto_defect": False},
    {"code": "not_as_described", "label_ar": "المنتج غير مطابق للوصف",     "requires_media": False, "auto_defect": False},
    {"code": "changed_mind",     "label_ar": "غيّرت رأيي",                "requires_media": False, "auto_defect": False},
    {"code": "warranty_repair",  "label_ar": "طلب صيانة ضمان",             "requires_media": True,  "auto_defect": True},
]

RMA_RESOLUTIONS = [
    {"code": "refund",         "label_ar": "استرداد المبلغ"},
    {"code": "exchange",       "label_ar": "استبدال"},
    {"code": "repair",         "label_ar": "إصلاح ضمن الضمان"},
    {"code": "store_credit",   "label_ar": "رصيد في المحفظة"},
]

REFUND_ROUTES = {
    "card":         "original_payment_method",
    "mada":         "original_payment_method",
    "visa":         "original_payment_method",
    "mastercard":   "original_payment_method",
    "apple_pay":    "original_payment_method",
    "tabby":        "original_payment_method",
    "tamara":       "original_payment_method",
    "stc_pay":      "original_payment_method",
    "urpay":        "original_payment_method",
    "sadad":        "original_payment_method",
    "bank_transfer":"wallet_or_verified_bank",
    "cod":          "wallet_or_verified_bank",
    "cash_on_delivery": "wallet_or_verified_bank",
    "cash":         "wallet_or_verified_bank",
    "wallet":       "wallet",
}


class RMACreateBody(BaseModel):
    order_id: str
    order_item_id: Optional[str] = None   # ordered item id inside order.items[] (if any)
    product_id: str
    product_name: str = ""
    qty: int = 1
    unit_price: float = 0
    type: str = "return"                  # return | exchange | warranty
    reason_code: str
    reason_text: str = ""
    resolution: str = "refund"            # refund | exchange | repair | store_credit
    media: List[str] = []                 # /api/files/... paths
    imei_or_serial: str = ""
    seal_opened: bool = False


class RMADecisionBody(BaseModel):
    decision: str                         # "approve" | "reject" | "request_info"
    merchant_note: str = ""
    reverse_pickup_carrier: str = ""      # carrier_code (from shipping_matrix) if approve
    refund_amount: Optional[float] = None


class RMAInspectionBody(BaseModel):
    disposition: str                      # refund | exchange | repair | reject_return | return_to_customer
    inspector_note: str = ""
    inspection_photos: List[str] = []
    final_refund_amount: Optional[float] = None


def _return_window_ok(order: dict, product: dict) -> tuple[bool, int]:
    """Return (is_within_window, days_left)."""
    delivered_at = order.get("delivered_at") or order.get("completed_at")
    if not delivered_at:
        # Not delivered yet — allow return (customer may want to cancel)
        return True, 30
    try:
        dt = datetime.fromisoformat(delivered_at.replace("Z", "+00:00")) if isinstance(delivered_at, str) else delivered_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        return True, 30
    return_days = product.get("return_days") if product else None
    if return_days is None:
        return_days = 15  # default fallback
    now = datetime.now(timezone.utc)
    elapsed = (now - dt).days
    days_left = return_days - elapsed
    return (days_left >= 0), max(0, days_left)


def build_router(db, get_current_user, require_merchant):
    router = APIRouter(prefix="/api")

    # ─── Metadata ───
    @router.get("/rma/reasons")
    async def list_reasons():
        return {"reasons": RMA_REASONS, "resolutions": RMA_RESOLUTIONS}

    # ─── Product return-rule check (used by product detail page) ───
    @router.get("/products/{pid}/return-policy")
    async def product_return_policy(pid: str):
        try:
            p = await db.products.find_one({"_id": ObjectId(pid)})
        except Exception:
            raise HTTPException(400, "Invalid product id")
        if not p:
            raise HTTPException(404, "Product not found")
        return {
            "allow_return": p.get("allow_return", True),
            "return_days": int(p.get("return_days", 15)),
            "warranty_days": int(p.get("warranty_days", p.get("shop_warranty_days", 0))),
            "manufacturing_defect_days": int(p.get("manufacturing_defect_days", 365)),
            "return_conditions": p.get("return_conditions", "المنتج بحالته الأصلية مع كافة الملحقات والعلبة الأصلية سليمة"),
            "warranty_type": p.get("warranty_type", "none"),
            "manufacturer_name": p.get("manufacturer_name", ""),
        }

    # ─── Customer: create RMA ───
    @router.post("/rmas")
    async def create_rma(body: RMACreateBody, user=Depends(get_current_user)):
        uid = str(user.get("id") or user.get("_id"))
        # Load order
        try:
            order = await db.orders.find_one({"_id": ObjectId(body.order_id)})
        except Exception:
            raise HTTPException(400, "Invalid order id")
        if not order:
            raise HTTPException(404, "Order not found")
        if str(order.get("user_id")) != uid:
            raise HTTPException(403, "This order is not yours")

        # Load product
        try:
            product = await db.products.find_one({"_id": ObjectId(body.product_id)})
        except Exception:
            product = None
        product = product or {}

        # Validate reason
        reason_meta = next((r for r in RMA_REASONS if r["code"] == body.reason_code), None)
        if not reason_meta:
            raise HTTPException(400, "Invalid reason code")

        # Enforce return window (unless it's a warranty/defect claim — those honor warranty_days instead)
        if body.type == "return" and not reason_meta.get("auto_defect"):
            ok, days_left = _return_window_ok(order, product)
            if not ok:
                raise HTTPException(400, "انتهت مدة الإرجاع لهذا المنتج")
            if not product.get("allow_return", True):
                raise HTTPException(400, "هذا المنتج غير قابل للإرجاع")

        # Media required for defect / damage claims
        if reason_meta.get("requires_media") and not body.media:
            raise HTTPException(400, "الرجاء رفع صور أو فيديو للمنتج المتضرر")

        # Determine RMA type from reason (defective/DOA/warranty → warranty)
        rma_type = body.type
        if reason_meta.get("auto_defect"):
            rma_type = "warranty" if body.reason_code == "warranty_repair" else "return"

        # Detect payment method for refund route
        payment_method = order.get("payment_method") or order.get("payment_code") or "wallet"
        refund_route = REFUND_ROUTES.get(payment_method, "wallet")

        rma_doc = {
            "user_id": uid,
            "customer_name": user.get("name") or user.get("full_name") or "",
            "customer_phone": user.get("phone") or "",
            "order_id": body.order_id,
            "order_item_id": body.order_item_id or "",
            "product_id": body.product_id,
            "product_name": body.product_name or product.get("name_ar", ""),
            "product_image": (product.get("images") or [""])[0] if product.get("images") else "",
            "qty": max(1, body.qty),
            "unit_price": float(body.unit_price or product.get("price", 0)),
            "type": rma_type,
            "reason_code": body.reason_code,
            "reason_label_ar": reason_meta["label_ar"],
            "reason_text": body.reason_text,
            "resolution": body.resolution,
            "media": body.media,
            "imei_or_serial": body.imei_or_serial,
            "seal_opened": bool(body.seal_opened),
            "state": "pending",
            "merchant_note": "",
            "reverse_pickup": None,
            "inspection": None,
            "refund": None,
            "refund_route": refund_route,
            "payment_method": payment_method,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "audit": [{"at": datetime.now(timezone.utc).isoformat(), "actor": "customer",
                       "action": "created", "note": body.reason_text}],
        }

        r = await db.rmas.insert_one(rma_doc)
        rma_id = str(r.inserted_id)

        # Notify merchant (best-effort log)
        try:
            await db.notifications.insert_one({
                "kind": "rma_new", "rma_id": rma_id, "product_name": rma_doc["product_name"],
                "reason": reason_meta["label_ar"], "customer": rma_doc["customer_name"],
                "created_at": datetime.now(timezone.utc).isoformat(), "read": False,
            })
        except Exception:
            pass

        return {"id": rma_id, "state": "pending", "message": "تم رفع طلبك بنجاح"}

    # ─── Customer: my RMAs ───
    @router.get("/my/rmas")
    async def my_rmas(user=Depends(get_current_user)):
        uid = str(user.get("id") or user.get("_id"))
        rows = await db.rmas.find({"user_id": uid}).sort("created_at", -1).to_list(200)
        for r in rows:
            r["id"] = str(r.pop("_id"))
        return {"rmas": rows}

    @router.get("/my/rmas/{rma_id}")
    async def my_rma_detail(rma_id: str, user=Depends(get_current_user)):
        uid = str(user.get("id") or user.get("_id"))
        try:
            r = await db.rmas.find_one({"_id": ObjectId(rma_id), "user_id": uid})
        except Exception:
            raise HTTPException(400, "Invalid RMA id")
        if not r:
            raise HTTPException(404, "RMA not found")
        r["id"] = str(r.pop("_id"))
        return r

    # ─── Customer: eligible order-items for return ───
    @router.get("/my/orders/{order_id}/returnable")
    async def returnable_items(order_id: str, user=Depends(get_current_user)):
        uid = str(user.get("id") or user.get("_id"))
        try:
            order = await db.orders.find_one({"_id": ObjectId(order_id)})
        except Exception:
            raise HTTPException(400, "Invalid order id")
        if not order:
            raise HTTPException(404, "Order not found")
        if str(order.get("user_id")) != uid:
            raise HTTPException(403, "This order is not yours")

        items = order.get("items", [])
        # For each item, look up product return policy and any active RMA
        result = []
        for it in items:
            pid = it.get("product_id") or ""
            product = None
            if pid:
                try:
                    product = await db.products.find_one({"_id": ObjectId(pid)})
                except Exception:
                    product = None
            product = product or {}
            ok, days_left = _return_window_ok(order, product)
            active = await db.rmas.find_one({
                "order_id": order_id, "product_id": pid,
                "state": {"$nin": ["rejected", "closed"]}
            })
            result.append({
                "product_id": pid,
                "product_name": it.get("name") or product.get("name_ar", ""),
                "product_image": (product.get("images") or [""])[0] if product.get("images") else "",
                "qty": int(it.get("qty", 1)),
                "unit_price": float(it.get("price", product.get("price", 0))),
                "allow_return": product.get("allow_return", True) and ok,
                "return_days": int(product.get("return_days", 15)),
                "days_left": int(days_left),
                "warranty_days": int(product.get("warranty_days", product.get("shop_warranty_days", 0))),
                "manufacturer_defect_days": int(product.get("manufacturing_defect_days", 365)),
                "has_active_rma": bool(active),
                "rma_id": str(active.get("_id")) if active else "",
                "warranty_type": product.get("warranty_type", "none"),
            })
        return {"order_id": order_id, "items": result,
                "delivered_at": order.get("delivered_at") or order.get("completed_at") or ""}

    # ─── Merchant: list all RMAs ───
    @router.get("/merchant/rmas")
    async def list_all_rmas(state: str = "", user=Depends(get_current_user)):
        require_merchant(user)
        q = {}
        if state:
            q["state"] = state
        rows = await db.rmas.find(q).sort("created_at", -1).to_list(500)
        for r in rows:
            r["id"] = str(r.pop("_id"))
        # Summary
        counts = {
            "pending":    await db.rmas.count_documents({"state": "pending"}),
            "approved":   await db.rmas.count_documents({"state": "approved"}),
            "inspecting": await db.rmas.count_documents({"state": {"$in": ["picked_up", "inspecting"]}}),
            "resolved":   await db.rmas.count_documents({"state": {"$in": ["resolved", "refunded"]}}),
            "rejected":   await db.rmas.count_documents({"state": "rejected"}),
        }
        return {"rmas": rows, "counts": counts}

    @router.get("/merchant/rmas/{rma_id}")
    async def merchant_rma_detail(rma_id: str, user=Depends(get_current_user)):
        require_merchant(user)
        try:
            r = await db.rmas.find_one({"_id": ObjectId(rma_id)})
        except Exception:
            raise HTTPException(400, "Invalid RMA id")
        if not r:
            raise HTTPException(404, "RMA not found")
        r["id"] = str(r.pop("_id"))
        return r

    # ─── Merchant: decision ───
    @router.put("/merchant/rmas/{rma_id}/decision")
    async def decide_rma(rma_id: str, body: RMADecisionBody, user=Depends(get_current_user)):
        require_merchant(user)
        try:
            oid = ObjectId(rma_id)
        except Exception:
            raise HTTPException(400, "Invalid RMA id")
        rma = await db.rmas.find_one({"_id": oid})
        if not rma:
            raise HTTPException(404, "RMA not found")
        if rma["state"] not in ("pending",):
            raise HTTPException(400, f"لا يمكن اتخاذ قرار — الحالة الحالية {rma['state']}")

        if body.decision == "approve":
            new_state = "approved"
            update = {
                "state": new_state,
                "merchant_note": body.merchant_note,
                "reverse_pickup": {
                    "carrier_code": body.reverse_pickup_carrier or "smsa",
                    "requested_at": datetime.now(timezone.utc).isoformat(),
                    "status": "requested",
                },
                "approved_refund_amount": body.refund_amount if body.refund_amount is not None else rma.get("unit_price", 0) * rma.get("qty", 1),
            }
        elif body.decision == "reject":
            new_state = "rejected"
            update = {"state": new_state, "merchant_note": body.merchant_note}
        elif body.decision == "request_info":
            new_state = "pending"
            update = {"state": new_state, "merchant_note": body.merchant_note}
        else:
            raise HTTPException(400, "Unknown decision")

        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        entry = {"at": update["updated_at"], "actor": "merchant",
                 "action": body.decision, "note": body.merchant_note}

        await db.rmas.update_one({"_id": oid}, {"$set": update, "$push": {"audit": entry}})
        return {"state": new_state, "message": "تم"}

    # ─── Merchant: inspection ───
    @router.put("/merchant/rmas/{rma_id}/inspection")
    async def inspect_rma(rma_id: str, body: RMAInspectionBody, user=Depends(get_current_user)):
        require_merchant(user)
        try:
            oid = ObjectId(rma_id)
        except Exception:
            raise HTTPException(400, "Invalid RMA id")
        rma = await db.rmas.find_one({"_id": oid})
        if not rma:
            raise HTTPException(404, "RMA not found")

        now = datetime.now(timezone.utc).isoformat()
        inspection = {
            "disposition": body.disposition,
            "inspector_note": body.inspector_note,
            "photos": body.inspection_photos,
            "at": now,
        }

        if body.disposition in ("refund", "exchange", "repair"):
            new_state = "resolved"
        elif body.disposition == "reject_return":
            new_state = "rejected"
        else:  # return_to_customer
            new_state = "closed"

        refund_info = None
        if body.disposition == "refund":
            amt = body.final_refund_amount if body.final_refund_amount is not None else rma.get("approved_refund_amount", rma.get("unit_price", 0) * rma.get("qty", 1))
            # Credit to customer wallet if route is wallet
            uid = rma.get("user_id")
            if rma.get("refund_route") in ("wallet", "wallet_or_verified_bank") or rma.get("payment_method") in ("wallet", "cod", "cash_on_delivery", "cash"):
                try:
                    await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"wallet_balance": float(amt)}})
                    await db.wallet_transactions.insert_one({
                        "user_id": uid, "amount": float(amt), "kind": "credit",
                        "source": "rma_refund", "ref_id": rma_id,
                        "description": f"استرداد طلب إرجاع {rma.get('product_name', '')}",
                        "created_at": now,
                    })
                except Exception:
                    pass
            refund_info = {
                "amount": float(amt), "route": rma.get("refund_route", "wallet"),
                "at": now, "status": "processed",
            }
            new_state = "refunded"

        await db.rmas.update_one({"_id": oid}, {
            "$set": {
                "state": new_state, "inspection": inspection, "refund": refund_info,
                "updated_at": now,
            },
            "$push": {"audit": {"at": now, "actor": "merchant",
                                "action": f"inspect:{body.disposition}",
                                "note": body.inspector_note}}
        })
        return {"state": new_state, "message": "تم الفحص"}

    return router
