"""Support tickets (customer ↔ staff), internal Kanban tasks, per-specialist staff
dashboards, job applications from social hiring posts, and demo seeds for them."""
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

TICKET_STATUSES = ["open", "in_progress", "waiting", "resolved"]
TASK_STATUSES = ["todo", "doing", "review", "done"]
PRIORITIES = ["low", "normal", "high", "urgent"]
SEED_TAG = "staff_ops_v1"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _oid(x: str):
    if not ObjectId.is_valid(x):
        raise HTTPException(404, "Not found")
    return ObjectId(x)


def _ser(d):
    d["id"] = str(d.pop("_id"))
    return d


def _perms(user):
    if user.get("role") == "merchant":
        return {"all"}
    if user.get("role") == "employee":
        return set(user.get("permissions", []))
    return set()


def _has(user, *keys):
    p = _perms(user)
    return "all" in p or bool(p & set(keys))


def _merchant_id(user):
    return user.get("merchant_id") or user["id"]


class TicketCreate(BaseModel):
    subject: str = Field(..., min_length=2, max_length=160)
    message: str = Field(..., min_length=2, max_length=4000)
    category: str = "general"
    priority: str = "normal"
    attachments: List[str] = []


class TicketReply(BaseModel):
    message: str = Field("", max_length=4000)
    attachments: List[str] = []


class TicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None


class TaskInput(BaseModel):
    title: str = Field(..., min_length=2, max_length=160)
    description: str = ""
    assignee_id: str = ""
    priority: str = "normal"
    due_date: str = ""
    status: str = "todo"
    tags: List[str] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None


class JobApply(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=8, max_length=20)
    note: str = Field("", max_length=1000)
    attachments: List[str] = []


SPECIALISTS = [
    ("0530000006", "نورة أخصائية السوشال ميديا", "social_media", "أخصائية سوشال ميديا", ["social", "competitions", "banners"], "preset_social"),
    ("0530000007", "ماجد مسؤول الخدمات", "service", "مسؤول الخدمات والحجوزات", ["services", "tickets_reply"], "preset_services"),
    ("0530000008", "فهد أمين المخزون", "inventory", "أمين المخزون", ["inventory", "products"], "preset_inventory"),
    ("0530000009", "ريم موظفة الدعم الفني", "support", "موظفة الدعم الفني", ["support", "tickets_reply", "customers", "orders"], "preset_support"),
    ("0530000010", "عبدالله مشرف العمليات", "operations", "مشرف العمليات والمهام", ["tasks", "orders", "delivery", "tickets_reply"], "preset_ops"),
]


