"""Lucky Draw Spin Wheel — FastAPI backend.

Thin orchestrator over two n8n webhooks (Excel = source of truth):
  - READ  webhook: returns current stock per goodie + claimed-name list
  - WRITE webhook: appends one claim row

If the webhook URLs are unset, runs in local MOCK mode (in-memory stock + claims)
so the app is fully playable before n8n is wired.

Draw flow is serialized by a single asyncio.Lock so concurrent double-clicks can't
over-issue stock without a database.
"""
from __future__ import annotations

import asyncio
import os
import random
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

# --- Config ---------------------------------------------------------------

READ_URL = os.getenv("N8N_READ_URL", "").strip()
WRITE_URL = os.getenv("N8N_WRITE_URL", "").strip()
MOCK = not (READ_URL and WRITE_URL)

WEBHOOK_TIMEOUT = 8.0      # seconds per webhook call
WEBHOOK_RETRIES = 4        # retry attempts with exponential backoff

# Goodie definitions. Initial stock 30 each (used only to seed MOCK mode;
# in real mode the READ webhook is authoritative).
GOODIES = {
    "shirt":   {"label": "T-Shirt",  "stock": 30},
    "tote":    {"label": "Tote Bag", "stock": 30},
    "charger": {"label": "Charger",  "stock": 30},
}

DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

draw_lock = asyncio.Lock()

# --- MOCK state -----------------------------------------------------------

_mock_stock = {gid: g["stock"] for gid, g in GOODIES.items()}
_mock_claimed: dict[str, str] = {}  # normalized name -> label claimed


def _norm(name: str) -> str:
    return name.strip().lower()


# --- Webhook I/O ----------------------------------------------------------

async def read_state() -> dict:
    """Return {stock: {gid: int}, labels: {gid: str}, claimed: set[str]}."""
    if MOCK:
        return {
            "stock": dict(_mock_stock),
            "labels": {gid: g["label"] for gid, g in GOODIES.items()},
            "claimed": set(_mock_claimed.keys()),
            "claimed_labels": dict(_mock_claimed),
        }

    raw = await _call(READ_URL, method="GET")
    # Normalize whatever shape the n8n flow returns into our internal form.
    stock, labels = {}, {}
    for gid in GOODIES:
        entry = raw.get(gid, {})
        if isinstance(entry, dict):
            stock[gid] = int(entry.get("stock", 0))
            labels[gid] = entry.get("label", GOODIES[gid]["label"])
        else:  # bare number fallback
            stock[gid] = int(entry)
            labels[gid] = GOODIES[gid]["label"]
    claimed_list = raw.get("claimed", []) or []
    claimed = {_norm(n) for n in claimed_list}
    return {"stock": stock, "labels": labels, "claimed": claimed, "claimed_labels": {}}


async def write_claim(ts: str, name: str, label: str, goodie_id: str) -> None:
    if MOCK:
        _mock_claimed[_norm(name)] = label
        if _mock_stock.get(goodie_id, 0) > 0:
            _mock_stock[goodie_id] -= 1
        return
    await _call(
        WRITE_URL,
        method="POST",
        json={"ts": ts, "name": name, "label": label, "goodie_id": goodie_id},
    )


async def _call(url: str, *, method: str, json: dict | None = None) -> dict:
    last_exc: Exception | None = None
    async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT) as client:
        for attempt in range(WEBHOOK_RETRIES):
            try:
                resp = await client.request(method, url, json=json)
                resp.raise_for_status()
                if resp.content:
                    try:
                        return resp.json()
                    except ValueError:
                        return {}
                return {}
            except Exception as exc:  # noqa: BLE001 - retry on any transport/HTTP error
                last_exc = exc
                await asyncio.sleep(2 ** attempt * 0.25)
    raise WebhookError(str(last_exc))


class WebhookError(RuntimeError):
    pass


# --- API models -----------------------------------------------------------

class NameBody(BaseModel):
    name: str = ""


def _err(status: int, error: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": error, **extra})


# --- App ------------------------------------------------------------------

app = FastAPI(title="Lucky Draw Spin Wheel")


@app.on_event("startup")
async def _startup() -> None:
    mode = "MOCK (no n8n — in-memory stock 30/30/30)" if MOCK else "LIVE (n8n webhooks)"
    print(f"[lucky-draw] mode: {mode}")
    if not MOCK:
        print(f"[lucky-draw] READ  {READ_URL}")
        print(f"[lucky-draw] WRITE {WRITE_URL}")


@app.post("/check")
async def check(body: NameBody):
    name = body.name.strip()
    if not name:
        return _err(400, "empty_name")
    try:
        state = await read_state()
    except WebhookError:
        return _err(503, "webhook_unavailable")
    if _norm(name) in state["claimed"]:
        prev = state.get("claimed_labels", {}).get(_norm(name))
        return _err(409, "already_claimed", previous=prev)
    return {"ok": True}


@app.post("/draw")
async def draw(body: NameBody):
    name = body.name.strip()
    if not name:
        return _err(400, "empty_name")

    async with draw_lock:
        try:
            state = await read_state()
        except WebhookError:
            return _err(503, "webhook_unavailable")

        if _norm(name) in state["claimed"]:
            prev = state.get("claimed_labels", {}).get(_norm(name))
            return _err(409, "already_claimed", previous=prev)

        in_stock = [gid for gid in GOODIES if state["stock"].get(gid, 0) > 0]
        if not in_stock:
            return _err(409, "sold_out")

        pool: list[str] = []
        for gid in in_stock:
            pool += [gid, gid]            # weight 2 per in-stock goodie
        pool += ["spin_again", "spin_again"]  # weight 2
        pick = random.choice(pool)

        if pick == "spin_again":
            return {"type": "spin_again"}

        label = state["labels"][pick]
        ts = datetime.now().isoformat(timespec="seconds")
        try:
            await write_claim(ts, name, label, pick)
        except WebhookError:
            return _err(503, "webhook_unavailable")
        return {"type": "prize", "goodie_id": pick, "label": label}


@app.get("/stock")
async def stock():
    try:
        state = await read_state()
    except WebhookError:
        return _err(503, "webhook_unavailable")
    return state["stock"]


# Serve the built Vue SPA (production). Mounted last so API routes win.
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="spa")
else:
    @app.get("/")
    async def _no_build():
        return JSONResponse(
            {"error": "frontend not built", "hint": "cd frontend && npm run build"},
            status_code=503,
        )
