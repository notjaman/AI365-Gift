<template>
  <div class="kiosk theme-festival">
    <!-- Left: the wheel. Click hub, click/flick the wheel, the SPIN button, or Enter all spin. -->
    <section class="kiosk-left">
      <div
        class="wheel-wrap"
        @click="onWheelClick"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
      >
        <div class="wheel-pointer"></div>

        <!-- Festival rim bulbs. -->
        <div class="wheel-bulbs" aria-hidden="true">
          <span
            v-for="i in 16"
            :key="i"
            class="bulb"
            :style="{ transform: `rotate(${(i - 1) * 22.5}deg) translateY(-258px)` }"
          ></span>
        </div>

        <!-- Rotor: SVG wedges + upright icon badges, both rotate; badges counter-rotate. -->
        <div class="rotor" :style="{ transform: `rotate(${rotation}deg)`, transition: spinTransition }">
          <svg class="wedges" viewBox="0 0 400 400" aria-hidden="true">
            <path
              v-for="w in wedges"
              :key="w.i"
              :d="w.d"
              :fill="fillFor(w.sid)"
              :stroke="WEDGE_STROKE"
              :stroke-width="WEDGE_STROKE_W"
              stroke-linejoin="round"
            />
          </svg>

          <div
            v-for="w in wedges"
            :key="'b' + w.i"
            class="wheel-badge"
            :class="{ out: badgeOut(w.sid) }"
            :style="{ left: badgePos(w).x + '%', top: badgePos(w).y + '%' }"
          >
            <div
              class="wheel-badge-inner"
              :style="{ transform: `rotate(${-rotation}deg)`, transition: spinTransition }"
            >
              <span class="wheel-badge-glyph" :style="{ color: iconColorFor(w.sid) }">
                <KioskIcon :name="w.sid" :sw="w.sid === 'spin_again' ? 2.4 : 2.1" />
              </span>
            </div>
          </div>
        </div>

        <!-- Hub = mascot, also a spin button. -->
        <button
          ref="hub"
          class="wheel-hub"
          :class="{ spinning }"
          :disabled="spinning || dialogOpen"
          aria-label="Spin the wheel"
          @click="onHubClick"
        >
          <img src="/mascot.png" alt="AI 365 mascot" />
        </button>
      </div>
    </section>

    <!-- Right: brand + stock legend + name entry. -->
    <section class="kiosk-right">
      <header class="brand">
        <p class="brand-kicker">Step right up</p>
        <h1 class="brand-title">
          <img class="brand-logo" src="/ai365-logo.png" alt="AI 365" />
          <span class="brand-draw">Lucky Draw</span>
        </h1>
        <p class="brand-sub">Enter your name, then spin to win!</p>
      </header>

      <div class="legend">
        <div class="legend-head">Prizes remaining</div>
        <div class="legend-rows">
          <div
            v-for="g in GOODIES"
            :key="g.id"
            class="legend-row"
            :class="{ out: (stock[g.id] ?? 1) <= 0 }"
          >
            <span class="legend-chip" :style="{ '--c': g.color }">
              <KioskIcon :name="g.icon" :sw="2.2" />
            </span>
            <span class="legend-bar">
              <span
                class="legend-fill"
                :style="{ width: Math.max(0, ((stock[g.id] ?? 0) / (capacity[g.id] || 1)) * 100) + '%', background: g.color }"
              ></span>
            </span>
            <span class="legend-count">
              <template v-if="(stock[g.id] ?? 1) <= 0">Sold out</template>
              <template v-else>{{ stock[g.id] }}<i>/{{ capacity[g.id] ?? 0 }}</i></template>
            </span>
          </div>
        </div>
      </div>

      <div class="entry">
        <input
          v-model="name"
          class="field"
          type="text"
          placeholder="Your name"
          autocomplete="off"
          :disabled="spinning || dialogOpen"
          @keyup.enter="spin"
        />
        <button class="spin-btn" :disabled="spinning || dialogOpen" @click="spin">
          <span>{{ spinning ? 'Spinning…' : 'SPIN' }}</span>
        </button>
        <p class="inline-msg" :class="msgType">
          <template v-if="msgType === 'again'">
            <span class="inline-ico"><KioskIcon name="spin_again" :sw="2.6" /></span>{{ msg }}
          </template>
          <template v-else-if="msg">{{ msg }}</template>
          <template v-else>&nbsp;</template>
        </p>
      </div>
    </section>

    <!-- Confetti on a win. -->
    <div v-if="celebrate" class="confetti-layer" aria-hidden="true">
      <span
        v-for="(p, i) in confetti"
        :key="i"
        class="confetti-bit"
        :style="{
          left: p.left + '%',
          width: p.size + 'px',
          height: p.size * (p.round ? 1 : 1.4) + 'px',
          background: p.bg,
          borderRadius: p.round ? '50%' : '2px',
          animationDelay: p.delay + 's',
          animationDuration: p.dur + 's',
          '--rot': p.rot + 'deg',
        }"
      ></span>
    </div>

    <!-- Win / outcome dialog. -->
    <div v-if="dialogOpen" class="dialog-overlay">
      <div class="dialog">
        <template v-if="dialogWin && dialogGoodie">
          <img class="dialog-mascot" src="/mascot.png" alt="" />
          <p class="dialog-kicker">You won!</p>
          <span class="dialog-prize" :style="{ '--c': dialogGoodie.color }">
            <span class="dialog-prize-ico"><KioskIcon :name="dialogGoodie.icon" :sw="2" /></span>
            {{ dialogGoodie.label }}
          </span>
          <p class="dialog-note">Show this screen at the counter to collect it.</p>
        </template>
        <p v-else class="dialog-text">{{ dialogText }}</p>
        <button class="spin-btn dialog-next" @click="next"><span>Next player →</span></button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue'