def build_router(db, get_current_user, hash_password, create_notification):
    r = APIRouter(prefix="/api")

    async def staff_list(mid):
        emps = await db.users.find({"role": "employee", "merchant_id": mid, "active": {"$ne": False}},
                                   {"name": 1, "job_title": 1, "permissions": 1}).to_list(300)
        return {str(e["_id"]): e for e in emps}

    async def name_of(uid, mid):
        if not uid:
            return ""
        if not ObjectId.is_valid(uid):
            raise HTTPException(400, "الموظف غير موجود / Employee not found")
        q = {"_id": _oid(uid)} if uid == mid else {"_id": _oid(uid), "merchant_id": mid}
        u = await db.users.find_one(q, {"name": 1})
        if not u:
            raise HTTPException(400, "الموظف غير موجود / Employee not found")
        return u.get("name", "")

    # ─── Customer tickets ───
    @r.get("/support/tickets")
    async def my_tickets(user=Depends(get_current_user)):
        ts = await db.support_tickets.find({"user_id": user["id"]}).sort("updated_at", -1).to_list(100)
        return [_ser(t) for t in ts]

    @r.get("/support/tickets/{tid}")
    async def my_ticket(tid: str, user=Depends(get_current_user)):
        t = await db.support_tickets.find_one({"_id": _oid(tid), "user_id": user["id"]})
        if not t:
            raise HTTPException(404, "Ticket not found")
        return _ser(t)

    @r.post("/support/tickets")
    async def create_ticket(data: TicketCreate, user=Depends(get_current_user)):
        if data.priority not in PRIORITIES:
            raise HTTPException(400, "Invalid priority")
        doc = {"user_id": user["id"], "user_name": user.get("name", ""), "user_phone": user.get("phone", ""),
               "subject": data.subject.strip(), "message": data.message.strip(), "category": data.category,
               "priority": data.priority, "status": "open", "attachments": data.attachments[:5],
               "assignee_id": "", "assignee_name": "", "replies": [], "source": "app",
               "created_at": _now(), "updated_at": _now()}
        res = await db.support_tickets.insert_one(doc)
        return {"id": str(res.inserted_id), "message": "Ticket created"}

    @r.post("/support/tickets/{tid}/reply")
    async def customer_reply(tid: str, data: TicketReply, user=Depends(get_current_user)):
        if not data.message.strip() and not data.attachments:
            raise HTTPException(400, "الرد فارغ")
        t = await db.support_tickets.find_one({"_id": _oid(tid), "user_id": user["id"]})
        if not t:
            raise HTTPException(404, "Ticket not found")
        rep = {"user_id": user["id"], "user_name": user.get("name", ""), "message": data.message.strip(),
               "attachments": data.attachments[:5], "is_staff": False, "created_at": _now()}
        status = "open" if t.get("status") in ("waiting", "resolved") else t.get("status", "open")
        await db.support_tickets.update_one({"_id": t["_id"]}, {"$push": {"replies": rep}, "$set": {"status": status, "updated_at": _now()}})
        if t.get("assignee_id"):
            await create_notification(t["assignee_id"], "رد جديد على تذكرة", t.get("subject", ""), {"type": "ticket", "ticket_id": tid})
        return {"message": "Reply sent", "status": status}

    # ─── Staff ticket board ───
    def need_tickets(user):
        if not _has(user, "support", "tickets_reply"):
            raise HTTPException(403, "يتطلب صلاحية: الرد على التذاكر")

    @r.get("/merchant/tickets")
    async def board_tickets(mine: bool = False, user=Depends(get_current_user)):
        need_tickets(user)
        q = {"assignee_id": user["id"]} if mine else {}
        ts = await db.support_tickets.find(q, {"replies": {"$slice": -1}}).sort("updated_at", -1).to_list(500)
        out = [_ser(t) for t in ts]
        counts = {s: sum(1 for t in out if t.get("status") == s) for s in TICKET_STATUSES}
        return {"tickets": out, "counts": counts, "statuses": TICKET_STATUSES}

    @r.get("/merchant/tickets/{tid}")
    async def board_ticket(tid: str, user=Depends(get_current_user)):
        need_tickets(user)
        t = await db.support_tickets.find_one({"_id": _oid(tid)})
        if not t:
            raise HTTPException(404, "Ticket not found")
        return _ser(t)

    @r.put("/merchant/tickets/{tid}")
    async def update_ticket(tid: str, data: TicketUpdate, user=Depends(get_current_user)):
        need_tickets(user)
        t = await db.support_tickets.find_one({"_id": _oid(tid)})
        if not t:
            raise HTTPException(404, "Ticket not found")
        upd = {"updated_at": _now()}
        if data.status is not None:
            if data.status not in TICKET_STATUSES:
                raise HTTPException(400, "Invalid status")
            upd["status"] = data.status
        if data.priority is not None:
            if data.priority not in PRIORITIES:
                raise HTTPException(400, "Invalid priority")
            upd["priority"] = data.priority
        if data.assignee_id is not None:
            upd["assignee_id"] = data.assignee_id
            upd["assignee_name"] = await name_of(data.assignee_id, _merchant_id(user))
            if data.assignee_id and data.assignee_id != user["id"]:
                await create_notification(data.assignee_id, "تذكرة مسندة إليك", t.get("subject", ""), {"type": "ticket", "ticket_id": tid})
        await db.support_tickets.update_one({"_id": t["_id"]}, {"$set": upd})
        if upd.get("status") == "resolved" and t.get("user_id"):
            await create_notification(t["user_id"], "تم حل تذكرتك ✅", t.get("subject", ""), {"type": "ticket", "ticket_id": tid})
        return {"message": "Updated", **{k: v for k, v in upd.items() if k != "updated_at"}}

    @r.post("/merchant/tickets/{tid}/reply")
    async def staff_reply(tid: str, data: TicketReply, user=Depends(get_current_user)):
        need_tickets(user)
        if not data.message.strip() and not data.attachments:
            raise HTTPException(400, "الرد فارغ")
        t = await db.support_tickets.find_one({"_id": _oid(tid)})
        if not t:
            raise HTTPException(404, "Ticket not found")
        rep = {"user_id": user["id"], "user_name": user.get("name", ""), "message": data.message.strip(),
               "attachments": data.attachments[:5], "is_staff": True, "created_at": _now()}
        upd = {"updated_at": _now(), "status": "waiting" if t.get("status") == "open" else t.get("status", "waiting")}
        if not t.get("assignee_id"):
            upd.update({"assignee_id": user["id"], "assignee_name": user.get("name", "")})
        await db.support_tickets.update_one({"_id": t["_id"]}, {"$push": {"replies": rep}, "$set": upd})
        if t.get("user_id"):
            await create_notification(t["user_id"], "رد من الدعم الفني", data.message[:120] or t.get("subject", ""), {"type": "ticket", "ticket_id": tid})
        return {"message": "Reply sent", "status": upd["status"]}

    @r.get("/merchant/staff-directory")
    async def staff_directory(user=Depends(get_current_user)):
        if not _has(user, "support", "tickets_reply", "tasks") and user.get("role") != "employee":
            raise HTTPException(403, "Staff only")
        mid = _merchant_id(user)
        emps = await staff_list(mid)
        owner = await db.users.find_one({"_id": ObjectId(mid)}, {"name": 1}) if ObjectId.is_valid(mid) else None
        out = [{"id": k, "name": v.get("name", ""), "job_title": v.get("job_title", "")} for k, v in emps.items()]
        if owner:
            out.insert(0, {"id": mid, "name": owner.get("name", ""), "job_title": "المالك"})
        return out

    # ─── Tasks Kanban ───
    def task_scope(user):
        mid = _merchant_id(user)
        if _has(user, "tasks"):
            return {"merchant_id": mid}
        if user.get("role") == "employee":
            return {"merchant_id": mid, "assignee_id": user["id"]}
        raise HTTPException(403, "Staff only")

    @r.get("/merchant/tasks")
    async def list_tasks(user=Depends(get_current_user)):
        q = task_scope(user)
        ts = [_ser(t) for t in await db.staff_tasks.find(q).sort("updated_at", -1).to_list(500)]
        counts = {s: sum(1 for t in ts if t.get("status") == s) for s in TASK_STATUSES}
        return {"tasks": ts, "counts": counts, "statuses": TASK_STATUSES, "can_manage": _has(user, "tasks")}

    @r.post("/merchant/tasks")
    async def create_task(data: TaskInput, user=Depends(get_current_user)):
        if not _has(user, "tasks"):
            raise HTTPException(403, "يتطلب صلاحية: المهام")
        if data.status not in TASK_STATUSES or data.priority not in PRIORITIES:
            raise HTTPException(400, "Invalid status/priority")
        mid = _merchant_id(user)
        doc = {**data.model_dump(), "merchant_id": mid, "assignee_name": await name_of(data.assignee_id, mid),
               "created_by": user["id"], "created_by_name": user.get("name", ""), "comments": [],
               "created_at": _now(), "updated_at": _now()}
        res = await db.staff_tasks.insert_one(doc)
        if data.assignee_id and data.assignee_id != user["id"]:
            await create_notification(data.assignee_id, "مهمة جديدة لك 📋", data.title, {"type": "task", "task_id": str(res.inserted_id)})
        return {"id": str(res.inserted_id), "message": "Task created"}

    @r.put("/merchant/tasks/{tid}")
    async def update_task(tid: str, data: TaskUpdate, user=Depends(get_current_user)):
        q = {**task_scope(user), "_id": _oid(tid)}
        t = await db.staff_tasks.find_one(q)
        if not t:
            raise HTTPException(404, "Task not found")
        upd = {k: v for k, v in data.model_dump().items() if v is not None}
        if not _has(user, "tasks"):
            upd = {k: v for k, v in upd.items() if k == "status"}  # assignees may only move their card
        if "status" in upd and upd["status"] not in TASK_STATUSES:
            raise HTTPException(400, "Invalid status")
        if "priority" in upd and upd["priority"] not in PRIORITIES:
            raise HTTPException(400, "Invalid priority")
        if "assignee_id" in upd:
            upd["assignee_name"] = await name_of(upd["assignee_id"], _merchant_id(user))
        upd["updated_at"] = _now()
        if upd.get("status") == "done":
            upd["completed_at"] = _now()
        await db.staff_tasks.update_one({"_id": t["_id"]}, {"$set": upd})
        if upd.get("status") == "done" and t.get("created_by") and t["created_by"] != user["id"]:
            await create_notification(t["created_by"], "تم إنجاز مهمة ✅", t.get("title", ""), {"type": "task", "task_id": tid})
        return {"message": "Updated"}

    @r.post("/merchant/tasks/{tid}/comments")
    async def comment_task(tid: str, data: TicketReply, user=Depends(get_current_user)):
        q = {**task_scope(user), "_id": _oid(tid)}
        if not data.message.strip():
            raise HTTPException(400, "التعليق فارغ")
        res = await db.staff_tasks.update_one(q, {"$push": {"comments": {"user_name": user.get("name", ""), "message": data.message.strip(), "created_at": _now()}}, "$set": {"updated_at": _now()}})
        if not res.matched_count:
            raise HTTPException(404, "Task not found")
        return {"message": "ok"}

    @r.delete("/merchant/tasks/{tid}")
    async def delete_task(tid: str, user=Depends(get_current_user)):
        if not _has(user, "tasks"):
            raise HTTPException(403, "يتطلب صلاحية: المهام")
        res = await db.staff_tasks.delete_one({"_id": _oid(tid), "merchant_id": _merchant_id(user)})
        if not res.deleted_count:
            raise HTTPException(404, "Task not found")
        return {"message": "Deleted"}

    # ─── Per-specialist staff dashboard ───
    @r.get("/employee/dashboard")
    async def staff_dashboard(user=Depends(get_current_user)):
        if user.get("role") not in ("employee", "merchant"):
            raise HTTPException(403, "Staff only")
        p = _perms(user)
        full = "all" in p
        week = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        widgets = []

        def w(key, title, icon, route, stats):
            widgets.append({"key": key, "title": title, "icon": icon, "route": route, "stats": stats})

        if full or "social" in p:
            w("social", "السوشال ميديا", "chatbubbles", "/merchant/social", [
                {"label": "منشورات هذا الأسبوع", "value": await db.social_posts.count_documents({"created_at": {"$gte": week}})},
                {"label": "تعليقات جديدة (7 أيام)", "value": await db.social_comments.count_documents({"created_at": {"$gte": week}, "is_merchant_reply": {"$ne": True}})},
                {"label": "بلاغات تحتاج مراجعة", "value": await db.social_posts.count_documents({"reports.0": {"$exists": True}}), "tone": "warning"},
                {"label": "طلبات توظيف", "value": await db.support_tickets.count_documents({"category": "job", "status": {"$ne": "resolved"}})},
            ])
        if full or "competitions" in p:
            w("competitions", "المسابقات", "trophy", "/merchant/competitions", [
                {"label": "مسابقات مفتوحة", "value": await db.competitions.count_documents({"status": "open"})},
                {"label": "إجمالي المشاركات", "value": await db.competition_entries.estimated_document_count()},
            ])
        if full or "services" in p:
            w("services", "الخدمات والحجوزات", "construct", "/merchant/service-bookings", [
                {"label": "حجوزات بانتظار التأكيد", "value": await db.service_bookings.count_documents({"status": "pending"}), "tone": "warning"},
                {"label": "حجوزات اليوم", "value": await db.service_bookings.count_documents({"created_at": {"$gte": today}})},
                {"label": "خدمات منشورة", "value": await db.services.count_documents({})},
            ])
        if full or "inventory" in p or "products" in p:
            w("inventory", "المخزون", "cube", "/merchant/inventory", [
                {"label": "نفد من المخزون", "value": await db.products.count_documents({"stock": {"$lte": 0}}), "tone": "error"},
                {"label": "مخزون منخفض (≤5)", "value": await db.products.count_documents({"stock": {"$gt": 0, "$lte": 5}}), "tone": "warning"},
                {"label": "إجمالي المنتجات", "value": await db.products.count_documents({})},
            ])
        if full or p & {"support", "tickets_reply"}:
            w("tickets", "تذاكر الدعم", "headset", "/merchant/tickets", [
                {"label": "تذاكر مفتوحة", "value": await db.support_tickets.count_documents({"status": "open"}), "tone": "warning"},
                {"label": "قيد المعالجة", "value": await db.support_tickets.count_documents({"status": "in_progress"})},
                {"label": "مسندة إليّ", "value": await db.support_tickets.count_documents({"assignee_id": user["id"], "status": {"$ne": "resolved"}})},
            ])
        if full or p & {"pos", "invoices"}:
            w("pos", "نقاط البيع والفواتير", "cart", "/merchant/pos", [
                {"label": "فواتير اليوم", "value": await db.invoices.count_documents({"created_at": {"$gte": today}})},
            ])
        if full or "orders" in p:
            w("orders", "الطلبات", "receipt", "/merchant/orders", [
                {"label": "طلبات قيد الانتظار", "value": await db.orders.count_documents({"status": "pending"}), "tone": "warning"},
                {"label": "قيد التجهيز", "value": await db.orders.count_documents({"status": "processing"})},
            ])
        if full or "marketing" in p:
            w("marketing", "التسويق", "megaphone", "/merchant/marketing", [
                {"label": "حملات نشطة", "value": await db.marketing_ads.count_documents({"active": True})},
            ])
        mine = {s: await db.staff_tasks.count_documents({"assignee_id": user["id"], "status": s}) for s in TASK_STATUSES}
        return {"name": user.get("name", ""), "job_title": user.get("job_title", "") or ("المالك" if full else ""),
                "permissions": sorted(p), "widgets": widgets, "my_tasks": mine,
                "can_manage_tasks": _has(user, "tasks"), "can_tickets": _has(user, "support", "tickets_reply")}

    # ─── Hiring posts → job applications (become 'job' tickets on the board) ───
    @r.post("/social/posts/{pid}/apply")
    async def apply_job(pid: str, data: JobApply, user=Depends(get_current_user)):
        post = await db.social_posts.find_one({"_id": _oid(pid), "type": "job"})
        if not post:
            raise HTTPException(404, "الوظيفة غير موجودة")
        if await db.support_tickets.find_one({"category": "job", "linked_post_id": pid, "user_id": user["id"]}):
            raise HTTPException(400, "قدّمت على هذه الوظيفة مسبقاً")
        doc = {"user_id": user["id"], "user_name": data.name, "user_phone": data.phone,
               "subject": f"طلب توظيف / Job application: {post.get('job_title', '')}", "message": data.note or "—",
               "category": "job", "priority": "normal", "status": "open", "attachments": data.attachments[:3],
               "assignee_id": "", "assignee_name": "", "replies": [], "source": "job_application",
               "linked_post_id": pid, "created_at": _now(), "updated_at": _now()}
        await db.support_tickets.insert_one(doc)
        await db.social_posts.update_one({"_id": post["_id"]}, {"$inc": {"applicants": 1}})
        return {"message": "تم استلام طلبك ✅ ستجده في تذاكري"}

    return r


