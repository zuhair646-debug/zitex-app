# v1.40.0 — Support tickets, staff Kanban board, tasks, staff dashboards, social job/offer posts
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "customer": ("0500000000", "test1234"),
    "merchant": ("0509999999", "merchant2025"),
    "social": ("0530000006", "emp1234"),
    "services": ("0530000007", "emp1234"),
    "inventory": ("0530000008", "emp1234"),
    "support": ("0530000009", "emp1234"),
    "ops": ("0530000010", "emp1234"),
    "marketer": ("0530000002", "emp1234"),
    "cashier": ("0530000001", "emp1234"),
}
_cache = {}


def login(role):
    if role in _cache:
        return _cache[role]
    ph, pw = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"phone": ph, "password": pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {role}: {r.status_code} {r.text[:120]}")
    d = r.json()
    _cache[role] = (d["token"], d["user"])
    return _cache[role]


def H(role):
    return {"Authorization": f"Bearer {login(role)[0]}"}


CREATED = {"tickets": [], "tasks": [], "posts": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for pid in CREATED["posts"]:
        requests.delete(f"{API}/merchant/social/posts/{pid}", headers=H("merchant"))
    for tid in CREATED["tasks"]:
        requests.delete(f"{API}/merchant/tasks/{tid}", headers=H("merchant"))
    # tickets: close created test tickets (no delete endpoint)
    for tid in CREATED["tickets"]:
        requests.put(f"{API}/merchant/tickets/{tid}", json={"status": "resolved"}, headers=H("merchant"))


# ─── Customer tickets ───
class TestCustomerTickets:
    def test_create_get_reply_reopen(self):
        r = requests.post(f"{API}/support/tickets", headers=H("customer"), json={
            "subject": "TEST_ticket subject", "message": "TEST_ message body", "priority": "high",
            "attachments": ["uploads/test/a.jpg"]})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        CREATED["tickets"].append(tid)
        g = requests.get(f"{API}/support/tickets/{tid}", headers=H("customer")).json()
        assert g["status"] == "open" and g["priority"] == "high" and g["attachments"] == ["uploads/test/a.jpg"]
        assert "_id" not in g
        lst = requests.get(f"{API}/support/tickets", headers=H("customer")).json()
        assert any(t["id"] == tid for t in lst)
        # staff set resolved -> customer reply reopens
        u = requests.put(f"{API}/merchant/tickets/{tid}", headers=H("support"), json={"status": "resolved"})
        assert u.status_code == 200, u.text
        rp = requests.post(f"{API}/support/tickets/{tid}/reply", headers=H("customer"), json={"message": "TEST_ still broken"})
        assert rp.status_code == 200 and rp.json()["status"] == "open"
        g = requests.get(f"{API}/support/tickets/{tid}", headers=H("customer")).json()
        assert g["status"] == "open" and g["replies"][-1]["is_staff"] is False

    def test_invalid_priority_and_empty_reply(self):
        r = requests.post(f"{API}/support/tickets", headers=H("customer"), json={"subject": "TEST_x", "message": "TEST_y", "priority": "bogus"})
        assert r.status_code == 400
        lst = requests.get(f"{API}/support/tickets", headers=H("customer")).json()
        if lst:
            e = requests.post(f"{API}/support/tickets/{lst[0]['id']}/reply", headers=H("customer"), json={"message": "  "})
            assert e.status_code == 400

    def test_other_user_cannot_read_ticket(self):
        lst = requests.get(f"{API}/support/tickets", headers=H("customer")).json()
        assert lst
        r = requests.get(f"{API}/support/tickets/{lst[0]['id']}", headers=H("marketer"))
        assert r.status_code == 404


# ─── Staff ticket board ───
class TestTicketBoard:
    def test_board_support_agent(self):
        r = requests.get(f"{API}/merchant/tickets", headers=H("support"))
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d["counts"].keys()) == {"open", "in_progress", "waiting", "resolved"}
        assert all("_id" not in t for t in d["tickets"])
        mine = requests.get(f"{API}/merchant/tickets?mine=true", headers=H("support")).json()
        uid = login("support")[1]["id"]
        assert all(t["assignee_id"] == uid for t in mine["tickets"])

    @pytest.mark.parametrize("role,code", [("inventory", 403), ("customer", 403), ("social", 403), ("services", 200), ("ops", 200), ("merchant", 200)])
    def test_board_perms(self, role, code):
        r = requests.get(f"{API}/merchant/tickets", headers=H(role))
        assert r.status_code == code, f"{role}: {r.status_code} {r.text[:150]}"

    def test_staff_reply_assign_status(self):
        r = requests.post(f"{API}/support/tickets", headers=H("customer"), json={"subject": "TEST_board flow", "message": "TEST_ please help"})
        tid = r.json()["id"]
        CREATED["tickets"].append(tid)
        assert requests.post(f"{API}/merchant/tickets/{tid}/reply", headers=H("inventory"), json={"message": "x"}).status_code == 403
        rp = requests.post(f"{API}/merchant/tickets/{tid}/reply", headers=H("support"), json={"message": "TEST_ staff reply", "attachments": ["uploads/x.png"]})
        assert rp.status_code == 200 and rp.json()["status"] == "waiting"
        t = requests.get(f"{API}/merchant/tickets/{tid}", headers=H("support")).json()
        assert t["assignee_id"] == login("support")[1]["id"] and t["replies"][-1]["is_staff"] is True
        ops_id = login("ops")[1]["id"]
        u = requests.put(f"{API}/merchant/tickets/{tid}", headers=H("support"), json={"status": "in_progress", "priority": "urgent", "assignee_id": ops_id})
        assert u.status_code == 200, u.text
        t = requests.get(f"{API}/merchant/tickets/{tid}", headers=H("support")).json()
        assert t["status"] == "in_progress" and t["priority"] == "urgent" and t["assignee_id"] == ops_id and t["assignee_name"]
        assert requests.put(f"{API}/merchant/tickets/{tid}", headers=H("support"), json={"status": "nope"}).status_code == 400
        # assign to a non-staff (customer) id -> 400
        cust_id = login("customer")[1]["id"]
        assert requests.put(f"{API}/merchant/tickets/{tid}", headers=H("support"), json={"assignee_id": cust_id}).status_code == 400