import { recordWin, fetchStock } from '../api.js'

// Stock comes from n8n (Google Sheets is the source of truth); synced per win.
const SPIN_MS = 4200

// 3 real goodies (brand colors + icon) + the "spin again" filler.
const GOODIES = [
  { id: 'shirt', label: 'T-Shirt', color: '#2f62b3', icon: 'shirt' },
  { id: 'tote', label: 'Tote Bag', color: '#3fb8d4', icon: 'tote' },
  { id: 'charger', label: 'Charger', color: '#f26219', icon: 'charger' },
]
const GOODIE_BY_ID = Object.fromEntries(GOODIES.map((g) => [g.id, g]))

// 8 wedges: 2x each goodie + 2x spin_again, interleaved for balance (top = idx 0).
const SEGMENTS = ['shirt', 'spin_again', 'tote', 'charger', 'shirt', 'spin_again', 'tote', 'charger']
const SEG = 360 / SEGMENTS.length // 45deg

// Festival theme tokens for the wheel fills/strokes (panel chrome lives in CSS).
const SPIN_AGAIN_FILL = '#e9c9a6'
const SPIN_AGAIN_ICON = '#b07d4e'
const SOLD_OUT_FILL = '#e2d6c8'
const SOLD_OUT_ICON = '#a99a88'
const WEDGE_STROKE = '#ffffff'
const WEDGE_STROKE_W = 4
const CONFETTI_PALETTE = ['#f26219', '#2f62b3', '#3fb8d4', '#f9b233', '#ff8c3a']

// ── Inline icon set (line glyphs, viewBox 0 0 24 24). Rendered via <KioskIcon>. ──
const ICON_PATHS = {
  shirt: [
    'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z',
  ],
  tote: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  charger: ['M12 22v-5', 'M9 8V2', 'M15 8V2', 'M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z'],
  spin_again: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
}
const KioskIcon = (props) =>
  h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': props.sw ?? 2.2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      width: '100%',
      height: '100%',
      style: 'display:block',
    },
    (ICON_PATHS[props.name] || []).map((d) => h('path', { d })),
  )
KioskIcon.props = ['name', 'sw']

// ── Wheel geometry (SVG, cx=cy=200, R=192). Precompute wedge paths + centers. ──
function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
const wedges = SEGMENTS.map((sid, i) => {
  const cx = 200,
    cy = 200,
    R = 192
  const center = -90 + i * SEG
  const [x0, y0] = polar(cx, cy, R, center - SEG / 2)
  const [x1, y1] = polar(cx, cy, R, center + SEG / 2)
  return { d: `M${cx} ${cy} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z`, sid, i, center }
})
function badgePos(w) {
  return {
    x: 50 + 30 * Math.cos((w.center * Math.PI) / 180),
    y: 50 + 30 * Math.sin((w.center * Math.PI) / 180),
  }
}

const rotation = ref(0)
const spinTransition = ref('none')
const name = ref('')
const spinning = ref(false)
const msg = ref('')
const msgType = ref('')
const stock = ref({})
const capacity = ref({}) // first counts seen from n8n — the legend bar's 100% mark
const dialogOpen = ref(false)
const dialogText = ref('')
const dialogWin = ref(false)
const dialogGoodie = ref(null)
const celebrate = ref(false)
const hub = ref(null)

// Both wheel interactions stay on: a click spins, and so does a drag-flick.
const downPt = ref(null)
const dragged = ref(false)
const hubHandled = ref(false) // suppress the wrap click that follows a hub click

const confetti = computed(() =>
  Array.from({ length: 46 }).map(() => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    dur: 1.6 + Math.random() * 1.4,
    bg: CONFETTI_PALETTE[Math.floor(Math.random() * CONFETTI_PALETTE.length)],
    size: 7 + Math.random() * 8,
    rot: Math.random() * 360,
    round: Math.random() > 0.6,
  })),
)

