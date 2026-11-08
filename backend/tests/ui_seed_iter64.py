# Seed: create one TEST order for customer 0500000000 and move it to processing (for /orders track button UI test)
import os, requests, json
B = os.environ['EXPO_BACKEND_URL'].rstrip('/')

def login(p, pw):
    s = requests.Session()
    d = s.post(f"{B}/api/auth/login", json={"phone": p, "password": pw}).json()
    s.headers['Authorization'] = f"Bearer {d.get('token') or d.get('access_token')}"
    return s

c = login("0500000000", "test1234")
m = login("0509999999", "merchant2025")
prods = requests.get(f"{B}/api/products?limit=20").json()
prods = prods.get('products', prods) if isinstance(prods, dict) else prods
p = next(x for x in prods if (x.get('stock') is None or x.get('stock', 0) > 5))
print("cart add", c.post(f"{B}/api/cart", json={"product_id": p['id'], "quantity": 1}).status_code)
r = c.post(f"{B}/api/orders", json={"address": "TEST_address Riyadh", "phone": "0500000000", "payment_method": "cash",
                                    "notes": "TEST_iter64", "dest_lat": 24.71, "dest_lng": 46.67})
print("order", r.status_code, r.text[:300])
oid = r.json().get('id') or r.json().get('order', {}).get('id') or r.json().get('order_id')
print("OID", oid)
print("status", m.put(f"{B}/api/merchant/orders/{oid}/status", json={"status": "processing"}).status_code)
print([(o['id'], o['status']) for o in c.get(f"{B}/api/orders").json()])
