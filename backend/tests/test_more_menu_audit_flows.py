# Audit flows: POS->inventory decrement->invoice ZATCA fields; returns credit notes; cleanup of TEST_ invoices
import os
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def tok(p, pw):
    return requests.post(f"{BASE_URL}/api/auth/login", json={"phone": p, "password": pw}).json()["token"]


def test_pos_flow():
    H = {"Authorization": f"Bearer {tok('0509999999', 'merchant2025')}"}
    inv = requests.get(f"{BASE_URL}/api/merchant/inventory", headers=H).json()
    it = next((x for x in inv["items"] if (x.get("branches") or x.get("by_branch"))), inv["items"][0])
    print("inventory item keys:", list(it.keys()))
    print("item sample:", str(it)[:400])
    pid = it.get("product_id") or it.get("id")
    bid = None
    for k in ("branches", "by_branch", "per_branch"):
        if it.get(k):
            b0 = it[k][0]
            bid = b0.get("branch_id") or b0.get("id")
            print("branch row:", b0)
            break
    if not bid:
        bid = requests.get(f"{BASE_URL}/api/merchant/branches", headers=H).json()[0]["id"]
    before = db.branch_inventory.find_one({"branch_id": bid, "product_id": pid}) or {}
    r = requests.post(f"{BASE_URL}/api/pos/invoice", headers=H, json={
        "items": [{"product_id": pid, "name": "TEST_POS", "price": 100, "quantity": 1}],
        "customer_name": "TEST_cust", "branch_id": bid, "send_via": "none"}).json()
    print("POS:", r)
    after = db.branch_inventory.find_one({"branch_id": bid, "product_id": pid}) or {}
    strip = lambda d: {k: v for k, v in d.items() if "stock" in k}
    print("stock before:", strip(before), "after:", strip(after))
    full = requests.get(f"{BASE_URL}/api/pos/invoice/{r['id']}", headers=H).json()
    print("invoice keys:", sorted(full.keys()))
    # Invoice linked to orders/returns?
    print("rmas referencing invoices:", db.rmas.count_documents({"invoice_id": {"$exists": True}}))
    print("credit_notes collection count:", db.credit_notes.count_documents({}) if "credit_notes" in db.list_collection_names() else "NO COLLECTION")
    print("invoices with order_id:", db.invoices.count_documents({"order_id": {"$exists": True}}), "/ total", db.invoices.count_documents({}))
    print("merchant VAT/CR settings:", db.settings.find_one({"key": {"$in": ["store", "zatca", "tax"]}}, {"_id": 0}))
    # restore stock + cleanup TEST invoices
    if before:
        db.branch_inventory.update_one({"_id": before["_id"]}, {"$set": strip(before)})
    d = db.invoices.delete_many({"$or": [{"customer_name": "TEST_cust"}, {"items.name": {"$in": ["TEST_FAKE", "TEST_POS"]}}]})
    print("cleaned test invoices:", d.deleted_count)
    db.roles.delete_many({"name": "TEST_hack"})
