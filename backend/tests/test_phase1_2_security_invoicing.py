# Phase 1 (security) + Phase 2 (ZATCA Phase-1 invoicing + inventory) regression tests — iteration_47
import base64
import os
import re
import time

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

CREATED = {"invoices": set(), "orders": set(), "rmas": set(), "stock": {}, "wallet": {}}


def login(phone, pw):
    r = requests.post(f"{API}/auth/login", json={"phone": phone, "password": pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {phone}: {r.status_code}")
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def tok():
    return {"m": login("0509999999", "merchant2025"), "e": login("0530000001", "emp1234"),
            "c": login("0500000000", "test1234")}


@pytest.fixture(scope="module")
def product():
    p = MDB.products.find_one({"stock": {"$gte": 5}, "price": {"$gt": 0}})
    if not p:
        pytest.skip("no product with stock")
    pid = str(p["_id"])
    CREATED["stock"][pid] = (p.get("stock"), p.get("in_stock"))
    return p


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    ids = [ObjectId(i) for i in CREATED["invoices"]]
    # credit notes linked to our orders
    for o in CREATED["orders"]:
        for cn in MDB.invoices.find({"order_id": o}):
            ids.append(cn["_id"])
    MDB.invoices.delete_many({"_id": {"$in": ids}})
    MDB.orders.delete_many({"_id": {"$in": [ObjectId(o) for o in CREATED["orders"]]}})
    MDB.loyalty_transactions.delete_many({"ref_id": {"$in": list(CREATED["orders"])}})
    MDB.rmas.delete_many({"_id": {"$in": [ObjectId(r) for r in CREATED["rmas"]]}})
    MDB.wallet_transactions.delete_many({"ref_id": {"$in": list(CREATED["rmas"])}})
    for uid, bal in CREATED["wallet"].items():
        MDB.users.update_one({"_id": ObjectId(uid)}, {"$set": {"wallet_balance": bal}})
    for pid, (st, ins) in CREATED["stock"].items():
        MDB.products.update_one({"_id": ObjectId(pid)}, {"$set": {"stock": st, "in_stock": ins}})


def stock(pid):
    return MDB.products.find_one({"_id": ObjectId(pid)})["stock"]


def unit_price(p):
    return float(p.get("discount_price") or p.get("price"))


def decode_tlv(b64):
    raw = base64.b64decode(b64)
    out, i = {}, 0
    while i < len(raw):
        t, l = raw[i], raw[i + 1]
        out[t] = raw[i + 2:i + 2 + l].decode()
        i += 2 + l
    return out


# ───────────── Phase 1: competitions draw / participants ─────────────
class TestCompetitionSecurity:
    def test_draw_auth_codes(self, tok):
        fake = str(ObjectId())
        assert requests.post(f"{API}/competitions/{fake}/draw").status_code == 401
        assert requests.post(f"{API}/competitions/{fake}/draw", headers=H(tok["c"])).status_code == 403
        assert requests.post(f"{API}/competitions/{fake}/draw", headers=H(tok["m"])).status_code == 404
        assert requests.post(f"{API}/competitions/bad-id/draw", headers=H(tok["m"])).status_code == 404

    def test_participants_masked_for_public(self, tok):
        e = MDB.competition_entries.find_one({"user_phone": {"$regex": r"^\d{6,}"}})
        if not e:
            pytest.skip("no entries")
        cid = e["competition_id"]
        pub = requests.get(f"{API}/competitions/{cid}/participants").json()
        assert pub and all("****" in (x.get("user_phone") or "****") for x in pub)
        raw = {x.get("user_phone") for x in MDB.competition_entries.find({"competition_id": cid})}
        assert not raw & {x.get("user_phone") for x in pub}
        staff = requests.get(f"{API}/competitions/{cid}/participants", headers=H(tok["m"])).json()
        assert any("****" not in (x.get("user_phone") or "") for x in staff)

    def test_competition_detail_does_not_leak_winner_phones(self):
        c = MDB.competitions.find_one({"winners.0": {"$exists": True}})
        if not c:
            pytest.skip("no competition with winners")
        r = requests.get(f"{API}/competitions/{c['_id']}")
        txt = r.text
        phones = [w.get("user_phone") for w in c["winners"] if w.get("user_phone")]
        leaked = [p for p in phones if p and p in txt]
        assert not leaked, f"unmasked winner phones in public GET /competitions/id: {leaked}"


# ───────────── Phase 1: webhooks ─────────────
@pytest.mark.parametrize("path", ["payment/confirm", "delivery/update", "delivery/assigned"])
def test_webhooks_require_secret(path):
    assert requests.post(f"{API}/webhooks/{path}", json={}).status_code == 403
    assert requests.post(f"{API}/webhooks/{path}", json={}, headers={"X-Webhook-Secret": "wrong"}).status_code == 403


# ───────────── Phase 1: login lockout ─────────────
def test_login_lockout_after_5_fails():
    phone = "0599999990"
    codes = [requests.post(f"{API}/auth/login", json={"phone": phone, "password": f"x{i}"}).status_code for i in range(6)]
    assert codes[:5] == [401] * 5 or 429 in codes[:5]
    assert codes[5] == 429


# ───────────── Phase 1: employee permission middleware ─────────────
class TestEmployeePerms:
    @pytest.mark.parametrize("method,path,code", [
        ("GET", "/merchant/stats", 403), ("GET", "/merchant/roles", 403),
        ("GET", "/merchant/products", 200), ("GET", "/merchant/branches", 200), ("GET", "/pos/invoices", 200)])
    def test_cashier(self, tok, method, path, code):
        assert requests.request(method, f"{API}{path}", headers=H(tok["e"])).status_code == code

    def test_cashier_cannot_create_all_role(self, tok):
        r = requests.post(f"{API}/merchant/roles", headers=H(tok["e"]), json={"name": "TEST_x", "permissions": ["all"]})
        assert r.status_code == 403

    def test_cashier_query_token_bypass(self, tok):
        # middleware only reads the Authorization header; get_current_user also accepts ?token=
        r = requests.get(f"{API}/merchant/stats", params={"token": tok["e"]})
        assert r.status_code == 403, f"?token= bypasses employee perms: {r.status_code}"

    @pytest.mark.parametrize("path", ["/merchant/stats", "/merchant/roles", "/merchant/products", "/merchant/branches", "/pos/invoices"])
    def test_merchant_ok(self, tok, path):
        assert requests.get(f"{API}{path}", headers=H(tok["m"])).status_code == 200


# ───────────── Phase 2: business profile ─────────────
class TestBusinessProfile:
    def test_get_and_validate(self, tok):
        r = requests.get(f"{API}/merchant/business-profile", headers=H(tok["m"]))
        assert r.status_code == 200 and r.json()["vat_number"] == "300000000000003"
        assert requests.get(f"{API}/merchant/business-profile", headers=H(tok["c"])).status_code == 403
        prof = r.json()
        for bad in ["30000000000000", "300000000000004", "200000000000003", "30000000000000a"]:
            rr = requests.put(f"{API}/merchant/business-profile", headers=H(tok["m"]), json={**prof, "vat_number": bad})
            assert rr.status_code == 400, bad
        assert requests.put(f"{API}/merchant/business-profile", headers=H(tok["e"]), json=prof).status_code == 403
        ok = requests.put(f"{API}/merchant/business-profile", headers=H(tok["m"]), json=prof)
        assert ok.status_code == 200 and ok.json()["vat_number"] == "300000000000003"


# ───────────── Phase 2: POS invoice ─────────────
class TestPOSInvoice:
    def test_pos_flow(self, tok, product):
        pid = str(product["_id"])
        before = stock(pid)
        item = {"product_id": pid, "name": "x", "price": -999, "quantity": 2}
        assert requests.post(f"{API}/pos/invoice", headers=H(tok["e"]), json={"items": [{**item, "quantity": 0}]}).status_code == 400
        r1 = requests.post(f"{API}/pos/invoice", headers=H(tok["e"]), json={"items": [item], "payment_method": "cash"})
        assert r1.status_code == 200, r1.text
        d1 = r1.json(); CREATED["invoices"].add(d1["id"])
        r2 = requests.post(f"{API}/pos/invoice", headers=H(tok["m"]), json={"items": [{**item, "quantity": 1}]})
        d2 = r2.json(); CREATED["invoices"].add(d2["id"])
        n1, n2 = int(d1["invoice_number"][4:]), int(d2["invoice_number"][4:])
        assert re.fullmatch(r"INV-\d{6}", d1["invoice_number"]) and n2 == n1 + 1
        up = unit_price(product)
        assert d1["total"] == round(up * 2 * 1.15, 2) and d1["vat_amount"] == round(up * 2 * 0.15, 2)
        assert stock(pid) == before - 3

        det = requests.get(f"{API}/invoices/{d1['id']}/detail", headers=H(tok["m"])).json()
        assert det["type"] == "simplified" and len(det["uuid"]) == 36
        assert det["lines"][0]["vat_amount"] == round(up * 2 * 0.15, 2) and det["lines"][0]["unit_price"] == up
        assert det["previous_hash"] and det["invoice_hash"]
        det2 = requests.get(f"{API}/invoices/{d2['id']}/detail", headers=H(tok["m"])).json()
        assert det2["previous_hash"] == det["invoice_hash"]
        tlv = decode_tlv(det["qr"])
        assert tlv[2] == "300000000000003" and tlv[4] == f"{det['total']:.2f}" and tlv[5] == f"{det['vat_amount']:.2f}"
        assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", tlv[3]) and tlv[1]

        for fmt in ("thermal", "a4"):
            p = requests.get(f"{API}/invoices/{d1['id']}/print", params={"fmt": fmt, "token": tok["m"]})
            assert p.status_code == 200 and "data:image/png;base64" in p.text and d1["invoice_number"] in p.text
        assert "80mm" in requests.get(f"{API}/invoices/{d1['id']}/print?fmt=thermal", headers=H(tok["m"])).text
        # customer cannot see a POS invoice that isn't theirs
        assert requests.get(f"{API}/invoices/{d1['id']}/detail", headers=H(tok["c"])).status_code == 403
        assert requests.get(f"{API}/invoices/{d1['id']}/print", params={"token": tok["c"]}).status_code == 403
        assert requests.get(f"{API}/invoices/{d1['id']}/detail").status_code == 401

    def test_b2b_standard_invoice(self, tok, product):
        r = requests.post(f"{API}/pos/invoice", headers=H(tok["m"]), json={
            "items": [{"product_id": str(product["_id"]), "name": "x", "price": 1, "quantity": 1}],
            "customer_name": "TEST_B2B", "buyer_vat_number": "310000000000003"})
        assert r.status_code == 200
        CREATED["invoices"].add(r.json()["id"])
        det = requests.get(f"{API}/invoices/{r.json()['id']}/detail", headers=H(tok["m"])).json()
        assert det["type"] == "standard"


# ───────────── Phase 2: online order → invoice → RMA credit note ─────────────
class TestOnlineOrderInvoice:
    def test_order_invoice_rma(self, tok, product):
        pid = str(product["_id"])
        cust = MDB.users.find_one({"phone": "0500000000"})
        CREATED["wallet"][str(cust["_id"])] = cust.get("wallet_balance", 0)
        saved_cart = list(MDB.cart_items.find({"user_id": str(cust["_id"])}))
        MDB.cart_items.delete_many({"user_id": str(cust["_id"])})
        try:
            before = stock(pid)
            assert requests.post(f"{API}/cart", headers=H(tok["c"]), json={"product_id": pid, "quantity": 2}).status_code == 200
            r = requests.post(f"{API}/orders", headers=H(tok["c"]), json={
                "address": "TEST addr", "phone": "0500000000", "delivery_type": "standard", "payment_method": "cod"})
            assert r.status_code == 200, r.text
            o = r.json(); CREATED["orders"].add(o["id"])
            assert o.get("invoice_id") and re.fullmatch(r"INV-\d{6}", o["invoice_number"])
            CREATED["invoices"].add(o["invoice_id"])
            assert o["tax"] == round((o["subtotal"] + o["delivery_cost"]) * 0.15, 2)
            assert stock(pid) == before - 2
            mine = requests.get(f"{API}/invoices/mine", headers=H(tok["c"])).json()
            assert any(i["id"] == o["invoice_id"] and i["source"] == "online" for i in mine)
            inv = requests.get(f"{API}/invoices/{o['invoice_id']}/detail", headers=H(tok["c"])).json()
            assert inv["total"] == o["total"], (inv["total"], o["total"])

            # RMA → approve → inspection refund → credit note + restock
            rr = requests.post(f"{API}/rmas", headers=H(tok["c"]), json={
                "order_id": o["id"], "product_id": pid, "qty": 1, "reason_code": "changed_mind"})
            assert rr.status_code == 200, rr.text
            rid = rr.json().get("id") or rr.json().get("rma_id") or rr.json().get("rma", {}).get("id")
            CREATED["rmas"].add(rid)
            assert requests.put(f"{API}/merchant/rmas/{rid}/decision", headers=H(tok["m"]), json={"decision": "approve"}).status_code == 200
            s0 = stock(pid)
            ins = requests.put(f"{API}/merchant/rmas/{rid}/inspection", headers=H(tok["m"]), json={"disposition": "refund"})
            assert ins.status_code == 200 and ins.json()["state"] == "refunded"
            rma = MDB.rmas.find_one({"_id": ObjectId(rid)})
            cn_id = rma["refund"].get("credit_note_id")
            assert cn_id, "no credit note created"
            cn = requests.get(f"{API}/invoices/{cn_id}/detail", headers=H(tok["m"])).json()
            assert cn["type"] == "credit_note" and cn["ref_invoice_number"] == o["invoice_number"]
            assert cn["invoice_number"].startswith("CN-")
            assert stock(pid) == s0 + 1
            print("RMA refund amount", rma["refund"]["amount"], "credit note total", cn["total"], "unit paid incl VAT", unit_price(product) * 1.15)
            # Re-running inspection on an already refunded RMA must NOT refund/credit/restock again
            again = requests.put(f"{API}/merchant/rmas/{rid}/inspection", headers=H(tok["m"]), json={"disposition": "refund"})
            n_cn = MDB.invoices.count_documents({"order_id": o["id"], "type": "credit_note"})
            assert again.status_code == 400 and n_cn == 1, f"double refund possible: status={again.status_code}, credit notes={n_cn}, stock={stock(pid)} vs {s0 + 1}"
        finally:
            MDB.cart_items.delete_many({"user_id": str(cust["_id"])})
            if saved_cart:
                MDB.cart_items.insert_many(saved_cart)

    def test_rma_client_price_and_qty_not_trusted(self, tok, product):
        o = MDB.orders.find_one({"user_id": str(MDB.users.find_one({"phone": "0500000000"})["_id"]), "items.0": {"$exists": True}})
        if not o:
            pytest.skip("no customer order")
        it = o["items"][0]
        r = requests.post(f"{API}/rmas", headers=H(tok["c"]), json={
            "order_id": str(o["_id"]), "product_id": it["product_id"], "qty": 50, "unit_price": 99999, "reason_code": "changed_mind"})
        rid = (r.json() or {}).get("id") if r.status_code == 200 else None
        if rid:
            CREATED["rmas"].add(rid)
            doc = MDB.rmas.find_one({"_id": ObjectId(rid)})
            assert doc["unit_price"] <= float(it["price"]) and doc["qty"] <= int(it["quantity"]), \
                f"RMA trusts client: unit_price={doc['unit_price']} qty={doc['qty']} (order price {it['price']} qty {it['quantity']})"

    def test_cart_rejects_non_positive_quantity(self, tok, product):
        cust = MDB.users.find_one({"phone": "0500000000"})
        r = requests.post(f"{API}/cart", headers=H(tok["c"]), json={"product_id": str(product["_id"]), "quantity": -3, "color": "TEST_neg"})
        MDB.cart_items.delete_many({"user_id": str(cust["_id"]), "color": "TEST_neg"})
        assert r.status_code in (400, 422), f"cart accepted quantity -3 ({r.status_code})"
