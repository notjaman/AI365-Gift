# Mascot Hug Gift Page — Design

## Purpose

A QR-reachable web page where a guest fills a short form (name, email, phone) and
adds a photo, which is sent to n8n. n8n logs the lead to a Google Sheet and generates
an image of the guest hugging the AI 365 mascot. The page then shows the generated
image with **Share** (to Instagram/Facebook story etc. via the OS share sheet) and
**Download** buttons.

This is a second flow in the existing single-page kiosk app — independent from the
lucky-draw kiosk, which stays untouched.

## Constraints / decisions

- **No web deep-link can pre-fill an Instagram/Facebook story with an image.** Sharing
  uses the **Web Share API** (`navigator.share` with a `File`) → OS share sheet → user
  picks IG/FB/etc. Download button is the fallback. (Best-effort `instagram-stories://`
  schemes and async polling are explicitly out of scope; see Out of scope.)
- **Sync n8n contract.** Frontend POSTs once; n8n holds the request open until the image
  is generated and responds with the image URL. Accepted risk: long generation may hit a
  webhook/proxy timeout (~100s). Upgrade path: async polling (out of scope for now).
- **Photo sent as base64 in JSON**, matching the existing `recordWin()` JSON style.
- **Native over libraries:** HTML5 input validation, native file input with camera capture,
  `<a download>`. No new dependencies. No vue-router.

## Structure — second Vite entry

Vite supports multiple HTML entry points. Add:

- `frontend/gift.html` — entry HTML (mirrors `index.html`, mounts gift app).
- `frontend/src/gift-main.js` — `createApp(GiftView).mount('#app')`, imports `./style.css`.
- `frontend/src/views/GiftView.vue` — the gift flow component.
- `frontend/vite.config.js` — add `build.rollupOptions.input` with both `index.html` and
  `gift.html` so `npm run build` emits both into `dist/`.

The QR code points to `https://<site>/gift.html`. Netlify already publishes `dist/`; both
HTML files ship. No redirect rules needed (real files, not client routes). The kiosk
(`index.html` / `KioskView.vue`) is unchanged.

## GiftView.vue — three states

A single component with a `state` ref taking values `form | loading | result | error`.

1. **form** — fields:
   - Name — `<input type="text" required>`
   - Email — `<input type="email" required>`
   - Phone — `<input type="tel" required>`
   - Photo — `<input type="file" accept="image/*" capture="environment" required>`
     (mobile: offers camera or gallery)
   - Submit button. Native HTML5 validation gates submit (wrap in `<form @submit.prevent>`).
2. **loading** — spinner / "Generating your photo…" while the sync fetch is open.
3. **result** — the generated image, **Share** button, **Download** button, "Start over" link.
   - Share button shown only if `navigator.canShare?.({ files: [...] })` is supported
     (hidden on desktop browsers that lack file share); Download always shown.
4. **error** — message + **Retry** button. Form field values are preserved (no data loss);
   retry re-submits the same data.

## Data flow

```
GiftView (form)
  → api.generateGift({ name, email, phone, photo })
      → POST VITE_N8N_GIFT_URL
         body: { name, email, phone, photo_base64 }   (JSON)
      ← 200: { image_url }            (preferred)
        or  { image_base64 }          (fallback handled if present)
  → state = result, render image
  → Share / Download
```

### api.js additions

Add to `frontend/src/api.js`:

```
const GIFT_URL = import.meta.env.VITE_N8N_GIFT_URL

export async function generateGift({ name, email, phone, photo }) {
  const photo_base64 = await fileToBase64(photo)   // FileReader → dataURL → strip prefix
  if (!GIFT_URL) {                                  // mock mode
    await delay(1500)
    return { image_url: '/mascot.png' }
  }
  const res = await fetch(GIFT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, phone, photo_base64 }),
  })
  if (!res.ok) throw new Error(`gift gen failed: ${res.status}`)
  const data = await res.json()
  return { image_url: data.image_url ?? data.image_base64 }
}
```

- `fileToBase64` returns the base64 payload without the `data:image/...;base64,` prefix
  (a small helper; n8n receives raw base64).
- Blank `VITE_N8N_GIFT_URL` → **mock mode**: returns `/mascot.png` after ~1.5 s so the full
  UI (loading → result → share/download) is testable offline, mirroring existing mock-mode
  behavior.
- Non-200 throws → GiftView catches → error state.

## Share / Download

- **Download:** `<a :href="imageUrl" download="ai365-hug.png">Download</a>`. One line, native.
  Works for both a remote URL and a data URL.
- **Share:** on click —
  1. `fetch(imageUrl)` → `blob()` → `new File([blob], 'ai365-hug.png', { type: blob.type })`
  2. `if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title, text })`
  3. share sheet lets the user pick Instagram / Facebook / Messages / etc.
- Feature-detect with `navigator.canShare({ files })`; hide the Share button when unsupported.

## Error handling

- Network failure or non-200 → `error` state with a retry button; form values retained so
  the guest re-submits without re-entering anything (the photo File is kept in component state).
- Share rejection/cancel (`navigator.share` throws `AbortError`) → ignored silently (user
  cancelled); other share errors → fall back to suggesting Download.

## Environment

Add to `frontend/.env.example` and README:

```
VITE_N8N_GIFT_URL=https://your-n8n-host/webhook/<gift-id>
```

Baked at build time (only `VITE_`-prefixed vars reach the browser), same as the existing
`VITE_N8N_WRITE_URL`. Blank → mock mode.

## n8n contract (for the n8n side)

One **POST** webhook:

| Call | Request | Response |
|------|---------|----------|
| generate gift | POST `{ name, email, phone, photo_base64 }` | HTTP 200 `{ image_url }` |

Workflow: append `{ name, email, phone }` to a leads sheet/tab, run image generation
(guest photo + mascot), respond synchronously with the generated `image_url`. Set the
Webhook node's Allowed Origins (CORS) to the Netlify domain.

## Testing

One runnable self-check (no framework), per the project's lazy-but-checked rule:

- Assert `fileToBase64` strips the data-URL prefix and returns the raw base64 for a known
  small input (use a `Blob`/`File` built from fixed bytes).
- Assert mock-mode `generateGift` (blank URL) resolves to `{ image_url: '/mascot.png' }`.
- Assert the posted JSON body shape is `{ name, email, phone, photo_base64 }` (e.g. stub
  `fetch`, inspect the body).

A small `*.test.js` or an `assert`-based `demo()` — smallest thing that fails if the
base64/payload logic breaks.

## Out of scope (YAGNI)

- **vue-router** — separate Vite entry chosen instead.
- **Async polling for the generated image** — sync webhook chosen. Add when generation
  time exceeds the webhook/proxy timeout.
- **`instagram-stories://` / Facebook story URL schemes** — not reliable from mobile web;
  Web Share API covers it.
- **Auth / rate limiting / spam protection** on the form — not requested; single event use.
```