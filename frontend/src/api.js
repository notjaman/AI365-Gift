// Thin n8n-webhook helpers. Each returns { status, data } so the views keep
// the same contract the old FastAPI backend used. n8n always responds HTTP 200
// with a `result` field; we translate that into a synthetic status here.

const CHECK_URL = import.meta.env.VITE_N8N_CHECK_URL
const DRAW_URL = import.meta.env.VITE_N8N_DRAW_URL
const STOCK_URL = import.meta.env.VITE_N8N_STOCK_URL

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  try {
    return await res.json()
  } catch {
    return {}
  }
}

export async function checkName(name) {
  const d = await postJson(CHECK_URL, { name })
  switch (d.result) {
    case 'already_claimed':
      return { status: 409, data: { error: 'already_claimed', previous: d.previous } }
    case 'empty_name':
      return { status: 400, data: {} }
    case 'ok':
      return { status: 200, data: { ok: true } }
    default:
      return { status: 503, data: {} }
  }
}

export async function drawPrize(name) {
  const d = await postJson(DRAW_URL, { name })
  switch (d.result) {
    case 'prize':
      return { status: 200, data: { type: 'prize', goodie_id: d.goodie_id, label: d.label } }
    case 'spin_again':
      return { status: 200, data: { type: 'spin_again' } }
    case 'already_claimed':
      return { status: 409, data: { error: 'already_claimed', previous: d.previous } }
    case 'sold_out':
      return { status: 409, data: { error: 'sold_out' } }
    default:
      return { status: 503, data: {} }
  }
}

export async function getStock() {
  try {
    const res = await fetch(STOCK_URL)
    return await res.json()
  } catch {
    return {}
  }
}
