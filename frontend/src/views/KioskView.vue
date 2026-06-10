<template>
  <div class="kiosk">
    <!-- Settings: interaction-mode toggle, top-right corner. -->
    <button class="settings-btn" aria-label="Settings" @click="settingsOpen = !settingsOpen">⚙</button>
    <div v-if="settingsOpen" class="settings-panel">
      <p class="settings-title">Spin by</p>
      <div class="settings-toggle">
        <button :class="{ active: mode === 'cursor' }" @click="setMode('cursor')">🖱 Cursor</button>
        <button :class="{ active: mode === 'hand' }" @click="setMode('hand')">✋ Hand</button>
      </div>
    </div>

    <!-- Left: the wheel only, ~60% width. Click/flick to spin. -->
    <section class="kiosk-left">
      <div
        class="wheel-wrap"
        :class="`mode-${mode}`"
        @click="onWheelClick"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
      >
        <div class="pointer"></div>
        <canvas
          ref="canvas"
          class="wheel-canvas"
          width="640"
          height="640"
          :style="{ transform: `rotate(${rotation}deg)` }"
        ></canvas>
        <div class="hub">{{ mode === 'hand' ? 'FLICK' : 'TAP' }}</div>
      </div>
    </section>

    <!-- Right: stock legend (top) + name (below). -->
    <section class="kiosk-right">
      <div class="legend">
        <div
          v-for="g in GOODIES"
          :key="g.id"
          class="legend-row"
          :class="{ out: (stock[g.id] ?? 1) <= 0 }"
        >
          <span class="legend-name">
            <span class="dot" :style="{ background: g.color }"></span>
            {{ g.label }}
          </span>
          <span class="legend-count">{{ legendText(g.id) }}</span>
        </div>
      </div>

      <div class="name-pane">
        <img class="logo" src="/logo.png" alt="AI 365" />
        <h1 class="title">AI 365 Lucky Draw</h1>
        <p class="subtitle">Enter your name, then spin the wheel 🎡</p>
        <input
          v-model="name"
          class="field"
          type="text"
          placeholder="Your name"
          autocomplete="off"
          :disabled="spinning || dialogOpen"
          @keyup.enter="spin"
        />
        <p v-if="msg" class="msg" :class="msgClass">{{ msg }}</p>
      </div>
    </section>

    <!-- Win / outcome dialog. -->
    <div v-if="dialogOpen" class="dialog-overlay">
      <div class="dialog confetti-pop">
        <p class="dialog-text" :class="{ win: dialogWin }">{{ dialogText }}</p>
        <button class="btn" @click="next">Next →</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { recordWin } from '../api.js'

// Stock is tracked locally, seeded per goodie; synced from each win's response.
const SEED = 30

// 8 segments: 2x each goodie + 2x spin_again, interleaved for visual balance.
const SEGMENTS = [
  { id: 'shirt', label: 'T-Shirt', color: '#3060a8' },
  { id: 'spin_again', label: 'Spin Again', color: '#9fb0c9' },
  { id: 'tote', label: 'Tote Bag', color: '#60c0d8' },
  { id: 'charger', label: 'Charger', color: '#f06018' },
  { id: 'shirt', label: 'T-Shirt', color: '#3060a8' },
  { id: 'spin_again', label: 'Spin Again', color: '#9fb0c9' },
  { id: 'tote', label: 'Tote Bag', color: '#60c0d8' },
  { id: 'charger', label: 'Charger', color: '#f06018' },
]
const SEG = 360 / SEGMENTS.length // 45deg

// The 3 unique goodies (id/label/color), reusing what SEGMENTS already defines.
const GOODIES = [...new Map(SEGMENTS.filter((s) => s.id !== 'spin_again').map((s) => [s.id, s])).values()].map(
  ({ id, label, color }) => ({ id, label, color }),
)

const canvas = ref(null)
const rotation = ref(0)
const name = ref('')
const spinning = ref(false)
const msg = ref('')
const msgClass = ref('')
const stock = ref({})
const dialogOpen = ref(false)
const dialogText = ref('')
const dialogWin = ref(false)

// Interaction mode: 'cursor' (click to spin) or 'hand' (drag-flick to spin).
const mode = ref(localStorage.getItem('spinMode') || 'cursor')
const settingsOpen = ref(false)
const downPt = ref(null) // pointer start, for flick detection in hand mode

function setMode(m) {
  mode.value = m
  localStorage.setItem('spinMode', m)
  settingsOpen.value = false
}

onMounted(() => {
  stock.value = Object.fromEntries(GOODIES.map((g) => [g.id, SEED]))
  drawWheel()
})

function isSoldOut(id) {
  return id !== 'spin_again' && (stock.value[id] ?? 1) <= 0
}

// Legend count: "N / total" remaining, or sold-out / placeholder.
function legendText(id) {
  const n = stock.value[id]
  if (n === undefined || n === null) return `… / ${SEED}`
  return n <= 0 ? 'Sold out' : `${n} / ${SEED}`
}

