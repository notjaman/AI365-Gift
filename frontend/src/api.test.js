// Run: node frontend/src/api.test.js
import assert from 'node:assert'
import { recordWin, fileToBase64, generateGift } from './api.js'

// fileToBase64 returns raw base64 (no data-URL prefix) for known bytes.
// "Hi" => SGk=
const file = new Blob([new Uint8Array([72, 105])]) // "Hi"
const b64 = await fileToBase64(file)
assert.strictEqual(b64, 'SGk=', `expected SGk=, got ${b64}`)

// Mock mode (no VITE_N8N_GIFT_URL under node) returns the mascot placeholder.
const mock = await generateGift({ name: 'A', email: 'a@b.c', phone: '1', photo: file })
assert.strictEqual(mock.image_url, '/mascot.png', `mock image_url wrong: ${mock.image_url}`)

// Real call posts the expected JSON body shape and reads image_url.
let captured
globalThis.fetch = async (url, opts) => {
  captured = { url, body: JSON.parse(opts.body) }
  return { ok: true, json: async () => ({ image_url: 'https://x/i.png' }) }
}
const res = await generateGift(
  { name: 'A', email: 'a@b.c', phone: '1', photo: file },
  'https://n8n/webhook/gift', // explicit URL overrides mock for the test
)
assert.deepStrictEqual(Object.keys(captured.body).sort(), ['email', 'name', 'phone', 'photo_base64'])
assert.strictEqual(captured.body.photo_base64, 'SGk=')
assert.strictEqual(res.image_url, 'https://x/i.png')

// Accepts n8n's { resultUrls: [url] } shape.
globalThis.fetch = async () => ({ ok: true, json: async () => ({ resultUrls: ['https://x/r.jpg'] }) })
const res2 = await generateGift({ name: 'A', email: 'a@b.c', phone: '1', photo: file }, 'https://n8n/webhook/gift')
assert.strictEqual(res2.image_url, 'https://x/r.jpg', `resultUrls not read: ${res2.image_url}`)

// { error } from n8n (e.g. unsupported file type) rejects with that message.
globalThis.fetch = async () => ({ ok: true, json: async () => ({ error: 'Unsupported file type.' }) })
await assert.rejects(
  generateGift({ name: 'A', email: 'a@b.c', phone: '1', photo: file }, 'https://n8n/webhook/gift'),
  /Unsupported file type/,
)

console.log('api.test.js OK')
