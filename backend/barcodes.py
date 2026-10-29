"""POS barcodes: lookup by scanned code, quick-add unknown items, internal barcode
generation, printable Code128 labels and WhatsApp receipt text."""
import html
import random
import re
from datetime import datetime, timezone
from urllib.parse import quote

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

# Code128 bar/space width patterns (values 0..106)
_C128 = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]


def code128_svg(code: str, height: int = 60, module: float = 2.0) -> str:
    """Code128-B SVG (printable ASCII)."""
    vals = [104] + [ord(c) - 32 for c in code if 32 <= ord(c) <= 126]
    chk = (vals[0] + sum(i * v for i, v in enumerate(vals[1:], start=1))) % 103
    vals += [chk, 106]
    x, rects = 10 * module, []
    for v in vals:
        for i, w in enumerate(_C128[v]):
            wd = int(w) * module
            if i % 2 == 0:
                rects.append(f'<rect x="{x:.1f}" y="0" width="{wd:.1f}" height="{height}"/>')
            x += wd
    total = x + 10 * module
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{total:.0f}" height="{height}" viewBox="0 0 {total:.1f} {height}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">{"".join(rects)}</g></svg>'


def ean13_check(d12: str) -> str:
    s = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(d12))
    return str((10 - s % 10) % 10)


def wa_phone(phone: str) -> str:
    p = re.sub(r"\D", "", phone or "")
    if p.startswith("00"):
        p = p[2:]
    if p.startswith("05") and len(p) == 10:
        p = "966" + p[1:]
    elif p.startswith("5") and len(p) == 9:
        p = "966" + p
    return p


class QuickAdd(BaseModel):
    barcode: str
    name_ar: str
    price: float
    stock: int = 1
    branch_id: str = ""


