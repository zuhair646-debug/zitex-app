"""Scheduled reveal, two-copy publishing (social post + competitions section) and voiding a draw before reveal.

Rules
- reveal_at (optional, ISO): the draw may run early; customers see no winners / video / proof until reveal_at.
  Empty → results are revealed the moment the draw is finished.
- Every competition gets a social feed post on publish; at reveal a results post (winners + draw video) is added.
- Before reveal a finished draw can be voided and redone:
  · Chamber-supervised → one party (officer or merchant owner) requests, the OTHER party approves.
  · Store draw → the merchant owner voids with a reason.
  Voided sessions stay in the audit trail. After reveal only the 30-day replacement policy applies.
"""
import asyncio
import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

import competition_rules

log = logging.getLogger("competition_reveal")


def now():
    return datetime.now(timezone.utc)


def hidden(comp) -> bool:
    """Drawn but the announced reveal time has not been reached yet."""
    return bool(comp.get("winners_finalized_at") and comp.get("reveal_at") and not comp.get("revealed_at"))


def mask_public(out: dict) -> dict:
    if hidden(out):
        out.update(winners=[], draw_video_url="", draw_history=[], draw_videos=[], winners_finalized_at=None,
                   result_hidden=True, phase="hidden")
    return out


def store_label(comp) -> str:
    return comp.get("presenter_name") or "المتجر"


async def is_staff(request: Request, get_current_user, comp=None) -> bool:
    try:
        u = await get_current_user(request)
    except HTTPException:
        return False
    if u.get("role") == "merchant":
        return True
    if u.get("role") == "employee":
        return bool({"all", "competitions"} & set(u.get("permissions", [])))
    return u.get("role") == "chamber" and (comp is None or comp.get("assigned_chamber_employee_id") == u["id"])


def validate_reveal(d: dict, comp: dict | None = None):
    v = (d.get("reveal_at") or "").strip()
    if not v:
        return
    at = competition_rules._ts(v)
    if not at:
        raise HTTPException(422, "صيغة وقت الإعلان غير صحيحة (YYYY-MM-DDTHH:MM)")
    opens = competition_rules.draw_opens_at({**(comp or {}), **d})
    if opens and at < opens:
        raise HTTPException(422, "وقت إعلان النتائج لازم يكون بعد انتهاء المشاركة وموعد السحب")
    if comp and comp.get("winners_finalized_at") and v != (comp.get("reveal_at") or ""):
        raise HTTPException(409, "تم السحب — لا يمكن تغيير وقت الإعلان")


async def create_competition_post(db, comp: dict, author: dict):
    """Copy #1 in the social feed (copy #2 is the card in the Competitions section)."""
    ptype = {"qa": "سؤال وجواب", "purchase": "مسابقة شراء", "ugc_video": "مسابقة فيديو", "signup": "مسابقة تسجيل"}.get(comp.get("competition_type"), "مسابقة")
    by = "بإشراف الغرفة التجارية" if comp.get("chamber_supervised") else f"سحب {store_label(comp)}"
    doc = {"author": author.get("name", "Store"), "author_id": author["id"], "type": "competition",
           "text": f"🏆 {comp.get('title', '')}\n🎁 {comp.get('prize', '')}\n{comp.get('description', '')}".strip(),
           "image": comp.get("cover_image") or comp.get("prize_image") or "",
           "images": [x for x in (comp.get("cover_image"), comp.get("prize_image")) if x],
           "video": "", "badge": f"{ptype} • {by}", "linked_competition_id": str(comp["_id"]),
           "question": comp.get("question", "") if comp.get("competition_type") == "qa" else "",
           "options": (comp.get("options") or []) if comp.get("competition_type") == "qa" else [],
           "ends_at": comp.get("end_date", ""),
           "likes": 0, "comments": 0, "views": 0, "created_at": now().isoformat()}
    r = await db.social_posts.insert_one(doc)
    await db.competitions.update_one({"_id": comp["_id"]}, {"$set": {"social_post_id": str(r.inserted_id)}})


