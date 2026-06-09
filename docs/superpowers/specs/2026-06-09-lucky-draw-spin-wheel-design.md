# Lucky Draw Spin Wheel — Design

> Standalone Saturday-event giveaway app. ~30 guests draw from 3 goodies (T-Shirt, Tote Bag,
> Charger; 30 each). Guest enters name → spins an 8-segment wheel → server picks a prize (or
> "spin again") → claim logged to Excel via n8n webhook. Branded with the AI 365 logo.

**Date:** 2026-06-09
**Status:** Approved design, pending spec review

---

## Locked decisions

- **Source of truth = Excel via n8n webhooks** (no local SQLite). Each draw reads fresh stock and
  the claimed-name list from the READ webhook; each successful claim is appended via the WRITE
  webhook. Trade-off accepted: webhook latency (~300 ms–2 s) and no DB-level atomicity.
- **In-memory serialize-lock** in the single Uvicorn worker: draws are processed one at a time
  (`asyncio.Lock`) so a guest's read→pick→write completes before the next begins. Kills the
  concurrent-double-click over-issue race without a database.
- **Draw rule = flat-equal among in-stock types + spin-again.** Pick pool = each in-stock goodie
  (weight 2) plus `spin_again` (weight 2), matching the 8-segment wheel. A goodie at 0 stock leaves
  the pool (its 2 segments grey out). Equal per-spin odds regardless of quantity left.
- **"Spin again" = free respin, no claim consumed.** Only landing on a real goodie records the one
  claim-per-name. Landing on spin-again re-enables the Spin button.
- **Anti-cheat = name dedupe**, case-insensitive + trimmed, one claim per name. Checked at name
  entry (page 1) and re-checked at draw. Fake names bypass — acceptable for a small friendly event.
- **Server decides the prize.** The wheel animation is visual only and lands on the server result.
  The client never picks (cheatable + would desync stock).
- **Frontend = Vue 3 + Vite SPA**, two routes. Production build served by FastAPI as static files.

---

## Architecture

```
Page 1  NameView   →  POST /check {name}  →  READ-webhook → dedupe → ok? route to /wheel
Page 2  WheelView  →  POST /draw  {name}  →  [acquire lock]
                                             READ-webhook  → {stock, claimed}
                                             dedupe re-check
                                             pick flat-equal( in-stock goodies + spin_again )
                                             if goodie: WRITE-webhook append claim
                                             [release lock] → return result
                                             wheel animates, lands on returned segment
```

- One FastAPI process, one Uvicorn worker. The backend is a thin orchestrator: it hides the webhook
  URLs, holds the pick logic server-side (anti-cheat), and serializes draws.
- Excel (behind n8n) is the durable record. The backend keeps no persistent state of its own.

## Stack

| Layer    | Choice                                                                 |
|----------|------------------------------------------------------------------------|
| Backend  | Python + FastAPI + Uvicorn (**single worker**), `httpx` for webhook calls |
| Frontend | Vue 3 + Vite + vue-router (routes `/` → `/wheel`)                       |
| State    | Lightweight shared store (or route param) to carry the entered name    |
| Excel    | n8n READ + WRITE webhooks (URLs configured via env placeholders)       |
| Logo     | `AI 365 T-shirt-Back Design-FA.ai` (PDF-compatible) → PNG via `sips`    |
| Run      | `uvicorn app:app --port 8000` serving the built `frontend/dist`         |

## n8n webhook contract

Two placeholder URLs, configured via `.env` (`N8N_READ_URL`, `N8N_WRITE_URL`), left empty for the
user to paste their n8n webhook URLs.

**READ webhook** — `GET` (or `POST {}`), returns current state. n8n derives stock from the claims
log (`stock = 30 − count(claims of that goodie)`):

```json
{
  "shirt":   { "label": "T-Shirt",  "stock": 27 },
  "tote":    { "label": "Tote Bag", "stock": 30 },
  "charger": { "label": "Charger",  "stock": 25 },
  "claimed": ["alice", "bob carter"]
}
```

