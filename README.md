# AI 365 Lucky Draw Spin Wheel

Saturday-event giveaway. Guest enters name → spins an 8-segment wheel → server picks a prize
(T-Shirt / Tote Bag / Charger, 30 each) or "Spin Again" → claim logged to Excel via n8n webhook.

- **Source of truth = Excel** (behind two n8n webhooks). No local database.
- **Server decides the prize** (anti-cheat); the wheel only animates to the result.
- **Flat-equal odds** among in-stock goodies + spin-again (8 segments: 2× each goodie, 2× spin-again).
- **One claim per name** (case-insensitive, trimmed). Draws serialized so double-clicks can't over-issue.
- **Mock mode**: with blank webhook URLs the app runs fully on in-memory stock for testing.

## Quick start

```bash
./run.sh        # builds frontend, preps backend, serves http://localhost:8000
```

First run auto-installs deps, creates `.env` (blank = MOCK mode), and starts the server.
For per-step setup or dev hot-reload, see [Setup & run](#setup--run) below.

## Layout

```
backend/   FastAPI app (routes, draw logic, webhook proxy, serialize-lock, static serve)
frontend/  Vue 3 + Vite SPA (NameView → WheelView)
.env.example   N8N_READ_URL / N8N_WRITE_URL
```

## Setup & run

```bash
# 1. Build the frontend
cd frontend
npm install
npm run build            # → frontend/dist

# 2. Backend deps
cd ../backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 3. Config — copy and fill webhook URLs (or leave blank for MOCK mode)
cd ..
cp .env.example .env

# 4. Run (serves the built SPA + API on one port)
cd backend
.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000
# open http://localhost:8000
```

### Dev mode (hot reload)

```bash
# terminal 1 — backend
cd backend && .venv/bin/uvicorn app:app --reload --port 8000
# terminal 2 — vite dev server (proxies /check /draw /stock to :8000)
cd frontend && npm run dev
```

### Logo

The logo PNG is already exported to `frontend/public/logo.png`. To re-export from the source
Illustrator file:

```bash
sips -s format png "public/AI 365 T-shirt-Back Design-FA.ai" --out frontend/public/logo.png
# then rebuild: cd frontend && npm run build
```

## n8n webhook contract

Set `N8N_READ_URL` and `N8N_WRITE_URL` in `.env`.

**READ** (GET, or POST `{}`) — returns current stock + claimed names. n8n derives stock from the
claims log (`stock = 30 − count(claims of that goodie)`):

```json
{
  "shirt":   { "label": "T-Shirt",  "stock": 27 },
  "tote":    { "label": "Tote Bag", "stock": 30 },
  "charger": { "label": "Charger",  "stock": 25 },
  "claimed": ["alice", "bob carter"]
}
```

`claimed` = lowercased/trimmed names for dedupe. (Bare numbers also accepted: `"shirt": 27`.)

**WRITE** (POST) — n8n appends one Excel row:

```json
{ "ts": "2026-06-09T14:03:00", "name": "Alice", "label": "T-Shirt", "goodie_id": "shirt" }
```

Webhook calls retry with exponential backoff; on persistent failure `/draw` returns `503` and
records nothing (guest re-spins).

## API

| Method | Path     | Body     | Returns                                                                |
|--------|----------|----------|-----------------------------------------------------------------------|
| POST   | `/check` | `{name}` | `200 {ok:true}` · `400 empty_name` · `409 already_claimed {previous}`  |
| POST   | `/draw`  | `{name}` | `200 {type:"prize",goodie_id,label}` / `{type:"spin_again"}` · `409 already_claimed`/`sold_out` · `503` |
| GET    | `/stock` | —        | `{shirt:N, tote:N, charger:N}`                                         |
| GET    | `/`      | —        | Vue SPA                                                                |