# ─── Tasks ───
class TestTasks:
    def test_ops_create_and_assignee_scope(self):
        soc_id = login("social")[1]["id"]
        r = requests.post(f"{API}/merchant/tasks", headers=H("ops"), json={"title": "TEST_task one", "assignee_id": soc_id, "priority": "high"})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        CREATED["tasks"].append(tid)
        ops_list = requests.get(f"{API}/merchant/tasks", headers=H("ops")).json()
        assert ops_list["can_manage"] is True and any(t["id"] == tid for t in ops_list["tasks"])
        soc = requests.get(f"{API}/merchant/tasks", headers=H("social")).json()
        assert soc["can_manage"] is False and all(t["assignee_id"] == soc_id for t in soc["tasks"])
        assert any(t["id"] == tid for t in soc["tasks"])
        inv = requests.get(f"{API}/merchant/tasks", headers=H("inventory")).json()
        assert not any(t["id"] == tid for t in inv["tasks"])
        # assignee may only change status
        u = requests.put(f"{API}/merchant/tasks/{tid}", headers=H("social"), json={"status": "doing", "title": "HACKED", "priority": "low"})
        assert u.status_code == 200
        t = next(t for t in requests.get(f"{API}/merchant/tasks", headers=H("ops")).json()["tasks"] if t["id"] == tid)
        assert t["status"] == "doing" and t["title"] == "TEST_task one" and t["priority"] == "high"
        # non-assignee gets 404
        assert requests.put(f"{API}/merchant/tasks/{tid}", headers=H("inventory"), json={"status": "done"}).status_code == 404
        # comments
        c = requests.post(f"{API}/merchant/tasks/{tid}/comments", headers=H("social"), json={"message": "TEST_ comment"})
        assert c.status_code == 200
        t = next(t for t in requests.get(f"{API}/merchant/tasks", headers=H("ops")).json()["tasks"] if t["id"] == tid)
        assert t["comments"][-1]["message"] == "TEST_ comment"
        # non-manager cannot create/delete
        assert requests.post(f"{API}/merchant/tasks", headers=H("social"), json={"title": "TEST_no"}).status_code == 403
        assert requests.delete(f"{API}/merchant/tasks/{tid}", headers=H("social")).status_code == 403
        # done + delete
        assert requests.put(f"{API}/merchant/tasks/{tid}", headers=H("social"), json={"status": "done"}).status_code == 200
        assert requests.delete(f"{API}/merchant/tasks/{tid}", headers=H("ops")).status_code == 200
        assert not any(t["id"] == tid for t in requests.get(f"{API}/merchant/tasks", headers=H("ops")).json()["tasks"])

    def test_customer_tasks_forbidden(self):
        assert requests.get(f"{API}/merchant/tasks", headers=H("customer")).status_code == 403

    def test_invalid_task_status(self):
        assert requests.post(f"{API}/merchant/tasks", headers=H("ops"), json={"title": "TEST_bad", "status": "xx"}).status_code == 400


