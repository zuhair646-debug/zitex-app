"""
Competition rules shared by all competition types (entry window, staff exclusion, locked fields,
purchase tickets). Keeps server.py routes thin and the rules in one auditable place.
"""
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException

STAFF_ROLES = {"merchant", "employee", "chamber", "driver", "admin"}
# Fields frozen as soon as the first entry exists (they define who can win and how many win)
LOCKED_FIELDS = ("prize_count", "competition_type", "correct_answer", "options", "question", "spend_requirement",
                 "purchase_mode", "required_product_id", "tickets_mode", "max_tickets_per_user",
                 "start_date", "end_date", "draw_date", "chamber_supervised",
                 "assigned_chamber_employee_id", "permit_number")
SET_ONCE = ("end_date", "draw_date", "chamber_supervised", "assigned_chamber_employee_id", "permit_number")
# Missing fields on older competitions = these defaults (the edit form sends them explicitly)
DEFAULTS = {"prize_count": 1, "competition_type": "general", "spend_requirement": 0, "purchase_mode": "single",
            "tickets_mode": "one", "max_tickets_per_user": 1, "chamber_supervised": False}
KSA = timezone(timedelta(hours=3))
CANCELLED = {"cancelled", "canceled", "refunded", "returned", "rejected"}


def _ts(v):
    """Dates typed as YYYY-MM-DD are Saudi local days (start of that day, UTC+3)."""
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=KSA)
    except ValueError:
        return None


def _end_ts(v):
    """end_date is the LAST day of participation → a date-only value closes at the end of that Saudi day."""
    d = _ts(v)
    if d and len(str(v).strip()) == 10:
        d += timedelta(days=1)
    return d


def _norm(f, v):
    v = DEFAULTS.get(f) if v in (None, "") and f in DEFAULTS else v
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v) if f in ("prize_count", "spend_requirement", "max_tickets_per_user") else v.strip()
        except ValueError:
            return v.strip()
    return v


def now():
    return datetime.now(timezone.utc)


def entry_open(comp) -> bool:
    if comp.get("status", "open") != "open" or comp.get("open_draw_session") or comp.get("winners_finalized_at"):
        return False
    start, end = _ts(comp.get("start_date")), _end_ts(comp.get("end_date"))
    return not (start and now() < start) and not (end and now() >= end)


def require_entry_open(comp, user):
    if user.get("role") in STAFF_ROLES:
        raise HTTPException(403, "موظفو المتجر والغرفة لا يحق لهم المشاركة")
    if not entry_open(comp):
        raise HTTPException(400, "المشاركة في هذه المسابقة مغلقة")


def draw_opens_at(comp):
    times = [x for x in (_end_ts(comp.get("end_date")), _ts(comp.get("draw_date"))) if x]
    return max(times) if _end_ts(comp.get("end_date")) else None


def draw_ready(comp) -> bool:
    """Entries closed and the announced draw time reached → the initial draw may be opened (UGC picks by likes)."""
    at = draw_opens_at(comp)
    return (comp.get("competition_type") != "ugc_video" and bool(at) and now() >= at
            and not comp.get("winners_finalized_at"))


def phase(comp) -> str:
    """open | soon | waiting (entries closed, draw time not yet) | ready | drawn"""
    if comp.get("winners_finalized_at"):
        return "drawn"
    if entry_open(comp):
        return "open"
    if draw_ready(comp):
        return "ready"
    if comp.get("competition_type") == "ugc_video" and _end_ts(comp.get("end_date")) and now() >= _end_ts(comp.get("end_date")):
        return "likes"  # UGC winners are chosen by likes, not by a draw
    start = _ts(comp.get("start_date"))
    if start and now() < start and comp.get("status", "open") == "open":
        return "soon"
    return "waiting"


def public_flags(comp) -> dict:
    at = draw_opens_at(comp)
    return {"entry_open": entry_open(comp), "draw_ready": draw_ready(comp), "phase": phase(comp),
            "draw_opens_at": at.astimezone(KSA).isoformat() if at else ""}


def require_draw_window(comp):
    """A draw can only open once entries are closed: after end_date and (if set) on/after draw_date."""
    end, draw = _end_ts(comp.get("end_date")), _ts(comp.get("draw_date"))
    if not end:
        raise HTTPException(400, "حدد تاريخ نهاية المسابقة قبل السحب")
    if now() < end:
        raise HTTPException(400, f"السحب يفتح بعد انتهاء المسابقة ({str(comp.get('end_date'))[:10]})")
    if draw and now() < draw:
        raise HTTPException(400, f"موعد السحب المعلن {str(comp.get('draw_date'))[:10]}")


