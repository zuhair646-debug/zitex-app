"""
ZATCA (Fatoora) Phase-1 compliant invoicing.

- Business profile (seller name, VAT no., CR no., national address) set by the store owner.
- One sequential counter per store copy (never repeats), UUID, SHA-256 hash chained to the previous invoice.
- Types: simplified tax invoice (B2C), tax invoice (B2B, buyer VAT no.), credit note (returns).
- Line-level VAT 15% computed server-side from DB prices — the client never sends prices.
- TLV base64 QR (tags 1-5) as required by ZATCA Phase 1.
- Printable HTML: thermal 80mm and A4 (print / save as PDF from the device).
Phase 2 (XML UBL 2.1, cryptographic stamp, CSID onboarding, clearance) is deferred.
"""
import base64
import hashlib
import html
import io
import json
import uuid as _uuid
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

VAT_RATE = 0.15
_PROFILE_ID = "business_profile"
TYPE_LABELS = {
    "simplified": ("فاتورة ضريبية مبسطة", "Simplified Tax Invoice"),
    "standard": ("فاتورة ضريبية", "Tax Invoice"),
    "credit_note": ("إشعار دائن", "Credit Note"),
}


def r2(x: float) -> float:
    return round(float(x) + 1e-9, 2)


def tlv_qr(seller: str, vat_no: str, ts: str, total: float, vat: float) -> str:
    out = b""
    for tag, val in enumerate([seller, vat_no, ts, f"{total:.2f}", f"{vat:.2f}"], start=1):
        b = str(val).encode("utf-8")[:255]
        while b:  # never cut a multi-byte character in half
            try:
                b.decode("utf-8"); break
            except UnicodeDecodeError:
                b = b[:-1]
        out += bytes([tag, len(b)]) + b
    return base64.b64encode(out).decode()


