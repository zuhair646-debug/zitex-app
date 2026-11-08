"""Seed a varied set of demo competitions (all types × store/chamber × every phase) for hands-on testing.
Idempotent: removes previous rows tagged seed_tag=demo_mix then recreates.  Run: python seed_demo_competitions.py"""
import asyncio
import os
import random
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
import competition_reveal  # noqa: E402

TAG = "demo_mix"
KSA = timezone(timedelta(hours=3))


def day(d):
    return (datetime.now(KSA) + timedelta(days=d)).strftime("%Y-%m-%d")


def at(hours):
    return (datetime.now(KSA) + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:00+03:00")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "techstore")]
    merchant = await db.users.find_one({"phone": "0509999999"}) or await db.users.find_one({"role": "merchant"})
    officer = await db.users.find_one({"phone": "0550000000"}) or await db.users.find_one({"role": "chamber"})
    mid, oid = str(merchant["_id"]), str(officer["_id"])
    old = [str(c["_id"]) async for c in db.competitions.find({"seed_tag": TAG}, {"_id": 1})]
    if old:
        await db.competition_entries.delete_many({"competition_id": {"$in": old}})
        await db.draw_sessions.delete_many({"competition_id": {"$in": old}})
        await db.social_posts.delete_many({"linked_competition_id": {"$in": old}})
        await db.competitions.delete_many({"seed_tag": TAG})
    users = await db.users.find({"role": "user"}, {"name": 1, "phone": 1}).limit(2000).to_list(2000)
    img = "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900"
    base = dict(status="open", joined_count=0, winners=[], draw_history=[], draw_video_url="", created_by_merchant=mid,
                created_at=datetime.now(timezone.utc).isoformat(), seed_tag=TAG, max_participants=100000, cover_image=img,
                prize_image=img, tickets_mode="one", max_tickets_per_user=1, purchase_mode="single", spend_requirement=0,
                presenter_name="متجر زينركس", options=[], question="", correct_answer="", reveal_at="")
    chamber = dict(chamber_supervised=True, assigned_chamber_employee_id=oid, permit_number="CC-2026-1180")
    store = dict(chamber_supervised=False, assigned_chamber_employee_id="", permit_number="")
    qa = dict(question="كم سعة البطارية في آيفون 16 برو ماكس تقريباً؟", options=["3500 mAh", "4685 mAh", "6000 mAh"], correct_answer="4685 mAh")
    specs = [
        # (title, type, mode, start, end, draw, reveal, entries, extra, phase)
        ("سحب الجمعة — مفتوحة الآن (المتجر)", "general", store, day(-2), day(2), day(2), at(52), 140, {}, "open"),
        ("سؤال وجواب: بطارية آيفون — مفتوحة (الغرفة)", "qa", chamber, day(-1), day(3), day(3), "", 85, qa, "open"),
        ("اشترِ بـ 500 ريال وادخل السحب — مفتوحة", "purchase", store, day(-3), day(5), day(5), "", 40, {"spend_requirement": 500, "tickets_mode": "per_order", "max_tickets_per_user": 5}, "open"),
        ("سجّل وادخل السحب — قريباً", "signup", store, day(2), day(9), day(9), "", 0, {}, "soon"),
        ("صوّر تجربتك — مسابقة فيديو (الإعجابات)", "ugc_video", store, day(-2), day(6), day(6), "", 0, {"ugc_hashtag": "#زينركس"}, "open"),
        ("سحب المتجر — جاهز للسحب، الإعلان بعد 3 ساعات", "signup", store, day(-6), day(-1), day(-1), at(3), 120, {}, "ready"),
        ("سحب الغرفة — جاهز للسحب، الإعلان بعد 5 ساعات", "general", chamber, day(-8), day(-1), day(-1), at(5), 300, {}, "ready"),
        ("سؤال وجواب (الغرفة) — جاهز للسحب، إعلان فوري", "qa", chamber, day(-7), day(-1), day(-1), "", 90, qa, "ready"),
        ("مسابقة رمضان — أُعلنت النتائج (المتجر)", "general", store, day(-30), day(-20), day(-20), "", 220, {"prize_count": 2}, "past"),
        ("مسابقة اليوم الوطني — أُعلنت النتائج (الغرفة)", "qa", chamber, day(-25), day(-15), day(-15), "", 160, qa, "past"),
    ]
    for title, ctype, mode, s, e, d, rv, n, extra, ph in specs:
        doc = {**base, **mode, "title": title, "competition_type": ctype, "start_date": s, "end_date": e, "draw_date": d,
               "reveal_at": rv, "prize": "آيفون 16 برو ماكس 256GB", "prize_count": 1,
               "description": "مسابقة تجريبية لاختبار آلية السحب والإعلان", **extra}
        r = await db.competitions.insert_one(doc)
        cid = str(r.inserted_id)
        picked = random.sample(users, min(n, len(users)))
        if picked:
            await db.competition_entries.insert_many([{"competition_id": cid, "user_id": str(u["_id"]), "user_name": u.get("name", ""),
                                                       "user_phone": u.get("phone", ""), "joined_at": datetime.now(timezone.utc).isoformat()} for u in picked])
            await db.competitions.update_one({"_id": r.inserted_id}, {"$set": {"joined_count": len(picked)}})
        await competition_reveal.create_competition_post(db, {**doc, "_id": r.inserted_id}, {"id": mid, "name": merchant.get("name", "Store")})
        if ph == "past":
            ts = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
            winners = [{"user_id": str(u["_id"]), "user_name": u.get("name", ""), "user_phone": u.get("phone", ""), "prize_status": "delivered", "won_at": ts}
                       for u in picked[: doc["prize_count"]]]
            await db.competitions.update_one({"_id": r.inserted_id}, {"$set": {"winners": winners, "status": "ended", "winners_finalized_at": ts, "revealed_at": ts}})
            await competition_reveal.publish_results(db, await db.competitions.find_one({"_id": r.inserted_id}), lambda *a, **k: asyncio.sleep(0))
        print(f"{ph:6} {ctype:9} {'chamber' if mode.get('chamber_supervised') else 'store':7} {n:4} {title}")


asyncio.run(main())