onMounted(async () => {
  // n8n's Stock sheet is the source of truth; capacity = first counts seen.
  const live = await fetchStock()
  stock.value = { ...live }
  capacity.value = { ...live }
})

function isSoldOut(id) {
  return id !== 'spin_again' && (stock.value[id] ?? 1) <= 0
}
function badgeOut(sid) {
  return sid !== 'spin_again' && (stock.value[sid] ?? 1) <= 0
}
function fillFor(sid) {
  if (sid === 'spin_again') return SPIN_AGAIN_FILL
  return isSoldOut(sid) ? SOLD_OUT_FILL : GOODIE_BY_ID[sid].color
}
function iconColorFor(sid) {
  if (sid === 'spin_again') return SPIN_AGAIN_ICON
  return isSoldOut(sid) ? SOLD_OUT_ICON : GOODIE_BY_ID[sid].color
}

// ── Spin inputs ──
function onHubClick() {
  hubHandled.value = true // the wrap click fires next; ignore it once
  spin()
}
function onWheelClick() {
  if (hubHandled.value) {
    hubHandled.value = false
    return
  }
  if (dragged.value) {
    dragged.value = false
    return
  }
  spin()
}
function onPointerDown(e) {
  downPt.value = { x: e.clientX, y: e.clientY }
}
function onPointerUp(e) {
  if (!downPt.value) return
  const dx = e.clientX - downPt.value.x
  const dy = e.clientY - downPt.value.y
  downPt.value = null
  if (Math.hypot(dx, dy) > 24) {
    dragged.value = true // suppress the click that follows this flick
    spin()
  }
}

// Pick which physical segment index to land on for a given result.
function targetIndex(wantId) {
  const matches = SEGMENTS.map((s, i) => (s === wantId ? i : -1)).filter((i) => i >= 0)
  return matches[Math.floor(Math.random() * matches.length)]
}

function openDialog(text, win = false, goodie = null) {
  dialogText.value = text
  dialogWin.value = win
  dialogGoodie.value = goodie
  dialogOpen.value = true
  spinning.value = false
}
function showInline(text, type = '') {
  msg.value = text
  msgType.value = type
  spinning.value = false
}

// Decide the outcome client-side, weighted by the physical wheel (2 of each
// goodie + 2 spin_again). Landing on a sold-out goodie falls back to spin_again.
function pickOutcome() {
  const sid = SEGMENTS[Math.floor(Math.random() * SEGMENTS.length)]
  if (sid === 'spin_again' || isSoldOut(sid)) return { type: 'spin_again' }
  return { type: 'prize', id: sid }
}

function spin() {
  if (spinning.value || dialogOpen.value) return
  const n = name.value.trim()
  if (!n) {
    showInline('Please enter your name first.', 'error')
    return
  }
  if (GOODIES.every((g) => isSoldOut(g.id))) {
    openDialog('All prizes claimed — thank you!')
    return
  }

  spinning.value = true
  msg.value = ''
  msgType.value = ''

  const outcome = pickOutcome()
  const wantId = outcome.type === 'prize' ? outcome.id : 'spin_again'
  const idx = targetIndex(wantId)
  const jitter = (Math.random() - 0.5) * (SEG * 0.5)
  const landing = -(idx * SEG) + jitter

  // Always spin forward >= 6 turns, then align to the landing angle.
  let final = rotation.value + 360 * 6
  const cur = ((final % 360) + 360) % 360
  const want = ((landing % 360) + 360) % 360
  let diff = want - cur
  if (diff < 0) diff += 360
  final += diff

  spinTransition.value = `transform ${SPIN_MS}ms cubic-bezier(0.17,0.67,0.12,0.99)`
  requestAnimationFrame(() => {
    rotation.value = final
  })

  setTimeout(() => {
    if (outcome.type === 'spin_again') {
      showInline('So close — spin again!', 'again')
      return
    }
    // Win: decrement locally now, then record + sync from the server's count.
    const id = outcome.id
    stock.value = { ...stock.value, [id]: Math.max(0, (stock.value[id] ?? 0) - 1) }
    celebrate.value = true
    openDialog('', true, GOODIE_BY_ID[id])
    recordWin(n, id, GOODIE_BY_ID[id].label)
      .then((r) => {
        if (typeof r.remaining === 'number') {
          stock.value = { ...stock.value, [id]: r.remaining }
        }
      })
      .catch(() => {})
  }, SPIN_MS + 120)
}

// Reset in place for the next person — no navigation.
function next() {
  dialogOpen.value = false
  dialogText.value = ''
  dialogWin.value = false
  dialogGoodie.value = null
  celebrate.value = false
  name.value = ''
  msg.value = ''
  msgType.value = ''
  spinning.value = false
  // Normalize the rotor so the next spin's 6 turns start from a clean angle.
  spinTransition.value = 'none'
  rotation.value = ((rotation.value % 360) + 360) % 360
}
</script>
