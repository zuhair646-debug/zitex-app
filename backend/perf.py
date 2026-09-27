"""
Performance helpers for the Zenrex Store backend.

Provides:
  - `ensure_indexes(db)`: idempotent, awaitable — creates all hot-path indexes
     on startup. Safe to call every boot.
  - `TTLCache`: small async-safe in-process TTL cache (no Redis needed for
     single-node VPS deployments; can be swapped for Redis later without
     changing call-sites).
  - `cached_json(key, ttl, loader)`: async helper that memoises a loader
     function for `ttl` seconds. Use for hot public read endpoints.

Zero external deps. Fully backward compatible with existing routes.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Optional

import pymongo

logger = logging.getLogger("perf")


# ─────────────────────────────────────────────────────────────
#  Index bootstrap
# ─────────────────────────────────────────────────────────────
# Format:  (collection_name, [ (key_spec, options_dict), ... ])
# key_spec: str for a single-field ascending index, or list of tuples for
#           compound / directional indexes.
INDEX_PLAN: list[tuple[str, list[tuple[Any, dict]]]] = [
    ("users", [
        ("phone", {"unique": True}),
        ("role", {}),
        ("merchant_id", {"sparse": True}),
        ("is_affiliate", {"sparse": True}),
    ]),
    ("products", [
        ([("name_ar", "text"), ("name_en", "text")], {"name": "products_text_idx"}),
        ([("merchant_id", 1), ("published", 1)], {}),
        ([("category_id", 1), ("published", 1)], {}),
        ([("brand_id", 1), ("published", 1)], {}),
        ([("published", 1), ("featured", -1)], {}),
        ([("published", 1), ("created_at", -1)], {}),
        ([("published", 1), ("sold_count", -1)], {}),
        ("condition", {}),
        ("price", {}),
    ]),
    ("orders", [
        ([("user_id", 1), ("created_at", -1)], {}),
        ([("merchant_id", 1), ("status", 1), ("created_at", -1)], {}),
        ([("branch_id", 1), ("status", 1)], {}),
        ([("driver_id", 1), ("status", 1)], {}),
        ([("status", 1), ("created_at", -1)], {}),
        ("created_at", {}),
    ]),
    ("cart_items", [
        ("user_id", {}),
    ]),
    ("addresses", [
        ("user_id", {}),
    ]),
    ("favorites", [
        ([("user_id", 1), ("product_id", 1)], {"unique": True}),
    ]),
    ("social_posts", [
        ("created_at", {}),
        ([("type", 1), ("created_at", -1)], {}),
        ([("merchant_id", 1), ("created_at", -1)], {"sparse": True}),
        ("expires_at", {"sparse": True}),
    ]),
    ("social_likes", [
        ([("post_id", 1), ("user_id", 1)], {"unique": True}),
    ]),
    ("social_bookmarks", [
        ([("post_id", 1), ("user_id", 1)], {"unique": True}),
    ]),
    ("social_comments", [
        ([("post_id", 1), ("created_at", -1)], {}),
        ("created_at", {}),
    ]),
    ("competitions", [
        ([("status", 1), ("created_at", -1)], {}),
        ([("merchant_id", 1), ("created_at", -1)], {"sparse": True}),
        ("competition_type", {}),
    ]),
    ("competition_entries", [
        ([("competition_id", 1), ("user_id", 1)], {"unique": True}),
        ([("user_id", 1), ("joined_at", -1)], {}),
    ]),
    ("services", [
        ([("merchant_id", 1), ("published", 1)], {"sparse": True}),
        ([("published", 1), ("created_at", -1)], {}),
    ]),
    ("service_bookings", [
        ([("user_id", 1), ("created_at", -1)], {}),
        ([("service_id", 1), ("created_at", -1)], {}),
        ([("merchant_id", 1), ("status", 1), ("created_at", -1)], {"sparse": True}),
        ("status", {}),
    ]),
    ("service_reviews", [
        ([("service_id", 1), ("update_id", 1)], {}),
        ([("booking_id", 1)], {}),
        ([("update_id", 1)], {}),
        ([("user_id", 1)], {}),
    ]),
    ("service_updates", [
        ([("booking_id", 1), ("created_at", 1)], {}),
        ([("service_id", 1), ("created_at", -1)], {}),
    ]),
    ("banners", [
        ("published", {}),
    ]),
    ("categories", [
        ("published", {}),
    ]),
    ("brands", [
        ("published", {}),
    ]),
    ("reviews", [
        ([("product_id", 1), ("created_at", -1)], {}),
    ]),
    ("notifications", [
        ([("user_id", 1), ("created_at", -1)], {}),
        ([("user_id", 1), ("read", 1)], {}),
    ]),
    ("wallet_transactions", [
        ([("user_id", 1), ("created_at", -1)], {}),
    ]),
    ("points_history", [
        ([("user_id", 1), ("created_at", -1)], {}),
    ]),
    ("loyalty_transactions", [
        ([("user_id", 1), ("created_at", -1)], {}),
    ]),
    ("time_logs", [
        ([("employee_id", 1), ("check_out", 1)], {}),
        ([("merchant_id", 1), ("check_in", -1)], {"sparse": True}),
    ]),
    ("activity_log", [
        ([("employee_id", 1), ("created_at", -1)], {}),
        ([("merchant_id", 1), ("created_at", -1)], {"sparse": True}),
    ]),
    ("affiliates", [
        ("user_id", {}),
        ("merchant_id", {}),
        ("referral_code", {"unique": True, "sparse": True}),
        ([("merchant_id", 1), ("active", 1)], {}),
    ]),
    ("affiliate_conversions", [
        ([("affiliate_id", 1), ("created_at", -1)], {}),
        ([("marketer_id", 1), ("created_at", -1)], {"sparse": True}),
        ([("customer_id", 1), ("created_at", -1)], {"sparse": True}),
        ("order_id", {"sparse": True}),
    ]),
    ("ads", [
        ([("user_id", 1), ("created_at", -1)], {}),
        ([("status", 1), ("created_at", -1)], {}),
    ]),
    ("support_tickets", [
        ([("user_id", 1), ("created_at", -1)], {}),
        ([("status", 1), ("created_at", -1)], {}),
    ]),
    ("warranties", [
        ([("user_id", 1), ("created_at", -1)], {}),
    ]),
    ("settings", [
        ("key", {"unique": True}),
    ]),
    ("roles", [
        ("merchant_id", {}),
    ]),
    ("branches", [
        ("merchant_id", {"sparse": True}),
    ]),
    ("branch_inventory", [
        ([("branch_id", 1), ("product_id", 1)], {}),
    ]),
    ("employees", [
        ("merchant_id", {"sparse": True}),
        ("user_id", {"sparse": True}),
    ]),
    ("drivers", [
        ("user_id", {}),
        ("merchant_id", {"sparse": True}),
    ]),
]


async def ensure_indexes(db) -> dict:
    """Idempotently create all hot-path indexes. Returns a summary dict."""
    created = 0
    skipped = 0
    failed: list[str] = []
    for coll, specs in INDEX_PLAN:
        for key_spec, opts in specs:
            try:
                await db[coll].create_index(key_spec, **opts)
                created += 1
            except pymongo.errors.OperationFailure as e:
                # e.g. IndexOptionsConflict when the same key exists with different opts.
                # Mongo already has an equivalent index — safe to skip.
                if "already exists" in str(e).lower() or "IndexOptionsConflict" in str(e):
                    skipped += 1
                else:
                    failed.append(f"{coll}.{key_spec}: {e}")
            except Exception as e:  # pragma: no cover — defensive
                failed.append(f"{coll}.{key_spec}: {e}")
    logger.info(
        f"[perf] Indexes ensured: created/verified={created} skipped={skipped} failed={len(failed)}"
    )
    if failed:
        for f in failed[:5]:
            logger.warning(f"[perf] index failure: {f}")
    return {"created": created, "skipped": skipped, "failed": failed}


# ─────────────────────────────────────────────────────────────
#  TTL cache (in-process)
# ─────────────────────────────────────────────────────────────
class TTLCache:
    """Tiny thread-safe (via asyncio.Lock) TTL cache.

    Keys are strings; values are any JSON-serialisable Python object.
    Use for hot READ endpoints only (never for per-user data).
    """

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if time.time() >= expires_at:
                self._store.pop(key, None)
                return None
            return value

    async def set(self, key: str, value: Any, ttl: float) -> None:
        async with self._lock:
            self._store[key] = (time.time() + ttl, value)

    async def invalidate(self, key: str) -> None:
        async with self._lock:
            self._store.pop(key, None)

    async def invalidate_prefix(self, prefix: str) -> int:
        async with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                self._store.pop(k, None)
            return len(keys)

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()

    def stats(self) -> dict:
        return {"entries": len(self._store)}


_default_cache = TTLCache()


def cache() -> TTLCache:
    return _default_cache


async def cached_json(
    key: str,
    ttl: float,
    loader: Callable[[], Awaitable[Any]],
) -> Any:
    """Return cached JSON if fresh, else call `loader()`, cache, and return."""
    hit = await _default_cache.get(key)
    if hit is not None:
        return hit
    value = await loader()
    await _default_cache.set(key, value, ttl)
    return value


# ─────────────────────────────────────────────────────────────
#  Simple limit sanitiser used by paginated endpoints
# ─────────────────────────────────────────────────────────────
def safe_limit(limit: int | None, default: int = 50, cap: int = 200) -> int:
    """Clamp `limit` into [1, cap], falling back to default when None/invalid."""
    try:
        n = int(limit) if limit is not None else default
    except Exception:
        return default
    if n < 1:
        return default
    if n > cap:
        return cap
    return n