async def publish_results(db, comp: dict, create_notification):
    """Runs once per competition (caller claimed revealed_at atomically)."""
    cid = str(comp["_id"])
    names = "، ".join(w.get("user_name", "") for w in comp.get("winners") or [])
    by = f"بإشراف الغرفة التجارية • تصريح {comp.get('permit_number') or '—'}" if comp.get("chamber_supervised") else f"سحب {store_label(comp)}"
    doc = {"author": store_label(comp), "author_id": comp.get("created_by_merchant", ""), "type": "competition_result",
           "text": f"🎉 نتائج «{comp.get('title', '')}»\n🏆 الفائزون: {names}\n🎁 {comp.get('prize', '')}",
           "image": comp.get("prize_image") or comp.get("cover_image") or "", "images": [],
           "video": comp.get("draw_video_url") or "", "badge": f"نتيجة السحب • {by}", "linked_competition_id": cid,
           "likes": 0, "comments": 0, "views": 0, "created_at": now().isoformat()}
    r = await db.social_posts.insert_one(doc)
    await db.competitions.update_one({"_id": comp["_id"]}, {"$set": {"results_post_id": str(r.inserted_id)}})
    for w in comp.get("winners") or []:
        try:
            await create_notification(w["user_id"], "🏆 مبروك! فزت في السحب", f"{comp.get('title', '')} — {comp.get('prize', '')}", {"competition_id": cid})
        except Exception:
            pass


async def on_finished(db, cid: str, create_notification):
    """Called by the draw finish: reveal now (no reveal_at / already passed) or keep hidden for the loop."""
    comp = await db.competitions.find_one({"_id": ObjectId(cid)})
    if not comp:
        return
    at = competition_rules._ts(comp.get("reveal_at"))
    if at and now() < at:
        return
    claimed = await db.competitions.find_one_and_update({"_id": comp["_id"], "revealed_at": {"$exists": False}},
                                                        {"$set": {"revealed_at": now().isoformat()}})
    if claimed:
        await publish_results(db, await db.competitions.find_one({"_id": comp["_id"]}), create_notification)


async def on_video_ready(db, cid: str, url: str):
    """Video finished after the reveal → put it on the results post too."""
    c = await db.competitions.find_one({"_id": ObjectId(cid)}, {"results_post_id": 1})
    if c and c.get("results_post_id"):
        await db.social_posts.update_one({"_id": ObjectId(c["results_post_id"])}, {"$set": {"video": url}})


async def reveal_loop(db, create_notification):
    while True:
        try:
            iso = now().isoformat()
            async for c in db.competitions.find({"winners_finalized_at": {"$nin": [None, ""]}, "reveal_at": {"$nin": [None, ""]},
                                                 "revealed_at": {"$exists": False}}, {"reveal_at": 1}):
                at = competition_rules._ts(c.get("reveal_at"))
                if at and at <= now():  # compare datetimes (reveal_at may be KSA +03:00 / naive) — not ISO strings
                    claimed = await db.competitions.find_one_and_update(
                        {"_id": c["_id"], "revealed_at": {"$exists": False}, "winners_finalized_at": {"$nin": [None, ""]}},
                        {"$set": {"revealed_at": iso}})
                    if claimed:
                        await publish_results(db, await db.competitions.find_one({"_id": c["_id"]}), create_notification)
        except Exception:
            log.exception("reveal loop")
        await asyncio.sleep(20)


class VoidInput(BaseModel):
    reason: str = ""


