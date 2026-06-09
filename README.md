# AI 365 Lucky Draw Spin Wheel

Saturday-event giveaway kiosk. On a single landscape screen the guest types their name, taps
**SPIN** an 8-segment wheel, and a win dialog shows the prize (T-Shirt / Tote Bag / Charger, 30
each) or invites a re-spin. Built to run on a **MAXHUB touch panel**.

- **Frontend-only deploy.** A static Vue 3 app (Netlify) calls **n8n webhooks** directly. No backend, no database.
- **Source of truth = Excel** (behind n8n). Each claim is one appended row.
- **n8n decides the prize** (anti-cheat); the wheel only animates to the result.
- **Flat-equal odds** among in-stock goodies + spin-again (8 segments: 2× each goodie, 2× spin-again).
- **One claim per name** (case-insensitive, trimmed). Single kiosk = one user at a time.

## Architecture

```
MAXHUB browser ─▶ Netlify (static Vue SPA) ─▶ n8n webhooks ─▶ Excel
```

- `frontend/` — Vue 3 + Vite single-screen kiosk (`src/views/KioskView.vue`).
- `netlify.toml` — Netlify build config (base `frontend`, publish `dist`).
- n8n — three webhooks (`check` / `draw` / `stock`) hold all the logic + Excel I/O.

## Local dev

```bash
cd frontend
cp .env.example .env        # fill in your VITE_N8N_* webhook URLs
npm install
npm run dev                 # Vite dev server
# build for deploy:
npm run build               # → frontend/dist
```

Env vars (`frontend/.env`, baked at build time — only `VITE_`-prefixed vars reach the browser):

```
VITE_N8N_CHECK_URL=https://your-n8n-host/webhook/lucky-draw-check
VITE_N8N_DRAW_URL=https://your-n8n-host/webhook/lucky-draw-draw
VITE_N8N_STOCK_URL=https://your-n8n-host/webhook/lucky-draw-stock
```

## Deploy (Netlify)

`netlify.toml` already sets `base = "frontend"`, `command = "npm run build"`, `publish = "dist"`.
Set the three `VITE_N8N_*` env vars in **Site settings → Environment variables**, then deploy.
Single page, no client routing → no redirect rules needed.

## Run on the MAXHUB

Open the Netlify URL in the panel's browser and go full-screen (landscape). The viewport already
blocks pinch-zoom; CSS disables long-press selection, pull-to-refresh, and double-tap zoom. The
on-screen keyboard appears when the name field is focused.

## n8n webhook contract

Each webhook responds **HTTP 200** with a JSON `{ result: ... }` body (the frontend `api.js` maps
`result` to its UI states). Set each Webhook node's **Allowed Origins (CORS)** to your Netlify domain.

| Webhook | Request | Responses (`result`) |
|---------|---------|----------------------|
| `check` | POST `{name}` | `ok` · `empty_name` · `already_claimed` (+ `previous`) |
| `draw`  | POST `{name}` | `prize` (+ `goodie_id`, `label`) · `spin_again` · `already_claimed` (+ `previous`) · `sold_out` |
| `stock` | GET | `{ shirt:N, tote:N, charger:N }` |

**Logic the workflows must implement:**

- **Normalize name** for matching: `strip().lower()`.
- **One claim per name** — `already_claimed` returns the previously won label as `previous`.
- **Weighted pick** (`draw`): pool = each in-stock goodie ×2 + `spin_again` ×2, then random choice.
  If no goodie is in stock → `sold_out`.
- **Derived stock** — don't store a mutable counter. Compute `remaining = total − count(claims for
  that goodie)`. Initial totals = 30/30/30 (n8n config). The `stock` webhook returns these counts;
  the wheel greys out sold-out wedges.
- **Claim row** (on a `prize`) appended to Excel: `{ ts, name, label, goodie_id }`.

> Single-kiosk note: only one person interacts at a time, so no server-side lock is needed. If you
> ever run multiple panels concurrently, add an n8n mutex before the draw to avoid a double-claim race.

## Logo

The logo PNG lives at `frontend/public/logo.png`. To re-export from the source Illustrator file:

```bash
sips -s format png "public/AI 365 T-shirt-Back Design-FA.ai" --out frontend/public/logo.png
# then rebuild: cd frontend && npm run build
```
