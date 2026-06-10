// Single n8n webhook helper. n8n + Google Sheets is the source of truth for stock.
// recordWin() records a win (append guest + decrement stock server-side) and gets
// back { result, goodie_id, remaining }. fetchStock() reads the live counts on load.
// Blank URL => mock mode (local stock only, no network).

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

// Read the current stock counts from n8n. No goodie_id => the workflow's read
// branch responds { stock: { shirt: n, tote: n, charger: n } }.
export async function fetchStock() {
  if (!WRITE_URL) return {} // mock mode: no network read
  try {
    const res = await fetch(WRITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stock' }),
    })
    const data = await res.json()
    return data.stock || {}
  } catch {
    return {}
  }
}