(`claimed` is the lowercased/trimmed name list for dedupe. Exact JSON shape can be adapted to what
the user's n8n flow returns; the backend normalizes it.)

**WRITE webhook** — `POST` payload, n8n appends one Excel row:

```json
{ "ts": "2026-06-09T14:03:00", "name": "Alice", "label": "T-Shirt", "goodie_id": "shirt" }
```

If either webhook URL is empty/unset, the backend runs in a **local mock mode** (in-memory stock
30/30/30 + claim set) so the app is fully testable before n8n is wired. Logged clearly at startup.

## Backend API

| Method | Path      | Body        | Returns                                                                 |
|--------|-----------|-------------|-------------------------------------------------------------------------|
| GET    | `/`       | —           | Vue SPA (`index.html` from `dist`)                                       |
| POST   | `/check`  | `{name}`    | `200 {ok:true}`; `400 empty_name`; `409 already_claimed {previous}`     |
| POST   | `/draw`   | `{name}`    | `200 {type:"prize", goodie_id, label}` or `{type:"spin_again"}`; `409 already_claimed {previous}` / `409 sold_out`; `400 empty_name` |
| GET    | `/stock`  | —           | `{shirt:N, tote:N, charger:N}` (proxied from READ webhook; host view)   |

Error → HTTP map: `already_claimed` / `sold_out` → `409`, `empty_name` → `400`.

`/draw` runs entirely inside the serialize-lock. The WRITE webhook call happens before returning, so
the next read reflects the decrement (no async-mirror race). Webhook failures retry with backoff;
after exhausting retries `/draw` returns `503` and records nothing (guest re-spins).

## Draw logic (server)

```python
async with draw_lock:
    state = await read_webhook()                 # {stock per goodie, claimed[]}
    if name.lower().strip() in state.claimed:
        return already_claimed(previous=...)
    in_stock = [g for g in goodies if state.stock[g] > 0]
    if not in_stock:
        return sold_out()
    pool = []
    for g in in_stock:
        pool += [g, g]                            # weight 2 each
    pool += ["spin_again", "spin_again"]          # weight 2
    pick = random.choice(pool)
    if pick == "spin_again":
        return {"type": "spin_again"}             # no claim, guest spins again
    await write_webhook(ts, name, label[pick], pick)
    return {"type": "prize", "goodie_id": pick, "label": label[pick]}
```

- Equal per-spin odds among in-stock goodies; quantities drain unevenly (accepted).
- Spin-again never consumes the one-claim-per-name; only a goodie does.
- Wheel segment weights mirror the pool exactly, so the visual matches the real odds.

## Frontend (Vue 3 + Vite SPA)

```
frontend/
├── index.html
├── vite.config.js          # dev proxy: /check /draw /stock → http://localhost:8000
├── public/logo.png
└── src/
    ├── main.js
    ├── router.js           # '/' → NameView, '/wheel' → WheelView
    ├── store.js            # holds entered name; guards /wheel if no name
    ├── api.js              # fetch helpers for /check, /draw, /stock
    ├── App.vue
    └── views/
        ├── NameView.vue    # logo, name input, Enter button
        └── WheelView.vue   # canvas 8-segment wheel + Spin button + result states
```

**NameView** — logo + required name input + Enter button. On submit: `POST /check`. On `409`
already-claimed, show "You already claimed: {previous} ✋" and block. On `200`, store name, route to
`/wheel`.

**WheelView** — canvas wheel, 8 segments: 2× each goodie + 2× spin-again. Sold-out goodie segments
grey out (stock from `/stock`). On Spin:
1. Disable Spin button (blocks double-submit / refresh-spam).
2. `POST /draw`.
3. Animate wheel, ease to land on the returned segment.
4. `type:"prize"` → "You got: {label} 🎉" (Spin stays disabled — done).
   `type:"spin_again"` → "Spin again! 🔄", re-enable Spin.
   `409 already_claimed` → "You already claimed: {previous} ✋".
   `409 sold_out` → "All goodies claimed — thank you! 🙏".

Router guard: visiting `/wheel` with no stored name redirects to `/`.

**UI design** — clean modern event-giveaway look: branded with AI 365 logo, gradient/festive card
layout, large tactile Spin button, celebratory result reveal. Colors pulled from the logo. (Specific
palette/layout finalized during implementation; researched against current giveaway-UI patterns.)

## File layout (full)

```
luckydraw/
├── backend/
│   ├── app.py              # FastAPI routes, draw logic, webhook proxy, lock, mock mode, static serve
│   └── requirements.txt    # fastapi  uvicorn  httpx
├── frontend/               # Vue 3 + Vite (above)
├── .env.example            # N8N_READ_URL=   N8N_WRITE_URL=
├── .gitignore              # .env, node_modules, dist (optional)
└── README.md               # setup, n8n webhook wiring, build + run, logo export
```

## Build & run (README)

1. `cd frontend && npm install && npm run build` → produces `frontend/dist`.
2. `cd backend && pip install -r requirements.txt`.
3. Copy `.env.example` → `.env`, paste the two n8n webhook URLs (or leave blank for mock mode).
4. Export logo: `sips -s format png "AI 365 T-shirt-Back Design-FA.ai" --out frontend/public/logo.png`.
5. `uvicorn app:app --host 0.0.0.0 --port 8000`. Open `http://localhost:8000`.
   Dev: run `npm run dev` (Vite) + uvicorn separately; Vite proxies API calls.

## n8n setup (README)

- **READ webhook**: trigger node → reads the Excel/Sheet claims tab → returns the JSON above
  (stock per goodie + lowercased claimed-name list).
- **WRITE webhook**: trigger node → appends a row `[ts, name, label]` to the Excel claims tab.
- Paste both webhook URLs into `.env`.

## Verification

- **Mock mode:** blank webhook URLs → app fully playable; in-memory stock drains, dedupe works.
- **Dedupe:** same name at `/check` → `409 already_claimed`. Same name reaching `/draw` → `409`,
  no WRITE call. Two simultaneous double-clicks of one name → serialize-lock → one claim only.
- **Stock:** mock-seed 1/1/1, fire ~50 distinct-name draws → at most 3 goodie claims, rest get
  spin-again or sold_out; no negative stock; sold-out goodie never returned as a prize.
- **Flat-equal + spin-again:** seed 30/30/30, auto-run many draws → roughly equal goodie wins;
  ~25% of spins land spin-again (re-spun, no claim); confirm a 0-stock goodie leaves the pool.
- **Webhook truth:** with real n8n, a claim appears as an Excel row within seconds; next READ shows
  decremented stock. Kill n8n → `/draw` retries then `503`, guest re-spins, no phantom claim.
- **UI:** name page blocks claimed names; wheel lands on server result; double-click blocked during
  spin; spin-again re-enables; prize/already-claimed/sold-out states render; logo shows; router
  guard redirects `/wheel`→`/` with no name.
