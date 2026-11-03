"""
Chamber-supervised competition draws — provably-fair draw sessions + draw video composer.

Fairness (commit → reveal):
  1. prepare: participants are frozen (snapshot, ordered by entry time) and hashed (participants_hash).
     A secret 256-bit seed is generated; only sha256(seed) (seed_hash) is published before the draw.
  2. pick:    the k-th winner index = int(HMAC_SHA256(seed, f"{participants_hash}:{k}"), 16) % len(pool),
              pool = snapshot minus already-picked winners (snapshot order). Nobody — merchant, officer or
              server operator — can choose the outcome after the commitment is shown on camera.
  3. finish:  the seed is revealed. Anyone can recompute sha256(seed) == seed_hash and every pick.

Redraw: a winner who is unreachable for 30 days (Ministry of Commerce rule) can be replaced by a
documented redraw session (reason + video), drawn from participants who never won.
"""
import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import subprocess
import tempfile
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

import draw_video
import competition_rules
import httpx
from object_storage import _get, _put, APP_NAME

log = logging.getLogger("chamber_draws")
REDRAW_AFTER_DAYS = 30
MAX_BATCH = 4
MAX_REDRAWS_PER_PRIZE = 2
# drand "quicknet" — League of Entropy public randomness beacon (new value every 3s, nobody can predict it)
DRAND = "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public"
ALGORITHM = ("final_seed = sha256(server_seed + ':' + officer_code + ':' + drand_randomness[round]); "
             "winner_k = int(HMAC_SHA256(key=final_seed, msg=participants_hash + ':' + k), 16) mod remaining_tickets; "
             "pool = frozen ticket list (entry order) minus all tickets of earlier winners. sha256(server_seed) is shown before "
             "the officer types the code on camera and before the drand round exists (drand.love, quicknet).")


def now():
    return datetime.now(timezone.utc)


def mask_phone(p):
    p = str(p or "")
    return (p[:3] + "****" + p[-2:]) if len(p) > 5 else ""


def sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def pick_index(seed: str, participants_hash: str, k: int, pool_len: int) -> int:
    h = hmac.new(seed.encode(), f"{participants_hash}:{k}".encode(), hashlib.sha256).hexdigest()
    return int(h, 16) % pool_len


def replay_picks(seed, participants_hash, snapshot, count, start_k=1, exclude=()):
    """Deterministic picks: a winner removes all of their tickets from the pool (one prize per person)."""
    gone = set(exclude)
    out = []
    for k in range(start_k, start_k + count):
        pool = [p for p in snapshot if p["user_id"] not in gone]
        if not pool:
            break
        w = pool[pick_index(seed, participants_hash, k, len(pool))]
        gone.add(w["user_id"])
        out.append(w)
    return out


def final_seed_of(seed, code, randomness):
    return sha(f"{seed}:{code}:{randomness}")


async def drand_latest():
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get(f"{DRAND}/latest")
            r.raise_for_status()
            j = r.json()
            return {"round": int(j["round"]), "randomness": j["randomness"]}
    except Exception:
        return None


def chain(audit, ev, data):
    """Append-only, hash-linked audit trail: editing any past step breaks every later hash."""
    prev = audit[-1]["h"] if audit else "0" * 64
    item = {"ev": ev, "at": now().isoformat(), "data": data, "prev": prev}
    item["h"] = sha(prev + json.dumps({k: item[k] for k in ("ev", "at", "data")}, ensure_ascii=False, sort_keys=True))
    return item


class SessionInput(BaseModel):
    kind: str = Field("initial", pattern="^(initial|redraw)$")
    replace_user_id: str = ""
    reason: str = ""


class StartInput(BaseModel):
    officer_code: str = Field(pattern="^[0-9]{6}$")


class PickInput(BaseModel):
    count: int = Field(1, ge=1, le=MAX_BATCH)


class VideoInput(BaseModel):
    face_path: str
    intro_ms: int = Field(ge=0)
    duration_ms: int = Field(gt=0, le=15 * 60 * 1000)
    events: list = []      # [{pick_from, pick_to, t_ms}]
    finish_ms: int = 0


class AssignInput(BaseModel):
    officer_id: str
    permit_number: str = ""
    reason: str = ""