# ─── Staff directory & dashboard ───
class TestDashboards:
    def test_staff_directory(self):
        r = requests.get(f"{API}/merchant/staff-directory", headers=H("support"))
        assert r.status_code == 200 and len(r.json()) >= 5 and r.json()[0]["job_title"] == "المالك"
        assert requests.get(f"{API}/merchant/staff-directory", headers=H("customer")).status_code == 403

    @pytest.mark.parametrize("role,expected", [
        ("social", {"social", "competitions"}),
        ("inventory", {"inventory"}),
        ("services", {"services", "tickets"}),
        ("support", {"tickets", "orders"}),
        ("ops", {"tickets", "orders"}),
    ])
    def test_dashboard_widgets(self, role, expected):
        r = requests.get(f"{API}/employee/dashboard", headers=H(role))
        assert r.status_code == 200, r.text
        d = r.json()
        keys = {w["key"] for w in d["widgets"]}
        assert keys == expected, f"{role}: {keys}"
        assert d["job_title"] and set(d["my_tasks"].keys()) == {"todo", "doing", "review", "done"}

    def test_dashboard_merchant_and_customer(self):
        d = requests.get(f"{API}/employee/dashboard", headers=H("merchant")).json()
        assert len(d["widgets"]) >= 6 and d["can_manage_tasks"] is True
        assert requests.get(f"{API}/employee/dashboard", headers=H("customer")).status_code == 403


# ─── Social job/offer posts + applying ───
class TestSocialJobOffer:
    def test_job_post_validation_and_apply(self):
        bad = requests.post(f"{API}/merchant/social/posts", headers=H("social"), json={"type": "job", "text": "TEST_"})
        assert bad.status_code == 400
        r = requests.post(f"{API}/merchant/social/posts", headers=H("social"), json={
            "type": "job", "text": "TEST_ hiring", "job_title": "TEST_ Designer", "job_city": "Riyadh",
            "job_requirements": ["a", " "]})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        CREATED["posts"].append(pid)
        ap = requests.post(f"{API}/social/posts/{pid}/apply", headers=H("customer"), json={"name": "TEST_ Applicant", "phone": "0500000000", "note": "hi"})
        assert ap.status_code == 200, ap.text
        dup = requests.post(f"{API}/social/posts/{pid}/apply", headers=H("customer"), json={"name": "TEST_ Applicant", "phone": "0500000000"})
        assert dup.status_code == 400
        mine = requests.get(f"{API}/support/tickets", headers=H("customer")).json()
        jt = [t for t in mine if t.get("linked_post_id") == pid]
        assert jt and jt[0]["category"] == "job"
        CREATED["tickets"].append(jt[0]["id"])
        board = requests.get(f"{API}/merchant/tickets", headers=H("support")).json()
        assert any(t["id"] == jt[0]["id"] for t in board["tickets"])

    def test_offer_post_fields(self):
        r = requests.post(f"{API}/merchant/social/posts", headers=H("merchant"), json={
            "type": "offer", "text": "TEST_ offer", "offer_price": 99, "offer_old_price": 149, "cta_label": "Buy",
            "cta_link": "/search?q=x", "valid_until": "2026-12-31", "badge": "NEW"})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        CREATED["posts"].append(pid)
        feed = requests.get(f"{API}/social/posts", headers=H("customer"))
        assert feed.status_code == 200
        data = feed.json()
        posts = data if isinstance(data, list) else data.get("posts", data.get("items", []))
        p = next((x for x in posts if x.get("id") == pid), None)
        assert p, "offer post not in feed"
        assert p["offer_price"] == 99 and p["cta_label"] == "Buy" and p["badge"] == "NEW"

    def test_apply_non_job_post_404(self):
        if not CREATED["posts"]:
            pytest.skip("no post")
        r = requests.post(f"{API}/social/posts/{CREATED['posts'][-1]}/apply", headers=H("customer"), json={"name": "TEST_ A", "phone": "0500000000"})
        assert r.status_code == 404

    def test_social_specialist_comment_is_merchant_reply(self):
        if not CREATED["posts"]:
            pytest.skip("no post")
        pid = CREATED["posts"][0]
        r = requests.post(f"{API}/social/posts/{pid}/comments", headers=H("social"), json={"text": "TEST_ store reply"})
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        cs = requests.get(f"{API}/social/posts/{pid}/comments", headers=H("customer")).json()
        cs = cs if isinstance(cs, list) else cs.get("comments", [])
        c = next(c for c in cs if c.get("text") == "TEST_ store reply")
        assert c.get("is_merchant_reply") is True

    def test_non_social_employee_comment(self):
        if not CREATED["posts"]:
            pytest.skip("no post")
        r = requests.post(f"{API}/social/posts/{CREATED['posts'][0]}/comments", headers=H("inventory"), json={"text": "TEST_ inv comment"})
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"


class TestCompetitions:
    def test_diverse_competitions_present(self):
        r = requests.get(f"{API}/competitions", headers=H("customer"))
        assert r.status_code == 200
        d = r.json()
        items = d if isinstance(d, list) else d.get("competitions", d.get("items", []))
        titles = " | ".join((c.get("title") or "") for c in items)
        print("COMP TITLES:", titles)
        assert len(items) >= 4
