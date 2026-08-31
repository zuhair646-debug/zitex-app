"""
Emergent Managed Object Storage helper.
- Uploads media (images/videos) to Emergent object storage
- Persistent, non-base64
- Provides /api/upload (multipart) and /api/files/{path} (auth-protected read)
"""
import os
import uuid
import requests
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query, Header, Response
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
import jwt
import io

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "zitex"

storage_key = None


def init_storage():
    """Call ONCE at startup. Idempotent — returns a reusable storage_key."""
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def _put(path: str, data: bytes, content_type: str) -> dict:
    global storage_key
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 503:
        # stale key: reset and retry once
        storage_key = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _get(path: str) -> tuple[bytes, str]:
    global storage_key
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        storage_key = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 500:
        # storage's "not found" comes as 500
        raise HTTPException(status_code=404, detail="File not found")
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def build_router(get_current_user, JWT_SECRET, JWT_ALGORITHM):
    router = APIRouter(prefix="/api")

    @router.post("/upload")
    async def upload(file: UploadFile = File(...), user=Depends(get_current_user)):
        # Validate ownership user
        if not user:
            raise HTTPException(status_code=401)
        # Validate mime
        allowed = {"image/jpeg", "image/png", "image/webp", "image/gif",
                   "video/mp4", "video/quicktime", "video/webm"}
        content_type = file.content_type or "application/octet-stream"
        if content_type not in allowed:
            raise HTTPException(status_code=400, detail=f"نوع الملف غير مدعوم: {content_type}")

        data = await file.read()
        # Size cap: 30MB for videos, 8MB for images
        max_size = 30 * 1024 * 1024 if content_type.startswith("video/") else 8 * 1024 * 1024
        if len(data) > max_size:
            raise HTTPException(status_code=413, detail=f"الملف كبير جداً (الحد {max_size // 1024 // 1024}MB)")

        # Extension
        name = file.filename or "file"
        ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
        if not ext:
            ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
                   "image/gif": "gif", "video/mp4": "mp4",
                   "video/quicktime": "mov", "video/webm": "webm"}.get(content_type, "bin")

        uid = str(user.get("_id") or user.get("id"))
        path = f"{APP_NAME}/uploads/{uid}/{uuid.uuid4().hex}.{ext}"

        try:
            result = await run_in_threadpool(_put, path, data, content_type)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else 500
            if code == 402:
                raise HTTPException(status_code=402, detail="تجاوز حصة التخزين — يرجى شحن الرصيد")
            raise HTTPException(status_code=502, detail=f"فشل الرفع: {str(e)[:120]}")

        # Return URL clients should use to fetch this file back
        # Store owner_id in a lightweight registry collection (we return path so the client can save it on the parent doc).
        return {
            "path": result.get("path", path),
            "size": result.get("size", len(data)),
            "content_type": content_type,
            "url": f"/api/files/{path}"  # relative — frontend prefixes API_URL
        }

    @router.get("/files/{path:path}")
    async def files(path: str, token: str | None = Query(None), authorization: str | None = Header(None)):
        """Serve stored file. Accepts either Authorization: Bearer <jwt> header (native) or ?token=<jwt> query (web)."""
        raw = None
        if authorization and authorization.startswith("Bearer "):
            raw = authorization[7:]
        elif token:
            raw = token
        if not raw:
            raise HTTPException(status_code=401, detail="مطلوب مصادقة")
        try:
            jwt.decode(raw, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except Exception:
            raise HTTPException(status_code=401, detail="توكن غير صالح")

        try:
            content, ct = await run_in_threadpool(_get, path)
        except HTTPException:
            raise
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else 502
            raise HTTPException(status_code=code, detail="فشل الجلب")
        return Response(content=content, media_type=ct, headers={"Cache-Control": "public, max-age=86400"})

    return router
