# AI 365 Lucky Draw Spin Wheel

Saturday-event giveaway kiosk. On a single landscape screen the guest types their name, taps
**SPIN** an 8-segment wheel, and a win dialog shows the prize (T-Shirt / Tote Bag / Charger, 30
each) or invites a re-spin. Built to run on a **MAXHUB touch panel**.

- **Frontend-only deploy.** A static Vue 3 app (Netlify) calls **one n8n webhook** directly. No backend, no database.
- **Source of truth = Google Sheet** (behind n8n). Each win is one appended row.
- **Frontend picks the prize**; the wheel animates to it and records the win.
- **Flat-equal odds** among in-stock goodies + spin-again (8 segments: 2× each goodie, 2× spin-again).
- **No name check.** Single kiosk = one user at a time.

## Architecture

```
MAXHUB browser ─▶ Netlify (static Vue SPA) ─▶ n8n write webhook ─▶ Google Sheet
```

- `frontend/` — Vue 3 + Vite single-screen kiosk (`src/views/KioskView.vue`).
- `netlify.toml` — Netlify build config (base `frontend`, publish `dist`).
- `docs/n8n-workflow.json` — the single webhook workflow (read stock + record win).

## How it works

- **Stock lives in the Google Sheet `Stock` tab** (via n8n) — there is no hardcoded stock in
  the frontend. On load the app POSTs `{ action: "stock" }` and renders the live counts; the
  first count seen per goodie is the legend bar's 100% mark.
- The wheel picks the outcome client-side. A sold-out goodie (count 0) falls back to Spin Again.
- On a win the frontend optimistically decrements its chip, then POSTs `{ name, goodie_id, label }`.
  n8n checks stock, appends the guest row, decrements the sheet, and returns `remaining`, which the
  frontend uses to sync that goodie's count. If stock is 0, n8n responds `sold_out` and writes nothing.
- Blank webhook URL → **mock mode**: no network, legend shows no counts, spins still work.

## Local dev

```bash
cd frontend
cp .env.example .env        # fill in VITE_N8N_WRITE_URL (or leave blank for mock mode)
npm install
npm run dev                 # Vite dev server
# build for deploy:
npm run build               # → frontend/dist
```

Env var (`frontend/.env`, baked at build time — only `VITE_`-prefixed vars reach the browser):

```
VITE_N8N_WRITE_URL=https://your-n8n-host/webhook/<id>
```

## Deploy (Netlify)

`netlify.toml` already sets `base = "frontend"`, `command = "npm run build"`, `publish = "dist"`.
Set `VITE_N8N_WRITE_URL` in **Site settings → Environment variables**, then deploy.
Single page, no client routing → no redirect rules needed.

## Run on the MAXHUB

Open the Netlify URL in the panel's browser and go full-screen (landscape). The viewport already
blocks pinch-zoom; CSS disables long-press selection, pull-to-refresh, and double-tap zoom. The
on-screen keyboard appears when the name field is focused.

## n8n webhook contract

One **POST** webhook, two behaviors (branched on whether the body has a `goodie_id`). Responds
**HTTP 200** with JSON. Set the Webhook node's **Allowed Origins (CORS)** to your Netlify domain
(or `*` while testing).

| Call | Request | Response |
|------|---------|----------|
| read stock (on load) | POST `{ action: "stock" }` | `{ stock: { shirt, tote, charger } }` |
| record win | POST `{ name, goodie_id, label }` | `{ result:"ok", goodie_id, remaining }` |
| record win (sold out) | POST `{ name, goodie_id, label }` | `{ result:"sold_out", goodie_id, remaining:0 }` |

**Workflow logic** (`docs/n8n-workflow.json`):

- No `goodie_id` → read the **Stock** tab and return `{ stock: {...} }`.
- Has `goodie_id` → read stock; if in stock, append the guest to **Guest list** and decrement
  the **Stock** tab, returning the new `remaining`; if 0, return `sold_out` and write nothing.
- Called only on a real win — Spin Again sends nothing.

**Google Sheet** (one spreadsheet, two tabs):

- **Guest list** (`gid=0`) — columns `Name `, `Gift`
- **Stock** — seed 30 each:

  | goodie_id | label    | stock |
  |-----------|----------|-------|
  | shirt     | T-Shirt  | 30    |
  | tote      | Tote Bag | 30    |
  | charger   | Charger  | 30    |

After importing the workflow, re-select the `Stock` sheet on each Sheets node (Read Stock,
Read Stock 2, Update Stock) and confirm the Google Sheets credential, then activate it.

> Single-kiosk note: only one person interacts at a time, so no server-side lock is needed. Under
> concurrent panels the read-modify-write on stock can race — add a mutex first.

## Brand art

The logo and mascot PNGs live at `frontend/public/ai365-logo.png` (brand title) and
`frontend/public/mascot.png` (wheel hub + win dialog + favicon).