// Cursor mode: a plain click on the wheel spins.
function onWheelClick() {
  if (mode.value === 'cursor') spin()
}

// Hand mode: spin when a pointer drag travels past a small threshold (a flick).
function onPointerDown(e) {
  if (mode.value !== 'hand') return
  downPt.value = { x: e.clientX, y: e.clientY }
}

function onPointerUp(e) {
  if (mode.value !== 'hand' || !downPt.value) return
  const dx = e.clientX - downPt.value.x
  const dy = e.clientY - downPt.value.y
  downPt.value = null
  if (Math.hypot(dx, dy) > 24) spin()
}

function drawWheel() {
  const c = canvas.value
  const ctx = c.getContext('2d')
  const R = c.width / 2
  ctx.clearRect(0, 0, c.width, c.height)
  SEGMENTS.forEach((s, i) => {
    // Segment i centered at i*SEG from top (top = -90deg), clockwise.
    const center = -90 + i * SEG
    const start = ((center - SEG / 2) * Math.PI) / 180
    const end = ((center + SEG / 2) * Math.PI) / 180
    ctx.beginPath()
    ctx.moveTo(R, R)
    ctx.arc(R, R, R - 6, start, end)
    ctx.closePath()
    ctx.fillStyle = isSoldOut(s.id) ? '#c8d0dd' : s.color
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    ctx.stroke()

    // Label — sits on its own wedge, reading outward along the spoke.
    ctx.save()
    ctx.translate(R, R)
    ctx.rotate((center * Math.PI) / 180)
    ctx.translate(R * 0.62, 0)
    if (Math.cos((center * Math.PI) / 180) < 0) ctx.rotate(Math.PI)
    ctx.fillStyle = isSoldOut(s.id) ? '#7c8aa0' : '#ffffff'
    ctx.font = 'bold 30px Segoe UI, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s.label, 0, 0)
    ctx.restore()
  })
}

// Pick which physical segment index to land on for a given server result.
function targetIndex(result) {
  const wantId = result.type === 'prize' ? result.goodie_id : 'spin_again'
  const matches = SEGMENTS.map((s, i) => (s.id === wantId ? i : -1)).filter((i) => i >= 0)
  return matches[Math.floor(Math.random() * matches.length)]
}

function openDialog(text, win = false) {
  dialogText.value = text
  dialogWin.value = win
  dialogOpen.value = true
  spinning.value = false
}

function showInline(text, cls = '') {
  msg.value = text
  msgClass.value = cls
  spinning.value = false
}

// Decide the outcome client-side, weighted by the physical wheel (2 of each
// goodie + 2 spin_again). Landing on a sold-out goodie falls back to spin_again.
function pickOutcome() {
  const seg = SEGMENTS[Math.floor(Math.random() * SEGMENTS.length)]
  if (seg.id === 'spin_again' || isSoldOut(seg.id)) return { type: 'spin_again' }
  return { type: 'prize', goodie_id: seg.id, label: seg.label }
}

async function spin() {
  if (spinning.value || dialogOpen.value) return
  const n = name.value.trim()
  if (!n) {
    showInline('Please enter your name.', 'error')
    return
  }

  // Nothing left to give.
  if (GOODIES.every((g) => isSoldOut(g.id))) {
    openDialog('All goodies claimed — thank you! 🙏')
    return
  }

  spinning.value = true
  msg.value = ''
  msgClass.value = ''

  const outcome = pickOutcome()

  // Animate the wheel to land on the matching segment.
  const idx = targetIndex(outcome)
  const jitter = (Math.random() - 0.5) * (SEG * 0.5)
  const base = rotation.value - (rotation.value % 360) // normalize
  const landing = -(idx * SEG) + jitter
  rotation.value = base + 360 * 6 + landing

  // Wait for the CSS transition (~4.2s) before revealing the result.
  setTimeout(() => {
    if (outcome.type === 'spin_again') {
      showInline('Spin again! 🔄', '')
      return
    }
    // Win: decrement locally now, then record + sync from the server's count.
    const id = outcome.goodie_id
    stock.value = { ...stock.value, [id]: Math.max(0, (stock.value[id] ?? SEED) - 1) }
    drawWheel()
    openDialog(`You got: ${outcome.label} 🎉`, true)
    recordWin(n, id, outcome.label)
      .then((r) => {
        if (typeof r.remaining === 'number') {
          stock.value = { ...stock.value, [id]: r.remaining }
          drawWheel()
        }
      })
      .catch(() => {})
  }, 4300)
}

// Reset in place for the next person — no navigation.
function next() {
  dialogOpen.value = false
  dialogText.value = ''
  dialogWin.value = false
  name.value = ''
  msg.value = ''
  msgClass.value = ''
  spinning.value = false
  rotation.value = rotation.value % 360
}
</script>