def validate_dates(d: dict, creating: bool = False):
    for k in ("start_date", "end_date", "draw_date"):
        if d.get(k) and not _ts(d[k]):
            raise HTTPException(422, f"صيغة التاريخ غير صحيحة ({k}) — استخدم YYYY-MM-DD")
    start, end, draw = _ts(d.get("start_date")), _ts(d.get("end_date")), _ts(d.get("draw_date"))
    if d.get("competition_type", "general") != "ugc_video" and not end:
        raise HTTPException(422, "تاريخ نهاية المسابقة مطلوب — بدونه ما يمكن إجراء السحب")
    if start and end and end < start:
        raise HTTPException(422, "تاريخ النهاية لازم يكون بعد تاريخ البداية")
    if draw and end and draw < end:
        raise HTTPException(422, "موعد السحب لازم يكون في يوم الانتهاء أو بعده")
    if creating and end and _end_ts(d.get("end_date")) <= now():
        raise HTTPException(422, "تاريخ النهاية انتهى — اختر تاريخاً قادماً")


async def guard_update(db, comp, new: dict):
    cid = str(comp["_id"])
    if comp.get("winners_finalized_at") or comp.get("open_draw_session"):
        raise HTTPException(409, "لا يمكن تعديل مسابقة بدأ أو انتهى سحبها")
    if await db.competition_entries.count_documents({"competition_id": cid}, limit=1):
        changed = [f for f in LOCKED_FIELDS if f in new and _norm(f, new.get(f)) != _norm(f, comp.get(f))
                   and not (new.get(f) in (None, "", [], 0) and comp.get(f) in (None, "", [], 0))
                   and not (f in SET_ONCE and not comp.get(f))]  # an empty date / officer may be set once
        if changed:
            if set(changed) <= {"assigned_chamber_employee_id", "permit_number", "chamber_supervised"}:
                raise HTTPException(409, "لتغيير موظف الغرفة أو رقم التصريح استخدم «الإشراف والتصريح» في صفحة الغرفة التجارية (مع ذكر السبب)")
            raise HTTPException(409, "هذه الشروط مقفلة بعد أول مشاركة: " + "، ".join(changed))


async def guard_delete(db, comp):
    if comp.get("is_test"):
        return
    if comp.get("winners_finalized_at") or comp.get("open_draw_session"):
        raise HTTPException(409, "لا يمكن حذف مسابقة تم السحب عليها — تبقى موثقة")
    if await db.competition_entries.count_documents({"competition_id": str(comp["_id"])}, limit=1):
        raise HTTPException(409, "لا يمكن حذف مسابقة فيها مشاركون — أوقفها بدلاً من الحذف")


async def award_purchase_tickets(db, order: dict, user: dict):
    """Purchase competitions: qualifying orders earn tickets per the merchant's published rules.
    tickets_mode: "one" (one chance per customer) | "per_order" (each qualifying order = 1 ticket, capped)."""
    if user.get("role") in STAFF_ROLES:
        return
    async for comp in db.competitions.find({"competition_type": "purchase", "status": "open"}):
        try:
            await _award_one(db, comp, order, user)
        except Exception:
            continue


async def _award_one(db, comp, order, user):
    if True:
        if not entry_open(comp):
            return
        cid = str(comp["_id"])
        need = float(comp.get("spend_requirement") or 0)
        pid = comp.get("required_product_id") or ""
        if pid and not any(str(i.get("product_id")) == pid for i in order.get("items") or []):
            return
        if comp.get("purchase_mode") == "accumulated":
            start = comp.get("start_date") or comp.get("created_at") or ""
            spent = 0.0
            async for o in db.orders.find({"user_id": user["id"], "created_at": {"$gte": start}, "status": {"$nin": list(CANCELLED)}}, {"total": 1}):
                spent += float(o.get("total") or 0)
            if spent < need:
                return
        elif float(order.get("total") or 0) < need:
            return
        mine = await db.competition_entries.count_documents({"competition_id": cid, "user_id": user["id"]})
        cap = 1 if comp.get("tickets_mode", "one") == "one" else max(1, int(comp.get("max_tickets_per_user") or 1))
        if mine >= cap:
            return
        await db.competition_entries.insert_one({
            "competition_id": cid, "user_id": user["id"], "user_name": user.get("name", ""), "user_phone": user.get("phone", ""),
            "entry_type": "purchase", "order_id": str(order.get("_id", "")), "created_at": now().isoformat()})
        if mine == 0:
            await db.competitions.update_one({"_id": comp["_id"]}, {"$inc": {"joined_count": 1}})