def qr_png_b64(data: str) -> str:
    import qrcode
    img = qrcode.make(data, box_size=6, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


class BusinessProfile(BaseModel):
    seller_name_ar: str = ""
    seller_name_en: str = ""
    vat_number: str = ""
    cr_number: str = ""
    building_no: str = ""
    street: str = ""
    district: str = ""
    city: str = ""
    postal_code: str = ""
    phone: str = ""
    email: str = ""


def build_router(db, get_current_user):
    router = APIRouter(prefix="/api")

    async def profile() -> dict:
        return await db.app_settings.find_one({"_id": _PROFILE_ID}) or {}

    async def next_seq() -> int:
        if not await db.counters.find_one({"_id": "invoice_seq"}):
            # First run: continue after any legacy invoice numbers so numbers never repeat
            import re as _re
            mx = 0
            async for i in db.invoices.find({}, {"invoice_number": 1}):
                m = _re.search(r"(\d+)$", str(i.get("invoice_number", "")))
                mx = max(mx, int(m.group(1))) if m else mx
            await db.counters.update_one({"_id": "invoice_seq"}, {"$setOnInsert": {"value": mx}}, upsert=True)
        doc = await db.counters.find_one_and_update(
            {"_id": "invoice_seq"}, {"$inc": {"value": 1}}, upsert=True, return_document=True)
        return int(doc["value"])

    async def issue(*, kind: str, source: str, lines: List[dict], buyer: dict, payment_method: str,
                    branch_id: str = "", order_id: str = "", ref_invoice: Optional[dict] = None,
                    employee: Optional[dict] = None, customer_id: str = "", extra_discount: float = 0,
                    delivery_fee: float = 0, notes: str = "") -> dict:
        """lines: [{product_id, name, qty, unit_price(ex-VAT), discount}] — unit prices come from the DB."""
        prof = await profile()
        out_lines, taxable_total = [], 0.0
        for ln in lines:
            qty = max(1, int(ln.get("qty") or 1))
            unit = r2(max(0.0, float(ln.get("unit_price") or 0)))
            disc = r2(min(max(0.0, float(ln.get("discount") or 0)), unit * qty))
            taxable = r2(unit * qty - disc)
            vat = r2(taxable * VAT_RATE)
            out_lines.append({"product_id": ln.get("product_id", ""), "name": ln.get("name", ""), "qty": qty,
                              "unit_price": unit, "discount": disc, "taxable": taxable,
                              "vat_rate": 15, "vat_amount": vat, "total": r2(taxable + vat)})
            taxable_total += taxable
        if delivery_fee > 0:
            dv = r2(delivery_fee)
            out_lines.append({"product_id": "", "name": "رسوم التوصيل / Delivery", "qty": 1, "unit_price": dv,
                              "discount": 0, "taxable": dv, "vat_rate": 15, "vat_amount": r2(dv * VAT_RATE),
                              "total": r2(dv * (1 + VAT_RATE))})
            taxable_total += dv
        extra_discount = r2(min(max(0.0, extra_discount), taxable_total))
        taxable_total = r2(taxable_total - extra_discount)
        vat_total = r2(taxable_total * VAT_RATE)
        total = r2(taxable_total + vat_total)
        if total <= 0 and kind != "credit_note":
            raise HTTPException(400, "إجمالي الفاتورة يجب أن يكون أكبر من صفر")

        now = datetime.now(timezone.utc)
        ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        seq = await next_seq()
        prefix = "CN" if kind == "credit_note" else "INV"
        last = await db.invoices.find_one({"invoice_hash": {"$exists": True}}, sort=[("seq", -1)])
        prev_hash = (last or {}).get("invoice_hash") or base64.b64encode(hashlib.sha256(b"0").digest()).decode()
        seller = prof.get("seller_name_ar") or prof.get("seller_name_en") or "Zenrex Store"
        doc = {
            "seq": seq, "invoice_number": f"{prefix}-{seq:06d}", "uuid": str(_uuid.uuid4()),
            "type": kind, "source": source, "issued_at": ts, "created_at": now.isoformat(),
            "seller": {k: prof.get(k, "") for k in BusinessProfile.model_fields},
            "buyer": buyer, "customer_id": customer_id, "customer_name": buyer.get("name", ""),
            "customer_phone": buyer.get("phone", ""),
            "lines": out_lines, "items": out_lines,
            "subtotal": r2(taxable_total + extra_discount), "discount": extra_discount,
            "taxable_amount": taxable_total, "vat_percent": 15, "vat_amount": vat_total, "total": total,
            "payment_method": payment_method, "branch_id": branch_id, "order_id": order_id,
            "ref_invoice_id": (ref_invoice or {}).get("id", ""), "ref_invoice_number": (ref_invoice or {}).get("invoice_number", ""),
            "employee_id": (employee or {}).get("id", ""), "employee_name": (employee or {}).get("name", ""),
            "merchant_id": (employee or {}).get("merchant_id") or (employee or {}).get("id") or "store",
            "notes": notes, "status": "issued", "previous_hash": prev_hash,
            "qr": tlv_qr(seller, prof.get("vat_number", ""), ts, total, vat_total),
        }
        canonical = json.dumps({k: doc[k] for k in ("uuid", "invoice_number", "issued_at", "total", "vat_amount", "lines", "previous_hash")},
                               ensure_ascii=False, sort_keys=True, default=str)
        doc["invoice_hash"] = base64.b64encode(hashlib.sha256(canonical.encode()).digest()).decode()
        r = await db.invoices.insert_one(doc)
        doc["id"] = str(r.inserted_id)
        doc.pop("_id", None)
        return doc

    # ─── Business profile (store owner) ───
    @router.get("/merchant/business-profile")
    async def get_profile(user=Depends(get_current_user)):
        if user.get("role") not in ("merchant", "employee"):
            raise HTTPException(403)
        p = await profile()
        p.pop("_id", None)
        return {**BusinessProfile().model_dump(), **p}

    @router.put("/merchant/business-profile")
    async def put_profile(body: BusinessProfile, user=Depends(get_current_user)):
        if user.get("role") != "merchant":
            raise HTTPException(403, "للمالك فقط")
        vat = body.vat_number.strip()
        if vat and not (len(vat) == 15 and vat.isdigit() and vat[0] == "3" and vat[-1] == "3"):
            raise HTTPException(400, "الرقم الضريبي يجب أن يكون 15 رقماً يبدأ وينتهي بـ 3")
        await db.app_settings.update_one({"_id": _PROFILE_ID}, {"$set": body.model_dump()}, upsert=True)
        return await get_profile(user)

    # ─── Read / list ───
    def _summary(i: dict) -> dict:
        return {"id": str(i["_id"]), "invoice_number": i.get("invoice_number"), "type": i.get("type", "simplified"),
                "source": i.get("source", "pos"), "customer_name": i.get("customer_name"),
                "customer_phone": i.get("customer_phone"), "total": i.get("total"),
                "vat_amount": i.get("vat_amount"), "payment_method": i.get("payment_method"),
                "items_count": len(i.get("lines") or i.get("items") or []),
                "created_at": i.get("created_at"), "employee_name": i.get("employee_name"),
                "branch_id": i.get("branch_id"), "order_id": i.get("order_id", ""),
                "ref_invoice_number": i.get("ref_invoice_number", "")}

    @router.get("/invoices/mine")
    async def my_invoices(user=Depends(get_current_user)):
        q = {"$or": [{"customer_id": user["id"]}] + ([{"customer_phone": user["phone"]}] if user.get("phone") else [])}
        invs = await db.invoices.find(q).sort("created_at", -1).to_list(200)
        return [_summary(i) for i in invs]

    async def _load_for(iid: str, user: dict) -> dict:
        if not ObjectId.is_valid(iid):
            raise HTTPException(404)
        inv = await db.invoices.find_one({"_id": ObjectId(iid)})
        if not inv:
            raise HTTPException(404)
        role = user.get("role")
        staff = role == "merchant" or (role == "employee" and {"all", "invoices", "pos"} & set(user.get("permissions", [])))
        if not staff and inv.get("customer_id") != user["id"] and (not user.get("phone") or inv.get("customer_phone") != user.get("phone")):
            raise HTTPException(403, "ليست فاتورتك")
        return inv

    @router.get("/invoices/{iid}/detail")
    async def detail(iid: str, user=Depends(get_current_user)):
        inv = await _load_for(iid, user)
        inv["id"] = str(inv.pop("_id"))
        return inv

    @router.get("/invoices/{iid}/print", response_class=HTMLResponse)
    async def print_invoice(iid: str, request: Request, fmt: str = "thermal", user=Depends(get_current_user)):
        inv = await _load_for(iid, user)
        return HTMLResponse(render_html(inv, fmt))

    global ISSUE
    ISSUE = issue  # used by POS / orders / returns hooks
    return router


ISSUE = None  # set by build_router()


def render_html(inv: dict, fmt: str = "thermal") -> str:
    e = lambda x: html.escape(str(x if x is not None else ""))
    s = inv.get("seller") or {}
    b = inv.get("buyer") or {}
    ar, en = TYPE_LABELS.get(inv.get("type", "simplified"), TYPE_LABELS["simplified"])
    addr = "، ".join(x for x in [s.get("building_no"), s.get("street"), s.get("district"), s.get("city"), s.get("postal_code")] if x)
    qr = qr_png_b64(inv.get("qr", "")) if inv.get("qr") else ""
    thermal = fmt != "a4"
    rows = "".join(
        f"<tr><td>{e(l['name'])}</td><td>{l['qty']}</td><td>{l['unit_price']:.2f}</td>"
        f"<td>{l['vat_amount']:.2f}</td><td>{l['total']:.2f}</td></tr>" for l in (inv.get("lines") or inv.get("items") or [])
        if isinstance(l, dict) and "vat_amount" in l)
    when = (inv.get("issued_at") or inv.get("created_at") or "")[:19].replace("T", " ")
    buyer_html = ""
    if b.get("name") or b.get("vat_number"):
        buyer_html = (f"<div class='box'><b>المشتري / Buyer:</b> {e(b.get('name'))} {e(b.get('phone'))}"
                      + (f"<br>الرقم الضريبي للمشتري: {e(b.get('vat_number'))}" if b.get("vat_number") else "") + "</div>")
    ref = f"<div>مرجع الفاتورة الأصلية / Ref: {e(inv.get('ref_invoice_number'))}</div>" if inv.get("ref_invoice_number") else ""
    return f"""<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(inv.get('invoice_number'))}</title>
<style>
@page {{ size: {'80mm auto' if thermal else 'A4'}; margin: {'3mm' if thermal else '12mm'}; }}
body {{ font-family: Tahoma, Arial, sans-serif; color:#000; margin:0 auto; padding:8px; max-width:{'76mm' if thermal else '190mm'}; font-size:{'11px' if thermal else '13px'}; }}
h1 {{ font-size:{'14px' if thermal else '20px'}; text-align:center; margin:4px 0; }}
.c {{ text-align:center; }} .box {{ border-top:1px dashed #000; padding:6px 0; }}
table {{ width:100%; border-collapse:collapse; margin:6px 0; }} th,td {{ border-bottom:1px solid #ccc; padding:3px 2px; text-align:right; font-size:inherit; }}
.tot td {{ border:none; padding:2px; }} .tot .g {{ font-weight:bold; font-size:1.15em; border-top:2px solid #000; }}
.qr {{ display:block; margin:8px auto; width:{'34mm' if thermal else '40mm'}; }}
.noprint {{ text-align:center; margin:10px; }} @media print {{ .noprint {{ display:none; }} }}
button {{ font-size:15px; padding:10px 22px; border-radius:8px; border:0; background:#D4AF37; color:#000; font-weight:bold; }}
</style></head><body>
<div class="noprint"><button onclick="window.print()">🖨 طباعة / حفظ PDF</button></div>
<h1>{e(s.get('seller_name_ar') or s.get('seller_name_en') or 'Zenrex Store')}</h1>
<div class="c">{e(s.get('seller_name_en'))}</div>
<div class="c">{e(addr)}</div>
<div class="c">الرقم الضريبي VAT: {e(s.get('vat_number') or '—')} &nbsp; السجل التجاري CR: {e(s.get('cr_number') or '—')}</div>
<h1>{ar}<br><small>{en}</small></h1>
<div class="box">رقم الفاتورة / No: <b>{e(inv.get('invoice_number'))}</b><br>التاريخ / Date: {e(when)}<br>
طريقة الدفع / Payment: {e(inv.get('payment_method'))}{ref}</div>
{buyer_html}
<table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>{rows}</tbody></table>
<table class="tot">
<tr><td>الإجمالي غير شامل الضريبة / Total excl. VAT</td><td>{inv.get('subtotal', 0):.2f}</td></tr>
<tr><td>الخصم / Discount</td><td>{inv.get('discount', 0):.2f}</td></tr>
<tr><td>المبلغ الخاضع للضريبة / Taxable</td><td>{inv.get('taxable_amount', inv.get('subtotal', 0)):.2f}</td></tr>
<tr><td>ضريبة القيمة المضافة 15% / VAT</td><td>{inv.get('vat_amount', 0):.2f}</td></tr>
<tr><td class="g">الإجمالي شامل الضريبة / Total incl. VAT (SAR)</td><td class="g">{inv.get('total', 0):.2f}</td></tr>
</table>
{f'<img class="qr" src="data:image/png;base64,{qr}">' if qr else ''}
<div class="c" style="font-size:9px;word-break:break-all">UUID: {e(inv.get('uuid'))}</div>
<div class="c">شكراً لتسوقكم</div>
</body></html>"""
