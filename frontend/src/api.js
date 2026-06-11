// Single n8n webhook helper. The workflow only appends the winner to the guest
// list now — stock lives in the frontend (see KioskView.vue). recordWin() fires
// after a win to log it; the response is ignored.
// Blank URL => mock mode (no network, local stock only).

const WRITE_URL = import.meta.env.VITE_N8N_WRITE_URL

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
