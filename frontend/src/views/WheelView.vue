<template>
  <div class="card">
    <img class="logo" src="/logo.png" alt="AI 365" />
    <p class="greeting">Good luck, <strong>{{ store.name }}</strong>!</p>

    <div class="wheel-wrap">
      <div class="pointer"></div>
      <canvas
        ref="canvas"
        class="wheel-canvas"
        width="640"
        height="640"
        :style="{ transform: `rotate(${rotation}deg)` }"
      ></canvas>
      <div class="hub">SPIN</div>
    </div>

    <button class="btn" :disabled="spinning || done" @click="spin">
      {{ buttonLabel }}
    </button>

    <p v-if="msg" class="msg" :class="msgClass">{{ msg }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { drawPrize, getStock } from '../api.js'
import { store } from '../store.js'

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

const canvas = ref(null)
const rotation = ref(0)
const spinning = ref(false)
const done = ref(false)
const msg = ref('')
const msgClass = ref('')
const stock = ref({})

const buttonLabel = computed(() => {
  if (done.value) return 'All done 🎉'
  if (spinning.value) return 'Spinning…'
  return 'SPIN'
})

onMounted(async () => {
  stock.value = await getStock().catch(() => ({}))
  drawWheel()
})

function isSoldOut(id) {
  return id !== 'spin_again' && (stock.value[id] ?? 1) <= 0
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

    // Label
    ctx.save()
    ctx.translate(R, R)
    ctx.rotate((center * Math.PI) / 180)
    ctx.translate(0, -R * 0.62)
    ctx.rotate(Math.PI / 2)
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

async function spin() {
  if (spinning.value || done.value) return
  spinning.value = true
  msg.value = ''
  msgClass.value = ''

  let res
  try {
    res = await drawPrize(store.name)
  } catch {
    spinning.value = false
    msg.value = 'Network error — try again.'
    msgClass.value = 'error'
    return
  }

  const { status, data } = res

  if (status === 409 && data.error === 'already_claimed') {
    spinning.value = false
    done.value = true
    msg.value = data.previous
      ? `You already claimed: ${data.previous} ✋`
      : 'You already claimed a goodie ✋'
    msgClass.value = 'error'
    return
  }
  if (status === 409 && data.error === 'sold_out') {
    spinning.value = false
    done.value = true
    msg.value = 'All goodies claimed — thank you! 🙏'
    msgClass.value = 'error'
    return
  }
  if (status !== 200) {
    spinning.value = false
    msg.value = 'Service unavailable — try again.'
    msgClass.value = 'error'
    return
  }

  // Animate the wheel to land on the matching segment.
  const idx = targetIndex(data)
  const jitter = (Math.random() - 0.5) * (SEG * 0.5)
  const base = rotation.value - (rotation.value % 360) // normalize
  const landing = -(idx * SEG) + jitter // bring segment center to top
  rotation.value = base + 360 * 6 + landing

  // Wait for the CSS transition (~4.2s) before revealing the result.
  setTimeout(() => {
    spinning.value = false
    if (data.type === 'spin_again') {
      msg.value = 'Spin again! 🔄'
      msgClass.value = ''
    } else {
      done.value = true
      msg.value = `You got: ${data.label} 🎉`
      msgClass.value = 'win'
      getStock()
        .then((s) => {
          stock.value = s
          drawWheel()
        })
        .catch(() => {})
    }
  }, 4300)
}
</script>
