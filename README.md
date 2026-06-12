# AI 365 Lucky Draw Spin Wheel

Saturday-event giveaway kiosk. On a single landscape screen the guest types their name, taps
**SPIN** an 8-segment wheel, and a win dialog shows the prize (T-Shirt 20 / Tote Bag 40 / Charger 20)
or invites a re-spin. Built to run on a **MAXHUB touch panel**.

- **Frontend-only deploy.** A static Vue 3 app (Netlify) calls **one n8n webhook** directly. No backend, no database.
- **Stock lives in the frontend** (seeded in code, persisted to `localStorage`). The n8n webhook only appends the winner to the Google Sheet guest list.
- **Frontend picks the prize**; the wheel animates to it and records the win.
- **Odds:** Spin Again is a flat 10%; the other 90% splits across the in-stock goodies weighted by each one's remaining stock, so a goodie with more units left wins more often and the pool drains evenly.
- **No name check.** Single kiosk = one user at a time.

## Architecture

```
MAXHUB browser ─▶ Netlify (static Vue SPA) ─▶ n8n write webhook ─▶ Google Sheet
```

- `frontend/` — Vue 3 + Vite single-screen kiosk (`src/views/KioskView.vue`).
- `netlify.toml` — Netlify build config (base `frontend`, publish `dist`).
- `docs/n8n-workflow.json` — the single webhook workflow (append winner to guest list).

## How it works

- **Stock is seeded in the frontend** (`STOCK_SEED` in `src/views/KioskView.vue`, T-Shirt 20 / Tote Bag 40 / Charger 20) and
  persisted to `localStorage` under `ai365.stock`, so an accidental page refresh keeps the running
  counts. Bump `STOCK_VERSION` whenever you change the seed — it resets saved counts to the new numbers.
- The seed counts are the legend bar's 100% mark.
- The wheel picks the outcome client-side: Spin Again 10%, the rest split across in-stock goodies
  weighted by remaining stock. When every goodie is sold out, a spin shows the "All prizes claimed" dialog.
- On a win the frontend decrements its count, saves it, then POSTs `{ name, goodie_id, label }` so
  n8n appends the winner to the Google Sheet guest list. The response is ignored — stock is local.
- Blank webhook URL → **mock mode**: no network (no guest-list logging), spins still work.

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

One **POST** webhook, one behavior: append the winner to the guest list. Responds **HTTP 200**.
Set the Webhook node's **Allowed Origins (CORS)** to your Netlify domain (or `*` while testing).

| Call | Request | Response |
|------|---------|----------|
| record win | POST `{ name, goodie_id, label }` | HTTP 200 (body ignored) |

**Workflow logic** (`docs/n8n-workflow.json`):

- Append the guest to the **Guest list** tab (`[name, label]`).
- Called only on a real win — Spin Again sends nothing. Stock is tracked in the frontend, not here.

**Google Sheet** (one spreadsheet, one tab):

- **Guest list** (`gid=0`) — columns `Name `, `Gift`

After importing the workflow, re-select the `Guest list` sheet on the Sheets node and confirm the
Google Sheets credential, then activate it.

> Single-kiosk note: only one person interacts at a time. Stock is `localStorage`-per-browser, so
> running it on multiple panels gives each its own independent counts.

## Brand art

The logo and mascot PNGs live at `frontend/public/ai365-logo.png` (brand title) and
`frontend/public/mascot.png` (wheel hub + win dialog + favicon).
