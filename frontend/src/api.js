// Thin fetch helpers. Each returns { status, data }.
async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  return { status: res.status, data }
}

export function checkName(name) {
  return post('/check', { name })
}

export function drawPrize(name) {
  return post('/draw', { name })
}

export async function getStock() {
  const res = await fetch('/stock')
  try {
    return await res.json()
  } catch {
    return {}
  }
}