def build_router(db, get_current_user, require_merchant, create_notification):
    router = APIRouter(prefix="/api/draws")
    _tasks: set = set()

    async def load_comp(cid):
        comp = await db.competitions.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
        if not comp:
            raise HTTPException(404, "المسابقة غير موجودة")
        return comp

    def can_draw(user, comp) -> bool:
        role = user.get("role")
        if role == "merchant":
            return True
        if role == "employee":
            return bool({"all", "competitions"} & set(user.get("permissions", [])))
        if role == "chamber":
            return comp.get("assigned_chamber_employee_id") == user["id"]
        return False

    def require_draw(user, comp):
        if not can_draw(user, comp):
            raise HTTPException(403, "هذه المسابقة غير مسندة لك")

    def redraw_info(comp, w=None):
        """30-day clock per winner (a redraw only restarts the clock of the replacement winner)."""
        fin = (w or {}).get("won_at") or comp.get("winners_finalized_at")
        if not fin:
            return None
        return datetime.fromisoformat(fin) + timedelta(days=REDRAW_AFTER_DAYS)

    def public_session(s, include_seed=None, names=False):
        done = s.get("status") == "finished"
        extra = {"names": [p["name"] for p in s.get("snapshot", [])[:400]]} if names else {}
        return {**extra,
            "id": str(s["_id"]), "competition_id": s["competition_id"], "kind": s.get("kind"),
            "status": s.get("status"), "reason": s.get("reason", ""), "slots": s.get("slots"),
            "participants_hash": s.get("participants_hash"),
            "seed_hash": s.get("seed_hash"), "seed": s.get("seed") if (done or include_seed) else None,
            "picks": [{k: p[k] for k in ("k", "n", "name", "phone", "user_id")} for p in s.get("picks", [])],
            "replaced": s.get("replaced"), "drawn_by": s.get("drawn_by"), "drawn_by_role": s.get("drawn_by_role"),
            "officer_name": s.get("officer_name", ""), "permit_number": s.get("permit_number", ""),
            "created_at": s.get("created_at"), "finished_at": s.get("finished_at"),
            "video_status": s.get("video_status", "none"), "video_path": s.get("video_path"),
            "video_error": s.get("video_error"), "started": bool(s.get("final_seed")),
            "officer_code": s.get("officer_code") if done else None, "beacon": s.get("beacon") if done else None,
            "beacon_commit_round": s.get("beacon_commit_round"), "tickets": len(s.get("snapshot", [])),
            "participants_count": len({p["user_id"] for p in s.get("snapshot", [])}),
            "final_seed": s.get("final_seed") if done else None, "audit_head": (s.get("audit") or [{}])[-1].get("h"),
        }

    async def officer_name(oid):
        if not oid or not ObjectId.is_valid(oid):
            return ""
        u = await db.users.find_one({"_id": ObjectId(oid)}, {"name": 1})
        return (u or {}).get("name", "")

    # ─── lists ───
    @router.get("/competitions")
    async def my_competitions(user=Depends(get_current_user)):
        """Merchant/staff: every competition. Chamber officer: only the ones assigned to them."""
        role = user.get("role")
        if role == "chamber":
            q = {"assigned_chamber_employee_id": user["id"]}
        else:
            require_merchant(user)
            q = {}
        comps = await db.competitions.find(q).sort("created_at", -1).to_list(200)
        out = []
        for c in comps:
            cid = str(c["_id"])
            n = await db.competition_entries.count_documents({"competition_id": cid})
            sessions = await db.draw_sessions.count_documents({"competition_id": cid, "status": "finished"})
            avail = redraw_info(c)
            out.append({
                "id": cid, "title": c.get("title", ""), "prize": c.get("prize", ""), "image": c.get("image", ""),
                "status": c.get("status", ""), "end_date": c.get("end_date", ""), "prize_count": c.get("prize_count", 1),
                "competition_type": c.get("competition_type", ""), "participants": n, "draws": sessions,
                "chamber_supervised": bool(c.get("chamber_supervised")), "permit_number": c.get("permit_number", ""),
                "officer_id": c.get("assigned_chamber_employee_id", ""), "officer_name": await officer_name(c.get("assigned_chamber_employee_id")),
                "winners": [{"user_id": w.get("user_id"), "user_name": w.get("user_name"), "user_phone": mask_phone(w.get("user_phone")),
                             "prize_status": w.get("prize_status", "pending")} for w in c.get("winners") or []],
                "redraw_available_at": avail.isoformat() if avail else None,
                "has_entries": n > 0, "open_draw_session": bool(c.get("open_draw_session")),
                "officer_request": c.get("officer_request"), "officer_log": (c.get("officer_log") or [])[-20:],
                **competition_rules.public_flags(c),
            })
        return out

    @router.get("/hub")
    async def merchant_hub(user=Depends(get_current_user)):
        require_merchant(user)
        comps = await my_competitions(user)
        officers = await db.users.find({"role": "chamber"}, {"password_hash": 0}).to_list(200)
        res = []
        for o in officers:
            oid = str(o["_id"])
            res.append({"id": oid, "name": o.get("name", ""), "phone": o.get("phone", ""), "email": o.get("email", ""),
                        "competitions": [c["title"] for c in comps if c["officer_id"] == oid]})
        return {"competitions": comps, "officers": res}

    @router.post("/{cid}/assign")
    async def assign_officer(cid: str, data: AssignInput, user=Depends(get_current_user)):
        """Officer / permit changes. Before any entry: free. After entries: reason required, every change is logged,
        a new officer must ACCEPT before taking over, and nothing changes while a draw is running.
        The officer & permit used in each draw are frozen inside that draw session (the proof never changes)."""
        require_merchant(user)
        comp = await load_comp(cid)
        new_oid, permit, reason = data.officer_id.strip(), data.permit_number.strip(), data.reason.strip()
        cur_oid, cur_permit = comp.get("assigned_chamber_employee_id") or "", comp.get("permit_number") or ""
        if comp.get("open_draw_session"):
            raise HTTPException(409, "يوجد سحب جارٍ الآن — التعديل متاح بعد انتهائه")
        new_o = None
        if new_oid:
            new_o = await db.users.find_one({"_id": ObjectId(new_oid), "role": "chamber"}) if ObjectId.is_valid(new_oid) else None
            if not new_o:
                raise HTTPException(404, "موظف الغرفة غير موجود")
        has_entries = bool(await db.competition_entries.count_documents({"competition_id": cid}, limit=1))
        officer_changed, permit_changed = new_oid != cur_oid, bool(permit) and permit != cur_permit
        if not officer_changed and not permit_changed:
            return {"ok": True, "changed": False}
        log_base = {"at": now().isoformat(), "by": user.get("name", ""), "reason": reason,
                    "from_officer": await officer_name(cur_oid), "to_officer": (new_o or {}).get("name", ""),
                    "permit_old": cur_permit, "permit_new": permit or cur_permit}
        # Free setup: nobody entered yet, or the very first assignment
        if not has_entries or (not cur_oid and not comp.get("winners_finalized_at")):
            upd = {"chamber_supervised": bool(new_oid), "assigned_chamber_employee_id": new_oid}
            if permit:
                upd["permit_number"] = permit
            await db.competitions.update_one({"_id": comp["_id"]}, {"$set": upd, "$unset": {"officer_request": ""},
                                                                    "$push": {"officer_log": {**log_base, "action": "assign"}}})
            if new_oid and officer_changed:
                await create_notification(new_oid, "مسابقة جديدة تحت إشرافك", f"أُسندت إليك مسابقة «{comp.get('title', '')}»", {"type": "chamber_assign", "competition_id": cid})
            return {"ok": True, "changed": True}
        if len(reason) < 5:
            raise HTTPException(422, "اكتب سبب التعديل (5 أحرف على الأقل) — يُحفظ في سجل المسابقة")
        if officer_changed and not new_oid:
            raise HTTPException(409, "لا يمكن إلغاء إشراف الغرفة بعد بدء المشاركات — يمكنك استبدال الموظف بآخر")
        if not officer_changed:  # permit correction only → immediate, logged, officer notified (pending request follows it)
            upd = {"permit_number": permit, **({"officer_request.permit_number": permit} if comp.get("officer_request") else {})}
            await db.competitions.update_one({"_id": comp["_id"]}, {"$set": upd,
                                                                    "$push": {"officer_log": {**log_base, "action": "permit_change"}}})
            if cur_oid:
                await create_notification(cur_oid, "تعديل رقم التصريح", f"«{comp.get('title', '')}»: {cur_permit or '—'} ← {permit} • {reason}", {"type": "chamber_permit", "competition_id": cid})
            return {"ok": True, "changed": True}
        # New officer → pending until they accept (a previous pending request is withdrawn and its officer told)
        old_req = comp.get("officer_request")
        if old_req and old_req.get("to_officer_id") == new_oid and old_req.get("permit_number") == (permit or cur_permit):
            return {"ok": True, "pending": True}
        if old_req:
            await db.competitions.update_one({"_id": comp["_id"]}, {"$push": {"officer_log": {
                "at": now().isoformat(), "by": user.get("name", ""), "action": "cancelled", "to_officer": old_req.get("to_officer", ""), "reason": old_req.get("reason", "")}}})
            if old_req.get("to_officer_id") != new_oid:
                await create_notification(old_req["to_officer_id"], "أُلغي طلب الإشراف", f"ألغى التاجر طلب إشرافك على «{comp.get('title', '')}»", {"type": "chamber_request", "competition_id": cid})
        req = {"to_officer_id": new_oid, "to_officer": new_o.get("name", ""), "from_officer_id": cur_oid,
               "permit_number": permit or cur_permit, "reason": reason, "requested_by": user["id"],
               "requested_by_name": user.get("name", ""), "requested_at": now().isoformat()}
        await db.competitions.update_one({"_id": comp["_id"]}, {"$set": {"officer_request": req},
                                                                "$push": {"officer_log": {**log_base, "action": "request"}}})
        await create_notification(new_oid, "طلب إشراف على مسابقة", f"«{comp.get('title', '')}» — السبب: {reason}. افتح لوحة الغرفة للقبول أو الرفض", {"type": "chamber_request", "competition_id": cid})
        if cur_oid:
            await create_notification(cur_oid, "طلب نقل الإشراف", f"طلب التاجر نقل إشراف «{comp.get('title', '')}» إلى {new_o.get('name', '')} — {reason}", {"type": "chamber_request", "competition_id": cid})
        return {"ok": True, "pending": True}

    @router.post("/{cid}/officer-request/cancel")
    async def cancel_officer_request(cid: str, user=Depends(get_current_user)):
        require_merchant(user)
        comp = await load_comp(cid)
        req = comp.get("officer_request")
        if not req:
            raise HTTPException(404, "لا يوجد طلب معلّق")
        await db.competitions.update_one({"_id": comp["_id"]}, {"$unset": {"officer_request": ""}, "$push": {"officer_log": {
            "at": now().isoformat(), "by": user.get("name", ""), "action": "cancelled", "to_officer": req.get("to_officer", ""), "reason": req.get("reason", "")}}})
        await create_notification(req["to_officer_id"], "أُلغي طلب الإشراف", f"ألغى التاجر طلب إشرافك على «{comp.get('title', '')}»", {"type": "chamber_request", "competition_id": cid})
        return {"ok": True}

    @router.get("/officer-requests")
    async def my_officer_requests(user=Depends(get_current_user)):
        if user.get("role") != "chamber":
            raise HTTPException(403)
        out = []
        async for c in db.competitions.find({"officer_request.to_officer_id": user["id"]}, {"title": 1, "prize": 1, "officer_request": 1, "assigned_chamber_employee_id": 1}):
            r = c["officer_request"]
            out.append({"competition_id": str(c["_id"]), "title": c.get("title", ""), "prize": c.get("prize", ""),
                        "from_officer": await officer_name(r.get("from_officer_id")), "permit_number": r.get("permit_number", ""),
                        "reason": r.get("reason", ""), "requested_by": r.get("requested_by_name", ""), "requested_at": r.get("requested_at", ""),
                        "participants": await db.competition_entries.count_documents({"competition_id": str(c["_id"])})})
        return out

    @router.post("/{cid}/officer-request/{decision}")
    async def decide_officer_request(cid: str, decision: str, user=Depends(get_current_user)):
        if user.get("role") != "chamber" or decision not in ("accept", "reject"):
            raise HTTPException(403)
        comp = await load_comp(cid)
        req = comp.get("officer_request")
        if not req or req.get("to_officer_id") != user["id"]:
            raise HTTPException(404, "لا يوجد طلب موجّه لك")
        if comp.get("open_draw_session"):
            raise HTTPException(409, "يوجد سحب جارٍ الآن — حاول بعد انتهائه")
        log = {"at": now().isoformat(), "by": user.get("name", ""), "action": "accepted" if decision == "accept" else "rejected",
               "from_officer": await officer_name(req.get("from_officer_id")), "to_officer": user.get("name", ""),
               "permit_old": comp.get("permit_number", ""), "permit_new": req.get("permit_number", ""), "reason": req.get("reason", "")}
        upd = {"$unset": {"officer_request": ""}, "$push": {"officer_log": log}}
        if decision == "accept":
            upd["$set"] = {"assigned_chamber_employee_id": user["id"], "chamber_supervised": True, "permit_number": req.get("permit_number", "")}
        r = await db.competitions.update_one({"_id": comp["_id"], "officer_request.to_officer_id": user["id"]}, upd)
        if not r.modified_count:
            raise HTTPException(409, "تمت معالجة الطلب مسبقاً")
        msg = f"«{comp.get('title', '')}»: {'قبل' if decision == 'accept' else 'رفض'} {user.get('name', '')} الإشراف"
        await create_notification(req["requested_by"], "رد موظف الغرفة", msg, {"type": "chamber_request", "competition_id": cid})
        if decision == "accept" and req.get("from_officer_id"):
            await create_notification(req["from_officer_id"], "انتقل الإشراف", msg, {"type": "chamber_request", "competition_id": cid})
        return {"ok": True}

    @router.get("/{cid}/studio")
    async def studio(cid: str, user=Depends(get_current_user)):
        comp = await load_comp(cid)
        require_draw(user, comp)
        n = await db.competition_entries.count_documents({"competition_id": cid})
        active = await db.draw_sessions.find_one({"competition_id": cid, "status": {"$in": ["prepared", "drawing"]}})
        done = await db.draw_sessions.find({"competition_id": cid, "status": "finished"}).sort("finished_at", -1).to_list(50)
        avail = redraw_info(comp)
        return {
            "competition": {"id": cid, "title": comp.get("title", ""), "prize": comp.get("prize", ""),
                            "prize_count": comp.get("prize_count", 1), "permit_number": comp.get("permit_number", ""),
                            "chamber_supervised": bool(comp.get("chamber_supervised")), "status": comp.get("status", ""),
                            "officer_name": await officer_name(comp.get("assigned_chamber_employee_id"))},
            "participants": n,
            "winners": [{"user_id": w.get("user_id"), "user_name": w.get("user_name"), "user_phone": mask_phone(w.get("user_phone")),
                         "prize_status": w.get("prize_status", "pending"), "rank": i + 1,
                         "redraw_available_at": (redraw_info(comp, w) or now()).isoformat(),
                         "redraw_open": bool(redraw_info(comp, w) and now() >= redraw_info(comp, w))}
                        for i, w in enumerate(comp.get("winners") or [])],
            "initial_done": bool(comp.get("winners_finalized_at")),
            "redraw_available_at": avail.isoformat() if avail else None,
            "redraw_open": bool(avail and now() >= avail),
            "active_session": public_session(active) if active else None,
            "sessions": [public_session(s) for s in done],
        }

    # ─── session lifecycle ───
    @router.post("/{cid}/sessions")
    async def prepare(cid: str, data: SessionInput, user=Depends(get_current_user)):
        comp = await load_comp(cid)
        require_draw(user, comp)
        active = await db.draw_sessions.find_one({"competition_id": cid, "status": {"$in": ["prepared", "drawing"]}})
        if active:  # resume the open session (same commitment) instead of re-rolling
            return public_session(active, names=True)
        winners = comp.get("winners") or []
        past = {w.get("user_id") for w in winners} | set(comp.get("forfeited_user_ids") or [])
        replaced = None
        if data.kind == "initial":
            if comp.get("winners_finalized_at"):
                raise HTTPException(409, "تم السحب على هذه المسابقة مسبقاً — استخدم السحب البديل")
            if comp.get("competition_type") == "ugc_video":
                raise HTTPException(400, "مسابقة الفيديو يُحدد فائزها بعدد الإعجابات وليس بالسحب")
            if not comp.get("is_test"):
                competition_rules.require_draw_window(comp)
            slots = int(comp.get("prize_count", 1) or 1)
        else:
            if not comp.get("winners_finalized_at"):
                raise HTTPException(400, "لا يوجد سحب أساسي بعد")
            w = next((w for w in winners if w.get("user_id") == data.replace_user_id), None)
            if not w:
                raise HTTPException(404, "الفائز غير موجود")
            avail = redraw_info(comp, w)
            if now() < avail:
                raise HTTPException(400, f"السحب البديل متاح بعد {REDRAW_AFTER_DAYS} يوماً من إعلان الفائز ({avail.date().isoformat()})")
            if w.get("prize_status") in ("claimed", "delivered"):
                raise HTTPException(400, "الفائز استلم أو طلب الجائزة — لا يمكن استبداله")
            if int(w.get("redraws", 0)) >= MAX_REDRAWS_PER_PRIZE:
                raise HTTPException(400, f"الحد الأقصى {MAX_REDRAWS_PER_PRIZE} سحب بديل لكل جائزة")
            if comp.get("chamber_supervised") and user.get("role") != "chamber":
                raise HTTPException(403, "السحب البديل لمسابقة تحت إشراف الغرفة يتم بواسطة موظف الغرفة فقط")
            if len(data.reason.strip()) < 5:
                raise HTTPException(400, "اكتب سبب السحب البديل")
            slots = 1
            replaced = {"user_id": w.get("user_id"), "name": w.get("user_name", ""), "phone": mask_phone(w.get("user_phone"))}
        if data.kind == "redraw":  # same frozen pool as the original draw — late joiners never enter
            orig = await db.draw_sessions.find_one({"competition_id": cid, "kind": "initial", "status": "finished"})
            base = (orig or {}).get("snapshot") or []
            entries = [{"user_id": p["user_id"], "user_name": p["name"], "user_phone": p.get("full_phone", "")} for p in base]
        else:
            entries = await db.competition_entries.find({"competition_id": cid}).sort([("created_at", 1), ("_id", 1)]).to_list(200000)
        excluded = {comp.get("assigned_chamber_employee_id"), comp.get("created_by_merchant")}
        oids = list({ObjectId(e["user_id"]) for e in entries if ObjectId.is_valid(e.get("user_id", ""))})
        for i in range(0, len(oids), 5000):  # staff can never win
            async for u in db.users.find({"_id": {"$in": oids[i:i + 5000]}, "role": {"$in": list(competition_rules.STAFF_ROLES)}}, {"_id": 1}):
                excluded.add(str(u["_id"]))
        bad_orders = set()
        order_ids = [ObjectId(e["order_id"]) for e in entries if ObjectId.is_valid(e.get("order_id", ""))]
        for i in range(0, len(order_ids), 5000):  # refunded / cancelled purchases lose their ticket
            async for o in db.orders.find({"_id": {"$in": order_ids[i:i + 5000]}, "status": {"$in": list(competition_rules.CANCELLED)}}, {"_id": 1}):
                bad_orders.add(str(o["_id"]))
        per_order = comp.get("competition_type") == "purchase" and comp.get("tickets_mode") == "per_order" and data.kind == "initial"
        seen, snap = set(), []
        for e in entries:
            uid = e.get("user_id")
            if not uid or uid in past or uid in excluded or e.get("order_id") in bad_orders or (uid in seen and not per_order):
                continue
            seen.add(uid)
            snap.append({"n": len(snap) + 1, "user_id": uid, "name": e.get("user_name", "") or "مشارك",
                         "phone": mask_phone(e.get("user_phone")), "full_phone": e.get("user_phone", "")})
        if not snap:
            raise HTTPException(400, "لا يوجد مشاركون مؤهلون للسحب")
        slots = min(slots, len(seen))
        seed = secrets.token_hex(32)
        p_hash = sha(json.dumps([p["user_id"] for p in snap]))
        doc = {"competition_id": cid, "kind": data.kind, "reason": data.reason.strip(), "replaced": replaced,
               "status": "prepared", "slots": slots, "snapshot": snap, "participants_hash": p_hash,
               "seed": seed, "seed_hash": sha(seed), "picks": [], "drawn_by": user.get("name", ""),
               "drawn_by_id": user["id"], "drawn_by_role": user.get("role"), "created_at": now().isoformat(),
               # witness frozen in the proof — later officer/permit changes never alter a past draw
               "officer_id": comp.get("assigned_chamber_employee_id", ""), "officer_name": await officer_name(comp.get("assigned_chamber_employee_id")),
               "permit_number": comp.get("permit_number", "")}
        beacon = await drand_latest()
        doc["beacon_commit_round"] = beacon["round"] if beacon else None
        doc["audit"] = [chain([], "prepare", {"seed_hash": doc["seed_hash"], "participants_hash": p_hash, "tickets": len(snap),
                                               "slots": slots, "beacon_commit_round": doc["beacon_commit_round"], "by": user.get("name", "")})]
        doc["_id"] = ObjectId()
        lock = await db.competitions.update_one({"_id": ObjectId(cid), "open_draw_session": {"$in": [None, ""]}},
                                                {"$set": {"open_draw_session": str(doc["_id"])}})
        if not lock.modified_count:  # another prepare won the race → everyone uses that one commitment
            other = await db.draw_sessions.find_one({"competition_id": cid, "status": {"$in": ["prepared", "drawing"]}})
            for _ in range(10):
                if other:
                    break
                await asyncio.sleep(0.2)
                other = await db.draw_sessions.find_one({"competition_id": cid, "status": {"$in": ["prepared", "drawing"]}})
            if not other:
                raise HTTPException(409, "جلسة سحب أخرى قيد التجهيز — أعد المحاولة")
            return public_session(other, names=True)
        await db.draw_sessions.insert_one(doc)
        if data.kind == "initial":
            await db.competitions.update_one({"_id": ObjectId(cid)}, {"$set": {"status": "closed"}})
        return public_session(doc, names=True)

    @router.post("/sessions/{sid}/start")
    async def start(sid: str, data: StartInput, user=Depends(get_current_user)):
        """Officer types a 6-digit code on camera; mixed with the server seed and a drand round that did not
        exist when the commitment was published → nobody (incl. the server) could know the result in advance."""
        s = await load_session(sid, user)
        if s.get("final_seed"):
            return public_session(s, names=True)
        beacon = await drand_latest()
        commit = s.get("beacon_commit_round")
        for _ in range(4):
            if not beacon or not commit or beacon["round"] > commit:
                break
            await asyncio.sleep(3.2)
            beacon = await drand_latest()
        if not beacon or not commit or beacon["round"] <= commit:
            raise HTTPException(503, "تعذر جلب العشوائية العامة (drand) — أعد المحاولة بعد ثوانٍ")
        fs = final_seed_of(s["seed"], data.officer_code, beacon["randomness"] if beacon else "")
        item = chain(s.get("audit") or [], "start", {"beacon_round": beacon["round"] if beacon else None, "by": user.get("name", "")})
        r = await db.draw_sessions.update_one({"_id": s["_id"], "final_seed": {"$exists": False}},
                                              {"$set": {"final_seed": fs, "officer_code": data.officer_code, "beacon": beacon,
                                                        "started_at": now().isoformat()}, "$push": {"audit": item}})
        return public_session(await db.draw_sessions.find_one({"_id": s["_id"]}), names=True)

    async def load_session(sid, user):
        s = await db.draw_sessions.find_one({"_id": ObjectId(sid)}) if ObjectId.is_valid(sid) else None
        if not s:
            raise HTTPException(404, "جلسة السحب غير موجودة")
        require_draw(user, await load_comp(s["competition_id"]))
        return s

    @router.get("/sessions/{sid}")
    async def get_session(sid: str, user=Depends(get_current_user)):
        return public_session(await load_session(sid, user), names=True)

    @router.post("/sessions/{sid}/pick")
    async def pick(sid: str, data: PickInput, user=Depends(get_current_user)):
        s = await load_session(sid, user)
        if s["status"] not in ("prepared", "drawing"):
            raise HTTPException(409, "انتهت جلسة السحب")
        if not s.get("final_seed"):
            raise HTTPException(400, "أدخل رمز الموظف أولاً لبدء السحب")
        remaining = s["slots"] - len(s["picks"])
        count = min(data.count, remaining)
        if count <= 0:
            raise HTTPException(409, "تم سحب جميع الفائزين")
        got = replay_picks(s["final_seed"], s["participants_hash"], s["snapshot"], count, len(s["picks"]) + 1,
                           {p["user_id"] for p in s["picks"]})
        new = [{**w, "k": len(s["picks"]) + i + 1, "at": now().isoformat()} for i, w in enumerate(got)]
        item = chain(s.get("audit") or [], "pick", {"k": [w["k"] for w in new], "n": [w["n"] for w in new]})
        r = await db.draw_sessions.update_one({"_id": s["_id"], "picks": {"$size": len(s["picks"])}},
                                              {"$push": {"picks": {"$each": new}, "audit": item}, "$set": {"status": "drawing"}})
        if not r.modified_count:
            raise HTTPException(409, "سحب آخر جارٍ — أعد المحاولة")
        return {"winners": [{k: w[k] for k in ("k", "n", "name", "phone", "user_id")} for w in new],
                "remaining": remaining - len(new)}

    @router.post("/sessions/{sid}/finish")
    async def finish(sid: str, user=Depends(get_current_user)):
        s = await load_session(sid, user)
        if s["status"] == "finished":
            return public_session(s, names=True)
        if len(s["picks"]) < s["slots"]:
            raise HTTPException(400, "لم يكتمل سحب كل الفائزين")
        ts = now().isoformat()
        claim = await db.draw_sessions.update_one({"_id": s["_id"], "status": {"$ne": "finished"}},
                                                  {"$set": {"status": "finished", "finished_at": ts},
                                                   "$push": {"audit": chain(s.get("audit") or [], "finish", {"seed": s["seed"], "final_seed": s.get("final_seed")})}})
        if not claim.modified_count:  # a parallel finish already published this session
            return public_session(await db.draw_sessions.find_one({"_id": s["_id"]}), names=True)
        cid, comp = s["competition_id"], await load_comp(s["competition_id"])
        new_w = [{"user_id": p["user_id"], "user_name": p["name"], "user_phone": p["full_phone"], "prize_status": "pending",
                  "draw_session_id": sid, "won_at": ts} for p in s["picks"]]
        rec = {"competition_id": cid, "draw_number": len(comp.get("draw_history", [])) + 1, "kind": s["kind"],
               "session_id": sid, "winners": [{k: w[k] for k in ("user_id", "user_name")} for w in new_w],
               "drawn_at": ts, "drawn_by": s.get("drawn_by"), "drawn_by_role": s.get("drawn_by_role"),
               "seed_hash": s["seed_hash"], "reason": s.get("reason", "")}
        if s["kind"] == "initial":
            upd = {"$set": {"winners": new_w, "status": "ended", "winners_finalized_at": ts}, "$push": {"draw_history": rec}}
        else:
            old = s["replaced"]["user_id"]
            winners = [{**new_w[0], "redraws": int(w.get("redraws", 0)) + 1} if w.get("user_id") == old else w for w in comp.get("winners") or []]
            upd = {"$set": {"winners": winners}, "$push": {"draw_history": rec},
                   "$addToSet": {"forfeited_user_ids": old}}
        upd.setdefault("$unset", {})["open_draw_session"] = ""
        await db.competitions.update_one({"_id": ObjectId(cid), "open_draw_session": sid}, upd)
        for w in new_w:
            try:
                await create_notification(w["user_id"], "🏆 مبروك! فزت في السحب",
                                          f"{comp.get('title', '')} — {comp.get('prize', '')}", {"competition_id": cid})
            except Exception:
                pass
        s.update(status="finished", finished_at=ts)
        return public_session(s, names=True)

    # ─── draw video ───
    @router.post("/sessions/{sid}/video")
    async def compose(sid: str, data: VideoInput, user=Depends(get_current_user)):
        s = await load_session(sid, user)
        if s["status"] != "finished":
            raise HTTPException(400, "أنهِ السحب أولاً")
        if s.get("video_status") == "processing" and s.get("video_started_at", "") > (now() - timedelta(minutes=20)).isoformat():
            return {"video_status": "processing"}
        comp = await load_comp(s["competition_id"])
        await db.draw_sessions.update_one({"_id": s["_id"]}, {"$set": {"video_status": "processing", "video_error": None, "video_started_at": now().isoformat(),
                                                                     "face_path": data.face_path, "video_input": data.model_dump()}})
        t = asyncio.create_task(_compose_task(s, comp, data))
        _tasks.add(t)
        t.add_done_callback(_tasks.discard)
        return {"video_status": "processing"}

    @router.post("/sessions/{sid}/video/retry")
    async def retry_video(sid: str, user=Depends(get_current_user)):
        s = await load_session(sid, user)
        if not s.get("video_input"):
            raise HTTPException(400, "لا يوجد تسجيل محفوظ لإعادة التجهيز")
        if s.get("video_status") == "processing" and s.get("video_started_at", "") > (now() - timedelta(minutes=20)).isoformat():
            return {"video_status": "processing"}
        return await compose(sid, VideoInput(**s["video_input"]), user)

    async def _compose_task(s, comp, data: VideoInput):
        sid = str(s["_id"])
        try:
            face, _ = await run_in_threadpool(_get, data.face_path)
            out = await run_in_threadpool(draw_video.render, face, s, comp, data.model_dump())
            path = f"{APP_NAME}/draws/{sid}.mp4"
            await run_in_threadpool(_put, path, out, "video/mp4")
            await db.draw_sessions.update_one({"_id": s["_id"]}, {"$set": {"video_status": "ready", "video_path": path}})
            await db.competitions.update_one({"_id": ObjectId(s["competition_id"])}, {
                "$set": {"draw_video_url": f"/api/draws/sessions/{sid}/video.mp4"},
                "$push": {"draw_videos": {"session_id": sid, "kind": s["kind"], "path": path, "created_at": now().isoformat()}}})
        except Exception as e:  # keep the error visible to the officer so they can retry
            log.exception("draw video compose failed")
            await db.draw_sessions.update_one({"_id": s["_id"]}, {"$set": {"video_status": "failed", "video_error": str(e)[:300]}})

    # ─── public (customers / anyone) ───
    @router.get("/sessions/{sid}/video.mp4")
    async def public_video(sid: str):
        s = await db.draw_sessions.find_one({"_id": ObjectId(sid)}, {"video_path": 1}) if ObjectId.is_valid(sid) else None
        if not s or not s.get("video_path"):
            raise HTTPException(404, "الفيديو غير متوفر")
        data, ct = await run_in_threadpool(_get, s["video_path"])
        return Response(content=data, media_type="video/mp4", headers={"Cache-Control": "public, max-age=86400"})

    @router.get("/public/{cid}")
    async def public_draws(cid: str):
        ss = await db.draw_sessions.find({"competition_id": cid, "status": "finished"}).sort("finished_at", 1).to_list(50)
        return [public_session(s) for s in ss]

    @router.get("/sessions/{sid}/verify")
    async def verify(sid: str, full: int = 0):
        s = await db.draw_sessions.find_one({"_id": ObjectId(sid)}) if ObjectId.is_valid(sid) else None
        if not s or s.get("status") != "finished":
            raise HTTPException(404, "السحب غير مكتمل")
        snap = s["snapshot"]
        p_ok = sha(json.dumps([p["user_id"] for p in snap])) == s["participants_hash"]
        seed_ok = sha(s["seed"]) == s["seed_hash"]
        b = s.get("beacon") or {}
        final_ok = final_seed_of(s["seed"], s.get("officer_code", ""), b.get("randomness", "")) == s.get("final_seed")
        beacon_ok = bool(b) and bool(s.get("beacon_commit_round")) and b.get("round", 0) > s["beacon_commit_round"]
        replay = replay_picks(s.get("final_seed") or "", s["participants_hash"], snap, len(s["picks"]))
        picks_ok = [p["user_id"] for p in replay] == [p["user_id"] for p in s["picks"]]
        aud, prev, chain_ok = s.get("audit") or [], "0" * 64, True
        for a in aud:
            chain_ok &= a["prev"] == prev and a["h"] == sha(prev + json.dumps({k: a[k] for k in ("ev", "at", "data")}, ensure_ascii=False, sort_keys=True))
            prev = a["h"]
        seed_ok = seed_ok and final_ok
        return {**public_session(s), "algorithm": ALGORITHM, "verified": bool(p_ok and seed_ok and picks_ok and chain_ok),
                "checks": {"participants_hash": p_ok, "seed_hash": seed_ok, "winners_replay": picks_ok,
                           "public_beacon": beacon_ok, "audit_chain": bool(chain_ok and aud)},
                "audit": [{k: a[k] for k in ("ev", "at", "h")} for a in aud],
                "participants": [{"n": p["n"], "user_id": p["user_id"], "name": p["name"], "phone": p["phone"]} for p in snap] if full else [],
                "participants_download": f"/api/draws/sessions/{sid}/verify?full=1"}

    return router
