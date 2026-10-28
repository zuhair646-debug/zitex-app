# Phase 3 — Marketers / Affiliates: marketer role, merchant list, referral attribution, payouts, /r/ link — iteration_48
import os

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or _env("/app/frontend/.env", "EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
MDB = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]

CREATED = {"orders": set(), "payouts": set(), "stock": {}, "user": {}, "cart": [], "nawaf_clicks": None}
VALID_IBAN = "SA0380000000608010167519"


def login(phone, pw):
    r = requests.post(f"{API}/auth/login", json={"phone": phone, "password": pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {phone}: {r.status_code} {r.text[:120]}")
    return r.json()


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def tok():
    mk = login("0530000002", "emp1234")
    return {"m": login("0509999999", "merchant2025")["token"], "k": mk["token"], "k_user": mk.get("user", {}),
            "c": login("0500000000", "test1234")["token"]}


@pytest.fixture(scope="module")
def sara():
    a = MDB.affiliates.find_one({"referral_code": "SARA10"})
    if not a:
        pytest.skip("SARA10 not seeded")
    return a


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    cust = MDB.users.find_one({"phone": "0500000000"})
    CREATED["user"] = {"id": cust["_id"], "points": cust.get("points", 0), "wallet_balance": cust.get("wallet_balance", 0)}
    CREATED["cart"] = list(MDB.cart_items.find({"user_id": str(cust["_id"])}))
    yield
    oids = list(CREATED["orders"])
    MDB.invoices.delete_many({"order_id": {"$in": oids}})
    MDB.orders.delete_many({"_id": {"$in": [ObjectId(o) for o in oids]}})
    MDB.affiliate_conversions.delete_many({"order_id": {"$in": oids}})
    MDB.loyalty_transactions.delete_many({"ref_id": {"$in": oids}})
    MDB.points_history.delete_many({"order_id": {"$in": oids}})
    MDB.notifications.delete_many({"data.order_id": {"$in": oids}})
    MDB.affiliate_payouts.delete_many({"_id": {"$in": [ObjectId(p) for p in CREATED["payouts"]]}})
    MDB.affiliates.update_one({"referral_code": "SARA10"}, {"$set": {
        "total_earnings": 0.0, "paid_total": 0.0, "total_conversions": 0, "total_clicks": 0, "total_sales": 0.0}})
    if CREATED["nawaf_clicks"] is not None:
        MDB.affiliates.update_one({"referral_code": "NAWAF25"}, {"$set": {"total_clicks": CREATED["nawaf_clicks"]}})
    for pid, (st, ins) in CREATED["stock"].items():
        MDB.products.update_one({"_id": ObjectId(pid)}, {"$set": {"stock": st, "in_stock": ins}})
    u = CREATED["user"]
    MDB.users.update_one({"_id": u["id"]}, {"$set": {"points": u["points"], "wallet_balance": u["wallet_balance"]}})
    MDB.cart_items.delete_many({"user_id": str(u["id"])})
    if CREATED["cart"]:
        MDB.cart_items.insert_many(CREATED["cart"])


# ───────────── Marketer role / access ─────────────
class TestMarketerRole:
    def test_login_role_marketer(self, tok):
        assert tok["k_user"].get("role") == "marketer"

    def test_marketer_forbidden_merchant_stats(self, tok):
        assert requests.get(f"{API}/merchant/stats", headers=H(tok["k"])).status_code == 403

    def test_marketer_forbidden_merchant_payouts(self, tok):
        assert requests.get(f"{API}/merchant/affiliate/payouts", headers=H(tok["k"])).status_code == 403

    def test_dashboard_has_sara10(self, tok):
        r = requests.get(f"{API}/affiliate/dashboard", headers=H(tok["k"]))
        assert r.status_code == 200
        acc = [a for a in r.json() if a.get("referral_code") == "SARA10"]
        assert acc and float(acc[0]["commission_percent"]) == 10.0
        assert "_id" not in acc[0]


# ───────────── Merchant affiliate list (field normalisation) ─────────────
def test_merchant_affiliate_list_real_numbers(tok):
    r = requests.get(f"{API}/merchant/affiliate/list", headers=H(tok["m"]))
    assert r.status_code == 200
    by = {a["referral_code"]: a for a in r.json()}
    assert "NAWAF25" in by and "SARA10" in by
    n = by["NAWAF25"]
    assert float(n["commission_percent"]) == 10
    assert n["total_clicks"] >= 1245
    assert float(n["total_earnings"]) > 0 and n["total_conversions"] > 0


# ───────────── /r/{code} referral link ─────────────
def test_referral_link_redirect_and_click():
    before = MDB.affiliates.find_one({"referral_code": "NAWAF25"})["total_clicks"]
    if CREATED["nawaf_clicks"] is None:
        CREATED["nawaf_clicks"] = before
    r = requests.get(f"{API}/r/nawaf25", allow_redirects=False)
    assert r.status_code == 302
    assert "ref=NAWAF25" in r.headers.get("location", "")
    assert MDB.affiliates.find_one({"referral_code": "NAWAF25"})["total_clicks"] == before + 1


# ───────────── Referral attribution + payouts (sequential) ─────────────
class TestAttributionAndPayouts:
    state = {}

    def test_order_with_referral_credits_commission(self, tok, sara):
        p = MDB.products.find_one({"stock": {"$gte": 5}, "price": {"$gt": 0}})
        pid = str(p["_id"])
        CREATED["stock"].setdefault(pid, (p.get("stock"), p.get("in_stock")))
        cid = str(CREATED["user"]["id"])
        MDB.cart_items.delete_many({"user_id": cid})
        assert requests.post(f"{API}/cart", json={"product_id": pid, "quantity": 1}, headers=H(tok["c"])).status_code == 200
        before = MDB.affiliates.find_one({"_id": sara["_id"]})
        r = requests.post(f"{API}/orders", json={"address": "TEST_addr", "phone": "0500000000", "referral_code": "sara10"},
                          headers=H(tok["c"]))
        assert r.status_code == 200, r.text[:300]
        o = r.json()
        CREATED["orders"].add(o["id"])
        assert o.get("referral_credited") is True
        conv = MDB.affiliate_conversions.find_one({"order_id": o["id"]})
        assert conv and conv["referral_code"] == "SARA10"
        assert conv["earning"] == round(conv["order_subtotal"] * 0.10, 2)
        after = MDB.affiliates.find_one({"_id": sara["_id"]})
        assert round(after["total_earnings"] - before.get("total_earnings", 0), 2) == conv["earning"]
        assert after["total_conversions"] == before.get("total_conversions", 0) + 1
        self.state["earning"] = conv["earning"]

    def test_invalid_iban_400(self, tok, sara):
        r = requests.post(f"{API}/affiliate/payouts", headers=H(tok["k"]),
                          json={"affiliate_id": str(sara["_id"]), "amount": 1, "iban": "GB123", "account_name": "TEST"})
        assert r.status_code == 400

    def test_amount_over_available_400(self, tok, sara):
        r = requests.post(f"{API}/affiliate/payouts", headers=H(tok["k"]),
                          json={"affiliate_id": str(sara["_id"]), "amount": 999999, "iban": VALID_IBAN, "account_name": "TEST"})
        assert r.status_code == 400

    def test_other_users_affiliate_404(self, tok):
        n = MDB.affiliates.find_one({"referral_code": "NAWAF25"})
        r = requests.post(f"{API}/affiliate/payouts", headers=H(tok["k"]),
                          json={"affiliate_id": str(n["_id"]), "amount": 1, "iban": VALID_IBAN, "account_name": "TEST"})
        assert r.status_code == 404

    def test_valid_payout_pending_and_listed(self, tok, sara):
        amt = round(self.state.get("earning", 0) / 2, 2)
        if amt <= 0:
            pytest.skip("no earning")
        r = requests.post(f"{API}/affiliate/payouts", headers=H(tok["k"]),
                          json={"affiliate_id": str(sara["_id"]), "amount": amt, "iban": "sa03 8000 0000 6080 1016 7519", "account_name": "TEST_Sara"})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        CREATED["payouts"].add(pid)
        self.state["pid"], self.state["amt"] = pid, amt
        mine = [x for x in requests.get(f"{API}/affiliate/payouts", headers=H(tok["k"])).json() if x["affiliate_id"] == str(sara["_id"])][0]
        assert round(mine["available"], 2) == round(self.state["earning"] - amt, 2)
        lst = requests.get(f"{API}/merchant/affiliate/payouts", headers=H(tok["m"])).json()
        row = [x for x in lst if x["id"] == pid][0]
        assert row["status"] == "pending" and row["iban"] == VALID_IBAN and "_id" not in row

    def test_approve_without_ref_400(self, tok):
        r = requests.post(f"{API}/merchant/affiliate/payouts/{self.state['pid']}/approve", json={}, headers=H(tok["m"]))
        assert r.status_code == 400

    def test_customer_cannot_approve_403(self, tok):
        r = requests.post(f"{API}/merchant/affiliate/payouts/{self.state['pid']}/approve", json={"transfer_ref": "X"}, headers=H(tok["c"]))
        assert r.status_code == 403

    def test_approve_with_ref_paid(self, tok, sara):
        r = requests.post(f"{API}/merchant/affiliate/payouts/{self.state['pid']}/approve", json={"transfer_ref": "TEST_TRX1"}, headers=H(tok["m"]))
        assert r.status_code == 200 and r.json()["status"] == "paid"
        assert round(MDB.affiliates.find_one({"_id": sara["_id"]})["paid_total"], 2) == self.state["amt"]
        p = MDB.affiliate_payouts.find_one({"_id": ObjectId(self.state["pid"])})
        assert p["status"] == "paid" and p["transfer_ref"] == "TEST_TRX1"

    def test_second_approve_409(self, tok):
        r = requests.post(f"{API}/merchant/affiliate/payouts/{self.state['pid']}/approve", json={"transfer_ref": "TEST_TRX2"}, headers=H(tok["m"]))
        assert r.status_code == 409

    def test_reject_flow(self, tok, sara):
        avail = [x for x in requests.get(f"{API}/affiliate/payouts", headers=H(tok["k"])).json() if x["affiliate_id"] == str(sara["_id"])][0]["available"]
        amt = round(avail / 2, 2)
        r = requests.post(f"{API}/affiliate/payouts", headers=H(tok["k"]),
                          json={"affiliate_id": str(sara["_id"]), "amount": amt, "iban": VALID_IBAN, "account_name": "TEST_Sara"})
        assert r.status_code == 200
        pid = r.json()["id"]
        CREATED["payouts"].add(pid)
        paid_before = MDB.affiliates.find_one({"_id": sara["_id"]})["paid_total"]
        r = requests.post(f"{API}/merchant/affiliate/payouts/{pid}/reject", json={"note": "TEST"}, headers=H(tok["m"]))
        assert r.status_code == 200 and r.json()["status"] == "rejected"
        assert MDB.affiliates.find_one({"_id": sara["_id"]})["paid_total"] == paid_before
        avail2 = [x for x in requests.get(f"{API}/affiliate/payouts", headers=H(tok["k"])).json() if x["affiliate_id"] == str(sara["_id"])][0]["available"]
        assert round(avail2, 2) == round(avail, 2)


# ───────────── Concurrency: double-approve / over-request (atomicity) ─────────────
class TestPayoutRaces:
    def _avail(self, tok, sara):
        return [x for x in requests.get(f"{API}/affiliate/payouts", headers=H(tok["k"])).json()
                if x["affiliate_id"] == str(sara["_id"])][0]["available"]

    def test_concurrent_requests_do_not_exceed_balance(self, tok, sara):
        from concurrent.futures import ThreadPoolExecutor
        avail = self._avail(tok, sara)
        if avail <= 0:
            pytest.skip("no balance")
        body = {"affiliate_id": str(sara["_id"]), "amount": avail, "iban": VALID_IBAN, "account_name": "TEST_race"}
        with ThreadPoolExecutor(6) as ex:
            rs = list(ex.map(lambda _: requests.post(f"{API}/affiliate/payouts", headers=H(tok["k"]), json=body), range(6)))
        ok = [r.json()["id"] for r in rs if r.status_code == 200]
        CREATED["payouts"].update(ok)
        assert len(ok) == 1, f"{len(ok)} concurrent payout requests accepted for the full balance {avail}"

    def test_concurrent_approve_pays_once(self, tok, sara):
        from concurrent.futures import ThreadPoolExecutor
        p = MDB.affiliate_payouts.find_one({"affiliate_id": str(sara["_id"]), "status": "pending"})
        if not p:
            pytest.skip("no pending payout")
        paid_before = MDB.affiliates.find_one({"_id": sara["_id"]})["paid_total"]
        url = f"{API}/merchant/affiliate/payouts/{p['_id']}/approve"
        with ThreadPoolExecutor(6) as ex:
            rs = list(ex.map(lambda i: requests.post(url, json={"transfer_ref": f"TEST_R{i}"}, headers=H(tok["m"])), range(6)))
        assert sum(r.status_code == 200 for r in rs) == 1
        assert round(MDB.affiliates.find_one({"_id": sara["_id"]})["paid_total"] - paid_before, 2) == round(p["amount"], 2)
