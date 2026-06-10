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
- `n8n/update-guest-list.workflow.json` — the single webhook: appends the guest + decrements stock.

## How it works

- Stock is seeded **30 per goodie locally** in the frontend (matches the Gifts sheet seed).
- The wheel picks the outcome client-side. A sold-out goodie (local count 0) falls back to Spin Again.
- On a win the frontend decrements its local count, then POSTs `{ name, goodie_id, label }` to the
  webhook. The webhook appends the guest row, decrements the sheet, and returns `remaining`, which the
  frontend uses to sync that goodie's chip count.
- Blank webhook URL → **mock mode**: spins work, stock decrements locally, no network call.

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

One **POST** webhook. Responds **HTTP 200** with JSON. Set the Webhook node's **Allowed Origins
(CORS)** to your Netlify domain (or `*` while testing). Full detail in `docs/n8n-webhooks.md`.

| Webhook | Request | Response |
|---------|---------|----------|
| update guest list | POST `{ name, goodie_id, label }` | `{ result:"ok", goodie_id, remaining }` |

**Workflow logic** (`n8n/update-guest-list.workflow.json`):

- Append `{ name, goodie_id, label, timestamp }` to the **Guests** sheet.
- Decrement that goodie's `remaining` by 1 in the **Gifts** sheet; return the new `remaining`.
- Called only on a real win — Spin Again sends nothing.

**Google Sheet** (one spreadsheet, two tabs):

- **Guests** — columns `name`, `goodie_id`, `label`, `timestamp`
- **Gifts** — seed 30 each:

  | goodie_id | label    | remaining |
  |-----------|----------|-----------|
  | shirt     | T-Shirt  | 30        |
  | tote      | Tote Bag | 30        |
  | charger   | Charger  | 30        |

After importing the workflow, set `YOUR_GOOGLE_SHEET_ID` and the Google Sheets credential on each
Sheets node, then activate it.

> Single-kiosk note: only one person interacts at a time, so no server-side lock is needed. Local
> stock and the sheet can drift if multiple panels run concurrently — add a read-back or mutex first.

## Logo

The logo PNG lives at `frontend/public/logo.png`. To re-export from the source Illustrator file:

```bash
sips -s format png "public/AI 365 T-shirt-Back Design-FA.ai" --out frontend/public/logo.png
# then rebuild: cd frontend && npm run build
```
