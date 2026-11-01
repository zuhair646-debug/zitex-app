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
from object_storage import _get, _put, APP_NAME

log = logging.getLogger("chamber_draws")
REDRAW_AFTER_DAYS = 30
MAX_BATCH = 4
ALGORITHM = ("winner_k = int(HMAC_SHA256(key=seed, msg=participants_hash + ':' + k), 16) mod remaining_pool_size; "
             "pool = frozen participant list (entry order) minus earlier winners; seed published as sha256 before the draw "
             "and revealed after it.")


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


def replay_picks(seed, participants_hash, snapshot, count):
    """Recompute `count` winners from a revealed seed — used for public verification."""
    pool = list(snapshot)
    out = []
    for k in range(1, count + 1):
        if not pool:
            break
        out.append(pool.pop(pick_index(seed, participants_hash, k, len(pool))))
    return out


class SessionInput(BaseModel):
    kind: str = Field("initial", pattern="^(initial|redraw)$")
    replace_user_id: str = ""
    reason: str = ""


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
            "participants_count": len(s.get("snapshot", [])), "participants_hash": s.get("participants_hash"),
            "seed_hash": s.get("seed_hash"), "seed": s.get("seed") if (done or include_seed) else None,
            "picks": [{k: p[k] for k in ("k", "n", "name", "phone", "user_id")} for p in s.get("picks", [])],
            "replaced": s.get("replaced"), "drawn_by": s.get("drawn_by"), "drawn_by_role": s.get("drawn_by_role"),
            "created_at": s.get("created_at"), "finished_at": s.get("finished_at"),
            "video_status": s.get("video_status", "none"), "video_path": s.get("video_path"),
            "video_error": s.get("video_error"),
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
        require_merchant(user)
        await load_comp(cid)
        upd = {"chamber_supervised": bool(data.officer_id), "assigned_chamber_employee_id": data.officer_id}
        if data.officer_id:
            o = await db.users.find_one({"_id": ObjectId(data.officer_id), "role": "chamber"}) if ObjectId.is_valid(data.officer_id) else None
            if not o:
                raise HTTPException(404, "موظف الغرفة غير موجود")
        if data.permit_number.strip():
            upd["permit_number"] = data.permit_number.strip()
        await db.competitions.update_one({"_id": ObjectId(cid)}, {"$set": upd})
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
            if len(data.reason.strip()) < 5:
                raise HTTPException(400, "اكتب سبب السحب البديل")
            slots = 1
            replaced = {"user_id": w.get("user_id"), "name": w.get("user_name", ""), "phone": mask_phone(w.get("user_phone"))}
        entries = await db.competition_entries.find({"competition_id": cid}).sort([("created_at", 1), ("_id", 1)]).to_list(100000)
        seen, snap = set(), []
        for e in entries:  # one ticket per customer, previous winners excluded
            uid = e.get("user_id")
            if not uid or uid in seen or uid in past:
                continue
            seen.add(uid)
            snap.append({"n": len(snap) + 1, "user_id": uid, "name": e.get("user_name", "") or "مشارك",
                         "phone": mask_phone(e.get("user_phone")), "full_phone": e.get("user_phone", "")})
        if not snap:
            raise HTTPException(400, "لا يوجد مشاركون مؤهلون للسحب")
        slots = min(slots, len(snap))
        seed = secrets.token_hex(32)
        p_hash = sha(json.dumps([p["user_id"] for p in snap]))
        doc = {"competition_id": cid, "kind": data.kind, "reason": data.reason.strip(), "replaced": replaced,
               "status": "prepared", "slots": slots, "snapshot": snap, "participants_hash": p_hash,
               "seed": seed, "seed_hash": sha(seed), "picks": [], "drawn_by": user.get("name", ""),
               "drawn_by_id": user["id"], "drawn_by_role": user.get("role"), "created_at": now().isoformat()}
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
        return public_session(doc, names=True)

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
        picked = {p["user_id"] for p in s["picks"]}
        remaining = s["slots"] - len(s["picks"])
        count = min(data.count, remaining)
        if count <= 0:
            raise HTTPException(409, "تم سحب جميع الفائزين")
        pool = [p for p in s["snapshot"] if p["user_id"] not in picked]
        new = []
        for _ in range(count):
            k = len(s["picks"]) + len(new) + 1
            w = pool.pop(pick_index(s["seed"], s["participants_hash"], k, len(pool)))
            new.append({**w, "k": k, "at": now().isoformat()})
        r = await db.draw_sessions.update_one({"_id": s["_id"], "picks": {"$size": len(s["picks"])}},
                                              {"$push": {"picks": {"$each": new}}, "$set": {"status": "drawing"}})
        if not r.modified_count:
            raise HTTPException(409, "سحب آخر جارٍ — أعد المحاولة")
        return {"winners": [{k: w[k] for k in ("k", "n", "name", "phone", "user_id")} for w in new],
                "remaining": remaining - count, "pool_size": len(pool) + count}

    @router.post("/sessions/{sid}/finish")
    async def finish(sid: str, user=Depends(get_current_user)):
        s = await load_session(sid, user)
        if s["status"] == "finished":
            return public_session(s, names=True)
        if len(s["picks"]) < s["slots"]:
            raise HTTPException(400, "لم يكتمل سحب كل الفائزين")
        ts = now().isoformat()
        claim = await db.draw_sessions.update_one({"_id": s["_id"], "status": {"$ne": "finished"}},
                                                  {"$set": {"status": "finished", "finished_at": ts}})
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
            winners = [new_w[0] if w.get("user_id") == old else w for w in comp.get("winners") or []]
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
    async def verify(sid: str):
        s = await db.draw_sessions.find_one({"_id": ObjectId(sid)}) if ObjectId.is_valid(sid) else None
        if not s or s.get("status") != "finished":
            raise HTTPException(404, "السحب غير مكتمل")
        snap = s["snapshot"]
        p_ok = sha(json.dumps([p["user_id"] for p in snap])) == s["participants_hash"]
        seed_ok = sha(s["seed"]) == s["seed_hash"]
        replay = replay_picks(s["seed"], s["participants_hash"], snap, len(s["picks"]))
        picks_ok = [p["user_id"] for p in replay] == [p["user_id"] for p in s["picks"]]
        return {**public_session(s), "algorithm": ALGORITHM, "verified": bool(p_ok and seed_ok and picks_ok),
                "checks": {"participants_hash": p_ok, "seed_hash": seed_ok, "winners_replay": picks_ok},
                "participants": [{"n": p["n"], "user_id": p["user_id"], "name": p["name"], "phone": p["phone"]} for p in snap]}

    return router