def build_router(db, get_current_user, require_merchant):
    router = APIRouter(prefix="/api")

    def _ser(p):
        p["id"] = str(p.pop("_id"))
        return p

    async def _find(code: str):
        code = (code or "").strip()
        if not code:
            return None
        return await db.products.find_one({"$or": [{"barcode": code}, {"sku": code}]})

    @router.get("/merchant/products/by-barcode/{code}")
    async def by_barcode(code: str, user=Depends(get_current_user)):
        require_merchant(user)
        p = await _find(code)
        if not p:
            raise HTTPException(404, "لا يوجد منتج بهذا الباركود")
        return _ser(p)

    @router.post("/merchant/products/quick-add")
    async def quick_add(body: QuickAdd, user=Depends(get_current_user)):
        require_merchant(user)
        code = body.barcode.strip()
        if not code or not body.name_ar.strip() or body.price <= 0:
            raise HTTPException(400, "الباركود والاسم والسعر مطلوبة")
        if await _find(code):
            raise HTTPException(409, "الباركود مستخدم لمنتج آخر")
        stock = max(0, int(body.stock))
        doc = {"name_ar": body.name_ar.strip(), "name_en": "", "description_ar": "", "description_en": "",
               "category_id": "", "brand_id": "", "price": float(body.price), "discount_price": None,
               "condition": "new", "images": [], "video": "", "storage_options": [], "colors": [], "specs": {},
               "variants": [], "branch_stock": [], "sku": "", "barcode": code, "tags": [], "stock": stock,
               "in_stock": stock > 0, "featured": False, "published": True, "rating": 0, "review_count": 0,
               "sold_count": 0, "created_at": datetime.now(timezone.utc).isoformat()}
        r = await db.products.insert_one(doc)
        pid = str(r.inserted_id)
        if body.branch_id:  # put the counted units in the selling branch too
            await db.branch_inventory.update_one(
                {"branch_id": body.branch_id, "product_id": pid},
                {"$set": {"quantity": stock, "updated_at": doc["created_at"]}}, upsert=True)
        return _ser({**doc, "_id": r.inserted_id})

    @router.post("/merchant/products/{pid}/barcode")
    async def generate_barcode(pid: str, user=Depends(get_current_user)):
        require_merchant(user)
        if not ObjectId.is_valid(pid):
            raise HTTPException(404)
        p = await db.products.find_one({"_id": ObjectId(pid)}, {"barcode": 1})
        if not p:
            raise HTTPException(404)
        if p.get("barcode"):
            return {"barcode": p["barcode"]}
        for _ in range(20):  # "20" prefix = in-store (restricted circulation) EAN-13
            d12 = "20" + "".join(random.choice("0123456789") for _ in range(10))
            code = d12 + ean13_check(d12)
            if not await _find(code):
                break
        await db.products.update_one({"_id": ObjectId(pid)}, {"$set": {"barcode": code}})
        return {"barcode": code}

    @router.get("/merchant/products/{pid}/label", response_class=HTMLResponse)
    async def label(pid: str, copies: int = 1, user=Depends(get_current_user)):
        require_merchant(user)
        if not ObjectId.is_valid(pid):
            raise HTTPException(404)
        p = await db.products.find_one({"_id": ObjectId(pid)})
        if not p or not p.get("barcode"):
            raise HTTPException(400, "المنتج ليس له باركود")
        e = html.escape
        price = float(p.get("discount_price") or p.get("price") or 0)
        one = (f'<div class="lbl"><div class="n">{e(p.get("name_ar") or p.get("name_en") or "")}</div>'
               f'{code128_svg(p["barcode"])}<div class="c">{e(p["barcode"])}</div>'
               f'<div class="p">{price * 1.15:.2f} ر.س <small>شامل الضريبة</small></div></div>')
        copies = max(1, min(int(copies), 100))
        return HTMLResponse(f"""<!doctype html><html dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Label</title><style>
body {{ font-family: Tahoma, Arial, sans-serif; margin:0; padding:8px; }}
.lbl {{ width:50mm; padding:2mm; margin:0 auto 4mm; border:1px dashed #999; text-align:center; page-break-after:always; }}
.lbl svg {{ width:100%; height:16mm; }} .n {{ font-size:11px; font-weight:bold; overflow:hidden; white-space:nowrap; }}
.c {{ font-size:10px; letter-spacing:1px; }} .p {{ font-size:13px; font-weight:bold; }} small {{ font-size:8px; }}
.noprint {{ text-align:center; margin:10px; }} @media print {{ .noprint {{ display:none; }} .lbl {{ border:none; }} }}
button {{ font-size:15px; padding:10px 22px; border-radius:8px; border:0; background:#D4AF37; color:#000; font-weight:bold; }}
</style></head><body><div class="noprint"><button onclick="window.print()">🖨 طباعة الملصق</button></div>{one * copies}</body></html>""")

    @router.get("/pos/invoice/{iid}/whatsapp")
    async def whatsapp_receipt(iid: str, user=Depends(get_current_user)):
        require_merchant(user)
        if not ObjectId.is_valid(iid):
            raise HTTPException(404)
        inv = await db.invoices.find_one({"_id": ObjectId(iid)})
        if not inv:
            raise HTTPException(404)
        if user.get("role") == "employee":
            perms = user.get("permissions", [])
            if "all" not in perms and "invoices_view_all" not in perms and inv.get("employee_id") != user["id"]:
                raise HTTPException(403, "غير مصرح لك بهذه الفاتورة")
        phone = wa_phone(inv.get("customer_phone") or (inv.get("buyer") or {}).get("phone", ""))
        if not phone:
            raise HTTPException(400, "لا يوجد رقم جوال للعميل")
        seller = (inv.get("seller") or {}).get("seller_name_ar") or "Zenrex Store"
        rows = "\n".join(f"• {ln.get('name')} ×{ln.get('qty')} = {float(ln.get('total', 0)):.2f}"
                         for ln in (inv.get("lines") or []))
        text = (f"🧾 {seller}\nفاتورة ضريبية مبسطة رقم: {inv.get('invoice_number')}\n"
                f"التاريخ: {str(inv.get('created_at', ''))[:16].replace('T', ' ')}\n\n{rows}\n\n"
                f"ضريبة القيمة المضافة: {float(inv.get('vat_amount', 0)):.2f} ر.س\n"
                f"الإجمالي: {float(inv.get('total', 0)):.2f} ر.س\n\nشكراً لتسوقكم 🌟")
        return {"phone": phone, "text": text, "url": f"https://api.whatsapp.com/send?phone={phone}&text={quote(text)}"}

    return router