async def seed(db, hash_password):
    merchant = await db.users.find_one({"phone": "0509999999"})
    if not merchant:
        return
    mid = str(merchant["_id"])
    for phone, name, dept, title, perms, role_id in SPECIALISTS:
        await db.users.update_one({"phone": phone}, {"$setOnInsert": {
            "phone": phone, "name": name, "password_hash": hash_password("emp1234"), "role": "employee",
            "merchant_id": mid, "department": dept, "permissions": perms, "job_title": title, "role_id": role_id,
            "salary_monthly": 6000, "salary_type": "monthly", "branch_ids": [], "active": True,
            "points": 0, "wallet_balance": 0, "created_at": _now()}}, upsert=True)
    staff = {u["phone"]: (str(u["_id"]), u["name"]) async for u in db.users.find({"phone": {"$in": [s[0] for s in SPECIALISTS] + ["0530000001", "0530000003"]}}, {"name": 1, "phone": 1})}
    sid = lambda ph: staff.get(ph, ("", ""))

    if not await db.staff_tasks.find_one({"seed_tag": SEED_TAG}):
        specs = [
            ("تصميم منشور عرض الجمعة البيضاء", "0530000006", "doing", "high", 1, ["سوشال"]),
            ("الرد على تعليقات منشور آيفون 16", "0530000006", "todo", "normal", 0, ["سوشال"]),
            ("جرد قسم الإكسسوارات — فرع الرياض", "0530000008", "todo", "high", 2, ["مخزون"]),
            ("طلب توريد سماعات AirPods (نفاد قريب)", "0530000008", "review", "urgent", 0, ["مخزون"]),
            ("تأكيد حجوزات صيانة الشاشات لهذا الأسبوع", "0530000007", "doing", "normal", 1, ["خدمات"]),
            ("متابعة تذاكر التأخير في التوصيل", "0530000009", "todo", "high", 0, ["دعم"]),
            ("مراجعة تقرير المبيعات اليومي", "0530000010", "done", "low", -1, ["عمليات"]),
            ("تدريب الكاشير الجديد على نظام POS", "0530000001", "todo", "normal", 3, ["مبيعات"]),
        ]
        await db.staff_tasks.insert_many([{
            "title": t, "description": "مهمة تجريبية لاختبار لوحة المهام", "assignee_id": sid(ph)[0], "assignee_name": sid(ph)[1],
            "status": st, "priority": pr, "due_date": (datetime.now(timezone.utc) + timedelta(days=d)).strftime("%Y-%m-%d"),
            "tags": tags, "merchant_id": mid, "created_by": mid, "created_by_name": merchant.get("name", ""), "comments": [],
            "seed_tag": SEED_TAG, "created_at": _now(), "updated_at": _now()} for t, ph, st, pr, d, tags in specs])

    if not await db.support_tickets.find_one({"seed_tag": SEED_TAG}):
        cust = await db.users.find_one({"phone": "0500000000"})
        if cust:
            cid, cname = str(cust["_id"]), cust.get("name", "")
            specs = [
                ("الطلب لم يصل بعد مرور 3 أيام", "orders", "urgent", "open", ""),
                ("الشاشة بعد الصيانة فيها خط", "services", "high", "in_progress", "0530000007"),
                ("استفسار عن ضمان لابتوب", "general", "normal", "waiting", "0530000009"),
                ("طلب استرجاع سماعة", "orders", "normal", "resolved", "0530000009"),
                ("كوبون الخصم لا يعمل", "payments", "low", "open", ""),
            ]
            await db.support_tickets.insert_many([{
                "user_id": cid, "user_name": cname, "user_phone": cust.get("phone", ""), "subject": s,
                "message": f"{s} — أرجو المساعدة", "category": c, "priority": p, "status": st, "attachments": [],
                "assignee_id": sid(a)[0] if a else "", "assignee_name": sid(a)[1] if a else "",
                "replies": [] if st == "open" else [{"user_id": sid(a)[0], "user_name": sid(a)[1] or "الدعم الفني", "message": "تم استلام طلبك ونعمل عليه الآن", "attachments": [], "is_staff": True, "created_at": _now()}],
                "source": "app", "seed_tag": SEED_TAG, "created_at": _now(), "updated_at": _now()} for s, c, p, st, a in specs])

    if not await db.social_posts.find_one({"seed_tag": SEED_TAG}):
        base = {"author": merchant.get("name", "Zenrex Store"), "author_id": mid, "likes": 0, "comments": 0, "views": 0, "seed_tag": SEED_TAG}
        posts = [
            {"type": "job", "job_title": "أخصائي/ة سوشال ميديا", "job_city": "الرياض", "job_type": "دوام كامل", "job_salary": "6,000 – 8,000 ر.س",
             "job_requirements": ["خبرة سنة في إدارة الحسابات", "إجادة التصوير والمونتاج", "مهارات كتابة إبداعية"],
             "text": "نبحث عن مبدع/ة ينضم لفريق زينركس ويدير حساباتنا على السوشال ميديا 🎯",
             "image": "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=900"},
            {"type": "job", "job_title": "فني صيانة جوالات", "job_city": "جدة", "job_type": "دوام كامل", "job_salary": "5,000 – 7,000 ر.س",
             "job_requirements": ["خبرة في صيانة الشاشات واللوحات", "شهادة فنية معتمدة"],
             "text": "مطلوب فني صيانة محترف لفرع جدة — رواتب مجزية وتأمين طبي 🔧",
             "image": "https://images.unsplash.com/photo-1597424216809-3ba9864aeb18?w=900"},
            {"type": "job", "job_title": "كابتن توصيل", "job_city": "الدمام", "job_type": "دوام جزئي", "job_salary": "عمولة لكل طلب",
             "job_requirements": ["رخصة قيادة سارية", "سيارة خاصة"], "text": "انضم لأسطول التوصيل واكسب دخل إضافي بمرونة 🚗"},
            {"type": "offer", "text": "خصم 20% على جميع سماعات آبل لمدة 48 ساعة فقط 🎧", "offer_price": 799, "offer_old_price": 999,
             "cta_label": "تسوّق الآن", "cta_link": "/search?q=AirPods", "valid_until": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d"),
             "image": "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=900"},
            {"type": "offer", "text": "وصل حديثاً: سامسونج جالكسي S25 Ultra — احجز نسختك مع هدية شاحن مجاني 📱", "offer_price": 4999, "offer_old_price": 0,
             "cta_label": "احجز الآن", "cta_link": "/search?q=Galaxy", "badge": "وصل حديثاً",
             "image": "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=900"},
            {"type": "offer", "text": "فحص مجاني للجهاز + خصم 30% على تبديل البطارية هذا الأسبوع 🔋", "offer_price": 139, "offer_old_price": 199,
             "cta_label": "احجز الخدمة", "cta_link": "/(tabs)/services", "badge": "عرض خدمات",
             "image": "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=900"},
            {"type": "poll", "text": "وش أهم شي عندك في الجوال الجديد؟", "poll_options": [{"text": "الكاميرا", "votes": 34}, {"text": "البطارية", "votes": 51}, {"text": "الأداء للألعاب", "votes": 22}]},
            {"type": "event", "text": "ورشة مجانية: كيف تصوّر بجوالك مثل المحترفين 📸", "event_date": (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%d 19:00"), "event_location": "فرع الرياض - العليا"},
        ]
        for i, p in enumerate(posts):
            p.setdefault("images", [p["image"]] if p.get("image") else [])
            await db.social_posts.insert_one({**base, **p, "created_at": (datetime.now(timezone.utc) - timedelta(minutes=10 * i)).isoformat()})
