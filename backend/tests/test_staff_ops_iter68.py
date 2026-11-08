# Iteration 68 — fix verification for v1.40.0 (store-name authorship, employee social replies, invalid assignee 400)
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
CREDS = {
    "customer": ("0500000000", "test1234"),
    "merchant": ("0509999999", "merchant2025"),
    "social": ("0530000006", "emp1234"),
    "support": ("0530000009", "emp1234"),
    "ops": ("0530000010", "emp1234"),
    "inventory": ("0530000008", "emp1234"),
}
_c = {}


def login(role):
    if role not in _c:
        ph, pw = CREDS[role]
        r = requests.post(f"{API}/auth/login", json={"phone": ph, "password": pw}, timeout=60)
        if r.status_code != 200:
            pytest.skip(f"login {role} failed {r.status_code}")
        _c[role] = r.json()
    return _c[role]


def H(role):
    return {"Authorization": f"Bearer {login(role)['token']}"}


CREATED = {"posts": [], "tasks": [], "comments": []}
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for pid in CREATED["posts"]:
        requests.delete(f"{API}/merchant/social/posts/{pid}", headers=H("merchant"))
        db.social_posts.delete_one({"_id": ObjectId(pid)})
        db.support_tickets.delete_many({"category": "job", "linked_post_id": pid})  # job-apply tickets for our own TEST post
    for cid in CREATED["comments"]:
        db.social_comments.delete_one({"_id": cid})
    for tid in CREATED["tasks"]:
        requests.delete(f"{API}/merchant/tasks/{tid}", headers=H("merchant"))


def store_name():
    m = db.users.find_one({"phone": "0509999999"}, {"name": 1, "store_name": 1})
    return m.get("store_name") or m.get("name")


# Employee post published under store name
class TestStoreAuthorship:
    def test_employee_post_author_is_store(self):
        r = requests.post(f"{API}/merchant/social/posts", headers=H("social"), json={"text": "TEST_iter68 employee post", "type": "post"})
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("post", {}).get("id")
        assert pid, r.text
        CREATED["posts"].append(pid)
        p = db.social_posts.find_one({"_id": ObjectId(pid)})
        assert p["author"] == store_name(), p["author"]
        assert p["posted_by_staff"] == login("social")["user"]["name"]
        assert p["author_id"] == login("merchant")["user"]["id"]

    def test_employee_comment_uses_store_name(self):
        pid = CREATED["posts"][0]
        r = requests.post(f"{API}/social/posts/{pid}/comments", headers=H("social"), json={"text": "TEST_iter68 staff comment"})
        assert r.status_code == 200, r.text
        cs = requests.get(f"{API}/social/posts/{pid}/comments").json()
        mine = [c for c in cs if c["text"] == "TEST_iter68 staff comment"]
        assert mine and mine[0]["is_merchant_reply"] is True
        assert mine[0]["user_name"] == store_name()
        for c in cs:
            CREATED["comments"].append(ObjectId(c["id"]))

    def test_employee_reply_endpoint_store_name(self):
        pid = CREATED["posts"][0]
        r = requests.post(f"{API}/social/posts/{pid}/comments/abc/reply", headers=H("social"), json={"text": "TEST_iter68 reply"})
        assert r.status_code == 200, r.text
        c = db.social_comments.find_one({"post_id": pid, "text": "TEST_iter68 reply"})
        CREATED["comments"].append(c["_id"])
        assert c["is_merchant"] is True
        assert c["user_name"] == store_name(), f"reply shows employee name: {c['user_name']}"

    def test_store_reply_and_replies_endpoints(self):
        pid = CREATED["posts"][0]
        cid = str(ObjectId())
        db.social_posts.update_one({"_id": ObjectId(pid)}, {"$set": {"comments": [{"id": cid, "text": "TEST_c", "replies": []}]}})
        r1 = requests.post(f"{API}/social/posts/{pid}/comments/{cid}/store-reply", headers=H("social"), json={"text": "TEST_sr"})
        assert r1.status_code == 200, r1.text
        assert r1.json()["reply"]["user_name"] == store_name()
        r2 = requests.post(f"{API}/merchant/social/posts/{pid}/comments/{cid}/replies", headers=H("social"), json={"text": "TEST_rp"})
        assert r2.status_code == 200, r2.text
        assert store_name() in r2.json()["reply"]["user_name"], f"replies endpoint name: {r2.json()['reply']['user_name']}"

    def test_non_social_employee_forbidden_store_reply(self):
        pid = CREATED["posts"][0]
        r = requests.post(f"{API}/social/posts/{pid}/comments/x/store-reply", headers=H("inventory"), json={"text": "TEST_no"})
        assert r.status_code == 403


# Invalid assignee -> 400
class TestInvalidAssignee:
    def test_ticket_invalid_assignee(self):
        b = requests.get(f"{API}/merchant/tickets", headers=H("support")).json()
        if not b["tickets"]:
            pytest.skip("no tickets")
        tid = b["tickets"][0]["id"]
        for bad in ["not-an-id", str(ObjectId())]:
            r = requests.put(f"{API}/merchant/tickets/{tid}", headers=H("support"), json={"assignee_id": bad})
            assert r.status_code == 400, f"{bad}: {r.status_code} {r.text}"

    def test_task_invalid_assignee(self):
        for bad in ["zzz", str(ObjectId())]:
            r = requests.post(f"{API}/merchant/tasks", headers=H("ops"), json={"title": "TEST_bad", "assignee_id": bad})
            assert r.status_code == 400, f"{bad}: {r.status_code} {r.text}"

    def test_task_valid_create_and_bad_update(self):
        sup = login("support")["user"]["id"]
        r = requests.post(f"{API}/merchant/tasks", headers=H("ops"), json={"title": "TEST_iter68 task", "assignee_id": sup, "priority": "high"})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        CREATED["tasks"].append(tid)
        u = requests.put(f"{API}/merchant/tasks/{tid}", headers=H("ops"), json={"assignee_id": "bad"})
        assert u.status_code == 400
        lst = requests.get(f"{API}/merchant/tasks", headers=H("ops")).json()["tasks"]
        t = next(x for x in lst if x["id"] == tid)
        assert t["assignee_id"] == sup and t["assignee_name"]


# Regression: dashboards / tickets permission / job apply
class TestRegression:
    @pytest.mark.parametrize("role", ["social", "support", "ops", "inventory"])
    def test_dashboard(self, role):
        r = requests.get(f"{API}/employee/dashboard", headers=H(role))
        assert r.status_code == 200, r.text
        assert r.json().get("widgets")

    def test_tickets_forbidden_inventory(self):
        r = requests.get(f"{API}/merchant/tickets", headers=H("inventory"))
        assert r.status_code == 403

    def test_job_apply_duplicate_guard(self):
        r = requests.post(f"{API}/merchant/social/posts", headers=H("merchant"), json={"text": "TEST_job68", "type": "job", "job_title": "TEST_ Dev"})
        assert r.status_code == 200, r.text
        pid = r.json().get("id") or r.json().get("post", {}).get("id")
        CREATED["posts"].append(pid)
        a = requests.post(f"{API}/social/posts/{pid}/apply", headers=H("customer"), json={"name": "TEST_ A", "phone": "0500000000", "note": "hi"})
        assert a.status_code == 200, a.text
        a2 = requests.post(f"{API}/social/posts/{pid}/apply", headers=H("customer"), json={"name": "TEST_ A", "phone": "0500000000"})
        assert a2.status_code == 400
