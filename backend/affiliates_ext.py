"""
Marketers (affiliates) — payouts + data normalisation.

Payout flow (owner decision): the marketer requests a payout → the merchant transfers manually
to the marketer's IBAN and records the transfer reference → marked paid.
Balance = total_earnings − paid_total − pending requests.
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

# legacy seed field → canonical field
_FIELD_MAP = {"commission_rate": "commission_percent", "clicks": "total_clicks", "conversions": "total_conversions",
              "sales_total": "total_sales", "commission_earned": "total_earnings", "commission_paid": "paid_total"}


async def normalise_affiliates(db):
    """Idempotent: copy legacy seed fields into the canonical names used by the screens & commission logic."""
    async for a in db.affiliates.find({}):
        upd = {new: a[old] for old, new in _FIELD_MAP.items() if old in a and new not in a}
        if upd:
            await db.affiliates.update_one({"_id": a["_id"]}, {"$set": upd})


class PayoutRequest(BaseModel):
    affiliate_id: str
    amount: float
    iban: str
    account_name: str


class PayoutDecision(BaseModel):
    transfer_ref: str = ""
    note: str = ""


def build_router(db, get_current_user, require_merchant):
    router = APIRouter(prefix="/api")

    async def min_payout(kind: str = "marketer") -> float:
        s = await db.app_settings.find_one({"_id": "payout_rules"}) or {}
        return float(s.get(f"{kind}_min", 50))

    class PayoutRules(BaseModel):
        marketer_min: float = 50
        driver_min: float = 50

    @router.get("/merchant/payout-settings")
    async def get_rules(user=Depends(get_current_user)):
        require_merchant(user)
        return {"marketer_min": await min_payout("marketer"), "driver_min": await min_payout("driver")}

    @router.put("/merchant/payout-settings")
    async def put_rules(body: PayoutRules, user=Depends(get_current_user)):
        if user.get("role") != "merchant":
            raise HTTPException(403, "للمالك فقط")
        if body.marketer_min < 1 or body.driver_min < 1:
            raise HTTPException(400, "الحد الأدنى يجب أن يكون 1 ر.س أو أكثر")
        await db.app_settings.update_one({"_id": "payout_rules"}, {"$set": body.model_dump()}, upsert=True)
        return body.model_dump()

    async def balance(aff: dict) -> float:
        pending = 0.0
        async for p in db.affiliate_payouts.find({"affiliate_id": str(aff["_id"]), "status": "pending"}):
            pending += float(p.get("amount") or 0)
        return round(float(aff.get("total_earnings") or 0) - float(aff.get("paid_total") or 0) - pending, 2)

    @router.get("/affiliate/payouts")
    async def my_payouts(user=Depends(get_current_user)):
        affs = await db.affiliates.find({"user_id": user["id"]}).to_list(50)
        out = []
        mn = await min_payout("marketer")
        for a in affs:
            reqs = await db.affiliate_payouts.find({"affiliate_id": str(a["_id"])}).sort("created_at", -1).to_list(100)
            out.append({"affiliate_id": str(a["_id"]), "referral_code": a.get("referral_code"), "min_amount": mn,
                        "available": await balance(a), "paid_total": float(a.get("paid_total") or 0),
                        "requests": [{**{k: v for k, v in r.items() if k != "_id"}, "id": str(r["_id"])} for r in reqs]})
        return out

    @router.post("/affiliate/payouts")
    async def request_payout(body: PayoutRequest, user=Depends(get_current_user)):
        if not ObjectId.is_valid(body.affiliate_id):
            raise HTTPException(400)
        aff = await db.affiliates.find_one({"_id": ObjectId(body.affiliate_id), "user_id": user["id"]})
        if not aff:
            raise HTTPException(404, "الحساب غير موجود")
        iban = body.iban.replace(" ", "").upper()
        if not (iban.startswith("SA") and len(iban) == 24 and iban[2:].isdigit()):
            raise HTTPException(400, "رقم الآيبان يجب أن يكون سعودي (SA + 22 رقم)")
        avail = await balance(aff)
        if not body.account_name.strip():
            raise HTTPException(400, "اسم صاحب الحساب مطلوب")
        mn = await min_payout("marketer")
        if body.amount < mn or body.amount > avail:
            raise HTTPException(400, f"الحد الأدنى للسحب {mn:.0f} ر.س والمتاح {avail:.2f} ر.س")
        doc = {"affiliate_id": body.affiliate_id, "marketer_id": user["id"], "marketer_name": aff.get("name") or user.get("name", ""),
               "merchant_id": aff.get("merchant_id"), "amount": round(body.amount, 2), "iban": iban,
               "account_name": body.account_name.strip(), "status": "pending",
               "created_at": datetime.now(timezone.utc).isoformat()}
        r = await db.affiliate_payouts.insert_one(doc)
        return {"id": str(r.inserted_id), "message": "تم إرسال طلب الصرف"}

    @router.get("/merchant/affiliate/payouts")
    async def merchant_payouts(status: str = "", user=Depends(get_current_user)):
        require_merchant(user)
        q = {"status": status} if status else {}
        reqs = await db.affiliate_payouts.find(q).sort("created_at", -1).to_list(300)
        return [{**{k: v for k, v in r.items() if k != "_id"}, "id": str(r["_id"])} for r in reqs]

    async def _decide(pid: str, approve: bool, body: PayoutDecision, user: dict):
        require_merchant(user)
        if not ObjectId.is_valid(pid):
            raise HTTPException(400)
        p = await db.affiliate_payouts.find_one({"_id": ObjectId(pid)})
        if not p or p.get("status") != "pending":
            raise HTTPException(409, "تمت معالجة الطلب مسبقاً")
        now = datetime.now(timezone.utc).isoformat()
        if approve and not body.transfer_ref.strip():
            raise HTTPException(400, "أدخل رقم الحوالة")
        # Atomic: only one decision can win (prevents double payment)
        r = await db.affiliate_payouts.update_one({"_id": p["_id"], "status": "pending"}, {"$set": {
            "status": "paid" if approve else "rejected", "transfer_ref": body.transfer_ref.strip(),
            "note": body.note, "decided_at": now, "decided_by": user.get("name", "")}})
        if r.modified_count == 0:
            raise HTTPException(409, "تمت معالجة الطلب مسبقاً")
        if approve:
            await db.affiliates.update_one({"_id": ObjectId(p["affiliate_id"])}, {"$inc": {"paid_total": float(p["amount"])}})
        return {"status": "paid" if approve else "rejected"}

    @router.post("/merchant/affiliate/payouts/{pid}/approve")
    async def approve(pid: str, body: PayoutDecision, user=Depends(get_current_user)):
        return await _decide(pid, True, body, user)

    @router.post("/merchant/affiliate/payouts/{pid}/reject")
    async def reject(pid: str, body: PayoutDecision, user=Depends(get_current_user)):
        return await _decide(pid, False, body, user)

    return router