def build_router(db, get_current_user, create_notification):
    r = APIRouter(prefix="/api/draws")

    async def load(cid):
        c = await db.competitions.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
        if not c:
            raise HTTPException(404, "Competition not found")
        return c

    def party(user, comp):
        if user.get("role") == "merchant":
            return "merchant"
        if user.get("role") == "chamber" and comp.get("assigned_chamber_employee_id") == user["id"]:
            return "chamber"
        raise HTTPException(403, "إلغاء السحب لصاحب المتجر أو موظف الغرفة المشرف فقط")

    async def execute_void(comp, reason, by_names):
        cid = str(comp["_id"])
        res = await db.competitions.update_one(
            {"_id": comp["_id"], "revealed_at": {"$exists": False}, "winners_finalized_at": {"$nin": [None, ""]}, "open_draw_session": {"$exists": False}},
            {"$set": {"winners": [], "draw_video_url": "", "draw_videos": [], "status": "closed"},
             "$unset": {"winners_finalized_at": "", "void_request": "", "forfeited_user_ids": ""},
             "$push": {"draw_history": {"kind": "void", "reason": reason, "approved_by": by_names, "at": now().isoformat()}}})
        if not res.modified_count:
            raise HTTPException(409, "لا يمكن الإلغاء: النتيجة أُعلنت أو يوجد سحب جارٍ")
        await db.draw_sessions.update_many({"competition_id": cid, "status": "finished", "voided": {"$ne": True}},
                                           {"$set": {"voided": True, "voided_at": now().isoformat(), "void_reason": reason}})

    @r.post("/{cid}/void")
    async def request_void(cid: str, data: VoidInput, user=Depends(get_current_user)):
        comp = await load(cid)
        me = party(user, comp)
        reason = data.reason.strip()
        if len(reason) < 5:
            raise HTTPException(422, "اكتب سبب إلغاء السحب (5 أحرف على الأقل)")
        if not hidden(comp):
            raise HTTPException(409, "الإلغاء متاح فقط قبل وقت إعلان النتائج — بعد الإعلان استخدم السحب البديل")
        if not comp.get("chamber_supervised"):
            if me != "merchant":
                raise HTTPException(403)
            await execute_void(comp, reason, [user.get("name", "")])
            return {"ok": True, "voided": True}
        vr = comp.get("void_request")
        if vr and vr.get("by_party") != me:  # the other party already asked → this is the approval
            await execute_void(comp, vr["reason"], [vr.get("by_name", ""), user.get("name", "")])
            return {"ok": True, "voided": True}
        await db.competitions.update_one({"_id": comp["_id"]}, {"$set": {"void_request": {
            "by_party": me, "by_id": user["id"], "by_name": user.get("name", ""), "reason": reason, "at": now().isoformat()}}})
        other = comp.get("assigned_chamber_employee_id") if me == "merchant" else comp.get("created_by_merchant")
        if other:
            await create_notification(other, "طلب إلغاء سحب وإعادته", f"«{comp.get('title', '')}» — {reason}. يحتاج موافقتك قبل وقت الإعلان", {"type": "void_request", "competition_id": cid})
        return {"ok": True, "pending": True}

    @r.post("/{cid}/void/{decision}")
    async def decide_void(cid: str, decision: str, user=Depends(get_current_user)):
        comp = await load(cid)
        me = party(user, comp)
        vr = comp.get("void_request")
        if not vr:
            raise HTTPException(404, "لا يوجد طلب إلغاء")
        if decision == "approve":
            if vr.get("by_party") == me:
                raise HTTPException(403, "الموافقة من الطرف الآخر فقط")
            await execute_void(comp, vr["reason"], [vr.get("by_name", ""), user.get("name", "")])
            return {"ok": True, "voided": True}
        if decision in ("reject", "cancel"):
            await db.competitions.update_one({"_id": comp["_id"]}, {"$unset": {"void_request": ""}, "$push": {"draw_history": {
                "kind": "void_" + decision, "reason": vr.get("reason", ""), "approved_by": [user.get("name", "")], "at": now().isoformat()}}})
            return {"ok": True}
        raise HTTPException(400)

    return r
