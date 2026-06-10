// Single n8n webhook helper. The frontend picks the prize and tracks stock
// locally; this only records the win (append guest + decrement stock server-side).
// The webhook responds { result, goodie_id, remaining }. Blank URL => mock mode.

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
