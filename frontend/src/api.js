// Single n8n webhook helper. The workflow only appends the winner to the guest
// list now — stock lives in the frontend (see KioskView.vue). recordWin() fires
// after a win to log it; the response is ignored.
// Blank URL => mock mode (no network, local stock only).

const WRITE_URL = import.meta.env?.VITE_N8N_WRITE_URL

export async function recordWin(name, goodie_id, label) {
  if (!WRITE_URL) return {} // mock mode: no network write
  try {
    const res = await fetch(WRITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, goodie_id, label }),
    })
    return await res.json()
  } catch {
    return {}
  }
}

// Gift page: send guest details + photo to n8n, get back the hug image.
// Blank URL => mock mode (returns the mascot placeholder, no network).
// `import.meta.env` is guarded so this file also runs under plain node for tests.
const GIFT_URL = import.meta.env?.VITE_N8N_GIFT_URL

// Raw base64 (no `data:...;base64,` prefix). Uses arrayBuffer + btoa so it
// works in both the browser and node (no FileReader).
export async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// The gift workflow only responds when it finishes (~53s), so a fast rejection
// means the webhook is unreachable (404/network) while a request still open after
// a short grace means it was accepted. Returns 'done' | 'failed' | 'accepted'
// without consuming the promise (await it yourself afterwards for the result).
export function probeAccepted(promise, graceMs = 1500) {
  return Promise.race([
    promise.then(() => 'done', () => 'failed'),
    new Promise((r) => setTimeout(() => r('accepted'), graceMs)),
  ])
}

export async function generateGift({ name, email, phone, photo }, url = GIFT_URL) {
  const photo_base64 = await fileToBase64(photo)
  if (!url) {
    await new Promise((r) => setTimeout(r, 1500)) // mock: simulate gen time
    return { image_url: '/mascot.png' }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, phone, photo_base64 }),
  })
  if (!res.ok) throw new Error(`gift gen failed: ${res.status}`)
  const data = await res.json()
  // n8n may reject the upload (e.g. unsupported type) with { error: "..." }
  if (data.error) throw new Error(data.error)
  // accept n8n shapes: { image_url } | { image_base64 } | { resultUrls: [url] }
  return { image_url: data.image_url ?? data.image_base64 ?? data.resultUrls?.[0] }
}
